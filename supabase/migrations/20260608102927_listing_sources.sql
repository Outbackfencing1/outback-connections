-- ============================================================
-- Migration 3: listing_sources
-- ============================================================
-- Project : csisezoohgfrpjrhkmls
-- Date    : 2026-06-08
-- Type    : ADDITIVE — new table only. RLS-first.
-- Depends : Migration 2 (listings provenance columns).
--
-- Purpose : Per-sighting source log for scraped/imported listings. Powers
--           dedup (unique source key), freshness (last_seen_at), raw-payload
--           archival, and honest multi-platform attribution. A single
--           canonical listing can have several source rows (seen on multiple
--           platforms or re-scraped over time).
--
-- PRIVACY : raw_payload may contain full third-party content / PII, so this
--           table has NO public read. Public "sourced from X" attribution is
--           served from the public columns listings.source_platform/source_url.
--           Access: service_role (writes) + admins (read, for moderation).
-- ============================================================

create table if not exists public.listing_sources (
  id                  uuid primary key default gen_random_uuid(),
  listing_id          uuid not null references public.listings(id) on delete cascade,
  source_platform     text not null,
  source_url          text,
  source_external_id  text,
  raw_payload         jsonb,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

-- Dedup key: a given external posting maps to exactly one source row.
-- This is the scraper's upsert conflict target.
create unique index if not exists uq_listing_sources_platform_external
  on public.listing_sources (source_platform, source_external_id)
  where source_external_id is not null;
create index if not exists idx_listing_sources_listing
  on public.listing_sources (listing_id);
create index if not exists idx_listing_sources_freshness
  on public.listing_sources (active, last_seen_at);

alter table public.listing_sources enable row level security;

-- Admins may read (moderation / provenance debugging). No anon/public read.
drop policy if exists "Admins read listing_sources" on public.listing_sources;
create policy "Admins read listing_sources"
  on public.listing_sources for select to authenticated
  using (exists (select 1 from public.user_profiles p
                 where p.user_id = auth.uid() and p.is_admin = true));

drop policy if exists "Service role manages listing_sources" on public.listing_sources;
create policy "Service role manages listing_sources"
  on public.listing_sources for all to service_role using (true) with check (true);

-- ============================================================
-- ROLLBACK (manual):
--   drop table if exists public.listing_sources cascade;
-- ============================================================
