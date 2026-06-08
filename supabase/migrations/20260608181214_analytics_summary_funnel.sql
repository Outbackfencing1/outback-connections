-- ============================================================
-- Migration: analytics_summary_funnel  (extend the read-only roll-up)
-- ============================================================
-- Project : csisezoohgfrpjrhkmls
-- Date    : 2026-06-08
-- Type    : CREATE OR REPLACE the read-only admin_analytics_summary() to add a
--           `funnel` object. No writes, no schema change.
--
-- Adds: jobs live / expired / stale, listing_view + source_click counts and
--       source-click rate, search volume + zero-result, claim starts + approved,
--       claimed businesses. All off existing tables.
-- ============================================================

create or replace function public.admin_analytics_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
  select jsonb_build_object(
    'listings_by_vertical_side', (
      select coalesce(jsonb_agg(jsonb_build_object('vertical', vertical, 'side', side, 'n', n)
                                order by vertical, side), '[]'::jsonb)
      from (
        select coalesce(vertical,'?') as vertical, coalesce(side,'?') as side, count(*)::int as n
        from public.listings
        where status = 'active' and expires_at > now()
        group by vertical, side
      ) t
    ),
    'listings_by_state', (
      select coalesce(jsonb_agg(jsonb_build_object('state', state, 'vertical', vertical, 'n', n)
                                order by state, vertical), '[]'::jsonb)
      from (
        select coalesce(state,'?') as state, coalesce(vertical,'?') as vertical, count(*)::int as n
        from public.listings
        where status = 'active' and expires_at > now()
        group by state, vertical
      ) t
    ),
    'searches_total', (select count(*)::int from public.search_queries),
    'searches_zero',  (select count(*)::int from public.search_queries where result_count = 0),
    'zero_by_vertical', (
      select coalesce(jsonb_agg(jsonb_build_object('vertical', vertical, 'zero', z, 'total', tot)
                                order by vertical), '[]'::jsonb)
      from (
        select coalesce(vertical,'?') as vertical,
               count(*) filter (where result_count = 0)::int as z,
               count(*)::int as tot
        from public.search_queries
        group by vertical
      ) t
    ),
    'events_by_type', (
      select coalesce(jsonb_agg(jsonb_build_object('event_type', event_type, 'n', n)
                                order by n desc), '[]'::jsonb)
      from (select event_type, count(*)::int as n from public.events group by event_type) t
    ),
    'businesses_by_claim', (
      select coalesce(jsonb_agg(jsonb_build_object('claim_status', claim_status, 'n', n)
                                order by claim_status), '[]'::jsonb)
      from (
        select claim_status, count(*)::int as n
        from public.businesses where status = 'active' group by claim_status
      ) t
    ),
    'funnel', jsonb_build_object(
      'jobs_live', (select count(*)::int from public.listings
                     where vertical='job' and status='active' and expires_at > now()),
      'jobs_expired', (select count(*)::int from public.listings
                     where vertical='job' and (status='expired' or (status='active' and expires_at <= now()))),
      'jobs_stale', (select count(*)::int from public.listings
                     where vertical='job' and status='active' and freshness_status='stale'),
      'listing_views', (select count(*)::int from public.events where event_type='listing_view'),
      'source_clicks', (select count(*)::int from public.events where event_type='source_click'),
      'source_click_rate_pct', (
        select case when lv > 0 then round(100.0 * sc / lv)::int else 0 end
        from (select
                (select count(*) from public.events where event_type='source_click') as sc,
                (select count(*) from public.events where event_type='listing_view')  as lv
             ) x
      ),
      'search_volume', (select count(*)::int from public.search_queries),
      'zero_result', (select count(*)::int from public.search_queries where result_count=0),
      'claim_starts', (select count(*)::int from public.claims),
      'claims_approved', (select count(*)::int from public.claims where status='approved'),
      'claimed_businesses', (select count(*)::int from public.businesses
                     where status='active' and claim_status <> 'unclaimed')
    )
  );
$fn$;

revoke all on function public.admin_analytics_summary() from public;
grant execute on function public.admin_analytics_summary() to service_role;

-- ============================================================
-- ROLLBACK: re-apply the prior body from 20260608170604_admin_analytics_summary_fn.sql
-- ============================================================
