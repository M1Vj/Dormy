import { cache } from "react";
import { type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Returns all roles the user holds within a specific dorm.
 * Safe for multi-role users — never uses `.maybeSingle()`.
 */
export async function getUserRolesForDorm(
  supabase: SupabaseClient,
  userId: string,
  dormId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("dorm_id", dormId);

  return (data ?? []).map((m) => m.role as string);
}

/**
 * Returns all roles the user holds across ALL dorms.
 * Safe for multi-role users.
 */
export async function getUserRolesAllDorms(
  supabase: SupabaseClient,
  userId: string
): Promise<{ role: string; dorm_id: string }[]> {
  const { data } = await supabase
    .from("dorm_memberships")
    .select("role, dorm_id")
    .eq("user_id", userId);

  return (data ?? []) as { role: string; dorm_id: string }[];
}

/**
 * Checks whether the current user has at least one of the required roles
 * for the active dorm (read from cookie). Returns the roles array and hasAccess flag.
 *
 * Use in Server Components / layouts for RBAC gating.
 */
export const getCachedUserAccessForActiveDorm = cache(
  async (allowedRoles: string[]): Promise<{
    hasAccess: boolean;
    roles: string[];
    dormId: string | null;
  }> => {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { hasAccess: false, roles: [], dormId: null };

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return { hasAccess: false, roles: [], dormId: null };

    const cookieStore = await cookies();
    const dormId = cookieStore.get("dorm_id")?.value ?? null;
    if (!dormId) return { hasAccess: false, roles: [], dormId: null };

    const roles = await getUserRolesForDorm(supabase, user.id, dormId);
    const hasAccess =
      allowedRoles.length === 0 ||
      roles.some((r) => allowedRoles.includes(r));

    return { hasAccess, roles, dormId };
  }
);
