-- ============================================================
-- BASELINE — live schema snapshot
-- ============================================================
-- Project : csisezoohgfrpjrhkmls (outback-connections, ap-southeast-2 Sydney)
-- Captured: 2026-06-08, generated from the live database via pg_get_* /
--           pg_policies serializers (no pg_dump/CLI was available).
-- Purpose : Make the repo able to reproduce the live `public` schema, and
--           fix the migration-file-chain gap (11 migrations had been applied
--           via the Supabase MCP; only 2 were committed as files).
--
-- This is a SQUASHED BASELINE consolidating these already-applied migrations:
--   20260422093801 v1_jobs_profiles
--   20260422191830 v2_help_service
--   20260424230528 v3_marketplace
--   20260425043304 v3_marketplace_cron
--   20260425063611 derive_listing_state_from_regions
--   20260425071008 listings_outcome_capture
--   20260425080154 user_profiles_consent_columns
--   20260425081209 defamation_complaints_table
--   20260425204426 moderation_actions_audit_trail
--   20260426072952 legal_hardening_pass_schema
--   20260521210608 create_ericka_sales_quotes
--
-- HOW TO USE
--   * Fresh rebuild (empty DB): this file runs FIRST, then forward migrations
--     (spine M1, M2, ...) run in timestamp order after it.
--   * Existing live DB: DO NOT re-run this file. The objects already exist.
--     If/when the Supabase CLI is adopted, mark this baseline as already
--     applied (e.g. `supabase migration repair --status applied 00000000000000`).
--
-- SCOPE / CAVEATS
--   * Captures the `public` schema only: extensions, functions, tables,
--     constraints, indexes, triggers, views, view grants, RLS + policies,
--     plus the one trigger on auth.users.
--   * Does NOT include bulk reference data. Reproduce separately:
--       - categories : seeded by v2/v3 marketplace migration SQL (in repo root)
--       - regions    : ~2,655 rows via scripts/seed-regions.mjs + push-regions.mjs
--       - policy_versions / app_settings('lockdown') : seeded by their migrations
--   * Does NOT include the supabase_managed `auth`/`storage` schemas, role
--     grants beyond views, or the supabase_migrations history table.
--   * `extensions`, `vault`, `pg_catalog` schemas are assumed present
--     (Supabase-managed on every project).
--
-- QUARANTINE NOTE
--   `public.ericka_sales_quotes` belongs to a separate app (the Ericka quote
--   portal) and is captured here only to faithfully mirror the live DB. It is
--   QUARANTINED: do not move, alter, or drop it in this project. It is a
--   candidate for relocation to its own Supabase project — separate task.
-- ============================================================


-- ------------------------------------------------------------
-- 0. Extensions (Supabase-managed schemas assumed to exist)
-- ------------------------------------------------------------
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_cron with schema pg_catalog;


