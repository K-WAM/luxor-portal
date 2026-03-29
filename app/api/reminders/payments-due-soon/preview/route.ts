import { NextResponse } from "next/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import { buildPaymentReminderDigestEmail, CANONICAL_PORTAL_URL } from "@/lib/email/payments-due-soon";

export async function GET(request: Request) {
  const { user, role } = await getAuthContext();
  if (!user || !isAdmin(role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const recipientType = (searchParams.get("type") as "owner" | "tenant") || "owner";
  const logoUrl = `${CANONICAL_PORTAL_URL}/luxor-logo.png`;

  const { html } = buildPaymentReminderDigestEmail({
    recipientName: "Jane Doe",
    recipientType,
    logoUrl,
    sections: {
      overdue: [
        {
          amount: 1250,
          dueDate: new Date().toISOString(),
          type: "Rent",
          propertyAddress: "123 Main St, Orlando, FL",
          notes: "March 2026 Rent",
        },
      ],
      dueTomorrow: [
        {
          amount: 95,
          dueDate: new Date().toISOString(),
          type: "Fee",
          propertyAddress: "123 Main St, Orlando, FL",
          notes: "Utility reimbursement",
        },
      ],
      dueSoon: [
        {
          amount: 210,
          dueDate: new Date().toISOString(),
          type: "PM Fee",
          propertyAddress: "456 Lake Ave, Boca Raton, FL",
          notes: "April 2026 Management Fee",
        },
      ],
    },
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
