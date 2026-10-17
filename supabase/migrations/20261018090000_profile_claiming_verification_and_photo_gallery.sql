-- ============================================================
-- Migration: 20261018090000_profile_claiming_verification_and_photo_gallery
-- ============================================================
-- Purpose:
--   1. Add contact_phone, contact_email, website_url, suburb, services_offered,
--      and photo_urls to public.user_profiles, and photo_urls to public.businesses
--      so claimed owners and members can edit all public details and showcase
--      work, rig, fencing, and livestock photos.
--   2. Create public storage bucket 'profile-photos' for profile/work galleries.
--   3. Upgrade approve_claim and add auto_approve_verified_claim so verified
--      owners (matching email/domain, active ABN, or verified phone + ABN)
--      have their business profile details automatically synced to user_profiles
--      and can immediately manage their profile and listings.
--   4. Upgrade get_vendor_trust_summary and list_trusted_profiles to return
--      photo_urls and owner-updated contact/specialty fields.
-- ============================================================

-- 1. Schema additions on user_profiles & businesses
alter table public.user_profiles
  add column if not exists suburb            text,
  add column if not exists contact_phone     text,
  add column if not exists contact_email     text,
  add column if not exists website_url       text,
  add column if not exists services_offered  text[] not null default '{}'::text[],
  add column if not exists photo_urls        text[] not null default '{}'::text[];

alter table public.businesses
  add column if not exists photo_urls        text[] not null default '{}'::text[];

grant select (
  suburb,
  contact_phone,
  contact_email,
  website_url,
  services_offered,
  photo_urls
) on public.user_profiles to anon, authenticated;

grant select (
  photo_urls
) on public.businesses to anon, authenticated;

-- 2. Public Storage Bucket for Profile & Work Photos ('profile-photos')
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Anyone reads profile photos'
  ) then
    create policy "Anyone reads profile photos"
      on storage.objects for select
      using (bucket_id = 'profile-photos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Service role manages profile photos'
  ) then
    create policy "Service role manages profile photos"
      on storage.objects for all to service_role
      using (bucket_id = 'profile-photos')
      with check (bucket_id = 'profile-photos');
  end if;
end
$$;

