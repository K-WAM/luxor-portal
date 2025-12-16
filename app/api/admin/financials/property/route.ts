import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";

// GET - Fetch property financial data
export async function GET(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");

    if (!propertyId) {
      return NextResponse.json(
        { error: "Property ID is required" },
        { status: 400 }
      );
    }

    const { data: property, error} = await supabaseAdmin
      .from("properties")
      .select(
        "id, home_cost, home_repair_cost, closing_costs, total_cost, current_market_estimate, target_monthly_rent, planned_garden_cost, planned_pool_cost, planned_hoa_cost, planned_hoa_cost_2, hoa_frequency, hoa_frequency_2, purchase_date, lease_start, lease_end, deposit, last_month_rent_collected, financials_updated_at"
      )
      .eq("id", propertyId)
      .single();

    if (error) {
      console.error("Error fetching property financials:", error);
      return NextResponse.json(
        {
          error: error.message || "Failed to fetch property financials",
          details: error.details,
          hint: error.hint,
          code: error.code
        },
        { status: 500 }
      );
    }

    return NextResponse.json(property);
  } catch (error) {
    console.error("Error in GET /api/admin/financials/property:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT - Update property financial data
export async function PUT(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const {
      propertyId,
      home_cost,
      home_repair_cost,
      closing_costs,
      total_cost,
      current_market_estimate,
      target_monthly_rent,
      planned_garden_cost,
      planned_pool_cost,
      planned_hoa_cost,
      planned_hoa_cost_2,
      hoa_frequency,
      hoa_frequency_2,
      purchase_date,
      lease_start,
      lease_end,
      deposit,
      last_month_rent_collected,
    } = body;

    if (!propertyId) {
      return NextResponse.json(
        { error: "Property ID is required" },
        { status: 400 }
      );
    }

    // Helper function to safely parse numeric values
    const parseNumeric = (value: any): number | null => {
      if (value === undefined || value === null || value === "") return null;
      const parsed = parseFloat(value);
      return isNaN(parsed) ? null : parsed;
    };

    // Helper function to safely parse date values
    const parseDate = (value: any): string | null => {
      if (value === undefined || value === null || value === "") return null;
      return value;
    };

    // Helper function to safely parse text values
    const parseText = (value: any): string | null => {
      if (value === undefined || value === null || value === "") return null;
      return value.toString();
    };

    const updateData: any = {
      financials_updated_at: new Date().toISOString(),
    };

    // Numeric fields - convert to number or null
    const numericFields = [
      'home_cost',
      'home_repair_cost',
      'closing_costs',
      'current_market_estimate',
      'target_monthly_rent',
      'planned_garden_cost',
      'planned_pool_cost',
      'planned_hoa_cost',
      'planned_hoa_cost_2',
      'deposit'
    ];

    numericFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = parseNumeric(body[field]);
      }
    });

    // Date fields - convert to string or null
    const dateFields = ['purchase_date', 'lease_start', 'lease_end'];
    dateFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = parseDate(body[field]);
      }
    });

    // Text fields - convert to string or null
    const textFields = ['hoa_frequency', 'hoa_frequency_2'];
    textFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = parseText(body[field]);
      }
    });

    // Boolean fields
    if (last_month_rent_collected !== undefined) {
      updateData.last_month_rent_collected = !!last_month_rent_collected;
    }

    const { data, error } = await supabaseAdmin
      .from("properties")
      .update(updateData)
      .eq("id", propertyId)
      .select();

    if (error) {
      console.error("Supabase error updating property financials:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });

      return NextResponse.json(
        {
          error: error.message || "Failed to update property financials",
          details: error.details,
          hint: error.hint,
          code: error.code
        },
        { status: error.code === '23505' ? 400 : 500 }
      );
    }

    console.log("Successfully updated property financials:", data);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PUT /api/admin/financials/property:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
