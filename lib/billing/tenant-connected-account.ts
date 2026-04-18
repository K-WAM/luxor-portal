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

  const { data: property, error: propertyError } = await supabaseAdmin
    .from("properties")
    .select("stripe_connected_account_id")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyError) throw propertyError;

  const connectedAccountId = String(property?.stripe_connected_account_id || "").trim();
  if (!connectedAccountId) {
    return {
      paymentAvailable: false,
      ownerUserId: null,
      connectedAccountId: null,
      reason: "missing_connected_account",
    } as const;
  }

  return {
    paymentAvailable: true,
    ownerUserId: null,
    connectedAccountId,
    reason: null,
  } as const;
}
