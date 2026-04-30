import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SERVICES_BILLING_SCOPE, SERVICES_PLATFORM_SCOPE } from "@/lib/services-billing";
import {
  syncOwnerInvoicesFromCheckoutSession,
  syncTenantBillsFromCheckoutSession,
} from "@/lib/billing/stripe-status-sync";

const getWebhookSecrets = () => {
  const secrets = [
    {
      label: "platform",
      value: String(process.env.STRIPE_WEBHOOK_SECRET_PLATFORM || "").trim(),
    },
    {
      label: "connected",
      value: String(process.env.STRIPE_WEBHOOK_SECRET_CONNECTED || "").trim(),
    },
    {
      label: "legacy",
      value: String(process.env.STRIPE_WEBHOOK_SECRET || "").trim(),
    },
  ].filter((entry) => entry.value);

  const seen = new Set<string>();
  return secrets.filter((entry) => {
    if (seen.has(entry.value)) return false;
    seen.add(entry.value);
    return true;
  });
};

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const webhookSecrets = getWebhookSecrets();
  if (!webhookSecrets.length) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  let verifiedWith: string | null = null;
  try {
    const body = await request.text();
    let lastError: unknown = null;

    for (const secret of webhookSecrets) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, secret.value);
        verifiedWith = secret.label;
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!verifiedWith || !event!) {
      throw lastError || new Error("No webhook secret matched the signature");
    }
  } catch (err) {
    console.error("Stripe webhook signature verification failed.", {
      configuredSecretCount: webhookSecrets.length,
      errorType: err instanceof Error ? err.name : "UnknownError",
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const eventAccountScope = event.account ? "connected" : "platform";
  console.log("Stripe webhook verified", {
    eventType: event.type,
    eventAccountScope,
    verifiedWith,
  });

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const isServicesBillingSession =
      session.metadata?.billing_scope === SERVICES_BILLING_SCOPE &&
      session.metadata?.invoice_type === SERVICES_BILLING_SCOPE &&
      session.metadata?.payment_account_scope === SERVICES_PLATFORM_SCOPE;
    const servicesInvoiceId = session.metadata?.services_invoice_id?.trim();

    if (isServicesBillingSession && servicesInvoiceId) {
      const { data: existingInvoice, error: servicesFetchError } = await supabaseAdmin
        .from("services_invoices")
        .select("id, status, stripe_session_id, stripe_payment_intent_id, processing_started_at, invoice_type, payment_account_scope")
        .eq("id", servicesInvoiceId)
        .eq("invoice_type", SERVICES_BILLING_SCOPE)
        .eq("payment_account_scope", SERVICES_PLATFORM_SCOPE)
        .maybeSingle();

      if (servicesFetchError) {
        console.error("Error loading services invoice from webhook:", servicesFetchError);
        return NextResponse.json({ error: "Failed to load services invoice" }, { status: 500 });
      }

      if (existingInvoice) {
        const currentPaymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
        const nowIso = new Date().toISOString();
        const paidDate = nowIso.split("T")[0];
        const currentStatus = String(existingInvoice.status || "").toLowerCase();

        let nextStatus: "paid" | "processing" | "issued" | null = null;
        if (event.type === "checkout.session.completed") {
          nextStatus = session.payment_status === "paid" ? "paid" : "processing";
        } else if (event.type === "checkout.session.async_payment_succeeded") {
          nextStatus = "paid";
        } else if (event.type === "checkout.session.async_payment_failed") {
          nextStatus = "issued";
        }

        if (nextStatus && !(currentStatus === "paid" && nextStatus === "paid")) {
          const updates: Record<string, any> = {
            stripe_session_id: session.id,
            stripe_payment_intent_id: currentPaymentIntentId,
          };

          if (nextStatus === "paid") {
            updates.status = "paid";
            updates.paid_date = paidDate;
            updates.processing_started_at = null;
          } else if (nextStatus === "processing") {
            updates.status = "processing";
            updates.processing_started_at = nowIso;
          } else if (nextStatus === "issued") {
            updates.status = "issued";
            updates.processing_started_at = null;
            updates.stripe_session_id = null;
            updates.stripe_payment_intent_id = null;
          }

          const { error: servicesUpdateError } = await supabaseAdmin
            .from("services_invoices")
            .update(updates)
            .eq("id", servicesInvoiceId)
            .eq("invoice_type", SERVICES_BILLING_SCOPE)
            .eq("payment_account_scope", SERVICES_PLATFORM_SCOPE);

          if (servicesUpdateError) {
            console.error("Error updating services invoice from webhook:", servicesUpdateError);
            return NextResponse.json({ error: "Failed to update services invoice" }, { status: 500 });
          }
        }
      }
    }

    const tenantSync = await syncTenantBillsFromCheckoutSession(session, event.type);
    console.log("Stripe webhook tenant status sync", {
      eventType: event.type,
      tenantUpdated: tenantSync.updated,
      tenantSkipped: tenantSync.skipped,
    });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const ownerSync = await syncOwnerInvoicesFromCheckoutSession(session, event.type);
    console.log("Stripe webhook owner status sync", {
      eventType: event.type,
      ownerUpdated: ownerSync.updated,
      ownerSkipped: ownerSync.skipped,
    });
  }

  return NextResponse.json({ received: true });
}
