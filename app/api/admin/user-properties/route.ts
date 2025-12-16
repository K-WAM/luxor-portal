import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";

const ALLOWED_ROLES = ["tenant", "owner", "admin", "viewer"];

// GET: list all user-property associations (admin only)
export async function GET() {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("user_properties")
      .select(
        `
        user_id,
        role,
        property_id,
        properties (
          id,
          address
        )
      `
      );

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Error fetching user properties", error);
    return NextResponse.json({ error: "Failed to fetch user properties" }, { status: 500 });
  }
}

// POST: add a property association for a user
export async function POST(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { userId, propertyId, role: newRole } = (await request.json()) as {
      userId?: string;
      propertyId?: string;
      role?: string;
    };

    if (!userId || !propertyId || !newRole) {
      return NextResponse.json({ error: "userId, propertyId, and role are required" }, { status: 400 });
    }

    if (!ALLOWED_ROLES.includes(newRole)) {
      return NextResponse.json({ error: `Role must be one of ${ALLOWED_ROLES.join(", ")}` }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("user_properties")
      .insert({
        user_id: userId,
        property_id: propertyId,
        role: newRole,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error adding user property access", error);
    return NextResponse.json({ error: "Failed to add access" }, { status: 500 });
  }
}

// DELETE: remove a property association for a user
export async function DELETE(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const propertyId = searchParams.get("propertyId");

    if (!userId || !propertyId) {
      return NextResponse.json({ error: "userId and propertyId are required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("user_properties")
      .delete()
      .eq("user_id", userId)
      .eq("property_id", propertyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing user property access", error);
    return NextResponse.json({ error: "Failed to remove access" }, { status: 500 });
  }
}
