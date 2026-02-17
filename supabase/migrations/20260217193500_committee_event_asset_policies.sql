-- Allow committee heads/co-heads to manage assets for committee-linked events.

drop policy if exists event_participating_dorms_insert_committee_heads on public.event_participating_dorms;
create policy event_participating_dorms_insert_committee_heads on public.event_participating_dorms
  for insert
  with check (
    exists (
      select 1
      from public.events e
      join public.committees c on c.id = e.committee_id
      join public.committee_members cm on cm.committee_id = c.id
      where e.id = event_participating_dorms.event_id
        and e.dorm_id = c.dorm_id
        and cm.user_id = auth.uid()
        and cm.role in ('head', 'co-head')
    )
  );

drop policy if exists event_participating_dorms_update_committee_heads on public.event_participating_dorms;
create policy event_participating_dorms_update_committee_heads on public.event_participating_dorms
  for update
  using (
    exists (
      select 1
      from public.events e
      join public.committees c on c.id = e.committee_id
      join public.committee_members cm on cm.committee_id = c.id
      where e.id = event_participating_dorms.event_id
        and e.dorm_id = c.dorm_id
        and cm.user_id = auth.uid()
        and cm.role in ('head', 'co-head')
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      join public.committees c on c.id = e.committee_id
      join public.committee_members cm on cm.committee_id = c.id
      where e.id = event_participating_dorms.event_id
        and e.dorm_id = c.dorm_id
        and cm.user_id = auth.uid()
        and cm.role in ('head', 'co-head')
    )
  );

drop policy if exists event_participating_dorms_delete_committee_heads on public.event_participating_dorms;
create policy event_participating_dorms_delete_committee_heads on public.event_participating_dorms
  for delete
  using (
    exists (
      select 1
      from public.events e
      join public.committees c on c.id = e.committee_id
      join public.committee_members cm on cm.committee_id = c.id
      where e.id = event_participating_dorms.event_id
        and e.dorm_id = c.dorm_id
        and cm.user_id = auth.uid()
        and cm.role in ('head', 'co-head')
    )
  );

drop policy if exists event_photos_insert_committee_heads on public.event_photos;
create policy event_photos_insert_committee_heads on public.event_photos
  for insert
  with check (
    exists (
      select 1
      from public.events e
      join public.committees c on c.id = e.committee_id
      join public.committee_members cm on cm.committee_id = c.id
      where e.id = event_photos.event_id
        and e.dorm_id = event_photos.dorm_id
        and cm.user_id = auth.uid()
        and cm.role in ('head', 'co-head')
    )
  );

drop policy if exists event_photos_update_committee_heads on public.event_photos;
create policy event_photos_update_committee_heads on public.event_photos
  for update
  using (
    exists (
      select 1
      from public.events e
      join public.committees c on c.id = e.committee_id
      join public.committee_members cm on cm.committee_id = c.id
      where e.id = event_photos.event_id
        and e.dorm_id = event_photos.dorm_id
        and cm.user_id = auth.uid()
        and cm.role in ('head', 'co-head')
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      join public.committees c on c.id = e.committee_id
      join public.committee_members cm on cm.committee_id = c.id
      where e.id = event_photos.event_id
        and e.dorm_id = event_photos.dorm_id
        and cm.user_id = auth.uid()
        and cm.role in ('head', 'co-head')
    )
  );

drop policy if exists event_photos_delete_committee_heads on public.event_photos;
create policy event_photos_delete_committee_heads on public.event_photos
  for delete
  using (
    exists (
      select 1
      from public.events e
      join public.committees c on c.id = e.committee_id
      join public.committee_members cm on cm.committee_id = c.id
      where e.id = event_photos.event_id
        and e.dorm_id = event_photos.dorm_id
        and cm.user_id = auth.uid()
        and cm.role in ('head', 'co-head')
    )
  );

drop policy if exists event_photos_storage_insert_committee_heads on storage.objects;
create policy event_photos_storage_insert_committee_heads on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.events e
      join public.committees c on c.id = e.committee_id
      join public.committee_members cm on cm.committee_id = c.id
      where e.id = (split_part(name, '/', 2))::uuid
        and e.dorm_id = (split_part(name, '/', 1))::uuid
        and cm.user_id = auth.uid()
        and cm.role in ('head', 'co-head')
    )
  );

drop policy if exists event_photos_storage_update_committee_heads on storage.objects;
create policy event_photos_storage_update_committee_heads on storage.objects
  for update to authenticated
  using (
    bucket_id = 'event-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.events e
      join public.committees c on c.id = e.committee_id
      join public.committee_members cm on cm.committee_id = c.id
      where e.id = (split_part(name, '/', 2))::uuid
        and e.dorm_id = (split_part(name, '/', 1))::uuid
        and cm.user_id = auth.uid()
        and cm.role in ('head', 'co-head')
    )
  )
  with check (
    bucket_id = 'event-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.events e
      join public.committees c on c.id = e.committee_id
      join public.committee_members cm on cm.committee_id = c.id
      where e.id = (split_part(name, '/', 2))::uuid
        and e.dorm_id = (split_part(name, '/', 1))::uuid
        and cm.user_id = auth.uid()
        and cm.role in ('head', 'co-head')
    )
  );

drop policy if exists event_photos_storage_delete_committee_heads on storage.objects;
create policy event_photos_storage_delete_committee_heads on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'event-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and exists (
      select 1
      from public.events e
      join public.committees c on c.id = e.committee_id
      join public.committee_members cm on cm.committee_id = c.id
      where e.id = (split_part(name, '/', 2))::uuid
        and e.dorm_id = (split_part(name, '/', 1))::uuid
        and cm.user_id = auth.uid()
        and cm.role in ('head', 'co-head')
    )
  );

drop policy if exists event_ratings_delete_committee_heads on public.event_ratings;
create policy event_ratings_delete_committee_heads on public.event_ratings
  for delete
  using (
    exists (
      select 1
      from public.events e
      join public.committees c on c.id = e.committee_id
      join public.committee_members cm on cm.committee_id = c.id
      where e.id = event_ratings.event_id
        and e.dorm_id = event_ratings.dorm_id
        and cm.user_id = auth.uid()
        and cm.role in ('head', 'co-head')
    )
  );
