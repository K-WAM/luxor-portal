import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";

const mapPaymentIntentStatus = (status: Stripe.PaymentIntent.Status): "paid" | "processing" | "due" => {
  if (status === "succeeded") return "paid";
  if (status === "canceled" || status === "requires_payment_method") return "due";
  return "processing";
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { invoiceId } = await context.params;
    if (!invoiceId) {
      return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });
    }

    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("billing_invoices")
      .select("id, status, stripe_session_id, stripe_payment_intent_id, processing_started_at")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const stripeSessionId = invoice.stripe_session_id as string | null;
    const stripePaymentIntentId = invoice.stripe_payment_intent_id as string | null;
    if (!stripeSessionId && !stripePaymentIntentId) {
      return NextResponse.json({
        ok: false,
        message: "No Stripe payment found for this invoice.",
      });
    }

    let nextStatus: "paid" | "processing" | "due" | null = null;
    let latestSessionId: string | null = stripeSessionId;
    let latestPaymentIntentId: string | null = stripePaymentIntentId;
    let hasStripePayment = false;

    if (stripePaymentIntentId) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
        hasStripePayment = true;
        latestPaymentIntentId = paymentIntent.id;
        nextStatus = mapPaymentIntentStatus(paymentIntent.status);
      } catch (error: unknown) {
        const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
        if (code !== "resource_missing") throw error;
      }
    }

    if (!nextStatus && stripeSessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(stripeSessionId, {
          expand: ["payment_intent"],
        });
        hasStripePayment = true;
        latestSessionId = session.id;
        if (typeof session.payment_intent === "object" && session.payment_intent?.status) {
          latestPaymentIntentId = session.payment_intent.id;
          nextStatus = mapPaymentIntentStatus(session.payment_intent.status);
        } else if (session.payment_status === "paid") {
          nextStatus = "paid";
        } else if (session.status === "expired") {
          nextStatus = "due";
        } else {
          nextStatus = "processing";
        }
      } catch (error: unknown) {
        const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
        if (code !== "resource_missing") throw error;
      }
    }

    if (!hasStripePayment || !nextStatus) {
      return NextResponse.json({
        ok: false,
        message: "No Stripe payment found for this invoice.",
      });
    }

    const currentStatus = String(invoice.status || "").toLowerCase();
    if (currentStatus === "paid") {
      return NextResponse.json({
        ok: true,
        status: "paid",
        message: "No change",
      });
    }

    if (currentStatus === nextStatus) {
      return NextResponse.json({
        ok: true,
        status: nextStatus,
        message: "No change",
      });
    }

    const nowIso = new Date().toISOString();
    const updates: Record<string, string | null> = {
      status: nextStatus,
      stripe_session_id: latestSessionId,
      stripe_payment_intent_id: latestPaymentIntentId,
    };
    if (nextStatus === "paid") {
      updates.paid_date = nowIso.split("T")[0];
      updates.payment_link_url = null;
      updates.processing_started_at = null;
    } else if (nextStatus === "processing") {
      updates.processing_started_at = invoice.processing_started_at || nowIso;
    } else {
      updates.processing_started_at = null;
    }

    const { error: updateError } = await supabaseAdmin
      .from("billing_invoices")
      .update(updates)
      .eq("id", invoiceId);

    if (updateError) {
      return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
    }

    const message =
      nextStatus === "paid"
        ? "Updated to Paid"
        : nextStatus === "processing"
        ? "Updated to Processing"
        : "Updated to Due";

    return NextResponse.json({
      ok: true,
      status: nextStatus,
      message,
    });
  } catch (error) {
    console.error("Error refreshing owner ACH status:", error);
    return NextResponse.json({ error: "Failed to refresh ACH status" }, { status: 500 });
  }
}
