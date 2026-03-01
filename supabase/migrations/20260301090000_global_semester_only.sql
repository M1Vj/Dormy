-- Migration: Make semesters globally scoped (not per-dorm)
-- 
-- Root cause: ensure_active_semester() was creating dorm-specific semester
-- records (dorm_id = p_dorm_id) causing each dorm to have its own isolated
-- semester instead of sharing one global term.
--
-- Fix:
-- 1. Replace the RPC so it always looks for and creates global semesters
--    (dorm_id IS NULL). Dorm-level usage still resolves via the same function.
-- 2. Remove any dorm-specific auto-created semesters that clash with a
--    matching global one (safe, only drops auto_created = true duplicates).
-- 3. Ensure a proper 2025-2026 2nd Semester global record exists.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Seed the correct global semester (2025-2026 2nd Semester)
--    Uses INSERT ... ON CONFLICT DO NOTHING so re-running is safe.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.dorm_semesters (
  dorm_id,
  school_year,
  semester,
  label,
  starts_on,
  ends_on,
  status
)
VALUES (
  NULL,
  '2025-2026',
  '2nd',
  '2025-2026 2nd Semester',
  '2026-01-01',
  '2026-05-31',
  'active'
)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Archive / deactivate stale auto-created per-dorm semesters whose label
--    matches the global one so they no longer shadow it.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.dorm_semesters
SET    status = 'archived',
       archived_at = now()
WHERE  dorm_id IS NOT NULL
  AND  (metadata->>'auto_created')::boolean IS TRUE
  AND  status = 'active'
  AND  EXISTS (
         SELECT 1
         FROM   public.dorm_semesters g
         WHERE  g.dorm_id IS NULL
           AND  g.status  = 'active'
           AND  g.school_year = dorm_semesters.school_year
           AND  g.semester    = dorm_semesters.semester
       );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Replace ensure_active_semester() to always manage the GLOBAL semester
--    (dorm_id = NULL). Any dorm passing its own ID will resolve the same
--    global record, keeping the single-term invariant intact.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_active_semester(p_dorm_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_semester_id uuid;
  v_year        int;
  v_month       int;
  v_school_year text;
  v_semester    text;
  v_label       text;
  v_start       date;
  v_end         date;
BEGIN
  -- Always look for a GLOBAL (dorm_id IS NULL) active semester first.
  -- Dorm-specific rows are intentionally ignored; the global row wins.
  SELECT id
  INTO   v_semester_id
  FROM   public.dorm_semesters
  WHERE  dorm_id IS NULL
    AND  status = 'active'
    AND  starts_on <= current_date
    AND  ends_on   >= current_date
  LIMIT 1;

  IF v_semester_id IS NOT NULL THEN
    RETURN v_semester_id;
  END IF;

  -- No global active semester found — auto-create one based on today's date.
  v_year  := EXTRACT(YEAR  FROM current_date)::int;
  v_month := EXTRACT(MONTH FROM current_date)::int;

  IF v_month BETWEEN 6 AND 10 THEN
    -- June–October → 1st Semester
    v_school_year := format('%s-%s', v_year, v_year + 1);
    v_semester    := '1st';
    v_label       := format('%s 1st Semester', v_school_year);
    v_start       := make_date(v_year,     6, 1);
    v_end         := make_date(v_year,    10, 31);
  ELSIF v_month BETWEEN 11 AND 12 THEN
    -- November–December → 2nd Semester (early months)
    v_school_year := format('%s-%s', v_year, v_year + 1);
    v_semester    := '2nd';
    v_label       := format('%s 2nd Semester', v_school_year);
    v_start       := make_date(v_year,    11, 1);
    v_end         := make_date(v_year + 1, 3, 31);
  ELSE
    -- January–May → 2nd Semester (late months)
    v_school_year := format('%s-%s', v_year - 1, v_year);
    v_semester    := '2nd';
    v_label       := format('%s 2nd Semester', v_school_year);
    v_start       := make_date(v_year - 1, 11, 1);
    v_end         := make_date(v_year,      5, 31);
  END IF;

  BEGIN
    INSERT INTO public.dorm_semesters (
      dorm_id,      -- NULL = global
      school_year,
      semester,
      label,
      starts_on,
      ends_on,
      status,
      metadata
    )
    VALUES (
      NULL,
      v_school_year,
      v_semester,
      v_label,
      v_start,
      v_end,
      'active',
      jsonb_build_object('auto_created', true)
    )
    RETURNING id INTO v_semester_id;

  EXCEPTION
    WHEN unique_violation THEN
      -- Already exists (race condition); just fetch it.
      SELECT id
      INTO   v_semester_id
      FROM   public.dorm_semesters
      WHERE  dorm_id IS NULL
        AND  status  = 'active'
      LIMIT 1;
  END;

  RETURN v_semester_id;
END;
$$;
