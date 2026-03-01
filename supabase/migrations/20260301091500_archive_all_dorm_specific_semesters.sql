-- Migration: Archive ALL remaining dorm-specific active semesters
--
-- The previous migration only archived rows where metadata->>'auto_created' = true.
-- Any rows created without that flag (older RPC versions, manual inserts) are still
-- active and shadow the global semester in getActiveSemester.
--
-- Since semesters are now fully global (dorm_id = NULL), we unconditionally
-- archive every dorm-specific active semester.

UPDATE public.dorm_semesters
SET    status      = 'archived',
       archived_at = now()
WHERE  dorm_id IS NOT NULL
  AND  status = 'active';
