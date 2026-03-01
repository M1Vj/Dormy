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

  // Semesters are institution-wide (global). We always resolve from dorm_id = NULL.
  // Dorm-specific rows are legacy and should not exist; global always wins.
  const { data } = await supabase
    .from("dorm_semesters")
    .select("id, dorm_id, school_year, semester, label, starts_on, ends_on, status, archived_at, created_at, updated_at")
    .is("dorm_id", null)
    .eq("status", "active")
    .lte("starts_on", today)
    .gte("ends_on", today)
    .order("starts_on", { ascending: false })
    .maybeSingle();

  return (data as DormSemester) ?? null;
}

export async function listDormSemesters(
  dormId: string | null,
  supabaseClient?: SupabaseClient
) {
  const supabase = await resolveSupabase(supabaseClient);
  if (!supabase) return [];

  // Semesters are global — always show only dorm_id = NULL rows.
  const { data, error } = await supabase
    .from("dorm_semesters")
    .select("id, dorm_id, school_year, semester, label, starts_on, ends_on, status, archived_at, created_at, updated_at")
    .is("dorm_id", null)
    .order("starts_on", { ascending: false });

  if (error || !data) return [];
  return data as DormSemester[];
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
