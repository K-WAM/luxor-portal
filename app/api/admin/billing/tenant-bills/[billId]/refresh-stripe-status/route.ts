import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";

const CONNECTED_ACCOUNT_ID = "acct_1SsAYz1kdKAqz2V1";

const mapPaymentIntentStatus = (status: Stripe.PaymentIntent.Status): "paid" | "processing" | "due" => {
  if (status === "succeeded") return "paid";
  if (status === "canceled" || status === "requires_payment_method") return "due";
  return "processing";
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ billId: string }> }
) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { billId } = await context.params;
    if (!billId) {
      return NextResponse.json({ error: "billId is required" }, { status: 400 });
    }

    const { data: bill, error: billError } = await supabaseAdmin
      .from("tenant_bills")
      .select("id, status, stripe_session_id, stripe_payment_intent_id, processing_started_at")
      .eq("id", billId)
      .single();

    if (billError || !bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 404 });
    }

    const stripeSessionId = bill.stripe_session_id as string | null;
    const stripePaymentIntentId = bill.stripe_payment_intent_id as string | null;
    if (!stripeSessionId && !stripePaymentIntentId) {
      return NextResponse.json({
        ok: false,
        message: "No Stripe payment found for this bill.",
      });
    }

    let nextStatus: "paid" | "processing" | "due" | null = null;
    let hasStripePayment = false;

    if (stripePaymentIntentId) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          stripePaymentIntentId,
          {},
          { stripeAccount: CONNECTED_ACCOUNT_ID }
        );
        hasStripePayment = true;
        nextStatus = mapPaymentIntentStatus(paymentIntent.status);
      } catch (error: unknown) {
        const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
        if (code !== "resource_missing") throw error;
      }
    }

    if (!nextStatus && stripeSessionId) {
      try {
        const session = await stripe.checkout.sessions.retrieve(
          stripeSessionId,
          { expand: ["payment_intent"] },
          { stripeAccount: CONNECTED_ACCOUNT_ID }
        );
        hasStripePayment = true;

        if (typeof session.payment_intent === "object" && session.payment_intent?.status) {
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
        message: "No Stripe payment found for this bill.",
      });
    }

    const currentStatus = String(bill.status || "").toLowerCase();
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
      updated_at: nowIso,
    };
    if (nextStatus === "paid") {
      updates.paid_date = nowIso.split("T")[0];
      updates.payment_link_url = null;
      updates.processing_started_at = null;
    } else if (nextStatus === "processing") {
      updates.processing_started_at = bill.processing_started_at || nowIso;
    } else {
      updates.processing_started_at = null;
    }

    const { error: updateError } = await supabaseAdmin
      .from("tenant_bills")
      .update(updates)
      .eq("id", billId);

    if (updateError) {
      return NextResponse.json({ error: "Failed to update tenant bill" }, { status: 500 });
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
    console.error("Error refreshing tenant ACH status:", error);
    return NextResponse.json({ error: "Failed to refresh ACH status" }, { status: 500 });
  }
}
