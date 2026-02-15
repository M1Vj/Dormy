"use server";

import { getActiveDormId } from "@/lib/dorms";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  DormRole,
  EventDetail,
  EventRating,
  EventSummary,
  EventViewerContext,
} from "@/lib/types/events";

const EVENT_MANAGER_ROLES = new Set<DormRole>(["admin", "event_officer"]);

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

function normalizeOccupant(occupant: EventRatingRow["occupant"]) {
  if (!occupant) {
    return null;
  }
  if (Array.isArray(occupant)) {
    return occupant[0] ?? null;
  }
  return occupant;
}

function mapRatingRow(row: EventRatingRow): EventRating {
  const occupant = normalizeOccupant(row.occupant);
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

export async function getEventsOverview(dormId: string): Promise<EventSummary[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const { data: eventRows, error: eventsError } = await supabase
    .from("events")
    .select(
      "id, dorm_id, title, description, location, starts_at, ends_at, is_competition, created_at"
    )
    .eq("dorm_id", dormId)
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
        .select("id, event_id, rating, comment, created_at, occupant_id, occupant:occupants(full_name, student_id)")
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
  eventId: string
): Promise<EventDetail | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("Supabase is not configured for this environment.");
  }

  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select(
      "id, dorm_id, title, description, location, starts_at, ends_at, is_competition, created_at"
    )
    .eq("dorm_id", dormId)
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    throw new Error(eventError.message);
  }

  if (!eventRow) {
    return null;
  }

  const [{ data: ratingRows, error: ratingsError }, { data: photoRows, error: photosError }] =
    await Promise.all([
      supabase
        .from("event_ratings")
        .select("id, event_id, rating, comment, created_at, occupant_id, occupant:occupants(full_name, student_id)")
        .eq("dorm_id", dormId)
        .eq("event_id", eventId)
        .order("created_at", { ascending: false }),
      supabase
        .from("event_photos")
        .select("id, event_id, storage_path, created_at")
        .eq("dorm_id", dormId)
        .eq("event_id", eventId)
        .order("created_at", { ascending: false }),
    ]);

  if (ratingsError) {
    throw new Error(ratingsError.message);
  }

  if (photosError) {
    throw new Error(photosError.message);
  }

  const ratings = ((ratingRows ?? []) as EventRatingRow[]).map(mapRatingRow);
  const photos = (photoRows ?? []) as EventPhotoRow[];
  const [summary] = withSummaries([eventRow as EventRow], ratings, photos);

  return {
    ...summary,
    ratings,
    photos: photos.map((photo) => ({
      ...photo,
      url: null,
    })),
  };
}