-- 3. Helper function to sync business fields into claimant's user_profiles row
create or replace function public._sync_claimed_business_to_user_profile(
  p_business_id uuid,
  p_user_id     uuid,
  p_abn         text default null,
  p_abn_entity  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_biz record;
begin
  select
    b.trading_name,
    b.legal_name,
    b.suburb,
    b.postcode,
    b.bio,
    b.abn,
    b.contact_phone,
    b.contact_email,
    b.website_url,
    b.role_tags,
    b.services_offered,
    b.insurances_held,
    b.years_in_district,
    b.availability_status,
    b.photo_urls
  into v_biz
  from public.businesses b
  where b.id = p_business_id;

  if not found then
    return;
  end if;

  insert into public.user_profiles (
    user_id,
    trading_name,
    suburb,
    postcode,
    bio,
    abn,
    abn_entity_name,
    abn_verified_at,
    contact_phone,
    contact_email,
    website_url,
    role_tags,
    services_offered,
    insurances_held,
    years_in_district,
    availability_status,
    photo_urls
  ) values (
    p_user_id,
    coalesce(v_biz.trading_name, v_biz.legal_name),
    v_biz.suburb,
    v_biz.postcode,
    v_biz.bio,
    coalesce(p_abn, v_biz.abn),
    coalesce(p_abn_entity, v_biz.legal_name),
    case when coalesce(p_abn, v_biz.abn) is not null then now() else null end,
    v_biz.contact_phone,
    v_biz.contact_email,
    v_biz.website_url,
    coalesce(v_biz.role_tags, '{}'::text[]),
    coalesce(v_biz.services_offered, '{}'::text[]),
    coalesce(v_biz.insurances_held, '{}'::text[]),
    v_biz.years_in_district,
    coalesce(v_biz.availability_status, 'available'),
    coalesce(v_biz.photo_urls, '{}'::text[])
  )
  on conflict (user_id) do update set
    trading_name = coalesce(nullif(btrim(public.user_profiles.trading_name), ''), excluded.trading_name),
    suburb = coalesce(nullif(btrim(public.user_profiles.suburb), ''), excluded.suburb),
    postcode = coalesce(nullif(btrim(public.user_profiles.postcode), ''), excluded.postcode),
    bio = coalesce(nullif(btrim(public.user_profiles.bio), ''), excluded.bio),
    abn = coalesce(nullif(btrim(public.user_profiles.abn), ''), excluded.abn),
    abn_entity_name = coalesce(nullif(btrim(public.user_profiles.abn_entity_name), ''), excluded.abn_entity_name),
    abn_verified_at = coalesce(public.user_profiles.abn_verified_at, excluded.abn_verified_at),
    contact_phone = coalesce(nullif(btrim(public.user_profiles.contact_phone), ''), excluded.contact_phone),
    contact_email = coalesce(nullif(btrim(public.user_profiles.contact_email), ''), excluded.contact_email),
    website_url = coalesce(nullif(btrim(public.user_profiles.website_url), ''), excluded.website_url),
    role_tags = case
      when cardinality(coalesce(public.user_profiles.role_tags, '{}'::text[])) > 0 then public.user_profiles.role_tags
      else excluded.role_tags
    end,
    services_offered = case
      when cardinality(coalesce(public.user_profiles.services_offered, '{}'::text[])) > 0 then public.user_profiles.services_offered
      else excluded.services_offered
    end,
    insurances_held = case
      when cardinality(coalesce(public.user_profiles.insurances_held, '{}'::text[])) > 0 then public.user_profiles.insurances_held
      else excluded.insurances_held
    end,
    years_in_district = coalesce(public.user_profiles.years_in_district, excluded.years_in_district),
    availability_status = coalesce(public.user_profiles.availability_status, excluded.availability_status),
    photo_urls = case
      when cardinality(coalesce(public.user_profiles.photo_urls, '{}'::text[])) > 0 then public.user_profiles.photo_urls
      else excluded.photo_urls
    end;
end;
$fn$;

revoke all on function public._sync_claimed_business_to_user_profile(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public._sync_claimed_business_to_user_profile(uuid, uuid, text, text) to service_role;

-- 4. Upgrade approve_claim so admin approvals also sync business details to user_profiles
create or replace function public.approve_claim(p_claim_id uuid, p_reviewed_by uuid)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_business uuid;
  v_claimant uuid;
  v_status text;
  v_biz_claim text;
  v_claimed_by uuid;
  v_policy uuid;
  v_evidence jsonb;
  v_claim_abn text;
begin
  if not exists (
    select 1 from public.user_profiles p
     where p.user_id = p_reviewed_by and p.is_admin = true
  ) then
    raise exception 'approve_claim: reviewer is not an admin';
  end if;

  select business_id, claimant_user_id, status, evidence
    into v_business, v_claimant, v_status, v_evidence
    from public.claims
   where id = p_claim_id
   for update;

  if v_business is null then
    raise exception 'approve_claim: claim % not found', p_claim_id;
  end if;
  if v_status <> 'pending' then
    raise exception 'approve_claim: claim is % (must be pending)', v_status;
  end if;

  select claim_status, claimed_by
    into v_biz_claim, v_claimed_by
    from public.businesses
   where id = v_business
   for update;

  if v_biz_claim is null then
    raise exception 'approve_claim: business % not found', v_business;
  end if;
  if v_biz_claim <> 'unclaimed' and v_claimed_by is distinct from v_claimant then
    raise exception 'approve_claim: business is already claimed by another user';
  end if;

  perform 1
    from public.listings
   where business_id = v_business
   for update;

  if exists (
    select 1
      from public.listings
     where business_id = v_business
       and user_id is not null
       and user_id <> v_claimant
  ) then
    raise exception 'approve_claim: a linked listing belongs to another user';
  end if;

  perform 1
    from public.business_members
   where business_id = v_business
   for update;

  if exists (
    select 1
      from public.business_members
     where business_id = v_business
       and role = 'owner'
       and user_id <> v_claimant
  ) then
    raise exception 'approve_claim: business already has another owner member';
  end if;

  update public.claims
     set status = 'approved', reviewed_at = now(), reviewed_by = p_reviewed_by
   where id = p_claim_id;

  v_claim_abn := nullif(btrim(coalesce(v_evidence->>'abn', '')), '');

  if v_biz_claim = 'unclaimed' then
    update public.businesses
       set claim_status = case when v_claim_abn is not null or abn is not null then 'abn_verified' else 'claimed' end,
           abn = coalesce(abn, v_claim_abn),
           claimed_by = v_claimant,
           claimed_at = now(),
           last_verified_at = now()
     where id = v_business;
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (v_business, v_claimant, 'owner')
  on conflict (business_id, user_id) do update set role = 'owner';

  -- Sync business profile details into user_profiles so the owner can edit everything immediately
  perform public._sync_claimed_business_to_user_profile(v_business, v_claimant, v_claim_abn, null);

  update public.listings
     set user_id = v_claimant,
         status = case
           when status = 'expired'
             and coalesce(under_review, false) = false
             and flag_count = 0
             then 'active'
           else status
         end,
         expires_at = case
           when (
             status = 'expired'
             or (status = 'active' and expires_at <= now())
           )
             and coalesce(under_review, false) = false
             and flag_count = 0
             then now() + interval '365 days'
           else expires_at
         end,
         freshness_status = case
           when (
             status = 'expired'
             or (status = 'active' and expires_at <= now())
           )
             and coalesce(under_review, false) = false
             and flag_count = 0
             then 'fresh'
           else freshness_status
         end
   where business_id = v_business
     and (user_id is null or user_id = v_claimant);

  select pv.id
    into v_policy
    from public.user_profiles up
    join public.policy_versions pv on pv.version = up.terms_consent_version
   where up.user_id = v_claimant
   limit 1;
  if v_policy is null then
    select id into v_policy from public.policy_versions order by effective_from desc limit 1;
  end if;

  update public.listings
     set data_source = 'claimed',
         policy_version_id = coalesce(policy_version_id, v_policy),
         description = btrim(regexp_replace(
           description,
           '[[:space:]]*This is an UNCLAIMED directory listing.*$', ''
         ))
   where business_id = v_business
     and user_id = v_claimant
     and data_source = 'scraped'
     and v_policy is not null;

  insert into public.business_outreach as existing (
    business_id, outreach_status, next_follow_up_at, updated_by
  ) values (
    v_business, 'joined', null, p_reviewed_by
  )
  on conflict (business_id) do update set
    outreach_status = 'joined',
    next_follow_up_at = null,
    updated_by = p_reviewed_by;

  insert into public.business_outreach_events (
    business_id, actor_user_id, action, outreach_status, note
  ) values (
    v_business, p_reviewed_by, 'joined', 'joined', 'Business claim approved.'
  );

  update public.claims
     set status = 'rejected', reviewed_at = now(), reviewed_by = p_reviewed_by,
         notes = coalesce(notes, 'Superseded by an approved claim.')
   where business_id = v_business
     and id <> p_claim_id
     and status = 'pending';

  return jsonb_build_object(
    'claim_id', p_claim_id,
    'business_id', v_business,
    'business_claim_status', (
      select claim_status from public.businesses where id = v_business
    ),
    'member_linked', true
  );
end;
$function$;

revoke all on function public.approve_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_claim(uuid, uuid) to service_role;

-- 5. Add auto_approve_verified_claim for instant verification when email/domain/ABN/phone match
create or replace function public.auto_approve_verified_claim(
  p_claim_id        uuid,
  p_abn             text default null,
  p_abn_entity_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_business uuid;
  v_claimant uuid;
  v_status text;
  v_biz_claim text;
  v_claimed_by uuid;
  v_policy uuid;
begin
  select business_id, claimant_user_id, status
    into v_business, v_claimant, v_status
    from public.claims
   where id = p_claim_id
   for update;

  if v_business is null then
    raise exception 'auto_approve_verified_claim: claim % not found', p_claim_id;
  end if;
  if v_status <> 'pending' then
    raise exception 'auto_approve_verified_claim: claim is % (must be pending)', v_status;
  end if;

  select claim_status, claimed_by
    into v_biz_claim, v_claimed_by
    from public.businesses
   where id = v_business
   for update;

  if v_biz_claim is null then
    raise exception 'auto_approve_verified_claim: business % not found', v_business;
  end if;
  if v_biz_claim <> 'unclaimed' and v_claimed_by is distinct from v_claimant then
    raise exception 'auto_approve_verified_claim: business is already claimed by another user';
  end if;

  if exists (
    select 1
      from public.listings
     where business_id = v_business
       and user_id is not null
       and user_id <> v_claimant
  ) then
    raise exception 'auto_approve_verified_claim: a linked listing belongs to another user';
  end if;

  if exists (
    select 1
      from public.business_members
     where business_id = v_business
       and role = 'owner'
       and user_id <> v_claimant
  ) then
    raise exception 'auto_approve_verified_claim: business already has another owner member';
  end if;

  update public.claims
     set status = 'approved',
         reviewed_at = now(),
         notes = coalesce(notes, 'Auto-verified via matching business credentials.')
   where id = p_claim_id;

  update public.businesses
     set claim_status = case
           when p_abn is not null or abn is not null then 'abn_verified'
           else 'claimed'
         end,
         abn = coalesce(abn, p_abn),
         legal_name = coalesce(legal_name, p_abn_entity_name),
         claimed_by = v_claimant,
         claimed_at = now(),
         last_verified_at = now()
   where id = v_business;

  insert into public.business_members (business_id, user_id, role)
  values (v_business, v_claimant, 'owner')
  on conflict (business_id, user_id) do update set role = 'owner';

  -- Sync business profile details into user_profiles so the owner can edit everything immediately
  perform public._sync_claimed_business_to_user_profile(v_business, v_claimant, p_abn, p_abn_entity_name);

  update public.listings
     set user_id = v_claimant,
         status = case
           when status = 'expired'
             and coalesce(under_review, false) = false
             and flag_count = 0
             then 'active'
           else status
         end,
         expires_at = case
           when (
             status = 'expired'
             or (status = 'active' and expires_at <= now())
           )
             and coalesce(under_review, false) = false
             and flag_count = 0
             then now() + interval '365 days'
           else expires_at
         end,
         freshness_status = case
           when (
             status = 'expired'
             or (status = 'active' and expires_at <= now())
           )
             and coalesce(under_review, false) = false
             and flag_count = 0
             then 'fresh'
           else freshness_status
         end
   where business_id = v_business
     and (user_id is null or user_id = v_claimant);

  select pv.id
    into v_policy
    from public.user_profiles up
    join public.policy_versions pv on pv.version = up.terms_consent_version
   where up.user_id = v_claimant
   limit 1;
  if v_policy is null then
    select id into v_policy from public.policy_versions order by effective_from desc limit 1;
  end if;

  update public.listings
     set data_source = 'claimed',
         policy_version_id = coalesce(policy_version_id, v_policy),
         description = btrim(regexp_replace(
           description,
           '[[:space:]]*This is an UNCLAIMED directory listing.*$', ''
         ))
   where business_id = v_business
     and user_id = v_claimant
     and data_source = 'scraped'
     and v_policy is not null;

  insert into public.business_outreach as existing (
    business_id, outreach_status, next_follow_up_at, updated_by
  ) values (
    v_business, 'joined', null, v_claimant
  )
  on conflict (business_id) do update set
    outreach_status = 'joined',
    next_follow_up_at = null,
    updated_by = v_claimant;

  insert into public.business_outreach_events (
    business_id, actor_user_id, action, outreach_status, note
  ) values (
    v_business, v_claimant, 'joined', 'joined', 'Business claim auto-verified.'
  );

  update public.claims
     set status = 'rejected',
         reviewed_at = now(),
         notes = coalesce(notes, 'Superseded by an auto-verified claim.')
   where business_id = v_business
     and id <> p_claim_id
     and status = 'pending';

  return jsonb_build_object(
    'claim_id', p_claim_id,
    'business_id', v_business,
    'business_claim_status', (
      select claim_status from public.businesses where id = v_business
    ),
    'member_linked', true
  );
end;
$function$;

revoke all on function public.auto_approve_verified_claim(uuid, text, text) from public, anon, authenticated;
grant execute on function public.auto_approve_verified_claim(uuid, text, text) to service_role;

-- 6. Upgrade get_vendor_trust_summary to include photo_urls and owner-updated contact/specialty fields
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
      p.role_tags,
      p.years_in_district,
      p.availability_status,
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
      b.years_in_district,
      b.availability_status,
      b.claim_status,
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
      r.vendor_replied_at
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
    count(*)::int,
    round(avg(mr.rating)::numeric, 1),
    case
      when count(*) > 0
        then round(100.0 * count(*) filter (where mr.would_recommend) / count(*))::int
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
      from (select * from matched_reviews limit 20) sub
    ), '[]'::jsonb)
  into v_review_count, v_avg_rating, v_recommend_pct, v_top_tags, v_recent_reviews
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
    'abn', coalesce(nullif(btrim(v_profile.abn), ''), v_business.abn),
    'abn_entity_name', coalesce(nullif(btrim(v_profile.abn_entity_name), ''), v_business.legal_name),
    'claim_status', coalesce(v_business.claim_status, case when v_user_id is not null then 'claimed' else 'unclaimed' end),
    'insurances_held', coalesce(
      case when cardinality(coalesce(v_profile.insurances_held, '{}'::text[])) > 0 then to_jsonb(v_profile.insurances_held) else null end,
      to_jsonb(coalesce(v_business.insurances_held, '{}'::text[]))
    ),
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
    'avg_rating', v_avg_rating,
    'recommend_pct', v_recommend_pct,
    'top_tags', v_top_tags,
    'recent_reviews', v_recent_reviews
  );
