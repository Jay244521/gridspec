import { NextResponse } from "next/server";
import { getServerClient } from "./supabase-server";

export interface AuthedContractor {
  contractorId: string;
  userId: string;
  email: string;
}

/**
 * Resolves the signed-in contractor from the request's session cookies, or
 * null if there is no session or the user isn't linked to a contractor yet.
 * Every route that acts on contractor-owned data must call this and derive
 * contractor_id from it — never from a client-submitted field.
 */
export async function getAuthedContractor(): Promise<AuthedContractor | null> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: contractorUser } = await supabase
    .from("contractor_users")
    .select("contractor_id")
    .eq("auth_user_id", user.id)
    .single();

  if (!contractorUser) return null;

  return { contractorId: contractorUser.contractor_id, userId: user.id, email: user.email ?? "" };
}

export function unauthorized() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}
