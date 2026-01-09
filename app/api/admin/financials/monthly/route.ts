import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";

// GET - Fetch monthly performance data
export async function GET(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const year = searchParams.get("year");
    const month = searchParams.get("month");

    if (!propertyId || !year || !month) {
      return NextResponse.json(
        { error: "Property ID, year, and month are required" },
        { status: 400 }
      );
    }

    const { data: performance, error } = await supabaseAdmin
      .from("property_monthly_performance")
      .select("*")
      .eq("property_id", propertyId)
      .eq("year", parseInt(year))
      .eq("month", parseInt(month))
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is "not found" error
      console.error("Error fetching monthly performance:", error);
      return NextResponse.json(
        { error: "Failed to fetch monthly performance" },
        { status: 500 }
      );
    }

    return NextResponse.json(performance || {});
  } catch (error) {
    console.error("Error in GET /api/admin/financials/monthly:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT - Update or create monthly performance data
export async function PUT(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const {
      propertyId,
      year,
      month,
      rent_income,
      rent_paid,
      maintenance,
      pool,
      garden,
      hoa_payments,
      pm_fee,
      property_tax,
      property_market_estimate,
    } = body;

    if (!propertyId || !year || !month) {
      return NextResponse.json(
        { error: "Property ID, year, and month are required" },
        { status: 400 }
      );
    }

    const performanceData = {
      property_id: propertyId,
      year: parseInt(year),
      month: parseInt(month),
      rent_income: rent_income || 0,
      rent_paid: rent_paid || false,
      maintenance: maintenance || 0,
      pool: pool || 0,
      garden: garden || 0,
      hoa_payments: hoa_payments || 0,
      pm_fee: pm_fee || 0,
      property_tax: property_tax || 0,
      property_market_estimate: property_market_estimate || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("property_monthly_performance")
      .upsert(performanceData, {
        onConflict: "property_id,year,month",
      });

    if (error) {
      console.error("Error upserting monthly performance:", error);
      return NextResponse.json(
        { error: "Failed to save monthly performance" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PUT /api/admin/financials/monthly:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
