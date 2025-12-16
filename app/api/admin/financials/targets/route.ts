import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";

// GET - Fetch annual targets for a property and year
export async function GET(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const year = searchParams.get("year");

    if (!propertyId || !year) {
      return NextResponse.json(
        { error: "Property ID and year are required" },
        { status: 400 }
      );
    }

    const { data: targets, error } = await supabaseAdmin
      .from("property_annual_targets")
      .select("*")
      .eq("property_id", propertyId)
      .eq("year", parseInt(year));

    if (error) {
      console.error("Error fetching annual targets:", error);
      return NextResponse.json(
        { error: "Failed to fetch annual targets" },
        { status: 500 }
      );
    }

    const plan = targets?.find((t) => t.target_type === "plan") || null;
    const ye_target = targets?.find((t) => t.target_type === "ye_target") || null;

    return NextResponse.json({ plan, ye_target });
  } catch (error) {
    console.error("Error in GET /api/admin/financials/targets:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT - Update or create annual targets
export async function PUT(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const { propertyId, year, plan, ye_target } = body;

    if (!propertyId || !year) {
      return NextResponse.json(
        { error: "Property ID and year are required" },
        { status: 400 }
      );
    }

    // Upsert plan target
    if (plan && Object.keys(plan).length > 0) {
      const planData = {
        property_id: propertyId,
        year: parseInt(year),
        target_type: "plan",
        rent_income: plan.rent_income || null,
        maintenance: plan.maintenance || null,
        pool: plan.pool || null,
        garden: plan.garden || null,
        hoa: plan.hoa || null,
        property_tax: plan.property_tax || null,
        // total_expenses and net_income are auto-calculated
        maintenance_percentage_target: plan.maintenance_percentage_target || null,
      };

      const { error: planError } = await supabaseAdmin
        .from("property_annual_targets")
        .upsert(planData, {
          onConflict: "property_id,year,target_type",
        });

      if (planError) {
        console.error("Error upserting plan target:", planError);
        return NextResponse.json(
          { error: "Failed to save plan target" },
          { status: 500 }
        );
      }
    }

    // Upsert YE target
    if (ye_target && Object.keys(ye_target).length > 0) {
      const yeData = {
        property_id: propertyId,
        year: parseInt(year),
        target_type: "ye_target",
        rent_income: ye_target.rent_income || null,
        maintenance: ye_target.maintenance || null,
        pool: ye_target.pool || null,
        garden: ye_target.garden || null,
        hoa: ye_target.hoa || null,
        property_tax: ye_target.property_tax || null,
        // total_expenses and net_income are auto-calculated
        maintenance_percentage_target: ye_target.maintenance_percentage_target || null,
      };

      const { error: yeError } = await supabaseAdmin
        .from("property_annual_targets")
        .upsert(yeData, {
          onConflict: "property_id,year,target_type",
        });

      if (yeError) {
        console.error("Error upserting YE target:", yeError);
        return NextResponse.json(
          { error: "Failed to save YE target" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PUT /api/admin/financials/targets:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
