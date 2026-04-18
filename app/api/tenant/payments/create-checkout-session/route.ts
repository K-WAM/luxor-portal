import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/route-helpers";
import { formatDateOnly } from "@/lib/date-only";
import { resolveTenantBillConnectedAccount } from "@/lib/billing/tenant-connected-account";

type TenantBillRow = {
  id: string;
  tenant_id: string;
  property_id: string;
  bill_type: string;
  description: string | null;
  amount: number | null;
  due_date: string | null;
  status: string;
};

const ACH_FEE_NUMERATOR = 8;
const ACH_FEE_DENOMINATOR = 1000;
const ACH_FEE_CAP_CENTS = 500;
const CARD_FEE_NUMERATOR = 29;
const CARD_FEE_DENOMINATOR = 1000;
const CARD_FEE_FIXED_CENTS = 30;
const PAYABLE_STATUSES = new Set(["due", "overdue", "pending"]);

const toCents = (amount: number) => Math.round(amount * 100);

const roundHalfUp = (numerator: number, denominator: number) =>
  Math.floor((numerator + denominator / 2) / denominator);

const isPaymentsUnavailableError = (error: unknown) => {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: string }).message || "").toLowerCase()
      : "";
  return (
    message.includes("restricted") ||
    message.includes("paused") ||
    message.includes("cannot currently make charges")
  );
};

export async function POST(request: NextRequest) {
  try {
    const { user, role } = await getAuthContext();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { tenant_bill_id, method } = body || {};

    if (!tenant_bill_id || typeof tenant_bill_id !== "string") {
      return NextResponse.json({ error: "tenant_bill_id is required" }, { status: 400 });
    }
    if (method !== "ach" && method !== "card") {
      return NextResponse.json({ error: "method must be ach or card" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("tenant_bills")
      .select("id, tenant_id, property_id, bill_type, description, amount, due_date, status")
      .eq("id", tenant_bill_id)
      .maybeSingle();

    if (error) throw error;

    const bill = data as TenantBillRow | null;
    if (!bill) {
      return NextResponse.json({ error: "Bill not found" }, { status: 400 });
    }

    const isAdminRole = role === "admin";
    if (!isAdminRole && bill.tenant_id !== user.id) {
      return NextResponse.json({ error: "This bill is not payable by this tenant" }, { status: 403 });
    }

    if (!PAYABLE_STATUSES.has((bill.status || "").toLowerCase())) {
      return NextResponse.json({ error: "This bill is not eligible for payment" }, { status: 400 });
    }

    const routing = await resolveTenantBillConnectedAccount(bill.property_id);
    if (!routing.paymentAvailable || !routing.connectedAccountId) {
      return NextResponse.json({ payment_available: false });
    }

    const subtotalCents = toCents(Number(bill.amount || 0));

    if (subtotalCents <= 0) {
      return NextResponse.json({ error: "Subtotal must be greater than 0" }, { status: 400 });
    }

    const feeCents =
      method === "ach"
        ? Math.min(roundHalfUp(subtotalCents * ACH_FEE_NUMERATOR, ACH_FEE_DENOMINATOR), ACH_FEE_CAP_CENTS)
        : roundHalfUp(subtotalCents * CARD_FEE_NUMERATOR, CARD_FEE_DENOMINATOR) + CARD_FEE_FIXED_CENTS;

    const lineItems: Array<{
      price_data: {
        currency: "usd";
        unit_amount: number;
        product_data: { name: string; description?: string };
      };
      quantity: number;
    }> = [
      {
        price_data: {
          currency: "usd",
          unit_amount: toCents(Number(bill.amount || 0)),
          product_data: {
            name: bill.description?.trim() || "Tenant bill",
            description: `Due ${formatDateOnly(bill.due_date) || "N/A"}`,
          },
        },
        quantity: 1,
      },
    ];

    if (feeCents > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          unit_amount: feeCents,
          product_data: {
            name: "Processing fee",
          },
        },
        quantity: 1,
      });
    }

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: method === "ach" ? ["us_bank_account"] : ["card"],
        line_items: lineItems,
        success_url: `${origin}/tenant/payments?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/tenant/payments?checkout=cancel`,
        metadata: {
          tenantUserId: user.id,
          tenant_bill_id: bill.id,
          billIds: bill.id,
          method,
          subtotalCents: String(subtotalCents),
          feeCents: String(feeCents),
        },
      },
      {
        stripeAccount: routing.connectedAccountId,
      }
    );

    const createdPaymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : null;
    const { error: trackError } = await supabaseAdmin
      .from("tenant_bills")
      .update({
        stripe_session_id: session.id,
        stripe_payment_intent_id: createdPaymentIntentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bill.id);
    if (trackError) {
      console.error("Failed to store tenant Stripe session IDs:", trackError);
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Error creating tenant checkout session:", error);

    if (isPaymentsUnavailableError(error)) {
      return NextResponse.json(
        {
          code: "PAYMENTS_UNAVAILABLE",
          error: "Online payments temporarily unavailable. Please try again later or pay by Zelle.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
