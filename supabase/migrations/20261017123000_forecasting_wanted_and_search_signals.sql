-- =============================================================================
-- Forecasting & Market Intelligence v2:
--   1. Separates For Sale (side = 'supply') vs Wanted to Buy (side = 'demand')
--      in commodity_summary (for_sale_count, wanted_count, quantity_listed,
--      quantity_wanted).
--   2. Adds search_signals from public.search_queries (non-bot searches for
--      specific worker tickets, crop/livestock sub-categories, or freight
--      vehicles by region).
-- =============================================================================

create or replace function public.admin_market_intelligence(p_months int default 6)
returns jsonb
language sql
stable
security definer
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
           coalesce(nullif(sd.sub_category, ''), c.slug) as commodity,
           coalesce(l.side, 'supply') as side,
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
           count(*) filter (where side <> 'demand')::int as for_sale_count,
           count(*) filter (where side = 'demand')::int as wanted_count,
           count(*) filter (where is_sold)::int as sold_count,
           coalesce(sum(quantity) filter (where side <> 'demand'), 0)::numeric(12,2) as quantity_listed,
           coalesce(sum(quantity) filter (where side = 'demand'), 0)::numeric(12,2) as quantity_wanted,
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
  ),
  search_rows as (
    select coalesce(sq.vertical, 'other') as vertical,
           coalesce(
             nullif(sq.filters->>'ticket', ''),
             nullif(sq.filters->>'sub_category', ''),
             nullif(sq.filters->>'vehicle_type', ''),
             nullif(sq.filters->>'direction', ''),
             nullif(sq.filters->>'side', ''),
             'all'
           ) as signal,
           coalesce(r.region_name, case when sq.postcode is not null and sq.postcode <> '' then 'Postcode ' || sq.postcode else 'All regions' end) as region_name,
           coalesce(r.state, sq.region_state, '') as state,
           sq.result_count
      from public.search_queries sq
      left join reg r on r.postcode = sq.postcode
     where coalesce(sq.is_bot, false) = false
       and sq.vertical in ('job', 'sale', 'freight')
       and timezone('Australia/Sydney', sq.created_at) >= (select start_local from win)
  ),
  search_signal_summary as (
    select vertical, signal, region_name, state,
           count(*)::int as searches,
           count(*) filter (where result_count = 0)::int as zero_result_searches
      from search_rows
     group by 1, 2, 3, 4
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
        'for_sale_count', cs.for_sale_count,
        'wanted_count', cs.wanted_count,
        'sold_count', cs.sold_count,
        'quantity_listed', cs.quantity_listed,
        'quantity_wanted', cs.quantity_wanted,
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
    ),
    'search_signals', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'vertical', ss.vertical,
        'signal', ss.signal,
        'region_name', ss.region_name,
        'state', nullif(ss.state, ''),
        'searches', ss.searches,
        'zero_result_searches', ss.zero_result_searches
      ) order by ss.searches desc, ss.zero_result_searches desc), '[]'::jsonb)
      from (select * from search_signal_summary order by searches desc limit 60) ss
    )
  );
$fn$;

revoke all on function public.admin_market_intelligence(int) from public, anon, authenticated;
grant execute on function public.admin_market_intelligence(int) to service_role;
