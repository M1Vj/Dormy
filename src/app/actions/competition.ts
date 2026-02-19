"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CompetitionCategory,
  CompetitionMember,
  CompetitionScore,
  CompetitionSnapshot,
  CompetitionTeam,
  LeaderboardRow,
} from "@/lib/types/competition";
import { getEventViewerContext } from "@/app/actions/events";

const teamSchema = z.object({
  event_id: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
});

const memberSchema = z.object({
  event_id: z.string().uuid(),
  team_id: z.string().uuid(),
  occupant_id: z.string().uuid().nullable(),
  display_name: z.string().trim().max(120).nullable(),
});

const removeMemberSchema = z.object({
  event_id: z.string().uuid(),
  member_id: z.string().uuid(),
});

const categorySchema = z.object({
  event_id: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  max_points: z.number().min(0).nullable(),
  sort_order: z.number().int().min(0).default(0),
});

const updateCategorySchema = z.object({
  event_id: z.string().uuid(),
  category_id: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  max_points: z.number().min(0).nullable(),
  sort_order: z.number().int().min(0).default(0),
});

const deleteCategorySchema = z.object({
  event_id: z.string().uuid(),
  category_id: z.string().uuid(),
});

const scoreSchema = z.object({
  event_id: z.string().uuid(),
  team_id: z.string().uuid(),
  category_id: z.string().uuid().nullable(),
  points: z.number().min(0).max(100000),
});

const manualRankSchema = z.object({
  event_id: z.string().uuid(),
  team_id: z.string().uuid(),
  manual_rank_override: z.number().int().min(1).nullable(),
});

type EventRow = {
  id: string;
  title: string;
  is_competition: boolean;
  dorm_id: string;
};

type TeamRow = {
  id: string;
  event_id: string;
  name: string;
  manual_rank_override: number | null;
  created_at: string;
};

type CategoryRow = {
  id: string;
  event_id: string;
  name: string;
  max_points: number | null;
  sort_order: number;
  created_at: string;
};

type ScoreRow = {
  id: string;
  event_id: string;
  team_id: string;
  category_id: string | null;
  points: number;
  created_at: string;
  updated_at: string;
};

type MemberRow = {
  id: string;
  team_id: string;
  occupant_id: string | null;
  display_name: string | null;
  created_at: string;
  occupant:
  | { full_name: string | null; student_id: string | null }
  | { full_name: string | null; student_id: string | null }[]
  | null;
};

function normalizeJoin<T>(value: T | T[] | null): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function buildLeaderboard(
  teams: CompetitionTeam[],
  categories: CompetitionCategory[],
  scores: CompetitionScore[]
): LeaderboardRow[] {
  const categoryOrder = [...categories].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order;
    }
    return a.name.localeCompare(b.name);
  });

  const scoreMap = new Map<string, Map<string, number>>();
  for (const score of scores) {
    const teamScores = scoreMap.get(score.team_id) ?? new Map<string, number>();
    const key = score.category_id ?? "__general__";
    teamScores.set(key, (teamScores.get(key) ?? 0) + Number(score.points));
    scoreMap.set(score.team_id, teamScores);
  }

  const rows: LeaderboardRow[] = teams.map((team) => {
    const teamScores = scoreMap.get(team.id) ?? new Map<string, number>();
    const breakdown: Record<string, number> = {};
    for (const category of categoryOrder) {
      breakdown[category.id] = Number((teamScores.get(category.id) ?? 0).toFixed(2));
    }
    if (!categoryOrder.length && teamScores.has("__general__")) {
      breakdown.__general__ = Number((teamScores.get("__general__") ?? 0).toFixed(2));
    }

    const total = [...teamScores.values()].reduce((sum, value) => sum + value, 0);

    return {
      team_id: team.id,
      team_name: team.name,
      total_points: Number(total.toFixed(2)),
      category_breakdown: breakdown,
      manual_rank_override: team.manual_rank_override,
      rank: 0,
      members: team.members,
    };
  });

  rows.sort((left, right) => {
    const leftOverride =
      typeof left.manual_rank_override === "number"
        ? left.manual_rank_override
        : Number.POSITIVE_INFINITY;
    const rightOverride =
      typeof right.manual_rank_override === "number"
        ? right.manual_rank_override
        : Number.POSITIVE_INFINITY;
    if (leftOverride !== rightOverride) {
      return leftOverride - rightOverride;
    }

    if (right.total_points !== left.total_points) {
      return right.total_points - left.total_points;
    }

    for (const category of categoryOrder) {
      const l = left.category_breakdown[category.id] ?? 0;
      const r = right.category_breakdown[category.id] ?? 0;
      if (r !== l) {
        return r - l;
      }
    }

    const leftMembers = left.members.length;
    const rightMembers = right.members.length;
    if (rightMembers !== leftMembers) {
      return rightMembers - leftMembers;
    }

    return left.team_name.localeCompare(right.team_name);
  });

  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

