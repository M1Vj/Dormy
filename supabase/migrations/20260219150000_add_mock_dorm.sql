-- Add Alpha Dorm for mock data
insert into public.dorms (slug, name, attributes)
values ('alpha-dorm', 'Alpha Dorm', '{"dorm_type":"mock"}'::jsonb)
on conflict (slug) do nothing;
