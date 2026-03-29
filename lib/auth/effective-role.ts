import { supabaseAdmin } from "@/lib/supabase/server";

export type UserRole = "tenant" | "owner" | "admin" | "viewer" | null;

export async function resolveEffectiveRole(userId: string, metadataRole: UserRole): Promise<UserRole> {
  if (!userId) return metadataRole ?? null;
  if (metadataRole === "admin") return "admin";

  const { data, error } = await supabaseAdmin
    .from("user_properties")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    console.error("Error resolving effective role:", error);
    return metadataRole ?? null;
  }

  const propertyRoles = Array.from(
    new Set(
      (data || [])
        .map((row: any) => row.role)
        .filter((role): role is "tenant" | "owner" => role === "tenant" || role === "owner")
    )
  );

  if (propertyRoles.length === 1) return propertyRoles[0];
  if (propertyRoles.length > 1 && metadataRole && propertyRoles.includes(metadataRole as "tenant" | "owner")) {
    return metadataRole;
  }

  return metadataRole ?? null;
}
