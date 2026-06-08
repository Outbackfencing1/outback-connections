-- ============================================================
-- Migration 4: events + search_queries
-- ============================================================
-- Project : csisezoohgfrpjrhkmls
-- Date    : 2026-06-08
-- Type    : ADDITIVE — two new tables. RLS-first.
-- Depends : Migration 1 (countries).
--
-- Purpose : Capture-everything spine.
--   events         — append-only stream of meaningful actions (listing views,
--                    contact reveals, apply clicks, claim attempts, signups…).
--   search_queries — every search incl. zero-result (the rural demand-gap
--                    dataset; result_count = 0 is the signal).
--
-- Both are written SERVER-SIDE via the service role (server actions / route
-- handlers / the browse query that knows the result count). They hold IP/UA
-- and behavioural data, so: service_role writes + admins read. NO public read,
-- NO direct anon insert (a future ingest API route can accept client events
-- and write them via the service role, validated + rate-limited).
-- ============================================================

-- ---------- events ----------
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  event_type   text not null,                          -- e.g. listing_view, contact_reveal, apply_click, claim_attempt, signup
  entity_type  text,                                   -- listing | business | search | claim | ...
  entity_id    uuid,                                   -- soft ref (entities vary; no FK)
  user_id      uuid references auth.users(id) on delete set null,
  session_id   text,                                   -- anon session correlation
  country_code text not null default 'AU' references public.countries(country_code),
  vertical     text check (vertical is null or vertical in ('job','freight','service','harvest','livestock')),
  properties   jsonb not null default '{}'::jsonb,
  ip           inet,
  user_agent   text
);

create index if not exists idx_events_type_created on public.events (event_type, created_at desc);
create index if not exists idx_events_entity       on public.events (entity_type, entity_id);
create index if not exists idx_events_user         on public.events (user_id) where user_id is not null;
create index if not exists idx_events_created      on public.events (created_at desc);

alter table public.events enable row level security;

drop policy if exists "Admins read events" on public.events;
create policy "Admins read events"
  on public.events for select to authenticated
  using (exists (select 1 from public.user_profiles p
                 where p.user_id = auth.uid() and p.is_admin = true));

drop policy if exists "Service role manages events" on public.events;
create policy "Service role manages events"
  on public.events for all to service_role using (true) with check (true);


-- ---------- search_queries ----------
create table if not exists public.search_queries (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  user_id       uuid references auth.users(id) on delete set null,
  session_id    text,
  country_code  text not null default 'AU' references public.countries(country_code),
  vertical      text check (vertical is null or vertical in ('job','freight','service','harvest','livestock')),
  query_text    text,
  filters       jsonb not null default '{}'::jsonb,    -- postcode, category, etc.
  result_count  int not null,                          -- 0 = demand gap
  postcode      text,
  region_state  text,
  ip            inet,
  user_agent    text
);

-- Demand-gap fast path: every zero-result search.
create index if not exists idx_search_queries_zero
  on public.search_queries (created_at desc) where result_count = 0;
create index if not exists idx_search_queries_vertical_created
  on public.search_queries (vertical, created_at desc);
create index if not exists idx_search_queries_postcode
  on public.search_queries (postcode) where postcode is not null;

alter table public.search_queries enable row level security;

drop policy if exists "Admins read search_queries" on public.search_queries;
create policy "Admins read search_queries"
  on public.search_queries for select to authenticated
  using (exists (select 1 from public.user_profiles p
                 where p.user_id = auth.uid() and p.is_admin = true));

drop policy if exists "Service role manages search_queries" on public.search_queries;
create policy "Service role manages search_queries"
  on public.search_queries for all to service_role using (true) with check (true);

-- ============================================================
-- ROLLBACK (manual):
--   drop table if exists public.search_queries cascade;
--   drop table if exists public.events cascade;
-- ============================================================
