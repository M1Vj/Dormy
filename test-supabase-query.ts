import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function test() {
  const { data, error } = await supabase
    .from("dorm_applications")
    .select("id, dorm_id, user_id, email, applicant_name, requested_role, granted_role, status, message, review_note, student_id, room_number, created_at, reviewed_at")
    .limit(1);

  if (error) {
    console.error("Query Error:", error);
  } else {
    console.log("Success:", data);
  }
}
test();
