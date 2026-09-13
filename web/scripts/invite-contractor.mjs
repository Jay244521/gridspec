#!/usr/bin/env node
/**
 * Invite a contractor firm into the Phase 3 VIP Beta cohort.
 *
 * Onboarding is invite-only (LinkedIn outreach to 10-15 regional
 * contractors, per the roadmap), not self-serve signup, so this is run by
 * an operator, not exposed as a public route. It creates the `contractors`
 * row, sends the named user a Supabase invite email (they set their own
 * password via the link), and links the two with a `contractor_users` row.
 *
 * Usage:
 *   node --env-file=.env.local scripts/invite-contractor.mjs \
 *     "Acme Solar Installers" ops@acmesolar.example "Jordan Lee"
 */
import { createClient } from "@supabase/supabase-js";

const [, , companyName, email, fullName] = process.argv;

if (!companyName || !email) {
  console.error("Usage: invite-contractor.mjs <company_name> <email> [full_name]");
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const { data: contractor, error: contractorError } = await supabase
  .from("contractors")
  .insert({ company_name: companyName, subscription_tier: "trial", subscription_status: "inactive" })
  .select()
  .single();

if (contractorError) {
  console.error(`Failed to create contractor: ${contractorError.message}`);
  process.exit(1);
}

const { data: invite, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email);

if (inviteError) {
  console.error(`Failed to invite user (contractor ${contractor.id} was still created): ${inviteError.message}`);
  process.exit(1);
}

const { error: linkError } = await supabase.from("contractor_users").insert({
  contractor_id: contractor.id,
  auth_user_id: invite.user.id,
  email,
  full_name: fullName ?? null,
  role: "owner",
});

if (linkError) {
  console.error(`Invited the user but failed to link contractor_users row: ${linkError.message}`);
  process.exit(1);
}

console.log(`Invited ${email} to contractor "${companyName}" (${contractor.id}). They'll get an email to set their password.`);
