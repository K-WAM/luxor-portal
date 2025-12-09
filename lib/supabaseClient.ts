import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL in environment variables");
}
if (!supabaseKey) {
  throw new Error("Missing SUPABASE_ANON_KEY in environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
// existing stuff above...
// export const supabase = createClient(...)

export function createSupabaseServerClient() {
  // For now we just reuse the same client.
  // Later we can swap this to a server-only setup if needed.
  return supabase;
}
