drop policy if exists events_insert_event_officer on public.events;
create policy events_insert_event_officer on public.events
  for insert
  with check (
    is_dorm_member(dorm_id)
    and has_role(
      dorm_id,
      array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
    )
  );

drop policy if exists events_update_event_officer on public.events;
create policy events_update_event_officer on public.events
  for update
  using (
    has_role(
      dorm_id,
      array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
    )
  )
  with check (
    has_role(
      dorm_id,
      array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
    )
  );

drop policy if exists events_delete_event_officer on public.events;
create policy events_delete_event_officer on public.events
  for delete
  using (
    has_role(
      dorm_id,
      array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
    )
  );

drop policy if exists event_participating_dorms_insert_event_officer on public.event_participating_dorms;
create policy event_participating_dorms_insert_event_officer on public.event_participating_dorms
  for insert
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_participating_dorms.event_id
        and e.dorm_id = event_participating_dorms.dorm_id
        and has_role(
          e.dorm_id,
          array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
        )
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
        and e.dorm_id = event_participating_dorms.dorm_id
        and has_role(
          e.dorm_id,
          array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
        )
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_participating_dorms.event_id
        and e.dorm_id = event_participating_dorms.dorm_id
        and has_role(
          e.dorm_id,
          array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
        )
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
        and e.dorm_id = event_participating_dorms.dorm_id
        and has_role(
          e.dorm_id,
          array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
        )
    )
  );

drop policy if exists event_photos_insert_event_officer on public.event_photos;
create policy event_photos_insert_event_officer on public.event_photos
  for insert
  with check (
    has_role(
      dorm_id,
      array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
    )
  );

drop policy if exists event_photos_update_event_officer on public.event_photos;
create policy event_photos_update_event_officer on public.event_photos
  for update
  using (
    has_role(
      dorm_id,
      array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
    )
  )
  with check (
    has_role(
      dorm_id,
      array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
    )
  );

drop policy if exists event_photos_delete_event_officer on public.event_photos;
create policy event_photos_delete_event_officer on public.event_photos
  for delete
  using (
    has_role(
      dorm_id,
      array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
    )
  );

drop policy if exists event_photos_storage_insert_event_officer on storage.objects;
create policy event_photos_storage_insert_event_officer on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'event-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and has_role(
      (split_part(name, '/', 1))::uuid,
      array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
    )
  );

drop policy if exists event_photos_storage_update_event_officer on storage.objects;
create policy event_photos_storage_update_event_officer on storage.objects
  for update to authenticated
  using (
    bucket_id = 'event-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and has_role(
      (split_part(name, '/', 1))::uuid,
      array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
    )
  )
  with check (
    bucket_id = 'event-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and has_role(
      (split_part(name, '/', 1))::uuid,
      array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
    )
  );

drop policy if exists event_photos_storage_delete_event_officer on storage.objects;
create policy event_photos_storage_delete_event_officer on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'event-photos'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and has_role(
      (split_part(name, '/', 1))::uuid,
      array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'event_attendance_status'
  ) then
    create type public.event_attendance_status as enum ('present', 'absent', 'excused');
  end if;
end $$;

create table if not exists public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  occupant_id uuid not null references public.occupants(id) on delete cascade,
  status public.event_attendance_status not null default 'present',
  checked_by uuid references public.profiles(user_id) on delete set null,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, occupant_id)
);

create index if not exists event_attendance_event_idx
  on public.event_attendance (event_id);

create index if not exists event_attendance_occupant_idx
  on public.event_attendance (occupant_id);

create index if not exists event_attendance_dorm_status_idx
  on public.event_attendance (dorm_id, status);

alter table public.event_attendance enable row level security;

drop policy if exists event_attendance_select_member on public.event_attendance;
create policy event_attendance_select_member on public.event_attendance
  for select
  using (is_dorm_member(dorm_id));

drop policy if exists event_attendance_insert_event_staff on public.event_attendance;
create policy event_attendance_insert_event_staff on public.event_attendance
  for insert
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_attendance.event_id
        and e.dorm_id = event_attendance.dorm_id
        and (
          has_role(
            e.dorm_id,
            array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
          )
          or (
            e.committee_id is not null
            and exists (
              select 1
              from public.committee_members cm
              where cm.committee_id = e.committee_id
                and cm.user_id = auth.uid()
                and cm.role in ('head', 'co-head')
            )
          )
        )
    )
    and exists (
      select 1
      from public.occupants o
      where o.id = event_attendance.occupant_id
        and o.dorm_id = event_attendance.dorm_id
    )
  );

drop policy if exists event_attendance_update_event_staff on public.event_attendance;
create policy event_attendance_update_event_staff on public.event_attendance
  for update
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_attendance.event_id
        and e.dorm_id = event_attendance.dorm_id
        and (
          has_role(
            e.dorm_id,
            array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
          )
          or (
            e.committee_id is not null
            and exists (
              select 1
              from public.committee_members cm
              where cm.committee_id = e.committee_id
                and cm.user_id = auth.uid()
                and cm.role in ('head', 'co-head')
            )
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_attendance.event_id
        and e.dorm_id = event_attendance.dorm_id
        and (
          has_role(
            e.dorm_id,
            array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
          )
          or (
            e.committee_id is not null
            and exists (
              select 1
              from public.committee_members cm
              where cm.committee_id = e.committee_id
                and cm.user_id = auth.uid()
                and cm.role in ('head', 'co-head')
            )
          )
        )
    )
    and exists (
      select 1
      from public.occupants o
      where o.id = event_attendance.occupant_id
        and o.dorm_id = event_attendance.dorm_id
    )
  );

drop policy if exists event_attendance_delete_event_staff on public.event_attendance;
create policy event_attendance_delete_event_staff on public.event_attendance
  for delete
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_attendance.event_id
        and e.dorm_id = event_attendance.dorm_id
        and (
          has_role(
            e.dorm_id,
            array['admin','student_assistant','adviser','assistant_adviser','officer']::app_role[]
          )
          or (
            e.committee_id is not null
            and exists (
              select 1
              from public.committee_members cm
              where cm.committee_id = e.committee_id
                and cm.user_id = auth.uid()
                and cm.role in ('head', 'co-head')
            )
          )
        )
    )
  );
