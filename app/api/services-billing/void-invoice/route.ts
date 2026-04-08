import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SERVICES_BILLING_SCOPE, SERVICES_PLATFORM_SCOPE } from "@/lib/services-billing";

export async function POST(request: NextRequest) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const { id, voidReason } = body || {};
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("services_invoices")
      .select("id, status")
      .eq("id", id)
      .eq("invoice_type", SERVICES_BILLING_SCOPE)
      .eq("payment_account_scope", SERVICES_PLATFORM_SCOPE)
      .single();

    if (existingError) throw existingError;

    const currentStatus = String(existing.status || "").toLowerCase();
    if (currentStatus === "paid") {
      return NextResponse.json({ error: "Paid invoices cannot be voided" }, { status: 400 });
    }
    if (currentStatus === "void") {
      return NextResponse.json({ id: existing.id, status: "void" });
    }

    const { data, error } = await supabaseAdmin
      .from("services_invoices")
      .update({
        status: "void",
        voided_at: new Date().toISOString(),
        voided_reason: voidReason || "Voided by admin",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("invoice_type", SERVICES_BILLING_SCOPE)
      .eq("payment_account_scope", SERVICES_PLATFORM_SCOPE)
      .select("id, status")
      .single();

    if (error) throw error;
    return NextResponse.json({ id: data.id, status: data.status });
  } catch (error: any) {
    console.error("Error voiding services invoice:", error);
    return NextResponse.json({ error: error.message || "Failed to void services invoice" }, { status: 500 });
  }
}
