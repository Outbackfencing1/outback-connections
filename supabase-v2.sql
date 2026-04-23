-- ============================================================
-- Outback Connections — Supabase Schema v2
-- Rural consumer help service + data intelligence layer
-- Run in: Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================
-- This script is additive. v1 tables (jobs, profiles) are left
-- in place. Run it on the fresh "outback-connections" project.
-- ============================================================

-- ------------------------------------------------------------
-- Extensions
-- ------------------------------------------------------------
create extension if not exists pgcrypto;


-- ------------------------------------------------------------
-- Shared helpers
-- ------------------------------------------------------------

-- Updated-at trigger. v1's supabase-setup.sql already creates
-- this on the old project; we redefine here so v2 can stand alone.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Short, URL-safe case IDs. Example: HR-A8X2K9P3
-- Uses pgcrypto.gen_random_bytes for a cryptographically strong source.
-- 32-char alphabet (no 0/O/1/I) + 8 chars = 40 bits of entropy per id.
-- 256 is divisible by 32 so masking the low 5 bits of each byte gives a
-- uniform distribution over the alphabet (no modulo bias).
-- Caller should still retry on a unique-violation as defence in depth.
create or replace function public.gen_short_id(prefix text)
returns text as $$
declare
  alphabet text  := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  bytes    bytea := gen_random_bytes(8);
  out_id   text  := prefix || '-';
  i        int;
begin
  for i in 0..7 loop
    out_id := out_id || substr(alphabet, 1 + (get_byte(bytes, i) & 31), 1);
  end loop;
  return out_id;
end;
$$ language plpgsql volatile;


-- ============================================================
-- 1. REFERENCE TABLES
-- ============================================================

-- ------------------------------------------------------------
-- policy_versions
-- Immutable record of privacy policy + ToS versions.
-- Every user submission stamps the version current at consent.
-- ------------------------------------------------------------
create table if not exists public.policy_versions (
  id              uuid primary key default gen_random_uuid(),
  version         text not null unique,              -- e.g. 'pp-2026-04-22'
  kind            text not null check (kind in ('privacy', 'terms', 'combined')),
  effective_from  timestamptz not null default now(),
  source_path     text,                              -- lib/legal/privacy-v1.md
  created_at      timestamptz not null default now()
);

create index if not exists idx_policy_versions_effective
  on public.policy_versions (kind, effective_from desc);

alter table public.policy_versions enable row level security;

create policy "Anyone can read policy versions"
  on public.policy_versions for select using (true);

create policy "Service role manages policy versions"
  on public.policy_versions for all to service_role
  using (true) with check (true);


-- ------------------------------------------------------------
-- categories
-- Controlled vocabulary for problem/job categories.
-- FK'd from help_requests, complaints_private, incidents.
-- ------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,                  -- 'fencing', 'earthworks'
  label       text not null,                         -- 'Fencing'
  sort_order  int  not null default 100,
  active      boolean not null default true,
  of_relevant boolean not null default false,        -- triggers OF lead-flow consent
  created_at  timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "Anyone can read active categories"
  on public.categories for select
  using (active = true);

create policy "Service role manages categories"
  on public.categories for all to service_role
  using (true) with check (true);

-- Seed initial categories
insert into public.categories (slug, label, sort_order, of_relevant) values
  ('fencing',          'Fencing',                         10, true),
  ('earthworks',       'Earthworks / excavation',         20, false),
  ('bore-pumps',       'Bore / pumps / water',            30, false),
  ('station-work',     'Station work / mustering',        40, false),
  ('shearing',         'Shearing',                        50, false),
  ('plumbing',         'Plumbing',                        60, false),
  ('electrical',       'Electrical',                      70, false),
  ('roofing',          'Roofing',                         80, false),
  ('concreting',       'Concreting',                      90, false),
  ('building',         'Building / carpentry',           100, false),
  ('machinery-repair', 'Vehicle / machinery repair',     110, false),
  ('feed-hay',         'Feed / hay supply',              120, false),
  ('transport',        'Transport / freight',            130, false),
  ('landscaping',      'Landscaping / tree work',        140, false),
  ('pest-weed',        'Pest / weed control',            150, false),
  ('steel-supply',     'Steel supply / fabrication',     160, true),
  ('other',            'Something else',                 999, false)
on conflict (slug) do nothing;