end;
$fn$;

revoke all on function public.get_vendor_trust_summary(uuid, uuid, uuid) from public;
grant execute on function public.get_vendor_trust_summary(uuid, uuid, uuid) to anon, authenticated, service_role;

-- 7. Upgrade list_trusted_profiles to return photo_urls and owner-updated contact fields
create or replace function public.list_trusted_profiles(
  p_role     text default null,
  p_postcode text default null,
  p_abn_only boolean default false,
  p_limit    int default 60
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  with primary_listings as (
    select distinct on (l.business_id)
      l.business_id,
      l.slug as listing_slug,
      l.kind as listing_kind,
      c.label as category_label,
      count(*) filter (where l.status = 'active' and l.expires_at > now()) over (partition by l.business_id)::int as active_cnt,
      count(*) filter (where l.closed_reason = 'matched') over (partition by l.business_id)::int as matched_cnt
    from public.listings l
    left join public.categories c on c.id = l.category_id
    where l.business_id is not null
      and l.canonical_listing_id is null
      and l.status = 'active'
    order by l.business_id, (l.expires_at > now()) desc, l.updated_at desc
  ),
  all_candidates as (
    -- A. All active businesses (claimed + verified directory businesses)
    select
      coalesce(b.claimed_by::text, b.id::text) as profile_id,
      b.claimed_by as user_id,
      b.id as business_id,
      coalesce(nullif(btrim(p.trading_name), ''), nullif(btrim(b.trading_name), ''), nullif(btrim(b.legal_name), ''), 'Rural Business') as name,
      p.display_name,
      coalesce(nullif(btrim(p.trading_name), ''), b.trading_name) as trading_name,
      coalesce(nullif(btrim(p.bio), ''), nullif(btrim(b.bio), '')) as bio,
      coalesce(nullif(btrim(p.postcode), ''), nullif(btrim(b.postcode), '')) as postcode,
      coalesce(nullif(btrim(p.suburb), ''), b.suburb) as suburb,
      coalesce(b.state_code, 'NSW') as state,
      coalesce(nullif(btrim(p.contact_phone), ''), b.contact_phone) as contact_phone,
      coalesce(nullif(btrim(p.contact_email), ''), b.contact_email) as contact_email,
      coalesce(nullif(btrim(p.website_url), ''), b.website_url) as website_url,
      b.facebook_url,
      pl.listing_slug,
      pl.listing_kind,
      pl.category_label,
      coalesce(p.created_at, b.claimed_at, b.created_at) as member_since,
      (p.email_verified_at is not null) as email_verified,
      (
        p.abn_verified_at is not null
        or b.claim_status in ('abn_verified', 'trusted')
        or b.abn is not null
      ) as abn_verified,
      coalesce(nullif(btrim(p.abn), ''), b.abn) as abn,
      (b.claim_status in ('claimed', 'abn_verified', 'trusted')) as is_claimed_business,
      case
        when cardinality(coalesce(p.insurances_held, '{}'::text[])) > 0 then p.insurances_held
        else coalesce(b.insurances_held, '{}'::text[])
      end as insurances_held,
      case
        when cardinality(coalesce(p.role_tags, '{}'::text[])) > 0 then p.role_tags
        else coalesce(b.role_tags, '{}'::text[])
      end as role_tags,
      case
        when cardinality(coalesce(p.services_offered, '{}'::text[])) > 0 then p.services_offered
        else coalesce(b.services_offered, '{}'::text[])
      end as services_offered,
      case
        when cardinality(coalesce(p.photo_urls, '{}'::text[])) > 0 then p.photo_urls
        else coalesce(b.photo_urls, '{}'::text[])
      end as photo_urls,
      coalesce(p.years_in_district, b.years_in_district) as years_in_district,
      coalesce(p.availability_status, b.availability_status, 'available') as availability_status,
      (
        coalesce(p.outback_verified, false)
        or coalesce(b.outback_verified, false)
        or b.claim_status = 'trusted'
      ) as outback_verified,
      coalesce(pl.active_cnt, 1) as active_listings_count,
      coalesce(pl.matched_cnt, 0) as completed_deals_count
    from public.businesses b
    left join public.user_profiles p on p.user_id = b.claimed_by
    left join primary_listings pl on pl.business_id = b.id
    where b.status = 'active'

    union all

    -- B. Standalone member profiles without a linked business row
    select
      p.user_id::text as profile_id,
      p.user_id,
      null::uuid as business_id,
      coalesce(nullif(btrim(p.trading_name), ''), nullif(btrim(p.display_name), ''), nullif(btrim(p.abn_entity_name), '')) as name,
      p.display_name,
      p.trading_name,
      p.bio,
      p.postcode,
      coalesce(nullif(btrim(p.suburb), ''), (select r.region_name from public.regions r where r.postcode = p.postcode limit 1)) as suburb,
      coalesce((select r.state from public.regions r where r.postcode = p.postcode limit 1), 'NSW') as state,
      p.contact_phone,
      p.contact_email,
      p.website_url,
      null::text as facebook_url,
      null::text as listing_slug,
      null::text as listing_kind,
      null::text as category_label,
      p.created_at as member_since,
      (p.email_verified_at is not null) as email_verified,
      (p.abn_verified_at is not null) as abn_verified,
      p.abn,
      false as is_claimed_business,
      coalesce(p.insurances_held, '{}'::text[]) as insurances_held,
      coalesce(p.role_tags, '{}'::text[]) as role_tags,
      coalesce(p.services_offered, '{}'::text[]) as services_offered,
      coalesce(p.photo_urls, '{}'::text[]) as photo_urls,
      p.years_in_district,
      coalesce(p.availability_status, 'available') as availability_status,
      coalesce(p.outback_verified, false) as outback_verified,
      (select count(*)::int from public.listings l where l.user_id = p.user_id and l.status = 'active' and l.expires_at > now()) as active_listings_count,
      (select count(*)::int from public.listings l where l.user_id = p.user_id and l.closed_reason = 'matched') as completed_deals_count
    from public.user_profiles p
    where not exists (
      select 1 from public.businesses b where b.claimed_by = p.user_id and b.status = 'active'
    )
    and (
      p.display_name is not null
      or p.trading_name is not null
      or p.abn is not null
      or cardinality(coalesce(p.role_tags, '{}'::text[])) > 0
    )
  ),
  enriched as (
    select
      ac.*,
      coalesce(rev.review_count, 0) as review_count,
      rev.avg_rating,
      rev.recommend_pct,
      coalesce(rev.top_tags, '[]'::jsonb) as top_tags
    from all_candidates ac
    left join lateral (
      with r as (
        select vr.rating, vr.would_recommend, vr.tags
        from public.vendor_reviews vr
        where vr.status = 'published'
          and (
            (ac.user_id is not null and vr.target_user_id = ac.user_id)
            or (ac.business_id is not null and vr.target_business_id = ac.business_id)
          )
      ),
      tc as (
        select t as tag, count(*)::int as cnt
        from r, unnest(r.tags) as t
        group by t
        order by cnt desc, t asc
        limit 4
      )
      select
        count(*)::int as review_count,
        round(avg(r.rating)::numeric, 1) as avg_rating,
        case
          when count(*) > 0
            then round(100.0 * count(*) filter (where r.would_recommend) / count(*))::int
          else null
        end as recommend_pct,
        (select jsonb_agg(jsonb_build_object('tag', tc.tag, 'count', tc.cnt)) from tc) as top_tags
      from r
    ) rev on true
    where ac.name is not null
      and (p_role is null or p_role = '' or p_role = any(ac.role_tags))
      and (
        p_postcode is null
        or p_postcode = ''
        or ac.postcode like (p_postcode || '%')
        or lower(coalesce(ac.suburb, '')) like ('%' || lower(p_postcode) || '%')
        or lower(ac.name) like ('%' || lower(p_postcode) || '%')
      )
      and (not coalesce(p_abn_only, false) or ac.abn_verified = true or ac.outback_verified = true)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'profile_id', e.profile_id,
        'user_id', e.user_id,
        'business_id', e.business_id,
        'name', e.name,
        'display_name', e.display_name,
        'trading_name', e.trading_name,
        'bio', e.bio,
        'postcode', e.postcode,
        'suburb', e.suburb,
        'state', e.state,
        'contact_phone', e.contact_phone,
        'contact_email', e.contact_email,
        'website_url', e.website_url,
        'facebook_url', e.facebook_url,
        'listing_slug', e.listing_slug,
        'listing_kind', e.listing_kind,
        'category_label', e.category_label,
        'member_since', e.member_since,
        'email_verified', e.email_verified,
        'abn_verified', e.abn_verified,
        'abn', e.abn,
        'is_claimed_business', e.is_claimed_business,
        'insurances_held', to_jsonb(e.insurances_held),
        'role_tags', to_jsonb(e.role_tags),
        'services_offered', to_jsonb(e.services_offered),
        'photo_urls', to_jsonb(e.photo_urls),
        'years_in_district', e.years_in_district,
        'availability_status', e.availability_status,
        'outback_verified', e.outback_verified,
        'active_listings_count', e.active_listings_count,
        'completed_deals_count', e.completed_deals_count,
        'review_count', e.review_count,
        'avg_rating', e.avg_rating,
        'recommend_pct', e.recommend_pct,
        'top_tags', e.top_tags
      )
      order by
        e.outback_verified desc,
        e.review_count desc,
        e.abn_verified desc,
        e.is_claimed_business desc,
        (e.website_url is not null) desc,
        (e.contact_phone is not null and e.contact_email is not null) desc,
        (e.contact_phone is not null) desc,
        e.name asc
    ),
    '[]'::jsonb
  )
  from (
    select * from enriched
    order by
      outback_verified desc,
      review_count desc,
      abn_verified desc,
      is_claimed_business desc,
      (website_url is not null) desc,
      (contact_phone is not null and contact_email is not null) desc,
      (contact_phone is not null) desc,
      name asc
    limit greatest(1, least(coalesce(p_limit, 60), 250))
  ) e;
$fn$;

revoke all on function public.list_trusted_profiles(text, text, boolean, int) from public;
grant execute on function public.list_trusted_profiles(text, text, boolean, int) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
