import "./load-env.mjs";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DORMY_DEMO_PASSWORD || "DormyPass123!";
const dormSlug = process.env.DORMY_DORM_SLUG || "molave-mens-hall";

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment."
  );
  process.exit(1);
}

const demoAccounts = [
  { email: "admin@dormy.local", role: "admin", displayName: "Dormy Admin" },
  {
    email: "sa@dormy.local",
    role: "student_assistant",
    displayName: "Dormy Student Assistant",
  },
  {
    email: "treasurer@dormy.local",
    role: "treasurer",
    displayName: "Dormy Treasurer",
  },
  {
    email: "adviser@dormy.local",
    role: "adviser",
    displayName: "Dormy Adviser",
  },
  {
    email: "assistant.adviser@dormy.local",
    role: "assistant_adviser",
    displayName: "Dormy Assistant Adviser",
  },
  {
    email: "events@dormy.local",
    role: "officer",
    displayName: "Dormy Officer",
  },
  {
    email: "occupant@dormy.local",
    role: "occupant",
    displayName: "Dormy Occupant",
  },
];

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

async function listAllAuthUsers() {
  const users = [];
  const perPage = 200;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(error.message);
    }

    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) break;
  }

  return users;
}

async function ensureMembership({ dormId, userId, desiredRole }) {
  const { data: existing, error: existingError } = await supabase
    .from("dorm_memberships")
    .select("id, role")
    .eq("dorm_id", dormId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing?.role === "admin" && desiredRole !== "admin") {
    return { status: "skipped_admin" };
  }

  const tryUpsert = async (role) => {
    const { error } = await supabase.from("dorm_memberships").upsert(
      {
        dorm_id: dormId,
        user_id: userId,
        role,
      },
      {
        onConflict: "dorm_id,user_id",
      }
    );

    return error;
  };

  const upsertError = await tryUpsert(desiredRole);
  if (!upsertError) {
    return { status: existing?.id ? "updated" : "created", role: desiredRole };
  }

  if (
    desiredRole === "officer" &&
    String(upsertError.message || "").includes("invalid input value for enum")
  ) {
    const fallbackError = await tryUpsert("event_officer");
    if (!fallbackError) {
      return {
        status: existing?.id ? "updated" : "created",
        role: "event_officer",
      };
    }
    throw new Error(fallbackError.message);
  }

  throw new Error(upsertError.message);
}

const { data: dorm, error: dormError } = await supabase
  .from("dorms")
  .select("id, slug, name")
  .eq("slug", dormSlug)
  .single();

if (dormError || !dorm) {
  console.error(dormError?.message ?? `Dorm not found: ${dormSlug}`);
  process.exit(1);
}

const usersByEmail = new Map();

try {
  const allUsers = await listAllAuthUsers();
  for (const user of allUsers) {
    if (!user.email) continue;
    usersByEmail.set(user.email.toLowerCase(), user);
  }
} catch (error) {
  console.error(error?.message ?? String(error));
  process.exit(1);
}

let createdUsers = 0;
let updatedUsers = 0;
let createdMemberships = 0;
let updatedMemberships = 0;

for (const account of demoAccounts) {
  const email = account.email.trim().toLowerCase();
  const displayName = account.displayName.trim();
  const desiredRole = account.role;

  const existing = usersByEmail.get(email);
  const userId = existing?.id ?? null;

  if (!userId) {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });

    if (error || !created?.user?.id) {
      console.log(`failed: ${email} (${error?.message ?? "create failed"})`);
      continue;
    }

    usersByEmail.set(email, created.user);
    createdUsers += 1;
    console.log(`created: ${email}`);
  } else {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });

    if (error) {
      console.log(`failed: ${email} (${error.message})`);
      continue;
    }

    updatedUsers += 1;
    console.log(`updated: ${email}`);
  }

  const ensured = usersByEmail.get(email);
  const ensuredUserId = ensured?.id;
  if (!ensuredUserId) continue;

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: ensuredUserId,
      display_name: displayName,
    },
    { onConflict: "user_id" }
  );

  if (profileError) {
    console.log(`failed: ${email} (profile ${profileError.message})`);
    continue;
  }

  try {
    const membershipResult = await ensureMembership({
      dormId: dorm.id,
      userId: ensuredUserId,
      desiredRole,
    });

    if (membershipResult.status === "created") createdMemberships += 1;
    if (membershipResult.status === "updated") updatedMemberships += 1;
  } catch (error) {
    console.log(`failed: ${email} (membership ${error?.message ?? String(error)})`);
  }
}

console.log(
  `done: users created=${createdUsers} updated=${updatedUsers}; memberships created=${createdMemberships} updated=${updatedMemberships}`
);
console.log(`demo password set to: ${password}`);

