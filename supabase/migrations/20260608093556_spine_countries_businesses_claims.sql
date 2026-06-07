-- ============================================================
-- Migration 1: spine_countries_businesses_claims
-- ============================================================
-- Project : csisezoohgfrpjrhkmls (outback-connections, Sydney)
-- Date    : 2026-06-08
-- Type    : ADDITIVE — new tables only. Touches no existing table or data.
-- Depends : auth.users (managed) + existing helpers public.gen_short_id(),
--           public.set_updated_at() (created in the baseline).
--
-- Purpose : Install the identity/trust spine — the moat. Reputation lives on
--           the BUSINESS (not the user) so it carries across every vertical.
--           Holds scraped/unclaimed employers AND claimed real businesses,
--           always honestly marked via data_source + claim_status
--           (operating rule #5: scraped is never presented as employer-posted).
--
-- Conventions honoured: RLS enabled on every table, policies in this file;
--   country_code on cross-cutting tables (default 'AU'); snake_case;
--   no enums (CHECK constraints, taxonomy stays data); idempotent; rollback
--   noted at the bottom as SQL comments.
--
-- CONFIDENTIALITY — claims.evidence:
--   `claims` has NO anon/public SELECT policy. Rows (and therefore the
--   `evidence` jsonb column) are readable ONLY by:
--     • the claimant who filed it  (USING auth.uid() = claimant_user_id)
--     • admins                     (USING user_profiles.is_admin)
--     • service_role               (ALL)
--   claims.evidence is never publicly readable.
-- ============================================================

-- ---------- countries ----------
create table if not exists public.countries (
  country_code  text primary key,                 -- ISO 3166-1 alpha-2, e.g. 'AU'
  name          text not null,
  currency_code text not null,                     -- ISO 4217, e.g. 'AUD'
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

insert into public.countries (country_code, name, currency_code, active) values
  ('AU', 'Australia', 'AUD', true)
on conflict (country_code) do nothing;

alter table public.countries enable row level security;

drop policy if exists "Anyone reads countries" on public.countries;
create policy "Anyone reads countries"
  on public.countries for select using (true);

drop policy if exists "Service role manages countries" on public.countries;
create policy "Service role manages countries"
  on public.countries for all to service_role using (true) with check (true);


-- ---------- businesses ----------
-- Reputation lives here, not on the user, so it carries across every vertical.
-- Holds scraped/unclaimed employers AND claimed real businesses, honestly marked.
create table if not exists public.businesses (
  id                    uuid primary key default gen_random_uuid(),
  anonymised_id         text not null unique default public.gen_short_id('BIZ'),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  country_code          text not null default 'AU' references public.countries(country_code),

  legal_name            text,
  trading_name          text,
  slug                  text unique,
  abn                   text,
  abr_status            text,                       -- raw ABR registration status, when known
  gst_registered        boolean,
  entity_type           text,                       -- sole_trader / company / partnership / trust / other (free text v1)

  -- location (soft postcode link; no hard FK so imperfect scraped data still ingests)
  state_code            text,
  postcode              text,
  geo_lat               numeric(9,6),               -- designed now, populated later
  geo_lng               numeric(9,6),

  -- contact / presence
  contact_email         text,
  contact_phone         text,
  website_url           text,
  facebook_url          text,

  -- provenance + moderation
  data_source           text not null default 'manual'
                          check (data_source in ('scraped','imported','claimed','manual','verified')),
  source_url            text,
  status                text not null default 'active'
                          check (status in ('active','hidden','merged','duplicate')),
  canonical_business_id uuid references public.businesses(id),  -- dedup target when merged

  -- trust model (visible ladder + numeric backing; deliberately NOT a 7-tier enum)
  claim_status          text not null default 'unclaimed'
                          check (claim_status in ('unclaimed','claimed','abn_verified','trusted')),
  claimed_by            uuid references auth.users(id) on delete set null,
  claimed_at            timestamptz,
  confidence_score      numeric(5,2) not null default 0,   -- data quality 0..100
  trust_score           numeric(5,2) not null default 0,   -- behaviour/verification 0..100
  last_verified_at      timestamptz
);

create index if not exists idx_businesses_country_status on public.businesses (country_code, status);
create index if not exists idx_businesses_claim_status   on public.businesses (claim_status);
create index if not exists idx_businesses_abn            on public.businesses (abn);
create index if not exists idx_businesses_postcode       on public.businesses (postcode);
create index if not exists idx_businesses_claimed_by     on public.businesses (claimed_by);

drop trigger if exists trg_businesses_updated_at on public.businesses;
create trigger trg_businesses_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

alter table public.businesses enable row level security;

-- Public can read non-hidden businesses (scraped employer profiles render on job pages,
-- honestly marked by data_source/claim_status in the UI).
drop policy if exists "Anyone reads visible businesses" on public.businesses;
create policy "Anyone reads visible businesses"
  on public.businesses for select
  using (status = 'active');

-- NO direct claimant UPDATE policy, by design (trust-first). A claimed owner
-- must never self-edit trust/provenance columns (claim_status, trust_score,
-- confidence_score, data_source, abr_status, status, claimed_by). ALL business
-- writes — including a claimant editing descriptive fields (legal_name,
-- trading_name, contact_*, website_url, facebook_url) — go through service_role
-- server actions (createAdminClient) with app-level ownership checks, mirroring
-- the lib/posting pattern. The drop below is defensive in case an earlier draft
-- of this policy was ever created.
drop policy if exists "Claimant updates own business" on public.businesses;

drop policy if exists "Service role manages businesses" on public.businesses;
create policy "Service role manages businesses"
  on public.businesses for all to service_role using (true) with check (true);


-- ---------- business_members ----------
create table if not exists public.business_members (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner','manager','staff')),
  created_at   timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists idx_business_members_user on public.business_members (user_id);

alter table public.business_members enable row level security;

drop policy if exists "Members read own memberships" on public.business_members;
create policy "Members read own memberships"
  on public.business_members for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Service role manages business_members" on public.business_members;
create policy "Service role manages business_members"
  on public.business_members for all to service_role using (true) with check (true);


-- ---------- claims (claim-this-business) ----------
-- evidence is private: no anon/public SELECT policy exists (see header).
create table if not exists public.claims (
  id                uuid primary key default gen_random_uuid(),
  anonymised_id     text not null unique default public.gen_short_id('CLM'),
  business_id       uuid not null references public.businesses(id) on delete cascade,
  claimant_user_id  uuid not null references auth.users(id) on delete cascade,
  method            text not null
                      check (method in ('email_domain','phone_otp','abn_match','evidence_upload','admin_approval')),
  status            text not null default 'pending'
                      check (status in ('pending','approved','rejected','withdrawn')),
  evidence          jsonb,
  created_at        timestamptz not null default now(),
  reviewed_at       timestamptz,
  reviewed_by       uuid references auth.users(id) on delete set null,
  notes             text
);

create index if not exists idx_claims_business on public.claims (business_id, status);
create index if not exists idx_claims_claimant on public.claims (claimant_user_id);

alter table public.claims enable row level security;

-- A signed-in user may file a claim for themselves.
drop policy if exists "Users file own claims" on public.claims;
create policy "Users file own claims"
  on public.claims for insert to authenticated
  with check (auth.uid() = claimant_user_id);

drop policy if exists "Users read own claims" on public.claims;
create policy "Users read own claims"
  on public.claims for select to authenticated
  using (auth.uid() = claimant_user_id);

drop policy if exists "Admins read all claims" on public.claims;
create policy "Admins read all claims"
  on public.claims for select to authenticated
  using (exists (select 1 from public.user_profiles p
                 where p.user_id = auth.uid() and p.is_admin = true));

drop policy if exists "Service role manages claims" on public.claims;
create policy "Service role manages claims"
  on public.claims for all to service_role using (true) with check (true);

-- ============================================================
-- ROLLBACK (manual):
--   drop table if exists public.claims cascade;
--   drop table if exists public.business_members cascade;
--   drop table if exists public.businesses cascade;
--   drop table if exists public.countries cascade;
-- (No live data depends on these; safe to drop.)
-- ============================================================
