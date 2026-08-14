-- Keep public marketplace rows browseable without exposing direct contact data.
--
-- RLS decides which rows are visible; it cannot hide individual columns. The
-- original public SELECT policies therefore made contact fields readable to an
-- anon PostgREST client even though the UI only reveals them after sign-in.
-- PostgreSQL privileges are additive, so first remove any table-level (and any
-- historic column-level) SELECT grant before granting back the public columns.

-- Current marketplace listings. Keep every non-contact column available so
-- existing browse, detail, sitemap, count, filter and relationship queries keep
-- working under the anon role.
revoke select on table public.listings from public, anon;
revoke select (contact_email, contact_phone, contact_best_time)
  on table public.listings from public, anon;
grant select (
  id, anonymised_id, created_at, updated_at, expires_at, status, kind,
  category_id, user_id, slug, title, description, postcode, state, flag_count,
  policy_version_id, closed_at, closed_reason, closed_note, under_review,
  under_review_reason, under_review_since, country_code, business_id, vertical,
  side, data_source, source_platform, source_url, source_external_id,
  scraped_at, imported_at, freshness_status, duplicate_group_id,
  canonical_listing_id, metadata
) on table public.listings to anon;
grant select on table public.listings to authenticated, service_role;

-- Business profiles are joined into all three public browse/detail surfaces.
revoke select on table public.businesses from public, anon;
revoke select (contact_email, contact_phone)
  on table public.businesses from public, anon;
grant select (
  id, anonymised_id, created_at, updated_at, country_code, legal_name,
  trading_name, slug, abn, abr_status, gst_registered, entity_type, state_code,
  postcode, geo_lat, geo_lng, website_url, facebook_url, data_source, source_url,
  status, canonical_business_id, claim_status, claimed_by, claimed_at,
  confidence_score, trust_score, last_verified_at, source_platform,
  source_external_id
) on table public.businesses to anon;
grant select on table public.businesses to authenticated, service_role;

-- The baseline also has three legacy public-readable tables carrying direct
-- contact fields. They are not used by current routes, but leaving them open
-- would preserve equivalent anonymous API leaks.
revoke select on table public.contractors from public, anon;
revoke select (contact_email, contact_phone)
  on table public.contractors from public, anon;
grant select (
  id, anonymised_id, created_at, updated_at, source, postcode, category_id,
  slug, business_name, trading_name, abn, licence_number, insured,
  insurance_expiry, service_areas, skills, bio, website, vetting_status,
  verified_at, verified_by, rejected_reason, policy_version_id, consent_listing
) on table public.contractors to anon;
grant select on table public.contractors to authenticated, service_role;

revoke select on table public.profiles from public, anon;
revoke select (user_email) on table public.profiles from public, anon;
grant select (
  id, handle, company, abn, service_areas, skills, rate_type, rate_amount,
  licence, insured, insurance_exp, bio, portfolio, created_at, updated_at
) on table public.profiles to anon;
grant select on table public.profiles to authenticated, service_role;

revoke select on table public.reviews_public from public, anon;
revoke select (reviewer_email, reviewer_phone)
  on table public.reviews_public from public, anon;
grant select (
  id, anonymised_id, created_at, updated_at, source, postcode, category_id,
  contractor_id, reviewer_name_public, rating, title, body, job_value_bracket,
  moderation_status, moderated_at, moderated_by, moderation_notes,
  reply_sent_at, reply_received_at, contractor_response, policy_version_id,
  consent_publish
) on table public.reviews_public to anon;
grant select on table public.reviews_public to authenticated, service_role;

-- raw_payload can contain third-party PII. Keep the source archive entirely
-- outside anon access. Authenticated SELECT remains subject to its admin-only
-- RLS policy; service_role is used by ingestion.
revoke all privileges on table public.listing_sources from public, anon;
grant select on table public.listing_sources to authenticated;
grant all privileges on table public.listing_sources to service_role;

-- Pick up changed column privileges without waiting for PostgREST's cache TTL.
notify pgrst, 'reload schema';
