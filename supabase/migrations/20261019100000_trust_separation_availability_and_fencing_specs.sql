-- 20261019100000_trust_separation_availability_and_fencing_specs.sql
-- Staged migration for Outback Connections Trust, Believable Availability,
-- Practical Contractor Profiles, and Neighbour Vouch vs Completed-Work Review separation.
--
-- What this migration adds (idempotent):
--   1. Availability freshness & booking window columns (`availability_note`, `availability_updated_at`)
--      on `public.user_profiles` and `public.businesses`.
--   2. Practical contractor profile columns (`travel_area`, `equipment_summary`, `preferred_job_size`)
--      on `public.user_profiles` and `public.businesses`.
--   3. Insurance verification & expiry tracking (`insurance_verified_at`, `insurance_expiry_date`)
--      on `public.user_profiles` and `public.businesses` so self-declared insurance is separated
--      from staff-sighted insurance certificates.
--   4. Updates `public.get_vendor_trust_summary(p_user_id, p_business_id, p_listing_id)` so:
--      - Quick neighbour vouches (`deal_type = 'general'` or short/empty comment) are counted
--        separately in `vouch_count` and do NOT inflate `avg_rating`, `recommend_pct`, or `review_count`
--        (aligned with ACCC online review guidance).
--      - Specific verification dates (`claimed_at`, `abn_verified_at`, `insurance_verified_at`,
--        `insurance_expiry_date`) and contractor capability fields are returned.
--      - `claim_status` reports `'claimed'` whenever an actual owner (`claimed_by` / `v_user_id`)
--        controls the listing, rather than conflating `abn_verified` with unclaimed ABR lookups.

-- 1. Extend user_profiles with availability freshness, contractor profile, and insurance verification columns
alter table public.user_profiles
  add column if not exists availability_note text,
  add column if not exists availability_updated_at timestamptz,
  add column if not exists travel_area text,
  add column if not exists equipment_summary text[] not null default '{}'::text[],
  add column if not exists preferred_job_size text,
  add column if not exists insurance_verified_at timestamptz,
  add column if not exists insurance_expiry_date date;

-- 2. Extend businesses with availability freshness, contractor profile, and insurance verification columns
alter table public.businesses
  add column if not exists availability_note text,
  add column if not exists availability_updated_at timestamptz,
  add column if not exists travel_area text,
  add column if not exists equipment_summary text[] not null default '{}'::text[],
  add column if not exists preferred_job_size text,
  add column if not exists insurance_verified_at timestamptz,
  add column if not exists insurance_expiry_date date;

-- Backfill availability_updated_at for already-claimed businesses where null
update public.businesses
   set availability_updated_at = coalesce(claimed_at, last_verified_at, updated_at)
 where availability_updated_at is null
   and claimed_by is not null;

