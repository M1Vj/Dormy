create or replace function public.get_evaluation_summary(p_cycle_id uuid)
returns table (
  occupant_id uuid,
  full_name text,
  peer_score numeric,
  adviser_score numeric,
  rating_score numeric,
  total_fine_points numeric,
  sa_score numeric,
  final_score numeric
)
language sql
stable
set search_path = public
as $$
  with active_template as (
    select et.id, et.dorm_id, et.rater_group_weights
    from public.evaluation_templates et
    where et.cycle_id = p_cycle_id
      and et.status = 'active'
    order by et.created_at desc
    limit 1
  ),
  submission_scores as (
    select
      es.id as submission_id,
      es.ratee_occupant_id,
      es.rater_occupant_id,
      es.dorm_id,
      case
        when sum(em.weight_pct) = 0 then null
        else sum(ems.score * em.weight_pct) / sum(em.weight_pct)
      end as weighted_score
    from public.evaluation_submissions es
    join public.evaluation_metric_scores ems on ems.submission_id = es.id
    join public.evaluation_metrics em on em.id = ems.metric_id
    join active_template at on at.id = es.template_id
    group by es.id, es.ratee_occupant_id, es.rater_occupant_id, es.dorm_id
  ),
  submission_norm as (
    select
      submission_id,
      ratee_occupant_id,
      rater_occupant_id,
      dorm_id,
      case
        when weighted_score is null then null
        else (weighted_score / 5.0) * 100
      end as normalized_score
    from submission_scores
  ),
  rater_roles as (
    select
      sn.ratee_occupant_id,
      sn.dorm_id,
      sn.normalized_score,
      case
        when dm.role in ('adviser', 'assistant_adviser') then 'adviser'
        else 'peer'
      end as rater_role
    from submission_norm sn
    left join public.occupants o on o.id = sn.rater_occupant_id
    left join public.dorm_memberships dm
      on dm.user_id = o.user_id
      and dm.dorm_id = sn.dorm_id
  ),
  aggregated_ratings as (
    select
      ratee_occupant_id,
      rater_role,
      avg(normalized_score) as avg_score
    from rater_roles
    group by ratee_occupant_id, rater_role
  ),
  fines_summary as (
    select
      occupant_id,
      sum(points) as total_fine_points
    from public.fines
    group by occupant_id
  ),
  weights as (
    select
      coalesce((rater_group_weights->>'peer')::numeric, 0) as peer_weight,
      coalesce((rater_group_weights->>'adviser')::numeric, 0) as adviser_weight
    from active_template
  )
  select
    o.id as occupant_id,
    o.full_name,
    peer.avg_score as peer_score,
    adviser.avg_score as adviser_score,
    (coalesce(peer.avg_score, 0) * weights.peer_weight
      + coalesce(adviser.avg_score, 0) * weights.adviser_weight) as rating_score,
    coalesce(f.total_fine_points, 0) as total_fine_points,
    greatest(0, 100 - coalesce(f.total_fine_points, 0)) as sa_score,
    (
      (coalesce(peer.avg_score, 0) * weights.peer_weight
        + coalesce(adviser.avg_score, 0) * weights.adviser_weight)
      + greatest(0, 100 - coalesce(f.total_fine_points, 0))
    ) / 2 as final_score
  from active_template at
  join public.occupants o on o.dorm_id = at.dorm_id
  left join aggregated_ratings peer
    on peer.ratee_occupant_id = o.id and peer.rater_role = 'peer'
  left join aggregated_ratings adviser
    on adviser.ratee_occupant_id = o.id and adviser.rater_role = 'adviser'
  left join fines_summary f on f.occupant_id = o.id
  cross join weights
  where o.status = 'active'
  order by final_score desc nulls last, o.full_name asc;
$$;

grant execute on function public.get_evaluation_summary(uuid) to authenticated;
