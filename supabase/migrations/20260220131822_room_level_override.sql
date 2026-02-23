-- Add level_override to rooms
alter table public.rooms
  add column if not exists level_override text;
