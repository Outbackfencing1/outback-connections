-- ============================================================
-- Outback Connections — Marketplace Schema v3
-- ============================================================
-- Project: csisezoohgfrpjrhkmls (outback-connections, Sydney)
-- Applied via Supabase MCP as migration `v3_marketplace`.
-- Safe to re-run: all statements are idempotent (IF NOT EXISTS / ON CONFLICT
-- DO NOTHING / DROP+CREATE for triggers and check constraints).
--
-- Additive. Leaves help-service tables (help_requests, complaints_private,
-- incidents) intact but inactive — see PARKED.md.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Extend categories: pillar column + v3 marketplace taxonomy
-- ------------------------------------------------------------

-- Add pillar column if missing
alter table public.categories
  add column if not exists pillar text;

-- Backfill any NULL pillars (from legacy help-service rows) to 'services'
update public.categories
  set pillar = 'services'
  where pillar is null;

-- Deactivate the 17 help-service-era seed categories so browse pages
-- don't show them; the v3 taxonomy replaces them.
update public.categories
  set active = false
  where slug in (
    'fencing','earthworks','bore-pumps','station-work','shearing',
    'plumbing','electrical','roofing','concreting','building',
    'machinery-repair','feed-hay','transport','landscaping',
    'pest-weed','steel-supply','other'
  );

-- Make pillar NOT NULL + add check constraint
alter table public.categories
  alter column pillar set not null;

alter table public.categories
  drop constraint if exists categories_pillar_check;
alter table public.categories
  add constraint categories_pillar_check
  check (pillar in ('jobs','freight','services'));

-- Seed v3 marketplace taxonomy
insert into public.categories (slug, label, pillar, sort_order, active) values
  -- Jobs (8 + Other)
  ('station-hand',            'Station hand / general farm labour',         'jobs',      10, true),
  ('shearer',                 'Shearer / shed hand',                        'jobs',      20, true),
  ('mustering',               'Mustering / stock handling',                 'jobs',      30, true),
  ('harvest-worker',          'Harvest / seasonal crop',                    'jobs',      40, true),
  ('fencing-labour',          'Fencing labour',                             'jobs',      50, true),
  ('earthworks-operator',     'Earthworks operator',                        'jobs',      60, true),
  ('ag-truck-driver',         'Agricultural truck driver',                  'jobs',      70, true),
  ('dairy-feedlot',           'Dairy / feedlot',                            'jobs',      80, true),
  ('jobs-other',              'Other rural work',                           'jobs',     999, true),
  -- Freight (7 + Other)
  ('livestock-freight',       'Livestock transport',                        'freight',   10, true),
  ('grain-freight',           'Grain / crop haulage',                       'freight',   20, true),
  ('hay-freight',             'Hay & fodder',                               'freight',   30, true),
  ('machinery-freight',       'Machinery / oversize',                       'freight',   40, true),
  ('fuel-water-freight',      'Fuel / water cartage',                       'freight',   50, true),
  ('refrigerated-freight',    'Refrigerated',                               'freight',   60, true),
  ('general-rural-freight',   'General rural freight',                      'freight',   70, true),
  ('freight-other',           'Other',                                      'freight',  999, true),
  -- Services (20 + Other) — the moat
  ('bore-pump-water',         'Bore / pump / water',                        'services',  10, true),
  ('helicopter-services',     'Helicopter services',                        'services',  20, true),
  ('fixed-wing-ag',           'Fixed-wing agricultural',                    'services',  30, true),
  ('drone-services',          'Drone services',                             'services',  40, true),
  ('mobile-diesel-mechanic',  'Mobile diesel mechanic',                     'services',  50, true),
  ('ag-machinery-repair',     'Agricultural machinery repair',              'services',  60, true),
  ('shearing-team',           'Shearing team contractor',                   'services',  70, true),
  ('contract-cropping',       'Contract cropping / harvest contractor',     'services',  80, true),
  ('service-earthworks',      'Earthworks (dams, roads, clearing)',         'services',  90, true),
  ('fencing-contractor',      'Fencing contractor (construction)',          'services', 100, true),
  ('welding-fabrication',     'Welding / fabrication',                      'services', 110, true),
  ('rural-electrical',        'Rural electrical',                           'services', 120, true),
  ('rural-plumbing',          'Rural plumbing',                             'services', 130, true),
  ('livestock-specialist',    'Livestock specialist services',              'services', 140, true),
  ('spraying-weed-pest',      'Spraying / weed / pest control',             'services', 150, true),
  ('seed-fertilizer-spreading','Seed / fertilizer spreading',               'services', 160, true),
  ('building-shed',           'Building / shed construction',               'services', 170, true),
  ('refrigeration',           'Refrigeration (coolrooms, dairy)',           'services', 180, true),
  ('truck-tyre-specialty',    'Truck tyre & specialty repair',              'services', 190, true),
  ('services-other',          'Other rural service',                        'services', 999, true)
