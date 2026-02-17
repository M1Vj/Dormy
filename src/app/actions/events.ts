"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logAuditEvent } from "@/lib/audit/log";
import { getActiveDormId } from "@/lib/dorms";
import { optimizeImage } from "@/lib/images";
import { ensureActiveSemesterId } from "@/lib/semesters";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DormRole,
  EventDetail,
  EventDormOption,
  EventRating,
  EventSummary,
  EventViewerContext,
} from "@/lib/types/events";

const EVENT_MANAGER_ROLES = new Set<DormRole>(["admin", "officer"]);
const VALID_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

const eventInputSchema = z.object({
  title: z.string().trim().min(2, "Title is required.").max(120),
  description: z.string().trim().max(5000).nullable(),
  location: z.string().trim().max(250).nullable(),
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  is_competition: z.boolean(),
  participating_dorm_ids: z.array(z.string().uuid()).default([]),
});

type MembershipRow = {
  dorm_id: string;
  role: DormRole;
};

type EventRow = {
  id: string;
  dorm_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_competition: boolean;
  created_at: string;
};

type EventRatingRow = {
  id: string;
  event_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  occupant_id: string;
  occupant:
  | {
    full_name: string | null;
    student_id: string | null;
  }
  | {
    full_name: string | null;
    student_id: string | null;
  }[]
  | null;
};

type EventPhotoRow = {
  id: string;
  event_id: string;
  storage_path: string;
  created_at: string;
};

type ParticipatingDormRow = {
  dorm:
  | {
    id: string;
    name: string;
    slug: string;
  }
  | {
    id: string;
    name: string;
    slug: string;
  }[]
  | null;
};

function normalizeFromJoin<T>(value: T | T[] | null): T | null {
  if (!value) {
    return null;
  }
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapRatingRow(row: EventRatingRow): EventRating {
  const occupant = normalizeFromJoin(row.occupant);
  return {
    id: row.id,
    event_id: row.event_id,
    rating: Number(row.rating),
    comment: row.comment,
    created_at: row.created_at,
    occupant_id: row.occupant_id,
    occupant_name: occupant?.full_name ?? null,
    occupant_student_id: occupant?.student_id ?? null,
  };
}

function withSummaries(
  events: EventRow[],
  ratings: EventRating[],
  photos: EventPhotoRow[]
): EventSummary[] {
  const ratingMap = new Map<string, { total: number; count: number }>();
  for (const rating of ratings) {
    const current = ratingMap.get(rating.event_id) ?? { total: 0, count: 0 };
    current.total += rating.rating;
    current.count += 1;
    ratingMap.set(rating.event_id, current);
  }

  const photoCountMap = new Map<string, number>();
  for (const photo of photos) {
    photoCountMap.set(
      photo.event_id,
      (photoCountMap.get(photo.event_id) ?? 0) + 1
    );
  }

  return events.map((event) => {
    const summary = ratingMap.get(event.id);
    const average =
      summary && summary.count > 0
        ? Number((summary.total / summary.count).toFixed(2))
        : null;

    return {
      ...event,
      rating_count: summary?.count ?? 0,
      average_rating: average,
      photo_count: photoCountMap.get(event.id) ?? 0,
    };
  });
}

function parseDateInput(value: FormDataEntryValue | null) {
  if (!value) {
    return null;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    return "INVALID_DATE";
  }
  return parsed.toISOString();
}

function parseEventInput(formData: FormData) {
  const startsAt = parseDateInput(formData.get("starts_at"));
  const endsAt = parseDateInput(formData.get("ends_at"));

  if (startsAt === "INVALID_DATE" || endsAt === "INVALID_DATE") {
    return { error: "Provide valid date and time values." } as const;
  }

  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
    return { error: "Event end time cannot be earlier than start time." } as const;
  }

  const parsed = eventInputSchema.safeParse({
    title: formData.get("title"),
    description: String(formData.get("description") ?? "").trim() || null,
    location: String(formData.get("location") ?? "").trim() || null,
    starts_at: startsAt,
    ends_at: endsAt,
    is_competition: formData.get("is_competition") === "on",
    participating_dorm_ids: formData
      .getAll("participating_dorm_ids")
      .map((value) => String(value)),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid event data." } as const;
  }

  return { data: parsed.data } as const;
}

async function safeLogEventAudit(input: {
  dormId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await logAuditEvent({
      dormId: input.dormId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.error(`Failed to write audit event for ${input.action}:`, error);
  }
}

async function requireManagerContext() {
  const context = await getEventViewerContext();
  if ("error" in context) {
    return { error: context.error } as const;
  }
  if (!context.canManageEvents) {
    return { error: "You do not have permission to manage events." } as const;
  }
  return { context } as const;
}

async function getViewerOccupantId(dormId: string, userId: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." } as const;
  }

  const { data: occupant, error } = await supabase
    .from("occupants")
    .select("id")
    .eq("dorm_id", dormId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { error: error.message } as const;
  }

  return { occupantId: occupant?.id ?? null } as const;
}

async function syncParticipatingDorms(
  eventId: string,
  hostDormId: string,
  dormIds: string[]
) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." } as const;
  }

  const normalizedIds = [...new Set(dormIds.filter((id) => id !== hostDormId))];

  const { error: deleteError } = await supabase
    .from("event_participating_dorms")
    .delete()
    .eq("event_id", eventId);

  if (deleteError && deleteError.code !== "42P01") {
    return { error: deleteError.message } as const;
  }

  if (!normalizedIds.length) {
    return { success: true } as const;
  }

  const { error: insertError } = await supabase
    .from("event_participating_dorms")
    .insert(
      normalizedIds.map((dormId) => ({
        event_id: eventId,
        dorm_id: dormId,
      }))
    );

  if (insertError) {
    if (insertError.code === "42P01") {
      return {
        error:
          "Database migration for event participants is missing. Run migrations and retry.",
      } as const;
    }
    return { error: insertError.message } as const;
  }

  return { success: true } as const;
}

