import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, getAccessiblePropertyIds, isAdmin } from "@/lib/auth/route-helpers";

const isMissingColumnError = (error: any) =>
  error?.code === "42703" || /(zelle|stripe_connected_account_id)/i.test(error?.message || "");

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

    const { data, error } = await supabaseAdmin
      .from("properties")
      .select("id, owner_name, zelle_email, zelle_phone, zelle_recipient")
      .eq("id", propertyId)
      .maybeSingle();

    let rowData: any = data || null;
    let warning: string | null = null;

    if (error) {
      if (!isMissingColumnError(error)) throw error;
      const fallback = await supabaseAdmin
        .from("properties")
        .select("id, owner_name")
        .eq("id", propertyId)
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      rowData = fallback.data || null;
      warning =
        "Property payment-detail fields are not available yet. Run the latest properties migration to enable Zelle storage.";
    }

    if (!rowData) {
      return NextResponse.json({ rows: [], warning });
    }

    return NextResponse.json({
      rows: [
        {
          propertyId: rowData.id,
          ownerEmail: "",
          zelleEmail: rowData.zelle_email || null,
          zellePhone: rowData.zelle_phone || null,
          zelleRecipient: rowData.zelle_recipient || rowData.owner_name || null,
        },
      ],
      warning,
    });
  } catch (error) {
    console.error("Error fetching owner billing info:", error);
    return NextResponse.json(
      { error: "Failed to fetch owner billing info" },
      { status: 500 }
    );
  }
}
