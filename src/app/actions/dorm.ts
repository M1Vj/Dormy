"use server";

import { revalidatePath } from "next/cache";
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

  revalidatePath("/admin/dorms");
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