on conflict (slug) do nothing;

create index if not exists idx_categories_pillar_active
  on public.categories (pillar, active, sort_order);


-- ------------------------------------------------------------
-- 2. user_profiles — extends auth.users
-- ------------------------------------------------------------
create table if not exists public.user_profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  display_name      text,
  postcode          text,
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  abn               text,
  abn_verified_at   timestamptz,
  abn_entity_name   text,
  flag_count        int not null default 0,
  is_admin          boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;

drop policy if exists "Users read own profile" on public.user_profiles;
create policy "Users read own profile"
  on public.user_profiles for select
  using (auth.uid() = user_id);

drop policy if exists "Users update own profile" on public.user_profiles;
create policy "Users update own profile"
  on public.user_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Service role manages profiles" on public.user_profiles;
create policy "Service role manages profiles"
  on public.user_profiles for all to service_role
  using (true) with check (true);

-- Public view — exposes only safe columns (display_name by user_id)
-- for showing listing author. security_invoker=false so anon can read
-- via the view even though the underlying table has strict RLS.
create or replace view public.user_profiles_public
with (security_invoker = false) as
select user_id, display_name
from public.user_profiles;

grant select on public.user_profiles_public to anon, authenticated;

-- Trigger: auto-create user_profiles row when auth.users inserts
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (user_id, email_verified_at)
  values (new.id, new.email_confirmed_at)
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any existing auth.users
insert into public.user_profiles (user_id, email_verified_at)
select id, email_confirmed_at from auth.users
on conflict (user_id) do nothing;


