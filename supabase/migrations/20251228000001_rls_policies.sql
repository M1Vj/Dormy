create or replace function public.is_dorm_member(dorm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dorm_memberships dm
    where dm.dorm_id = $1
      and dm.user_id = auth.uid()
  );
$$;

create or replace function public.has_role(dorm_id uuid, roles app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dorm_memberships dm
    where dm.dorm_id = $1
      and dm.user_id = auth.uid()
      and dm.role = any(roles)
  );
$$;

create or replace function public.is_occupant_self(occupant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.occupants o
    where o.id = $1
      and o.user_id = auth.uid()
  );
$$;

create or replace function public.is_submission_rater(submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.evaluation_submissions es
    join public.occupants o on o.id = es.rater_occupant_id
    where es.id = $1
      and o.user_id = auth.uid()
  );
$$;

grant execute on function public.is_dorm_member(uuid) to anon, authenticated;
grant execute on function public.has_role(uuid, app_role[]) to anon, authenticated;
grant execute on function public.is_occupant_self(uuid) to anon, authenticated;
grant execute on function public.is_submission_rater(uuid) to anon, authenticated;

create policy dorms_select_member on public.dorms
  for select
  using (is_dorm_member(id));

create policy dorms_update_admin on public.dorms
  for update
  using (has_role(id, array['admin']::app_role[]))
  with check (has_role(id, array['admin']::app_role[]));

create policy profiles_select_own on public.profiles
  for select
  using (auth.uid() = user_id);

create policy profiles_insert_own on public.profiles
  for insert
  with check (auth.uid() = user_id);

create policy profiles_update_own on public.profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy memberships_select_own_or_admin on public.dorm_memberships
  for select
  using (user_id = auth.uid() or has_role(dorm_id, array['admin']::app_role[]));

create policy memberships_insert_admin on public.dorm_memberships
  for insert
  with check (has_role(dorm_id, array['admin']::app_role[]));

create policy memberships_update_admin on public.dorm_memberships
  for update
  using (has_role(dorm_id, array['admin']::app_role[]))
  with check (has_role(dorm_id, array['admin']::app_role[]));

create policy memberships_delete_admin on public.dorm_memberships
  for delete
  using (has_role(dorm_id, array['admin']::app_role[]));

create policy rooms_select_member on public.rooms
  for select
  using (is_dorm_member(dorm_id));

