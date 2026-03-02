import "./load-env.mjs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

async function run() {
  const { data: users } = await supabase.auth.admin.listUsers();
  const occupantUser = users.users.find(u => u.email === 'occupant@dormy.local');
  
  if (occupantUser) {
    const { data, error } = await supabase
      .from('dorm_memberships')
      .update({ role: 'occupant' })
      .eq('user_id', occupantUser.id);
    console.log('Updated role to occupant', error || 'Success');
  } else {
    console.log('User not found');
  }
}
run();
