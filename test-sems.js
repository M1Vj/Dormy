import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: dorms } = await supabase.from('dorms').select('id, name');
  const dormId = dorms.find(d => d.name === 'Alpha Test Dorm')?.id;

  console.log('Dorm ID:', dormId);

  const { data: sems } = await supabase
    .from('dorm_semesters')
    .select('*')
    .or(`dorm_id.eq.${dormId},dorm_id.is.null`)
    .order('starts_on', { ascending: false });
  console.log('Semesters:', sems);

  const { data: activeSem } = await supabase.rpc('ensure_active_semester', { p_dorm_id: dormId });
  console.log('RPC ensure_active_semester:', activeSem);
}

run();