async function requireCompetitionManager(eventId: string) {
  const context = await getEventViewerContext();
  if ("error" in context) {
    return { error: context.error } as const;
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." } as const;
  }

  let canManage = context.canManageEvents;
  let committeeId: string | null = null;

  if (!canManage && context.role !== "occupant") {
    // Check if user is committee lead for this event's committee
    const { data: event } = await supabase
      .from("events")
      .select("committee_id")
      .eq("id", eventId)
      .maybeSingle();

    if (event?.committee_id) {
      const { data: membership } = await supabase
        .from("committee_members")
        .select("role")
        .eq("committee_id", event.committee_id)
        .eq("user_id", context.userId)
        .maybeSingle();

      if (membership && ["head", "co-head"].includes(membership.role)) {
        canManage = true;
        committeeId = event.committee_id;
      }
    }
  }

  if (!canManage) {
    return { error: "You do not have permission to manage competition data." } as const;
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, title, is_competition, dorm_id")
    .eq("id", eventId)
    .eq("dorm_id", context.dormId)
    .maybeSingle();

  if (!event) {
    return { error: "Event not found." } as const;
  }

  return {
    context,
    event: event as EventRow,
    supabase,
    committeeId,
  } as const;
}

export async function getCompetitionSnapshot(
  dormId: string,
  eventId: string
): Promise<CompetitionSnapshot | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, title, is_competition, dorm_id")
    .eq("id", eventId)
    .eq("dorm_id", dormId)
    .maybeSingle();

  if (!event) {
    return null;
  }

  const [{ data: teamsData, error: teamError }, { data: categoriesData, error: categoryError }, { data: scoresData, error: scoreError }] =
    await Promise.all([
      supabase
        .from("event_teams")
        .select("id, event_id, name, manual_rank_override, created_at")
        .eq("event_id", eventId)
        .eq("dorm_id", dormId)
        .order("created_at", { ascending: true }),
      supabase
        .from("event_score_categories")
        .select("id, event_id, name, max_points, sort_order, created_at")
        .eq("event_id", eventId)
        .eq("dorm_id", dormId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("event_scores")
        .select("id, event_id, team_id, category_id, points, created_at, updated_at")
        .eq("event_id", eventId)
        .eq("dorm_id", dormId),
    ]);

  if (teamError || categoryError || scoreError) {
    throw new Error(
      teamError?.message || categoryError?.message || scoreError?.message || "Failed to load competition data."
    );
  }

  const teams = (teamsData ?? []) as TeamRow[];
  const categories = (categoriesData ?? []) as CategoryRow[];
  const scores = ((scoresData ?? []) as ScoreRow[]).map((row) => ({
    ...row,
    points: Number(row.points),
  }));

  const memberRows = teams.length
    ? (
      await supabase
        .from("event_team_members")
        .select("id, team_id, occupant_id, display_name, created_at, occupant:occupants(full_name, student_id)")
        .eq("dorm_id", dormId)
        .in(
          "team_id",
          teams.map((team) => team.id)
        )
        .order("created_at", { ascending: true })
    ).data ?? []
    : [];

  const membersByTeam = new Map<string, CompetitionMember[]>();
  for (const row of memberRows as MemberRow[]) {
    const occupant = normalizeJoin(row.occupant);
    const member: CompetitionMember = {
      id: row.id,
      team_id: row.team_id,
      occupant_id: row.occupant_id,
      display_name: row.display_name,
      created_at: row.created_at,
      occupant_name: occupant?.full_name ?? null,
      occupant_student_id: occupant?.student_id ?? null,
    };
    const current = membersByTeam.get(row.team_id) ?? [];
    current.push(member);
    membersByTeam.set(row.team_id, current);
  }

  const mappedTeams: CompetitionTeam[] = teams.map((team) => ({
    id: team.id,
    event_id: team.event_id,
    name: team.name,
    manual_rank_override: team.manual_rank_override,
    created_at: team.created_at,
    members: membersByTeam.get(team.id) ?? [],
  }));

  const mappedCategories: CompetitionCategory[] = categories.map((category) => ({
    id: category.id,
    event_id: category.event_id,
    name: category.name,
    max_points: category.max_points == null ? null : Number(category.max_points),
    sort_order: category.sort_order,
    created_at: category.created_at,
  }));

  const leaderboard = buildLeaderboard(mappedTeams, mappedCategories, scores);

  return {
    event: {
      id: event.id,
      title: event.title,
      is_competition: event.is_competition,
    },
    teams: mappedTeams,
    categories: mappedCategories,
    scores,
    leaderboard,
  };
}

export async function getCompetitionOccupantOptions(dormId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("occupants")
    .select("id, full_name, student_id")
    .eq("dorm_id", dormId)
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (error) {
    return [];
  }

  return data ?? [];
}

export async function createCompetitionTeam(formData: FormData) {
  const parsed = teamSchema.safeParse({
    event_id: formData.get("event_id"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid team data." };
  }

  const manager = await requireCompetitionManager(parsed.data.event_id);
  if ("error" in manager) {
    return { error: manager.error };
  }
  if (!manager.event.is_competition) {
    return { error: "Enable competition mode before adding teams." };
  }

  const { error } = await manager.supabase.from("event_teams").insert({
    dorm_id: manager.context.dormId,
    event_id: parsed.data.event_id,
    name: parsed.data.name,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/events/${parsed.data.event_id}`);
  revalidatePath(`/events/${parsed.data.event_id}/competition`);
  return { success: true };
}

export async function deleteCompetitionTeam(formData: FormData) {
  const eventId = String(formData.get("event_id") ?? "").trim();
  const teamId = String(formData.get("team_id") ?? "").trim();
  if (!eventId || !teamId) {
    return { error: "Team reference is incomplete." };
  }

  const manager = await requireCompetitionManager(eventId);
  if ("error" in manager) {
    return { error: manager.error };
  }

  const { error } = await manager.supabase
    .from("event_teams")
    .delete()
    .eq("id", teamId)
    .eq("event_id", eventId)
    .eq("dorm_id", manager.context.dormId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/competition`);
  return { success: true };
}

export async function addCompetitionMember(formData: FormData) {
  const occupantRaw = String(formData.get("occupant_id") ?? "").trim();
  const displayNameRaw = String(formData.get("display_name") ?? "").trim();

  const parsed = memberSchema.safeParse({
    event_id: formData.get("event_id"),
    team_id: formData.get("team_id"),
    occupant_id: occupantRaw || null,
    display_name: displayNameRaw || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid member data." };
  }

  if (!parsed.data.occupant_id && !parsed.data.display_name) {
    return { error: "Select an occupant or provide an external display name." };
  }

  const manager = await requireCompetitionManager(parsed.data.event_id);
  if ("error" in manager) {
    return { error: manager.error };
  }

  const payload: {
    dorm_id: string;
    team_id: string;
    occupant_id?: string;
    display_name?: string;
  } = {
    dorm_id: manager.context.dormId,
    team_id: parsed.data.team_id,
  };

  if (parsed.data.occupant_id) {
    payload.occupant_id = parsed.data.occupant_id;
  } else if (parsed.data.display_name) {
    payload.display_name = parsed.data.display_name;
  }

  const { error } = await manager.supabase.from("event_team_members").insert(payload);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/events/${parsed.data.event_id}/competition`);
  return { success: true };
}

export async function removeCompetitionMember(formData: FormData) {
  const parsed = removeMemberSchema.safeParse({
    event_id: formData.get("event_id"),
    member_id: formData.get("member_id"),
  });
  if (!parsed.success) {
    return { error: "Invalid member reference." };
  }

  const manager = await requireCompetitionManager(parsed.data.event_id);
  if ("error" in manager) {
    return { error: manager.error };
  }

  const { error } = await manager.supabase
    .from("event_team_members")
    .delete()
    .eq("id", parsed.data.member_id)
    .eq("dorm_id", manager.context.dormId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/events/${parsed.data.event_id}/competition`);
  return { success: true };
}

export async function createCompetitionCategory(formData: FormData) {
  const maxPointsRaw = String(formData.get("max_points") ?? "").trim();
  const sortOrderRaw = String(formData.get("sort_order") ?? "").trim();

  const parsed = categorySchema.safeParse({
    event_id: formData.get("event_id"),
    name: formData.get("name"),
    max_points: maxPointsRaw ? Number(maxPointsRaw) : null,
    sort_order: sortOrderRaw ? Number(sortOrderRaw) : 0,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid category data." };
  }

  const manager = await requireCompetitionManager(parsed.data.event_id);
  if ("error" in manager) {
    return { error: manager.error };
  }

  const { error } = await manager.supabase.from("event_score_categories").insert({
    dorm_id: manager.context.dormId,
    event_id: parsed.data.event_id,
    name: parsed.data.name,
    max_points: parsed.data.max_points,
    sort_order: parsed.data.sort_order,
  });

  if (error) {
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      dormId: manager.context.dormId,
      actorUserId: manager.context.userId,
      action: "competition.category_created",
      entityType: "event_score_category",
      metadata: {
        event_id: parsed.data.event_id,
        name: parsed.data.name,
        max_points: parsed.data.max_points,
        sort_order: parsed.data.sort_order,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for category creation:", auditError);
  }

  revalidatePath(`/events/${parsed.data.event_id}/competition`);
  revalidatePath(`/events/${parsed.data.event_id}/competition/print`);
  return { success: true };
}

export async function updateCompetitionCategory(formData: FormData) {
  const maxPointsRaw = String(formData.get("max_points") ?? "").trim();
  const sortOrderRaw = String(formData.get("sort_order") ?? "").trim();

  const parsed = updateCategorySchema.safeParse({
    event_id: formData.get("event_id"),
    category_id: formData.get("category_id"),
    name: formData.get("name"),
    max_points: maxPointsRaw ? Number(maxPointsRaw) : null,
    sort_order: sortOrderRaw ? Number(sortOrderRaw) : 0,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid category update." };
  }

  const manager = await requireCompetitionManager(parsed.data.event_id);
  if ("error" in manager) {
    return { error: manager.error };
  }

  const { error } = await manager.supabase
    .from("event_score_categories")
    .update({
      name: parsed.data.name,
      max_points: parsed.data.max_points,
      sort_order: parsed.data.sort_order,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.category_id)
    .eq("event_id", parsed.data.event_id)
    .eq("dorm_id", manager.context.dormId);

  if (error) {
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      dormId: manager.context.dormId,
      actorUserId: manager.context.userId,
      action: "competition.category_updated",
      entityType: "event_score_category",
      entityId: parsed.data.category_id,
      metadata: {
        event_id: parsed.data.event_id,
        name: parsed.data.name,
        max_points: parsed.data.max_points,
        sort_order: parsed.data.sort_order,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for category update:", auditError);
  }

  revalidatePath(`/events/${parsed.data.event_id}/competition`);
  revalidatePath(`/events/${parsed.data.event_id}/competition/print`);
  return { success: true };
}

export async function deleteCompetitionCategory(formData: FormData) {
  const parsed = deleteCategorySchema.safeParse({
    event_id: formData.get("event_id"),
    category_id: formData.get("category_id"),
  });
  if (!parsed.success) {
    return { error: "Invalid category reference." };
  }

  const manager = await requireCompetitionManager(parsed.data.event_id);
  if ("error" in manager) {
    return { error: manager.error };
  }

  const { error } = await manager.supabase
    .from("event_score_categories")
    .delete()
    .eq("id", parsed.data.category_id)
    .eq("event_id", parsed.data.event_id)
    .eq("dorm_id", manager.context.dormId);

  if (error) {
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      dormId: manager.context.dormId,
      actorUserId: manager.context.userId,
      action: "competition.category_deleted",
      entityType: "event_score_category",
      entityId: parsed.data.category_id,
      metadata: {
        event_id: parsed.data.event_id,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for category delete:", auditError);
  }

  revalidatePath(`/events/${parsed.data.event_id}/competition`);
  revalidatePath(`/events/${parsed.data.event_id}/competition/print`);
  return { success: true };
}

export async function upsertCompetitionScore(formData: FormData) {
  const pointsRaw = String(formData.get("points") ?? "").trim();
  const categoryRaw = String(formData.get("category_id") ?? "").trim();
  const parsed = scoreSchema.safeParse({
    event_id: formData.get("event_id"),
    team_id: formData.get("team_id"),
    category_id: categoryRaw || null,
    points: Number(pointsRaw),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid score value." };
  }

  const manager = await requireCompetitionManager(parsed.data.event_id);
  if ("error" in manager) {
    return { error: manager.error };
  }

  let query = manager.supabase
    .from("event_scores")
    .select("id")
    .eq("event_id", parsed.data.event_id)
    .eq("team_id", parsed.data.team_id)
    .eq("dorm_id", manager.context.dormId);

  query = parsed.data.category_id
    ? query.eq("category_id", parsed.data.category_id)
    : query.is("category_id", null);

  const { data: existing, error: existingError } = await query.maybeSingle();
  if (existingError) {
    return { error: existingError.message };
  }

  if (existing?.id) {
    const { error: updateError } = await manager.supabase
      .from("event_scores")
      .update({
        points: parsed.data.points,
        updated_at: new Date().toISOString(),
        recorded_by: manager.context.userId,
      })
      .eq("id", existing.id)
      .eq("dorm_id", manager.context.dormId);

    if (updateError) {
      return { error: updateError.message };
    }
  } else {
    const { error: insertError } = await manager.supabase.from("event_scores").insert({
      dorm_id: manager.context.dormId,
      event_id: parsed.data.event_id,
      team_id: parsed.data.team_id,
      category_id: parsed.data.category_id,
      points: parsed.data.points,
      recorded_by: manager.context.userId,
    });

    if (insertError) {
      return { error: insertError.message };
    }
  }

  try {
    await logAuditEvent({
      dormId: manager.context.dormId,
      actorUserId: manager.context.userId,
      action: existing?.id ? "competition.score_updated" : "competition.score_created",
      entityType: "event_score",
      entityId: existing?.id ?? null,
      metadata: {
        event_id: parsed.data.event_id,
        team_id: parsed.data.team_id,
        category_id: parsed.data.category_id,
        points: parsed.data.points,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for score upsert:", auditError);
  }

  revalidatePath(`/events/${parsed.data.event_id}/competition`);
  revalidatePath(`/events/${parsed.data.event_id}/competition/print`);
  return { success: true };
}

export async function setCompetitionManualRank(formData: FormData) {
  const rankRaw = String(formData.get("manual_rank_override") ?? "").trim();
  const parsed = manualRankSchema.safeParse({
    event_id: formData.get("event_id"),
    team_id: formData.get("team_id"),
    manual_rank_override: rankRaw ? Number(rankRaw) : null,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid manual rank value." };
  }

  const manager = await requireCompetitionManager(parsed.data.event_id);
  if ("error" in manager) {
    return { error: manager.error };
  }

  const { error } = await manager.supabase
    .from("event_teams")
    .update({
      manual_rank_override: parsed.data.manual_rank_override,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.team_id)
    .eq("event_id", parsed.data.event_id)
    .eq("dorm_id", manager.context.dormId);

  if (error) {
    return { error: error.message };
  }

  try {
    await logAuditEvent({
      dormId: manager.context.dormId,
      actorUserId: manager.context.userId,
      action: "competition.manual_rank_set",
      entityType: "event_team",
      entityId: parsed.data.team_id,
      metadata: {
        event_id: parsed.data.event_id,
        manual_rank_override: parsed.data.manual_rank_override,
      },
    });
  } catch (auditError) {
    console.error("Failed to write audit event for manual rank update:", auditError);
  }

  revalidatePath(`/events/${parsed.data.event_id}/competition`);
  revalidatePath(`/events/${parsed.data.event_id}/competition/print`);
  return { success: true };
}
