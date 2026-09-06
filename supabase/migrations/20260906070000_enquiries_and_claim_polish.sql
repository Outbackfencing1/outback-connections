-- ============================================================
-- Farmer enquiries + claim-approval polish + gate metric + label
-- ============================================================
-- 1. listing_enquiries: a farmer's "get a quote" request against a listing.
--    Farmer PII stored WITH consent (consent_at/ip/ua), never public. Admins
--    read; service role writes. Purged after 12 months (purge_old_enquiries).
-- 2. approve_claim: once a claim is approved the claimant owns the copy, so
--    the row becomes data_source='claimed' (consent version = what they
--    accepted at signup) and the "UNCLAIMED directory listing" boilerplate is
--    removed from the description.
-- 3. admin_gate_metrics: enquiries per week + 30-day total.
-- 4. Category label "Fencing contractor (construction)" -> "Fencing contractor".
--
-- Rollback: drop table public.listing_enquiries; drop function
-- public.purge_old_enquiries(); re-apply 20260814090000 for approve_claim and
-- 20260906050000 for admin_gate_metrics.
-- ============================================================

-- ---------- 1. enquiries ----------
create table if not exists public.listing_enquiries (
  id              uuid primary key default gen_random_uuid(),
  anonymised_id   text not null unique default public.gen_short_id('ENQ'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  listing_id      uuid not null references public.listings(id) on delete cascade,
  business_id     uuid references public.businesses(id) on delete set null,
  vertical        text,
  category_slug   text,
  name            text not null,
  email           text,
  phone           text,
  postcode        text,
  region_state    text,
  message         text not null,
  consent_at      timestamptz not null default now(),
  consent_ip      inet,
  user_agent      text,
  status          text not null default 'new'
                    check (status in ('new', 'forwarded', 'closed', 'spam')),
  forwarded_at    timestamptz,
  forwarded_via   text,
  notes           text,
  constraint listing_enquiries_contact_required check (email is not null or phone is not null)
);

create index if not exists idx_listing_enquiries_created on public.listing_enquiries (created_at desc);
create index if not exists idx_listing_enquiries_listing on public.listing_enquiries (listing_id);
create index if not exists idx_listing_enquiries_status on public.listing_enquiries (status, created_at desc);
create index if not exists idx_listing_enquiries_ip_recent on public.listing_enquiries (consent_ip, created_at desc);

comment on table public.listing_enquiries is
  'Farmer -> business enquiries ("get a quote"). Farmer PII with consent; admins read, service role writes; purged after 12 months.';

alter table public.listing_enquiries enable row level security;

drop policy if exists "Service role manages enquiries" on public.listing_enquiries;
create policy "Service role manages enquiries"
  on public.listing_enquiries for all to service_role
  using (true) with check (true);

drop policy if exists "Admins read enquiries" on public.listing_enquiries;
create policy "Admins read enquiries"
  on public.listing_enquiries for select to authenticated
  using (public.current_user_is_admin());

revoke all on public.listing_enquiries from anon, authenticated;
grant select on public.listing_enquiries to authenticated;
grant all on public.listing_enquiries to service_role;

create or replace function public.purge_old_enquiries()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  n integer;
begin
  delete from public.listing_enquiries where created_at < now() - interval '12 months';
  get diagnostics n = row_count;
  return n;
end;
$fn$;
revoke all on function public.purge_old_enquiries() from public, anon, authenticated;
grant execute on function public.purge_old_enquiries() to service_role;

-- ---------- 2. approve_claim ----------
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
begin
  if not exists (
    select 1 from public.user_profiles p
     where p.user_id = p_reviewed_by and p.is_admin = true
  ) then
    raise exception 'approve_claim: reviewer is not an admin';
  end if;

  select business_id, claimant_user_id, status
    into v_business, v_claimant, v_status
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

  -- Lock every currently linked ownership row before validating it. A claim
  -- must fail closed when the business graph is already inconsistent.
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

  if v_biz_claim = 'unclaimed' then
    update public.businesses
       set claim_status = 'claimed', claimed_by = v_claimant,
           claimed_at = now(), last_verified_at = now()
     where id = v_business;
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (v_business, v_claimant, 'owner')
  on conflict (business_id, user_id) do update set role = 'owner';

  -- Make ownerless listings attached to the claimed business manageable in
  -- the claimant's existing dashboard/edit flow. Only revive a genuinely
  -- expired row: moderation/deletion/closure/draft states are preserved.
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
             then now() + interval '30 days'
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

  -- The claimant now owns the copy. Record provenance as claimed, with the
  -- consent version they accepted at signup (falls back to the current
  -- policy), and drop the "UNCLAIMED directory listing" boilerplate.
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

  -- Claim approval is the authoritative joined signal for the outreach queue.
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

  -- Close competing requests so the admin queue cannot later add a second
  -- owner to the same claimed business.
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

-- ---------- 3. gate metrics: enquiries ----------
create or replace function public.admin_gate_metrics(p_weeks int default 8)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $fn$
  with weeks as (
    select generate_series(
      date_trunc('week', now()) - make_interval(weeks => greatest(p_weeks, 1) - 1),
      date_trunc('week', now()),
      interval '1 week'
    ) as wk
  ),
  searches as (
    select s.created_at, s.session_id,
           (coalesce(s.query_text, '') <> ''
             or exists (
               select 1 from jsonb_each_text(coalesce(s.filters, '{}'::jsonb)) f
                where f.value is not null and f.value <> ''
             )) as is_search
      from public.search_queries s
     where s.is_bot = false
  )
  select jsonb_build_object(
    'weeks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'week_start', to_char(w.wk, 'YYYY-MM-DD'),
        'human_searches', (select count(*) from searches s where s.is_search and s.created_at >= w.wk and s.created_at < w.wk + interval '1 week'),
        'human_browse_loads', (select count(*) from searches s where s.created_at >= w.wk and s.created_at < w.wk + interval '1 week'),
        'human_sessions', (select count(distinct s.session_id) from searches s where s.session_id is not null and s.created_at >= w.wk and s.created_at < w.wk + interval '1 week'),
        'claims', (select count(*) from public.claims c where c.created_at >= w.wk and c.created_at < w.wk + interval '1 week'),
        'first_party_posts', (select count(*) from public.listings l where l.data_source in ('manual','claimed') and l.user_id is not null and l.canonical_listing_id is null and l.created_at >= w.wk and l.created_at < w.wk + interval '1 week'),
        'signups', (select count(*) from public.user_profiles p where p.created_at >= w.wk and p.created_at < w.wk + interval '1 week'),
        'listing_views', (select count(*) from public.events e where e.is_bot = false and e.event_type = 'listing_view' and e.created_at >= w.wk and e.created_at < w.wk + interval '1 week'),
        'contact_reveals', (select count(*) from public.events e where e.event_type = 'contact_reveal' and e.created_at >= w.wk and e.created_at < w.wk + interval '1 week'),
        'source_clicks', (select count(*) from public.events e where e.is_bot = false and e.event_type = 'source_click' and e.created_at >= w.wk and e.created_at < w.wk + interval '1 week'),
        'enquiries', (select count(*) from public.listing_enquiries q where q.status <> 'spam' and q.created_at >= w.wk and q.created_at < w.wk + interval '1 week'),
        'directory_adds', (select count(*) from public.listings l where l.data_source = 'scraped' and l.created_at >= w.wk and l.created_at < w.wk + interval '1 week')
      ) order by w.wk), '[]'::jsonb)
      from weeks w
    ),
    'gate', jsonb_build_object(
      'target_searches_per_week', 25,
      'target_claims_30d', 5,
      'target_first_party_posts_30d', 10,
      'human_searches_7d', (select count(*) from searches s where s.is_search and s.created_at > now() - interval '7 days'),
      'claims_30d', (select count(*) from public.claims where created_at > now() - interval '30 days'),
      'first_party_posts_30d', (select count(*) from public.listings where data_source in ('manual','claimed') and user_id is not null and canonical_listing_id is null and created_at > now() - interval '30 days'),
      'enquiries_30d', (select count(*) from public.listing_enquiries where status <> 'spam' and created_at > now() - interval '30 days'),
      'bot_share_30d_pct', (
        select case when count(*) > 0 then round(100.0 * count(*) filter (where is_bot) / count(*))::int else 0 end
          from public.search_queries where created_at > now() - interval '30 days'
      )
    )
  );
$fn$;
revoke all on function public.admin_gate_metrics(int) from public, anon, authenticated;
grant execute on function public.admin_gate_metrics(int) to service_role;

-- ---------- 4. label ----------
update public.categories
   set label = 'Fencing contractor'
 where country_code = 'AU' and pillar = 'services' and slug = 'fencing-contractor';
