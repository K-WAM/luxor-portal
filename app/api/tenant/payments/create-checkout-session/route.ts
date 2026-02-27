import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/route-helpers";
import { formatDateOnly } from "@/lib/date-only";

type TenantBillRow = {
  id: string;
  tenant_id: string;
  bill_type: string;
  description: string | null;
  amount: number | null;
  due_date: string | null;
  status: string;
};

const CONNECTED_ACCOUNT_ID = "acct_1SsAYz1kdKAqz2V1";
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
    const { billIds, method } = body || {};

    if (!Array.isArray(billIds) || billIds.length === 0) {
      return NextResponse.json({ error: "billIds is required" }, { status: 400 });
    }
    if (method !== "ach" && method !== "card") {
      return NextResponse.json({ error: "method must be ach or card" }, { status: 400 });
    }

    const uniqueBillIds = Array.from(
      new Set(
        billIds
          .map((id: unknown) => (typeof id === "string" ? id.trim() : ""))
          .filter(Boolean)
      )
    );
    if (uniqueBillIds.length === 0) {
      return NextResponse.json({ error: "billIds is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("tenant_bills")
      .select("id, tenant_id, bill_type, description, amount, due_date, status")
      .in("id", uniqueBillIds);

    if (error) throw error;

    const bills = (data || []) as TenantBillRow[];
    if (bills.length !== uniqueBillIds.length) {
      return NextResponse.json({ error: "One or more bills not found" }, { status: 400 });
    }

    const isAdminRole = role === "admin";
    const unauthorized = bills.some((bill) => !isAdminRole && bill.tenant_id !== user.id);
    if (unauthorized) {
      return NextResponse.json({ error: "One or more bills are not payable by this tenant" }, { status: 403 });
    }

    const hasUnpayable = bills.some((bill) => !PAYABLE_STATUSES.has((bill.status || "").toLowerCase()));
    if (hasUnpayable) {
      return NextResponse.json({ error: "One or more bills are not eligible for payment" }, { status: 400 });
    }

    const subtotalCents = bills.reduce((sum, bill) => {
      return sum + toCents(Number(bill.amount || 0));
    }, 0);

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
    }> = bills.map((bill) => {
      const billLabel = bill.description?.trim() || "Tenant bill";
      const dueLabel = formatDateOnly(bill.due_date) || "N/A";
      return {
        price_data: {
          currency: "usd",
          unit_amount: toCents(Number(bill.amount || 0)),
          product_data: {
            name: billLabel,
            description: `Due ${dueLabel}`,
          },
        },
        quantity: 1,
      };
    });

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
          billIds: uniqueBillIds.join(","),
          method,
          subtotalCents: String(subtotalCents),
          feeCents: String(feeCents),
        },
      },
      {
        stripeAccount: CONNECTED_ACCOUNT_ID,
      }
    );

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
