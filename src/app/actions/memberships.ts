"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAuditEvent } from "@/lib/audit/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppRole } from "@/lib/auth";

const updateRoleSchema = z.object({
  dormId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum([
    "admin",
    "student_assistant",
    "treasurer",
    "adviser",
    "assistant_adviser",
    "occupant",
    "officer",
  ]),
});

export async function updateMembershipRole(
  dormId: string,
  userId: string,
  newRole: AppRole
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in to update roles." };
  }

  // Check if actor has permission (Admin, SA, Adviser)
  const { data: actorMembership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    !actorMembership ||
    !["admin", "adviser", "student_assistant"].includes(actorMembership.role)
  ) {
    return { error: "You do not have permission to update roles." };
  }

  const parsed = updateRoleSchema.safeParse({ dormId, userId, role: newRole });
  if (!parsed.success) {
    return { error: "Invalid input data." };
  }

  const { data: previousMembership, error: fetchError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    return { error: fetchError.message };
  }

  const { error } = await supabase
    .from("dorm_memberships")
    .upsert(
      { dorm_id: dormId, user_id: userId, role: newRole },
      { onConflict: "dorm_id,user_id" }
    );

  if (error) {
    return { error: error.message };
  }

  await logAuditEvent({
    dormId,
    actorUserId: user.id,
    action: "membership.role_updated",
    entityType: "membership",
    entityId: userId, // Using userId as entityId for membership
    metadata: {
      target_user_id: userId,
      previous_role: previousMembership?.role ?? "none",
      new_role: newRole,
    },
  });

  revalidatePath("/admin/occupants");
  revalidatePath("/occupants");
  return { success: true };
}