-- ------------------------------------------------------------
-- 3. listings master table
-- ------------------------------------------------------------
create table if not exists public.listings (
  id                 uuid primary key default gen_random_uuid(),
  anonymised_id      text not null unique default public.gen_short_id('LST'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  expires_at         timestamptz not null default (now() + interval '30 days'),

  status             text not null default 'active'
                       check (status in (
                         'draft','active','hidden_flagged','expired',
                         'deleted_by_user','deleted_by_admin'
                       )),
  kind               text not null
                       check (kind in (
                         'job','freight','service_offering','service_request'
                       )),
  category_id        uuid not null references public.categories(id),
  user_id            uuid not null references auth.users(id) on delete cascade,
  slug               text not null unique,

  title              text not null,
  description        text not null,
  postcode           text not null,
  state              text,

  contact_email      text,
  contact_phone      text,
  contact_best_time  text,

  flag_count         int not null default 0,

  policy_version_id  uuid not null references public.policy_versions(id),

  constraint listings_contact_required check (
    contact_email is not null or contact_phone is not null
  )
);

create index if not exists idx_listings_kind_status_postcode_created
  on public.listings (kind, status, postcode, created_at desc);
create index if not exists idx_listings_kind_status_category_created
  on public.listings (kind, status, category_id, created_at desc);
create index if not exists idx_listings_user
  on public.listings (user_id);
create index if not exists idx_listings_expires
  on public.listings (status, expires_at);

drop trigger if exists trg_listings_updated_at on public.listings;
create trigger trg_listings_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

alter table public.listings enable row level security;

drop policy if exists "Anyone reads active unexpired listings" on public.listings;
create policy "Anyone reads active unexpired listings"
  on public.listings for select
  using (status = 'active' and expires_at > now());

drop policy if exists "Owners read own listings" on public.listings;
create policy "Owners read own listings"
  on public.listings for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Authenticated insert own listings" on public.listings;
create policy "Authenticated insert own listings"
  on public.listings for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Owners update own listings" on public.listings;
create policy "Owners update own listings"
  on public.listings for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owners delete own listings" on public.listings;
create policy "Owners delete own listings"
  on public.listings for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Service role manages listings" on public.listings;
create policy "Service role manages listings"
  on public.listings for all to service_role
  using (true) with check (true);


-- ------------------------------------------------------------
-- 4. job_details
-- ------------------------------------------------------------
create table if not exists public.job_details (
  listing_id             uuid primary key references public.listings(id) on delete cascade,
  work_type              text check (work_type in ('full_time','casual','contract','seasonal','day_rate')),
  pay_type               text check (pay_type in ('hourly','daily','weekly','negotiable','not_specified')),
  pay_amount             numeric(10,2),
  start_date             date,
  duration_text          text,
  accommodation_provided boolean not null default false
);

alter table public.job_details enable row level security;

drop policy if exists "Anyone reads job_details for readable listings" on public.job_details;
create policy "Anyone reads job_details for readable listings"
  on public.job_details for select
  using (exists (
    select 1 from public.listings l
    where l.id = job_details.listing_id
      and (
        (l.status = 'active' and l.expires_at > now())
        or l.user_id = auth.uid()
      )
  ));

drop policy if exists "Owners insert own job_details" on public.job_details;
create policy "Owners insert own job_details"
  on public.job_details for insert
  to authenticated
  with check (exists (
    select 1 from public.listings l
    where l.id = job_details.listing_id and l.user_id = auth.uid()
  ));

drop policy if exists "Owners update own job_details" on public.job_details;
create policy "Owners update own job_details"
  on public.job_details for update
  to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = job_details.listing_id and l.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.listings l
    where l.id = job_details.listing_id and l.user_id = auth.uid()
  ));

drop policy if exists "Service role manages job_details" on public.job_details;
create policy "Service role manages job_details"
  on public.job_details for all to service_role
  using (true) with check (true);


-- ------------------------------------------------------------
-- 5. freight_details
-- ------------------------------------------------------------
create table if not exists public.freight_details (
  listing_id           uuid primary key references public.listings(id) on delete cascade,
  direction            text not null check (direction in ('need_freight','offering_truck')),
  origin_postcode      text,
  destination_postcode text,
  vehicle_type         text check (vehicle_type in ('tipper','livestock','flatbed','b_double','refrigerated','tray','other')),
  cargo_type           text check (cargo_type in ('livestock','grain','hay_fodder','machinery','fuel_water','refrigerated','general','other')),
  weight_kg            int,
  pickup_from_date     date,
  pickup_by_date       date,
  budget_bracket       text check (budget_bracket in ('under_1k','1k_5k','5k_20k','20k_50k','over_50k','unknown'))
);

alter table public.freight_details enable row level security;

drop policy if exists "Anyone reads freight_details for readable listings" on public.freight_details;
create policy "Anyone reads freight_details for readable listings"
  on public.freight_details for select
  using (exists (
    select 1 from public.listings l
    where l.id = freight_details.listing_id
      and (
        (l.status = 'active' and l.expires_at > now())
        or l.user_id = auth.uid()
      )
  ));

drop policy if exists "Owners insert own freight_details" on public.freight_details;
create policy "Owners insert own freight_details"
  on public.freight_details for insert
  to authenticated
  with check (exists (
    select 1 from public.listings l
    where l.id = freight_details.listing_id and l.user_id = auth.uid()
  ));

drop policy if exists "Owners update own freight_details" on public.freight_details;
create policy "Owners update own freight_details"
  on public.freight_details for update
  to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = freight_details.listing_id and l.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.listings l
    where l.id = freight_details.listing_id and l.user_id = auth.uid()
  ));

drop policy if exists "Service role manages freight_details" on public.freight_details;
create policy "Service role manages freight_details"
  on public.freight_details for all to service_role
  using (true) with check (true);