-- ------------------------------------------------------------
-- regions
-- AU postcode reference. Populate from an AU postcode dataset
-- later; kept empty here so the FK is optional for now.
-- ------------------------------------------------------------
create table if not exists public.regions (
  postcode    text primary key,                      -- '2800'
  state       text not null,                         -- 'NSW'
  lga         text,                                  -- 'Orange City'
  region_name text,                                  -- 'Central West'
  created_at  timestamptz not null default now()
);

alter table public.regions enable row level security;

create policy "Anyone can read regions"
  on public.regions for select using (true);

create policy "Service role manages regions"
  on public.regions for all to service_role
  using (true) with check (true);


-- ============================================================
-- 2. PRIVATE SUBMISSION TABLES
-- Service-role only. No public read, no public write.
-- ============================================================

-- ------------------------------------------------------------
-- help_requests
-- Get Help submissions. Includes folded-in quote checks.
-- ------------------------------------------------------------
create table if not exists public.help_requests (
  id                       uuid primary key default gen_random_uuid(),
  anonymised_id            text not null unique default public.gen_short_id('HR'),

  -- Required common fields (every user-facing table has these)
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  source                   text not null default 'web'
                             check (source in ('web','phone','facebook','email','other')),
  postcode                 text not null,
  category_id              uuid references public.categories(id),

  -- Request detail
  request_type             text not null
                             check (request_type in (
                               'ripped_off',
                               'stuck_mid_project',
                               'quote_check',
                               'bad_workmanship',
                               'contractor_unfinished',
                               'general_question',
                               'other'
                             )),
  problem_summary          text not null,
  description              text not null,

  -- Contractor reference (private; never displayed)
  contractor_name          text,
  contractor_abn           text,

  -- For forecasting / analytics
  dollar_value_bracket     text
                             check (dollar_value_bracket in (
                               'under_1k','1k_5k','5k_20k','20k_50k','over_50k','unknown'
                             )),
  urgency_bracket          text
                             check (urgency_bracket in (
                               'emergency','this_week','this_month','no_rush','unknown'
                             )),
  timeline_bracket         text
                             check (timeline_bracket in (
                               'now','past_30d','past_12m','older','unknown'
                             )),
  material_type            text,

  -- Contact (email OR phone required; enforced by check below)
  contact_name             text not null,
  contact_email            text,
  contact_phone            text,
  contact_preferred_method text check (contact_preferred_method in ('email','phone','sms')),
  contact_best_time        text,

  -- Consent record
  policy_version_id        uuid not null references public.policy_versions(id),
  consent_store_data       boolean not null,
  consent_of_referral      boolean not null default false,
  consent_share_with_authorities boolean not null default false,
  consent_research_use     boolean not null default false,
  consent_timestamp        timestamptz not null default now(),
  consent_ip               inet,
  consent_user_agent       text,

  -- Triage state
  status                   text not null default 'new'
                             check (status in ('new','acknowledged','in_review','responded','closed','deleted')),
  internal_notes           text,
  responded_at             timestamptz,
  closed_at                timestamptz,
  closed_reason            text,

  constraint help_requests_consent_required check (consent_store_data = true),
  constraint help_requests_contact_required check (
    contact_email is not null or contact_phone is not null
  )
);

create index if not exists idx_help_requests_status_created
  on public.help_requests (status, created_at desc);

create index if not exists idx_help_requests_postcode
  on public.help_requests (postcode);

create index if not exists idx_help_requests_category
  on public.help_requests (category_id);

create trigger trg_help_requests_updated_at
  before update on public.help_requests
  for each row execute function public.set_updated_at();

alter table public.help_requests enable row level security;

-- No public read, no public write. Service role only.
create policy "Service role manages help_requests"
  on public.help_requests for all to service_role
  using (true) with check (true);


