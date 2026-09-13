import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Session-bound Supabase client for Route Handlers and Server Components —
 * uses the anon key plus the caller's own auth cookies, so every query runs
 * as that user and is subject to RLS (see db/migrations/0002_auth_rls.sql).
 * Use this for anything acting on behalf of a signed-in contractor; reserve
 * the service-role client (lib/supabase.ts) for ingestion and the Stripe
 * webhook, which run with no user session at all.
 */
export async function getServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render — proxy.ts already
            // refreshes the session cookie on the way in, so this is safe to ignore.
          }
        },
      },
    },
  );
}
