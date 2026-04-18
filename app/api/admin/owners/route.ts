import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";

const isValidStripeConnectedAccount = (value: string) => value.startsWith("acct_");

export async function GET() {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const [{ data: usersData, error: usersError }, { data: accessRows, error: accessError }, { data: stripeRows, error: stripeError }] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers(),
      supabaseAdmin
        .from("user_properties")
        .select("user_id, property_id, properties(address)")
        .eq("role", "owner"),
      supabaseAdmin
        .from("owner_stripe_accounts")
        .select("owner_user_id, stripe_connected_account_id, stripe_status, charges_enabled, payouts_enabled"),
    ]);

    if (usersError) throw usersError;
    if (accessError) throw accessError;
    if (stripeError) throw stripeError;

    const ownerPropertyMap = new Map<string, string[]>();
    for (const row of accessRows || []) {
      const userId = (row as any).user_id as string;
      const address = (row as any).properties?.address as string | undefined;
      if (!userId) continue;
      ownerPropertyMap.set(userId, [...(ownerPropertyMap.get(userId) || []), address || ""]);
    }

    const stripeMap = new Map(
      (stripeRows || []).map((row: any) => [
        row.owner_user_id,
        {
          stripeConnectedAccountId: row.stripe_connected_account_id || "",
          stripeStatus: row.stripe_status || "not_connected",
          chargesEnabled: row.charges_enabled,
          payoutsEnabled: row.payouts_enabled,
        },
      ])
    );

    const ownerUserIds = new Set(ownerPropertyMap.keys());
    const owners = (usersData?.users || [])
      .filter((u) => (u.user_metadata as any)?.role === "owner" || ownerUserIds.has(u.id))
      .map((u) => {
        const stripeInfo = stripeMap.get(u.id);
        const properties = ownerPropertyMap.get(u.id) || [];
        return {
          id: u.id,
          ownerName: (u.user_metadata as any)?.name || u.email || u.id,
          ownerEmail: u.email || "",
          properties,
          stripeConnectedAccountId: stripeInfo?.stripeConnectedAccountId || "",
          stripeStatus:
            stripeInfo?.stripeStatus ||
            (stripeInfo?.stripeConnectedAccountId ? "connected" : "not_connected"),
          chargesEnabled: stripeInfo?.chargesEnabled ?? null,
          payoutsEnabled: stripeInfo?.payoutsEnabled ?? null,
        };
      })
      .sort((a, b) => a.ownerName.localeCompare(b.ownerName));

    return NextResponse.json({ rows: owners });
  } catch (error) {
    console.error("Error fetching admin owners:", error);
    return NextResponse.json({ error: "Failed to fetch owners" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { ownerUserId, stripeConnectedAccountId } = await request.json();
    if (!ownerUserId) {
      return NextResponse.json({ error: "ownerUserId is required" }, { status: 400 });
    }

    const normalizedAccountId = String(stripeConnectedAccountId || "").trim();
    if (normalizedAccountId && !isValidStripeConnectedAccount(normalizedAccountId)) {
      return NextResponse.json({ error: 'Stripe account ID must start with "acct_"' }, { status: 400 });
    }

    const payload = {
      owner_user_id: ownerUserId,
      stripe_connected_account_id: normalizedAccountId || null,
      stripe_status: normalizedAccountId ? "connected" : "not_connected",
    };

    const { data, error } = await supabaseAdmin
      .from("owner_stripe_accounts")
      .upsert(payload, { onConflict: "owner_user_id" })
      .select("owner_user_id, stripe_connected_account_id, stripe_status, charges_enabled, payouts_enabled")
      .single();

    if (error) throw error;

    return NextResponse.json({
      ownerUserId: data.owner_user_id,
      stripeConnectedAccountId: data.stripe_connected_account_id || "",
      stripeStatus: data.stripe_status,
      chargesEnabled: data.charges_enabled,
      payoutsEnabled: data.payouts_enabled,
    });
  } catch (error: any) {
    console.error("Error updating owner Stripe account:", error);
    return NextResponse.json({ error: error.message || "Failed to update owner Stripe account" }, { status: 500 });
  }
}
