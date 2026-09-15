import { getServerClient } from "./supabase-server";

/**
 * There's no distributor portal or platform-admin role yet — PO/packing-slip
 * documents name the distributor explicitly and must never be reachable by a
 * contractor (that's the whole point of blind packing slips). Until a real
 * ops role exists, gate these pages behind an email allowlist on top of the
 * same Supabase Auth session everyone else uses.
 */
export async function requireOpsUser(): Promise<{ email: string } | null> {
  const allowlist = (process.env.OPS_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0) return null;

  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  if (!allowlist.includes(user.email.toLowerCase())) return null;

  return { email: user.email };
}
