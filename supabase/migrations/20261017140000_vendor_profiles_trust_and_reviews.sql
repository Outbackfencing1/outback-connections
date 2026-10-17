-- ============================================================
-- Migration: 20261017140000_vendor_profiles_trust_and_reviews.sql
-- ============================================================
-- Project : csisezoohgfrpjrhkmls (outback-connections)
-- Date    : 2026-10-17
-- Purpose :
--   1. Extend public.user_profiles with public trust profile fields:
--      trading_name, bio, role_tags, insurances_held, years_in_district.
--   2. Create public.vendor_reviews for verified member-to-member feedback,
--      star ratings, structured rural vouch tags ("Turned up on time",
--      "Stock / hay / gear as described", "Paid on time", etc.), and
--      vendor replies.
--   3. Create public.get_vendor_trust_summary(p_user_id, p_business_id, p_listing_id)
--      returning a public-safe trust scorecard (verification badges, completed
--      deals, enquiry response stats, average star rating, recommend %, top
--      vouched tags, and recent published reviews).
-- ============================================================

-- 1. Extend user_profiles with trust & profile columns
alter table public.user_profiles
  add column if not exists trading_name text,
  add column if not exists bio text,
  add column if not exists role_tags text[] not null default '{}'::text[],
  add column if not exists insurances_held text[] not null default '{}'::text[],
  add column if not exists years_in_district integer
    check (years_in_district is null or (years_in_district >= 0 and years_in_district <= 100));

-- 2. Create vendor_reviews table
create table if not exists public.vendor_reviews (
  id                    uuid primary key default gen_random_uuid(),
  anonymised_id         text not null unique default public.gen_short_id('REV'),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  listing_id            uuid references public.listings(id) on delete set null,
  target_user_id        uuid references auth.users(id) on delete cascade,
  target_business_id    uuid references public.businesses(id) on delete cascade,
  reviewer_user_id      uuid not null references auth.users(id) on delete cascade,
  reviewer_display_name text not null,
  reviewer_postcode     text,
  rating                integer not null check (rating between 1 and 5),
  would_recommend       boolean not null default true,
  deal_type             text not null default 'general'
                          check (deal_type in (
                            'bought_item',
                            'sold_item',
                            'hired_worker',
                            'worked_for',
                            'fencing_service',
                            'freight_load',
                            'general'
                          )),
  tags                  text[] not null default '{}'::text[],
  comment               text check (comment is null or char_length(comment) <= 800),
  vendor_reply          text check (vendor_reply is null or char_length(vendor_reply) <= 600),
  vendor_replied_at     timestamptz,
  status                text not null default 'published'
                          check (status in ('published', 'hidden', 'flagged')),
  constraint vendor_reviews_target_required
    check (target_user_id is not null or target_business_id is not null),
  constraint vendor_reviews_no_self_review
    check (target_user_id is null or target_user_id <> reviewer_user_id)
);

create index if not exists idx_vendor_reviews_target_user
  on public.vendor_reviews (target_user_id, status, created_at desc);

create index if not exists idx_vendor_reviews_target_business
  on public.vendor_reviews (target_business_id, status, created_at desc);

create index if not exists idx_vendor_reviews_listing
  on public.vendor_reviews (listing_id, status, created_at desc);

create unique index if not exists idx_vendor_reviews_unique_per_listing
  on public.vendor_reviews (reviewer_user_id, listing_id)
  where listing_id is not null;

drop trigger if exists trg_vendor_reviews_updated_at on public.vendor_reviews;
create trigger trg_vendor_reviews_updated_at
  before update on public.vendor_reviews
  for each row execute function public.set_updated_at();

alter table public.vendor_reviews enable row level security;

drop policy if exists "Anyone reads published vendor reviews" on public.vendor_reviews;
create policy "Anyone reads published vendor reviews"
  on public.vendor_reviews for select
  using (status = 'published');

