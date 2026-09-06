-- ============================================================
-- Review fixes (6 Sep 2026 evening code review of the day's work)
-- ============================================================
-- 1. events / search_queries vertical checks still excluded 'sale', so every
--    logEvent/logSearch from the for-sale pages was silently rejected.
-- 2. business_response_stats() answered for any listing id; now only for a
--    live service offering (zeros otherwise). Still aggregate-only, anon.
-- 3. admin_demand_by_region() v4: months bucketed in Australia/Sydney (was
--    UTC, so the first ~10 hours of each month fell into the previous one
--    while Shopify months are store-local); correlated subqueries replaced
--    by grouped joins; coverage in one scan.
--
-- Rollback: restore the two check constraints without 'sale'; re-apply
-- 20260906100000 for business_response_stats and 20260906120000 for
-- admin_demand_by_region.
-- ============================================================

alter table public.events drop constraint if exists events_vertical_check;
alter table public.events add constraint events_vertical_check
  check (vertical is null or vertical = any (array['job','freight','service','harvest','livestock','sale']));

alter table public.search_queries drop constraint if exists search_queries_vertical_check;
alter table public.search_queries add constraint search_queries_vertical_check
  check (vertical is null or vertical = any (array['job','freight','service','harvest','livestock','sale']));

create or replace function public.business_response_stats(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  with l as (
    select id, business_id
      from public.listings
     where id = p_listing_id
       and kind = 'service_offering'
       and status = 'active'
       and expires_at > now()
  ),
  q as (
    select e.outcome
      from public.listing_enquiries e, l
     where e.status = 'forwarded'
       and e.created_at > now() - interval '12 months'
       and (
         case when l.business_id is not null
              then e.business_id = l.business_id
              else e.listing_id = l.id
         end
       )
  )
  select jsonb_build_object(
    'forwarded', (select count(*) from q),
    'answered',  (select count(*) from q where outcome is not null),
    'responded', (select count(*) from q where outcome = 'responded')
  );
$fn$;

create or replace function public.admin_demand_by_region(p_months int default 6)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
  with win as (
    select date_trunc('month', timezone('Australia/Sydney', now()))
           - make_interval(months => greatest(p_months, 1) - 1) as start_local
  ),
  reg as (
    select distinct on (postcode) postcode, region_name, state
      from public.regions
     where region_name is not null
     order by postcode, region_name
  ),
  enq as (
    select date_trunc('month', timezone('Australia/Sydney', q.created_at)) as m,
           coalesce(r.region_name, '') as region_name, coalesce(r.state, '') as state,
           coalesce(q.category_slug, '') as cat
      from public.listing_enquiries q
      left join reg r on r.postcode = q.postcode
     where q.status <> 'spam'
       and timezone('Australia/Sydney', q.created_at) >= (select start_local from win)
  ),
  req as (
    select date_trunc('month', timezone('Australia/Sydney', l.created_at)) as m,
           coalesce(r.region_name, '') as region_name, coalesce(r.state, '') as state,
           c.slug as cat
      from public.listings l
      join public.categories c on c.id = l.category_id
      left join reg r on r.postcode = l.postcode
     where l.kind = 'service_request'
       and timezone('Australia/Sydney', l.created_at) >= (select start_local from win)
  ),
  srch as (
    select date_trunc('month', timezone('Australia/Sydney', s.created_at)) as m,
           coalesce(r.region_name, '') as region_name, coalesce(r.state, '') as state,
           coalesce(s.filters->>'category', '') as cat, s.result_count
      from public.search_queries s
      left join reg r on r.postcode = s.postcode
     where s.is_bot = false
       and s.postcode is not null
       and timezone('Australia/Sydney', s.created_at) >= (select start_local from win)
  ),
  supply as (
    select coalesce(r.region_name, '') as region_name, coalesce(r.state, '') as state,
           c.slug as cat, count(*)::int as n
      from public.listings l
      join public.categories c on c.id = l.category_id
      left join reg r on r.postcode = l.postcode
     where l.kind = 'service_offering'
       and l.status = 'active'
       and l.expires_at > now()
     group by 1, 2, 3
  ),
  sales as (
    select s.month::timestamp as m,
           coalesce(r.region_name, '') as region_name, coalesce(r.state, '') as state,
           s.orders, s.revenue_cents
      from public.sales_by_postcode_monthly s
      left join reg r on r.postcode = s.postcode
     where s.month >= (select start_local from win)::date
  ),
  enq_g as (select region_name, state, cat, count(*)::int as n from enq group by 1, 2, 3),
  req_g as (select region_name, state, cat, count(*)::int as n from req group by 1, 2, 3),
  srch_g as (
    select region_name, state, cat, count(*)::int as n,
           count(*) filter (where result_count = 0)::int as zero
      from srch group by 1, 2, 3
  ),
  keys as (
    select region_name, state, cat from enq_g
    union select region_name, state, cat from req_g
    union select region_name, state, cat from srch_g
    union select region_name, state, cat from supply
  ),
  by_region as (
    select k.region_name, k.state, k.cat as category,
           coalesce(e.n, 0) as enquiries,
           coalesce(q.n, 0) as requests,
           coalesce(s.n, 0) as searches,
           coalesce(s.zero, 0) as zero_result_searches,
           coalesce(p.n, 0) as supply
      from keys k
      left join enq_g e on e.region_name = k.region_name and e.state = k.state and e.cat = k.cat
      left join req_g q on q.region_name = k.region_name and q.state = k.state and q.cat = k.cat
      left join srch_g s on s.region_name = k.region_name and s.state = k.state and s.cat = k.cat
      left join supply p on p.region_name = k.region_name and p.state = k.state and p.cat = k.cat
  ),
  sales_g as (
    select region_name, state, sum(orders)::int as orders, sum(revenue_cents)::bigint as revenue
      from sales group by 1, 2
  ),
  demand_g as (
    select region_name, state,
           sum(enquiries + requests + searches)::int as demand, sum(supply)::int as supply
      from by_region group by 1, 2
  ),
  region_keys as (
    select region_name, state from sales_g
    union select region_name, state from demand_g
  ),
  sales_by_region as (
    select rk.region_name, rk.state,
           coalesce(sg.orders, 0) as sales_orders,
           coalesce(sg.revenue, 0)::bigint as sales_revenue_cents,
           coalesce(dg.demand, 0) as demand,
           coalesce(dg.supply, 0) as supply
      from region_keys rk
      left join sales_g sg on sg.region_name = rk.region_name and sg.state = rk.state
      left join demand_g dg on dg.region_name = rk.region_name and dg.state = rk.state
  ),
  months as (
    select generate_series(
      (select start_local from win),
      date_trunc('month', timezone('Australia/Sydney', now())),
      interval '1 month'
    ) as m
  ),
  month_enq as (select m, count(*)::int as n from enq group by m),
  month_req as (select m, count(*)::int as n from req group by m),
  month_srch as (select m, count(*)::int as n from srch group by m),
  month_sales as (select m, sum(orders)::int as orders, sum(revenue_cents)::bigint as revenue from sales group by m),
  cov as (
    select count(distinct month) as months, min(month) as first_month, max(month) as last_month, max(updated_at) as updated_at
      from public.sales_by_postcode_monthly
  )
  select jsonb_build_object(
    'window_months', greatest(p_months, 1),
    'by_region', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'region_name', nullif(t.region_name, ''), 'state', nullif(t.state, ''), 'category', nullif(t.category, ''),
        'enquiries', t.enquiries, 'requests', t.requests, 'searches', t.searches,
        'zero_result_searches', t.zero_result_searches, 'supply', t.supply,
        'demand', t.enquiries + t.requests + t.searches
      ) order by (t.enquiries + t.requests + t.searches) desc, t.supply desc, t.region_name), '[]'::jsonb)
      from by_region t
      where t.enquiries + t.requests + t.searches + t.supply > 0
    ),
    'sales_by_region', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'region_name', nullif(t.region_name, ''), 'state', nullif(t.state, ''),
        'sales_orders', t.sales_orders, 'sales_revenue_cents', t.sales_revenue_cents,
        'demand', t.demand, 'supply', t.supply
      ) order by t.sales_revenue_cents desc, t.demand desc, t.region_name), '[]'::jsonb)
      from sales_by_region t
      where t.sales_orders > 0 or t.demand > 0
    ),
    'by_month', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(mm.m, 'YYYY-MM'),
        'enquiries', coalesce(me.n, 0),
        'requests', coalesce(mr.n, 0),
        'searches', coalesce(ms.n, 0),
        'sales_orders', coalesce(msl.orders, 0),
        'sales_revenue_cents', coalesce(msl.revenue, 0)
      ) order by mm.m), '[]'::jsonb)
      from months mm
      left join month_enq me on me.m = mm.m
      left join month_req mr on mr.m = mm.m
      left join month_srch ms on ms.m = mm.m
      left join month_sales msl on msl.m = mm.m
    ),
    'gaps', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'region_name', nullif(t.region_name, ''), 'state', nullif(t.state, ''), 'category', nullif(t.category, ''),
        'demand', t.enquiries + t.requests + t.searches
      ) order by (t.enquiries + t.requests + t.searches) desc), '[]'::jsonb)
      from by_region t
      where t.supply = 0 and t.enquiries + t.requests + t.searches > 0
    ),
    'sales_coverage', (
      select jsonb_build_object(
        'months', c.months,
        'first_month', to_char(c.first_month, 'YYYY-MM'),
        'last_month', to_char(c.last_month, 'YYYY-MM'),
        'updated_at', c.updated_at
      ) from cov c
    )
  );
$fn$;

revoke all on function public.admin_demand_by_region(int) from public, anon, authenticated;
grant execute on function public.admin_demand_by_region(int) to service_role;
