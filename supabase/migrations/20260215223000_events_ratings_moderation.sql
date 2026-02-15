drop policy if exists event_ratings_delete_event_staff on public.event_ratings;
create policy event_ratings_delete_event_staff on public.event_ratings
  for delete
  using (public.has_role(dorm_id, array['admin', 'event_officer']::public.app_role[]));
