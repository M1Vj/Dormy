-- Align semester foreign keys with global semester records.
--
-- Problem:
-- - Semesters are now globally scoped (dorm_semesters.dorm_id = NULL for active terms).
-- - Several tables still enforce composite FKs on (semester_id, dorm_id) -> dorm_semesters(id, dorm_id).
-- - Writes that use ensure_active_semester() now get a global semester id and fail FK checks.
--
-- Fix:
-- 1) Replace composite semester+dorm FKs with semester-only FKs.
-- 2) Backfill existing rows from dorm-scoped semester ids to matching global semester ids when possible.

-- Drop old composite FK constraints (if present).
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_semester_dorm_fkey;
ALTER TABLE public.fines DROP CONSTRAINT IF EXISTS fines_semester_dorm_fkey;
ALTER TABLE public.cleaning_weeks DROP CONSTRAINT IF EXISTS cleaning_weeks_semester_dorm_fkey;
ALTER TABLE public.cleaning_exceptions DROP CONSTRAINT IF EXISTS cleaning_exceptions_semester_dorm_fkey;
ALTER TABLE public.evaluation_cycles DROP CONSTRAINT IF EXISTS evaluation_cycles_semester_dorm_fkey;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_semester_dorm_fkey;
ALTER TABLE public.dorm_announcements DROP CONSTRAINT IF EXISTS dorm_announcements_semester_dorm_fkey;
ALTER TABLE public.fine_reports DROP CONSTRAINT IF EXISTS fine_reports_semester_dorm_fkey;
ALTER TABLE public.fine_report_comments DROP CONSTRAINT IF EXISTS fine_report_comments_semester_dorm_fkey;

-- Drop previously-added semester-only constraints so this migration is idempotent.
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_semester_fkey;
ALTER TABLE public.fines DROP CONSTRAINT IF EXISTS fines_semester_fkey;
ALTER TABLE public.cleaning_weeks DROP CONSTRAINT IF EXISTS cleaning_weeks_semester_fkey;
ALTER TABLE public.cleaning_exceptions DROP CONSTRAINT IF EXISTS cleaning_exceptions_semester_fkey;
ALTER TABLE public.evaluation_cycles DROP CONSTRAINT IF EXISTS evaluation_cycles_semester_fkey;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_semester_fkey;
ALTER TABLE public.dorm_announcements DROP CONSTRAINT IF EXISTS dorm_announcements_semester_fkey;
ALTER TABLE public.fine_reports DROP CONSTRAINT IF EXISTS fine_reports_semester_fkey;
ALTER TABLE public.fine_report_comments DROP CONSTRAINT IF EXISTS fine_report_comments_semester_fkey;

-- Backfill dorm-scoped semester ids to matching global semester ids.
WITH semester_mapping AS (
  SELECT
    dorm_sem.id AS legacy_id,
    global_sem.id AS global_id
  FROM public.dorm_semesters dorm_sem
  JOIN public.dorm_semesters global_sem
    ON global_sem.dorm_id IS NULL
   AND global_sem.school_year = dorm_sem.school_year
   AND global_sem.semester = dorm_sem.semester
  WHERE dorm_sem.dorm_id IS NOT NULL
)
UPDATE public.events e
SET semester_id = sm.global_id
FROM semester_mapping sm
WHERE e.semester_id = sm.legacy_id;

WITH semester_mapping AS (
  SELECT
    dorm_sem.id AS legacy_id,
    global_sem.id AS global_id
  FROM public.dorm_semesters dorm_sem
  JOIN public.dorm_semesters global_sem
    ON global_sem.dorm_id IS NULL
   AND global_sem.school_year = dorm_sem.school_year
   AND global_sem.semester = dorm_sem.semester
  WHERE dorm_sem.dorm_id IS NOT NULL
)
UPDATE public.fines f
SET semester_id = sm.global_id
FROM semester_mapping sm
WHERE f.semester_id = sm.legacy_id;

WITH semester_mapping AS (
  SELECT
    dorm_sem.id AS legacy_id,
    global_sem.id AS global_id
  FROM public.dorm_semesters dorm_sem
  JOIN public.dorm_semesters global_sem
    ON global_sem.dorm_id IS NULL
   AND global_sem.school_year = dorm_sem.school_year
   AND global_sem.semester = dorm_sem.semester
  WHERE dorm_sem.dorm_id IS NOT NULL
)
UPDATE public.cleaning_weeks cw
SET semester_id = sm.global_id
FROM semester_mapping sm
WHERE cw.semester_id = sm.legacy_id;

WITH semester_mapping AS (
  SELECT
    dorm_sem.id AS legacy_id,
    global_sem.id AS global_id
  FROM public.dorm_semesters dorm_sem
  JOIN public.dorm_semesters global_sem
    ON global_sem.dorm_id IS NULL
   AND global_sem.school_year = dorm_sem.school_year
   AND global_sem.semester = dorm_sem.semester
  WHERE dorm_sem.dorm_id IS NOT NULL
)
UPDATE public.cleaning_exceptions ce
SET semester_id = sm.global_id
FROM semester_mapping sm
WHERE ce.semester_id = sm.legacy_id;

