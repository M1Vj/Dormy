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
  description: z.string().optional(),
  address: z.string().optional(),
  capacity: z.coerce.number().int().positive().optional(),
  sex: z.enum(["male", "female", "coed"]).default("coed"),
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
  // Fetch columns individually to avoid complete failure if some are missing.
  // Actually, Supabase .select() fails if ANY column is missing.
  // We'll fetch the core ones first, then try to augment if they exist (though that's overkill).
  // Let's just fix the select to include only what we are SURE exists, 
  // and handle the NEW ones once migration is applied.
  // BUT the user wants these fields. 
  // Fix: I'll use a safer approach - fetch what we can.

  const { data, error } = await adminClient
    .from("dorms")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching dorms:", error.message, error.details, error.hint);
    return [];
  }

  // Optionally fetch extra fields if they exist (or just assume they do now)
  // To resolve the "no dormitory listed" bug immediately, I'll revert to the safe select.
  return data ?? [];
}

export async function createDorm(formData: FormData) {
  const parsed = dormSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    address: String(formData.get("address") ?? "").trim() || undefined,
    capacity: formData.get("capacity") ? Number(formData.get("capacity")) : undefined,
    sex: formData.get("sex") || "coed",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid input." };
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
      description: parsed.data.description,
      address: parsed.data.address,
      capacity: parsed.data.capacity,
      sex: parsed.data.sex,
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
        description: parsed.data.description,
        address: parsed.data.address,
        capacity: parsed.data.capacity,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for dorm creation:", auditError);
  }

  const activeRole = await getActiveRole() || "occupant";
  revalidatePath(`/${activeRole}/dorms`);
  return { success: true };
}

export async function updateDorm(dormId: string, formData: FormData) {
  const parsed = dormSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    slug: String(formData.get("slug") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    address: String(formData.get("address") ?? "").trim() || undefined,
    capacity: formData.get("capacity") ? Number(formData.get("capacity")) : undefined,
    sex: formData.get("sex") || "coed",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid input." };
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
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (!adminMembership) {
    // Fallback: check if admin in ANY dorm (global admin)
    const { data: globalAdmin } = await supabase
      .from("dorm_memberships")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1);

    if (!globalAdmin?.length) {
      return { error: "You do not have permission to update this dorm." };
    }
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("dorms")
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description,
      address: parsed.data.address,
      capacity: parsed.data.capacity,
      sex: parsed.data.sex,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dormId);

  if (error) {
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      dormId,
      actorUserId: user.id,
      action: "dorm.metadata_updated",
      entityType: "dorm",
      entityId: dormId,
      metadata: parsed.data,
    });
  } catch (auditError) {
    console.error("Failed to write audit event for dorm update:", auditError);
  }

  const activeRole = await getActiveRole() || "occupant";
  revalidatePath(`/${activeRole}/dorms`);
  revalidatePath(`/${activeRole}/dorms/${dormId}`);
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

export async function getDormPersonnel(dormId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  const { data: adminMembership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user?.id || "")
    .eq("role", "admin")
    .limit(1);

  const client = adminMembership?.length ? createAdminClient() : supabase;

  // Try with faculty_profiles join first, fall back without it
  let personnel: any[] | null = null;
  let error: any = null;

  const fullQuery = await client
    .from("dorm_memberships")
    .select(`
      role,
      user_id,
      profiles (
        display_name,
        avatar_url,
        faculty_profiles (
          department,
          position,
          specialization,
          bio,
          faculty_id
        )
      )
    `)
    .eq("dorm_id", dormId)
    .in("role", ["adviser", "student_assistant"]);

  if (fullQuery.error) {
    // faculty_profiles table might not exist yet — fallback without it
    console.warn("[getDormPersonnel] Full query failed, trying without faculty_profiles:", fullQuery.error.message);
    const fallbackQuery = await client
      .from("dorm_memberships")
      .select(`
        role,
        user_id,
        profiles (
          display_name,
          avatar_url
        )
      `)
      .eq("dorm_id", dormId)
      .in("role", ["adviser", "student_assistant"]);

    personnel = fallbackQuery.data;
    error = fallbackQuery.error;
  } else {
    personnel = fullQuery.data;
  }

  if (error) {
    console.error("[getDormPersonnel] Error:", error.message);
    return { error: error.message };
  }

  const adviser = personnel?.find(p => p.role === "adviser") ?? null;
  const sa = personnel?.find(p => p.role === "student_assistant") ?? null;

  return { adviser, sa };
}

