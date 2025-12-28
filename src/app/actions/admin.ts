"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

const roles = [
  "admin",
  "student_assistant",
  "treasurer",
  "adviser",
  "assistant_adviser",
  "occupant",
  "event_officer",
] as const;

const createUserSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(roles),
  dormId: z.string().uuid(),
});

const createAdminClient = () => {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
};

export async function createUser(formData: FormData) {
  const parsed = createUserSchema.safeParse({
    firstName: String(formData.get("firstName") ?? "").trim(),
    lastName: String(formData.get("lastName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    role: String(formData.get("role") ?? ""),
    dormId: String(formData.get("dormId") ?? ""),
  });

  if (!parsed.success) {
    return { error: "Check the form inputs and try again." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to create users." };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", parsed.data.dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError || membership?.role !== "admin") {
    return { error: "You do not have permission to create users." };
  }

  const adminClient = createAdminClient();
  const { data: created, error: createError } =
    await adminClient.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
    });

  if (createError || !created.user) {
    return { error: createError?.message ?? "Failed to create user." };
  }

  const displayName = `${parsed.data.firstName} ${parsed.data.lastName}`.trim();

  const { error: profileError } = await adminClient.from("profiles").insert({
    user_id: created.user.id,
    display_name: displayName,
  });

  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return { error: profileError.message };
  }

  const { error: membershipInsertError } = await adminClient
    .from("dorm_memberships")
    .insert({
      dorm_id: parsed.data.dormId,
      user_id: created.user.id,
      role: parsed.data.role,
    });

  if (membershipInsertError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return { error: membershipInsertError.message };
  }

  revalidatePath("/admin/users");
  return { success: true };
}
