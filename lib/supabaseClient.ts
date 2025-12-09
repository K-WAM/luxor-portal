import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL in environment variables");
}
if (!supabaseKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// Server-side client for API routes (using anon key, not service role)
export function createSupabaseServerClient() {
  return supabase;
}