import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";

const ALLOWED_ROLES = ["tenant", "owner", "admin", "viewer"];

// GET: list all auth users with basic metadata
export async function GET() {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw error;

    const users =
      data?.users?.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        role: (u.user_metadata as any)?.role || null,
      })) ?? [];

    return NextResponse.json(users);
  } catch (error) {
    console.error("Error listing users", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

// PATCH: update a user's role (auth metadata + user_properties)
export async function PATCH(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { userId, role: newRole } = (await request.json()) as { userId?: string; role?: string };

    if (!userId || !newRole) {
      return NextResponse.json({ error: "userId and role are required" }, { status: 400 });
    }
    if (!ALLOWED_ROLES.includes(newRole)) {
      return NextResponse.json({ error: `Role must be one of ${ALLOWED_ROLES.join(", ")}` }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { role: newRole },
    });
    if (updateError) throw updateError;

    return NextResponse.json({
      id: updated.user?.id,
      email: updated.user?.email,
      role: newRole,
    });
  } catch (error) {
    console.error("Error updating user role", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

// DELETE: remove a user completely (auth + associations)
export async function DELETE(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Clean up related records first
    await supabaseAdmin.from("user_properties").delete().eq("user_id", userId);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting user", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
