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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const isPaidSession = session.payment_status === "paid";

    const tenantBillIds = session.metadata?.billIds
      ? session.metadata.billIds.split(",").map((id) => id.trim()).filter(Boolean)
      : [];

    if (tenantBillIds.length > 0) {
      const { data: existingTenantBills, error: tenantFetchError } = await supabaseAdmin
        .from("tenant_bills")
        .select("id, status")
        .in("id", tenantBillIds);

      if (tenantFetchError) {
        console.error("Error loading tenant bills from webhook:", tenantFetchError);
        return NextResponse.json({ error: "Failed to load tenant bills" }, { status: 500 });
      }

      const unpaidTenantBillIds = (existingTenantBills || [])
        .filter((bill: { id: string; status: string }) => (bill.status || "").toLowerCase() !== "paid")
        .map((bill: { id: string }) => bill.id);

      if (unpaidTenantBillIds.length > 0) {
        const tenantUpdates = {
          status: "paid",
          payment_link_url: null,
          stripe_session_id: session.id,
          stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
          paid_date: new Date().toISOString().split("T")[0],
          updated_at: new Date().toISOString(),
        };

        const { error: tenantUpdateError } = await supabaseAdmin
          .from("tenant_bills")
          .update(tenantUpdates)
          .in("id", unpaidTenantBillIds);

        if (tenantUpdateError) {
          console.error("Error updating tenant bills from webhook:", tenantUpdateError);
          return NextResponse.json({ error: "Failed to update tenant bills" }, { status: 500 });
        }
      }
    }

    const invoiceIds = session.metadata?.luxor_invoice_ids
      ? session.metadata.luxor_invoice_ids.split(",").filter(Boolean)
      : [];

    if (isPaidSession && invoiceIds.length > 0) {
      const paidDate = new Date().toISOString().split("T")[0];
      const updates = {
        status: "paid",
        paid_date: paidDate,
        payment_link_url: null,
        stripe_session_id: session.id,
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
      };
      const { error } = await supabaseAdmin
        .from("billing_invoices")
        .update(updates)
        .in("id", invoiceIds);

      if (error) {
        console.error("Error updating invoices from webhook:", error);
        return NextResponse.json({ error: "Failed to update invoices" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
