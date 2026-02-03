import { NextResponse } from "next/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import { buildPaymentsDueSoonEmail } from "@/lib/email/payments-due-soon";

export async function GET(request: Request) {
  const { user, role } = await getAuthContext();
  if (!user || !isAdmin(role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const recipientType = (searchParams.get("type") as "owner" | "tenant") || "owner";
  const baseUrl = process.env.APP_BASE_URL || "";
  const logoUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/luxor-logo.png` : null;

  const { html } = buildPaymentsDueSoonEmail({
    recipientName: "Jane Doe",
    recipientType,
    baseUrl,
    logoUrl,
    bills: [
      {
        amount: 1250,
        dueDate: new Date().toISOString(),
        type: "Rent",
        propertyName: "Sunset Villas",
        propertyAddress: "123 Main St, Orlando, FL",
        reference: "INV-2026-0001",
        notes: "Autopay not enabled",
      },
      {
        amount: 95,
        dueDate: new Date().toISOString(),
        type: "Fee",
        propertyName: "Sunset Villas",
        propertyAddress: "123 Main St, Orlando, FL",
      },
    ],
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
