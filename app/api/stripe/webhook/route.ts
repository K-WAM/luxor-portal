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
    if (session.payment_status !== "paid") {
      return NextResponse.json({ received: true });
    }

    const invoiceIds = session.metadata?.luxor_invoice_ids
      ? session.metadata.luxor_invoice_ids.split(",").filter(Boolean)
      : [];

    if (invoiceIds.length > 0) {
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
