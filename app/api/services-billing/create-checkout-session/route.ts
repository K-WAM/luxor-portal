import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  buildServicesInvoicePath,
  SERVICES_BILLING_SCOPE,
  SERVICES_PLATFORM_SCOPE,
  SERVICES_PORTAL_AREA,
} from "@/lib/services-billing";

const CARD_FEE_NUMERATOR = 29;
const CARD_FEE_DENOMINATOR = 1000;
const CARD_FEE_FIXED_CENTS = 30;
const ACH_FEE_NUMERATOR = 8;
const ACH_FEE_DENOMINATOR = 1000;
const ACH_FEE_CAP_CENTS = 500;

const toCents = (amount: number) => Math.round(amount * 100);
const roundHalfUp = (numerator: number, denominator: number) =>
  Math.floor((numerator + denominator / 2) / denominator);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, method } = body || {};

    if (!token || (method !== "bank" && method !== "card")) {
      return NextResponse.json({ error: "token and valid payment method are required" }, { status: 400 });
    }

    const { data: invoice, error } = await supabaseAdmin
      .from("services_invoices")
      .select("id, invoice_number, description, total, status, hosted_page_token, invoice_type, payment_account_scope")
      .eq("hosted_page_token", token)
      .eq("invoice_type", SERVICES_BILLING_SCOPE)
      .eq("payment_account_scope", SERVICES_PLATFORM_SCOPE)
      .maybeSingle();

    if (error) throw error;
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const status = String(invoice.status || "").toLowerCase();
    if (status === "paid" || status === "void") {
      return NextResponse.json({ error: "Invoice is not payable" }, { status: 400 });
    }

    const subtotalCents = toCents(Number(invoice.total || 0));
    if (subtotalCents <= 0) {
      return NextResponse.json({ error: "Invoice total must be greater than 0" }, { status: 400 });
    }

    const feeCents =
      method === "bank"
        ? Math.min(roundHalfUp(subtotalCents * ACH_FEE_NUMERATOR, ACH_FEE_DENOMINATOR), ACH_FEE_CAP_CENTS)
        : roundHalfUp(subtotalCents * CARD_FEE_NUMERATOR, CARD_FEE_DENOMINATOR) + CARD_FEE_FIXED_CENTS;

    const origin =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    const hostedPath = buildServicesInvoicePath(token);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "usd",
      payment_method_types: method === "bank" ? ["us_bank_account"] : ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: subtotalCents,
            product_data: {
              name: invoice.invoice_number,
              description: invoice.description || "Services invoice",
            },
          },
          quantity: 1,
        },
        ...(feeCents > 0
          ? [
              {
                price_data: {
                  currency: "usd" as const,
                  unit_amount: feeCents,
                  product_data: { name: "Processing fee" },
                },
                quantity: 1,
              },
            ]
          : []),
      ],
      success_url: `${origin}${hostedPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${hostedPath}?checkout=cancel`,
      metadata: {
        billing_scope: SERVICES_BILLING_SCOPE,
        invoice_type: SERVICES_BILLING_SCOPE,
        payment_account_scope: SERVICES_PLATFORM_SCOPE,
        portal_area: SERVICES_PORTAL_AREA,
        services_invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        payment_method: method,
        subtotal_cents: String(subtotalCents),
        fee_cents: String(feeCents),
      },
    });

    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : null;

    const { error: trackError } = await supabaseAdmin
      .from("services_invoices")
      .update({
        stripe_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
      })
      .eq("id", invoice.id);
    if (trackError) {
      console.error("Failed to store services billing session IDs:", trackError);
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Error creating services billing checkout session:", error);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
