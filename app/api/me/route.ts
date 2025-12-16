import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// GET /api/me
// Returns the current user's identity and property mappings.
// Expects an Authorization: Bearer <access_token> header from the browser.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : null;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Resolve user from access token
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
  const user = userData.user;

  // Load property mappings for this user
  const { data: mappings, error: mapError } = await supabaseAdmin
    .from("user_properties")
    .select("property_id, role, properties(address)")
    .eq("user_id", user.id);

  if (mapError) {
    return NextResponse.json({ error: "Failed to load user properties" }, { status: 500 });
  }

  const effectiveRole = (user.user_metadata?.role as string) || mappings?.[0]?.role || null;

  return NextResponse.json({
    user_id: user.id,
    email: user.email,
    role: effectiveRole,
    properties: mappings || [],
  });
}
