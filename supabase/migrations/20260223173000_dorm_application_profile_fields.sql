alter table public.dorm_applications
  add column if not exists student_id text,
  add column if not exists room_number text,
  add column if not exists course text;
