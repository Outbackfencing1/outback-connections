-- ============================================================
-- Contractor outreach workspace + admin/claim hardening
-- ============================================================
-- Purpose:
--   * Track Ali's current outreach state on the existing business record.
--   * Preserve an append-only contact/action history.
--   * Expose one admin-only, query-friendly fencing-contractor view.
--   * Keep all writes atomic through an admin-checked RPC.
--   * Close two pre-existing privilege/claim-state holes discovered while
--     building the workspace.
--
-- No scraped contact detail is copied into a publicly readable table. The
-- admin view reads it from private listing_sources.raw_payload at query time.
-- ============================================================

-- ---------- Reusable, recursion-safe admin predicate ----------
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce(auth.role() = 'service_role', false)
    or exists (
      select 1
        from public.user_profiles p
       where p.user_id = auth.uid()
         and p.is_admin = true
    );
$function$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated, service_role;

-- SECURITY: the previous own-row UPDATE policy allowed a signed-in user to
-- update every column on their row, including is_admin. Current production
-- profile/consent writes already use the server-side service client, so remove
-- this broad direct-write path.
drop policy if exists "Users update own profile" on public.user_profiles;

-- The baseline snapshot granted DML as well as SELECT on this simple,
-- automatically-updatable SECURITY DEFINER view. Keep the intended public
-- display-name read, but remove its RLS-bypassing INSERT/UPDATE/DELETE surface.
revoke all on public.user_profiles_public from anon, authenticated;
grant select on public.user_profiles_public to anon, authenticated;

-- Admins need all business/listing states in the internal queue, including an
-- expired listing that still represents a valid prospect.
drop policy if exists "Admins read all businesses" on public.businesses;
create policy "Admins read all businesses"
  on public.businesses for select to authenticated
  using (public.current_user_is_admin());

drop policy if exists "Admins read all listings" on public.listings;
create policy "Admins read all listings"
  on public.listings for select to authenticated
  using (public.current_user_is_admin());

-- The original listing_sources migration created admin/service RLS policies
-- but relied on project default privileges. The security-invoker outreach view
-- needs the authenticated caller to hold table SELECT before RLS can permit an
-- admin row. Make that dependency explicit while keeping all raw payloads
-- unavailable to anon and writes service-role-only.
revoke all on public.listing_sources from anon, authenticated;
grant select on public.listing_sources to authenticated;
grant all on public.listing_sources to service_role;


