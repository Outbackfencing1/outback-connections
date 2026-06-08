-- ============================================================
-- Migration 2: listings_spine_columns
-- ============================================================
-- Project : csisezoohgfrpjrhkmls
-- Date    : 2026-06-08
-- Type    : ALTER live `listings` (currently 0 rows). Additive columns +
--           nullable user_id/policy_version_id + RLS lock-down + dedup index
--           + DB-level trust guards. No data destroyed.
-- Depends : Migration 1 (countries, businesses).
--
-- Purpose : Make `listings` hold scraped jobs honestly and de-dupably.
-- Safety  : insert/edit/close/renew all run via service_role (createAdminClient)
--           and bypass RLS; every new NOT NULL column has a default, so the
--           existing posting path keeps working unchanged.
--
-- expires_at: unchanged. Already NOT NULL with default (now() + 30 days);
--   insertListing relies on that default; the scraper sets it explicitly.
--   Public read stays strict (status='active' AND expires_at > now()).
-- ============================================================

-- ---------- 1. New columns ----------
alter table public.listings
  add column if not exists country_code         text not null default 'AU'
                                                references public.countries(country_code),
  add column if not exists business_id          uuid references public.businesses(id) on delete set null,
  add column if not exists vertical             text
                                                check (vertical is null or vertical in ('job','freight','service','harvest','livestock')),
  add column if not exists side                 text
                                                check (side is null or side in ('supply','demand')),
  add column if not exists data_source          text not null default 'manual'
                                                check (data_source in ('scraped','imported','claimed','manual','verified')),
  add column if not exists source_platform      text,
  add column if not exists source_url           text,
  add column if not exists source_external_id   text,
  add column if not exists scraped_at           timestamptz,
  add column if not exists imported_at          timestamptz,
  add column if not exists freshness_status     text not null default 'unknown'
                                                check (freshness_status in ('fresh','stale','unknown')),
  add column if not exists duplicate_group_id   uuid,
  add column if not exists canonical_listing_id uuid references public.listings(id) on delete set null,
  add column if not exists metadata             jsonb not null default '{}'::jsonb;

-- ---------- 2. Relax NOT NULLs for scraped data ----------
-- Scraped jobs have no platform user and no user consent record.
alter table public.listings alter column user_id          drop not null;
alter table public.listings alter column policy_version_id drop not null;

-- ---------- 3. Trust / integrity guards (DB-enforced honesty) ----------
-- A scraped listing MUST always carry its source (operating rule #5).
alter table public.listings drop constraint if exists listings_scraped_needs_source;
alter table public.listings add constraint listings_scraped_needs_source check (
  data_source <> 'scraped' or (source_platform is not null and source_url is not null)
);

-- A user-posted listing (manual/claimed) MUST carry a consent/policy version.
alter table public.listings drop constraint if exists listings_consent_when_user_posted;
alter table public.listings add constraint listings_consent_when_user_posted check (
  data_source not in ('manual','claimed') or policy_version_id is not null
);

-- Every listing needs at least one way to respond. Scraped jobs satisfy this
-- via source_url (the original posting); user posts via email/phone as before.
alter table public.listings drop constraint if exists listings_contact_required;
alter table public.listings add constraint listings_contact_required check (
  contact_email is not null or contact_phone is not null or source_url is not null
);

-- ---------- 4. Backfill classification (no-op on 0 rows; correct if any exist) ----------
update public.listings set vertical = case
    when kind = 'job' then 'job'
    when kind = 'freight' then 'freight'
    when kind in ('service_offering','service_request') then 'service'
  end
where vertical is null;

update public.listings set side = 'demand'
where kind = 'job' and side is null;

update public.listings set side = case kind
    when 'service_offering' then 'supply'
    when 'service_request'  then 'demand'
  end
where kind in ('service_offering','service_request') and side is null;

update public.listings l set side = case fd.direction
    when 'offering_truck' then 'supply'
    when 'need_freight'   then 'demand'
  end
from public.freight_details fd
where fd.listing_id = l.id and l.kind = 'freight' and l.side is null;

-- ---------- 5. Dedup + provenance indexes ----------
create unique index if not exists uq_listings_source_external
  on public.listings (source_platform, source_external_id)
  where source_external_id is not null;          -- scraper upsert conflict key
create index if not exists idx_listings_data_source
  on public.listings (data_source);
create index if not exists idx_listings_business
  on public.listings (business_id) where business_id is not null;
create index if not exists idx_listings_duplicate_group
  on public.listings (duplicate_group_id) where duplicate_group_id is not null;

-- ---------- 6. RLS rewrite ----------
-- PUBLIC READ — re-affirmed UNCHANGED. Already makes scraped rows (user_id
-- IS NULL) publicly readable: it only checks status + expiry, never user_id.
-- Still scoped to active + unexpired (risk R1).
drop policy if exists "Anyone reads active unexpired listings" on public.listings;
create policy "Anyone reads active unexpired listings"
  on public.listings for select
  using (status = 'active' and expires_at > now());

-- LOCK WRITES TO service_role. The app already inserts/edits/closes/renews via
-- the service role with app-level ownership checks, so these owner policies are
-- unused; dropping them stops a signed-in user from self-setting provenance/
-- trust columns (data_source, business_id, source_*, dedup) via direct PostgREST.
drop policy if exists "Authenticated insert own listings" on public.listings;
drop policy if exists "Owners update own listings" on public.listings;

-- KEPT (unchanged): "Owners read own listings" (dashboard read),
--                   "Owners delete own listings" (delete flow),
--                   "Service role manages listings" (all server-side writes).

-- ============================================================
-- ROLLBACK (manual):
--   create policy "Authenticated insert own listings" on public.listings
--     for insert to authenticated with check (auth.uid() = user_id);
--   create policy "Owners update own listings" on public.listings
--     for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
--   drop index if exists uq_listings_source_external;
--   drop index if exists idx_listings_data_source;
--   drop index if exists idx_listings_business;
--   drop index if exists idx_listings_duplicate_group;
--   alter table public.listings drop constraint if exists listings_scraped_needs_source;
--   alter table public.listings drop constraint if exists listings_consent_when_user_posted;
--   alter table public.listings drop constraint if exists listings_contact_required;
--   alter table public.listings add constraint listings_contact_required
--     check (contact_email is not null or contact_phone is not null);
--   alter table public.listings alter column policy_version_id set not null;  -- only if no null rows
--   alter table public.listings alter column user_id set not null;            -- only if no null rows
--   alter table public.listings
--     drop column if exists metadata, drop column if exists canonical_listing_id,
--     drop column if exists duplicate_group_id, drop column if exists freshness_status,
--     drop column if exists imported_at, drop column if exists scraped_at,
--     drop column if exists source_external_id, drop column if exists source_url,
--     drop column if exists source_platform, drop column if exists data_source,
--     drop column if exists side, drop column if exists vertical,
--     drop column if exists business_id, drop column if exists country_code;
-- ============================================================
