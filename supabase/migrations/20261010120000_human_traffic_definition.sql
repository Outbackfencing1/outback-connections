-- ============================================================
-- Human traffic: stricter bot rule, script-verified sessions, staff left
-- out, where visitors come from, trade-offer clicks
-- ============================================================
-- Why: a 10 Oct 2026 check of the "human" searches behind the traction gate
-- found almost all were crawlers sending frozen desktop browser strings, our
-- own agents, and our own testing. The gate could not be trusted.
--
-- 1. public.is_bot_user_agent(text): the SQL twin of lib/bot-detect.ts
--    (tests/bot-detect.test.ts fails if the two drift). Flags the old
--    patterns plus our agents ("Vercel MCP", the Claude browser pane),
--    Google's crawler phone, pre-2010 Gecko builds, and desktop Chrome or
--    Firefox older than MIN_CURRENT_BROWSER_MAJOR (140). Phones are never
--    version-checked.
-- 2. Re-flags stored rows with it (search_queries, events).
-- 3. admin_gate_metrics(): a search, listing view, source click or trade
--    click now counts as human only when ALL of
--      a. its user agent passes (is_bot = false);
--      b. the same daily session (hash of ip + browser + UTC day) sent a
--         human_ping: our script ran and a person tapped, clicked, typed or
--         moved the mouse (components/HumanPing.tsx -> /api/visit);
--      c. the session is not internal: no staff or admin account was signed
--         in during it, and the browser has no oc_internal mark.
--    Also returns what was left out (unverified, internal), where verified
--    visits came from (referrer host and utm tags of the landing ping), and
--    trade-offer clicks. Weeks before the first human_ping read zero:
--    there is no way to verify them.
--
-- No new tables; RLS unchanged (events and search_queries: service-role
-- write, admin read). New event types, written by the app: human_ping,
-- trade_cta_click.
--
-- Rollback:
--   1. Re-apply section 3 of 20260906070000_enquiries_and_claim_polish.sql
--      (the previous admin_gate_metrics).
--   2. Undo the re-flag. Exact: for every row with a user agent, is_bot goes
--      back to the 20260906050000 rule; rows without one are not touched here.
--        update public.search_queries set is_bot = false
--         where is_bot and user_agent is not null
--           and user_agent !~* '(bot|crawl|spider|slurp|gptbot|claudebot|anthropic|perplexity|bingpreview|facebookexternalhit|headless|python-requests|curl/|go-http-client|vercel-screenshot|lighthouse|pagespeed|dataforseo|semrush|ahrefs|mj12|petalbot|yandex|baiduspider|duckduckbot|applebot|amazonbot|bytespider|ccbot|scrapy|httpx|axios|node-fetch|okhttp|java/|wget)';
--        (same for public.events)
--   3. drop function public.is_bot_user_agent(text);
--   human_ping and trade_cta_click events can stay; nothing else reads them.
-- ============================================================

