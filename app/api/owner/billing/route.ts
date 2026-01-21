import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, getAccessiblePropertyIds, isAdmin } from "@/lib/auth/route-helpers";

export async function GET(request: NextRequest) {
  try {
    const { user, role } = await getAuthContext();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");

    let propertyIds: string[] = [];
    const isAdminRole = isAdmin(role);
    if (!isAdminRole) {
      propertyIds = await getAccessiblePropertyIds(user.id, role);
      if (propertyId) {
        propertyIds = propertyIds.includes(propertyId) ? [propertyId] : [];
      }
      if (!propertyIds.length) {
        return NextResponse.json([]);
      }
    } else if (propertyId) {
      propertyIds = [propertyId];
    }

    let query = supabaseAdmin
      .from("billing_invoices")
      .select(
        `
        id,
        property_id,
        owner_id,
        month,
        year,
        base_rent,
        fee_percent,
        fee_amount,
        total_due,
        status,
        description,
        due_date,
        paid_date,
        invoice_url,
        properties ( address )
      `
      )
      // CRITICAL: Exclude voided bills from owner view
      .neq("status", "voided")
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    if (propertyIds.length) {
      query = query.in("property_id", propertyIds);
    }
    if (!isAdminRole) {
      query = query.eq("owner_id", user.id);
    }

    const { data, error } = await query;

    if (error) throw error;

    const mapped =
      data?.map((row: any) => ({
        id: row.id,
        propertyId: row.property_id,
        propertyAddress: row.properties?.address || "",
        description: row.description || "",
        amount: row.total_due ?? row.fee_amount ?? 0,
        feePercent: row.fee_percent,
        feeAmount: row.fee_amount,
        baseRent: row.base_rent,
        month: row.month,
        year: row.year,
        status: row.status,
        dueDate: row.due_date,
        paidDate: row.paid_date,
        invoiceUrl: row.invoice_url,
      })) || [];

    return NextResponse.json(mapped);
  } catch (error) {
    console.error("Error fetching owner billing", error);
    return NextResponse.json({ error: "Failed to fetch billing" }, { status: 500 });
  }
}