-- ------------------------------------------------------------
-- 1. Functions (public)
--   NOTE: gen_short_id() depends on gen_random_bytes() from the `extensions`
--   schema. Several functions have a role-mutable search_path (flagged by the
--   security advisor); pinning must include `extensions`, not just `public`.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_clear_flags(target_listing uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  flag_count_before int;
begin
  if not exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and is_admin = true
  ) then
    raise exception 'Not authorised';
  end if;

  select flag_count into flag_count_before
  from public.listings where id = target_listing;

  delete from public.listing_flags where listing_id = target_listing;
  update public.listings set flag_count = 0 where id = target_listing;

  insert into public.moderation_actions (
    actor_user_id, listing_id, listing_title_snapshot, action, reason,
    before_status, after_status, before_data
  )
  select
    auth.uid(), l.id, l.title, 'clear_flags',
    concat('cleared ', flag_count_before, ' flag(s)'),
    l.status::text, l.status::text,
    jsonb_build_object('flag_count_before', flag_count_before)
  from public.listings l where l.id = target_listing;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_hide_listing(target_listing uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  before_status_val text;
  before_title text;
begin
  if not exists (
    select 1 from public.user_profiles
    where user_id = auth.uid() and is_admin = true
  ) then
    raise exception 'Not authorised';
  end if;

  select status, title into before_status_val, before_title
  from public.listings where id = target_listing;

  update public.listings
  set status = 'hidden_flagged'
  where id = target_listing;

  insert into public.moderation_actions (
    actor_user_id, listing_id, listing_title_snapshot, action,
    before_status, after_status
  )
  values (
    auth.uid(), target_listing, before_title, 'hide',
    before_status_val, 'hidden_flagged'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_lockdown(p_active boolean, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_admin boolean;
  result jsonb;
BEGIN
  SELECT is_admin INTO caller_admin
    FROM user_profiles
    WHERE user_id = auth.uid();

  IF NOT coalesce(caller_admin, false) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE app_settings
    SET value = jsonb_build_object(
          'active', p_active,
          'reason', p_reason,
          'activated_at', case when p_active then now() else null end
        ),
        updated_at = now(),
        updated_by = auth.uid()
    WHERE key = 'lockdown'
    RETURNING value INTO result;
  RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bump_listing_flag_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.listings set flag_count = flag_count + 1 where id = new.listing_id;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.derive_listing_state()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.postcode is not null then
    select r.state into new.state
    from public.regions r
    where r.postcode = new.postcode;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gen_short_id(prefix text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
declare
  alphabet text  := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes    bytea := gen_random_bytes(8);
  out_id   text  := prefix || '-';
  i        int;
begin
  for i in 0..7 loop
    out_id := out_id || substr(alphabet, 1 + (get_byte(bytes, i) & 31), 1);
  end loop;
  return out_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.user_profiles (user_id, email_verified_at)
  values (new.id, new.email_confirmed_at)
  on conflict (user_id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.incidents_cleanup_on_source_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  delete from public.incidents where source_anonymised_id = old.anonymised_id;
  return old;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.incidents_from_complaint()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.incidents_from_help_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.purge_old_auth_events()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM auth_events WHERE created_at < (now() - interval '90 days');
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;


-- ------------------------------------------------------------
-- 2. Tables (public)
-- ------------------------------------------------------------
create table if not exists public.account_deletions (
  id uuid not null default gen_random_uuid(),
  anonymised_id text not null default gen_short_id('DEL'::text),
  user_id uuid not null,
  user_email_snapshot text,
  deletion_requested_at timestamp with time zone not null default now(),
  deletion_completed_at timestamp with time zone,
  retention_reason text,
  final_purge_at timestamp with time zone,
  initiated_by text not null default 'user'::text
);

create table if not exists public.app_settings (
  key text not null,
  value jsonb not null,
  updated_at timestamp with time zone not null default now(),
  updated_by uuid
);

create table if not exists public.auth_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid,
  email text,
  event_type text not null,
  ip inet,
  user_agent text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.categories (
  id uuid not null default gen_random_uuid(),
  slug text not null,
  label text not null,
  sort_order integer not null default 100,
  active boolean not null default true,
  of_relevant boolean not null default false,
  created_at timestamp with time zone not null default now(),
  pillar text not null
);

create table if not exists public.complaints_private (
  id uuid not null default gen_random_uuid(),
  anonymised_id text not null default gen_short_id('CP'::text),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  source text not null default 'web'::text,
  postcode text not null,
  category_id uuid,
  incident_summary text not null,
  description text not null,
  evidence_notes text,
  has_photos boolean not null default false,
  has_contract boolean not null default false,
  has_correspondence boolean not null default false,
  contractor_name text not null,
  contractor_abn text,
  contractor_trading_name text,
  contractor_location text,
  dollar_value_bracket text,
  incident_date_bracket text,
  material_type text,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  contact_preferred_method text,
  contact_best_time text,
  reported_to_fair_trading boolean not null default false,
  fair_trading_ref text,
  reported_to_police boolean not null default false,
  policy_version_id uuid not null,
  consent_store_data boolean not null,
  consent_share_with_authorities boolean not null default false,
  consent_research_use boolean not null default false,
  consent_timestamp timestamp with time zone not null default now(),
  consent_ip inet,
  consent_user_agent text,
  status text not null default 'new'::text,
  internal_notes text,
  responded_at timestamp with time zone,
  closed_at timestamp with time zone,
  closed_reason text
);

create table if not exists public.contractors (
  id uuid not null default gen_random_uuid(),
  anonymised_id text not null default gen_short_id('CT'::text),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  source text not null default 'web'::text,
  postcode text not null,
  category_id uuid,
  slug text,
  business_name text not null,
  trading_name text,
  abn text,
  licence_number text,
  insured boolean default false,
  insurance_expiry date,
  service_areas text[] default '{}'::text[],
  skills text[] default '{}'::text[],
  bio text,
  website text,
  contact_email text,
  contact_phone text,
  vetting_status text not null default 'pending'::text,
  verified_at timestamp with time zone,
  verified_by text,
  rejected_reason text,
  policy_version_id uuid,
  consent_listing boolean not null default false
);

create table if not exists public.data_export_requests (
  id uuid not null default gen_random_uuid(),
  anonymised_id text not null default gen_short_id('EXP'::text),
  user_id uuid not null,
  requested_at timestamp with time zone not null default now(),
  completed_at timestamp with time zone,
  download_token text,
  expires_at timestamp with time zone,
  delivered_to_email text,
  status text not null default 'pending'::text,
  byte_size integer
);

create table if not exists public.defamation_complaints (
  id uuid not null default gen_random_uuid(),
  anonymised_id text not null default gen_short_id('DEF'::text),
  listing_id uuid,
  listing_title_snapshot text,
  listing_url_snapshot text,
  complainant_name text,
  complainant_email text not null,
  type_of_concern text not null,
  details text not null,
  received_at timestamp with time zone not null default now(),
  action_taken text,
  resolved_at timestamp with time zone,
  notes text,
  notice_type text,
  complainant_phone text,
  complainant_address text,
  statement_at_issue text,
  reputation_harm_narrative text,
  evidence_urls jsonb,
  serious_harm_acknowledged boolean default false,
  owner_response_text text,
  owner_response_deadline timestamp with time zone,
  owner_responded_at timestamp with time zone
);

-- QUARANTINED — foreign app (Ericka quote portal). Do not modify here.
create table if not exists public.ericka_sales_quotes (
  id uuid not null default gen_random_uuid(),
  quote_number text not null,
  sales_rep text not null,
  customer_name text not null,
  customer_email text,
  customer_phone text,
  site_address text,
  notes text,
  quote_data jsonb not null,
  subtotal_inc_gst_cents integer not null default 0,
  freight_inc_gst_cents integer not null default 0,
  gst_included_cents integer not null default 0,
  total_inc_gst_cents integer not null default 0,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.freight_details (
  listing_id uuid not null,
  direction text not null,
  origin_postcode text,
  destination_postcode text,
  vehicle_type text,
  cargo_type text,
  weight_kg integer,
  pickup_from_date date,
  pickup_by_date date,
  budget_bracket text
);

create table if not exists public.help_requests (
  id uuid not null default gen_random_uuid(),
  anonymised_id text not null default gen_short_id('HR'::text),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  source text not null default 'web'::text,
  postcode text not null,
  category_id uuid,
  request_type text not null,
  problem_summary text not null,
  description text not null,
  contractor_name text,
  contractor_abn text,
  dollar_value_bracket text,
  urgency_bracket text,
  timeline_bracket text,
  material_type text,
  contact_name text not null,
  contact_email text,
  contact_phone text,
  contact_preferred_method text,
  contact_best_time text,
  policy_version_id uuid not null,
  consent_store_data boolean not null,
  consent_of_referral boolean not null default false,
  consent_share_with_authorities boolean not null default false,
  consent_research_use boolean not null default false,
  consent_timestamp timestamp with time zone not null default now(),
  consent_ip inet,
  consent_user_agent text,
  status text not null default 'new'::text,
  internal_notes text,
  responded_at timestamp with time zone,
  closed_at timestamp with time zone,
  closed_reason text
);

create table if not exists public.incidents (
  id uuid not null default gen_random_uuid(),
  anonymised_id text not null default gen_short_id('IN'::text),
  created_at timestamp with time zone not null default now(),
  source_kind text not null,
  source_anonymised_id text not null,
  source text not null,
  postcode text not null,
  state text,
  category_id uuid,
  request_type text,
  dollar_value_bracket text,
  urgency_bracket text,
  timeline_bracket text,
  material_type text,
  outcome text
);

create table if not exists public.job_details (
  listing_id uuid not null,
  work_type text,
  pay_type text,
  pay_amount numeric(10,2),
  start_date date,
  duration_text text,
  accommodation_provided boolean not null default false
);

create table if not exists public.jobs (
  id uuid not null default gen_random_uuid(),
  title text not null,
  company text,
  location text,
  pay_rate text,
  description text not null,
  status text not null default 'open'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.listing_edits (
  id uuid not null default gen_random_uuid(),
  listing_id uuid not null,
  edited_by uuid,
  edited_at timestamp with time zone not null default now(),
  before_data jsonb,
  after_data jsonb,
  edit_source text default 'owner'::text
);

create table if not exists public.listing_flags (
  id uuid not null default gen_random_uuid(),
  anonymised_id text not null default gen_short_id('FLG'::text),
  listing_id uuid not null,
  flagged_by uuid not null,
  reason text not null,
  note text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.listings (
  id uuid not null default gen_random_uuid(),
  anonymised_id text not null default gen_short_id('LST'::text),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null default (now() + '30 days'::interval),
  status text not null default 'active'::text,
  kind text not null,
  category_id uuid not null,
  user_id uuid not null,
  slug text not null,
  title text not null,
  description text not null,
  postcode text not null,
  state text,
  contact_email text,
  contact_phone text,
  contact_best_time text,
  flag_count integer not null default 0,
  policy_version_id uuid not null,
  closed_at timestamp with time zone,
  closed_reason text,
  closed_note text,
  under_review boolean default false,
  under_review_reason text,
  under_review_since timestamp with time zone
);

create table if not exists public.moderation_actions (
  id uuid not null default gen_random_uuid(),
  anonymised_id text not null default gen_short_id('MOD'::text),
  actor_user_id uuid,
  listing_id uuid,
  listing_title_snapshot text,
  action text not null,
  reason text,
  before_status text,
  after_status text,
  before_data jsonb,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.policy_versions (
  id uuid not null default gen_random_uuid(),
  version text not null,
  kind text not null,
  effective_from timestamp with time zone not null default now(),
  source_path text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.profiles (
  id uuid not null default gen_random_uuid(),
  user_email text not null,
  handle text,
  company text,
  abn text,
  service_areas text[] default '{}'::text[],
  skills text[] default '{}'::text[],
  rate_type text,
  rate_amount numeric(10,2) default 0,
  licence text,
  insured boolean default false,
  insurance_exp date,
  bio text,
  portfolio text[] default '{}'::text[],
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.regions (
  postcode text not null,
  state text not null,
  lga text,
  region_name text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.reviews_public (
  id uuid not null default gen_random_uuid(),
  anonymised_id text not null default gen_short_id('RV'::text),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  source text not null default 'web'::text,
  postcode text not null,
  category_id uuid,
  contractor_id uuid not null,
  reviewer_name_public text,
  rating integer not null,
  title text,
  body text not null,
  job_value_bracket text,
  moderation_status text not null default 'pending'::text,
  moderated_at timestamp with time zone,
  moderated_by text,
  moderation_notes text,
  reply_sent_at timestamp with time zone,
  reply_received_at timestamp with time zone,
  contractor_response text,
  reviewer_email text not null,
  reviewer_phone text,
  policy_version_id uuid not null,
  consent_publish boolean not null default false
);

create table if not exists public.service_details (
  listing_id uuid not null,
  direction text not null,
  rate_type text,
  rate_amount numeric(10,2),
  travel_willingness text,
  service_postcodes text[] default '{}'::text[]
);

create table if not exists public.user_profiles (
  user_id uuid not null,
  display_name text,
  postcode text,
  email_verified_at timestamp with time zone,
  phone_verified_at timestamp with time zone,
  abn text,
  abn_verified_at timestamp with time zone,
  abn_entity_name text,
  flag_count integer not null default 0,
  is_admin boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  terms_consent_at timestamp with time zone,
  terms_consent_version text,
  marketing_consent_at timestamp with time zone,
  marketing_consent_revoked_at timestamp with time zone,
  dob_confirmed_at timestamp with time zone,
  creation_ip inet,
  creation_user_agent text
);


-- ------------------------------------------------------------
-- 3. Constraints (PK / UNIQUE / CHECK, then FK)
-- ------------------------------------------------------------
alter table public.account_deletions add constraint account_deletions_pkey PRIMARY KEY (id);
alter table public.app_settings add constraint app_settings_pkey PRIMARY KEY (key);
alter table public.auth_events add constraint auth_events_pkey PRIMARY KEY (id);
alter table public.categories add constraint categories_pkey PRIMARY KEY (id);
alter table public.complaints_private add constraint complaints_private_pkey PRIMARY KEY (id);
alter table public.contractors add constraint contractors_pkey PRIMARY KEY (id);
alter table public.data_export_requests add constraint data_export_requests_pkey PRIMARY KEY (id);
alter table public.defamation_complaints add constraint defamation_complaints_pkey PRIMARY KEY (id);
alter table public.ericka_sales_quotes add constraint ericka_sales_quotes_pkey PRIMARY KEY (id);
alter table public.freight_details add constraint freight_details_pkey PRIMARY KEY (listing_id);
alter table public.help_requests add constraint help_requests_pkey PRIMARY KEY (id);
alter table public.incidents add constraint incidents_pkey PRIMARY KEY (id);
alter table public.job_details add constraint job_details_pkey PRIMARY KEY (listing_id);
alter table public.jobs add constraint jobs_pkey PRIMARY KEY (id);
alter table public.listing_edits add constraint listing_edits_pkey PRIMARY KEY (id);
alter table public.listing_flags add constraint listing_flags_pkey PRIMARY KEY (id);
alter table public.listings add constraint listings_pkey PRIMARY KEY (id);
alter table public.moderation_actions add constraint moderation_actions_pkey PRIMARY KEY (id);
alter table public.policy_versions add constraint policy_versions_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.regions add constraint regions_pkey PRIMARY KEY (postcode);
alter table public.reviews_public add constraint reviews_public_pkey PRIMARY KEY (id);
alter table public.service_details add constraint service_details_pkey PRIMARY KEY (listing_id);
alter table public.user_profiles add constraint user_profiles_pkey PRIMARY KEY (user_id);
alter table public.account_deletions add constraint account_deletions_anonymised_id_key UNIQUE (anonymised_id);
alter table public.categories add constraint categories_slug_key UNIQUE (slug);
alter table public.complaints_private add constraint complaints_private_anonymised_id_key UNIQUE (anonymised_id);
alter table public.contractors add constraint contractors_anonymised_id_key UNIQUE (anonymised_id);
alter table public.contractors add constraint contractors_slug_key UNIQUE (slug);
alter table public.data_export_requests add constraint data_export_requests_anonymised_id_key UNIQUE (anonymised_id);
alter table public.defamation_complaints add constraint defamation_complaints_anonymised_id_key UNIQUE (anonymised_id);
alter table public.ericka_sales_quotes add constraint ericka_sales_quotes_quote_number_key UNIQUE (quote_number);
alter table public.help_requests add constraint help_requests_anonymised_id_key UNIQUE (anonymised_id);
alter table public.incidents add constraint incidents_anonymised_id_key UNIQUE (anonymised_id);
alter table public.listing_flags add constraint listing_flags_anonymised_id_key UNIQUE (anonymised_id);
alter table public.listing_flags add constraint listing_flags_listing_id_flagged_by_key UNIQUE (listing_id, flagged_by);
alter table public.listings add constraint listings_anonymised_id_key UNIQUE (anonymised_id);
alter table public.listings add constraint listings_slug_key UNIQUE (slug);
alter table public.moderation_actions add constraint moderation_actions_anonymised_id_key UNIQUE (anonymised_id);
alter table public.policy_versions add constraint policy_versions_version_key UNIQUE (version);
alter table public.profiles add constraint profiles_handle_key UNIQUE (handle);
alter table public.profiles add constraint profiles_user_email_key UNIQUE (user_email);
alter table public.reviews_public add constraint reviews_public_anonymised_id_key UNIQUE (anonymised_id);
alter table public.account_deletions add constraint account_deletions_initiated_by_check CHECK ((initiated_by = ANY (ARRAY['user'::text, 'admin'::text, 'system'::text])));
alter table public.auth_events add constraint auth_events_event_type_check CHECK ((event_type = ANY (ARRAY['magic_link_requested'::text, 'magic_link_used'::text, 'password_signin'::text, 'password_signup'::text, 'password_reset_requested'::text, 'password_reset_completed'::text, 'sign_out'::text, 'failed_signin'::text])));
alter table public.categories add constraint categories_pillar_check CHECK ((pillar = ANY (ARRAY['jobs'::text, 'freight'::text, 'services'::text])));
alter table public.complaints_private add constraint complaints_private_consent_required CHECK ((consent_store_data = true));
alter table public.complaints_private add constraint complaints_private_contact_preferred_method_check CHECK ((contact_preferred_method = ANY (ARRAY['email'::text, 'phone'::text, 'sms'::text])));
alter table public.complaints_private add constraint complaints_private_dollar_value_bracket_check CHECK ((dollar_value_bracket = ANY (ARRAY['under_1k'::text, '1k_5k'::text, '5k_20k'::text, '20k_50k'::text, 'over_50k'::text, 'unknown'::text])));
alter table public.complaints_private add constraint complaints_private_incident_date_bracket_check CHECK ((incident_date_bracket = ANY (ARRAY['past_30d'::text, 'past_12m'::text, '1_to_5y'::text, 'older'::text, 'unknown'::text])));
alter table public.complaints_private add constraint complaints_private_source_check CHECK ((source = ANY (ARRAY['web'::text, 'phone'::text, 'facebook'::text, 'email'::text, 'other'::text])));
alter table public.complaints_private add constraint complaints_private_status_check CHECK ((status = ANY (ARRAY['new'::text, 'acknowledged'::text, 'in_review'::text, 'escalated'::text, 'responded'::text, 'closed'::text, 'deleted'::text])));
alter table public.contractors add constraint contractors_source_check CHECK ((source = ANY (ARRAY['web'::text, 'phone'::text, 'facebook'::text, 'email'::text, 'other'::text])));
alter table public.contractors add constraint contractors_vetting_status_check CHECK ((vetting_status = ANY (ARRAY['pending'::text, 'in_review'::text, 'verified'::text, 'rejected'::text, 'suspended'::text])));
alter table public.data_export_requests add constraint data_export_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'generated'::text, 'delivered'::text, 'expired'::text, 'failed'::text])));
alter table public.defamation_complaints add constraint defamation_complaints_action_taken_check CHECK (((action_taken IS NULL) OR (action_taken = ANY (ARRAY['no_action'::text, 'hidden_pending_review'::text, 'removed_permanently'::text, 'restored'::text, 'referred_to_authorities'::text]))));
alter table public.defamation_complaints add constraint defamation_complaints_notice_type_check CHECK (((notice_type IS NULL) OR (notice_type = ANY (ARRAY['concerns_notice'::text, 'general_concern'::text, 'copyright'::text, 'illegal_content'::text, 'other'::text]))));
alter table public.defamation_complaints add constraint defamation_complaints_type_of_concern_check CHECK ((type_of_concern = ANY (ARRAY['defamation'::text, 'copyright'::text, 'illegal_content'::text, 'privacy_breach'::text, 'other'::text])));
alter table public.freight_details add constraint freight_details_budget_bracket_check CHECK ((budget_bracket = ANY (ARRAY['under_1k'::text, '1k_5k'::text, '5k_20k'::text, '20k_50k'::text, 'over_50k'::text, 'unknown'::text])));
alter table public.freight_details add constraint freight_details_cargo_type_check CHECK ((cargo_type = ANY (ARRAY['livestock'::text, 'grain'::text, 'hay_fodder'::text, 'machinery'::text, 'fuel_water'::text, 'refrigerated'::text, 'general'::text, 'other'::text])));
alter table public.freight_details add constraint freight_details_direction_check CHECK ((direction = ANY (ARRAY['need_freight'::text, 'offering_truck'::text])));
alter table public.freight_details add constraint freight_details_vehicle_type_check CHECK ((vehicle_type = ANY (ARRAY['tipper'::text, 'livestock'::text, 'flatbed'::text, 'b_double'::text, 'refrigerated'::text, 'tray'::text, 'other'::text])));
alter table public.help_requests add constraint help_requests_consent_required CHECK ((consent_store_data = true));
alter table public.help_requests add constraint help_requests_contact_preferred_method_check CHECK ((contact_preferred_method = ANY (ARRAY['email'::text, 'phone'::text, 'sms'::text])));
alter table public.help_requests add constraint help_requests_contact_required CHECK (((contact_email IS NOT NULL) OR (contact_phone IS NOT NULL)));
alter table public.help_requests add constraint help_requests_dollar_value_bracket_check CHECK ((dollar_value_bracket = ANY (ARRAY['under_1k'::text, '1k_5k'::text, '5k_20k'::text, '20k_50k'::text, 'over_50k'::text, 'unknown'::text])));
alter table public.help_requests add constraint help_requests_request_type_check CHECK ((request_type = ANY (ARRAY['ripped_off'::text, 'stuck_mid_project'::text, 'quote_check'::text, 'bad_workmanship'::text, 'contractor_unfinished'::text, 'general_question'::text, 'other'::text])));
alter table public.help_requests add constraint help_requests_source_check CHECK ((source = ANY (ARRAY['web'::text, 'phone'::text, 'facebook'::text, 'email'::text, 'other'::text])));
alter table public.help_requests add constraint help_requests_status_check CHECK ((status = ANY (ARRAY['new'::text, 'acknowledged'::text, 'in_review'::text, 'responded'::text, 'closed'::text, 'deleted'::text])));
alter table public.help_requests add constraint help_requests_timeline_bracket_check CHECK ((timeline_bracket = ANY (ARRAY['now'::text, 'past_30d'::text, 'past_12m'::text, 'older'::text, 'unknown'::text])));
alter table public.help_requests add constraint help_requests_urgency_bracket_check CHECK ((urgency_bracket = ANY (ARRAY['emergency'::text, 'this_week'::text, 'this_month'::text, 'no_rush'::text, 'unknown'::text])));
alter table public.incidents add constraint incidents_outcome_check CHECK ((outcome = ANY (ARRAY['unresolved'::text, 'resolved'::text, 'escalated'::text, 'referred_of'::text, 'referred_fair_trading'::text, 'other'::text])));
alter table public.incidents add constraint incidents_source_kind_check CHECK ((source_kind = ANY (ARRAY['help_request'::text, 'complaint'::text, 'review'::text])));
alter table public.job_details add constraint job_details_pay_type_check CHECK ((pay_type = ANY (ARRAY['hourly'::text, 'daily'::text, 'weekly'::text, 'negotiable'::text, 'not_specified'::text])));
alter table public.job_details add constraint job_details_work_type_check CHECK ((work_type = ANY (ARRAY['full_time'::text, 'casual'::text, 'contract'::text, 'seasonal'::text, 'day_rate'::text])));
alter table public.jobs add constraint jobs_status_check CHECK ((status = ANY (ARRAY['open'::text, 'filled'::text, 'closed'::text])));
alter table public.listing_edits add constraint listing_edits_edit_source_check CHECK ((edit_source = ANY (ARRAY['owner'::text, 'admin'::text, 'system'::text])));
alter table public.listing_flags add constraint listing_flags_reason_check CHECK ((reason = ANY (ARRAY['scam'::text, 'duplicate'::text, 'offensive'::text, 'miscategorised'::text, 'other'::text])));
alter table public.listings add constraint listings_closed_consistency_check CHECK ((((closed_at IS NULL) AND (status <> 'closed'::text)) OR ((closed_at IS NOT NULL) AND (status = 'closed'::text))));
alter table public.listings add constraint listings_closed_reason_check CHECK (((closed_reason IS NULL) OR (closed_reason = ANY (ARRAY['matched'::text, 'no_takers'::text, 'withdrawn'::text, 'other'::text]))));
alter table public.listings add constraint listings_contact_required CHECK (((contact_email IS NOT NULL) OR (contact_phone IS NOT NULL)));
alter table public.listings add constraint listings_kind_check CHECK ((kind = ANY (ARRAY['job'::text, 'freight'::text, 'service_offering'::text, 'service_request'::text])));
alter table public.listings add constraint listings_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'hidden_flagged'::text, 'expired'::text, 'deleted_by_user'::text, 'deleted_by_admin'::text, 'closed'::text])));
alter table public.moderation_actions add constraint moderation_actions_action_check CHECK ((action = ANY (ARRAY['hide'::text, 'restore'::text, 'clear_flags'::text, 'close_admin'::text, 'restore_after_review'::text, 'remove_permanently'::text, 'no_action'::text, 'other'::text])));
alter table public.policy_versions add constraint policy_versions_kind_check CHECK ((kind = ANY (ARRAY['privacy'::text, 'terms'::text, 'combined'::text])));
alter table public.profiles add constraint profiles_rate_type_check CHECK (((rate_type = ANY (ARRAY['hourly'::text, 'day'::text])) OR (rate_type IS NULL)));
alter table public.reviews_public add constraint reviews_public_job_value_bracket_check CHECK ((job_value_bracket = ANY (ARRAY['under_1k'::text, '1k_5k'::text, '5k_20k'::text, '20k_100k'::text, 'over_100k'::text, 'unknown'::text])));
alter table public.reviews_public add constraint reviews_public_moderation_status_check CHECK ((moderation_status = ANY (ARRAY['pending'::text, 'approved'::text, 'published'::text, 'rejected'::text, 'retracted'::text, 'disputed'::text])));
alter table public.reviews_public add constraint reviews_public_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
alter table public.reviews_public add constraint reviews_public_source_check CHECK ((source = ANY (ARRAY['web'::text, 'phone'::text, 'facebook'::text, 'email'::text, 'other'::text])));
alter table public.service_details add constraint service_details_direction_check CHECK ((direction = ANY (ARRAY['offering'::text, 'requesting'::text])));
alter table public.service_details add constraint service_details_rate_type_check CHECK ((rate_type = ANY (ARRAY['hourly'::text, 'daily'::text, 'fixed'::text, 'per_km'::text, 'quote'::text, 'negotiable'::text])));
alter table public.service_details add constraint service_details_travel_willingness_check CHECK ((travel_willingness = ANY (ARRAY['postcode_only'::text, 'within_50km'::text, 'within_200km'::text, 'state_wide'::text, 'national'::text])));
alter table public.app_settings add constraint app_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.auth_events add constraint auth_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.complaints_private add constraint complaints_private_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);
alter table public.complaints_private add constraint complaints_private_policy_version_id_fkey FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id);
alter table public.contractors add constraint contractors_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);
alter table public.contractors add constraint contractors_policy_version_id_fkey FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id);
alter table public.data_export_requests add constraint data_export_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.defamation_complaints add constraint defamation_complaints_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
alter table public.freight_details add constraint freight_details_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
alter table public.help_requests add constraint help_requests_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);
alter table public.help_requests add constraint help_requests_policy_version_id_fkey FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id);
alter table public.incidents add constraint incidents_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);
alter table public.job_details add constraint job_details_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
alter table public.listing_edits add constraint listing_edits_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.listing_edits add constraint listing_edits_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
alter table public.listing_flags add constraint listing_flags_flagged_by_fkey FOREIGN KEY (flagged_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.listing_flags add constraint listing_flags_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
alter table public.listings add constraint listings_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);
alter table public.listings add constraint listings_policy_version_id_fkey FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id);
alter table public.listings add constraint listings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.moderation_actions add constraint moderation_actions_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.moderation_actions add constraint moderation_actions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
alter table public.reviews_public add constraint reviews_public_category_id_fkey FOREIGN KEY (category_id) REFERENCES categories(id);
alter table public.reviews_public add constraint reviews_public_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES contractors(id);
alter table public.reviews_public add constraint reviews_public_policy_version_id_fkey FOREIGN KEY (policy_version_id) REFERENCES policy_versions(id);
alter table public.service_details add constraint service_details_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
alter table public.user_profiles add constraint user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- ------------------------------------------------------------
-- 4. Indexes (non-constraint)
-- ------------------------------------------------------------
CREATE INDEX idx_account_deletions_user ON public.account_deletions USING btree (user_id);
CREATE INDEX idx_auth_events_purge ON public.auth_events USING btree (created_at);
CREATE INDEX idx_auth_events_user_recent ON public.auth_events USING btree (user_id, created_at DESC);
CREATE INDEX idx_categories_pillar_active ON public.categories USING btree (pillar, active, sort_order);
CREATE INDEX idx_complaints_private_category ON public.complaints_private USING btree (category_id);
CREATE INDEX idx_complaints_private_postcode ON public.complaints_private USING btree (postcode);
CREATE INDEX idx_complaints_private_status_created ON public.complaints_private USING btree (status, created_at DESC);
CREATE INDEX idx_contractors_category ON public.contractors USING btree (category_id);
CREATE INDEX idx_contractors_postcode ON public.contractors USING btree (postcode);
CREATE INDEX idx_contractors_vetting ON public.contractors USING btree (vetting_status);
CREATE INDEX idx_data_export_user ON public.data_export_requests USING btree (user_id, requested_at DESC);
CREATE INDEX idx_defamation_complaints_listing ON public.defamation_complaints USING btree (listing_id);
CREATE INDEX idx_defamation_complaints_received ON public.defamation_complaints USING btree (received_at DESC);
CREATE INDEX idx_help_requests_category ON public.help_requests USING btree (category_id);
CREATE INDEX idx_help_requests_postcode ON public.help_requests USING btree (postcode);
CREATE INDEX idx_help_requests_status_created ON public.help_requests USING btree (status, created_at DESC);
CREATE INDEX idx_incidents_created ON public.incidents USING btree (created_at DESC);
CREATE INDEX idx_incidents_postcode_category ON public.incidents USING btree (postcode, category_id, created_at DESC);
CREATE INDEX idx_incidents_state_category ON public.incidents USING btree (state, category_id, created_at DESC);
CREATE INDEX idx_jobs_status_created ON public.jobs USING btree (status, created_at DESC);
CREATE INDEX idx_listing_edits_listing ON public.listing_edits USING btree (listing_id, edited_at DESC);
CREATE INDEX idx_listing_flags_listing ON public.listing_flags USING btree (listing_id, created_at DESC);
CREATE INDEX idx_listings_expires ON public.listings USING btree (status, expires_at);
CREATE INDEX idx_listings_kind_status_category_created ON public.listings USING btree (kind, status, category_id, created_at DESC);
CREATE INDEX idx_listings_kind_status_postcode_created ON public.listings USING btree (kind, status, postcode, created_at DESC);
CREATE INDEX idx_listings_user ON public.listings USING btree (user_id);
CREATE INDEX idx_moderation_actions_actor ON public.moderation_actions USING btree (actor_user_id, created_at DESC);
CREATE INDEX idx_moderation_actions_created ON public.moderation_actions USING btree (created_at DESC);
CREATE INDEX idx_moderation_actions_listing ON public.moderation_actions USING btree (listing_id, created_at DESC);
CREATE INDEX idx_policy_versions_effective ON public.policy_versions USING btree (kind, effective_from DESC);
CREATE INDEX idx_profiles_handle ON public.profiles USING btree (handle);
CREATE INDEX idx_reviews_public_contractor ON public.reviews_public USING btree (contractor_id);
CREATE INDEX idx_reviews_public_moderation ON public.reviews_public USING btree (moderation_status);
CREATE INDEX idx_user_profiles_creation_ip ON public.user_profiles USING btree (creation_ip, created_at DESC) WHERE (creation_ip IS NOT NULL);
CREATE INDEX idx_user_profiles_marketing_consent ON public.user_profiles USING btree (marketing_consent_at) WHERE ((marketing_consent_at IS NOT NULL) AND (marketing_consent_revoked_at IS NULL));


