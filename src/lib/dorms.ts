import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const DORM_COOKIE = "dorm_id";

export async function getActiveDormId() {
  const cookieStore = await cookies();
  const rawId = cookieStore.get(DORM_COOKIE)?.value;

  const dorms = await getUserDorms();
  if (dorms.length === 0) return null;

  if (rawId) {
    const isValid = dorms.some((d) => d.id === rawId);
    if (isValid) return rawId;
  }

  // Fallback to the first available dorm if the cookie is missing or invalid.
  // This prevents redirect loops in Safari which sometimes drops cookies.
  return dorms[0]?.id ?? null;
}

export async function setActiveDormId(dormId: string) {
  const cookieStore = await cookies();
  cookieStore.set(DORM_COOKIE, dormId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
}

import { cache } from "react";
import { getCachedUser } from "@/lib/auth-cache";

export const getUserDorms = cache(async () => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const user = await getCachedUser();

  if (!user) {
    return [];
  }

  const { data } = await supabase
    .from("dorm_memberships")
    .select("dorms(id, name, slug, treasurer_maintenance_access)")
    .eq("user_id", user.id);

  return (data ?? [])
    // dorms is joined
    .map((row) => (Array.isArray(row.dorms) ? row.dorms[0] : row.dorms))
    .filter(Boolean);
});

export type DormSummary = {
  id: string;
  name: string;
  slug: string;
  treasurer_maintenance_access?: boolean | null;
};
