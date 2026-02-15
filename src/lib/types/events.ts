export const dormRoles = [
  "admin",
  "adviser",
  "assistant_adviser",
  "student_assistant",
  "treasurer",
  "occupant",
  "event_officer",
] as const;

export type DormRole = (typeof dormRoles)[number];

export type EventSummary = {
  id: string;
  dorm_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_competition: boolean;
  created_at: string;
  rating_count: number;
  average_rating: number | null;
  photo_count: number;
};

export type EventPhoto = {
  id: string;
  event_id: string;
  storage_path: string;
  created_at: string;
  url: string | null;
};

export type EventRating = {
  id: string;
  event_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  occupant_id: string;
  occupant_name: string | null;
  occupant_student_id: string | null;
};

export type EventDetail = EventSummary & {
  photos: EventPhoto[];
  ratings: EventRating[];
};

export type EventViewerContext = {
  userId: string;
  dormId: string;
  role: DormRole;
  canManageEvents: boolean;
};
