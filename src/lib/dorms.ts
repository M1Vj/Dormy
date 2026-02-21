import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const DORM_COOKIE = "dorm_id";

export async function getActiveDormId() {
  const cookieStore = await cookies();
  const rawId = cookieStore.get(DORM_COOKIE)?.value;

  if (!rawId) return null;

  const dorms = await getUserDorms();
  const isValid = dorms.some((d) => d.id === rawId);

  if (isValid) return rawId;
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
    .select("dorms(id, name, slug)")
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
};
