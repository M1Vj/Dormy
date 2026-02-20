import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const ALL_ROLES = [
  "occupant",
  "admin",
  "student_assistant",
  "treasurer",
  "committee_head",
  "officer",
  "adviser",
  "assistant_adviser"
];

async function main() {
  const email = "mabansagbj@gmail.com";

  // 1. Get user by email
  // Since we are using service_role, we can query auth.users if needed, or profiles
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('email', email)
    .single();

  if (profileErr || !profile) {
    console.error("Could not find profile for email", email, profileErr);
    process.exit(1);
  }

  const userId = profile.user_id;

  // 2. Get their dorm
  const { data: currentMemberships, error: memErr } = await supabase
    .from('dorm_memberships')
    .select('dorm_id, role')
    .eq('user_id', userId);

  if (memErr || !currentMemberships || currentMemberships.length === 0) {
    console.error("Could not find any dorm memberships for user", memErr);
    process.exit(1);
  }

  const dormId = currentMemberships[0].dorm_id;
  const existingRoles = new Set(currentMemberships.map(m => m.role));

  console.log(`Found user ${userId} in dorm ${dormId}`);

  // 3. Insert missing roles
  const rolesToAdd = ALL_ROLES.filter(r => !existingRoles.has(r));

  if (rolesToAdd.length === 0) {
    console.log("User already has all roles.");
    return;
  }

  const payload = rolesToAdd.map(role => ({
    user_id: userId,
    dorm_id: dormId,
    role: role
  }));

  const { error: insertErr } = await supabase
    .from('dorm_memberships')
    .insert(payload);

  if (insertErr) {
    console.error("Failed to insert roles:", insertErr);
    // They might not have run the migration yet to drop the unique constraint!
    if (insertErr.message.includes('unique constraint') || insertErr.code === '23505') {
      console.error("\\n!!! ATTENTION: The unique constraint on dorm_memberships has not been updated. You MUST run the SQL migration `20260220220809_multiple_roles.sql` first before adding multiple roles.");
    }
    process.exit(1);
  }

  console.log(`Successfully added roles: ${rolesToAdd.join(', ')}`);
}

main();
