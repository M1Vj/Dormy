-- Create a function to check if a user is an admin in ANY dormitory
create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dorm_memberships dm
    where dm.user_id = auth.uid()
      and dm.role = 'admin'
  );
$$;

grant execute on function public.is_global_admin() to anon, authenticated;

-- Update Select policies to allow global admins to see everything
-- 1. Dorms
DROP POLICY IF EXISTS dorms_select_member ON public.dorms;
CREATE POLICY dorms_select_member ON public.dorms
  FOR SELECT
  USING (is_dorm_member(id) OR is_global_admin());

-- 2. Occupants
DROP POLICY IF EXISTS occupants_select_staff_or_self ON public.occupants;
CREATE POLICY occupants_select_staff_or_self ON public.occupants
  FOR SELECT
  USING (
    has_role(dorm_id, ARRAY['admin','student_assistant','treasurer','adviser','assistant_adviser','officer']::app_role[])
    OR is_occupant_self(id)
    OR is_global_admin()
  );

-- 3. Memberships
DROP POLICY IF EXISTS memberships_select_own_or_admin ON public.dorm_memberships;
CREATE POLICY memberships_select_own_or_admin ON public.dorm_memberships
  FOR SELECT
  USING (user_id = auth.uid() OR has_role(dorm_id, ARRAY['admin']::app_role[]) OR is_global_admin());

-- 4. Rooms
DROP POLICY IF EXISTS rooms_select_member ON public.rooms;
CREATE POLICY rooms_select_member ON public.rooms
  FOR SELECT
  USING (is_dorm_member(dorm_id) OR is_global_admin());

-- 5. Room Assignments
DROP POLICY IF EXISTS room_assignments_select_staff_or_self ON public.room_assignments;
CREATE POLICY room_assignments_select_staff_or_self ON public.room_assignments
  FOR SELECT
  USING (
    has_role(dorm_id, ARRAY['admin','student_assistant','treasurer','adviser','assistant_adviser','officer']::app_role[])
    OR is_occupant_self(occupant_id)
    OR is_global_admin()
  );

-- 6. Announcements (Update existing policy from 20260224090000)
DROP POLICY IF EXISTS dorm_announcements_select_policy ON public.dorm_announcements;
CREATE POLICY dorm_announcements_select_policy ON public.dorm_announcements
  FOR SELECT
  USING (
    (dorm_id IS NULL OR is_dorm_member(dorm_id) OR is_global_admin())
    AND (
      (
        visibility = 'members'
        AND starts_at <= now()
        AND (expires_at IS NULL OR expires_at > now())
      )
      OR (
        dorm_id IS NOT NULL AND (
          has_role(dorm_id, ARRAY['admin','adviser','assistant_adviser','student_assistant','treasurer','officer']::app_role[])
          OR is_global_admin()
        )
      )
      OR (
        dorm_id IS NULL AND is_global_admin()
      )
    )
  );

-- 7. Semesters
DROP POLICY IF EXISTS dorm_semesters_select_member ON public.dorm_semesters;
CREATE POLICY dorm_semesters_select_member ON public.dorm_semesters
  FOR SELECT
  USING (dorm_id IS NULL OR is_dorm_member(dorm_id) OR is_global_admin());

-- 8. Audit Events
DROP POLICY IF EXISTS audit_events_select_member ON public.audit_events;
CREATE POLICY audit_events_select_member ON public.audit_events
  FOR SELECT
  USING (is_dorm_member(dorm_id) OR is_global_admin());