-- ---------- 1. the bot rule ----------
create or replace function public.is_bot_user_agent(p_ua text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $fn$
  select p_ua is null
      or p_ua ~* '(bot|crawl|spider|slurp|gptbot|claudebot|anthropic|perplexity|bingpreview|facebookexternalhit|headless|python-requests|curl[/]|go-http-client|vercel-screenshot|lighthouse|pagespeed|dataforseo|semrush|ahrefs|mj12|petalbot|yandex|baiduspider|duckduckbot|applebot|amazonbot|bytespider|ccbot|scrapy|httpx|axios|node-fetch|okhttp|java[/]|wget|vercel mcp|claude[/-]|googleother|google-inspectiontool|nexus 5x build[/]mmb29p|gecko[/](19[0-9]{6}|200[0-9]{5}))'
      -- Desktop Chrome / Firefox older than MIN_CURRENT_BROWSER_MAJOR = 140.
      or (p_ua !~* '(mobile|android|iphone|ipad|ipod|samsungbrowser)'
          and coalesce(substring(lower(p_ua) from '(?:chrome|firefox)[/]([0-9]{1,6})')::int, 1000000) < 140);
$fn$;

comment on function public.is_bot_user_agent(text) is
  'Mirror of isBotUserAgent() in lib/bot-detect.ts. Change both together; re-run the section 2 backfill after a change.';

revoke all on function public.is_bot_user_agent(text) from public, anon, authenticated;
grant execute on function public.is_bot_user_agent(text) to service_role;

-- ---------- 2. re-flag stored rows ----------
update public.search_queries
   set is_bot = true
 where is_bot = false
   and user_agent is not null
   and public.is_bot_user_agent(user_agent);

update public.events
   set is_bot = true
 where is_bot = false
   and user_agent is not null
   and public.is_bot_user_agent(user_agent);

-- ---------- 3. gate metrics, verified humans only ----------
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
  -- Everything looks back to the earlier of the first week shown and 30 days ago.
  since as (
    select least(min(wk), now() - interval '30 days') as t from weeks
  ),
  staff as (
    select p.user_id from public.user_profiles p where p.is_admin or p.is_staff
  ),
  -- Internal: a staff or admin account was signed in during the session
  -- (any logged event or search carries its user id), or the browser carries
  -- the oc_internal mark (/api/visit records it on the ping).
  internal_sessions as (
    select e.session_id
      from public.events e
     where e.session_id is not null
       and e.created_at >= (select t from since)
       and (exists (select 1 from staff st where st.user_id = e.user_id)
            or (e.event_type = 'human_ping' and e.properties->>'internal' = 'true'))
    union
    select s.session_id
      from public.search_queries s
     where s.session_id is not null
       and s.created_at >= (select t from since)
       and exists (select 1 from staff st where st.user_id = s.user_id)
  ),
  -- Verified: the session's browser ran components/HumanPing.tsx and a
  -- person tapped, clicked, typed or moved the mouse.
  human_sessions as (
    select e.session_id
      from public.events e
     where e.event_type = 'human_ping'
       and e.is_bot = false
       and e.session_id is not null
       and e.created_at >= (select t from since)
    except
    select session_id from internal_sessions
  ),
  -- Browse-page loads that pass the user-agent rule. A "search" is a load
  -- with a query or at least one filter set; a bare page load is not.
  loads as (
    select s.created_at,
           s.session_id,
           (coalesce(s.query_text, '') <> ''
             or exists (
               select 1 from jsonb_each_text(coalesce(s.filters, '{}'::jsonb)) f
                where f.value is not null and f.value <> ''
             )) as is_search,
           exists (select 1 from human_sessions h where h.session_id = s.session_id) as verified,
           exists (select 1 from internal_sessions i where i.session_id = s.session_id) as internal
      from public.search_queries s
     where s.is_bot = false
       and s.created_at >= (select t from since)
  ),
  searches as (
    select * from loads where verified
  ),
  human_events as (
    select e.event_type, e.created_at, e.session_id, e.properties
      from public.events e
     where e.is_bot = false
       and e.created_at >= (select t from since)
       and exists (select 1 from human_sessions h where h.session_id = e.session_id)
  ),
  -- Where each verified visit came from: its first landing ping.
  entries as (
    select distinct on (e.session_id) e.session_id, e.created_at, e.properties
      from human_events e
     where e.event_type = 'human_ping'
       and e.properties->>'entry' = 'true'
     order by e.session_id, e.created_at
  ),
  sources as (
    select coalesce(e.properties->>'utm_source', e.properties->>'referrer', '(direct)') as source,
           coalesce(e.properties->>'utm_medium',
                    case when e.properties->>'referrer' is not null then 'referral' end,
                    '(none)') as medium,
           count(*)::int as sessions
      from entries e
     where e.created_at > now() - interval '30 days'
     group by 1, 2
  )
  select jsonb_build_object(
    'verified_since', (
      select to_char(min(e.created_at), 'YYYY-MM-DD') from public.events e where e.event_type = 'human_ping'
    ),
    'weeks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'week_start', to_char(w.wk, 'YYYY-MM-DD'),
        'human_searches', (select count(*) from searches s where s.is_search and s.created_at >= w.wk and s.created_at < w.wk + interval '1 week'),
        'human_browse_loads', (select count(*) from searches s where s.created_at >= w.wk and s.created_at < w.wk + interval '1 week'),
        'human_sessions', (select count(distinct e.session_id) from human_events e where e.event_type = 'human_ping' and e.created_at >= w.wk and e.created_at < w.wk + interval '1 week'),
        'unverified_searches', (select count(*) from loads l where l.is_search and not l.verified and not l.internal and l.created_at >= w.wk and l.created_at < w.wk + interval '1 week'),
        'claims', (select count(*) from public.claims c where c.created_at >= w.wk and c.created_at < w.wk + interval '1 week'),
        'first_party_posts', (select count(*) from public.listings l where l.data_source in ('manual','claimed') and l.user_id is not null and l.canonical_listing_id is null and l.created_at >= w.wk and l.created_at < w.wk + interval '1 week'),
        'signups', (select count(*) from public.user_profiles p where p.created_at >= w.wk and p.created_at < w.wk + interval '1 week'),
        'listing_views', (select count(*) from human_events e where e.event_type = 'listing_view' and e.created_at >= w.wk and e.created_at < w.wk + interval '1 week'),
        'contact_reveals', (select count(*) from public.events e where e.event_type = 'contact_reveal' and not exists (select 1 from staff st where st.user_id = e.user_id) and e.created_at >= w.wk and e.created_at < w.wk + interval '1 week'),
        'source_clicks', (select count(*) from human_events e where e.event_type = 'source_click' and e.created_at >= w.wk and e.created_at < w.wk + interval '1 week'),
        'trade_cta_clicks', (select count(*) from human_events e where e.event_type = 'trade_cta_click' and e.created_at >= w.wk and e.created_at < w.wk + interval '1 week'),
        'enquiries', (select count(*) from public.listing_enquiries q where q.status <> 'spam' and q.created_at >= w.wk and q.created_at < w.wk + interval '1 week'),
        'directory_adds', (select count(*) from public.listings l where l.data_source = 'scraped' and l.created_at >= w.wk and l.created_at < w.wk + interval '1 week')
      ) order by w.wk), '[]'::jsonb)
      from weeks w
    ),
    'gate', jsonb_build_object(
      'target_searches_per_week', 25,
      'target_claims_30d', 5,
      'target_first_party_posts_30d', 10,
      'human_searches_7d', (select count(*) from searches s where s.is_search and s.created_at > now() - interval '7 days'),
      'unverified_searches_7d', (select count(*) from loads l where l.is_search and not l.verified and not l.internal and l.created_at > now() - interval '7 days'),
      'internal_searches_7d', (select count(*) from loads l where l.is_search and l.internal and l.created_at > now() - interval '7 days'),
      'claims_30d', (select count(*) from public.claims where created_at > now() - interval '30 days'),
      'first_party_posts_30d', (select count(*) from public.listings where data_source in ('manual','claimed') and user_id is not null and canonical_listing_id is null and created_at > now() - interval '30 days'),
      'enquiries_30d', (select count(*) from public.listing_enquiries where status <> 'spam' and created_at > now() - interval '30 days'),
      'trade_cta_clicks_30d', (select count(*) from human_events e where e.event_type = 'trade_cta_click' and e.created_at > now() - interval '30 days'),
      'bot_share_30d_pct', (
        select case when count(*) > 0 then round(100.0 * count(*) filter (where is_bot) / count(*))::int else 0 end
          from public.search_queries where created_at > now() - interval '30 days'
      ),
      'sources_30d', (
        select coalesce(jsonb_agg(jsonb_build_object('source', x.source, 'medium', x.medium, 'sessions', x.sessions)
                                  order by x.sessions desc, x.source, x.medium), '[]'::jsonb)
          from (select * from sources order by sessions desc, source, medium limit 10) x
      )
    )
  );
$fn$;

revoke all on function public.admin_gate_metrics(int) from public, anon, authenticated;
grant execute on function public.admin_gate_metrics(int) to service_role;
