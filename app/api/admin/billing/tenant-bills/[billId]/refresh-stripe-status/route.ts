import { NextResponse } from "next/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import { refreshTenantBillStripeStatus } from "@/lib/billing/stripe-status-sync";

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

    const result = await refreshTenantBillStripeStatus(billId);
    if (!result.ok) {
      const message =
        result.reason === "not_found"
          ? "Bill not found"
          : result.reason === "payment_unavailable"
            ? "Online payments are not configured for this property."
            : result.reason === "missing_stripe_ids"
              ? "No Stripe payment found for this bill."
              : "No Stripe payment found for this bill.";
      return NextResponse.json({ ok: false, message }, { status: result.reason === "not_found" ? 404 : 200 });
    }

    const message =
      result.status === "paid"
        ? "Updated to Paid"
        : result.status === "processing"
          ? "Updated to Processing"
          : result.changed
            ? "Updated to Due"
            : "No change";

    return NextResponse.json({
      ok: true,
      status: result.status,
      message,
    });
  } catch (error) {
    console.error("Error refreshing tenant ACH status:", error);
    return NextResponse.json({ error: "Failed to refresh ACH status" }, { status: 500 });
  }
}
