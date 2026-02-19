with dorm as (
  insert into public.dorms (slug, name, attributes)
  values 
    ('molave-mens-hall', 'Molave Men''s Hall', '{"dorm_type":"men"}'::jsonb),
    ('alpha-dorm', 'Alpha Dorm', '{"dorm_type":"mock"}'::jsonb)
  on conflict (slug)
  do update set name = excluded.name
  returning id
)
insert into public.rooms (dorm_id, code, level, capacity, sort_order)
select dorm.id, room.code, room.level, room.capacity, room.sort_order
from dorm
join (
  values
    ('1', 1, 6, 1),
    ('2', 1, 6, 2),
    ('3', 1, 6, 3),
    ('4a', 2, 5, 4),
    ('4b', 2, 5, 5),
    ('5', 2, 6, 6),
    ('6', 2, 6, 7),
    ('7', 3, 6, 8),
    ('8', 3, 6, 9),
    ('9', 3, 6, 10),
    ('10a', 3, 5, 11),
    ('10b', 3, 5, 12)
) as room(code, level, capacity, sort_order)
on conflict (dorm_id, code)
  do update set
    level = excluded.level,
    capacity = excluded.capacity,
    sort_order = excluded.sort_order;

with dorm as (
  select id from public.dorms where slug = 'molave-mens-hall'
)
insert into public.fine_rules (dorm_id, title, severity, default_pesos, default_points, active)
select dorm.id, rule.title, rule.severity, rule.default_pesos, rule.default_points, true
from dorm
join (
  values
    ('Late Return', 'minor'::fine_severity, 10, -1),
    ('Vandalism', 'major'::fine_severity, 50, -10)
) as rule(title, severity, default_pesos, default_points)
on conflict do nothing;

-- Optional: bootstrap the first admin profile + membership.
-- 1) Create the auth user in Supabase Auth (Dashboard or CLI).
-- 2) Replace <ADMIN_USER_ID> below with the auth.users.id.
-- with dorm as (
--   select id from public.dorms where slug = 'molave-mens-hall'
-- )
-- insert into public.profiles (user_id, display_name)
-- select '<ADMIN_USER_ID>'::uuid, 'Dorm Admin'
-- on conflict (user_id) do update set display_name = excluded.display_name;
--
-- with dorm as (
--   select id from public.dorms where slug = 'molave-mens-hall'
-- )
-- insert into public.dorm_memberships (dorm_id, user_id, role)
-- select dorm.id, '<ADMIN_USER_ID>'::uuid, 'admin'::app_role
-- from dorm
-- on conflict (dorm_id, user_id) do update set role = excluded.role;