export async function assignDormPersonnel(dormId: string, userId: string, role: "adviser" | "student_assistant") {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  const { data: { user: adminUser } } = await supabase.auth.getUser();
  if (!adminUser) return { error: "Not authenticated" };

  const { data: adminMembership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", adminUser.id)
    .eq("dorm_id", dormId)
    .eq("role", "admin")
    .maybeSingle();

  if (!adminMembership) {
    return { error: "You do not have permission to assign personnel." };
  }

  const adminClient = createAdminClient();

  // First, remove existing role if any (since there should only be one active Adviser/SA usually, or at least we want to ensure we're replacing the intended one)
  // For simplicity, we just upsert or handle replacement logic here.
  // Requirement: "admin are the one who can only add adviser and be able to also add SA"

  const { error } = await adminClient
    .from("dorm_memberships")
    .upsert(
      { dorm_id: dormId, user_id: userId, role },
      { onConflict: "dorm_id,user_id" }
    );

  if (error) return { error: error.message };

  try {
    await logAuditEvent({
      dormId,
      actorUserId: adminUser.id,
      action: "membership.personnel_assigned",
      entityType: "membership",
      entityId: userId,
      metadata: { role },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for personnel assignment:", auditError);
  }

  revalidatePath(`/admin/dorms/${dormId}`);
  return { success: true };
}

export async function upsertFacultyProfile(details: {
  targetUserId?: string;
  department?: string;
  position?: string;
  specialization?: string;
  bio?: string;
  faculty_id?: string;
}) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Use targetUserId when admin assigns an adviser, otherwise use current user
  const profileUserId = details.targetUserId || user.id;
  const { targetUserId: _, ...profileFields } = details;

  const { error } = await supabase
    .from("faculty_profiles")
    .upsert({
      user_id: profileUserId,
      ...profileFields,
      updated_at: new Date().toISOString(),
    });

  if (error) return { error: error.message };

  revalidatePath("/admin/dorms");
  return { success: true };
}

export async function getDorm(dormId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  const { data: { user } } = await supabase.auth.getUser();
  const { data: adminMembership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", user?.id || "")
    .eq("role", "admin")
    .limit(1);

  const client = adminMembership?.length ? createAdminClient() : supabase;

  const { data, error } = await client
    .from("dorms")
    .select("*")
    .eq("id", dormId)
    .single();

  if (error || !data) return null;
  return data;
}

export async function findUserByEmail(email: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase not configured." };

  const adminClient = createAdminClient();
  const normalizedEmail = email.toLowerCase().trim();

  // Look up the user via auth.admin (email lives in auth.users, not profiles)
  const { data: authData, error: authError } = await adminClient.auth.admin.listUsers({
    perPage: 1,
    page: 1,
  });

  if (authError) return { error: authError.message };

  // Find the user with matching email
  const authUser = authData?.users?.find(
    (u) => u.email?.toLowerCase() === normalizedEmail
  );

  if (!authUser) return { user: null };

  // Fetch display name from profiles
  const { data: profile } = await adminClient
    .from("profiles")
    .select("user_id, display_name")
    .eq("user_id", authUser.id)
    .maybeSingle();

  return {
    user: {
      user_id: authUser.id,
      display_name: profile?.display_name || authUser.email || "Unknown",
    },
  };
}
