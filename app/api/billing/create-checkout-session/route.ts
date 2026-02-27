import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, getAccessiblePropertyIds, isAdmin } from "@/lib/auth/route-helpers";
import { parseDateOnly } from "@/lib/date-only";

type InvoiceRow = {
  id: string;
  owner_id: string;
  property_id: string;
  total_due: number | null;
  fee_amount: number | null;
  status: string;
  due_date: string | null;
};

const CARD_FEE_NUMERATOR = 29;
const CARD_FEE_DENOMINATOR = 1000;
const CARD_FEE_FIXED_CENTS = 30;
const BANK_FEE_NUMERATOR = 8;
const BANK_FEE_DENOMINATOR = 1000;
const BANK_FEE_CAP_CENTS = 500;

const isQualifyingDueDate = (dateStr?: string | null) => {
  const dueDate = parseDateOnly(dateStr);
  if (!dueDate) return false;
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const in30Days = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate() + 30));
  return dueDate < todayUtc || (dueDate >= todayUtc && dueDate <= in30Days);
};

const toCents = (amount: number) => Math.round(amount * 100);
const roundHalfUp = (numerator: number, denominator: number) =>
  Math.floor((numerator + denominator / 2) / denominator);

export async function POST(request: NextRequest) {
  try {
    const { user, role } = await getAuthContext();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { selectedInvoiceIds, paymentMethod } = body || {};

    if (!Array.isArray(selectedInvoiceIds) || selectedInvoiceIds.length === 0) {
      return NextResponse.json({ error: "selectedInvoiceIds is required" }, { status: 400 });
    }
    if (!["bank", "card"].includes(paymentMethod)) {
      return NextResponse.json({ error: "paymentMethod must be bank or card" }, { status: 400 });
    }

    const { data: invoices, error } = await supabaseAdmin
      .from("billing_invoices")
      .select("id, owner_id, property_id, total_due, fee_amount, status, due_date")
      .in("id", selectedInvoiceIds);

    if (error) throw error;

    const isAdminRole = isAdmin(role);
    const allowedPropertyIds = isAdminRole ? [] : await getAccessiblePropertyIds(user.id, role);

    const eligible = (invoices || []).filter((invoice: InvoiceRow) => {
      if (!invoice) return false;
      if (!isAdminRole) {
        if (invoice.owner_id !== user.id) return false;
        if (allowedPropertyIds.length && !allowedPropertyIds.includes(invoice.property_id)) return false;
      }
      if (invoice.status === "paid" || invoice.status === "voided") return false;
      if (!isQualifyingDueDate(invoice.due_date)) return false;
      return true;
    });

    if (eligible.length !== selectedInvoiceIds.length) {
      return NextResponse.json({ error: "One or more invoices are not eligible for payment" }, { status: 400 });
    }

    const subtotalCents = eligible.reduce((sum: number, invoice: InvoiceRow) => {
      const amount = invoice.total_due ?? invoice.fee_amount ?? 0;
      return sum + toCents(Number(amount));
    }, 0);

    if (subtotalCents <= 0) {
      return NextResponse.json({ error: "Subtotal must be greater than 0" }, { status: 400 });
    }

    let processingFeeCents = 0;
    let chargeCents = subtotalCents;
    if (paymentMethod === "card") {
      const percentFeeCents = roundHalfUp(subtotalCents * CARD_FEE_NUMERATOR, CARD_FEE_DENOMINATOR);
      processingFeeCents = percentFeeCents + CARD_FEE_FIXED_CENTS;
      chargeCents = subtotalCents + processingFeeCents;
    } else {
      const feeCents = roundHalfUp(subtotalCents * BANK_FEE_NUMERATOR, BANK_FEE_DENOMINATOR);
      processingFeeCents = Math.min(feeCents, BANK_FEE_CAP_CENTS);
      chargeCents = subtotalCents + processingFeeCents;
    }

    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const propertyIds = Array.from(new Set(eligible.map((i: InvoiceRow) => i.property_id).filter(Boolean)));

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "usd",
      payment_method_types: paymentMethod === "card" ? ["card"] : ["us_bank_account"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: chargeCents,
            product_data: {
              name: "Luxordev invoices payment",
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        luxor_invoice_ids: eligible.map((i: InvoiceRow) => i.id).join(","),
        portal_subtotal_cents: String(subtotalCents),
        processing_fee_cents: String(processingFeeCents),
        total_cents: String(chargeCents),
        invoice_ids: eligible.map((i: InvoiceRow) => i.id).join(","),
        fee_type: paymentMethod,
        fee_method: paymentMethod,
        owner_id: user.id,
        property_ids: propertyIds.join(","),
      },
      success_url: `${origin}/owner/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/owner/billing?checkout=cancel`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Error creating checkout session:", error);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
