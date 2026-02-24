-- Add extra fields to dorms table if they don't exist
ALTER TABLE public.dorms 
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS capacity integer,
ADD COLUMN IF NOT EXISTS image_url text;

-- Make dorm_id nullable in dorm_announcements for global announcements
ALTER TABLE public.dorm_announcements ALTER COLUMN dorm_id DROP NOT NULL;

-- Make dorm_id nullable in dorm_semesters for global semesters
ALTER TABLE public.dorm_semesters ALTER COLUMN dorm_id DROP NOT NULL;

-- Update unique constraints for semesters
-- 1. One active semester per dorm (for dorm-specific ones)
DROP INDEX IF EXISTS dorm_semesters_one_active_per_dorm;
CREATE UNIQUE INDEX IF NOT EXISTS dorm_semesters_one_active_per_dorm
  ON public.dorm_semesters (dorm_id)
  WHERE status = 'active' AND dorm_id IS NOT NULL;

-- 2. One active global semester
CREATE UNIQUE INDEX IF NOT EXISTS dorm_semesters_one_active_global
  ON public.dorm_semesters (status)
  WHERE status = 'active' AND dorm_id IS NULL;

-- 3. Unique school_year/semester globally if dorm_id is null
ALTER TABLE public.dorm_semesters DROP CONSTRAINT IF EXISTS dorm_semesters_dorm_id_school_year_semester_key;
-- (Existing constraint was unique (dorm_id, school_year, semester))
-- If dorm_id is null, PG handles it as distinct unless we use coalesce or another index.
CREATE UNIQUE INDEX IF NOT EXISTS dorm_semesters_global_unique
  ON public.dorm_semesters (school_year, semester)
  WHERE dorm_id IS NULL;

-- Update Select policy for announcements to allow global ones
DROP POLICY IF EXISTS dorm_announcements_select_policy ON public.dorm_announcements;
CREATE POLICY dorm_announcements_select_policy ON public.dorm_announcements
  FOR SELECT
  USING (
    (dorm_id IS NULL OR is_dorm_member(dorm_id))
    AND (
      (
        visibility = 'members'
        AND starts_at <= now()
        AND (expires_at IS NULL OR expires_at > now())
      )
      OR (
        dorm_id IS NOT NULL AND has_role(
          dorm_id,
          ARRAY['admin','adviser','assistant_adviser','student_assistant','treasurer','officer']::app_role[]
        )
      )
      OR (
        dorm_id IS NULL AND EXISTS (
          SELECT 1 FROM dorm_memberships 
          WHERE user_id = auth.uid() 
          AND role = 'admin'
        )
      )
    )
  );

-- Update Select policy for semesters to allow anyone authenticated to see global ones
DROP POLICY IF EXISTS dorm_semesters_select_member ON public.dorm_semesters;
CREATE POLICY dorm_semesters_select_member ON public.dorm_semesters
  FOR SELECT
  USING (dorm_id IS NULL OR public.is_dorm_member(dorm_id));
