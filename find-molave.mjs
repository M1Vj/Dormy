import "./scripts/load-env.mjs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

async function findMolave() {
  const { data, error } = await supabase
    .from("dorms")
    .select("id, name, slug")
    .ilike("name", "%molave%");

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
}

findMolave();