-- ------------------------------------------------------------
-- complaints_private
-- Report a Dodgy Operator submissions. Separate table from
-- help_requests because:
--   - different legal posture (evidence-heavy, longer retention)
--   - stricter RLS intent
--   - different auto-reply template + disclaimer
-- Named contractors are never published from this table.
-- ------------------------------------------------------------
create table if not exists public.complaints_private (
  id                       uuid primary key default gen_random_uuid(),
  anonymised_id            text not null unique default public.gen_short_id('CP'),

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  source                   text not null default 'web'
                             check (source in ('web','phone','facebook','email','other')),
  postcode                 text not null,
  category_id              uuid references public.categories(id),

  -- Complaint detail
  incident_summary         text not null,
  description              text not null,
  evidence_notes           text,                    -- description of evidence held, not evidence itself
  has_photos               boolean not null default false,
  has_contract             boolean not null default false,
  has_correspondence       boolean not null default false,

  -- Contractor identified (private; never displayed)
  contractor_name          text not null,
  contractor_abn           text,
  contractor_trading_name  text,
  contractor_location      text,

  -- For analytics
  dollar_value_bracket     text
                             check (dollar_value_bracket in (
                               'under_1k','1k_5k','5k_20k','20k_50k','over_50k','unknown'
                             )),
  incident_date_bracket    text
                             check (incident_date_bracket in (
                               'past_30d','past_12m','1_to_5y','older','unknown'
                             )),
  material_type            text,

  -- Contact
  contact_name             text not null,
  contact_email            text not null,
  contact_phone            text,
  contact_preferred_method text check (contact_preferred_method in ('email','phone','sms')),
  contact_best_time        text,

  -- Whether the complainant has already escalated elsewhere
  reported_to_fair_trading boolean not null default false,
  fair_trading_ref         text,
  reported_to_police       boolean not null default false,

  -- Consent record (same pattern as help_requests)
  policy_version_id        uuid not null references public.policy_versions(id),
  consent_store_data       boolean not null,
  consent_share_with_authorities boolean not null default false,
  consent_research_use     boolean not null default false,
  consent_timestamp        timestamptz not null default now(),
  consent_ip               inet,
  consent_user_agent       text,

  -- Triage state
  status                   text not null default 'new'
                             check (status in ('new','acknowledged','in_review','escalated','responded','closed','deleted')),
  internal_notes           text,
  responded_at             timestamptz,
  closed_at                timestamptz,
  closed_reason            text,

  constraint complaints_private_consent_required check (consent_store_data = true)
);

create index if not exists idx_complaints_private_status_created
  on public.complaints_private (status, created_at desc);

create index if not exists idx_complaints_private_postcode
  on public.complaints_private (postcode);

create index if not exists idx_complaints_private_category
  on public.complaints_private (category_id);

create trigger trg_complaints_private_updated_at
  before update on public.complaints_private
  for each row execute function public.set_updated_at();

alter table public.complaints_private enable row level security;

-- Service role only. No public policies of any kind.
create policy "Service role manages complaints_private"
  on public.complaints_private for all to service_role
  using (true) with check (true);


-- ============================================================
-- 3. PHASE 2 SCAFFOLDS (tables exist, no write path in Phase 1)
-- ============================================================

