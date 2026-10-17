-- ============================================================
-- Migration: 20261017150000_trusted_profiles_directory.sql
-- ============================================================
-- Project : csisezoohgfrpjrhkmls (outback-connections)
-- Date    : 2026-10-17
-- Purpose :
--   Create public.list_trusted_profiles(p_role, p_postcode, p_abn_only, p_limit)
--   so farmers, employers, and buyers can browse and filter verified rural
--   vendors, contractors, drivers, machine operators, and graziers by role,
--   postcode, and ABN verification status, ranked by community reviews,
--   verification badges, and active/completed listings.
-- ============================================================

create or replace function public.list_trusted_profiles(
  p_role     text default null,
  p_postcode text default null,
  p_abn_only boolean default false,
  p_limit    int default 48
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  with active_listing_counts as (
    select
      l.user_id,
      l.business_id,
      count(*) filter (where l.status = 'active' and l.expires_at > now())::int as active_cnt,
      count(*) filter (where l.closed_reason = 'matched')::int as matched_cnt,
      max(l.postcode) as sample_postcode,
      max(l.state) as sample_state,
      max(l.title) as sample_title
    from public.listings l
    where l.canonical_listing_id is null
      and l.data_source in ('manual', 'claimed')
    group by l.user_id, l.business_id
  ),
  user_candidates as (
    select
      p.user_id::text as profile_id,
      p.user_id,
      (
        select b.id
        from public.businesses b
        where b.claimed_by = p.user_id and b.status = 'active'
        order by b.claimed_at desc nulls last
        limit 1
      ) as business_id,
      coalesce(
        nullif(btrim(p.trading_name), ''),
        nullif(btrim(p.display_name), ''),
        nullif(btrim(p.abn_entity_name), ''),
        (select coalesce(b.trading_name, b.legal_name) from public.businesses b where b.claimed_by = p.user_id and b.status = 'active' limit 1),
        (select alc.sample_title from active_listing_counts alc where alc.user_id = p.user_id limit 1)
      ) as name,
      p.display_name,
      p.trading_name,
      p.bio,
      coalesce(
        nullif(btrim(p.postcode), ''),
        (select b.postcode from public.businesses b where b.claimed_by = p.user_id and b.status = 'active' limit 1),
        (select alc.sample_postcode from active_listing_counts alc where alc.user_id = p.user_id limit 1)
      ) as postcode,
      coalesce(
        (select r.state from public.regions r where r.postcode = p.postcode limit 1),
        (select b.state_code from public.businesses b where b.claimed_by = p.user_id and b.status = 'active' limit 1),
        (select alc.sample_state from active_listing_counts alc where alc.user_id = p.user_id limit 1)
      ) as state,
      p.created_at as member_since,
      (p.email_verified_at is not null) as email_verified,
      (
        p.abn_verified_at is not null
        or exists (
          select 1 from public.businesses b
          where b.claimed_by = p.user_id
            and b.claim_status in ('abn_verified', 'trusted')
        )
      ) as abn_verified,
      coalesce(
        p.abn,
        (select b.abn from public.businesses b where b.claimed_by = p.user_id and b.status = 'active' limit 1)
      ) as abn,
      exists (
        select 1 from public.businesses b
        where b.claimed_by = p.user_id
          and b.claim_status in ('claimed', 'abn_verified', 'trusted')
      ) as is_claimed_business,
      coalesce(p.insurances_held, '{}'::text[]) as insurances_held,
      coalesce(p.role_tags, '{}'::text[]) as role_tags,
      p.years_in_district,
      coalesce((select sum(alc.active_cnt)::int from active_listing_counts alc where alc.user_id = p.user_id), 0) as active_listings_count,
      coalesce((select sum(alc.matched_cnt)::int from active_listing_counts alc where alc.user_id = p.user_id), 0) as completed_deals_count
    from public.user_profiles p
    where (
      p.display_name is not null
      or p.trading_name is not null
      or p.abn is not null
      or cardinality(coalesce(p.role_tags, '{}'::text[])) > 0
      or exists (
        select 1 from public.listings l
        where l.user_id = p.user_id
          and l.status = 'active'
          and l.expires_at > now()
          and l.data_source in ('manual', 'claimed')
      )
      or exists (
        select 1 from public.businesses b
        where b.claimed_by = p.user_id
          and b.status = 'active'
          and b.claim_status in ('claimed', 'abn_verified', 'trusted')
      )
    )
  ),
  enriched as (
    select
      uc.*,
      coalesce(rev.review_count, 0) as review_count,
      rev.avg_rating,
      rev.recommend_pct,
      coalesce(rev.top_tags, '[]'::jsonb) as top_tags
    from user_candidates uc
    left join lateral (
      with r as (
        select vr.rating, vr.would_recommend, vr.tags
        from public.vendor_reviews vr
        where vr.status = 'published'
          and (
            vr.target_user_id = uc.user_id
            or (uc.business_id is not null and vr.target_business_id = uc.business_id)
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
    where uc.name is not null
      and (p_role is null or p_role = '' or p_role = any(uc.role_tags))
      and (p_postcode is null or p_postcode = '' or uc.postcode = p_postcode)
      and (not coalesce(p_abn_only, false) or uc.abn_verified = true)
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
        'state', e.state,
        'member_since', e.member_since,
        'email_verified', e.email_verified,
        'abn_verified', e.abn_verified,
        'abn', e.abn,
        'is_claimed_business', e.is_claimed_business,
        'insurances_held', to_jsonb(e.insurances_held),
        'role_tags', to_jsonb(e.role_tags),
        'years_in_district', e.years_in_district,
        'active_listings_count', e.active_listings_count,
        'completed_deals_count', e.completed_deals_count,
        'review_count', e.review_count,
        'avg_rating', e.avg_rating,
        'recommend_pct', e.recommend_pct,
        'top_tags', e.top_tags
      )
      order by
        e.review_count desc,
        e.abn_verified desc,
        e.is_claimed_business desc,
        e.active_listings_count desc,
        e.member_since asc
    ),
    '[]'::jsonb
  )
  from (
    select * from enriched
    order by
      review_count desc,
      abn_verified desc,
      is_claimed_business desc,
      active_listings_count desc,
      member_since asc
    limit greatest(1, least(coalesce(p_limit, 48), 100))
  ) e;
$fn$;

revoke all on function public.list_trusted_profiles(text, text, boolean, int) from public;
grant execute on function public.list_trusted_profiles(text, text, boolean, int) to anon, authenticated, service_role;
