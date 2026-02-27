import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    const body = await request.text();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const tenantBillIds = session.metadata?.billIds
      ? session.metadata.billIds.split(",").map((id) => id.trim()).filter(Boolean)
      : [];

    if (tenantBillIds.length > 0) {
      const { data: existingTenantBills, error: tenantFetchError } = await supabaseAdmin
        .from("tenant_bills")
        .select("id, status, stripe_session_id, stripe_payment_intent_id, processing_started_at")
        .in("id", tenantBillIds);

      if (tenantFetchError) {
        console.error("Error loading tenant bills from webhook:", tenantFetchError);
        return NextResponse.json({ error: "Failed to load tenant bills" }, { status: 500 });
      }

      const tenantBills = (existingTenantBills || []) as Array<{
        id: string;
        status: string | null;
        stripe_session_id: string | null;
        stripe_payment_intent_id: string | null;
        processing_started_at: string | null;
      }>;
      const currentPaymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
      const nowIso = new Date().toISOString();
      const paidDate = nowIso.split("T")[0];

      let tenantStatusTarget: "paid" | "processing" | "due" | null = null;
      if (event.type === "checkout.session.completed") {
        tenantStatusTarget = session.payment_status === "paid" ? "paid" : "processing";
      } else if (event.type === "checkout.session.async_payment_succeeded") {
        tenantStatusTarget = "paid";
      } else if (event.type === "checkout.session.async_payment_failed") {
        tenantStatusTarget = "due";
      }

      const tenantBillIdsToUpdate = tenantBills
        .filter((bill) => {
          const currentStatus = (bill.status || "").toLowerCase();
          if (currentStatus === "paid") {
            return false;
          }
          if (tenantStatusTarget === "processing") {
            if (currentStatus === "processing") {
              return false;
            }
            return true;
          }
          if (tenantStatusTarget === "paid") {
            return true;
          }
          if (tenantStatusTarget === "due") {
            if (currentStatus === "due") {
              return false;
            }
            return true;
          }
          return false;
        })
        .map((bill) => bill.id);

      const skippedTenantCount = tenantBillIds.length - tenantBillIdsToUpdate.length;
      console.log("Stripe webhook tenant status sync", {
        eventType: event.type,
        totalTenantBillIds: tenantBillIds.length,
        tenantToUpdate: tenantBillIdsToUpdate.length,
        tenantSkipped: skippedTenantCount,
      });

      if (tenantBillIdsToUpdate.length > 0) {
        if (tenantStatusTarget === "paid") {
          const { error: tenantUpdateError } = await supabaseAdmin
            .from("tenant_bills")
            .update({
              status: "paid",
              payment_link_url: null,
              stripe_session_id: session.id,
              stripe_payment_intent_id: currentPaymentIntentId,
              paid_date: paidDate,
              processing_started_at: null,
              updated_at: nowIso,
            })
            .in("id", tenantBillIdsToUpdate);

          if (tenantUpdateError) {
            console.error("Error updating tenant bills from webhook:", tenantUpdateError);
            return NextResponse.json({ error: "Failed to update tenant bills" }, { status: 500 });
          }
        } else if (tenantStatusTarget === "processing") {
          const { error: tenantUpdateError } = await supabaseAdmin
            .from("tenant_bills")
            .update({
              status: "processing",
              stripe_session_id: session.id,
              stripe_payment_intent_id: currentPaymentIntentId,
              processing_started_at: nowIso,
              updated_at: nowIso,
            })
            .in("id", tenantBillIdsToUpdate);

          if (tenantUpdateError) {
            console.error("Error updating tenant bills from webhook:", tenantUpdateError);
            return NextResponse.json({ error: "Failed to update tenant bills" }, { status: 500 });
          }
        } else if (tenantStatusTarget === "due") {
          const { error: tenantUpdateError } = await supabaseAdmin
            .from("tenant_bills")
            .update({
              status: "due",
              stripe_session_id: null,
              stripe_payment_intent_id: null,
              processing_started_at: null,
              updated_at: nowIso,
            })
            .in("id", tenantBillIdsToUpdate);

          if (tenantUpdateError) {
            console.error("Error updating tenant bills from webhook:", tenantUpdateError);
            return NextResponse.json({ error: "Failed to update tenant bills" }, { status: 500 });
          }
        }
      }
    }
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const invoiceIds = session.metadata?.luxor_invoice_ids
      ? session.metadata.luxor_invoice_ids.split(",").filter(Boolean)
      : [];

    if (invoiceIds.length > 0) {
      const { data: existingInvoices, error: invoicesFetchError } = await supabaseAdmin
        .from("billing_invoices")
        .select("id, status, stripe_session_id, stripe_payment_intent_id, processing_started_at")
        .in("id", invoiceIds);

      if (invoicesFetchError) {
        console.error("Error loading invoices from webhook:", invoicesFetchError);
        return NextResponse.json({ error: "Failed to load invoices" }, { status: 500 });
      }

      const invoices = (existingInvoices || []) as Array<{
        id: string;
        status: string | null;
        stripe_session_id: string | null;
        stripe_payment_intent_id: string | null;
        processing_started_at: string | null;
      }>;
      const currentPaymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
      const nowIso = new Date().toISOString();
      const paidDate = nowIso.split("T")[0];

      let ownerStatusTarget: "paid" | "processing" | "due" | null = null;
      if (event.type === "checkout.session.completed") {
        ownerStatusTarget = session.payment_status === "paid" ? "paid" : "processing";
      } else if (event.type === "checkout.session.async_payment_succeeded") {
        ownerStatusTarget = "paid";
      } else if (event.type === "checkout.session.async_payment_failed") {
        ownerStatusTarget = "due";
      }

      const invoiceIdsToUpdate = invoices
        .filter((invoice) => {
          const currentStatus = (invoice.status || "").toLowerCase();
          if (currentStatus === "paid") {
            return false;
          }
          if (ownerStatusTarget === "processing") {
            if (currentStatus === "processing") {
              return false;
            }
            return true;
          }
          if (ownerStatusTarget === "paid") {
            return true;
          }
          if (ownerStatusTarget === "due") {
            if (currentStatus === "due") {
              return false;
            }
            return true;
          }
          return false;
        })
        .map((invoice) => invoice.id);

      const skippedOwnerCount = invoiceIds.length - invoiceIdsToUpdate.length;
      console.log("Stripe webhook owner status sync", {
        eventType: event.type,
        totalInvoiceIds: invoiceIds.length,
        ownerToUpdate: invoiceIdsToUpdate.length,
        ownerSkipped: skippedOwnerCount,
      });

      if (invoiceIdsToUpdate.length > 0) {
        if (ownerStatusTarget === "paid") {
          const { error } = await supabaseAdmin
            .from("billing_invoices")
            .update({
              status: "paid",
              paid_date: paidDate,
              payment_link_url: null,
              stripe_session_id: session.id,
              stripe_payment_intent_id: currentPaymentIntentId,
              processing_started_at: null,
            })
            .in("id", invoiceIdsToUpdate);

          if (error) {
            console.error("Error updating invoices from webhook:", error);
            return NextResponse.json({ error: "Failed to update invoices" }, { status: 500 });
          }
        } else if (ownerStatusTarget === "processing") {
          const { error } = await supabaseAdmin
            .from("billing_invoices")
            .update({
              status: "processing",
              stripe_session_id: session.id,
              stripe_payment_intent_id: currentPaymentIntentId,
              processing_started_at: nowIso,
            })
            .in("id", invoiceIdsToUpdate);

          if (error) {
            console.error("Error updating invoices from webhook:", error);
            return NextResponse.json({ error: "Failed to update invoices" }, { status: 500 });
          }
        } else if (ownerStatusTarget === "due") {
          const { error } = await supabaseAdmin
            .from("billing_invoices")
            .update({
              status: "due",
              stripe_session_id: null,
              stripe_payment_intent_id: null,
              processing_started_at: null,
            })
            .in("id", invoiceIdsToUpdate);

          if (error) {
            console.error("Error updating invoices from webhook:", error);
            return NextResponse.json({ error: "Failed to update invoices" }, { status: 500 });
          }
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