-- ---------- Current state (one row per existing business) ----------
create table if not exists public.business_outreach (
  business_id          uuid primary key
                       references public.businesses(id) on delete cascade,
  outreach_status      text not null default 'not_contacted'
                       check (outreach_status in (
                         'not_contacted', 'attempted', 'contacted',
                         'interested', 'invite_sent', 'follow_up', 'joined',
                         'not_interested', 'invalid_duplicate', 'do_not_contact'
                       )),
  -- V1 assignee is deliberately a label (for example "Ali"), not an auth
  -- identity. Outreach operators do not need a platform account UUID merely
  -- to appear in a work queue.
  assigned_to          text check (assigned_to is null or char_length(assigned_to) <= 200),
  last_contact_method  text
                       check (last_contact_method is null or last_contact_method in (
                         'phone', 'email', 'sms', 'whatsapp', 'other'
                       )),
  last_contacted_at    timestamptz,
  next_follow_up_at    timestamptz,
  latest_note          text check (latest_note is null or char_length(latest_note) <= 5000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users(id) on delete set null
);

create index if not exists idx_business_outreach_status
  on public.business_outreach (outreach_status);
create index if not exists idx_business_outreach_assigned
  on public.business_outreach (assigned_to, outreach_status);
create index if not exists idx_business_outreach_follow_up
  on public.business_outreach (next_follow_up_at)
  where next_follow_up_at is not null;

drop trigger if exists trg_business_outreach_updated_at on public.business_outreach;
create trigger trg_business_outreach_updated_at
  before update on public.business_outreach
  for each row execute function public.set_updated_at();

alter table public.business_outreach enable row level security;

-- Do not depend on project-level default privileges: authenticated admins may
-- read, while every write remains RPC/service-role only.
revoke all on public.business_outreach from anon, authenticated;
grant select on public.business_outreach to authenticated;
grant all on public.business_outreach to service_role;

drop policy if exists "Admins read business outreach" on public.business_outreach;
create policy "Admins read business outreach"
  on public.business_outreach for select to authenticated
  using (public.current_user_is_admin());

drop policy if exists "Service role manages business outreach" on public.business_outreach;
create policy "Service role manages business outreach"
  on public.business_outreach for all to service_role
  using (true) with check (true);


-- ---------- Append-only action/contact history ----------
create table if not exists public.business_outreach_events (
  id                   uuid primary key default gen_random_uuid(),
  business_id          uuid not null
                       references public.businesses(id) on delete cascade,
  actor_user_id        uuid references auth.users(id) on delete set null,
  action               text not null check (action in (
                         'called', 'emailed', 'sms', 'whatsapp', 'note',
                         'status_changed', 'follow_up_set', 'assigned', 'joined'
                       )),
  contact_method       text check (contact_method is null or contact_method in (
                         'phone', 'email', 'sms', 'whatsapp', 'other'
                       )),
  outreach_status      text check (outreach_status is null or outreach_status in (
                         'not_contacted', 'attempted', 'contacted',
                         'interested', 'invite_sent', 'follow_up', 'joined',
                         'not_interested', 'invalid_duplicate', 'do_not_contact'
                       )),
  note                 text check (note is null or char_length(note) <= 5000),
  next_follow_up_at    timestamptz,
  assigned_to          text check (assigned_to is null or char_length(assigned_to) <= 200),
  created_at           timestamptz not null default now()
);

create index if not exists idx_business_outreach_events_business_created
  on public.business_outreach_events (business_id, created_at desc);
create index if not exists idx_business_outreach_events_actor_created
  on public.business_outreach_events (actor_user_id, created_at desc);

alter table public.business_outreach_events enable row level security;

revoke all on public.business_outreach_events from anon, authenticated;
grant select on public.business_outreach_events to authenticated;
grant all on public.business_outreach_events to service_role;

drop policy if exists "Admins read business outreach events" on public.business_outreach_events;
create policy "Admins read business outreach events"
  on public.business_outreach_events for select to authenticated
  using (public.current_user_is_admin());

drop policy if exists "Service role manages business outreach events" on public.business_outreach_events;
create policy "Service role manages business outreach events"
  on public.business_outreach_events for all to service_role
  using (true) with check (true);


-- ---------- Atomic admin write path ----------
create or replace function public.record_contractor_outreach(
  p_business_id uuid,
  p_action text,
  p_status text default null,
  p_contact_method text default null,
  p_note text default null,
  p_next_follow_up_at timestamptz default null,
  p_assigned_to text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_status text;
  v_method text;
  v_is_contact boolean;
  v_row public.business_outreach%rowtype;
begin
  if not public.current_user_is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  -- service_role has no auth.uid(); retain an audit FK when the caller passes
  -- through an authenticated session, otherwise leave the actor nullable.

  -- The internal contractor workspace must not be usable as a general-purpose
  -- business CRM RPC merely by guessing an arbitrary business UUID.
  if not exists (
    select 1
      from public.listings l
      join public.categories c on c.id = l.category_id
      left join lateral (
        select s.raw_payload
          from public.listing_sources s
         where s.listing_id = l.id
         order by s.last_seen_at desc, s.created_at desc
         limit 1
      ) src on true
     join public.businesses b on b.id = l.business_id
     where l.business_id = p_business_id
       and b.status = 'active'
       and (
         c.slug in ('fencing-contractor', 'fencing-labour')
         or lower(coalesce(b.trading_name, '') || ' ' || coalesce(b.legal_name, '')) like '%fenc%'
         or lower(
           coalesce(src.raw_payload ->> 'type', '') || ' '
           || coalesce(src.raw_payload ->> 'subtypes', '')
         ) like '%fenc%'
       )
  ) then
    raise exception 'Business is not in the contractor outreach workspace'
      using errcode = 'P0002';
  end if;

  if p_action is null or p_action not in (
    'called', 'emailed', 'sms', 'whatsapp', 'note',
    'status_changed', 'follow_up_set', 'assigned', 'joined'
  ) then
    raise exception 'Invalid outreach action';
  end if;

  if p_status is not null and p_status not in (
    'not_contacted', 'attempted', 'contacted', 'interested', 'invite_sent',
    'follow_up', 'joined', 'not_interested', 'invalid_duplicate', 'do_not_contact'
  ) then
    raise exception 'Invalid outreach status';
  end if;

  if p_contact_method is not null and p_contact_method not in (
    'phone', 'email', 'sms', 'whatsapp', 'other'
  ) then
    raise exception 'Invalid contact method';
  end if;

  if p_note is not null and char_length(btrim(p_note)) > 5000 then
    raise exception 'Note is too long';
  end if;

  v_is_contact := p_action in ('called', 'emailed', 'sms', 'whatsapp');
  v_method := coalesce(
    p_contact_method,
    case p_action
      when 'called' then 'phone'
      when 'emailed' then 'email'
      when 'sms' then 'sms'
      when 'whatsapp' then 'whatsapp'
      else null
    end
  );
  v_status := coalesce(
    p_status,
    case
      when p_action = 'joined' then 'joined'
      when v_is_contact then 'attempted'
      else null
    end
  );

  if p_assigned_to is not null and char_length(btrim(p_assigned_to)) > 200 then
    raise exception 'Assignee label is too long';
  end if;

  insert into public.business_outreach as existing (
    business_id, outreach_status, assigned_to,
    last_contact_method, last_contacted_at, next_follow_up_at,
    latest_note, updated_by
  ) values (
    p_business_id,
    coalesce(v_status, 'not_contacted'),
    case when p_action = 'assigned' then nullif(btrim(p_assigned_to), '') else null end,
    case when v_is_contact then v_method else null end,
    case when v_is_contact then now() else null end,
    case when p_action = 'follow_up_set' or p_next_follow_up_at is not null
         then p_next_follow_up_at else null end,
    nullif(btrim(p_note), ''),
    v_actor
  )
  on conflict (business_id) do update set
    outreach_status = case
      when p_status is not null then p_status
      when p_action = 'joined' then 'joined'
      when v_is_contact and existing.outreach_status = 'not_contacted' then 'attempted'
      else existing.outreach_status
    end,
    assigned_to = case when p_action = 'assigned'
                       then nullif(btrim(p_assigned_to), '') else existing.assigned_to end,
    last_contact_method = case when v_is_contact
                               then v_method else existing.last_contact_method end,
    last_contacted_at = case when v_is_contact
                             then now() else existing.last_contacted_at end,
    next_follow_up_at = case
      when p_action = 'follow_up_set' or p_next_follow_up_at is not null
        then p_next_follow_up_at
      else existing.next_follow_up_at
    end,
    latest_note = coalesce(nullif(btrim(p_note), ''), existing.latest_note),
    updated_by = v_actor
  returning * into v_row;

  insert into public.business_outreach_events (
    business_id, actor_user_id, action, contact_method, outreach_status,
    note, next_follow_up_at, assigned_to
  ) values (
    p_business_id, v_actor, p_action, v_method, v_row.outreach_status,
    nullif(btrim(p_note), ''), v_row.next_follow_up_at, v_row.assigned_to
  );

  return jsonb_build_object(
    'business_id', v_row.business_id,
    'outreach_status', v_row.outreach_status,
    'assigned_to', v_row.assigned_to,
    'assigned_name', v_row.assigned_to,
    'last_contacted_at', v_row.last_contacted_at,
    'next_follow_up_at', v_row.next_follow_up_at,
    'latest_note', v_row.latest_note,
    'updated_at', v_row.updated_at
  );
end;
$function$;

revoke all on function public.record_contractor_outreach(
  uuid, text, text, text, text, timestamptz, text
) from public;
grant execute on function public.record_contractor_outreach(
  uuid, text, text, text, text, timestamptz, text
) to authenticated, service_role;


-- ---------- Admin-facing fencing-contractor projection ----------
-- One preferred listing per business. The legacy jobs scrape classified a
-- "fencing contractor" as fencing-labour; newer service imports should use
-- fencing-contractor. Both are deliberately included.
create or replace view public.admin_contractor_outreach
with (security_invoker = true)
as
select
  b.id as business_id,
  coalesce(nullif(b.trading_name, ''), nullif(b.legal_name, ''), '(Unnamed business)') as business_name,
  coalesce(
    nullif(l.metadata ->> 'suburb', ''),
    nullif(l.raw_payload ->> 'city', ''),
    nullif(l.raw_payload ->> 'borough', '')
  ) as suburb,
  coalesce(nullif(b.postcode, ''), nullif(l.postcode, '')) as postcode,
  coalesce(nullif(b.state_code, ''), nullif(l.state, '')) as state_code,
  coalesce(
    nullif(b.contact_phone, ''),
    nullif(l.raw_payload ->> 'phone', ''),
    nullif(l.raw_payload ->> 'phone_1', ''),
    nullif(l.raw_payload ->> 'phone_number', ''),
    nullif(l.raw_payload ->> 'international_phone_number', ''),
    nullif(l.raw_payload ->> 'formatted_phone_number', ''),
    nullif(l.raw_payload -> 'phones' ->> 0, '')
  ) as contact_phone,
  coalesce(
    nullif(lower(b.contact_email), ''),
    nullif(lower(l.raw_payload ->> 'email'), ''),
    nullif(lower(l.raw_payload ->> 'email_1'), ''),
    nullif(lower(l.raw_payload -> 'emails' ->> 0), ''),
    nullif(lower(l.raw_payload #>> '{emails_and_contacts,emails,0}'), '')
  ) as contact_email,
  coalesce(
    nullif(b.website_url, ''),
    nullif(l.raw_payload ->> 'site', ''),
    nullif(l.raw_payload ->> 'website', '')
  ) as website_url,
  coalesce(nullif(l.source_platform, ''), nullif(b.source_platform, ''), l.raw_source_platform) as source_platform,
  coalesce(nullif(l.source_url, ''), nullif(b.source_url, ''), l.raw_source_url) as source_url,
  b.claim_status,
  l.id as listing_id,
  l.slug as listing_slug,
  l.kind as listing_kind,
  l.status as listing_status,
  l.category_id,
  l.category_slug,
  l.category_label,
  case
    -- A claim is the authoritative joined signal, including claims approved
    -- before this outreach table existed.
    when b.claim_status <> 'unclaimed' then 'joined'
    else coalesce(o.outreach_status, 'not_contacted')
  end as outreach_status,
  o.assigned_to,
  o.assigned_to as assigned_name,
  o.last_contacted_at,
  case
    when b.claim_status <> 'unclaimed' then null
    else o.next_follow_up_at
  end as next_follow_up_at,
  o.latest_note,
  o.updated_at
from public.businesses b
join lateral (
  select
    candidate.id,
    candidate.slug,
    candidate.kind,
    candidate.status,
    candidate.category_id,
    candidate.postcode,
    candidate.state,
    candidate.source_platform,
    candidate.source_url,
    candidate.metadata,
    c.slug as category_slug,
    c.label as category_label,
    candidate_src.source_platform as raw_source_platform,
    candidate_src.source_url as raw_source_url,
    candidate_src.raw_payload
  from public.listings candidate
  join public.categories c on c.id = candidate.category_id
  left join lateral (
    select s.source_platform, s.source_url, s.raw_payload
      from public.listing_sources s
     where s.listing_id = candidate.id
     order by s.last_seen_at desc, s.created_at desc
     limit 1
  ) candidate_src on true
  where candidate.business_id = b.id
    and (
      c.slug in ('fencing-contractor', 'fencing-labour')
      or lower(coalesce(b.trading_name, '') || ' ' || coalesce(b.legal_name, '')) like '%fenc%'
      or lower(
        coalesce(candidate_src.raw_payload ->> 'type', '') || ' '
        || coalesce(candidate_src.raw_payload ->> 'subtypes', '')
      ) like '%fenc%'
    )
  order by
    (c.slug in ('fencing-contractor', 'fencing-labour')) desc,
    (lower(
      coalesce(candidate_src.raw_payload ->> 'type', '') || ' '
      || coalesce(candidate_src.raw_payload ->> 'subtypes', '')
    ) like '%fenc%') desc,
    (candidate.status = 'active' and candidate.expires_at > now()) desc,
    candidate.updated_at desc,
    candidate.created_at desc
  limit 1
) l on true
left join public.business_outreach o on o.business_id = b.id
where
  public.current_user_is_admin()
  and b.status = 'active';

revoke all on public.admin_contractor_outreach from public, anon;
grant select on public.admin_contractor_outreach to authenticated, service_role;


-- ---------- Header counts ----------
create or replace function public.admin_contractor_outreach_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if not public.current_user_is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  -- Query the base relations directly. A SECURITY DEFINER function executing
  -- as the migration owner must not depend on caller-sensitive RLS behaviour
  -- inside a security_invoker view.
  select jsonb_build_object(
    'total', count(*),
    'not_contacted', count(*) filter (
      where b.claim_status = 'unclaimed'
        and coalesce(o.outreach_status, 'not_contacted') = 'not_contacted'
    ),
    'contacted', count(*) filter (where (
      case
        when b.claim_status <> 'unclaimed' then 'joined'
        else coalesce(o.outreach_status, 'not_contacted')
      end
    ) in (
      'attempted', 'contacted', 'interested', 'invite_sent', 'follow_up', 'joined',
      'not_interested', 'do_not_contact'
    )),
    'interested', count(*) filter (
      where b.claim_status = 'unclaimed' and o.outreach_status = 'interested'
    ),
    'invited', count(*) filter (
      where b.claim_status = 'unclaimed' and o.outreach_status = 'invite_sent'
    ),
    'joined', count(*) filter (where o.outreach_status = 'joined' or b.claim_status <> 'unclaimed'),
    'follow_ups_due', count(*) filter (
      where b.claim_status = 'unclaimed'
        and o.next_follow_up_at is not null
        and o.next_follow_up_at <= now()
        and coalesce(o.outreach_status, 'not_contacted') not in (
          'joined', 'not_interested', 'invalid_duplicate', 'do_not_contact'
        )
    )
  )
  into v_result
  from public.businesses b
  left join public.business_outreach o on o.business_id = b.id
  where b.status = 'active'
    and exists (
    select 1
      from public.listings l
      join public.categories c on c.id = l.category_id
      left join lateral (
        select s.raw_payload
          from public.listing_sources s
         where s.listing_id = l.id
         order by s.last_seen_at desc, s.created_at desc
         limit 1
      ) src on true
     where l.business_id = b.id
       and (
         c.slug in ('fencing-contractor', 'fencing-labour')
         or lower(coalesce(b.trading_name, '') || ' ' || coalesce(b.legal_name, '')) like '%fenc%'
         or lower(
           coalesce(src.raw_payload ->> 'type', '') || ' '
           || coalesce(src.raw_payload ->> 'subtypes', '')
         ) like '%fenc%'
       )
  );

  return v_result;
end;
$function$;

revoke all on function public.admin_contractor_outreach_counts() from public;
grant execute on function public.admin_contractor_outreach_counts() to authenticated, service_role;


-- ---------- Claim-flow hardening ----------
-- A claimant may only create a genuinely pending claim for themselves, on an
-- active and still-unclaimed business. Review fields cannot be self-supplied.
drop policy if exists "Users file own claims" on public.claims;
create policy "Users file own claims"
  on public.claims for insert to authenticated
  with check (
    auth.uid() = claimant_user_id
    and status = 'pending'
    and method in ('email_domain', 'phone_otp', 'abn_match', 'evidence_upload', 'admin_approval')
    and reviewed_at is null
    and reviewed_by is null
    and notes is null
    and exists (
      select 1
        from public.businesses b
       where b.id = business_id
         and b.status = 'active'
         and b.claim_status = 'unclaimed'
    )
  );

-- Mirrors the app's duplicate guard at the database boundary.
-- Preflight the partial unique index so an unexpected legacy duplicate yields
-- a targeted error (and no migration change, because migrations are atomic)
-- instead of a generic CREATE INDEX failure. Review/merge those rows manually;
-- this migration must never guess which claim evidence to discard.
do $migration$
declare
  v_duplicate_groups integer;
begin
  select count(*)
    into v_duplicate_groups
    from (
      select business_id, claimant_user_id
        from public.claims
       where status in ('pending', 'approved')
       group by business_id, claimant_user_id
      having count(*) > 1
    ) duplicates;

  if v_duplicate_groups > 0 then
    raise exception using
      errcode = '23505',
      message = format(
        'Cannot install uq_claims_business_claimant_active: %s duplicate active claim group(s) exist. Run the documented preflight query and resolve them first.',
        v_duplicate_groups
      );
  end if;
end;
$migration$;

create unique index if not exists uq_claims_business_claimant_active
  on public.claims (business_id, claimant_user_id)
  where status in ('pending', 'approved');

create or replace function public.approve_claim(p_claim_id uuid, p_reviewed_by uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_business uuid;
  v_claimant uuid;
  v_status text;
  v_biz_claim text;
  v_claimed_by uuid;
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
  -- must fail closed when the business graph is already inconsistent: silently
  -- skipping somebody else's listing or adding a second owner would make the
  -- approval result misleading and could transfer control on a later update.
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
  -- the claimant's existing dashboard/edit flow. The fail-closed checks above
  -- have already ruled out listings owned by somebody else. Only revive a
  -- genuinely expired row: moderation/deletion/closure/draft states are
  -- preserved. The
  -- active-with-past-expiry branch covers the small window before the daily
  -- expiry cron changes status to `expired`.
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
     -- A business claim may attach previously ownerless directory rows, but it
     -- must never silently transfer a listing already owned by someone else.
     and (user_id is null or user_id = v_claimant);

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

create or replace function public.reject_claim(
  p_claim_id uuid,
  p_reviewed_by uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_status text;
begin
  if not exists (
    select 1 from public.user_profiles p
     where p.user_id = p_reviewed_by and p.is_admin = true
  ) then
    raise exception 'reject_claim: reviewer is not an admin';
  end if;

  select status into v_status
    from public.claims
   where id = p_claim_id
   for update;
  if v_status is null then
    raise exception 'reject_claim: claim % not found', p_claim_id;
  end if;
  if v_status <> 'pending' then
    raise exception 'reject_claim: claim is % (must be pending)', v_status;
  end if;

  update public.claims
     set status = 'rejected', reviewed_at = now(), reviewed_by = p_reviewed_by,
         notes = coalesce(nullif(btrim(p_note), ''), notes)
   where id = p_claim_id;

  return jsonb_build_object('claim_id', p_claim_id, 'status', 'rejected');
end;
$function$;

revoke all on function public.approve_claim(uuid, uuid) from public;
grant execute on function public.approve_claim(uuid, uuid) to service_role;
revoke all on function public.reject_claim(uuid, uuid, text) from public;
grant execute on function public.reject_claim(uuid, uuid, text) to service_role;

-- ============================================================
-- ROLLBACK (manual; data-destructive for outreach history):
--   drop function if exists public.admin_contractor_outreach_counts();
--   drop view if exists public.admin_contractor_outreach;
--   drop function if exists public.record_contractor_outreach(uuid,text,text,text,text,timestamptz,text);
--   drop table if exists public.business_outreach_events;
--   drop table if exists public.business_outreach;
-- The security and claim hardening should normally be left in place.
-- ============================================================
