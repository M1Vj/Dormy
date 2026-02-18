alter table public.event_teams
  add column if not exists manual_rank_override integer;

alter table public.event_teams
  drop constraint if exists event_teams_manual_rank_override_check;

alter table public.event_teams
  add constraint event_teams_manual_rank_override_check
  check (manual_rank_override is null or manual_rank_override > 0);
