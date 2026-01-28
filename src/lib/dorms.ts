import { cookies } from "next/headers";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const DORM_COOKIE = "dorm_id";

export async function getActiveDormId() {
  const cookieStore = await cookies();
  return cookieStore.get(DORM_COOKIE)?.value ?? null;
}

export async function setActiveDormId(dormId: string) {
  const cookieStore = await cookies();
  cookieStore.set(DORM_COOKIE, dormId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
}

export async function getUserDorms() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data } = await supabase
    .from("dorm_memberships")
    .select("dorms(id, name, slug)")
    .eq("user_id", user.id);

  return (data ?? [])
    .map((row) => (Array.isArray(row.dorms) ? row.dorms[0] : row.dorms))
    .filter(Boolean);
}

export type DormSummary = {
  id: string;
  name: string;
  slug: string;
};
