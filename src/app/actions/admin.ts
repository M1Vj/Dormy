"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

import { logAuditEvent } from "@/lib/audit/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const assignableRoles = [
  "student_assistant",
  "treasurer",
  "adviser",
  "assistant_adviser",
  "occupant",
  "officer",
] as const;

const provisioningRoles = ["admin", "adviser"] as const;

const createUserSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(assignableRoles),
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

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
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

  if (
    membershipError ||
    !membership?.role ||
    !provisioningRoles.includes(
      membership.role as (typeof provisioningRoles)[number]
    )
  ) {
    return { error: "You do not have permission to create users." };
  }

  if (membership.role === "adviser" && parsed.data.role === "adviser") {
    return { error: "Only admins can create adviser accounts." };
  }

  const adminClient = createAdminClient();
  const displayName = `${parsed.data.firstName} ${parsed.data.lastName}`.trim();
  const { data: created, error: createError } =
    await adminClient.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        full_name: displayName,
      },
    });

  if (createError || !created.user) {
    return { error: createError?.message ?? "Failed to create user." };
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

  try {
    await logAuditEvent({
      dormId: parsed.data.dormId,
      actorUserId: user.id,
      action: "admin.user_provisioned",
      entityType: "dorm_membership",
      entityId: null,
      metadata: {
        target_user_id: created.user.id,
        target_email: parsed.data.email,
        target_role: parsed.data.role,
      },
    });
  } catch (error) {
    console.error("Failed to write audit event for user provisioning:", error);
  }

  revalidatePath("/admin/users");
  return { success: true };
}
