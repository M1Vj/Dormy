import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const getCachedUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getCachedUserDorms = cache(async () => {
  const user = await getCachedUser();
  if (!user) return [];

  const supabase = await createSupabaseServerClient();
  if (!supabase) return [];

  const { data } = await supabase
    .from("dorm_memberships")
    .select("dorms(id, name, slug)")
    .eq("user_id", user.id);

  return (data ?? [])
    // dorms is joined
    .map((row) => (Array.isArray(row.dorms) ? row.dorms[0] : row.dorms))
    .filter(Boolean);
});

export const getCachedMembership = cache(async (dormId: string) => {
  const user = await getCachedUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data: membership } = await supabase
    .from("dorm_memberships")
    .select("role")
    .eq("dorm_id", dormId)
    .eq("user_id", user.id)
    .maybeSingle();

  return membership;
});