export async function getEventViewerContext(
  preferredDormId?: string
): Promise<EventViewerContext | { error: string }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("dorm_memberships")
    .select("dorm_id, role")
    .eq("user_id", user.id);

  if (membershipError || !memberships?.length) {
    return { error: "No dorm membership found for this account." };
  }

  const requestedDormId = preferredDormId ?? (await getActiveDormId());
  const membership =
    (memberships as MembershipRow[]).find(
      (item) => item.dorm_id === requestedDormId
    ) ?? (memberships as MembershipRow[])[0];

  return {
    userId: user.id,
    dormId: membership.dorm_id,
    role: membership.role,
    canManageEvents: EVENT_MANAGER_ROLES.has(membership.role),
  };
}

export async function getEventDormOptions(): Promise<EventDormOption[]> {
  const context = await getEventViewerContext();
  if ("error" in context) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("dorm_memberships")
    .select("dorm:dorms(id, name, slug)")
    .eq("user_id", context.userId);

  if (error) {
    return [];
  }

  const options: EventDormOption[] = [];
  for (const row of data ?? []) {
    const dorm = normalizeFromJoin(
      (row as { dorm: ParticipatingDormRow["dorm"] }).dorm
    );
    if (!dorm) {
      continue;
    }
    options.push({
      id: dorm.id,
      name: dorm.name,
      slug: dorm.slug,
    });
  }

  return [...new Map(options.map((option) => [option.id, option])).values()];
}

