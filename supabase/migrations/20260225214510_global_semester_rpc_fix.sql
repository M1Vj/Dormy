create or replace function public.ensure_active_semester(p_dorm_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semester_id uuid;
  v_year int;
  v_school_year text;
  v_start date;
  v_end date;
begin
  select id
  into v_semester_id
  from public.dorm_semesters
  where (dorm_id = p_dorm_id or dorm_id is null)
    and status = 'active'
    and starts_on <= current_date     
  order by dorm_id NULLS LAST
  limit 1;

  if v_semester_id is not null then
    return v_semester_id;
  end if;

  v_year := extract(year from current_date)::int;

  if extract(month from current_date)::int >= 6 then
    v_school_year := format('%s-%s', v_year, v_year + 1);
    v_start := make_date(v_year, 6, 1);
    v_end := make_date(v_year + 1, 5, 31);
  else
    v_school_year := format('%s-%s', v_year - 1, v_year);
    v_start := make_date(v_year - 1, 6, 1);
    v_end := make_date(v_year, 5, 31);
  end if;

  begin
    insert into public.dorm_semesters (
      dorm_id,
      school_year,
      semester,
      label,
      starts_on,
      ends_on,
      status,
      metadata
    )
    values (
      p_dorm_id,
      v_school_year,
      '1st',
      format('%s 1st Semester', v_school_year),
      v_start,
      v_end,
      'active',
      jsonb_build_object('auto_created', true)
    )
    returning id into v_semester_id;
  exception
    when unique_violation then
      select id
      into v_semester_id
      from public.dorm_semesters
      where dorm_id = p_dorm_id
        and status = 'active'
      limit 1;
  end;

  return v_semester_id;
end;
$$;
