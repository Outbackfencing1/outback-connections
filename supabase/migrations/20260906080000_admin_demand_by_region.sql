-- ============================================================
-- Demand by region: Josh's planning report
-- ============================================================
-- What farmers ask for, where, and whether anyone is listed to do it.
-- Sources: quote requests (listing_enquiries), job requests (service_request
-- listings), human searches with a location, and current supply (active
-- service offerings). Region = regions.region_name via postcode. Aggregate
-- only; no personal data leaves the table.
--
-- Rollback: drop function public.admin_demand_by_region(int);
-- ============================================================

create or replace function public.admin_demand_by_region(p_months int default 6)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
  with win as (
    select date_trunc('month', now()) - make_interval(months => greatest(p_months, 1) - 1) as start_at
  ),
  reg as (
    select distinct on (postcode) postcode, region_name, state
      from public.regions
     where region_name is not null
     order by postcode, region_name
  ),
  enq as (
    select date_trunc('month', q.created_at) as m, r.region_name, r.state, q.category_slug as cat
      from public.listing_enquiries q
      left join reg r on r.postcode = q.postcode
     where q.status <> 'spam'
       and q.created_at >= (select start_at from win)
  ),
  req as (
    select date_trunc('month', l.created_at) as m, r.region_name, r.state, c.slug as cat
      from public.listings l
      join public.categories c on c.id = l.category_id
      left join reg r on r.postcode = l.postcode
     where l.kind = 'service_request'
       and l.created_at >= (select start_at from win)
  ),
  srch as (
    select date_trunc('month', s.created_at) as m, r.region_name, r.state,
           s.filters->>'category' as cat, s.result_count
      from public.search_queries s
      left join reg r on r.postcode = s.postcode
     where s.is_bot = false
       and s.created_at >= (select start_at from win)
       and s.postcode is not null
  ),
  supply as (
    select r.region_name, r.state, c.slug as cat, count(*)::int as n
      from public.listings l
      join public.categories c on c.id = l.category_id
      left join reg r on r.postcode = l.postcode
     where l.kind = 'service_offering'
       and l.status = 'active'
       and l.expires_at > now()
     group by 1, 2, 3
  ),
  keys as (
    select region_name, state, cat from enq
    union select region_name, state, cat from req
    union select region_name, state, cat from srch
    union select region_name, state, cat from supply
  ),
  by_region as (
    select k.region_name, k.state, k.cat as category,
      (select count(*)::int from enq e
        where e.region_name is not distinct from k.region_name
          and e.state is not distinct from k.state
          and e.cat is not distinct from k.cat) as enquiries,
      (select count(*)::int from req e
        where e.region_name is not distinct from k.region_name
          and e.state is not distinct from k.state
          and e.cat is not distinct from k.cat) as requests,
      (select count(*)::int from srch e
        where e.region_name is not distinct from k.region_name
          and e.state is not distinct from k.state
          and e.cat is not distinct from k.cat) as searches,
      (select count(*)::int from srch e
        where e.region_name is not distinct from k.region_name
          and e.state is not distinct from k.state
          and e.cat is not distinct from k.cat
          and e.result_count = 0) as zero_result_searches,
      (select coalesce(sum(n), 0)::int from supply s
        where s.region_name is not distinct from k.region_name
          and s.state is not distinct from k.state
          and s.cat is not distinct from k.cat) as supply
      from keys k
  ),
  months as (
    select generate_series((select start_at from win), date_trunc('month', now()), interval '1 month') as m
  )
  select jsonb_build_object(
    'window_months', greatest(p_months, 1),
    'by_region', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'region_name', t.region_name, 'state', t.state, 'category', t.category,
        'enquiries', t.enquiries, 'requests', t.requests, 'searches', t.searches,
        'zero_result_searches', t.zero_result_searches, 'supply', t.supply,
        'demand', t.enquiries + t.requests + t.searches
      ) order by (t.enquiries + t.requests + t.searches) desc, t.supply desc, t.region_name nulls last), '[]'::jsonb)
      from by_region t
      where t.enquiries + t.requests + t.searches + t.supply > 0
    ),
    'by_month', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(mm.m, 'YYYY-MM'),
        'enquiries', (select count(*)::int from enq e where e.m = mm.m),
        'requests', (select count(*)::int from req e where e.m = mm.m),
        'searches', (select count(*)::int from srch e where e.m = mm.m)
      ) order by mm.m), '[]'::jsonb)
      from months mm
    ),
    'gaps', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'region_name', t.region_name, 'state', t.state, 'category', t.category,
        'demand', t.enquiries + t.requests + t.searches
      ) order by (t.enquiries + t.requests + t.searches) desc), '[]'::jsonb)
      from by_region t
      where t.supply = 0 and t.enquiries + t.requests + t.searches > 0
    )
  );
$fn$;

revoke all on function public.admin_demand_by_region(int) from public, anon, authenticated;
grant execute on function public.admin_demand_by_region(int) to service_role;