drop policy if exists "Authenticated users insert own vendor reviews" on public.vendor_reviews;
create policy "Authenticated users insert own vendor reviews"
  on public.vendor_reviews for insert to authenticated
  with check (
    auth.uid() = reviewer_user_id
    and (target_user_id is null or target_user_id <> auth.uid())
  );

drop policy if exists "Service role manages vendor reviews" on public.vendor_reviews;
create policy "Service role manages vendor reviews"
  on public.vendor_reviews for all to service_role
  using (true) with check (true);

grant select on public.vendor_reviews to anon, authenticated;
grant insert on public.vendor_reviews to authenticated;
grant all on public.vendor_reviews to service_role;

-- 3. Public-safe Vendor / Worker / Business Trust Scorecard RPC
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
  v_user_id     uuid := p_user_id;
  v_business_id uuid := p_business_id;
  v_result      jsonb;
begin
  -- Resolve user_id and business_id from listing if provided
  if p_listing_id is not null and (v_user_id is null and v_business_id is null) then
    select l.user_id, l.business_id
      into v_user_id, v_business_id
      from public.listings l
     where l.id = p_listing_id;
  end if;

  -- If business is claimed by a user and v_user_id is null, link to claimed_by
  if v_business_id is not null and v_user_id is null then
    select b.claimed_by
      into v_user_id
      from public.businesses b
     where b.id = v_business_id;
  end if;

  -- If user owns a claimed business and v_business_id is null, pick their primary business
  if v_user_id is not null and v_business_id is null then
    select b.id
      into v_business_id
      from public.businesses b
     where b.claimed_by = v_user_id
       and b.status = 'active'
     order by b.claimed_at desc nulls last
     limit 1;
  end if;

  with up as (
    select
      p.user_id,
      p.display_name,
      p.trading_name,
      p.bio,
      p.postcode,
      (select r.state from public.regions r where r.postcode = p.postcode limit 1) as state,
      p.created_at,
      (p.email_verified_at is not null) as email_verified,
      (p.phone_verified_at is not null) as phone_verified,
      (p.abn_verified_at is not null) as abn_verified,
      p.abn,
      p.abn_entity_name,
      coalesce(p.insurances_held, '{}'::text[]) as insurances_held,
      coalesce(p.role_tags, '{}'::text[]) as role_tags,
      p.years_in_district
    from public.user_profiles p
    where v_user_id is not null and p.user_id = v_user_id
  ),
  biz as (
    select
      b.id,
      b.trading_name,
      b.legal_name,
      b.abn,
      b.claim_status,
      b.postcode,
      b.state_code,
      b.created_at
    from public.businesses b
    where v_business_id is not null and b.id = v_business_id
  ),
  active_l as (
    select count(*)::int as cnt
    from public.listings l
    where l.status = 'active'
      and l.expires_at > now()
      and l.canonical_listing_id is null
      and (
        (v_user_id is not null and l.user_id = v_user_id)
        or (v_business_id is not null and l.business_id = v_business_id)
      )
  ),
  completed_l as (
    select count(*)::int as cnt
    from public.listings l
    left join public.sale_details sd on sd.listing_id = l.id
    where l.canonical_listing_id is null
      and (
        l.closed_reason = 'matched'
        or sd.sold_at is not null
      )
      and (
        (v_user_id is not null and l.user_id = v_user_id)
        or (v_business_id is not null and l.business_id = v_business_id)
      )
  ),
  enq as (
    select
      count(*)::int as forwarded,
      count(*) filter (where e.outcome is not null)::int as answered,
      count(*) filter (where e.outcome = 'responded')::int as responded
    from public.listing_enquiries e
    where e.status = 'forwarded'
      and e.created_at > now() - interval '12 months'
      and (
        (v_business_id is not null and e.business_id = v_business_id)
        or (p_listing_id is not null and e.listing_id = p_listing_id)
        or (
          v_user_id is not null
          and e.listing_id in (select l2.id from public.listings l2 where l2.user_id = v_user_id)
        )
      )
  ),
  revs as (
    select
      vr.id,
      vr.created_at,
      vr.reviewer_display_name,
      vr.reviewer_postcode,
      vr.rating,
      vr.would_recommend,
      vr.deal_type,
      vr.tags,
      vr.comment,
      vr.vendor_reply,
      vr.vendor_replied_at
    from public.vendor_reviews vr
    where vr.status = 'published'
      and (
        (v_user_id is not null and vr.target_user_id = v_user_id)
        or (v_business_id is not null and vr.target_business_id = v_business_id)
        or (p_listing_id is not null and vr.listing_id = p_listing_id)
      )
    order by vr.created_at desc
  ),
  rev_stats as (
    select
      count(*)::int as review_count,
      round(avg(r.rating)::numeric, 1) as avg_rating,
      case
        when count(*) > 0
          then round(100.0 * count(*) filter (where r.would_recommend) / count(*))::int
        else null
      end as recommend_pct
    from revs r
  ),
  tag_counts as (
    select t as tag, count(*)::int as cnt
    from revs r, unnest(r.tags) as t
    group by t
    order by cnt desc, t asc
    limit 6
  )
  select jsonb_build_object(
    'user_id', v_user_id,
    'business_id', v_business_id,
    'display_name', coalesce((select display_name from up), (select trading_name from biz), (select legal_name from biz)),
    'trading_name', coalesce((select trading_name from up), (select trading_name from biz), (select legal_name from biz)),
    'bio', (select bio from up),
    'postcode', coalesce((select postcode from up), (select postcode from biz)),
    'state', coalesce((select state from up), (select state_code from biz)),
    'member_since', coalesce((select created_at from up), (select created_at from biz)),
    'email_verified', coalesce((select email_verified from up), false),
    'phone_verified', coalesce((select phone_verified from up), false),
    'abn_verified', coalesce(
      (select abn_verified from up),
      (select claim_status in ('abn_verified', 'trusted') from biz),
      false
    ),
    'abn', coalesce((select abn from up), (select abn from biz)),
    'abn_entity_name', coalesce((select abn_entity_name from up), (select legal_name from biz)),
    'claim_status', (select claim_status from biz),
    'insurances_held', coalesce((select to_jsonb(insurances_held) from up), '[]'::jsonb),
    'role_tags', coalesce((select to_jsonb(role_tags) from up), '[]'::jsonb),
    'years_in_district', (select years_in_district from up),
    'active_listings_count', coalesce((select cnt from active_l), 0),
    'completed_deals_count', coalesce((select cnt from completed_l), 0),
    'enquiry_forwarded', coalesce((select forwarded from enq), 0),
    'enquiry_answered', coalesce((select answered from enq), 0),
    'enquiry_responded', coalesce((select responded from enq), 0),
    'review_count', coalesce((select review_count from rev_stats), 0),
    'avg_rating', (select avg_rating from rev_stats),
    'recommend_pct', (select recommend_pct from rev_stats),
    'top_tags', coalesce(
      (select jsonb_agg(jsonb_build_object('tag', tc.tag, 'count', tc.cnt)) from tag_counts tc),
      '[]'::jsonb
    ),
    'recent_reviews', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'created_at', r.created_at,
        'reviewer_display_name', r.reviewer_display_name,
        'reviewer_postcode', r.reviewer_postcode,
        'rating', r.rating,
        'would_recommend', r.would_recommend,
        'deal_type', r.deal_type,
        'tags', r.tags,
        'comment', r.comment,
        'vendor_reply', r.vendor_reply,
        'vendor_replied_at', r.vendor_replied_at
      )) from (select * from revs limit 12) r),
      '[]'::jsonb
    )
  ) into v_result;

  return v_result;
end;
$fn$;

revoke all on function public.get_vendor_trust_summary(uuid, uuid, uuid) from public;
grant execute on function public.get_vendor_trust_summary(uuid, uuid, uuid) to anon, authenticated, service_role;
