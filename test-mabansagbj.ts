import "./scripts/load-env.mjs";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users.users.find(u => u.email === 'mabansagbj@gmail.com');
  if (!user) { console.log('User not found'); return; }
  const { data: mems } = await supabase.from('dorm_memberships').select('role, dorm_id, dorms(name)').eq('user_id', user.id);
  console.log('Memberships for', user.email, ':', mems);
}
run();
