require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const ALL_ROLES = [
  'admin',
  'student_assistant',
  'treasurer',
  'adviser',
  'assistant_adviser',
  'occupant',
  'officer'
];

async function main() {
  const { data: userListData, error: err1 } = await supabase.auth.admin.listUsers();
  const user = userListData?.users?.find(u => u.email === 'mabansagbj@gmail.com');

  if (err1 || !user) {
    console.error('Error finding user:', err1 || 'User not found');
    return;
  }

  const userId = user.id;

  const { data: mems, error: err2 } = await supabase.from('dorm_memberships').select('dorm_id, role').eq('user_id', userId);

  if (err2 || mems.length === 0) {
    console.error('Error finding memberships:', err2);
    return;
  }

  const dormId = mems[0].dorm_id;
  const existing = new Set(mems.map(m => m.role));

  const toAdd = ALL_ROLES.filter(r => !existing.has(r)).map(role => ({
    user_id: userId,
    dorm_id: dormId,
    role
  }));

  if (toAdd.length === 0) {
    console.log('Already has all roles');
    return;
  }

  const { error } = await supabase.from('dorm_memberships').insert(toAdd);
  if (error) {
    console.error('Error inserting:', error);
  } else {
    console.log('Successfully added roles:', toAdd.map(t => t.role).join(', '));
  }
}

main();
