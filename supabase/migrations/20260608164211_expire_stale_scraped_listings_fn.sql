-- ============================================================
-- Migration: expire_stale_scraped_listings_fn  (freshness / decay)
-- ============================================================
-- Project : csisezoohgfrpjrhkmls
-- Date    : 2026-06-08
-- Type    : ADDITIVE — 1 function. No schema change, no destructive op.
--
-- Purpose : Keep the scraped directory from rotting. A daily Vercel cron calls
--           this; re-scraping (ingest_scraped_business) is the refresh side.
--           - past expires_at  -> status='expired'  (drops out of public browse)
--           - aging (>30d since last scrape) but not yet expired -> freshness_status='stale'
--
-- Scope: scraped/imported only. User-posted listings (manual/claimed) use the
--        renewal flow and are untouched. Setting status='expired' keeps
--        listings_closed_consistency_check happy (closed_at stays null).
--
-- Access: service_role only (called by the cron route via the service client).
-- ============================================================

create or replace function public.expire_stale_scraped_listings()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_expired int;
  v_staled  int;
begin
  -- past expiry -> expired
  update public.listings
     set status = 'expired'
   where data_source in ('scraped','imported')
     and status = 'active'
     and expires_at <= now();
  get diagnostics v_expired = row_count;

  -- aging but not yet expired -> stale (a re-scrape resets it to 'fresh')
  update public.listings
     set freshness_status = 'stale'
   where data_source in ('scraped','imported')
     and status = 'active'
     and expires_at > now()
     and scraped_at is not null
     and scraped_at < (now() - interval '30 days')
     and freshness_status <> 'stale';
  get diagnostics v_staled = row_count;

  return jsonb_build_object('expired', v_expired, 'staled', v_staled);
end;
$fn$;

revoke all on function public.expire_stale_scraped_listings() from public;
grant execute on function public.expire_stale_scraped_listings() to service_role;

-- ============================================================
-- ROLLBACK (manual):
--   drop function if exists public.expire_stale_scraped_listings();
-- ============================================================