export async function getEventsOverview(dormId: string): Promise<EventSummary[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    throw new Error(semesterResult.error ?? "Failed to resolve active semester.");
  }

  const { data: eventRows, error: eventsError } = await supabase
    .from("events")
    .select(
      "id, dorm_id, title, description, location, starts_at, ends_at, is_competition, created_at"
    )
    .eq("dorm_id", dormId)
    .eq("semester_id", semesterResult.semesterId)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (eventsError) {
    throw new Error(eventsError.message);
  }

  const events = (eventRows ?? []) as EventRow[];
  if (!events.length) {
    return [];
  }

  const eventIds = events.map((event) => event.id);

  const [{ data: ratingRows, error: ratingsError }, { data: photoRows, error: photosError }] =
    await Promise.all([
      supabase
        .from("event_ratings")
        .select(
          "id, event_id, rating, comment, created_at, occupant_id, occupant:occupants(full_name, student_id)"
        )
        .eq("dorm_id", dormId)
        .in("event_id", eventIds),
      supabase
        .from("event_photos")
        .select("id, event_id, storage_path, created_at")
        .eq("dorm_id", dormId)
        .in("event_id", eventIds),
    ]);

  if (ratingsError) {
    throw new Error(ratingsError.message);
  }

  if (photosError) {
    throw new Error(photosError.message);
  }

  const ratings = ((ratingRows ?? []) as EventRatingRow[]).map(mapRatingRow);
  const photos = (photoRows ?? []) as EventPhotoRow[];

  return withSummaries(events, ratings, photos);
}

export async function getEventDetail(
  dormId: string,
  eventId: string,
  viewerUserId?: string
): Promise<EventDetail | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const semesterResult = await ensureActiveSemesterId(dormId, supabase);
  if ("error" in semesterResult) {
    throw new Error(semesterResult.error ?? "Failed to resolve active semester.");
  }

  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select(
      "id, dorm_id, title, description, location, starts_at, ends_at, is_competition, created_at"
    )
    .eq("dorm_id", dormId)
    .eq("semester_id", semesterResult.semesterId)
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    throw new Error(eventError.message);
  }

  if (!eventRow) {
    return null;
  }

  const [
    { data: ratingRows, error: ratingsError },
    { data: photoRows, error: photosError },
    { data: participatingDormRows, error: participatingDormsError },
  ] = await Promise.all([
    supabase
      .from("event_ratings")
      .select(
        "id, event_id, rating, comment, created_at, occupant_id, occupant:occupants(full_name, student_id)"
      )
      .eq("dorm_id", dormId)
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
    supabase
      .from("event_photos")
      .select("id, event_id, storage_path, created_at")
      .eq("dorm_id", dormId)
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
    supabase
      .from("event_participating_dorms")
      .select("dorm:dorms(id, name, slug)")
      .eq("event_id", eventId),
  ]);

  if (ratingsError) {
    throw new Error(ratingsError.message);
  }

  if (photosError) {
    throw new Error(photosError.message);
  }

  if (participatingDormsError && participatingDormsError.code !== "42P01") {
    throw new Error(participatingDormsError.message);
  }

  const ratings = ((ratingRows ?? []) as EventRatingRow[]).map(mapRatingRow);
  const photos = (photoRows ?? []) as EventPhotoRow[];
  const [summary] = withSummaries([eventRow as EventRow], ratings, photos);
  let viewerRating: EventRating | null = null;
  let viewerCanRate = false;

  if (viewerUserId) {
    const { data: viewerOccupant } = await supabase
      .from("occupants")
      .select("id")
      .eq("dorm_id", dormId)
      .eq("user_id", viewerUserId)
      .maybeSingle();

    if (viewerOccupant?.id) {
      viewerCanRate = true;
      viewerRating =
        ratings.find((rating) => rating.occupant_id === viewerOccupant.id) ?? null;
    }
  }

  const participatingDorms: EventDormOption[] = (participatingDormRows ?? [])
    .map(
      (row) =>
        normalizeFromJoin((row as { dorm: ParticipatingDormRow["dorm"] }).dorm)
    )
    .filter((row): row is EventDormOption => Boolean(row))
    .map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
    }));

  return {
    ...summary,
    ratings,
    photos: photos.map((photo) => ({
      ...photo,
      url: supabase.storage.from("event-photos").getPublicUrl(photo.storage_path)
        .data.publicUrl,
    })),
    participating_dorms: participatingDorms,
    viewer_rating: viewerRating,
    viewer_can_rate: viewerCanRate,
  };
}

