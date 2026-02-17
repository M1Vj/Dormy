alter table public.dorm_announcements
  add column if not exists committee_id uuid references public.committees(id) on delete set null,
  add column if not exists audience text not null default 'dorm';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'dorm_announcements_audience_check'
      and conrelid = 'public.dorm_announcements'::regclass
  ) then
    alter table public.dorm_announcements
      add constraint dorm_announcements_audience_check
      check (audience in ('dorm', 'committee'));
  end if;
end $$;

create index if not exists dorm_announcements_committee_idx
  on public.dorm_announcements (committee_id);

drop policy if exists dorm_announcements_select_policy on public.dorm_announcements;
drop policy if exists dorm_announcements_insert_policy on public.dorm_announcements;
drop policy if exists dorm_announcements_update_policy on public.dorm_announcements;
drop policy if exists dorm_announcements_delete_policy on public.dorm_announcements;

create policy dorm_announcements_select_policy on public.dorm_announcements
  for select
  using (
    is_dorm_member(dorm_id)
    and (
      (
        visibility = 'members'
        and starts_at <= now()
        and (expires_at is null or expires_at > now())
        and (
          audience = 'dorm'
          or (
            audience = 'committee'
            and committee_id is not null
            and exists (
              select 1
              from public.committee_members cm
              where cm.committee_id = dorm_announcements.committee_id
                and cm.user_id = auth.uid()
            )
          )
        )
      )
      or has_role(
        dorm_id,
        array['admin','adviser','assistant_adviser','student_assistant','treasurer','officer']::app_role[]
      )
      or (
        committee_id is not null
        and visibility = 'members'
        and exists (
          select 1
          from public.committee_members cm
          where cm.committee_id = dorm_announcements.committee_id
            and cm.user_id = auth.uid()
            and cm.role in ('head', 'co-head')
        )
      )
    )
  );

create policy dorm_announcements_insert_policy on public.dorm_announcements
  for insert
  with check (
    has_role(
      dorm_id,
      array['admin','adviser','assistant_adviser','student_assistant','treasurer','officer']::app_role[]
    )
    or (
      committee_id is not null
      and visibility = 'members'
      and exists (
        select 1
        from public.committees c
        where c.id = dorm_announcements.committee_id
          and c.dorm_id = dorm_announcements.dorm_id
      )
      and exists (
        select 1
        from public.committee_members cm
        where cm.committee_id = dorm_announcements.committee_id
          and cm.user_id = auth.uid()
          and cm.role in ('head', 'co-head')
      )
    )
  );

create policy dorm_announcements_update_policy on public.dorm_announcements
  for update
  using (
    has_role(
      dorm_id,
      array['admin','adviser','assistant_adviser','student_assistant','treasurer','officer']::app_role[]
    )
    or (
      committee_id is not null
      and exists (
        select 1
        from public.committee_members cm
        where cm.committee_id = dorm_announcements.committee_id
          and cm.user_id = auth.uid()
          and cm.role in ('head', 'co-head')
      )
    )
  )
  with check (
    has_role(
      dorm_id,
      array['admin','adviser','assistant_adviser','student_assistant','treasurer','officer']::app_role[]
    )
    or (
      committee_id is not null
      and visibility = 'members'
      and exists (
        select 1
        from public.committees c
        where c.id = dorm_announcements.committee_id
          and c.dorm_id = dorm_announcements.dorm_id
      )
      and exists (
        select 1
        from public.committee_members cm
        where cm.committee_id = dorm_announcements.committee_id
          and cm.user_id = auth.uid()
          and cm.role in ('head', 'co-head')
      )
    )
  );

create policy dorm_announcements_delete_policy on public.dorm_announcements
  for delete
  using (
    has_role(
      dorm_id,
      array['admin','adviser','assistant_adviser','student_assistant','treasurer','officer']::app_role[]
    )
    or (
      committee_id is not null
      and exists (
        select 1
        from public.committee_members cm
        where cm.committee_id = dorm_announcements.committee_id
          and cm.user_id = auth.uid()
          and cm.role in ('head', 'co-head')
      )
    )
  );

