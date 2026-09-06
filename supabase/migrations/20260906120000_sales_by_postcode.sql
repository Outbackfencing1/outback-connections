-- ============================================================
-- Sales by postcode: the forecasting join
-- ============================================================
-- Josh's ask: see demand on Connections next to what Outback Fencing
-- actually sells, by region and month, to plan stock. This table holds
-- AGGREGATE monthly order counts and revenue per postcode (from Shopify:
-- either an admin CSV upload of the order export, or a seeded pull). No
-- order ids, no customers, no line items. Staff read, service role writes.
--
-- admin_demand_by_region() gains 'sales_by_region' and monthly sales
-- columns so the demand page shows both sides.
--
-- Rollback: drop table public.sales_by_postcode_monthly; re-apply
-- 20260906080000 for the function.
-- ============================================================

create table if not exists public.sales_by_postcode_monthly (
  id             uuid primary key default gen_random_uuid(),
  source         text not null default 'shopify',
  month          date not null,
  postcode       text not null check (postcode ~ '^[0-9]{4}$'),
  orders         integer not null default 0 check (orders >= 0),
  revenue_cents  bigint not null default 0 check (revenue_cents >= 0),
  updated_at     timestamptz not null default now(),
  unique (source, month, postcode)
);

comment on table public.sales_by_postcode_monthly is
  'Aggregate monthly orders + revenue per postcode from Outback Fencing sales channels. No PII. Staff read; service role writes.';

create index if not exists idx_sales_by_postcode_month on public.sales_by_postcode_monthly (month desc);

alter table public.sales_by_postcode_monthly enable row level security;

drop policy if exists "Staff read sales by postcode" on public.sales_by_postcode_monthly;
create policy "Staff read sales by postcode"
  on public.sales_by_postcode_monthly for select to authenticated
  using (public.current_user_is_staff());

drop policy if exists "Service role manages sales by postcode" on public.sales_by_postcode_monthly;
create policy "Service role manages sales by postcode"
  on public.sales_by_postcode_monthly for all to service_role
  using (true) with check (true);

revoke all on public.sales_by_postcode_monthly from anon, authenticated;
grant select on public.sales_by_postcode_monthly to authenticated;
grant all on public.sales_by_postcode_monthly to service_role;

-- ---------- demand report v3: with sales ----------
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
  sales as (
    select date_trunc('month', s.month)::date as m, r.region_name, r.state, s.orders, s.revenue_cents
      from public.sales_by_postcode_monthly s
      left join reg r on r.postcode = s.postcode
     where s.month >= (select start_at from win)::date
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
  region_keys as (
    select region_name, state from keys
    union select region_name, state from sales
  ),
  sales_by_region as (
    select rk.region_name, rk.state,
      (select coalesce(sum(s.orders), 0)::int from sales s
        where s.region_name is not distinct from rk.region_name and s.state is not distinct from rk.state) as sales_orders,
      (select coalesce(sum(s.revenue_cents), 0)::bigint from sales s
        where s.region_name is not distinct from rk.region_name and s.state is not distinct from rk.state) as sales_revenue_cents,
      (select coalesce(sum(b.enquiries + b.requests + b.searches), 0)::int from by_region b
        where b.region_name is not distinct from rk.region_name and b.state is not distinct from rk.state) as demand,
      (select coalesce(sum(b.supply), 0)::int from by_region b
        where b.region_name is not distinct from rk.region_name and b.state is not distinct from rk.state) as supply
      from region_keys rk
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
    'sales_by_region', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'region_name', t.region_name, 'state', t.state,
        'sales_orders', t.sales_orders, 'sales_revenue_cents', t.sales_revenue_cents,
        'demand', t.demand, 'supply', t.supply
      ) order by t.sales_revenue_cents desc, t.demand desc, t.region_name nulls last), '[]'::jsonb)
      from sales_by_region t
      where t.sales_orders > 0 or t.demand > 0
    ),
    'by_month', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(mm.m, 'YYYY-MM'),
        'enquiries', (select count(*)::int from enq e where e.m = mm.m),
        'requests', (select count(*)::int from req e where e.m = mm.m),
        'searches', (select count(*)::int from srch e where e.m = mm.m),
        'sales_orders', (select coalesce(sum(s.orders), 0)::int from sales s where s.m = mm.m::date),
        'sales_revenue_cents', (select coalesce(sum(s.revenue_cents), 0)::bigint from sales s where s.m = mm.m::date)
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
    ),
    'sales_coverage', (
      select jsonb_build_object(
        'months', (select count(distinct month) from public.sales_by_postcode_monthly),
        'first_month', (select to_char(min(month), 'YYYY-MM') from public.sales_by_postcode_monthly),
        'last_month', (select to_char(max(month), 'YYYY-MM') from public.sales_by_postcode_monthly),
        'updated_at', (select max(updated_at) from public.sales_by_postcode_monthly)
      )
    )
  );
$fn$;

revoke all on function public.admin_demand_by_region(int) from public, anon, authenticated;
grant execute on function public.admin_demand_by_region(int) to service_role;