export async function createEvent(formData: FormData) {
  const manager = await requireManagerContext();
  if ("error" in manager) {
    return { error: manager.error };
  }

  const parsed = parseEventInput(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." };
  }

  const semesterResult = await ensureActiveSemesterId(manager.context.dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      dorm_id: manager.context.dormId,
      semester_id: semesterResult.semesterId,
      title: parsed.data.title,
      description: parsed.data.description,
      location: parsed.data.location,
      starts_at: parsed.data.starts_at,
      ends_at: parsed.data.ends_at,
      is_competition: parsed.data.is_competition,
      created_by: manager.context.userId,
    })
    .select("id")
    .single();

  if (error || !event) {
    return { error: error?.message ?? "Failed to create event." };
  }

  const participatingDormResult = await syncParticipatingDorms(
    event.id,
    manager.context.dormId,
    parsed.data.participating_dorm_ids
  );
  if ("error" in participatingDormResult) {
    return { error: participatingDormResult.error };
  }

  revalidatePath("/events");
  revalidatePath(`/events/${event.id}`);
  revalidatePath("/admin/finance/events");

  await safeLogEventAudit({
    dormId: manager.context.dormId,
    actorUserId: manager.context.userId,
    action: "events.created",
    entityType: "event",
    entityId: event.id,
    metadata: {
      title: parsed.data.title,
      starts_at: parsed.data.starts_at,
      ends_at: parsed.data.ends_at,
      location: parsed.data.location,
      is_competition: parsed.data.is_competition,
      participating_dorm_count: parsed.data.participating_dorm_ids.length,
    },
  });

  return { success: true, eventId: event.id };
}

export async function updateEvent(formData: FormData) {
  const manager = await requireManagerContext();
  if ("error" in manager) {
    return { error: manager.error };
  }

  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!eventId) {
    return { error: "Event ID is required." };
  }

  const parsed = parseEventInput(formData);
  if ("error" in parsed) {
    return { error: parsed.error };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." };
  }

  const semesterResult = await ensureActiveSemesterId(manager.context.dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  const { data: existingEvent } = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, location, description, is_competition")
    .eq("id", eventId)
    .eq("dorm_id", manager.context.dormId)
    .eq("semester_id", semesterResult.semesterId)
    .maybeSingle();

  if (!existingEvent) {
    return { error: "Event not found." };
  }

  const { error } = await supabase
    .from("events")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      location: parsed.data.location,
      starts_at: parsed.data.starts_at,
      ends_at: parsed.data.ends_at,
      is_competition: parsed.data.is_competition,
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId)
    .eq("dorm_id", manager.context.dormId);

  if (error) {
    return { error: error.message };
  }

  const participatingDormResult = await syncParticipatingDorms(
    eventId,
    manager.context.dormId,
    parsed.data.participating_dorm_ids
  );
  if ("error" in participatingDormResult) {
    return { error: participatingDormResult.error };
  }

  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/admin/finance/events");

  const changedFields = [
    existingEvent.title !== parsed.data.title ? "title" : null,
    existingEvent.description !== parsed.data.description ? "description" : null,
    existingEvent.location !== parsed.data.location ? "location" : null,
    existingEvent.starts_at !== parsed.data.starts_at ? "starts_at" : null,
    existingEvent.ends_at !== parsed.data.ends_at ? "ends_at" : null,
    existingEvent.is_competition !== parsed.data.is_competition ? "is_competition" : null,
  ].filter((field): field is string => Boolean(field));

  await safeLogEventAudit({
    dormId: manager.context.dormId,
    actorUserId: manager.context.userId,
    action: "events.updated",
    entityType: "event",
    entityId: eventId,
    metadata: {
      changed_fields: changedFields,
      participating_dorm_count: parsed.data.participating_dorm_ids.length,
    },
  });

  return { success: true };
}

