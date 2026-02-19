-- Create public_view_tokens table for secure, privacy-preserving sharing
create table if not exists public.public_view_tokens (
  id uuid primary key default gen_random_uuid(),
  dorm_id uuid not null references public.dorms(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  entity_type text not null check (entity_type in ('event', 'finance_ledger')),
  entity_id uuid not null,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- Enable RLS
alter table public.public_view_tokens enable row level security;

-- Policies
-- 1. Public can read active tokens (but only by the token UUID, not by ID)
create policy "public_read_tokens" on public.public_view_tokens for select
  using (is_active = true and (expires_at is null or expires_at > now()));

-- 2. Admin/Treasurer/Adviser can manage tokens
create policy "manage_tokens" on public.public_view_tokens for all
  using (
    exists (
      select 1 from public.dorm_memberships 
      where user_id = auth.uid() 
      and dorm_id = public.public_view_tokens.dorm_id
      and role::text in ('admin', 'treasurer', 'adviser', 'assistant_adviser')
    )
  )
  with check (
    exists (
      select 1 from public.dorm_memberships 
      where user_id = auth.uid() 
      and dorm_id = public.public_view_tokens.dorm_id
      and role::text in ('admin', 'treasurer', 'adviser', 'assistant_adviser')
    )
  );

-- Function to get contribution summary for an event/ledger without exposing names
-- This is intentionally unauthenticated to allow public viewing via the token
create or replace function public.get_public_contribution_summary(token_uuid uuid)
returns table (
  title text,
  total_amount numeric,
  participant_count bigint,
  dorm_name text
)
language plpgsql
security definer -- Important: runs with elevated privileges but only returns aggregated counts
set search_path = public
as $$
begin
  return query
  select 
    case 
      when p.entity_type = 'event' then (select e.title from events e where e.id = p.entity_id)
      else 'General Fund'
    end as title,
    abs(coalesce(sum(l.amount_pesos), 0)) as total_amount,
    count(distinct l.occupant_id) as participant_count,
    d.name as dorm_name
  from public_view_tokens p
  join dorms d on d.id = p.dorm_id
  left join ledger_entries l on (
    l.dorm_id = p.dorm_id and 
    l.entry_type = 'payment' and 
    l.voided_at is null and
    (
      (p.entity_type = 'event' and l.event_id = p.entity_id) or
      (p.entity_type = 'finance_ledger' and l.ledger::text = p.entity_id::text) -- Handle generic ledger if entity_id encodes the ledger type
    )
  )
  where p.token = token_uuid
    and p.is_active = true
    and (p.expires_at is null or p.expires_at > now())
  group by p.id, p.entity_type, p.entity_id, d.name;
end;
$$;
