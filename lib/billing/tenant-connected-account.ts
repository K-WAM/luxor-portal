import { supabaseAdmin } from "@/lib/supabase/server";

export async function resolveTenantBillConnectedAccount(propertyId: string) {
  if (!propertyId) {
    return {
      paymentAvailable: false,
      ownerUserId: null,
      connectedAccountId: null,
      reason: "missing_property",
    } as const;
  }

  const { data: ownerLinks, error: ownerLinksError } = await supabaseAdmin
    .from("user_properties")
    .select("user_id, ownership_percentage")
    .eq("property_id", propertyId)
    .eq("role", "owner");

  if (ownerLinksError) throw ownerLinksError;

  const uniqueOwnerIds = Array.from(
    new Set((ownerLinks || []).map((row: any) => row.user_id).filter(Boolean))
  );

  if (uniqueOwnerIds.length !== 1) {
    return {
      paymentAvailable: false,
      ownerUserId: uniqueOwnerIds[0] || null,
      connectedAccountId: null,
      reason: uniqueOwnerIds.length === 0 ? "missing_owner" : "ambiguous_owner",
    } as const;
  }

  const ownerUserId = uniqueOwnerIds[0];
  const { data: ownerStripe, error: ownerStripeError } = await supabaseAdmin
    .from("owner_stripe_accounts")
    .select("stripe_connected_account_id")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();

  if (ownerStripeError) throw ownerStripeError;

  const connectedAccountId = String(ownerStripe?.stripe_connected_account_id || "").trim();
  if (!connectedAccountId) {
    return {
      paymentAvailable: false,
      ownerUserId,
      connectedAccountId: null,
      reason: "missing_connected_account",
    } as const;
  }

  return {
    paymentAvailable: true,
    ownerUserId,
    connectedAccountId,
    reason: null,
  } as const;
}
