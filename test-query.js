require("dotenv").config({ path: ".env.local" });
require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  const { data, error } = await supabase
    .from("dorm_memberships")
    .select('*')
    .limit(1);
  console.log("dorm_memberships:", data);

  const { data: occData } = await supabase.from('occupants').select('*').limit(1);
  console.log("occupants:", occData);
}

test();
