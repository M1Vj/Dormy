-- Ensure contribution collected totals include only payments actually received by the treasurer.
-- Excludes paid_elsewhere and optional_declined rows even when legacy rows are tagged as payments.

create or replace function public.get_public_contribution_summary(token_uuid uuid)
returns table (
  title text,
  total_amount numeric,
  participant_count bigint,
  dorm_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    case
      when p.entity_type = 'event' then (select e.title from events e where e.id = p.entity_id)
      else 'General Fund'
    end as title,
    coalesce(sum(abs(l.amount_pesos)), 0) as total_amount,
    count(distinct l.occupant_id) as participant_count,
    d.name as dorm_name
  from public_view_tokens p
  join dorms d on d.id = p.dorm_id
  left join ledger_entries l on (
    l.dorm_id = p.dorm_id
    and l.entry_type = 'payment'
    and l.voided_at is null
    and coalesce((l.metadata->>'paid_elsewhere')::boolean, false) = false
    and coalesce((l.metadata->>'optional_declined')::boolean, false) = false
    and lower(trim(coalesce(l.metadata->>'status', ''))) not in ('paid_elsewhere', 'declined')
    and coalesce(l.method, '') not in ('paid_elsewhere', 'optional_decline')
    and (
      (p.entity_type = 'event' and l.event_id = p.entity_id) or
      (p.entity_type = 'finance_ledger' and l.ledger::text = p.entity_id::text)
    )
  )
  where p.token = token_uuid
    and p.is_active = true
    and (p.expires_at is null or p.expires_at > now())
  group by p.id, p.entity_type, p.entity_id, d.name;
end;
$$;

create or replace function public.get_committee_finance_summary(p_committee_id uuid)
returns table(event_id uuid, event_title text, charged_pesos numeric, collected_pesos numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
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
        sum(
          case
            when le.entry_type = 'payment'
              and coalesce((le.metadata->>'paid_elsewhere')::boolean, false) = false
              and coalesce((le.metadata->>'optional_declined')::boolean, false) = false
              and lower(trim(coalesce(le.metadata->>'status', ''))) not in ('paid_elsewhere', 'declined')
              and coalesce(le.method, '') not in ('paid_elsewhere', 'optional_decline')
            then abs(le.amount_pesos)
            else 0
          end
        ),
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