-- ------------------------------------------------------------
-- 5. Triggers (public)
-- ------------------------------------------------------------
CREATE TRIGGER trg_complaints_private_updated_at BEFORE UPDATE ON public.complaints_private FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_incidents_cleanup_complaint AFTER DELETE ON public.complaints_private FOR EACH ROW EXECUTE FUNCTION incidents_cleanup_on_source_delete();
CREATE TRIGGER trg_incidents_from_complaint AFTER INSERT ON public.complaints_private FOR EACH ROW EXECUTE FUNCTION incidents_from_complaint();
CREATE TRIGGER trg_contractors_updated_at BEFORE UPDATE ON public.contractors FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_help_requests_updated_at BEFORE UPDATE ON public.help_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_incidents_cleanup_help_request AFTER DELETE ON public.help_requests FOR EACH ROW EXECUTE FUNCTION incidents_cleanup_on_source_delete();
CREATE TRIGGER trg_incidents_from_help_request AFTER INSERT ON public.help_requests FOR EACH ROW EXECUTE FUNCTION incidents_from_help_request();
CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bump_flag_count AFTER INSERT ON public.listing_flags FOR EACH ROW EXECUTE FUNCTION bump_listing_flag_count();
CREATE TRIGGER trg_derive_listing_state BEFORE INSERT OR UPDATE OF postcode ON public.listings FOR EACH ROW EXECUTE FUNCTION derive_listing_state();
CREATE TRIGGER trg_listings_updated_at BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_reviews_public_updated_at BEFORE UPDATE ON public.reviews_public FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ------------------------------------------------------------
-- 6. Trigger on auth.users (requires elevated privileges to (re)create)
--    Auto-creates a user_profiles row when a new auth user is inserted.
-- ------------------------------------------------------------
CREATE TRIGGER trg_on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ------------------------------------------------------------
-- 7. Views (+ reloptions)
-- ------------------------------------------------------------
create view public.admin_duplicate_accounts_by_ip as  SELECT creation_ip,
    count(*) AS account_count,
    min(created_at) AS earliest_created,
    max(created_at) AS latest_created,
    array_agg(user_id) AS user_ids
   FROM user_profiles
  WHERE ((creation_ip IS NOT NULL) AND (created_at > (now() - '30 days'::interval)))
  GROUP BY creation_ip
 HAVING (count(*) >= 3)
  ORDER BY (count(*)) DESC, (max(created_at)) DESC;