export async function deleteEvent(formData: FormData) {
  const manager = await requireManagerContext();
  if ("error" in manager) {
    return { error: manager.error };
  }

  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!eventId) {
    return { error: "Event ID is required." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." };
  }

  const semesterResult = await ensureActiveSemesterId(manager.context.dormId, supabase);
  if ("error" in semesterResult) {
    return { error: semesterResult.error ?? "Failed to resolve active semester." };
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, title, is_competition")
    .eq("id", eventId)
    .eq("dorm_id", manager.context.dormId)
    .eq("semester_id", semesterResult.semesterId)
    .maybeSingle();

  if (!event) {
    return { error: "Event not found." };
  }

  const { data: photos } = await supabase
    .from("event_photos")
    .select("storage_path")
    .eq("event_id", eventId)
    .eq("dorm_id", manager.context.dormId);

  if (photos?.length) {
    await supabase.storage
      .from("event-photos")
      .remove(photos.map((photo) => photo.storage_path));
  }

  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("dorm_id", manager.context.dormId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/admin/finance/events");

  await safeLogEventAudit({
    dormId: manager.context.dormId,
    actorUserId: manager.context.userId,
    action: "events.deleted",
    entityType: "event",
    entityId: eventId,
    metadata: {
      title: event.title,
      is_competition: event.is_competition,
      deleted_photo_count: photos?.length ?? 0,
    },
  });

  return { success: true };
}

export async function upsertEventRating(formData: FormData) {
  const context = await getEventViewerContext();
  if ("error" in context) {
    return { error: context.error };
  }

  const eventId = String(formData.get("event_id") ?? "").trim();
  const ratingValue = Number(formData.get("rating"));
  const comment = String(formData.get("comment") ?? "").trim();

  if (!eventId) {
    return { error: "Event ID is required." };
  }

  if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
    return { error: "Select a rating between 1 and 5." };
  }

  if (comment.length > 1500) {
    return { error: "Comment is too long." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." };
  }

  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("dorm_id", context.dormId)
    .maybeSingle();

  if (!event) {
    return { error: "Event not found." };
  }

  const occupantResult = await getViewerOccupantId(context.dormId, context.userId);
  if ("error" in occupantResult) {
    return { error: occupantResult.error };
  }
  if (!occupantResult.occupantId) {
    return {
      error:
        "Your account is not linked to an occupant profile. Contact staff for account mapping.",
    };
  }

  const { data: upsertedRating, error } = await supabase
    .from("event_ratings")
    .upsert(
      {
        dorm_id: context.dormId,
        event_id: eventId,
        occupant_id: occupantResult.occupantId,
        rating: ratingValue,
        comment: comment || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "event_id,occupant_id",
      }
    )
    .select("id")
    .single();

  if (error || !upsertedRating) {
    return { error: error?.message ?? "Failed to submit rating." };
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");

  await safeLogEventAudit({
    dormId: context.dormId,
    actorUserId: context.userId,
    action: "events.rating_upserted",
    entityType: "event_rating",
    entityId: upsertedRating.id,
    metadata: {
      event_id: eventId,
      occupant_id: occupantResult.occupantId,
      rating: ratingValue,
      has_comment: Boolean(comment),
    },
  });

  return { success: true };
}

export async function deleteEventRating(formData: FormData) {
  const context = await getEventViewerContext();
  if ("error" in context) {
    return { error: context.error };
  }

  const eventId = String(formData.get("event_id") ?? "").trim();
  const ratingId = String(formData.get("rating_id") ?? "").trim();
  if (!eventId || !ratingId) {
    return { error: "Rating reference is incomplete." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." };
  }

  const { data: rating } = await supabase
    .from("event_ratings")
    .select("id, dorm_id, event_id, occupant_id")
    .eq("id", ratingId)
    .eq("event_id", eventId)
    .eq("dorm_id", context.dormId)
    .maybeSingle();

  if (!rating) {
    return { error: "Rating not found." };
  }

  if (!context.canManageEvents) {
    const occupantResult = await getViewerOccupantId(context.dormId, context.userId);
    if ("error" in occupantResult) {
      return { error: occupantResult.error };
    }
    if (!occupantResult.occupantId || occupantResult.occupantId !== rating.occupant_id) {
      return { error: "You can only remove your own rating." };
    }
  }

  const { error } = await supabase
    .from("event_ratings")
    .delete()
    .eq("id", ratingId)
    .eq("event_id", eventId)
    .eq("dorm_id", context.dormId);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");

  await safeLogEventAudit({
    dormId: context.dormId,
    actorUserId: context.userId,
    action: "events.rating_deleted",
    entityType: "event_rating",
    entityId: ratingId,
    metadata: {
      event_id: eventId,
      occupant_id: rating.occupant_id,
      deleted_by_manager: context.canManageEvents,
    },
  });

  return { success: true };
}

export async function uploadEventPhoto(formData: FormData) {
  const manager = await requireManagerContext();
  if ("error" in manager) {
    return { error: manager.error };
  }

  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!eventId) {
    return { error: "Event ID is required." };
  }

  const photoEntry = formData.get("photo");
  if (!(photoEntry instanceof File)) {
    return { error: "Choose an image to upload." };
  }

  if (!photoEntry.size) {
    return { error: "Uploaded file is empty." };
  }

  if (photoEntry.size > MAX_UPLOAD_SIZE_BYTES) {
    return { error: "Image is too large. Maximum size is 10 MB." };
  }

  if (!VALID_IMAGE_MIME_TYPES.has(photoEntry.type)) {
    return { error: "Unsupported image type." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." };
  }

  const { data: event } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("dorm_id", manager.context.dormId)
    .maybeSingle();

  if (!event) {
    return { error: "Event not found." };
  }

  // Optimize image: resize + convert to WebP
  const optimized = await optimizeImage(photoEntry);
  const storagePath = `${manager.context.dormId}/${eventId}/${crypto.randomUUID()}.${optimized.extension}`;

  const { error: uploadError } = await supabase.storage
    .from("event-photos")
    .upload(storagePath, optimized.buffer, {
      upsert: false,
      contentType: optimized.contentType,
    });

  if (uploadError) {
    return { error: uploadError.message };
  }

  const { data: createdPhoto, error: insertError } = await supabase
    .from("event_photos")
    .insert({
      dorm_id: manager.context.dormId,
      event_id: eventId,
      storage_path: storagePath,
      uploaded_by: manager.context.userId,
    })
    .select("id")
    .single();

  if (insertError || !createdPhoto) {
    await supabase.storage.from("event-photos").remove([storagePath]);
    return { error: insertError?.message ?? "Failed to save photo record." };
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");

  await safeLogEventAudit({
    dormId: manager.context.dormId,
    actorUserId: manager.context.userId,
    action: "events.photo_uploaded",
    entityType: "event_photo",
    entityId: createdPhoto.id,
    metadata: {
      event_id: eventId,
      storage_path: storagePath,
      content_type: photoEntry.type,
      size_bytes: photoEntry.size,
    },
  });

  return { success: true };
}

export async function deleteEventPhoto(formData: FormData) {
  const manager = await requireManagerContext();
  if ("error" in manager) {
    return { error: manager.error };
  }

  const eventId = String(formData.get("event_id") ?? "").trim();
  const photoId = String(formData.get("photo_id") ?? "").trim();
  if (!eventId || !photoId) {
    return { error: "Photo reference is incomplete." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { error: "Supabase is not configured for this environment." };
  }

  const { data: photo } = await supabase
    .from("event_photos")
    .select("id, storage_path")
    .eq("id", photoId)
    .eq("event_id", eventId)
    .eq("dorm_id", manager.context.dormId)
    .maybeSingle();

  if (!photo) {
    return { error: "Photo not found." };
  }

  const { error: removeStorageError } = await supabase.storage
    .from("event-photos")
    .remove([photo.storage_path]);

  if (removeStorageError) {
    return { error: removeStorageError.message };
  }

  const { error: deleteError } = await supabase
    .from("event_photos")
    .delete()
    .eq("id", photoId)
    .eq("event_id", eventId)
    .eq("dorm_id", manager.context.dormId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");

  await safeLogEventAudit({
    dormId: manager.context.dormId,
    actorUserId: manager.context.userId,
    action: "events.photo_deleted",
    entityType: "event_photo",
    entityId: photoId,
    metadata: {
      event_id: eventId,
      storage_path: photo.storage_path,
    },
  });

  return { success: true };
}