WITH semester_mapping AS (
  SELECT
    dorm_sem.id AS legacy_id,
    global_sem.id AS global_id
  FROM public.dorm_semesters dorm_sem
  JOIN public.dorm_semesters global_sem
    ON global_sem.dorm_id IS NULL
   AND global_sem.school_year = dorm_sem.school_year
   AND global_sem.semester = dorm_sem.semester
  WHERE dorm_sem.dorm_id IS NOT NULL
)
UPDATE public.evaluation_cycles ec
SET semester_id = sm.global_id
FROM semester_mapping sm
WHERE ec.semester_id = sm.legacy_id;

WITH semester_mapping AS (
  SELECT
    dorm_sem.id AS legacy_id,
    global_sem.id AS global_id
  FROM public.dorm_semesters dorm_sem
  JOIN public.dorm_semesters global_sem
    ON global_sem.dorm_id IS NULL
   AND global_sem.school_year = dorm_sem.school_year
   AND global_sem.semester = dorm_sem.semester
  WHERE dorm_sem.dorm_id IS NOT NULL
)
UPDATE public.expenses e
SET semester_id = sm.global_id
FROM semester_mapping sm
WHERE e.semester_id = sm.legacy_id;

WITH semester_mapping AS (
  SELECT
    dorm_sem.id AS legacy_id,
    global_sem.id AS global_id
  FROM public.dorm_semesters dorm_sem
  JOIN public.dorm_semesters global_sem
    ON global_sem.dorm_id IS NULL
   AND global_sem.school_year = dorm_sem.school_year
   AND global_sem.semester = dorm_sem.semester
  WHERE dorm_sem.dorm_id IS NOT NULL
)
UPDATE public.dorm_announcements da
SET semester_id = sm.global_id
FROM semester_mapping sm
WHERE da.semester_id = sm.legacy_id;

WITH semester_mapping AS (
  SELECT
    dorm_sem.id AS legacy_id,
    global_sem.id AS global_id
  FROM public.dorm_semesters dorm_sem
  JOIN public.dorm_semesters global_sem
    ON global_sem.dorm_id IS NULL
   AND global_sem.school_year = dorm_sem.school_year
   AND global_sem.semester = dorm_sem.semester
  WHERE dorm_sem.dorm_id IS NOT NULL
)
UPDATE public.fine_reports fr
SET semester_id = sm.global_id
FROM semester_mapping sm
WHERE fr.semester_id = sm.legacy_id;

WITH semester_mapping AS (
  SELECT
    dorm_sem.id AS legacy_id,
    global_sem.id AS global_id
  FROM public.dorm_semesters dorm_sem
  JOIN public.dorm_semesters global_sem
    ON global_sem.dorm_id IS NULL
   AND global_sem.school_year = dorm_sem.school_year
   AND global_sem.semester = dorm_sem.semester
  WHERE dorm_sem.dorm_id IS NOT NULL
)
UPDATE public.fine_report_comments frc
SET semester_id = sm.global_id
FROM semester_mapping sm
WHERE frc.semester_id = sm.legacy_id;

-- Add semester-only FK constraints.
ALTER TABLE public.events
  ADD CONSTRAINT events_semester_fkey
  FOREIGN KEY (semester_id)
  REFERENCES public.dorm_semesters(id)
  ON DELETE SET NULL;

ALTER TABLE public.fines
  ADD CONSTRAINT fines_semester_fkey
  FOREIGN KEY (semester_id)
  REFERENCES public.dorm_semesters(id)
  ON DELETE SET NULL;

ALTER TABLE public.cleaning_weeks
  ADD CONSTRAINT cleaning_weeks_semester_fkey
  FOREIGN KEY (semester_id)
  REFERENCES public.dorm_semesters(id)
  ON DELETE SET NULL;

ALTER TABLE public.cleaning_exceptions
  ADD CONSTRAINT cleaning_exceptions_semester_fkey
  FOREIGN KEY (semester_id)
  REFERENCES public.dorm_semesters(id)
  ON DELETE SET NULL;

ALTER TABLE public.evaluation_cycles
  ADD CONSTRAINT evaluation_cycles_semester_fkey
  FOREIGN KEY (semester_id)
  REFERENCES public.dorm_semesters(id)
  ON DELETE SET NULL;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_semester_fkey
  FOREIGN KEY (semester_id)
  REFERENCES public.dorm_semesters(id)
  ON DELETE CASCADE;

ALTER TABLE public.dorm_announcements
  ADD CONSTRAINT dorm_announcements_semester_fkey
  FOREIGN KEY (semester_id)
  REFERENCES public.dorm_semesters(id)
  ON DELETE SET NULL;

ALTER TABLE public.fine_reports
  ADD CONSTRAINT fine_reports_semester_fkey
  FOREIGN KEY (semester_id)
  REFERENCES public.dorm_semesters(id)
  ON DELETE CASCADE;

ALTER TABLE public.fine_report_comments
  ADD CONSTRAINT fine_report_comments_semester_fkey
  FOREIGN KEY (semester_id)
  REFERENCES public.dorm_semesters(id)
  ON DELETE CASCADE;
