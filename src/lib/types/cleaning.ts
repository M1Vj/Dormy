import type { DormRole } from "@/lib/types/events";

export type CleaningArea = {
  id: string;
  dorm_id: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CleaningRoom = {
  id: string;
  code: string;
  level: number;
  level_override?: string | null;
  capacity: number;
  sort_order: number;
  occupant_count: number;
};

export type CleaningWeek = {
  id: string;
  dorm_id: string;
  week_start: string;
  rest_level: number | null;
  created_at: string;
  updated_at: string;
};

export type CleaningAssignment = {
  id: string;
  dorm_id: string;
  cleaning_week_id: string;
  room_id: string;
  area_id: string;
  created_at: string;
  room_code: string;
  room_level: number;
  area_name: string;
};

export type CleaningException = {
  id: string;
  dorm_id: string;
  date: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

export type CleaningWeekday = {
  date: string;
  day_label: string;
  has_exception: boolean;
  exception_reason: string | null;
};

export type CleaningRoomPlan = {
  room_id: string;
  room_code: string;
  room_level: number;
  level_override?: string | null;
  occupant_count: number;
  area_id: string | null;
  area_name: string | null;
  is_rest_week: boolean;
};

export type CleaningSnapshot = {
  viewer: {
    dorm_id: string;
    role: DormRole;
    can_manage: boolean;
  };
  selected_week_start: string;
  week: CleaningWeek | null;
  areas: CleaningArea[];
  rooms: CleaningRoom[];
  assignments: CleaningAssignment[];
  exceptions: CleaningException[];
  weekdays: CleaningWeekday[];
  room_plans: CleaningRoomPlan[];
};
