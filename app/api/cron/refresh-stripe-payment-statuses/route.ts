import { NextResponse } from "next/server";
import { refreshStripePaymentStatuses } from "@/lib/billing/stripe-status-sync";

const getBearerSecret = (request: Request) => {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return token || null;
};

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const providedSecret = getBearerSecret(request);

    if (!cronSecret || providedSecret !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const summary = await refreshStripePaymentStatuses();
    return NextResponse.json({
      ok: true,
      summary,
    });
  } catch (error) {
    console.error("Error refreshing Stripe payment statuses:", error);
    return NextResponse.json({ error: "Failed to refresh Stripe payment statuses" }, { status: 500 });
  }
}
