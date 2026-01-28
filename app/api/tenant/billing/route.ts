import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, getAccessiblePropertyIds, isAdmin } from "@/lib/auth/route-helpers";
// NOTE: Auto-backfill disabled - billing is now fully manual (admin-controlled)
// import { backfillRentBillsForProperty } from "@/lib/billing/tenant-bills";

export async function GET(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    if (!isAdmin(role)) {
      const allowed = await getAccessiblePropertyIds(user.id, role);
      if (!allowed.includes(propertyId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // AUTO-BACKFILL DISABLED: Billing is now fully manual (admin-controlled)
    // The backfillRentBillsForProperty function is preserved but no longer called
    // Admin creates all bills manually via Admin Billing page

    let query = supabaseAdmin
      .from("tenant_bills")
      .select("id, tenant_id, property_id, bill_type, description, amount, due_date, status, month, year, invoice_url, payment_link_url")
      .eq("property_id", propertyId)
      // CRITICAL: Exclude voided bills from tenant view
      .neq("status", "voided");

    if (!isAdmin(role)) {
      query = query.eq("tenant_id", user.id);
    }

    const { data, error } = await query.order("year", { ascending: true }).order("month", { ascending: true });
    if (error) throw error;

    return NextResponse.json({ rows: data || [] });
  } catch (error) {
    console.error("Error fetching tenant bills:", error);
    return NextResponse.json(
      { error: "Failed to fetch tenant bills" },
      { status: 500 }
    );
  }
}
