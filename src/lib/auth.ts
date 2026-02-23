import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppRole =
  | "admin"
  | "adviser"
  | "student_assistant"
  | "treasurer"
  | "occupant"
  | "officer";

export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  return data.user;
}

export async function getMyProfile() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, dorm_id, role, full_name, student_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function requireRole(role: AppRole | AppRole[], myRole?: string | null) {
  const roles = Array.isArray(role) ? role : [role];
  if (!myRole || !roles.includes(myRole as AppRole)) redirect("/login");
}
