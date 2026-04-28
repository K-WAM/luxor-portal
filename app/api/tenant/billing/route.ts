import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, getAccessiblePropertyIds, isAdmin } from "@/lib/auth/route-helpers";
import { fetchVisibleLeaseIdsForUser } from "@/lib/lease-agreements";

const hasMissingTenantBillScopeColumns = (error: any) =>
  String(error?.message || "").includes("bill_scope") ||
  String(error?.message || "").includes("lease_agreement_id");

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

    const selectWithScope =
      "id, tenant_id, property_id, lease_agreement_id, bill_scope, bill_type, description, amount, due_date, status, month, year, invoice_url, payment_link_url";
    const fallbackSelect =
      "id, tenant_id, property_id, bill_type, description, amount, due_date, status, month, year, invoice_url, payment_link_url";

    let query = supabaseAdmin
      .from("tenant_bills")
      .select(selectWithScope)
      .eq("property_id", propertyId)
      .neq("status", "voided");

    if (!isAdmin(role)) {
      const visibleLeaseIds = await fetchVisibleLeaseIdsForUser(user.id, [propertyId]);
      if (visibleLeaseIds.length > 0) {
        query = query.or(
          `and(bill_scope.eq.tenant,tenant_id.eq.${user.id}),and(bill_scope.eq.lease,lease_agreement_id.in.(${visibleLeaseIds.join(",")}))`
        );
      } else {
        query = query.eq("bill_scope", "tenant").eq("tenant_id", user.id);
      }
    }

    const initialResult = await query.order("year", { ascending: true }).order("month", { ascending: true });
    let data: any[] | null = (initialResult.data as any[] | null) ?? null;
    let error = initialResult.error;

    if (error && hasMissingTenantBillScopeColumns(error)) {
      let fallbackQuery = supabaseAdmin
        .from("tenant_bills")
        .select(fallbackSelect)
        .eq("property_id", propertyId)
        .neq("status", "voided");

      if (!isAdmin(role)) {
        fallbackQuery = fallbackQuery.eq("tenant_id", user.id);
      }

      const fallback = await fallbackQuery.order("year", { ascending: true }).order("month", { ascending: true });
      data = (fallback.data as any[] | null) ?? null;
      error = fallback.error;
    }

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