-- 3. Upgrade get_vendor_trust_summary to separate completed-work reviews from neighbour vouches
--    and surface specific verification dates + practical contractor profile fields.
create or replace function public.get_vendor_trust_summary(
  p_user_id     uuid default null,
  p_business_id uuid default null,
  p_listing_id  uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid := p_user_id;
  v_business_id uuid := p_business_id;
  v_profile record;
  v_business record;
  v_active_listings int := 0;
  v_completed_deals int := 0;
  v_review_count int := 0;
  v_vouch_count int := 0;
  v_avg_rating numeric(3,2) := null;
  v_recommend_pct int := null;
  v_top_tags jsonb := '[]'::jsonb;
  v_recent_reviews jsonb := '[]'::jsonb;
  v_enq_forwarded int := 0;
  v_enq_answered int := 0;
  v_enq_responded int := 0;
begin
  if p_listing_id is not null and (v_user_id is null and v_business_id is null) then
    select l.user_id, l.business_id
      into v_user_id, v_business_id
      from public.listings l
     where l.id = p_listing_id;
  end if;

  if v_business_id is not null and v_user_id is null then
    select b.claimed_by into v_user_id
      from public.businesses b
     where b.id = v_business_id;
  end if;

  if v_user_id is not null and v_business_id is null then
    select b.id into v_business_id
      from public.businesses b
     where b.claimed_by = v_user_id
       and b.status = 'active'
     order by b.claimed_at desc nulls last
     limit 1;
  end if;

  if v_user_id is not null then
    select
      p.user_id,
      p.display_name,
      p.trading_name,
      p.bio,
      p.suburb,
      p.postcode,
      p.abn,
      p.abn_entity_name,
      p.abn_verified_at,
      p.email_verified_at,
      p.phone_verified_at,
      p.contact_phone,
      p.contact_email,
      p.website_url,
      p.services_offered,
      p.photo_urls,
      p.insurances_held,
      p.insurance_verified_at,
      p.insurance_expiry_date,
      p.role_tags,
      p.years_in_district,
      p.availability_status,
      p.availability_note,
      p.availability_updated_at,
      p.travel_area,
      p.equipment_summary,
      p.preferred_job_size,
      p.outback_verified,
      p.created_at
    into v_profile
    from public.user_profiles p
    where p.user_id = v_user_id;
  end if;

  if v_business_id is not null then
    select
      b.id,
      b.legal_name,
      b.trading_name,
      b.abn,
      b.abr_status,
      b.gst_registered,
      b.state_code,
      b.postcode,
      b.suburb,
      b.bio,
      b.contact_phone,
      b.contact_email,
      b.website_url,
      b.facebook_url,
      b.source_url,
      b.source_platform,
      b.role_tags,
      b.services_offered,
      b.photo_urls,
      b.insurances_held,
      b.insurance_verified_at,
      b.insurance_expiry_date,
      b.years_in_district,
      b.availability_status,
      b.availability_note,
      b.availability_updated_at,
      b.travel_area,
      b.equipment_summary,
      b.preferred_job_size,
      b.claim_status,
      b.claimed_by,
      b.claimed_at,
      b.last_verified_at,
      b.outback_verified,
      b.created_at
    into v_business
    from public.businesses b
    where b.id = v_business_id;
  end if;

  select
    count(*) filter (where l.status = 'active' and l.expires_at > now())::int,
    count(*) filter (where l.closed_reason = 'matched')::int
  into v_active_listings, v_completed_deals
  from public.listings l
  where l.canonical_listing_id is null
    and (
      (v_user_id is not null and l.user_id = v_user_id)
      or (v_business_id is not null and l.business_id = v_business_id)
    );

  if v_business_id is not null or v_user_id is not null then
    select
      count(*) filter (where e.status in ('forwarded', 'emailed'))::int,
      count(*) filter (where e.outcome in ('got_quote', 'Booked', 'no_answer', 'not_used'))::int,
      count(*) filter (where e.outcome in ('got_quote', 'Booked'))::int
    into v_enq_forwarded, v_enq_answered, v_enq_responded
    from public.enquiries e
    join public.listings l on l.id = e.listing_id
    where (
      (v_business_id is not null and l.business_id = v_business_id)
      or (v_user_id is not null and l.user_id = v_user_id)
    )
    and e.created_at >= now() - interval '180 days';
  end if;

  with matched_reviews as (
    select
      r.id,
      r.created_at,
      r.reviewer_display_name,
      r.reviewer_postcode,
      r.rating,
      r.would_recommend,
      r.deal_type,
      r.tags,
      r.comment,
      r.vendor_reply,
      r.vendor_replied_at,
      (
        coalesce(r.deal_type, 'general') <> 'general'
        and r.comment is not null
        and length(btrim(r.comment)) >= 10
      ) as is_completed_work_review
    from public.vendor_reviews r
    where r.status = 'published'
      and (
        (v_user_id is not null and r.target_user_id = v_user_id)
        or (v_business_id is not null and r.target_business_id = v_business_id)
        or (p_listing_id is not null and r.listing_id = p_listing_id)
      )
    order by r.created_at desc
  ),
  tag_counts as (
    select t as tag, count(*)::int as cnt
    from matched_reviews mr,
         unnest(mr.tags) as t
    group by t
    order by cnt desc, t asc
    limit 8
  )
  select
    count(*) filter (where mr.is_completed_work_review)::int,
    count(*) filter (where not mr.is_completed_work_review)::int,
    round((avg(mr.rating) filter (where mr.is_completed_work_review))::numeric, 1),
    case
      when count(*) filter (where mr.is_completed_work_review) > 0
        then round(
          100.0 * count(*) filter (where mr.is_completed_work_review and mr.would_recommend)
          / (count(*) filter (where mr.is_completed_work_review))
        )::int
      else null
    end,
    coalesce((select jsonb_agg(jsonb_build_object('tag', tc.tag, 'count', tc.cnt)) from tag_counts tc), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', sub.id,
          'created_at', sub.created_at,
          'reviewer_display_name', sub.reviewer_display_name,
          'reviewer_postcode', sub.reviewer_postcode,
          'rating', sub.rating,
          'would_recommend', sub.would_recommend,
          'deal_type', sub.deal_type,
          'tags', sub.tags,
          'comment', sub.comment,
          'vendor_reply', sub.vendor_reply,
          'vendor_replied_at', sub.vendor_replied_at
        )
      )
      from (select * from matched_reviews limit 30) sub
    ), '[]'::jsonb)
  into v_review_count, v_vouch_count, v_avg_rating, v_recommend_pct, v_top_tags, v_recent_reviews
  from matched_reviews mr;

  return jsonb_build_object(
    'user_id', v_user_id,
    'business_id', v_business_id,
    'display_name', coalesce(nullif(btrim(v_profile.display_name), ''), v_business.trading_name, v_business.legal_name),
    'trading_name', coalesce(nullif(btrim(v_profile.trading_name), ''), v_business.trading_name, v_business.legal_name),
    'bio', coalesce(nullif(btrim(v_profile.bio), ''), v_business.bio),
    'postcode', coalesce(nullif(btrim(v_profile.postcode), ''), v_business.postcode),
    'suburb', coalesce(nullif(btrim(v_profile.suburb), ''), v_business.suburb),
    'state', coalesce(
      v_business.state_code,
      (select r.state from public.regions r where r.postcode = coalesce(v_profile.postcode, v_business.postcode) limit 1)
    ),
    'contact_phone', coalesce(nullif(btrim(v_profile.contact_phone), ''), v_business.contact_phone),
    'contact_email', coalesce(nullif(btrim(v_profile.contact_email), ''), v_business.contact_email),
    'website_url', coalesce(nullif(btrim(v_profile.website_url), ''), v_business.website_url),
    'facebook_url', v_business.facebook_url,
    'source_url', v_business.source_url,
    'source_platform', v_business.source_platform,
    'member_since', coalesce(v_profile.created_at, v_business.claimed_at, v_business.created_at),
    'claimed_at', coalesce(v_business.claimed_at, v_profile.created_at),
    'email_verified', (v_profile.email_verified_at is not null),
    'phone_verified', (
      v_profile.phone_verified_at is not null
      or v_profile.contact_phone is not null
      or v_business.contact_phone is not null
    ),
    'abn_verified', (
      v_profile.abn_verified_at is not null
      or v_business.claim_status in ('abn_verified', 'trusted')
      or v_business.abn is not null
    ),
    'abn_verified_at', coalesce(v_profile.abn_verified_at, v_business.last_verified_at),
    'abn', coalesce(nullif(btrim(v_profile.abn), ''), v_business.abn),
    'abn_entity_name', coalesce(nullif(btrim(v_profile.abn_entity_name), ''), v_business.legal_name),
    'claim_status', case
      when v_business.claim_status = 'trusted' then 'trusted'
      when v_user_id is not null or v_business.claimed_by is not null or v_business.claim_status = 'claimed' then 'claimed'
      when v_business.claim_status is not null then v_business.claim_status
      else 'unclaimed'
    end,
    'insurances_held', coalesce(
      case when cardinality(coalesce(v_profile.insurances_held, '{}'::text[])) > 0 then to_jsonb(v_profile.insurances_held) else null end,
      to_jsonb(coalesce(v_business.insurances_held, '{}'::text[]))
    ),
    'insurance_verified_at', coalesce(v_profile.insurance_verified_at, v_business.insurance_verified_at),
    'insurance_expiry_date', coalesce(v_profile.insurance_expiry_date, v_business.insurance_expiry_date),
    'role_tags', coalesce(
      case when cardinality(coalesce(v_profile.role_tags, '{}'::text[])) > 0 then to_jsonb(v_profile.role_tags) else null end,
      to_jsonb(coalesce(v_business.role_tags, '{}'::text[]))
    ),
    'services_offered', coalesce(
      case when cardinality(coalesce(v_profile.services_offered, '{}'::text[])) > 0 then to_jsonb(v_profile.services_offered) else null end,
      to_jsonb(coalesce(v_business.services_offered, '{}'::text[]))
    ),
    'photo_urls', coalesce(
      case when cardinality(coalesce(v_profile.photo_urls, '{}'::text[])) > 0 then to_jsonb(v_profile.photo_urls) else null end,
      to_jsonb(coalesce(v_business.photo_urls, '{}'::text[]))
    ),
    'years_in_district', coalesce(v_profile.years_in_district, v_business.years_in_district),
    'availability_status', coalesce(v_profile.availability_status, v_business.availability_status, 'available'),
    'availability_note', coalesce(nullif(btrim(v_profile.availability_note), ''), v_business.availability_note),
    'availability_updated_at', coalesce(v_profile.availability_updated_at, v_business.availability_updated_at, v_business.claimed_at),
    'travel_area', coalesce(nullif(btrim(v_profile.travel_area), ''), v_business.travel_area),
    'equipment_summary', coalesce(
      case when cardinality(coalesce(v_profile.equipment_summary, '{}'::text[])) > 0 then to_jsonb(v_profile.equipment_summary) else null end,
      to_jsonb(coalesce(v_business.equipment_summary, '{}'::text[]))
    ),
    'preferred_job_size', coalesce(nullif(btrim(v_profile.preferred_job_size), ''), v_business.preferred_job_size),
    'outback_verified', (
      coalesce(v_profile.outback_verified, false)
      or coalesce(v_business.outback_verified, false)
      or v_business.claim_status = 'trusted'
    ),
    'active_listings_count', v_active_listings,
    'completed_deals_count', v_completed_deals,
    'enquiry_forwarded', v_enq_forwarded,
    'enquiry_answered', v_enq_answered,
    'enquiry_responded', v_enq_responded,
    'review_count', v_review_count,
    'vouch_count', v_vouch_count,
    'avg_rating', v_avg_rating,
    'recommend_pct', v_recommend_pct,
    'top_tags', v_top_tags,
    'recent_reviews', v_recent_reviews
  );
end;
$fn$;

revoke all on function public.get_vendor_trust_summary(uuid, uuid, uuid) from public;
grant execute on function public.get_vendor_trust_summary(uuid, uuid, uuid) to anon, authenticated, service_role;
