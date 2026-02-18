create unique index if not exists cleaning_weeks_dorm_week_start_unique
  on public.cleaning_weeks (dorm_id, week_start);

create unique index if not exists cleaning_assignments_week_room_unique
  on public.cleaning_assignments (cleaning_week_id, room_id);

create unique index if not exists cleaning_exceptions_dorm_date_unique
  on public.cleaning_exceptions (dorm_id, date);