create policy rooms_insert_staff on public.rooms
  for insert
  with check (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy rooms_update_staff on public.rooms
  for update
  using (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy rooms_delete_staff on public.rooms
  for delete
  using (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy occupants_select_staff_or_self on public.occupants
  for select
  using (
    has_role(dorm_id, array[
      'admin',
      'student_assistant',
      'treasurer',
      'adviser',
      'assistant_adviser',
      'event_officer'
    ]::app_role[])
    or is_occupant_self(id)
  );

create policy occupants_insert_staff on public.occupants
  for insert
  with check (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy occupants_update_staff on public.occupants
  for update
  using (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy occupants_delete_staff on public.occupants
  for delete
  using (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy room_assignments_select_staff_or_self on public.room_assignments
  for select
  using (
    has_role(dorm_id, array[
      'admin',
      'student_assistant',
      'treasurer',
      'adviser',
      'assistant_adviser',
      'event_officer'
    ]::app_role[])
    or is_occupant_self(occupant_id)
  );

create policy room_assignments_insert_staff on public.room_assignments
  for insert
  with check (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy room_assignments_update_staff on public.room_assignments
  for update
  using (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy room_assignments_delete_staff on public.room_assignments
  for delete
  using (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy fine_rules_select_member on public.fine_rules
  for select
  using (is_dorm_member(dorm_id));

create policy fine_rules_insert_staff on public.fine_rules
  for insert
  with check (has_role(dorm_id, array['admin', 'student_assistant', 'adviser', 'assistant_adviser']::app_role[]));

create policy fine_rules_update_staff on public.fine_rules
  for update
  using (has_role(dorm_id, array['admin', 'student_assistant', 'adviser', 'assistant_adviser']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'student_assistant', 'adviser', 'assistant_adviser']::app_role[]));

create policy fine_rules_delete_staff on public.fine_rules
  for delete
  using (has_role(dorm_id, array['admin', 'student_assistant', 'adviser', 'assistant_adviser']::app_role[]));

create policy fines_select_staff_or_self on public.fines
  for select
  using (
    has_role(dorm_id, array['admin', 'student_assistant', 'adviser', 'assistant_adviser']::app_role[])
    or is_occupant_self(occupant_id)
  );

create policy fines_insert_staff on public.fines
  for insert
  with check (has_role(dorm_id, array['admin', 'student_assistant', 'adviser', 'assistant_adviser']::app_role[]));

create policy fines_update_staff on public.fines
  for update
  using (has_role(dorm_id, array['admin', 'student_assistant', 'adviser', 'assistant_adviser']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'student_assistant', 'adviser', 'assistant_adviser']::app_role[]));

create policy fines_delete_staff on public.fines
  for delete
  using (has_role(dorm_id, array['admin', 'student_assistant', 'adviser', 'assistant_adviser']::app_role[]));

create policy events_select_member on public.events
  for select
  using (is_dorm_member(dorm_id));

create policy events_insert_event_officer on public.events
  for insert
  with check (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy events_update_event_officer on public.events
  for update
  using (has_role(dorm_id, array['admin', 'event_officer']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy events_delete_event_officer on public.events
  for delete
  using (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy event_photos_select_member on public.event_photos
  for select
  using (is_dorm_member(dorm_id));

create policy event_photos_insert_event_officer on public.event_photos
  for insert
  with check (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy event_photos_update_event_officer on public.event_photos
  for update
  using (has_role(dorm_id, array['admin', 'event_officer']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy event_photos_delete_event_officer on public.event_photos
  for delete
  using (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy event_ratings_select_member on public.event_ratings
  for select
  using (is_dorm_member(dorm_id));

create policy event_ratings_insert_self on public.event_ratings
  for insert
  with check (is_dorm_member(dorm_id) and is_occupant_self(occupant_id));

create policy event_ratings_update_self on public.event_ratings
  for update
  using (is_dorm_member(dorm_id) and is_occupant_self(occupant_id))
  with check (is_dorm_member(dorm_id) and is_occupant_self(occupant_id));

create policy event_ratings_delete_self on public.event_ratings
  for delete
  using (is_dorm_member(dorm_id) and is_occupant_self(occupant_id));

create policy event_teams_select_member on public.event_teams
  for select
  using (is_dorm_member(dorm_id));

create policy event_teams_insert_event_officer on public.event_teams
  for insert
  with check (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy event_teams_update_event_officer on public.event_teams
  for update
  using (has_role(dorm_id, array['admin', 'event_officer']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy event_teams_delete_event_officer on public.event_teams
  for delete
  using (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy event_team_members_select_member on public.event_team_members
  for select
  using (is_dorm_member(dorm_id));

create policy event_team_members_insert_event_officer on public.event_team_members
  for insert
  with check (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy event_team_members_update_event_officer on public.event_team_members
  for update
  using (has_role(dorm_id, array['admin', 'event_officer']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy event_team_members_delete_event_officer on public.event_team_members
  for delete
  using (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy event_score_categories_select_member on public.event_score_categories
  for select
  using (is_dorm_member(dorm_id));

create policy event_score_categories_insert_event_officer on public.event_score_categories
  for insert
  with check (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy event_score_categories_update_event_officer on public.event_score_categories
  for update
  using (has_role(dorm_id, array['admin', 'event_officer']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy event_score_categories_delete_event_officer on public.event_score_categories
  for delete
  using (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy event_scores_select_member on public.event_scores
  for select
  using (is_dorm_member(dorm_id));

create policy event_scores_insert_event_officer on public.event_scores
  for insert
  with check (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy event_scores_update_event_officer on public.event_scores
  for update
  using (has_role(dorm_id, array['admin', 'event_officer']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy event_scores_delete_event_officer on public.event_scores
  for delete
  using (has_role(dorm_id, array['admin', 'event_officer']::app_role[]));

create policy ledger_entries_select_staff_or_self on public.ledger_entries
  for select
  using (
    has_role(dorm_id, array['admin', 'treasurer', 'adviser', 'assistant_adviser']::app_role[])
    or is_occupant_self(occupant_id)
  );

create policy ledger_entries_insert_staff on public.ledger_entries
  for insert
  with check (has_role(dorm_id, array['admin', 'treasurer', 'adviser', 'assistant_adviser']::app_role[]));

create policy ledger_entries_update_staff on public.ledger_entries
  for update
  using (has_role(dorm_id, array['admin', 'treasurer', 'adviser', 'assistant_adviser']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'treasurer', 'adviser', 'assistant_adviser']::app_role[]));

create policy ledger_entries_delete_staff on public.ledger_entries
  for delete
  using (has_role(dorm_id, array['admin', 'treasurer', 'adviser', 'assistant_adviser']::app_role[]));

create policy evaluation_cycles_select_member on public.evaluation_cycles
  for select
  using (is_dorm_member(dorm_id));

create policy evaluation_cycles_insert_admin on public.evaluation_cycles
  for insert
  with check (has_role(dorm_id, array['admin']::app_role[]));

create policy evaluation_cycles_update_admin on public.evaluation_cycles
  for update
  using (has_role(dorm_id, array['admin']::app_role[]))
  with check (has_role(dorm_id, array['admin']::app_role[]));

create policy evaluation_cycles_delete_admin on public.evaluation_cycles
  for delete
  using (has_role(dorm_id, array['admin']::app_role[]));

create policy evaluation_templates_select_member on public.evaluation_templates
  for select
  using (is_dorm_member(dorm_id));

create policy evaluation_templates_insert_admin on public.evaluation_templates
  for insert
  with check (has_role(dorm_id, array['admin']::app_role[]));

create policy evaluation_templates_update_admin on public.evaluation_templates
  for update
  using (has_role(dorm_id, array['admin']::app_role[]))
  with check (has_role(dorm_id, array['admin']::app_role[]));

create policy evaluation_templates_delete_admin on public.evaluation_templates
  for delete
  using (has_role(dorm_id, array['admin']::app_role[]));

create policy evaluation_metrics_select_member on public.evaluation_metrics
  for select
  using (is_dorm_member(dorm_id));

create policy evaluation_metrics_insert_admin on public.evaluation_metrics
  for insert
  with check (has_role(dorm_id, array['admin']::app_role[]));

create policy evaluation_metrics_update_admin on public.evaluation_metrics
  for update
  using (has_role(dorm_id, array['admin']::app_role[]))
  with check (has_role(dorm_id, array['admin']::app_role[]));

create policy evaluation_metrics_delete_admin on public.evaluation_metrics
  for delete
  using (has_role(dorm_id, array['admin']::app_role[]));

create policy evaluation_submissions_select_member on public.evaluation_submissions
  for select
  using (is_dorm_member(dorm_id));

create policy evaluation_submissions_insert_rater on public.evaluation_submissions
  for insert
  with check (
    is_dorm_member(dorm_id)
    and is_occupant_self(rater_occupant_id)
    and rater_occupant_id <> ratee_occupant_id
  );

create policy evaluation_submissions_update_rater_or_admin on public.evaluation_submissions
  for update
  using (
    has_role(dorm_id, array['admin']::app_role[])
    or is_occupant_self(rater_occupant_id)
  )
  with check (
    has_role(dorm_id, array['admin']::app_role[])
    or (is_occupant_self(rater_occupant_id) and rater_occupant_id <> ratee_occupant_id)
  );

create policy evaluation_submissions_delete_rater_or_admin on public.evaluation_submissions
  for delete
  using (
    has_role(dorm_id, array['admin']::app_role[])
    or is_occupant_self(rater_occupant_id)
  );

create policy evaluation_metric_scores_select_member on public.evaluation_metric_scores
  for select
  using (is_dorm_member(dorm_id));

create policy evaluation_metric_scores_insert_rater_or_admin on public.evaluation_metric_scores
  for insert
  with check (
    has_role(dorm_id, array['admin']::app_role[])
    or is_submission_rater(submission_id)
  );

create policy evaluation_metric_scores_update_rater_or_admin on public.evaluation_metric_scores
  for update
  using (
    has_role(dorm_id, array['admin']::app_role[])
    or is_submission_rater(submission_id)
  )
  with check (
    has_role(dorm_id, array['admin']::app_role[])
    or is_submission_rater(submission_id)
  );

create policy evaluation_metric_scores_delete_rater_or_admin on public.evaluation_metric_scores
  for delete
  using (
    has_role(dorm_id, array['admin']::app_role[])
    or is_submission_rater(submission_id)
  );

create policy cleaning_areas_select_member on public.cleaning_areas
  for select
  using (is_dorm_member(dorm_id));

create policy cleaning_areas_insert_sa on public.cleaning_areas
  for insert
  with check (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy cleaning_areas_update_sa on public.cleaning_areas
  for update
  using (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy cleaning_areas_delete_sa on public.cleaning_areas
  for delete
  using (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy cleaning_weeks_select_member on public.cleaning_weeks
  for select
  using (is_dorm_member(dorm_id));

create policy cleaning_weeks_insert_sa on public.cleaning_weeks
  for insert
  with check (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy cleaning_weeks_update_sa on public.cleaning_weeks
  for update
  using (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy cleaning_weeks_delete_sa on public.cleaning_weeks
  for delete
  using (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy cleaning_assignments_select_member on public.cleaning_assignments
  for select
  using (is_dorm_member(dorm_id));

create policy cleaning_assignments_insert_sa on public.cleaning_assignments
  for insert
  with check (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy cleaning_assignments_update_sa on public.cleaning_assignments
  for update
  using (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy cleaning_assignments_delete_sa on public.cleaning_assignments
  for delete
  using (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy cleaning_exceptions_select_member on public.cleaning_exceptions
  for select
  using (is_dorm_member(dorm_id));

create policy cleaning_exceptions_insert_sa on public.cleaning_exceptions
  for insert
  with check (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy cleaning_exceptions_update_sa on public.cleaning_exceptions
  for update
  using (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]))
  with check (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy cleaning_exceptions_delete_sa on public.cleaning_exceptions
  for delete
  using (has_role(dorm_id, array['admin', 'student_assistant']::app_role[]));

create policy audit_events_select_member on public.audit_events
  for select
  using (is_dorm_member(dorm_id));

create policy audit_events_insert_member on public.audit_events
  for insert
  with check (is_dorm_member(dorm_id));
