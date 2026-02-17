create or replace function public.get_dorm_occupant_directory(p_dorm_id uuid)
returns table (
  id uuid,
  full_name text,
  student_id text,
  classification text,
  room_code text,
  room_level integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.full_name,
    o.student_id,
    o.classification,
    r.code as room_code,
    r.level as room_level
  from public.occupants o
  left join public.room_assignments ra
    on ra.dorm_id = o.dorm_id
   and ra.occupant_id = o.id
   and ra.end_date is null
  left join public.rooms r
    on r.dorm_id = o.dorm_id
   and r.id = ra.room_id
  where o.dorm_id = p_dorm_id
    and o.status = 'active'
    and public.is_dorm_member(p_dorm_id)
  order by o.full_name;
$$;

grant execute on function public.get_dorm_occupant_directory(uuid) to anon, authenticated;

