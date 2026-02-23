-- Update get_committee_finance_summary to use 'contributions' instead of 'treasurer_events'
CREATE OR REPLACE FUNCTION public.get_committee_finance_summary(p_committee_id uuid)
 RETURNS TABLE(event_id uuid, event_title text, charged_pesos numeric, collected_pesos numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      and le.ledger = 'contributions'
      and le.voided_at is null
    where e.committee_id = p_committee_id
    group by e.id, e.title, e.starts_at, e.created_at
    order by e.starts_at desc nulls last, e.created_at desc;
end;
$function$;

-- Migrate any existing legacy ledger names to new ones
UPDATE public.ledger_entries
SET ledger = 'contributions'
WHERE ledger = 'treasurer_events';

UPDATE public.ledger_entries
SET ledger = 'maintenance_fee'
WHERE ledger = 'adviser_maintenance';