create view public.incidents_by_postcode_category with (security_invoker=true) as  SELECT postcode,
    category_id,
    (count(*))::integer AS n,
    min(created_at) AS first_seen,
    max(created_at) AS last_seen
   FROM incidents
  GROUP BY postcode, category_id
 HAVING (count(*) >= 5);

create view public.incidents_by_state_category with (security_invoker=true) as  SELECT state,
    category_id,
    (count(*))::integer AS n,
    min(created_at) AS first_seen,
    max(created_at) AS last_seen
   FROM incidents
  WHERE (state IS NOT NULL)
  GROUP BY state, category_id
 HAVING (count(*) >= 5);

create view public.user_profiles_public with (security_invoker=false) as  SELECT user_id,
    display_name
   FROM user_profiles;


-- ------------------------------------------------------------
-- 8. View grants (Supabase default auto-grants to api roles)
-- ------------------------------------------------------------
grant DELETE on public.admin_duplicate_accounts_by_ip to anon;
grant INSERT on public.admin_duplicate_accounts_by_ip to anon;
grant REFERENCES on public.admin_duplicate_accounts_by_ip to anon;
grant SELECT on public.admin_duplicate_accounts_by_ip to anon;
grant TRIGGER on public.admin_duplicate_accounts_by_ip to anon;
grant TRUNCATE on public.admin_duplicate_accounts_by_ip to anon;
grant UPDATE on public.admin_duplicate_accounts_by_ip to anon;
grant DELETE on public.admin_duplicate_accounts_by_ip to authenticated;
grant INSERT on public.admin_duplicate_accounts_by_ip to authenticated;
grant REFERENCES on public.admin_duplicate_accounts_by_ip to authenticated;
grant SELECT on public.admin_duplicate_accounts_by_ip to authenticated;
grant TRIGGER on public.admin_duplicate_accounts_by_ip to authenticated;
grant TRUNCATE on public.admin_duplicate_accounts_by_ip to authenticated;
grant UPDATE on public.admin_duplicate_accounts_by_ip to authenticated;
grant DELETE on public.admin_duplicate_accounts_by_ip to service_role;
grant INSERT on public.admin_duplicate_accounts_by_ip to service_role;
grant REFERENCES on public.admin_duplicate_accounts_by_ip to service_role;
grant SELECT on public.admin_duplicate_accounts_by_ip to service_role;
grant TRIGGER on public.admin_duplicate_accounts_by_ip to service_role;
grant TRUNCATE on public.admin_duplicate_accounts_by_ip to service_role;
grant UPDATE on public.admin_duplicate_accounts_by_ip to service_role;
grant DELETE on public.incidents_by_postcode_category to anon;
grant INSERT on public.incidents_by_postcode_category to anon;
grant REFERENCES on public.incidents_by_postcode_category to anon;
grant SELECT on public.incidents_by_postcode_category to anon;
grant TRIGGER on public.incidents_by_postcode_category to anon;
grant TRUNCATE on public.incidents_by_postcode_category to anon;
grant UPDATE on public.incidents_by_postcode_category to anon;
grant DELETE on public.incidents_by_postcode_category to authenticated;
grant INSERT on public.incidents_by_postcode_category to authenticated;
grant REFERENCES on public.incidents_by_postcode_category to authenticated;
grant SELECT on public.incidents_by_postcode_category to authenticated;
grant TRIGGER on public.incidents_by_postcode_category to authenticated;
grant TRUNCATE on public.incidents_by_postcode_category to authenticated;
grant UPDATE on public.incidents_by_postcode_category to authenticated;
grant DELETE on public.incidents_by_postcode_category to service_role;
grant INSERT on public.incidents_by_postcode_category to service_role;
grant REFERENCES on public.incidents_by_postcode_category to service_role;
grant SELECT on public.incidents_by_postcode_category to service_role;
grant TRIGGER on public.incidents_by_postcode_category to service_role;
grant TRUNCATE on public.incidents_by_postcode_category to service_role;
grant UPDATE on public.incidents_by_postcode_category to service_role;
grant DELETE on public.incidents_by_state_category to anon;
grant INSERT on public.incidents_by_state_category to anon;
grant REFERENCES on public.incidents_by_state_category to anon;
grant SELECT on public.incidents_by_state_category to anon;
grant TRIGGER on public.incidents_by_state_category to anon;
grant TRUNCATE on public.incidents_by_state_category to anon;
grant UPDATE on public.incidents_by_state_category to anon;
grant DELETE on public.incidents_by_state_category to authenticated;
grant INSERT on public.incidents_by_state_category to authenticated;
grant REFERENCES on public.incidents_by_state_category to authenticated;
grant SELECT on public.incidents_by_state_category to authenticated;
grant TRIGGER on public.incidents_by_state_category to authenticated;
grant TRUNCATE on public.incidents_by_state_category to authenticated;
grant UPDATE on public.incidents_by_state_category to authenticated;
grant DELETE on public.incidents_by_state_category to service_role;
grant INSERT on public.incidents_by_state_category to service_role;
grant REFERENCES on public.incidents_by_state_category to service_role;
grant SELECT on public.incidents_by_state_category to service_role;
grant TRIGGER on public.incidents_by_state_category to service_role;
grant TRUNCATE on public.incidents_by_state_category to service_role;
grant UPDATE on public.incidents_by_state_category to service_role;
grant DELETE on public.user_profiles_public to anon;
grant INSERT on public.user_profiles_public to anon;
grant REFERENCES on public.user_profiles_public to anon;
grant SELECT on public.user_profiles_public to anon;
grant TRIGGER on public.user_profiles_public to anon;
grant TRUNCATE on public.user_profiles_public to anon;
grant UPDATE on public.user_profiles_public to anon;
grant DELETE on public.user_profiles_public to authenticated;
grant INSERT on public.user_profiles_public to authenticated;
grant REFERENCES on public.user_profiles_public to authenticated;
grant SELECT on public.user_profiles_public to authenticated;
grant TRIGGER on public.user_profiles_public to authenticated;
grant TRUNCATE on public.user_profiles_public to authenticated;
grant UPDATE on public.user_profiles_public to authenticated;
grant DELETE on public.user_profiles_public to service_role;
grant INSERT on public.user_profiles_public to service_role;
grant REFERENCES on public.user_profiles_public to service_role;
grant SELECT on public.user_profiles_public to service_role;
grant TRIGGER on public.user_profiles_public to service_role;
grant TRUNCATE on public.user_profiles_public to service_role;
grant UPDATE on public.user_profiles_public to service_role;


