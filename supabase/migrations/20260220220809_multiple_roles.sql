ALTER TABLE public.dorm_memberships
DROP CONSTRAINT IF EXISTS dorm_memberships_dorm_id_user_id_key;

ALTER TABLE public.dorm_memberships
ADD CONSTRAINT dorm_memberships_dorm_id_user_id_role_key UNIQUE (dorm_id, user_id, role);
