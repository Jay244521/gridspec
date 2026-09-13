import { createClient } from "@supabase/supabase-js";

/**
 * Server-only client using the service role key — required to bypass RLS for
 * search/BOM-matching queries that span all distributors' catalogs. Never
 * import this from a "use client" component or expose the key to the browser.
 */
export function getServiceRoleClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
