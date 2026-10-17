-- ============================================================
-- Migration: 20261017170000_availability_proof_alerts_and_outback_verified.sql
-- ============================================================
-- Project : csisezoohgfrpjrhkmls (outback-connections)
-- Date    : 2026-10-17
-- Purpose :
--   1. Add worker/contractor availability_status ('available', 'available_soon', 'booked_out')
--      and outback_verified gold badge to public.user_profiles and public.businesses.
--   2. Add proof_badges text[] to public.sale_details for PIC, NVD, shedded/rain-free,
--      weed-free, and on-farm loading declarations.
--   3. Create public.search_alerts for 1-click "Alert me when available" saved searches
--      across Work & Skills, Livestock/Harvest, Freight, and Services.
--   4. Upgrade public.get_vendor_trust_summary, public.list_trusted_profiles, and
--      public.admin_market_intelligence to surface availability_status, outback_verified,
--      and saved search alerts.
-- ============================================================

-- 1. Extend user_profiles & businesses
alter table public.user_profiles
  add column if not exists availability_status text not null default 'available'
    check (availability_status in ('available', 'available_soon', 'booked_out')),
  add column if not exists outback_verified boolean not null default false,
  add column if not exists outback_verified_at timestamptz;

alter table public.businesses
  add column if not exists outback_verified boolean not null default false;

-- 2. Extend sale_details with proof_badges
alter table public.sale_details
  add column if not exists proof_badges text[] not null default '{}'::text[];

-- 3. Create search_alerts table for 1-click saved search alerts
create table if not exists public.search_alerts (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  user_id          uuid references auth.users(id) on delete cascade,
  email            text not null,
  vertical         text not null check (vertical in ('job', 'sale', 'freight', 'service')),
  signal           text not null default 'all',
  postcode         text,
  active           boolean not null default true,
  notified_count   integer not null default 0,
  last_notified_at timestamptz
);

create index if not exists idx_search_alerts_match
  on public.search_alerts (vertical, active, postcode);

create unique index if not exists idx_search_alerts_dedup
  on public.search_alerts (lower(email), vertical, signal, coalesce(postcode, ''));

alter table public.search_alerts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'search_alerts'
      and policyname = 'Service role manages search alerts'
  ) then
    create policy "Service role manages search alerts"
      on public.search_alerts for all to service_role
      using (true) with check (true);
  end if;
end $$;

grant all on public.search_alerts to service_role;

-- 4. Upgrade get_vendor_trust_summary to include availability_status & outback_verified
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
  if p_listing_id is not null and (v_user_id is null and v_business_id is null) then
    select l.user_id, l.business_id
      into v_user_id, v_business_id
      from public.listings l
     where l.id = p_listing_id;
  end if;

  if v_business_id is not null and v_user_id is null then
    select b.claimed_by
      into v_user_id
      from public.businesses b
     where b.id = v_business_id;
  end if;

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
      p.years_in_district,
      coalesce(p.availability_status, 'available') as availability_status,
      coalesce(p.outback_verified, false) as outback_verified
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
      b.created_at,
      coalesce(b.outback_verified, false) as outback_verified
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
    'availability_status', coalesce((select availability_status from up), 'available'),
    'outback_verified', (
      coalesce((select outback_verified from up), false)
      or coalesce((select outback_verified from biz), false)
      or coalesce((select claim_status = 'trusted' from biz), false)
    ),
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

grant execute on function public.get_vendor_trust_summary(uuid, uuid, uuid) to anon, authenticated, service_role;

-- 5. Upgrade list_trusted_profiles to include availability_status & outback_verified
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
      coalesce(p.availability_status, 'available') as availability_status,
      (
        coalesce(p.outback_verified, false)
        or exists (
          select 1 from public.businesses b
          where b.claimed_by = p.user_id
            and (b.outback_verified = true or b.claim_status = 'trusted')
        )
      ) as outback_verified,
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
        e.active_listings_count desc,
        e.member_since asc
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
      active_listings_count desc,
      member_since asc
    limit greatest(1, least(coalesce(p_limit, 48), 100))
  ) e;
$fn$;

