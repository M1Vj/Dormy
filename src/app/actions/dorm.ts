"use server";

import { revalidatePath } from "next/cache";
import { getActiveRole } from "@/lib/roles-server";
import { z } from "zod";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";

import { logAuditEvent } from "@/lib/audit/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserDorms, setActiveDormId } from "@/lib/dorms";

const dormSchema = z.object({
  name: z.string().min(2),
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and dashes."),
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

export async function getUserDormsAction() {
  return getUserDorms();
}

export async function getAllDorms() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data: adminMembership } = await supabase
    .from("dorm_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "admin");

  if (!adminMembership?.length) {
    return [];
  }

  const adminClient = createAdminClient();
  const { data } = await adminClient
    .from("dorms")
    .select("id, name, slug")
    .order("name", { ascending: true });

  return data ?? [];
}

export async function createDorm(formData: FormData) {
  const parsed = dormSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
  });

  if (!parsed.success) {
    return { error: "Provide a name and a valid code." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  const { data: adminMembership } = await supabase
    .from("dorm_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("role", "admin");

  if (!adminMembership?.length) {
    return { error: "You do not have permission to create dorms." };
  }

  const adminClient = createAdminClient();
  const { data: dorm, error } = await adminClient
    .from("dorms")
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
    })
    .select("id")
    .single();

  if (error || !dorm) {
    return { error: error?.message ?? "Failed to create dorm." };
  }

  const { error: membershipError } = await adminClient
    .from("dorm_memberships")
    .insert({
      dorm_id: dorm.id,
      user_id: user.id,
      role: "admin",
    });

  if (membershipError) {
    return { error: membershipError.message };
  }

  try {
    await logAuditEvent({
      dormId: dorm.id,
      actorUserId: user.id,
      action: "dorm.created",
      entityType: "dorm",
      entityId: dorm.id,
      metadata: {
        name: parsed.data.name,
        slug: parsed.data.slug,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for dorm creation:", auditError);
  }

  const activeRole = await getActiveRole() || "occupant";
  revalidatePath(`/${activeRole}/dorms`);
  return { success: true };
}

export async function switchDorm(dormId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated." };
  }

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("dorm_id", dormId)
    .maybeSingle();

  if (!membership) {
    return { error: "You do not have access to that dorm." };
  }

  await setActiveDormId(dormId);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateDormAttributes(dormId: string, updates: Record<string, unknown>) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("dorm_id", dormId)
    .maybeSingle();

  if (!membership || !["admin", "adviser"].includes(membership.role)) {
    return { error: "You do not have permission to update dorm settings." };
  }

  const { data: dorm } = await supabase
    .from("dorms")
    .select("attributes")
    .eq("id", dormId)
    .single();

  const currentAttributes = typeof dorm?.attributes === 'object' && dorm?.attributes !== null ? dorm.attributes : {};
  const newAttributes = { ...currentAttributes, ...updates };

  const { error } = await supabase
    .from("dorms")
    .update({ attributes: newAttributes })
    .eq("id", dormId);

  if (error) return { error: error.message };

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "dorm.updated",
      entityType: "dorm",
      entityId: dormId,
      metadata: { updates },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for dorm update:", auditError);
  }

  const activeRole = await getActiveRole() || "occupant";
  revalidatePath(`/${activeRole}`);
  revalidatePath(`/${activeRole}/finance`);
  return { success: true };
}

export async function getTreasurerMaintenanceAccess(dormId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("dorm_id", dormId)
    .maybeSingle();

  if (!membership) {
    return { error: "You do not have access to this dorm." };
  }

  const { data: dorm, error } = await supabase
    .from("dorms")
    .select("treasurer_maintenance_access")
    .eq("id", dormId)
    .maybeSingle();

  if (error || !dorm) {
    return { error: error?.message ?? "Dorm not found" };
  }

  return { access: !!dorm.treasurer_maintenance_access };
}

export async function toggleTreasurerMaintenanceAccess(dormId: string, enabled: boolean) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("dorm_id", dormId)
    .maybeSingle();

  if (!membership || !["admin", "adviser"].includes(membership.role)) {
    return { error: "You do not have permission to update dorm settings." };
  }

  const adminClient = createAdminClient();
  const { data: updatedDorm, error } = await adminClient
    .from("dorms")
    .update({ treasurer_maintenance_access: enabled })
    .eq("id", dormId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!updatedDorm) return { error: "Failed to update dorm settings." };

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "dorm.updated",
      entityType: "dorm",
      entityId: dormId,
      metadata: { updates: { treasurer_maintenance_access: enabled } },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for dorm update:", auditError);
  }

  const activeRole = await getActiveRole() || "occupant";
  revalidatePath(`/${activeRole}`);
  revalidatePath(`/${activeRole}/finance`);
  return { success: true };
}

export async function getFinanceHistoricalEditOverride(dormId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("dorm_id", dormId)
    .maybeSingle();

  if (!membership) {
    return { error: "You do not have access to this dorm." };
  }

  const { data: dorm, error } = await supabase
    .from("dorms")
    .select("attributes")
    .eq("id", dormId)
    .maybeSingle();

  if (error || !dorm) {
    return { error: error?.message ?? "Dorm not found." };
  }

  const attributes =
    typeof dorm.attributes === "object" && dorm.attributes !== null
      ? (dorm.attributes as Record<string, unknown>)
      : {};

  return {
    enabled: attributes.finance_non_current_semester_override === true,
  };
}

export async function toggleFinanceHistoricalEditOverride(dormId: string, enabled: boolean) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("dorm_id", dormId)
    .maybeSingle();

  if (!membership || !["admin", "adviser", "treasurer"].includes(membership.role)) {
    return { error: "You do not have permission to update this setting." };
  }

  const { data: dorm } = await supabase
    .from("dorms")
    .select("attributes")
    .eq("id", dormId)
    .maybeSingle();

  const attributes =
    typeof dorm?.attributes === "object" && dorm.attributes !== null
      ? (dorm.attributes as Record<string, unknown>)
      : {};

  const nextAttributes = {
    ...attributes,
    finance_non_current_semester_override: enabled,
  };

  const { error } = await supabase
    .from("dorms")
    .update({ attributes: nextAttributes })
    .eq("id", dormId);

  if (error) return { error: error.message };

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "dorm.updated",
      entityType: "dorm",
      entityId: dormId,
      metadata: { updates: { finance_non_current_semester_override: enabled } },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for dorm update:", auditError);
  }

  const activeRole = (await getActiveRole()) || "occupant";
  revalidatePath(`/${activeRole}`);
  revalidatePath(`/${activeRole}/settings`);
  revalidatePath(`/${activeRole}/finance`);
  revalidatePath(`/${activeRole}/finance/events`);
  return { success: true };
}
