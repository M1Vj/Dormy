import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DORMY_DEMO_PASSWORD || "DormyPass123!";

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment."
  );
  process.exit(1);
}

const demoEmails = [
  "admin@dormy.local",
  "sa@dormy.local",
  "treasurer@dormy.local",
  "adviser@dormy.local",
  "assistant.adviser@dormy.local",
  "events@dormy.local",
  "occupant@dormy.local",
];

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const { data, error } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 200,
});

if (error) {
  console.error(error.message);
  process.exit(1);
}

const usersByEmail = new Map(
  (data?.users ?? [])
    .filter((user) => user.email)
    .map((user) => [user.email.toLowerCase(), user])
);

for (const email of demoEmails) {
  const user = usersByEmail.get(email.toLowerCase());
  if (!user) {
    console.log(`missing: ${email}`);
    continue;
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    {
      password,
      email_confirm: true,
    }
  );

  if (updateError) {
    console.log(`failed: ${email} (${updateError.message})`);
  } else {
    console.log(`updated: ${email}`);
  }
}

console.log(`demo password set to: ${password}`);
