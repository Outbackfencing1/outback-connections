-- ============================================================
-- Migration: business_source_key_and_ingest_fn  (Phase 1 ingestion 1A)
-- ============================================================
-- Project : csisezoohgfrpjrhkmls
-- Date    : 2026-06-08
-- Type    : ADDITIVE — 2 columns + 1 unique index on businesses; 1 function.
-- Depends : M1 (businesses), M2 (listings spine), M3 (listing_sources),
--           M5 (categories.country_code).
--
-- Purpose : The scraped employer/carrier DIRECTORY write-path. One function,
--           ingest_scraped_business(), is the single canonical entry point:
--             business (upsert, deduped on place_id) -> listing (one directory
--             entry) -> detail row (so the !inner browse join shows it) ->
--             listing_sources (raw_payload archive). All idempotent.
--
-- HONESTY / PRIVACY (operating rule #5 + contact-gating):
--   * Every listing is data_source='scraped', claim_status stays 'unclaimed',
--     source_platform + source_url set (satisfies listings_scraped_needs_source).
--   * Scraped phone/email are NOT written to businesses.contact_* or
--     listings.contact_* (those tables are publicly readable -> harvest vector).
--     They live only in listing_sources.raw_payload (admin/service-role only).
--     The public "how to reach them" path is the source_url, shown with a
--     "claim it" prompt in the UI.
--
-- Access: function granted to service_role only (the scrape/ingest scripts run
--   as service_role). No anon/authenticated execute.
-- ============================================================

-- ---------- 1. businesses: source dedupe key (place_id) ----------
alter table public.businesses
  add column if not exists source_platform    text,
  add column if not exists source_external_id text;

create unique index if not exists uq_businesses_source_external
  on public.businesses (source_platform, source_external_id)
  where source_external_id is not null;


-- ---------- 2. ingest_scraped_business() ----------
create or replace function public.ingest_scraped_business(
  p_vertical            text,        -- 'job' | 'freight'
  p_source_platform     text,        -- e.g. 'google_maps'
  p_source_external_id  text,        -- place_id (dedupe key)
  p_source_url          text,        -- source/listing URL (REQUIRED for scraped)
  p_name                text,        -- business name
  p_category_slug       text,        -- vertical-scoped category slug; falls back to *-other
  p_postcode            text,
  p_suburb              text,
  p_state               text,
  p_website             text,
  p_geo_lat             numeric,
  p_geo_lng             numeric,
  p_raw_payload         jsonb,       -- full source record (incl. phone/email — kept private here)
  p_expiry_days         int default 45
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $fn$
declare
  v_country  text := 'AU';
  v_pillar   text := case when p_vertical = 'job' then 'jobs' else 'freight' end;
  v_kind     text := p_vertical;                 -- 'job' | 'freight'
  v_side     text := case when p_vertical = 'job' then 'demand' else 'supply' end;
  v_now      timestamptz := now();
  v_category_id uuid;
  v_business_id uuid;
  v_canonical   uuid;
  v_listing_id  uuid;
  v_source_id   uuid;
  v_biz_action  text;
  v_lst_action  text;
begin
  -- validation -------------------------------------------------
  if p_vertical not in ('job','freight') then
    raise exception 'ingest: vertical must be job or freight, got %', p_vertical;
  end if;
  if p_source_platform is null or p_source_url is null or p_source_external_id is null then
    raise exception 'ingest: source_platform, source_url, source_external_id are required for scraped rows';
  end if;
  if p_name is null or p_postcode is null then
    raise exception 'ingest: name and postcode are required';
  end if;

  -- resolve category (vertical-scoped, AU); fall back to the vertical's "other"
  select id into v_category_id from public.categories
   where country_code = v_country and pillar = v_pillar and slug = p_category_slug and active = true
   limit 1;
  if v_category_id is null then
    select id into v_category_id from public.categories
     where country_code = v_country and pillar = v_pillar
       and slug = (case when p_vertical = 'job' then 'jobs-other' else 'freight-other' end)
     limit 1;
  end if;
  if v_category_id is null then
    raise exception 'ingest: no category for vertical % (looked up % and *-other)', p_vertical, p_category_slug;
  end if;

  -- 1) upsert business, deduped on (source_platform, source_external_id) ------
  select id, coalesce(canonical_business_id, id)
    into v_business_id, v_canonical
    from public.businesses
   where source_platform = p_source_platform
     and source_external_id = p_source_external_id
   limit 1;

  if v_business_id is null then
    insert into public.businesses (
      country_code, legal_name, trading_name, postcode, state_code,
      geo_lat, geo_lng, website_url,
      data_source, source_url, source_platform, source_external_id,
      status, claim_status, last_verified_at
      -- NB: contact_email / contact_phone intentionally NOT set (kept private)
    ) values (
      v_country, p_name, p_name, p_postcode, p_state,
      p_geo_lat, p_geo_lng, p_website,
      'scraped', p_source_url, p_source_platform, p_source_external_id,
      'active', 'unclaimed', v_now
    )
    returning id into v_business_id;
    v_canonical  := v_business_id;
    v_biz_action := 'created';
  else
    -- update DESCRIPTIVE fields only. Never touch claim_status / claimed_by /
    -- trust_score / confidence_score / data_source / status (a re-scrape must
    -- never un-claim or downgrade a business).
    update public.businesses set
      trading_name     = coalesce(trading_name, p_name),
      postcode         = coalesce(p_postcode, postcode),
      state_code       = coalesce(p_state, state_code),
      geo_lat          = coalesce(p_geo_lat, geo_lat),
      geo_lng          = coalesce(p_geo_lng, geo_lng),
      website_url      = coalesce(website_url, p_website),
      source_url       = coalesce(p_source_url, source_url),
      last_verified_at = v_now
    where id = v_business_id;
    v_biz_action := 'updated';
  end if;

  -- 2) upsert the directory listing, deduped on (source_platform, source_external_id)
  select id into v_listing_id from public.listings
   where source_platform = p_source_platform
     and source_external_id = p_source_external_id
   limit 1;

  if v_listing_id is null then
    insert into public.listings (
      kind, vertical, side, category_id, user_id, business_id, country_code,
      title, description, postcode, state,
      contact_email, contact_phone,
      data_source, source_platform, source_url, source_external_id,
      scraped_at, expires_at, freshness_status, status, policy_version_id,
      metadata, slug
    ) values (
      v_kind, p_vertical, v_side, v_category_id, null, v_canonical, v_country,
      p_name,
      format(
        '%s is a %s we found listed on %s%s. This is an UNCLAIMED directory listing — it was not posted by the business. Is this your business? Claim it to manage the details and add a real job ad.',
        p_name,
        case when p_vertical = 'job' then 'rural employer' else 'rural transport operator' end,
        p_source_platform,
        case when coalesce(p_suburb,'') <> '' then ' in '||p_suburb||coalesce(', '||p_state,'') else coalesce(' in '||p_state,'') end
      ),
      p_postcode, p_state,
      null, null,
      'scraped', p_source_platform, p_source_url, p_source_external_id,
      v_now, v_now + make_interval(days => p_expiry_days), 'fresh', 'active', null,
      jsonb_build_object('directory_entry', true, 'suburb', p_suburb, 'scraped_name', p_name),
      'pending-' || gen_random_uuid()::text
    )
    returning id into v_listing_id;

    -- finalise slug: kebab(name)-postcode-<anonymised_id> (mirrors lib/posting buildSlug)
    update public.listings
       set slug = left(regexp_replace(regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'),
                                      '(^-+|-+$)', '', 'g'), 60)
                  || '-' || p_postcode || '-' || anonymised_id
     where id = v_listing_id;

    v_lst_action := 'created';
  else
    update public.listings set
      title            = p_name,
      postcode         = coalesce(p_postcode, postcode),
      state            = coalesce(p_state, state),
      business_id      = v_canonical,
      source_url       = coalesce(p_source_url, source_url),
      scraped_at       = v_now,
      expires_at       = v_now + make_interval(days => p_expiry_days),
      freshness_status = 'fresh',
      -- refresh to active unless moderation/owner has changed it
      status           = case when status in ('hidden_flagged','deleted_by_admin','deleted_by_user','closed')
                              then status else 'active' end
    where id = v_listing_id;
    v_lst_action := 'updated';
  end if;

  -- 3) detail row so the browse !inner join surfaces it
  if p_vertical = 'job' then
    insert into public.job_details (listing_id) values (v_listing_id)
      on conflict (listing_id) do nothing;
  else
    insert into public.freight_details (listing_id, direction)
      values (v_listing_id, 'offering_truck')
      on conflict (listing_id) do update set direction = excluded.direction;
  end if;

  -- 4) upsert listing_sources (raw_payload archive; private)
  insert into public.listing_sources (
    listing_id, source_platform, source_url, source_external_id, raw_payload,
    first_seen_at, last_seen_at, active
  ) values (
    v_listing_id, p_source_platform, p_source_url, p_source_external_id, p_raw_payload,
    v_now, v_now, true
  )
  on conflict (source_platform, source_external_id) where source_external_id is not null
  do update set
    listing_id  = excluded.listing_id,
    source_url  = excluded.source_url,
    raw_payload = excluded.raw_payload,
    last_seen_at = v_now,
    active      = true
  returning id into v_source_id;

  return jsonb_build_object(
    'business_id', v_business_id,
    'canonical_business_id', v_canonical,
    'listing_id', v_listing_id,
    'listing_source_id', v_source_id,
    'business_action', v_biz_action,
    'listing_action', v_lst_action
  );
end;
$fn$;

-- Lock execution to service_role (the ingest scripts). No anon/authenticated.
revoke all on function public.ingest_scraped_business(
  text, text, text, text, text, text, text, text, text, text, numeric, numeric, jsonb, int
) from public;
grant execute on function public.ingest_scraped_business(
  text, text, text, text, text, text, text, text, text, text, numeric, numeric, jsonb, int
) to service_role;

-- ============================================================
-- ROLLBACK (manual):
--   drop function if exists public.ingest_scraped_business(
--     text, text, text, text, text, text, text, text, text, text, numeric, numeric, jsonb, int);
--   drop index if exists uq_businesses_source_external;
--   alter table public.businesses
--     drop column if exists source_external_id,
--     drop column if exists source_platform;
-- ============================================================