-- ------------------------------------------------------------
-- contractors
-- Vetted contractor directory. Phase 2. Only 'verified' rows
-- are visible publicly.
-- ------------------------------------------------------------
create table if not exists public.contractors (
  id               uuid primary key default gen_random_uuid(),
  anonymised_id    text not null unique default public.gen_short_id('CT'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  source           text not null default 'web'
                     check (source in ('web','phone','facebook','email','other')),
  postcode         text not null,
  category_id      uuid references public.categories(id),

  -- Directory fields
  slug             text unique,
  business_name    text not null,
  trading_name     text,
  abn              text,
  licence_number   text,
  insured          boolean default false,
  insurance_expiry date,
  service_areas    text[] default '{}',
  skills           text[] default '{}',
  bio              text,
  website          text,
  contact_email    text,
  contact_phone    text,

  -- Vetting state
  vetting_status   text not null default 'pending'
                     check (vetting_status in ('pending','in_review','verified','rejected','suspended')),
  verified_at      timestamptz,
  verified_by      text,
  rejected_reason  text,

  -- Consent
  policy_version_id uuid references public.policy_versions(id),
  consent_listing   boolean not null default false
);

create index if not exists idx_contractors_vetting on public.contractors (vetting_status);
create index if not exists idx_contractors_category on public.contractors (category_id);
create index if not exists idx_contractors_postcode on public.contractors (postcode);

create trigger trg_contractors_updated_at
  before update on public.contractors
  for each row execute function public.set_updated_at();

alter table public.contractors enable row level security;

-- Public can read only verified contractors
create policy "Anyone can read verified contractors"
  on public.contractors for select
  using (vetting_status = 'verified');

create policy "Service role manages contractors"
  on public.contractors for all to service_role
  using (true) with check (true);


-- ------------------------------------------------------------
-- reviews_public
-- Phase 2. Public reviews of contractors. Only 'published'
-- rows are visible publicly; moderation + right-of-reply gate.
-- ------------------------------------------------------------
create table if not exists public.reviews_public (
  id                 uuid primary key default gen_random_uuid(),
  anonymised_id      text not null unique default public.gen_short_id('RV'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  source             text not null default 'web'
                       check (source in ('web','phone','facebook','email','other')),
  postcode           text not null,
  category_id        uuid references public.categories(id),

  contractor_id      uuid not null references public.contractors(id),
  reviewer_name_public text,                             -- optional public display name
  rating             int not null check (rating between 1 and 5),
  title              text,
  body               text not null,
  job_value_bracket  text
                       check (job_value_bracket in (
                         'under_1k','1k_5k','5k_20k','20k_100k','over_100k','unknown'
                       )),

  -- Moderation state
  moderation_status  text not null default 'pending'
                       check (moderation_status in (
                         'pending','approved','published','rejected','retracted','disputed'
                       )),
  moderated_at       timestamptz,
  moderated_by       text,
  moderation_notes   text,

  -- Right-of-reply
  reply_sent_at      timestamptz,
  reply_received_at  timestamptz,
  contractor_response text,

  -- Private reviewer contact (for verification / right-of-reply)
  reviewer_email     text not null,
  reviewer_phone     text,

  policy_version_id  uuid not null references public.policy_versions(id),
  consent_publish    boolean not null default false
);

create index if not exists idx_reviews_public_contractor on public.reviews_public (contractor_id);
create index if not exists idx_reviews_public_moderation on public.reviews_public (moderation_status);

create trigger trg_reviews_public_updated_at
  before update on public.reviews_public
  for each row execute function public.set_updated_at();

alter table public.reviews_public enable row level security;

-- Only published reviews are publicly readable, and only the
-- public-safe columns. We enforce the column limit at the app layer
-- (select lists) because RLS is row-level, not column-level.
create policy "Anyone can read published reviews"
  on public.reviews_public for select
  using (moderation_status = 'published');

create policy "Service role manages reviews_public"
  on public.reviews_public for all to service_role
  using (true) with check (true);


-- ============================================================
-- 4. ANALYTICS LAYER
-- ============================================================

-- ------------------------------------------------------------
-- incidents
-- De-identified event stream. Populated by triggers on
-- help_requests and complaints_private. NO PII in this table:
-- no names, no emails, no phone numbers, no descriptions, no
-- contractor names, no exact dollar amounts.
-- Only categorical + geographic + temporal fields survive.
-- Individual rows are still service-role-only; public access
-- is through aggregate views with the 5-record threshold.
-- ------------------------------------------------------------
create table if not exists public.incidents (
  id                    uuid primary key default gen_random_uuid(),
  anonymised_id         text not null unique default public.gen_short_id('IN'),
  created_at            timestamptz not null default now(),

  -- Back-reference (to the source's anonymised_id, not its uuid)
  source_kind           text not null check (source_kind in ('help_request','complaint','review')),
  source_anonymised_id  text not null,

  -- Categorical + geographic (all from the parent row)
  source                text not null,
  postcode              text not null,
  state                 text,            -- populated from regions if known
  category_id           uuid references public.categories(id),
  request_type          text,            -- help_requests.request_type if applicable
  dollar_value_bracket  text,
  urgency_bracket       text,
  timeline_bracket      text,
  material_type         text,

  -- Outcome (updated later, nullable)
  outcome               text
                          check (outcome in (
                            'unresolved','resolved','escalated','referred_of','referred_fair_trading','other'
                          ))
);

create index if not exists idx_incidents_postcode_category
  on public.incidents (postcode, category_id, created_at desc);

create index if not exists idx_incidents_state_category
  on public.incidents (state, category_id, created_at desc);

create index if not exists idx_incidents_created
  on public.incidents (created_at desc);

alter table public.incidents enable row level security;

-- Service role only at row level. Public aggregates go through views.
create policy "Service role manages incidents"
  on public.incidents for all to service_role
  using (true) with check (true);


-- ------------------------------------------------------------
-- Trigger: populate incidents from help_requests
-- ------------------------------------------------------------
create or replace function public.incidents_from_help_request()
returns trigger as $$
begin
  insert into public.incidents (
    source_kind, source_anonymised_id, source,
    postcode, state, category_id, request_type,
    dollar_value_bracket, urgency_bracket, timeline_bracket, material_type
  )
  values (
    'help_request', new.anonymised_id, new.source,
    new.postcode,
    (select state from public.regions where postcode = new.postcode),
    new.category_id, new.request_type,
    new.dollar_value_bracket, new.urgency_bracket, new.timeline_bracket, new.material_type
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_incidents_from_help_request on public.help_requests;
create trigger trg_incidents_from_help_request
  after insert on public.help_requests
  for each row execute function public.incidents_from_help_request();


-- ------------------------------------------------------------
-- Trigger: populate incidents from complaints_private
-- Maps complaints' incident_date_bracket -> timeline_bracket.
-- ------------------------------------------------------------
create or replace function public.incidents_from_complaint()
returns trigger as $$
declare
  tb text;
begin
  tb := case new.incident_date_bracket
          when 'past_30d' then 'past_30d'
          when 'past_12m' then 'past_12m'
          when '1_to_5y'  then 'older'
          when 'older'    then 'older'
          else 'unknown'
        end;

  insert into public.incidents (
    source_kind, source_anonymised_id, source,
    postcode, state, category_id, request_type,
    dollar_value_bracket, urgency_bracket, timeline_bracket, material_type
  )
  values (
    'complaint', new.anonymised_id, new.source,
    new.postcode,
    (select state from public.regions where postcode = new.postcode),
    new.category_id, 'report_dodgy_operator',
    new.dollar_value_bracket, null, tb, new.material_type
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_incidents_from_complaint on public.complaints_private;
create trigger trg_incidents_from_complaint
  after insert on public.complaints_private
  for each row execute function public.incidents_from_complaint();


-- ------------------------------------------------------------
-- Trigger: delete incidents when the source row is deleted
-- (keeps the analytics layer consistent with privacy deletion requests)
-- ------------------------------------------------------------
create or replace function public.incidents_cleanup_on_source_delete()
returns trigger as $$
begin
  delete from public.incidents where source_anonymised_id = old.anonymised_id;
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_incidents_cleanup_help_request on public.help_requests;
create trigger trg_incidents_cleanup_help_request
  after delete on public.help_requests
  for each row execute function public.incidents_cleanup_on_source_delete();

drop trigger if exists trg_incidents_cleanup_complaint on public.complaints_private;
create trigger trg_incidents_cleanup_complaint
  after delete on public.complaints_private
  for each row execute function public.incidents_cleanup_on_source_delete();


-- ============================================================
-- 5. PUBLIC AGGREGATE VIEWS
-- 5-record minimum enforced at the view level.
-- Nothing below this threshold is ever visible publicly.
-- ============================================================

-- ------------------------------------------------------------
-- incidents_by_postcode_category
-- Counts grouped by postcode + category. Suppressed below N=5.
-- ------------------------------------------------------------
create or replace view public.incidents_by_postcode_category
with (security_invoker = true) as
select
  postcode,
  category_id,
  count(*)::int as n,
  min(created_at) as first_seen,
  max(created_at) as last_seen
from public.incidents
group by postcode, category_id
having count(*) >= 5;

grant select on public.incidents_by_postcode_category to anon, authenticated;


-- ------------------------------------------------------------
-- incidents_by_state_category
-- Counts grouped by state + category. Suppressed below N=5.
-- ------------------------------------------------------------
create or replace view public.incidents_by_state_category
with (security_invoker = true) as
select
  state,
  category_id,
  count(*)::int as n,
  min(created_at) as first_seen,
  max(created_at) as last_seen
from public.incidents
where state is not null
group by state, category_id
having count(*) >= 5;

grant select on public.incidents_by_state_category to anon, authenticated;


-- ============================================================
-- 6. SEED: initial policy version
-- Insert a placeholder so Phase 1 inserts don't fail on the
-- policy_version_id FK. Replace `source_path` once the drafted
-- policy lands under lib/legal/ and LawPath has reviewed.
-- ============================================================
insert into public.policy_versions (version, kind, source_path)
values ('v1-2026-04-22-draft', 'combined', 'lib/legal/combined-v1.md')
on conflict (version) do nothing;


-- ============================================================
-- End of supabase-v2.sql
-- ============================================================