-- ------------------------------------------------------------
-- 9. Row Level Security — enable
-- ------------------------------------------------------------
alter table public.account_deletions enable row level security;
alter table public.app_settings enable row level security;
alter table public.auth_events enable row level security;
alter table public.categories enable row level security;
alter table public.complaints_private enable row level security;
alter table public.contractors enable row level security;
alter table public.data_export_requests enable row level security;
alter table public.defamation_complaints enable row level security;
alter table public.ericka_sales_quotes enable row level security;
alter table public.freight_details enable row level security;
alter table public.help_requests enable row level security;
alter table public.incidents enable row level security;
alter table public.job_details enable row level security;
alter table public.jobs enable row level security;
alter table public.listing_edits enable row level security;
alter table public.listing_flags enable row level security;
alter table public.listings enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.policy_versions enable row level security;
alter table public.profiles enable row level security;
alter table public.regions enable row level security;
alter table public.reviews_public enable row level security;
alter table public.service_details enable row level security;
alter table public.user_profiles enable row level security;
-- NOTE: account_deletions, ericka_sales_quotes, and listing_edits have RLS
-- enabled but NO policies → service-role-only access (advisor INFO 0008).
-- For account_deletions / listing_edits this is by design (internal audit).


-- ------------------------------------------------------------
-- 10. Row Level Security — policies
-- ------------------------------------------------------------
create policy anyone_read_app_settings on public.app_settings as PERMISSIVE for SELECT to public using (true);
create policy users_select_own_auth_events on public.auth_events as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy "Anyone can read active categories" on public.categories as PERMISSIVE for SELECT to public using ((active = true));
create policy "Service role manages categories" on public.categories as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Service role manages complaints_private" on public.complaints_private as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Anyone can read verified contractors" on public.contractors as PERMISSIVE for SELECT to public using ((vetting_status = 'verified'::text));
create policy "Service role manages contractors" on public.contractors as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy users_select_own_exports on public.data_export_requests as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy "Admins read defamation_complaints" on public.defamation_complaints as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.is_admin = true)))));
create policy "Anyone submits defamation_complaints" on public.defamation_complaints as PERMISSIVE for INSERT to public with check (true);
create policy "Service role manages defamation_complaints" on public.defamation_complaints as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Anyone reads freight_details for readable listings" on public.freight_details as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = freight_details.listing_id) AND (((l.status = 'active'::text) AND (l.expires_at > now())) OR (l.user_id = auth.uid()))))));
create policy "Owners insert own freight_details" on public.freight_details as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = freight_details.listing_id) AND (l.user_id = auth.uid())))));
create policy "Owners update own freight_details" on public.freight_details as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = freight_details.listing_id) AND (l.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = freight_details.listing_id) AND (l.user_id = auth.uid())))));
create policy "Service role manages freight_details" on public.freight_details as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Service role manages help_requests" on public.help_requests as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Service role manages incidents" on public.incidents as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Anyone reads job_details for readable listings" on public.job_details as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = job_details.listing_id) AND (((l.status = 'active'::text) AND (l.expires_at > now())) OR (l.user_id = auth.uid()))))));
create policy "Owners insert own job_details" on public.job_details as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = job_details.listing_id) AND (l.user_id = auth.uid())))));
create policy "Owners update own job_details" on public.job_details as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = job_details.listing_id) AND (l.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = job_details.listing_id) AND (l.user_id = auth.uid())))));
create policy "Service role manages job_details" on public.job_details as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Anyone can read open jobs" on public.jobs as PERMISSIVE for SELECT to public using ((status = 'open'::text));
create policy "Authenticated users can insert jobs" on public.jobs as PERMISSIVE for INSERT to authenticated with check (true);
create policy "Admins read all flags" on public.listing_flags as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.is_admin = true)))));
create policy "Authenticated users insert flags" on public.listing_flags as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = flagged_by));
create policy "Owners read flags against own listings" on public.listing_flags as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = listing_flags.listing_id) AND (l.user_id = auth.uid())))));
create policy "Service role manages flags" on public.listing_flags as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Anyone reads active unexpired listings" on public.listings as PERMISSIVE for SELECT to public using (((status = 'active'::text) AND (expires_at > now())));
create policy "Authenticated insert own listings" on public.listings as PERMISSIVE for INSERT to authenticated with check ((auth.uid() = user_id));
create policy "Owners delete own listings" on public.listings as PERMISSIVE for DELETE to authenticated using ((auth.uid() = user_id));
create policy "Owners read own listings" on public.listings as PERMISSIVE for SELECT to authenticated using ((auth.uid() = user_id));
create policy "Owners update own listings" on public.listings as PERMISSIVE for UPDATE to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Service role manages listings" on public.listings as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Admins read moderation_actions" on public.moderation_actions as PERMISSIVE for SELECT to authenticated using ((EXISTS ( SELECT 1
   FROM user_profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.is_admin = true)))));
