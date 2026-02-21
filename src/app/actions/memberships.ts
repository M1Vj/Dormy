"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAuditEvent } from "@/lib/audit/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppRole } from "@/lib/auth";
import { canManageRole } from "@/lib/roles";

const updateRolesSchema = z.object({
  dormId: z.string().uuid(),
  userId: z.string().uuid(),
  roles: z.array(z.enum([
    "admin",
    "student_assistant",
    "treasurer",
    "adviser",
    "occupant",
    "officer",
  ])).min(1, "At least one role is required"),
});

export async function updateMembershipRoles(
  dormId: string,
  userId: string,
  newRoles: AppRole[]
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

  // Check if actor has permission
  const { data: actorMembership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!actorMembership?.role) {
    return { error: "You do not have permission to update roles." };
  }

  const parsed = updateRolesSchema.safeParse({ dormId, userId, roles: newRoles });
  if (!parsed.success) {
    return { error: "Invalid input data: " + parsed.error.message };
  }

  const { data: previousMemberships, error: fetchError } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", userId);

  if (fetchError) {
    return { error: fetchError.message };
  }

  const actorRole = actorMembership.role;

  // Ensure actor can manage all old roles of target user
  for (const m of previousMemberships || []) {
    if (!canManageRole(actorRole, m.role)) {
      return { error: `You do not have permission to manage a user holding the ${m.role} role.` };
    }
  }

  // Ensure actor can assign all new roles
  for (const r of newRoles) {
    if (!canManageRole(actorRole, r)) {
      return { error: `You do not have permission to assign the ${r} role.` };
    }
  }

  const { error: delError } = await supabase
    .from("dorm_memberships")
    .delete()
    .eq("dorm_id", dormId)
    .eq("user_id", userId);

  if (delError) {
    return { error: delError.message };
  }

  const toInsert = newRoles.map((r) => ({
    dorm_id: dormId,
    user_id: userId,
    role: r,
  }));

  const { error: insError } = await supabase
    .from("dorm_memberships")
    .insert(toInsert);

  if (insError) {
    return { error: insError.message };
  }

  await logAuditEvent({
    dormId,
    actorUserId: user.id,
    action: "membership.role_updated",
    entityType: "membership",
    entityId: userId, // Using userId as entityId for membership
    metadata: {
      target_user_id: userId,
      previous_roles: previousMemberships?.map(m => m.role).join(",") || "none",
      new_roles: newRoles.join(","),
    },
  });

  revalidatePath("/admin/occupants");
  revalidatePath("/occupants");
  return { success: true };
}
