-- ============================================================
-- Two-sided Rural Work & Skills Board + Commodity/Livestock Forecasting
-- ============================================================
-- 1. job_details: adds direction ('hiring' | 'available_for_work'),
--    tickets (text[]), travel_willingness, and experience_years so rural
--    drivers, machine/header operators, station hands, and shearers can
--    list their skills & tickets and farmers can filter for them.
-- 2. sale_details: adds sub_category (lucerne_hay, wheat, cattle_steers, etc.),
--    harvest_season, sold_price_cents, and sold_quantity so livestock,
--    hay, grain, and gear sales build a clean historical forecasting dataset.
-- 3. listings: adds featured_until (nullable timestamptz) to prepare for
--    optional future Stripe featured boosts while keeping all listings free.
-- 4. categories: adds mechanic-welder and agronomy-spraying under pillar='jobs'.
-- 5. admin_market_intelligence(p_months): aggregate-only forecasting RPC
--    covering crops/livestock volume & price by region/month and worker
--    supply vs. job demand + ticket availability.
--
-- Rollback:
--   drop function if exists public.admin_market_intelligence(int);
--   alter table public.listings drop column if exists featured_until;
--   alter table public.sale_details
--     drop column if exists sub_category,
--     drop column if exists harvest_season,
--     drop column if exists sold_price_cents,
--     drop column if exists sold_quantity;
--   alter table public.job_details
--     drop column if exists direction,
--     drop column if exists tickets,
--     drop column if exists travel_willingness,
--     drop column if exists experience_years;
--   delete from public.categories
--    where country_code = 'AU' and pillar = 'jobs'
--      and slug in ('mechanic-welder', 'agronomy-spraying');
-- ============================================================

-- ---------- 1. job_details: two-sided work & skills columns ----------
alter table public.job_details
  add column if not exists direction text not null default 'hiring'
    check (direction in ('hiring', 'available_for_work')),
  add column if not exists tickets text[] not null default '{}',
  add column if not exists travel_willingness text
    check (travel_willingness is null or travel_willingness in ('postcode_only', 'within_50km', 'within_200km', 'state_wide', 'national')),
  add column if not exists experience_years integer
    check (experience_years is null or (experience_years >= 0 and experience_years <= 80));

create index if not exists job_details_direction_idx on public.job_details (direction);
create index if not exists job_details_tickets_gin_idx on public.job_details using gin (tickets);

-- ---------- 2. sale_details: commodity & sold outcome columns ----------
alter table public.sale_details
  add column if not exists sub_category text
    check (sub_category is null or char_length(sub_category) <= 60),
  add column if not exists harvest_season text
    check (harvest_season is null or char_length(harvest_season) <= 60),
  add column if not exists sold_price_cents integer
    check (sold_price_cents is null or sold_price_cents >= 0),
  add column if not exists sold_quantity numeric(12,2)
    check (sold_quantity is null or sold_quantity >= 0);

create index if not exists sale_details_sub_category_idx on public.sale_details (sub_category)
  where sub_category is not null;

-- ---------- 3. listings: optional future featured boost column ----------
alter table public.listings
  add column if not exists featured_until timestamptz;

-- ---------- 4. categories: additional rural work & operator categories ----------
insert into public.categories (slug, label, pillar, country_code, sort_order, active, of_relevant)
values
  ('mechanic-welder',   'Mobile diesel mechanic / welder', 'jobs', 'AU', 75, true, false),
  ('agronomy-spraying', 'Spray rig operator / agronomy',   'jobs', 'AU', 78, true, false)
on conflict (country_code, slug) do nothing;