-- ------------------------------------------------------------
-- 6. service_details
-- ------------------------------------------------------------
create table if not exists public.service_details (
  listing_id          uuid primary key references public.listings(id) on delete cascade,
  direction           text not null check (direction in ('offering','requesting')),
  rate_type           text check (rate_type in ('hourly','daily','fixed','per_km','quote','negotiable')),
  rate_amount         numeric(10,2),
  travel_willingness  text check (travel_willingness in ('postcode_only','within_50km','within_200km','state_wide','national')),
  service_postcodes   text[] default '{}'
);

alter table public.service_details enable row level security;

drop policy if exists "Anyone reads service_details for readable listings" on public.service_details;
create policy "Anyone reads service_details for readable listings"
  on public.service_details for select
  using (exists (
    select 1 from public.listings l
    where l.id = service_details.listing_id
      and (
        (l.status = 'active' and l.expires_at > now())
        or l.user_id = auth.uid()
      )
  ));

drop policy if exists "Owners insert own service_details" on public.service_details;
create policy "Owners insert own service_details"
  on public.service_details for insert
  to authenticated
  with check (exists (
    select 1 from public.listings l
    where l.id = service_details.listing_id and l.user_id = auth.uid()
  ));

drop policy if exists "Owners update own service_details" on public.service_details;
create policy "Owners update own service_details"
  on public.service_details for update
  to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = service_details.listing_id and l.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.listings l
    where l.id = service_details.listing_id and l.user_id = auth.uid()
  ));

drop policy if exists "Service role manages service_details" on public.service_details;
create policy "Service role manages service_details"
  on public.service_details for all to service_role
  using (true) with check (true);


-- ------------------------------------------------------------
-- 7. listing_flags + flag_count trigger
-- ------------------------------------------------------------
create table if not exists public.listing_flags (
  id            uuid primary key default gen_random_uuid(),
  anonymised_id text not null unique default public.gen_short_id('FLG'),
  listing_id    uuid not null references public.listings(id) on delete cascade,
  flagged_by    uuid not null references auth.users(id) on delete cascade,
  reason        text not null check (reason in ('scam','duplicate','offensive','miscategorised','other')),
  note          text,
  created_at    timestamptz not null default now(),
  unique (listing_id, flagged_by)
);

create index if not exists idx_listing_flags_listing
  on public.listing_flags (listing_id, created_at desc);

alter table public.listing_flags enable row level security;

drop policy if exists "Authenticated users insert flags" on public.listing_flags;
create policy "Authenticated users insert flags"
  on public.listing_flags for insert
  to authenticated
  with check (auth.uid() = flagged_by);

drop policy if exists "Owners read flags against own listings" on public.listing_flags;
create policy "Owners read flags against own listings"
  on public.listing_flags for select
  to authenticated
  using (exists (
    select 1 from public.listings l
    where l.id = listing_flags.listing_id and l.user_id = auth.uid()
  ));

drop policy if exists "Admins read all flags" on public.listing_flags;
create policy "Admins read all flags"
  on public.listing_flags for select
  to authenticated
  using (exists (
    select 1 from public.user_profiles p
    where p.user_id = auth.uid() and p.is_admin = true
  ));

drop policy if exists "Service role manages flags" on public.listing_flags;
create policy "Service role manages flags"
  on public.listing_flags for all to service_role
  using (true) with check (true);

-- Bump listings.flag_count on insert so browse queries can sort/filter
create or replace function public.bump_listing_flag_count()
returns trigger as $$
begin
  update public.listings
  set flag_count = flag_count + 1
  where id = new.listing_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_bump_flag_count on public.listing_flags;
create trigger trg_bump_flag_count
  after insert on public.listing_flags
  for each row execute function public.bump_listing_flag_count();


-- ------------------------------------------------------------
-- 8. Seed marketplace policy version
-- ------------------------------------------------------------
insert into public.policy_versions (version, kind, source_path)
values (
  'v2-2026-04-23-marketplace-draft',
  'combined',
  'lib/legal/marketplace-v2.md'
)
on conflict (version) do nothing;


-- ============================================================
-- End of supabase-v3-marketplace.sql
-- ============================================================
