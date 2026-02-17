insert into storage.buckets (id, name, public)
values ('dormy-uploads', 'dormy-uploads', false)
on conflict (id) do nothing;

update storage.buckets
set public = false
where id = 'dormy-uploads';

drop policy if exists dormy_uploads_storage_select_member on storage.objects;
create policy dormy_uploads_storage_select_member on storage.objects
  for select to authenticated
  using (
    bucket_id = 'dormy-uploads'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and public.is_dorm_member((split_part(name, '/', 2))::uuid)
  );

drop policy if exists dormy_uploads_storage_insert_member on storage.objects;
create policy dormy_uploads_storage_insert_member on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'dormy-uploads'
    and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and public.is_dorm_member((split_part(name, '/', 2))::uuid)
    and (
      (
        split_part(name, '/', 1) = 'fine-reports'
      )
      or (
        split_part(name, '/', 1) = 'expenses'
        and (
          public.has_role(
            (split_part(name, '/', 2))::uuid,
            array['admin', 'treasurer', 'officer']::public.app_role[]
          )
          or (
            split_part(name, '/', 3) ~* '^committee-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and exists (
              select 1
              from public.committees c
              join public.committee_members cm on cm.committee_id = c.id
              where c.dorm_id = (split_part(name, '/', 2))::uuid
                and c.id = (regexp_replace(split_part(name, '/', 3), '^committee-', ''))::uuid
                and cm.user_id = auth.uid()
                and cm.role in ('head', 'co-head')
            )
          )
        )
      )
    )
  );
