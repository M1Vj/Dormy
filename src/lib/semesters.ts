import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DormSemester = {
  id: string;
  dorm_id: string;
  school_year: string;
  semester: string;
  label: string;
  starts_on: string;
  ends_on: string;
  status: "planned" | "active" | "archived";
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DormSemesterArchive = {
  id: string;
  dorm_id: string;
  semester_id: string;
  label: string;
  created_at: string;
  snapshot: Record<string, unknown> | null;
};

async function resolveSupabase(supabase?: SupabaseClient) {
  if (supabase) {
    return supabase;
  }

  return createSupabaseServerClient();
}

export async function ensureActiveSemesterId(
  dormId: string,
  supabaseClient?: SupabaseClient
) {
  const supabase = await resolveSupabase(supabaseClient);
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." } as const;
  }

  const { data, error } = await supabase.rpc("ensure_active_semester", {
    p_dorm_id: dormId,
  });

  if (error) {
    return { error: error.message } as const;
  }

  if (!data || typeof data !== "string") {
    return { error: "Unable to resolve active semester." } as const;
  }

  return { semesterId: data } as const;
}

export async function getActiveSemester(
  dormId: string,
  supabaseClient?: SupabaseClient
) {
  const supabase = await resolveSupabase(supabaseClient);
  if (!supabase) {
    return null;
  }

  // Find the semester where today is between starts_on and ends_on
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("dorm_semesters")
    .select(
      "id, dorm_id, school_year, semester, label, starts_on, ends_on, status, archived_at, created_at, updated_at"
    )
    .eq("dorm_id", dormId)
    .lte("starts_on", today)
    .gte("ends_on", today)
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to load active semester:", error);
    return null;
  }

  return (data as DormSemester | null) ?? null;
}

export async function listDormSemesters(
  dormId: string,
  supabaseClient?: SupabaseClient
) {
  const supabase = await resolveSupabase(supabaseClient);
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("dorm_semesters")
    .select(
      "id, dorm_id, school_year, semester, label, starts_on, ends_on, status, archived_at, created_at, updated_at"
    )
    .eq("dorm_id", dormId)
    .order("starts_on", { ascending: false });

  if (error) {
    console.error("Failed to load semesters:", error);
    return [];
  }

  return (data as DormSemester[]) ?? [];
}

export async function listDormSemesterArchives(
  dormId: string,
  supabaseClient?: SupabaseClient
) {
  const supabase = await resolveSupabase(supabaseClient);
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("dorm_semester_archives")
    .select("id, dorm_id, semester_id, label, created_at, snapshot")
    .eq("dorm_id", dormId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load semester archives:", error);
    return [];
  }

  return (data as DormSemesterArchive[]) ?? [];
}