grant execute on function public.list_trusted_profiles(text, text, boolean, int) to anon, authenticated, service_role;

-- 6. Upgrade admin_market_intelligence to include saved_alerts
create or replace function public.admin_market_intelligence(p_months int default 6)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  with win as (
    select date_trunc('month', timezone('Australia/Sydney', now()))
           - make_interval(months => greatest(p_months, 1) - 1) as start_local
  ),
  reg as (
    select distinct on (postcode) postcode, region_name, state
      from public.regions
     where region_name is not null
     order by postcode, region_name
  ),
  sale_rows as (
    select to_char(date_trunc('month', timezone('Australia/Sydney', l.created_at)), 'YYYY-MM') as month,
           coalesce(r.region_name, 'Other') as region_name,
           coalesce(r.state, l.state, '') as state,
           c.slug as category_slug,
           c.label as category_label,
           coalesce(nullif(sd.sub_category, ''), c.slug) as commodity,
           coalesce(l.side, 'supply') as side,
           sd.price_type,
           coalesce(sd.sold_price_cents, sd.price_cents) as effective_price_cents,
           sd.quantity,
           coalesce(sd.sold_quantity, case when l.status = 'closed' and l.closed_reason = 'matched' then sd.quantity else null end) as effective_sold_qty,
           coalesce(sd.unit, '') as unit,
           (sd.sold_at is not null or (l.status = 'closed' and l.closed_reason = 'matched')) as is_sold
      from public.listings l
      join public.categories c on c.id = l.category_id
      join public.sale_details sd on sd.listing_id = l.id
      left join reg r on r.postcode = l.postcode
     where l.kind = 'for_sale'
       and l.status not in ('hidden_flagged', 'deleted_by_admin')
       and timezone('Australia/Sydney', l.created_at) >= (select start_local from win)
  ),
  commodity_summary as (
    select month, region_name, state, category_label, commodity, unit, price_type,
           count(*)::int as listings_count,
           count(*) filter (where side <> 'demand')::int as for_sale_count,
           count(*) filter (where side = 'demand')::int as wanted_count,
           count(*) filter (where is_sold)::int as sold_count,
           coalesce(sum(quantity) filter (where side <> 'demand'), 0)::numeric(12,2) as quantity_listed,
           coalesce(sum(quantity) filter (where side = 'demand'), 0)::numeric(12,2) as quantity_wanted,
           coalesce(sum(effective_sold_qty), 0)::numeric(12,2) as quantity_sold,
           round(avg(effective_price_cents) filter (where effective_price_cents > 0))::int as avg_price_cents
      from sale_rows
     group by 1, 2, 3, 4, 5, 6, 7
  ),
  job_rows as (
    select to_char(date_trunc('month', timezone('Australia/Sydney', l.created_at)), 'YYYY-MM') as month,
           coalesce(r.region_name, 'Other') as region_name,
           coalesce(r.state, l.state, '') as state,
           c.label as role_label,
           jd.direction,
           jd.pay_type,
           jd.pay_amount,
           jd.tickets,
           (l.status = 'closed' and l.closed_reason = 'matched') as is_matched
      from public.listings l
      join public.categories c on c.id = l.category_id
      join public.job_details jd on jd.listing_id = l.id
      left join reg r on r.postcode = l.postcode
     where l.kind = 'job'
       and l.status not in ('hidden_flagged', 'deleted_by_admin')
       and timezone('Australia/Sydney', l.created_at) >= (select start_local from win)
  ),
  work_summary as (
    select month, region_name, state, role_label,
           count(*) filter (where direction = 'hiring')::int as jobs_hiring,
           count(*) filter (where direction = 'available_for_work')::int as workers_available,
           count(*) filter (where is_matched)::int as matched_count,
           round(avg(pay_amount) filter (where pay_type = 'hourly' and pay_amount > 0), 2) as avg_hourly_aud,
           round(avg(pay_amount) filter (where pay_type = 'daily' and pay_amount > 0), 2) as avg_daily_aud
      from job_rows
     group by 1, 2, 3, 4
  ),
  ticket_counts as (
    select t.ticket,
           count(*)::int as workers_count
      from job_rows j,
           unnest(j.tickets) as t(ticket)
     where j.direction = 'available_for_work'
     group by 1
  ),
  search_rows as (
    select coalesce(sq.vertical, 'other') as vertical,
           coalesce(
             nullif(sq.filters->>'ticket', ''),
             nullif(sq.filters->>'sub_category', ''),
             nullif(sq.filters->>'vehicle_type', ''),
             nullif(sq.filters->>'direction', ''),
             nullif(sq.filters->>'side', ''),
             'all'
           ) as signal,
           coalesce(r.region_name, case when sq.postcode is not null and sq.postcode <> '' then 'Postcode ' || sq.postcode else 'All regions' end) as region_name,
           coalesce(r.state, sq.region_state, '') as state,
           sq.result_count
      from public.search_queries sq
      left join reg r on r.postcode = sq.postcode
     where coalesce(sq.is_bot, false) = false
       and sq.vertical in ('job', 'sale', 'freight')
       and timezone('Australia/Sydney', sq.created_at) >= (select start_local from win)
  ),
  search_signal_summary as (
    select vertical, signal, region_name, state,
           count(*)::int as searches,
           count(*) filter (where result_count = 0)::int as zero_result_searches
      from search_rows
     group by 1, 2, 3, 4
  ),
  alert_summary as (
    select sa.vertical,
           sa.signal,
           coalesce(r.region_name, case when sa.postcode is not null and sa.postcode <> '' then 'Postcode ' || sa.postcode else 'All regions' end) as region_name,
           coalesce(r.state, '') as state,
           count(*)::int as active_alerts
      from public.search_alerts sa
      left join reg r on r.postcode = sa.postcode
     where sa.active = true
     group by 1, 2, 3, 4
  )
  select jsonb_build_object(
    'window_months', greatest(p_months, 1),
    'commodities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', cs.month,
        'region_name', cs.region_name,
        'state', nullif(cs.state, ''),
        'category_label', cs.category_label,
        'commodity', cs.commodity,
        'unit', nullif(cs.unit, ''),
        'price_type', cs.price_type,
        'listings_count', cs.listings_count,
        'for_sale_count', cs.for_sale_count,
        'wanted_count', cs.wanted_count,
        'sold_count', cs.sold_count,
        'quantity_listed', cs.quantity_listed,
        'quantity_wanted', cs.quantity_wanted,
        'quantity_sold', cs.quantity_sold,
        'avg_price_cents', cs.avg_price_cents
      ) order by cs.month desc, cs.listings_count desc, cs.region_name), '[]'::jsonb)
      from commodity_summary cs
    ),
    'work_board', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', ws.month,
        'region_name', ws.region_name,
        'state', nullif(ws.state, ''),
        'role_label', ws.role_label,
        'jobs_hiring', ws.jobs_hiring,
        'workers_available', ws.workers_available,
        'matched_count', ws.matched_count,
        'avg_hourly_aud', ws.avg_hourly_aud,
        'avg_daily_aud', ws.avg_daily_aud
      ) order by ws.month desc, (ws.jobs_hiring + ws.workers_available) desc, ws.region_name), '[]'::jsonb)
      from work_summary ws
    ),
    'tickets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ticket', tc.ticket,
        'workers_count', tc.workers_count
      ) order by tc.workers_count desc, tc.ticket), '[]'::jsonb)
      from ticket_counts tc
    ),
    'search_signals', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'vertical', ss.vertical,
        'signal', ss.signal,
        'region_name', ss.region_name,
        'state', nullif(ss.state, ''),
        'searches', ss.searches,
        'zero_result_searches', ss.zero_result_searches
      ) order by ss.searches desc, ss.zero_result_searches desc), '[]'::jsonb)
      from (select * from search_signal_summary order by searches desc limit 60) ss
    ),
    'saved_alerts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'vertical', al.vertical,
        'signal', al.signal,
        'region_name', al.region_name,
        'state', nullif(al.state, ''),
        'active_alerts', al.active_alerts
      ) order by al.active_alerts desc), '[]'::jsonb)
      from alert_summary al
    )
  );
$fn$;

grant execute on function public.admin_market_intelligence(int) to service_role;
