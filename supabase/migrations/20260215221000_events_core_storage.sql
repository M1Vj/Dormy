create table if not exists public.event_participating_dorms (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, dorm_id)
);

alter table public.event_participating_dorms enable row level security;

drop policy if exists event_participating_dorms_select_member on public.event_participating_dorms;
create policy event_participating_dorms_select_member on public.event_participating_dorms
  for select
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_participating_dorms.event_id
        and public.is_dorm_member(e.dorm_id)
    )
    or public.is_dorm_member(dorm_id)
  );

drop policy if exists event_participating_dorms_insert_event_officer on public.event_participating_dorms;
create policy event_participating_dorms_insert_event_officer on public.event_participating_dorms
  for insert
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_participating_dorms.event_id
        and public.has_role(e.dorm_id, array['admin', 'event_officer']::public.app_role[])
    )
  );

drop policy if exists event_participating_dorms_update_event_officer on public.event_participating_dorms;
create policy event_participating_dorms_update_event_officer on public.event_participating_dorms
  for update
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_participating_dorms.event_id
        and public.has_role(e.dorm_id, array['admin', 'event_officer']::public.app_role[])
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_participating_dorms.event_id
        and public.has_role(e.dorm_id, array['admin', 'event_officer']::public.app_role[])
    )
  );

drop policy if exists event_participating_dorms_delete_event_officer on public.event_participating_dorms;
create policy event_participating_dorms_delete_event_officer on public.event_participating_dorms
  for delete
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_participating_dorms.event_id
        and public.has_role(e.dorm_id, array['admin', 'event_officer']::public.app_role[])
    )
  );

insert into storage.buckets (id, name, public)
values ('event-photos', 'event-photos', true)
on conflict (id) do nothing;

update storage.buckets
set public = true
where id = 'event-photos';

drop policy if exists event_photos_storage_select_member on storage.objects;
create policy event_photos_storage_select_member on storage.objects
  for select to authenticated
  using (
    bucket_id = 'event-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and public.is_dorm_member((split_part(name, '/', 1))::uuid)
  );

drop policy if exists event_photos_storage_insert_event_officer on storage.objects;
create policy event_photos_storage_insert_event_officer on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and public.has_role(
      (split_part(name, '/', 1))::uuid,
      array['admin', 'event_officer']::public.app_role[]
    )
  );

drop policy if exists event_photos_storage_update_event_officer on storage.objects;
create policy event_photos_storage_update_event_officer on storage.objects
  for update to authenticated
  using (
    bucket_id = 'event-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and public.has_role(
      (split_part(name, '/', 1))::uuid,
      array['admin', 'event_officer']::public.app_role[]
    )
  )
  with check (
    bucket_id = 'event-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and public.has_role(
      (split_part(name, '/', 1))::uuid,
      array['admin', 'event_officer']::public.app_role[]
    )
  );

drop policy if exists event_photos_storage_delete_event_officer on storage.objects;
create policy event_photos_storage_delete_event_officer on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'event-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and public.has_role(
      (split_part(name, '/', 1))::uuid,
      array['admin', 'event_officer']::public.app_role[]
    )
  );
