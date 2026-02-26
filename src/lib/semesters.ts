import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DormSemester = {
  id: string;
  dorm_id: string | null;
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
  dormId: string | null,
  supabaseClient?: SupabaseClient
) {
  const supabase = await resolveSupabase(supabaseClient);
  if (!supabase) {
    return { error: "Supabase not configured." } as const;
  }

  const { data, error } = await supabase.rpc("ensure_active_semester", {
    p_dorm_id: dormId,
  });

  if (error) return { error: error.message } as const;
  return { semesterId: data as string } as const;
}

export async function getActiveSemester(
  dormId: string | null,
  supabaseClient?: SupabaseClient
) {
  const supabase = await resolveSupabase(supabaseClient);
  if (!supabase) return null;

  const today = new Date().toISOString().split("T")[0];

  const baseQuery = () =>
    supabase
      .from("dorm_semesters")
      .select("id, dorm_id, school_year, semester, label, starts_on, ends_on, status, archived_at, created_at, updated_at")
      .eq("status", "active")
      .lte("starts_on", today)
      .gte("ends_on", today)
      .order("starts_on", { ascending: false });

  if (dormId) {
    // Try dorm-specific first
    const { data } = await baseQuery().eq("dorm_id", dormId).maybeSingle();
    if (data) return data as DormSemester;
  }

  // Fallback to global
  const { data: globalData } = await baseQuery().is("dorm_id", null).maybeSingle();
  return (globalData as DormSemester) ?? null;
}

export async function listDormSemesters(
  dormId: string | null,
  supabaseClient?: SupabaseClient
) {
  const supabase = await resolveSupabase(supabaseClient);
  if (!supabase) return [];

  let query = supabase
    .from("dorm_semesters")
    .select("id, dorm_id, school_year, semester, label, starts_on, ends_on, status, archived_at, created_at, updated_at");

  if (dormId) {
    query = query.or(`dorm_id.eq.${dormId},dorm_id.is.null`);
  } else {
    query = query.is("dorm_id", null);
  }

  const { data, error } = await query.order("starts_on", { ascending: false });
  if (error || !data) return [];

  const rawSemesters = data as DormSemester[];
  const uniqueLabels = new Set<string>();
  const mergedSemesters: DormSemester[] = [];

  // Because the query orders by starts_on, we just need to ensure dorm-specific 
  // variants are prioritized over global ones when they have the exact same label.
  // We can do this by splitting them, then iterating through the local ones first.
  const localSems = rawSemesters.filter((s) => s.dorm_id !== null);
  const globalSems = rawSemesters.filter((s) => s.dorm_id === null);

  for (const s of localSems) {
    if (!uniqueLabels.has(s.label)) {
      uniqueLabels.add(s.label);
      mergedSemesters.push(s);
    }
  }

  for (const s of globalSems) {
    if (!uniqueLabels.has(s.label)) {
      uniqueLabels.add(s.label);
      mergedSemesters.push(s);
    }
  }

  // Restore the original date-based descending sorting
  return mergedSemesters.sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1));
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
