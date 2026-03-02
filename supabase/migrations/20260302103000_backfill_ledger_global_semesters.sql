-- Backfill ledger entries from dorm-specific semester ids to matching global semester ids.
--
-- This is needed after switching to global semesters (dorm_semesters.dorm_id IS NULL),
-- because historical ledger rows can still point to archived dorm-specific semester ids.

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
UPDATE public.ledger_entries le
SET semester_id = sm.global_id
FROM semester_mapping sm
WHERE le.semester_id = sm.legacy_id;
