-- ============================================================
-- Analytics: bot flag on capture tables + traction-gate metrics
-- ============================================================
-- Why: the 4 Jul traction gate (25 organic human searches/week, 5 claims,
-- 10 first-party posts in 30 days) could not be read from the data. Browse
-- pages log every page load as a "search" with a blank query, session_id was
-- never populated, and roughly half of rows are crawlers.
--
-- This adds is_bot (set by lib/analytics.ts from the user agent; backfilled
-- here from stored user agents), and admin_gate_metrics() which reports the
-- gate numbers week by week, humans only. session_id is now populated by the
-- app as a daily hash of ip + user agent (no new cookie, no new data).
--
-- Rollback: drop function public.admin_gate_metrics(int);
--           alter table public.events drop column is_bot;
--           alter table public.search_queries drop column is_bot;
-- ============================================================

alter table public.events
  add column if not exists is_bot boolean not null default false;
alter table public.search_queries
  add column if not exists is_bot boolean not null default false;

create index if not exists idx_search_queries_human_created
  on public.search_queries (created_at) where is_bot = false;
create index if not exists idx_events_human_created
  on public.events (created_at) where is_bot = false;

-- Backfill from stored user agents. Best effort; mirrors BOT_UA in lib/analytics.ts.
update public.search_queries
   set is_bot = true
 where is_bot = false
   and user_agent ~* '(bot|crawl|spider|slurp|gptbot|claudebot|anthropic|perplexity|bingpreview|facebookexternalhit|headless|python-requests|curl/|go-http-client|vercel-screenshot|lighthouse|pagespeed|dataforseo|semrush|ahrefs|mj12|petalbot|yandex|baiduspider|duckduckbot|applebot|amazonbot|bytespider|ccbot|scrapy|httpx|axios|node-fetch|okhttp|java/|wget)';
update public.events
   set is_bot = true
 where is_bot = false
   and user_agent ~* '(bot|crawl|spider|slurp|gptbot|claudebot|anthropic|perplexity|bingpreview|facebookexternalhit|headless|python-requests|curl/|go-http-client|vercel-screenshot|lighthouse|pagespeed|dataforseo|semrush|ahrefs|mj12|petalbot|yandex|baiduspider|duckduckbot|applebot|amazonbot|bytespider|ccbot|scrapy|httpx|axios|node-fetch|okhttp|java/|wget)';

-- Weekly gate numbers, humans only. A "search" is a browse-page load with a
-- query or at least one filter set; a bare page load is a browse load.
create or replace function public.admin_gate_metrics(p_weeks int default 8)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
  with weeks as (
    select generate_series(
      date_trunc('week', now()) - make_interval(weeks => greatest(p_weeks, 1) - 1),
      date_trunc('week', now()),
      interval '1 week'
    ) as wk
  ),
  searches as (
    select s.created_at, s.session_id,
           (coalesce(s.query_text, '') <> ''
             or exists (
               select 1 from jsonb_each_text(coalesce(s.filters, '{}'::jsonb)) f
                where f.value is not null and f.value <> ''
             )) as is_search
      from public.search_queries s
     where s.is_bot = false
  )
  select jsonb_build_object(
    'weeks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'week_start', to_char(w.wk, 'YYYY-MM-DD'),
        'human_searches', (select count(*) from searches s where s.is_search and s.created_at >= w.wk and s.created_at < w.wk + interval '1 week'),
        'human_browse_loads', (select count(*) from searches s where s.created_at >= w.wk and s.created_at < w.wk + interval '1 week'),
        'human_sessions', (select count(distinct s.session_id) from searches s where s.session_id is not null and s.created_at >= w.wk and s.created_at < w.wk + interval '1 week'),
        'claims', (select count(*) from public.claims c where c.created_at >= w.wk and c.created_at < w.wk + interval '1 week'),
        'first_party_posts', (select count(*) from public.listings l where l.data_source in ('manual','claimed') and l.user_id is not null and l.canonical_listing_id is null and l.created_at >= w.wk and l.created_at < w.wk + interval '1 week'),
        'signups', (select count(*) from public.user_profiles p where p.created_at >= w.wk and p.created_at < w.wk + interval '1 week'),
        'listing_views', (select count(*) from public.events e where e.is_bot = false and e.event_type = 'listing_view' and e.created_at >= w.wk and e.created_at < w.wk + interval '1 week'),
        'contact_reveals', (select count(*) from public.events e where e.event_type = 'contact_reveal' and e.created_at >= w.wk and e.created_at < w.wk + interval '1 week'),
        'source_clicks', (select count(*) from public.events e where e.is_bot = false and e.event_type = 'source_click' and e.created_at >= w.wk and e.created_at < w.wk + interval '1 week'),
        'directory_adds', (select count(*) from public.listings l where l.data_source = 'scraped' and l.created_at >= w.wk and l.created_at < w.wk + interval '1 week')
      ) order by w.wk), '[]'::jsonb)
      from weeks w
    ),
    'gate', jsonb_build_object(
      'target_searches_per_week', 25,
      'target_claims_30d', 5,
      'target_first_party_posts_30d', 10,
      'human_searches_7d', (select count(*) from searches s where s.is_search and s.created_at > now() - interval '7 days'),
      'claims_30d', (select count(*) from public.claims where created_at > now() - interval '30 days'),
      'first_party_posts_30d', (select count(*) from public.listings where data_source in ('manual','claimed') and user_id is not null and canonical_listing_id is null and created_at > now() - interval '30 days'),
      'bot_share_30d_pct', (
        select case when count(*) > 0 then round(100.0 * count(*) filter (where is_bot) / count(*))::int else 0 end
          from public.search_queries where created_at > now() - interval '30 days'
      )
    )
  );
$fn$;

revoke all on function public.admin_gate_metrics(int) from public, anon, authenticated;
grant execute on function public.admin_gate_metrics(int) to service_role;