create policy "Service role manages moderation_actions" on public.moderation_actions as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Anyone can read policy versions" on public.policy_versions as PERMISSIVE for SELECT to public using (true);
create policy "Service role manages policy versions" on public.policy_versions as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Anyone can read profiles" on public.profiles as PERMISSIVE for SELECT to public using (true);
create policy "Service role can manage profiles" on public.profiles as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Anyone can read regions" on public.regions as PERMISSIVE for SELECT to public using (true);
create policy "Service role manages regions" on public.regions as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Anyone can read published reviews" on public.reviews_public as PERMISSIVE for SELECT to public using ((moderation_status = 'published'::text));
create policy "Service role manages reviews_public" on public.reviews_public as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Anyone reads service_details for readable listings" on public.service_details as PERMISSIVE for SELECT to public using ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = service_details.listing_id) AND (((l.status = 'active'::text) AND (l.expires_at > now())) OR (l.user_id = auth.uid()))))));
create policy "Owners insert own service_details" on public.service_details as PERMISSIVE for INSERT to authenticated with check ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = service_details.listing_id) AND (l.user_id = auth.uid())))));
create policy "Owners update own service_details" on public.service_details as PERMISSIVE for UPDATE to authenticated using ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = service_details.listing_id) AND (l.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = service_details.listing_id) AND (l.user_id = auth.uid())))));
create policy "Service role manages service_details" on public.service_details as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Service role manages profiles" on public.user_profiles as PERMISSIVE for ALL to service_role using (true) with check (true);
create policy "Users read own profile" on public.user_profiles as PERMISSIVE for SELECT to public using ((auth.uid() = user_id));
create policy "Users update own profile" on public.user_profiles as PERMISSIVE for UPDATE to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

-- ============================================================
-- End of baseline snapshot.
-- ============================================================