-- ---------- 5. admin_market_intelligence(p_months) forecasting RPC ----------
create or replace function public.admin_market_intelligence(p_months int default 6)
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
  sale_rows as (
    select to_char(date_trunc('month', timezone('Australia/Sydney', l.created_at)), 'YYYY-MM') as month,
           coalesce(r.region_name, 'Other') as region_name,
           coalesce(r.state, l.state, '') as state,
           c.slug as category_slug,
           c.label as category_label,
           coalesce(sd.sub_category, c.slug) as commodity,
           sd.price_type,
           coalesce(sd.sold_price_cents, sd.price_cents) as effective_price_cents,
           sd.quantity,
           coalesce(sd.sold_quantity, case when l.status = 'closed' and l.closed_reason = 'matched' then sd.quantity else null end) as effective_sold_qty,
           coalesce(sd.unit, '') as unit,
           (sd.sold_at is not null or (l.status = 'closed' and l.closed_reason = 'matched')) as is_sold
      from public.listings l
      join public.categories c on c.id = l.category_id
      join public.sale_details sd on sd.listing_id = l.id
      left join reg r on r.postcode = l.postcode
     where l.kind = 'for_sale'
       and l.status not in ('hidden_flagged', 'deleted_by_admin')
       and timezone('Australia/Sydney', l.created_at) >= (select start_local from win)
  ),
  commodity_summary as (
    select month, region_name, state, category_label, commodity, unit, price_type,
           count(*)::int as listings_count,
           count(*) filter (where is_sold)::int as sold_count,
           coalesce(sum(quantity), 0)::numeric(12,2) as quantity_listed,
           coalesce(sum(effective_sold_qty), 0)::numeric(12,2) as quantity_sold,
           round(avg(effective_price_cents) filter (where effective_price_cents > 0))::int as avg_price_cents
      from sale_rows
     group by 1, 2, 3, 4, 5, 6, 7
  ),
  job_rows as (
    select to_char(date_trunc('month', timezone('Australia/Sydney', l.created_at)), 'YYYY-MM') as month,
           coalesce(r.region_name, 'Other') as region_name,
           coalesce(r.state, l.state, '') as state,
           c.label as role_label,
           jd.direction,
           jd.pay_type,
           jd.pay_amount,
           jd.tickets,
           (l.status = 'closed' and l.closed_reason = 'matched') as is_matched
      from public.listings l
      join public.categories c on c.id = l.category_id
      join public.job_details jd on jd.listing_id = l.id
      left join reg r on r.postcode = l.postcode
     where l.kind = 'job'
       and l.status not in ('hidden_flagged', 'deleted_by_admin')
       and timezone('Australia/Sydney', l.created_at) >= (select start_local from win)
  ),
  work_summary as (
    select month, region_name, state, role_label,
           count(*) filter (where direction = 'hiring')::int as jobs_hiring,
           count(*) filter (where direction = 'available_for_work')::int as workers_available,
           count(*) filter (where is_matched)::int as matched_count,
           round(avg(pay_amount) filter (where pay_type = 'hourly' and pay_amount > 0), 2) as avg_hourly_aud,
           round(avg(pay_amount) filter (where pay_type = 'daily' and pay_amount > 0), 2) as avg_daily_aud
      from job_rows
     group by 1, 2, 3, 4
  ),
  ticket_counts as (
    select t.ticket,
           count(*)::int as workers_count
      from job_rows j,
           unnest(j.tickets) as t(ticket)
     where j.direction = 'available_for_work'
     group by 1
  )
  select jsonb_build_object(
    'window_months', greatest(p_months, 1),
    'commodities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', cs.month,
        'region_name', cs.region_name,
        'state', nullif(cs.state, ''),
        'category_label', cs.category_label,
        'commodity', cs.commodity,
        'unit', nullif(cs.unit, ''),
        'price_type', cs.price_type,
        'listings_count', cs.listings_count,
        'sold_count', cs.sold_count,
        'quantity_listed', cs.quantity_listed,
        'quantity_sold', cs.quantity_sold,
        'avg_price_cents', cs.avg_price_cents
      ) order by cs.month desc, cs.listings_count desc, cs.region_name), '[]'::jsonb)
      from commodity_summary cs
    ),
    'work_board', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', ws.month,
        'region_name', ws.region_name,
        'state', nullif(ws.state, ''),
        'role_label', ws.role_label,
        'jobs_hiring', ws.jobs_hiring,
        'workers_available', ws.workers_available,
        'matched_count', ws.matched_count,
        'avg_hourly_aud', ws.avg_hourly_aud,
        'avg_daily_aud', ws.avg_daily_aud
      ) order by ws.month desc, (ws.jobs_hiring + ws.workers_available) desc, ws.region_name), '[]'::jsonb)
      from work_summary ws
    ),
    'tickets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ticket', tc.ticket,
        'workers_count', tc.workers_count
      ) order by tc.workers_count desc, tc.ticket), '[]'::jsonb)
      from ticket_counts tc
    )
  );
$fn$;

revoke all on function public.admin_market_intelligence(int) from public, anon, authenticated;
grant execute on function public.admin_market_intelligence(int) to service_role;
