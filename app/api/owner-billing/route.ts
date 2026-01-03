import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, getAccessiblePropertyIds, isAdmin } from "@/lib/auth/route-helpers";

const isMissingColumnError = (error: any) =>
  error?.code === "42703" || /zelle/i.test(error?.message || "");

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
      .from("user_properties")
      .select("user_id, zelle_email, zelle_phone")
      .eq("property_id", propertyId)
      .eq("role", "owner");
    let rowsData: any[] = (data as any[]) || [];
    let warning: string | null = null;

    if (error) {
      if (!isMissingColumnError(error)) throw error;
      const fallback = await supabaseAdmin
        .from("user_properties")
        .select("user_id")
        .eq("property_id", propertyId)
        .eq("role", "owner");
      if (fallback.error) throw fallback.error;
      rowsData = (fallback.data as any[]) || [];
      warning =
        "Zelle fields are not available yet. Run the user_properties migration to enable Zelle storage.";
    }

    if (!rowsData || rowsData.length === 0) {
      return NextResponse.json({ rows: [], warning });
    }

    const { data: usersData, error: usersError } =
      await supabaseAdmin.auth.admin.listUsers();
    if (usersError) throw usersError;

    const userEmailMap = new Map<string, string>();
    (usersData?.users || []).forEach((u) => {
      if (u.id) userEmailMap.set(u.id, u.email || "");
    });

    const owners = rowsData.map((row: any) => ({
      userId: row.user_id,
      ownerEmail: userEmailMap.get(row.user_id) || "",
      zelleEmail: row.zelle_email || null,
      zellePhone: row.zelle_phone || null,
    }));
    return NextResponse.json({ rows: owners, warning });
  } catch (error) {
    console.error("Error fetching owner billing info:", error);
    return NextResponse.json(
      { error: "Failed to fetch owner billing info" },
      { status: 500 }
    );
  }
}
