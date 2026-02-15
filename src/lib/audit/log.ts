import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuditEventRow = {
  id: string;
  dorm_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor: { display_name: string | null } | { display_name: string | null }[] | null;
};

type AuditEventInput = {
  supabase?: SupabaseClient;
  dormId: string;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

function normalizeJoin<T>(value: T | T[] | null): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function logAuditEvent(input: AuditEventInput) {
  const supabase = input.supabase ?? (await createSupabaseServerClient());
  if (!supabase) {
    return;
  }

  const payload = {
    dorm_id: input.dormId,
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  };

  const { error } = await supabase.from("audit_events").insert(payload);
  if (error) {
    throw new Error(error.message);
  }
}

export async function getAuditEvents(
  dormId: string,
  filters: {
    actor_user_id?: string | null;
    entity_type?: string | null;
    start?: string | null;
    end?: string | null;
  }
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  let query = supabase
    .from("audit_events")
    .select(
      "id, dorm_id, actor_user_id, action, entity_type, entity_id, metadata, created_at, actor:profiles!audit_events_actor_user_id_fkey(display_name)"
    )
    .eq("dorm_id", dormId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters.actor_user_id) {
    query = query.eq("actor_user_id", filters.actor_user_id);
  }
  if (filters.entity_type) {
    query = query.eq("entity_type", filters.entity_type);
  }
  if (filters.start) {
    query = query.gte("created_at", `${filters.start}T00:00:00.000Z`);
  }
  if (filters.end) {
    query = query.lte("created_at", `${filters.end}T23:59:59.999Z`);
  }

  const { data } = await query;
  return ((data ?? []) as AuditEventRow[]).map((row) => ({
    ...row,
    actor: normalizeJoin(row.actor),
  }));
}

export async function getAuditActors(dormId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data } = await supabase
    .from("dorm_memberships")
    .select("user_id, profile:profiles(display_name)")
    .eq("dorm_id", dormId)
    .order("created_at", { ascending: true });

  const actors = (data ?? []).map(
    (row: {
      user_id: string;
      profile: { display_name: string | null } | { display_name: string | null }[] | null;
    }) => {
      const profile = normalizeJoin(row.profile);
      return {
        user_id: row.user_id,
        display_name: profile?.display_name ?? row.user_id,
      };
    }
  );

  return [...new Map(actors.map((actor) => [actor.user_id, actor])).values()];
}
