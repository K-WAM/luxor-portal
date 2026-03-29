import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveEffectiveRole, type UserRole } from "@/lib/auth/effective-role";
export type { UserRole } from "@/lib/auth/effective-role";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function getAuthContext() {
  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options?: any) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // In route handlers cookies() is read-only; ignore set attempts.
        }
      },
      remove(name: string, options?: any) {
        try {
          cookieStore.set({ name, value: "", ...options, expires: new Date(0) });
        } catch {
          // Ignore remove attempts when cookies are read-only.
        }
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, role: null as UserRole };
  }
  const metadataRole = (user.user_metadata?.role as UserRole) ?? null;
  const role = await resolveEffectiveRole(user.id, metadataRole);
  return { user, role };
}

export function isAdmin(role: UserRole) {
  return role === "admin";
}

export async function getAccessiblePropertyIds(
  userId: string,
  role: UserRole
): Promise<string[]> {
  if (!userId || !role || role === "admin") return [];

  const { data, error } = await supabaseAdmin
    .from("user_properties")
    .select("property_id")
    .eq("user_id", userId)
    .eq("role", role === "owner" ? "owner" : "tenant");

  if (error) {
    console.error("Error loading property access:", error);
    return [];
  }

  return (data || [])
    .map((row: any) => row.property_id)
    .filter(Boolean);
}
