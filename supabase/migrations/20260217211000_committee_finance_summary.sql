create or replace function public.get_committee_finance_summary(p_committee_id uuid)
returns table (
  event_id uuid,
  event_title text,
  charged_pesos numeric,
  collected_pesos numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dorm_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select dorm_id
    into v_dorm_id
  from public.committees
  where id = p_committee_id;

  if v_dorm_id is null then
    raise exception 'Committee not found';
  end if;

  if not exists (
    select 1
    from public.dorm_memberships dm
    where dm.dorm_id = v_dorm_id
      and dm.user_id = auth.uid()
  ) then
    raise exception 'Forbidden';
  end if;

  return query
    select
      e.id as event_id,
      e.title as event_title,
      coalesce(
        sum(case when le.amount_pesos > 0 then le.amount_pesos else 0 end),
        0
      ) as charged_pesos,
      coalesce(
        sum(case when le.amount_pesos < 0 then abs(le.amount_pesos) else 0 end),
        0
      ) as collected_pesos
    from public.events e
    left join public.ledger_entries le
      on le.dorm_id = e.dorm_id
      and le.event_id = e.id
      and le.ledger = 'treasurer_events'
      and le.voided_at is null
    where e.committee_id = p_committee_id
    group by e.id, e.title, e.starts_at, e.created_at
    order by e.starts_at desc nulls last, e.created_at desc;
end;
$$;

revoke all on function public.get_committee_finance_summary(uuid) from public;
grant execute on function public.get_committee_finance_summary(uuid) to authenticated;

