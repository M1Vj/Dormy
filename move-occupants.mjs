import "./scripts/load-env.mjs";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);
const MOLAVE_DORM_ID = "07898c62-a61f-4c69-81f9-438ce4c105fd";

async function moveOccupants() {
  console.log(`Moving occupants without user_id to dorm ${MOLAVE_DORM_ID}...`);

  const { data, error, count } = await supabase
    .from("occupants")
    .update({ dorm_id: MOLAVE_DORM_ID })
    .is("user_id", null)
    .select("id", { count: "exact" });

  if (error) {
    console.error("Error moving occupants:", error.message);
    process.exit(1);
  }

  console.log(`Successfully moved ${count ?? data.length} occupants.`);
}

moveOccupants();
