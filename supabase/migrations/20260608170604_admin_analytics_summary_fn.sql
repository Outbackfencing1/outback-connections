-- ============================================================
-- Migration: admin_analytics_summary_fn  (owner analytics — read-only)
-- ============================================================
-- Project : csisezoohgfrpjrhkmls
-- Date    : 2026-06-08
-- Type    : ADDITIVE — 1 read-only function (language sql stable). No writes.
--
-- Purpose : One jsonb roll-up for the admin analytics page: supply vs demand by
--           vertical and by region (state), zero-result search rate by vertical
--           (the demand gap), engagement events by type, and the trust ladder
--           spread. Off listings + search_queries + events + businesses.
--
-- Access: service_role only (the admin page calls it after requireAdmin()).
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
    )
  );
$fn$;

revoke all on function public.admin_analytics_summary() from public;
grant execute on function public.admin_analytics_summary() to service_role;

-- ============================================================
-- ROLLBACK (manual):
--   drop function if exists public.admin_analytics_summary();
-- ============================================================
