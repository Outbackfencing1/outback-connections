-- ============================================================
-- Outreach operator access, identity assignment and suppression
-- ============================================================
-- Forward-only migration created with Supabase CLI, then sequenced after the
-- existing 20260814110000 migration. The implementation is appended below.

-- A non-exposed schema keeps privileged helper functions out of PostgREST's
-- public RPC surface. Authenticated callers only receive EXECUTE on the exact
-- helpers needed by RLS and the security-invoker queue view.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

-- Modernise the existing predicate without auth.role(), which Supabase has
-- deprecated. The JWT role claim is issued by Supabase Auth (not editable
-- user_metadata), while application admin authority remains in user_profiles.
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce(auth.jwt() ->> 'role' = 'service_role', false)
    or exists (
      select 1
        from public.user_profiles p
       where p.user_id = auth.uid()
         and p.is_admin = true
    );
$function$;

revoke all on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_admin() to authenticated, service_role;

-- Narrow staff authority. A row here grants outreach work only; it never
-- changes user_profiles.is_admin and therefore cannot expose moderation,
-- imports, lockdown controls or other admin areas.
create table if not exists public.outreach_staff (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  is_active     boolean not null default true,
  granted_at    timestamptz not null default now(),
  granted_by    uuid references auth.users(id) on delete set null,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint outreach_staff_revocation_consistent check (
    (is_active and revoked_at is null)
    or (not is_active and revoked_at is not null)
  )
);

create index if not exists idx_outreach_staff_active
  on public.outreach_staff (is_active, updated_at desc);

drop trigger if exists trg_outreach_staff_updated_at on public.outreach_staff;
create trigger trg_outreach_staff_updated_at
  before update on public.outreach_staff
  for each row execute function public.set_updated_at();

alter table public.outreach_staff enable row level security;
revoke all on table public.outreach_staff from public, anon, authenticated;
grant all on table public.outreach_staff to service_role;

drop policy if exists "Service role manages outreach staff" on public.outreach_staff;
create policy "Service role manages outreach staff"
  on public.outreach_staff for all to service_role
  using (true) with check (true);

create or replace function public.current_user_can_outreach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    public.current_user_is_admin()
    or exists (
      select 1
        from public.outreach_staff s
       where s.user_id = auth.uid()
         and s.is_active = true
    );
$function$;

revoke all on function public.current_user_can_outreach() from public, anon;
grant execute on function public.current_user_can_outreach() to authenticated, service_role;

-- Exact staff roster for the full-admin Team access page. Revoked rows remain
-- visible for audit history; the UI filters is_active for its current roster.
create or replace function public.admin_list_outreach_staff()
returns table (
  user_id uuid,
  email text,
  display_name text,
  is_active boolean,
  granted_at timestamptz,
  granted_by uuid,
  revoked_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.current_user_is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select
    s.user_id,
    u.email::text,
    p.display_name,
    s.is_active,
    s.granted_at,
    s.granted_by,
    s.revoked_at,
    s.updated_at
  from public.outreach_staff s
  join auth.users u on u.id = s.user_id
  left join public.user_profiles p on p.user_id = s.user_id
  order by s.is_active desc, lower(coalesce(p.display_name, u.email, '')), s.user_id;
end;
$function$;

revoke all on function public.admin_list_outreach_staff() from public, anon;
grant execute on function public.admin_list_outreach_staff() to authenticated, service_role;

-- One exact-email mutation avoids a user-directory/search endpoint. Full
-- admins cannot be deactivated or redundantly managed through this narrow role.
create or replace function public.admin_set_outreach_staff(
  p_email text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user_id uuid;
  v_display_name text;
  v_row public.outreach_staff%rowtype;
  v_released integer := 0;
begin
  if not public.current_user_is_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if v_email = '' or char_length(v_email) > 320 or p_active is null then
    raise exception 'A valid email and active flag are required'
      using errcode = '22023';
  end if;

  select u.id, p.display_name
    into v_user_id, v_display_name
    from auth.users u
    left join public.user_profiles p on p.user_id = u.id
   where lower(u.email) = v_email
   limit 1;

  if v_user_id is null then
    raise exception 'No registered account matches that email'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_profiles p
     where p.user_id = v_user_id and p.is_admin = true
  ) then
    raise exception 'Full admins already have outreach access and cannot be managed here'
      using errcode = '42501';
  end if;

  if p_active then
    insert into public.outreach_staff as existing (
      user_id, is_active, granted_at, granted_by, revoked_at
    ) values (
      v_user_id, true, now(), v_actor, null
    )
    on conflict (user_id) do update set
      is_active = true,
      granted_at = case when existing.is_active then existing.granted_at else now() end,
      granted_by = case when existing.is_active then existing.granted_by else v_actor end,
      revoked_at = null
    returning * into v_row;
  else
    update public.outreach_staff
       set is_active = false,
           revoked_at = coalesce(revoked_at, now())
     where user_id = v_user_id
    returning * into v_row;

    -- Idempotent revoke of a registered user who was never granted access.
    if not found then
      return jsonb_build_object(
        'user_id', v_user_id,
        'email', v_email,
        'display_name', v_display_name,
        'is_active', false,
        'granted_at', null,
        'granted_by', null,
        'revoked_at', null,
        'updated_at', null
      );
    end if;

    -- Revocation must not strand work in an inactive assignee's private
    -- "Mine" queue. Release every row and preserve one audit event per row in
    -- the same transaction as the access change.
    with released as (
      update public.business_outreach
         set assigned_user_id = null,
             assigned_to = null,
             updated_by = v_actor
       where assigned_user_id = v_user_id
      returning business_id, outreach_status, next_follow_up_at
    ), audited as (
      insert into public.business_outreach_events (
        business_id, actor_user_id, action, outcome, outreach_status,
        note, next_follow_up_at, assigned_to, assigned_user_id
      )
      select
        r.business_id,
        v_actor,
        'assigned',
        'unassigned',
        r.outreach_status,
        'Automatically unassigned because outreach access was revoked.',
        r.next_follow_up_at,
        null,
        null
      from released r
      returning 1
    )
    select count(*) into v_released from audited;
  end if;

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'email', v_email,
    'display_name', v_display_name,
    'is_active', v_row.is_active,
    'granted_at', v_row.granted_at,
    'granted_by', v_row.granted_by,
    'revoked_at', v_row.revoked_at,
    'updated_at', v_row.updated_at,
    'released_assignments', v_released
  );
end;
$function$;

revoke all on function public.admin_set_outreach_staff(text, boolean) from public, anon;
grant execute on function public.admin_set_outreach_staff(text, boolean)
  to authenticated, service_role;

-- RLS helper: deliberately returns only a boolean, checks caller authority
-- internally, and runs outside the exposed schema. It permits contractor-only
-- base-row reads without granting outreach staff the private raw source table.
create or replace function private.is_contractor_outreach_business(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.current_user_can_outreach()
    and exists (
      select 1
        from public.businesses b
        join public.listings l on l.business_id = b.id
        join public.categories c on c.id = l.category_id
        left join lateral (
          select s.raw_payload
            from public.listing_sources s
           where s.listing_id = l.id
           order by s.last_seen_at desc, s.created_at desc
           limit 1
        ) src on true
       where b.id = p_business_id
         and b.status = 'active'
         and (
           c.slug in ('fencing-contractor', 'fencing-labour')
           or lower(coalesce(b.trading_name, '') || ' ' || coalesce(b.legal_name, '')) like '%fenc%'
           or lower(
             coalesce(src.raw_payload ->> 'type', '') || ' '
             || coalesce(src.raw_payload ->> 'subtypes', '')
           ) like '%fenc%'
         )
    );
$function$;

revoke all on function private.is_contractor_outreach_business(uuid) from public, anon;
grant execute on function private.is_contractor_outreach_business(uuid)
  to authenticated, service_role;

-- Operators can resolve assignment labels but never account emails. Full
-- admins and active staff are assignable; the outcome RPC further restricts a
-- non-admin operator to assigning only themselves.
create or replace function public.outreach_list_assignable_staff()
returns table (user_id uuid, display_name text, is_current_user boolean)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.current_user_can_outreach() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return query
  select
    p.user_id,
    coalesce(nullif(btrim(p.display_name), ''), 'Outreach team member') as display_name,
    p.user_id = auth.uid() as is_current_user
  from public.user_profiles p
  left join public.outreach_staff s on s.user_id = p.user_id
  where p.is_admin = true or s.is_active = true
  order by (p.user_id = auth.uid()) desc, lower(coalesce(p.display_name, '')), p.user_id;
end;
$function$;

revoke all on function public.outreach_list_assignable_staff() from public, anon;
grant execute on function public.outreach_list_assignable_staff()
  to authenticated, service_role;

-- ---------- Identity-based state, outcomes and idempotency ----------
alter table public.business_outreach
  add column if not exists assigned_user_id uuid
  references auth.users(id) on delete set null;

create index if not exists idx_business_outreach_assigned_user
  on public.business_outreach (assigned_user_id, outreach_status);

-- sequence_complete means the planned sequence ended without a reply. It is
-- truthful, distinct from disinterest/DNC, and may only reopen on an inbound
-- reply. It is excluded from active work and blocks further outbound contact.
alter table public.business_outreach
  drop constraint if exists business_outreach_outreach_status_check;
alter table public.business_outreach
  add constraint business_outreach_outreach_status_check check (
    outreach_status in (
      'not_contacted', 'attempted', 'contacted', 'interested', 'invite_sent',
      'follow_up', 'sequence_complete', 'joined', 'not_interested',
      'invalid_duplicate', 'do_not_contact'
    )
  );

alter table public.business_outreach_events
  add column if not exists outcome text,
  add column if not exists client_action_id uuid,
  add column if not exists assigned_user_id uuid
    references auth.users(id) on delete set null,
  add column if not exists request_fingerprint text,
  add column if not exists result_snapshot jsonb;

alter table public.business_outreach_events
  drop constraint if exists business_outreach_events_outreach_status_check;
alter table public.business_outreach_events
  add constraint business_outreach_events_outreach_status_check check (
    outreach_status is null or outreach_status in (
      'not_contacted', 'attempted', 'contacted', 'interested', 'invite_sent',
      'follow_up', 'sequence_complete', 'joined', 'not_interested',
      'invalid_duplicate', 'do_not_contact'
    )
  );

alter table public.business_outreach_events
  drop constraint if exists business_outreach_events_outcome_check;
alter table public.business_outreach_events
  add constraint business_outreach_events_outcome_check check (
    outcome is null or outcome in (
      'called', 'emailed', 'sms_sent', 'whatsapp_sent', 'replied',
      'contacted', 'interested', 'invite_sent', 'not_now',
      'follow_up_set', 'follow_up_cleared', 'sequence_complete',
      'not_interested', 'do_not_contact', 'email_bounced',
      'invalid_phone', 'invalid_duplicate', 'note', 'assigned', 'unassigned'
    )
  );

create unique index if not exists uq_business_outreach_events_client_action
  on public.business_outreach_events (client_action_id)
  where client_action_id is not null;

create index if not exists idx_business_outreach_events_assigned_user
  on public.business_outreach_events (assigned_user_id, created_at desc);

-- Active rows are hard blocks, not UI hints. No authenticated caller receives
-- INSERT/UPDATE/DELETE; only the atomic outcome RPC may create suppressions.
create table if not exists public.business_outreach_suppressions (
  business_id       uuid not null references public.businesses(id) on delete cascade,
  channel           text not null check (channel in ('all', 'email', 'phone', 'sms', 'whatsapp')),
  reason            text not null check (char_length(reason) between 1 and 1000),
  source_event_id   uuid references public.business_outreach_events(id) on delete set null,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  primary key (business_id, channel)
);

create index if not exists idx_business_outreach_suppressions_channel
  on public.business_outreach_suppressions (channel, business_id);

alter table public.business_outreach_suppressions enable row level security;
revoke all on table public.business_outreach_suppressions from public, anon, authenticated;
grant select on table public.business_outreach_suppressions to authenticated;
grant all on table public.business_outreach_suppressions to service_role;

drop policy if exists "Outreach staff read contractor suppressions"
  on public.business_outreach_suppressions;
create policy "Outreach staff read contractor suppressions"
  on public.business_outreach_suppressions for select to authenticated
  using (private.is_contractor_outreach_business(business_id));

drop policy if exists "Service role manages contractor suppressions"
  on public.business_outreach_suppressions;
create policy "Service role manages contractor suppressions"
  on public.business_outreach_suppressions for all to service_role
  using (true) with check (true);

-- Contractor-scoped direct reads support the security-invoker view and event
-- history without widening staff access to all draft/expired marketplace rows.
drop policy if exists "Outreach staff read contractor businesses" on public.businesses;
create policy "Outreach staff read contractor businesses"
  on public.businesses for select to authenticated
  using (private.is_contractor_outreach_business(id));

drop policy if exists "Outreach staff read contractor listings" on public.listings;
create policy "Outreach staff read contractor listings"
  on public.listings for select to authenticated
  using (
    business_id is not null
    and private.is_contractor_outreach_business(business_id)
  );

drop policy if exists "Outreach staff read business outreach" on public.business_outreach;
create policy "Outreach staff read business outreach"
  on public.business_outreach for select to authenticated
  using (private.is_contractor_outreach_business(business_id));

drop policy if exists "Outreach staff read business outreach events"
  on public.business_outreach_events;
create policy "Outreach staff read business outreach events"
  on public.business_outreach_events for select to authenticated
  using (private.is_contractor_outreach_business(business_id));

-- The queue needs a handful of fields from private raw_payload, but operators
-- must never receive listing_sources table access. This non-exposed definer
-- projects only the approved contact/provenance fields for contractor rows.
create or replace function private.outreach_listing_source(p_listing_id uuid)
returns table (
  raw_source_platform text,
  raw_source_url text,
  raw_suburb text,
  raw_contact_phone text,
  raw_contact_email text,
  raw_website_url text,
  contact_source_url text,
  verification_source_url text,
  contact_verified_at text,
  source_is_fencing boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business_id uuid;
begin
  select l.business_id into v_business_id
    from public.listings l
   where l.id = p_listing_id;

  if v_business_id is null
     or not private.is_contractor_outreach_business(v_business_id) then
    return;
  end if;

  return query
  select
    s.source_platform,
    s.source_url,
    coalesce(
      nullif(s.raw_payload ->> 'city', ''),
      nullif(s.raw_payload ->> 'borough', ''),
      nullif(s.raw_payload ->> 'suburb', '')
    ),
    coalesce(
      nullif(s.raw_payload ->> 'phone', ''),
      nullif(s.raw_payload ->> 'phone_1', ''),
      nullif(s.raw_payload ->> 'phone_number', ''),
      nullif(s.raw_payload ->> 'international_phone_number', ''),
      nullif(s.raw_payload ->> 'formatted_phone_number', ''),
      nullif(s.raw_payload -> 'phones' ->> 0, '')
    ),
    coalesce(
      nullif(lower(s.raw_payload ->> 'email'), ''),
      nullif(lower(s.raw_payload ->> 'email_1'), ''),
      nullif(lower(s.raw_payload -> 'emails' ->> 0), ''),
      nullif(lower(s.raw_payload #>> '{emails_and_contacts,emails,0}'), '')
    ),
    coalesce(
      nullif(s.raw_payload ->> 'site', ''),
      nullif(s.raw_payload ->> 'website', '')
    ),
    nullif(s.raw_payload ->> 'contact_source_url', ''),
    nullif(s.raw_payload ->> 'verification_source_url', ''),
    nullif(s.raw_payload ->> 'verified_at', ''),
    lower(
      coalesce(s.raw_payload ->> 'type', '') || ' '
      || coalesce(s.raw_payload ->> 'subtypes', '')
    ) like '%fenc%'
  from public.listing_sources s
  where s.listing_id = p_listing_id
  order by s.last_seen_at desc, s.created_at desc
  limit 1;
end;
$function$;

revoke all on function private.outreach_listing_source(uuid) from public, anon;
grant execute on function private.outreach_listing_source(uuid)
  to authenticated, service_role;

-- ---------- Atomic, idempotent outreach outcome ----------
create or replace function public.record_contractor_outreach_outcome(
  p_business_id uuid,
  p_client_action_id uuid,
  p_outcome text,
  p_contact_method text default null,
  p_note text default null,
  p_next_follow_up_at timestamptz default null,
  p_assigned_user_id uuid default null,
  p_clear_follow_up boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean;
  v_outcome text := lower(btrim(coalesce(p_outcome, '')));
  v_method text := nullif(lower(btrim(coalesce(p_contact_method, ''))), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_fingerprint text;
  v_existing_event public.business_outreach_events%rowtype;
  v_event public.business_outreach_events%rowtype;
  v_state public.business_outreach%rowtype;
  v_claim_status text;
  v_current_status text;
  v_new_status text;
  v_action text;
  v_is_outbound boolean;
  v_marks_contact boolean;
  v_follow_up timestamptz;
  v_assigned_user_id uuid;
  v_assigned_label text;
  v_assigned_name text;
  v_suppression_channels text[] := array[]::text[];
  v_suppressed_channels text[] := array[]::text[];
  v_result jsonb;
begin
  v_is_admin := public.current_user_is_admin();
  if not v_is_admin then
    -- Serialize operator writes with admin revocation. Whichever transaction
    -- locks this row first completes first; a waiting write rechecks is_active
    -- after a revoke and cannot recreate a stranded assignment.
    perform 1
      from public.outreach_staff s
     where s.user_id = v_actor
       and s.is_active = true
     for update;
    if not found then
      raise exception 'Not authorised' using errcode = '42501';
    end if;
  end if;

  if p_business_id is null or p_client_action_id is null then
    raise exception 'business_id and client_action_id are required'
      using errcode = '22023';
  end if;

  if v_outcome not in (
    'called', 'emailed', 'sms_sent', 'whatsapp_sent', 'replied',
    'contacted', 'interested', 'invite_sent', 'not_now',
    'follow_up_set', 'follow_up_cleared', 'sequence_complete',
    'not_interested', 'do_not_contact', 'email_bounced',
    'invalid_phone', 'invalid_duplicate', 'note', 'assigned', 'unassigned'
  ) then
    raise exception 'Invalid outreach outcome' using errcode = '22023';
  end if;

  if v_note is not null and char_length(v_note) > 5000 then
    raise exception 'Note is too long' using errcode = '22023';
  end if;
  if v_method is not null and v_method not in ('phone', 'email', 'sms', 'whatsapp', 'other') then
    raise exception 'Invalid contact method' using errcode = '22023';
  end if;

  -- Fixed-channel outcomes cannot be disguised as another channel. Invite is
  -- an outbound contact in its own right and defaults to email.
  if v_outcome = 'called' then
    if v_method is not null and v_method <> 'phone' then
      raise exception 'called requires phone' using errcode = '22023';
    end if;
    v_method := 'phone';
  elsif v_outcome in ('emailed', 'email_bounced', 'sequence_complete') then
    if v_method is not null and v_method <> 'email' then
      raise exception '% requires email', v_outcome using errcode = '22023';
    end if;
    v_method := 'email';
  elsif v_outcome = 'sms_sent' then
    if v_method is not null and v_method <> 'sms' then
      raise exception 'sms_sent requires sms' using errcode = '22023';
    end if;
    v_method := 'sms';
  elsif v_outcome = 'whatsapp_sent' then
    if v_method is not null and v_method <> 'whatsapp' then
      raise exception 'whatsapp_sent requires whatsapp' using errcode = '22023';
    end if;
    v_method := 'whatsapp';
  elsif v_outcome = 'invalid_phone' then
    if v_method is not null and v_method <> 'phone' then
      raise exception 'invalid_phone requires phone' using errcode = '22023';
    end if;
    v_method := 'phone';
  elsif v_outcome = 'invite_sent' then
    v_method := coalesce(v_method, 'email');
    if v_method not in ('email', 'sms', 'whatsapp') then
      raise exception 'invite_sent requires email, sms or whatsapp'
        using errcode = '22023';
    end if;
  elsif v_outcome = 'contacted' and v_method is null then
    raise exception 'contacted requires a contact method' using errcode = '22023';
  end if;

  if coalesce(p_clear_follow_up, false) and p_next_follow_up_at is not null then
    raise exception 'Cannot set and clear a follow-up in the same outcome'
      using errcode = '22023';
  end if;
  if coalesce(p_clear_follow_up, false)
     and v_outcome not in ('follow_up_cleared', 'sequence_complete') then
    raise exception 'This outcome cannot clear a follow-up'
      using errcode = '22023';
  end if;
  if p_next_follow_up_at is not null and p_next_follow_up_at <= now() then
    raise exception 'Follow-up must be in the future' using errcode = '22023';
  end if;
  if v_outcome in ('not_now', 'follow_up_set') and p_next_follow_up_at is null then
    raise exception '% requires a future follow-up', v_outcome using errcode = '22023';
  end if;
  if v_outcome = 'assigned' and p_assigned_user_id is null then
    raise exception 'assigned requires assigned_user_id' using errcode = '22023';
  end if;
  if v_outcome = 'unassigned' and p_assigned_user_id is not null then
    raise exception 'unassigned cannot include assigned_user_id' using errcode = '22023';
  end if;

  v_fingerprint := jsonb_build_object(
    'business_id', p_business_id,
    'outcome', v_outcome,
    'contact_method', v_method,
    'note', v_note,
    'next_follow_up_at', p_next_follow_up_at,
    'assigned_user_id', p_assigned_user_id,
    'clear_follow_up', coalesce(p_clear_follow_up, false)
  )::text;

  -- Fast replay path. UUID collisions owned by another actor fail without
  -- revealing the original result or business details.
  select * into v_existing_event
    from public.business_outreach_events e
   where e.client_action_id = p_client_action_id;
  if found then
    if v_existing_event.actor_user_id is distinct from v_actor
       or v_existing_event.business_id <> p_business_id
       or v_existing_event.request_fingerprint is distinct from v_fingerprint then
      raise exception 'client_action_id has already been used'
        using errcode = '23505';
    end if;
    if v_existing_event.result_snapshot is null then
      raise exception 'Stored outreach outcome is incomplete' using errcode = '55000';
    end if;
    return v_existing_event.result_snapshot
      || jsonb_build_object('idempotent_replay', true);
  end if;

  -- The business row is the serialization lock even before a state row exists.
  select b.claim_status into v_claim_status
    from public.businesses b
   where b.id = p_business_id
   for update;
  if not found or not private.is_contractor_outreach_business(p_business_id) then
    raise exception 'Business is not in the contractor outreach workspace'
      using errcode = 'P0002';
  end if;

  -- A concurrent retry for this business may have completed while waiting.
  select * into v_existing_event
    from public.business_outreach_events e
   where e.client_action_id = p_client_action_id;
  if found then
    if v_existing_event.actor_user_id is distinct from v_actor
       or v_existing_event.business_id <> p_business_id
       or v_existing_event.request_fingerprint is distinct from v_fingerprint then
      raise exception 'client_action_id has already been used'
        using errcode = '23505';
    end if;
    return v_existing_event.result_snapshot
      || jsonb_build_object('idempotent_replay', true);
  end if;

  select * into v_state
    from public.business_outreach o
   where o.business_id = p_business_id
   for update;
  v_current_status := case
    when v_claim_status <> 'unclaimed' then 'joined'
    else coalesce(v_state.outreach_status, 'not_contacted')
  end;

  if v_outcome = 'sequence_complete' and v_state.last_contacted_at is null then
    raise exception 'A sequence cannot be completed before an earlier contact'
      using errcode = '55000';
  end if;

  -- A staff operator cannot edit somebody else's work. Admins retain an
  -- explicit override for supervision/reassignment.
  if not v_is_admin
     and v_state.assigned_user_id is not null
     and v_state.assigned_user_id <> v_actor then
    raise exception 'This outreach record is assigned to another team member'
      using errcode = '42501';
  end if;
  if not v_is_admin
     and p_assigned_user_id is not null
     and p_assigned_user_id <> v_actor then
    raise exception 'Outreach staff may only assign work to themselves'
      using errcode = '42501';
  end if;

  if p_assigned_user_id is not null and not exists (
    select 1
      from public.user_profiles p
      left join public.outreach_staff s on s.user_id = p.user_id
     where p.user_id = p_assigned_user_id
       and (p.is_admin = true or s.is_active = true)
  ) then
    raise exception 'Assignee does not have active outreach access'
      using errcode = '22023';
  end if;

  -- Claims are the only source of joined. No manual joined outcome exists.
  if v_current_status = 'joined'
     and v_outcome not in ('note', 'assigned', 'unassigned') then
    raise exception 'Joined records cannot be changed through outreach'
      using errcode = '55000';
  end if;
  if v_current_status in ('not_interested', 'invalid_duplicate', 'do_not_contact')
     and not (
       v_outcome in ('note', 'assigned', 'unassigned')
       or v_outcome = v_current_status
     ) then
    raise exception 'Terminal outreach records cannot be reopened'
      using errcode = '55000';
  end if;
  if v_current_status = 'sequence_complete'
     and v_outcome not in ('replied', 'note', 'assigned', 'unassigned') then
    raise exception 'Completed sequences can only reopen after an inbound reply'
      using errcode = '55000';
  end if;

  v_is_outbound := v_outcome in (
    'called', 'emailed', 'sms_sent', 'whatsapp_sent', 'invite_sent',
    'contacted', 'sequence_complete'
  );
  v_marks_contact := v_is_outbound or v_outcome in ('replied', 'contacted');

  if v_is_outbound and exists (
    select 1
      from public.business_outreach_suppressions s
     where s.business_id = p_business_id
       and s.channel in ('all', v_method)
  ) then
    raise exception 'Contact is suppressed for this business and channel'
      using errcode = '55000';
  end if;

  v_new_status := case
    when v_outcome in ('called', 'emailed', 'sms_sent', 'whatsapp_sent')
      then case when v_current_status = 'not_contacted' then 'attempted' else v_current_status end
    when v_outcome in ('replied', 'contacted') then 'contacted'
    when v_outcome = 'interested' then 'interested'
    when v_outcome = 'invite_sent' then 'invite_sent'
    when v_outcome in ('not_now', 'follow_up_set') then 'follow_up'
    when v_outcome = 'follow_up_cleared'
      then case when v_current_status = 'follow_up' then 'contacted' else v_current_status end
    when v_outcome = 'sequence_complete' then 'sequence_complete'
    when v_outcome = 'not_interested' then 'not_interested'
    when v_outcome = 'do_not_contact' then 'do_not_contact'
    when v_outcome = 'invalid_duplicate' then 'invalid_duplicate'
    when v_outcome in ('email_bounced', 'invalid_phone')
      then case when v_current_status = 'not_contacted' then 'attempted' else v_current_status end
    else v_current_status
  end;

  v_follow_up := v_state.next_follow_up_at;
  if v_new_status in (
    'sequence_complete', 'joined', 'not_interested', 'invalid_duplicate', 'do_not_contact'
  ) or v_outcome = 'follow_up_cleared' or coalesce(p_clear_follow_up, false) then
    v_follow_up := null;
  elsif p_next_follow_up_at is not null then
    v_follow_up := p_next_follow_up_at;
  end if;

  v_assigned_user_id := v_state.assigned_user_id;
  v_assigned_label := v_state.assigned_to;
  if v_outcome = 'unassigned' then
    v_assigned_user_id := null;
    v_assigned_label := null;
  elsif p_assigned_user_id is not null then
    v_assigned_user_id := p_assigned_user_id;
    v_assigned_label := null;
  elsif not v_is_admin and v_assigned_user_id is null then
    -- A direct caller cannot leave an acted-on record unowned and let another
    -- operator repeat the contact. The state change and claim are one lock/
    -- transaction even when a client omits assigned_user_id.
    v_assigned_user_id := v_actor;
    v_assigned_label := null;
  end if;

  insert into public.business_outreach as existing (
    business_id, outreach_status, assigned_to, assigned_user_id,
    last_contact_method, last_contacted_at, next_follow_up_at,
    latest_note, updated_by
  ) values (
    p_business_id, v_new_status, v_assigned_label, v_assigned_user_id,
    case when v_marks_contact then v_method else null end,
    case when v_marks_contact then now() else null end,
    v_follow_up, v_note, v_actor
  )
  on conflict (business_id) do update set
    outreach_status = excluded.outreach_status,
    assigned_to = excluded.assigned_to,
    assigned_user_id = excluded.assigned_user_id,
    last_contact_method = case when v_marks_contact and v_method is not null
      then v_method else existing.last_contact_method end,
    last_contacted_at = case when v_marks_contact
      then now() else existing.last_contacted_at end,
    next_follow_up_at = v_follow_up,
    latest_note = coalesce(v_note, existing.latest_note),
    updated_by = v_actor
  returning * into v_state;

  v_action := case
    when v_outcome = 'called' then 'called'
    when v_outcome in ('emailed', 'sequence_complete') then 'emailed'
    when v_outcome = 'sms_sent' then 'sms'
    when v_outcome = 'whatsapp_sent' then 'whatsapp'
    when v_outcome = 'note' then 'note'
    when v_outcome in ('assigned', 'unassigned') then 'assigned'
    when v_outcome in ('not_now', 'follow_up_set', 'follow_up_cleared') then 'follow_up_set'
    else 'status_changed'
  end;

  insert into public.business_outreach_events (
    business_id, actor_user_id, action, outcome, client_action_id,
    request_fingerprint, contact_method, outreach_status, note,
    next_follow_up_at, assigned_to, assigned_user_id
  ) values (
    p_business_id, v_actor, v_action, v_outcome, p_client_action_id,
    v_fingerprint, v_method, v_state.outreach_status, v_note,
    v_state.next_follow_up_at, v_state.assigned_to, v_state.assigned_user_id
  )
  returning * into v_event;

  v_suppression_channels := case
    when v_outcome in ('not_interested', 'do_not_contact', 'invalid_duplicate')
      then array['all']::text[]
    when v_outcome = 'email_bounced' then array['email']::text[]
    when v_outcome = 'invalid_phone' then array['phone', 'sms', 'whatsapp']::text[]
    else array[]::text[]
  end;

  if cardinality(v_suppression_channels) > 0 then
    insert into public.business_outreach_suppressions (
      business_id, channel, reason, source_event_id, created_by
    )
    select
      p_business_id,
      channel,
      left(coalesce(v_note, replace(v_outcome, '_', ' ')), 1000),
      v_event.id,
      v_actor
    from unnest(v_suppression_channels) as channel
    on conflict (business_id, channel) do nothing;
  end if;

  select coalesce(
    array_agg(s.channel order by case s.channel
      when 'all' then 0 when 'email' then 1 when 'phone' then 2
      when 'sms' then 3 when 'whatsapp' then 4 else 9 end),
    array[]::text[]
  ) into v_suppressed_channels
  from public.business_outreach_suppressions s
  where s.business_id = p_business_id;

  if v_state.assigned_user_id is not null then
    select nullif(btrim(p.display_name), '')
      into v_assigned_name
      from public.user_profiles p
     where p.user_id = v_state.assigned_user_id;
  end if;
  v_assigned_name := coalesce(
    v_assigned_name,
    v_state.assigned_to,
    case when v_state.assigned_user_id is not null then 'Outreach team member' end
  );

  v_result := jsonb_build_object(
    'business_id', v_state.business_id,
    'outreach_status', v_state.outreach_status,
    'assigned_user_id', v_state.assigned_user_id,
    'assigned_name', v_assigned_name,
    'last_contact_method', v_state.last_contact_method,
    'last_contacted_at', v_state.last_contacted_at,
    'next_follow_up_at', v_state.next_follow_up_at,
    'latest_note', v_state.latest_note,
    'suppressed_channels', to_jsonb(v_suppressed_channels),
    'is_suppressed', 'all' = any(v_suppressed_channels),
    'updated_at', v_state.updated_at,
    'event_id', v_event.id,
    'idempotent_replay', false
  );

  update public.business_outreach_events
     set result_snapshot = v_result
   where id = v_event.id;

  return v_result;
end;
$function$;

revoke all on function public.record_contractor_outreach_outcome(
  uuid, uuid, text, text, text, timestamptz, uuid, boolean
) from public, anon;
grant execute on function public.record_contractor_outreach_outcome(
  uuid, uuid, text, text, text, timestamptz, uuid, boolean
) to authenticated, service_role;

-- The queue now obtains its narrow raw-source projection through the private
-- helper, so no signed-in user (including outreach staff) needs direct access
-- to listing_sources/raw_payload.
revoke all privileges on table public.listing_sources from public, anon, authenticated;
grant all privileges on table public.listing_sources to service_role;

-- Idempotency fingerprints/tokens and stored response snapshots are internal.
-- History UI receives only the audited business-facing event fields.
revoke select on table public.business_outreach_events from authenticated;
grant select (
  id, business_id, actor_user_id, action, outcome, contact_method,
  outreach_status, note, next_follow_up_at, assigned_to, assigned_user_id,
  created_at
) on table public.business_outreach_events to authenticated;

-- ---------- Permission-gated contractor queue ----------
-- Existing columns keep their original order for CREATE OR REPLACE VIEW
-- compatibility. Identity, suppression, provenance and deterministic queue
-- fields are appended. The private source helper means this remains a
-- security-invoker view without exposing listing_sources/raw_payload.
create or replace view public.admin_contractor_outreach
with (security_invoker = true)
as
with queue_rows as (
  select
    b.id as business_id,
    coalesce(
      nullif(b.trading_name, ''), nullif(b.legal_name, ''), '(Unnamed business)'
    ) as business_name,
    coalesce(nullif(l.metadata ->> 'suburb', ''), l.raw_suburb) as suburb,
    coalesce(nullif(b.postcode, ''), nullif(l.postcode, '')) as postcode,
    coalesce(nullif(b.state_code, ''), nullif(l.state, '')) as state_code,
    coalesce(nullif(b.contact_phone, ''), l.raw_contact_phone) as contact_phone,
    coalesce(nullif(lower(b.contact_email), ''), l.raw_contact_email) as contact_email,
    coalesce(nullif(b.website_url, ''), l.raw_website_url) as website_url,
    coalesce(
      nullif(l.source_platform, ''), nullif(b.source_platform, ''), l.raw_source_platform
    ) as source_platform,
    coalesce(
      nullif(l.source_url, ''), nullif(b.source_url, ''), l.raw_source_url
    ) as source_url,
    b.claim_status,
    l.id as listing_id,
    l.slug as listing_slug,
    l.kind as listing_kind,
    l.status as listing_status,
    l.category_id,
    l.category_slug,
    l.category_label,
    case
      when b.claim_status <> 'unclaimed' then 'joined'
      else coalesce(o.outreach_status, 'not_contacted')
    end as outreach_status,
    o.assigned_to,
    coalesce(
      nullif(ap.display_name, ''),
      o.assigned_to,
      case when o.assigned_user_id is not null then 'Outreach team member' end
    ) as assigned_name,
    o.last_contacted_at,
    case when b.claim_status <> 'unclaimed' then null else o.next_follow_up_at end
      as next_follow_up_at,
    o.latest_note,
    o.updated_at,
    o.assigned_user_id,
    o.last_contact_method,
    coalesce(sup.suppressed_channels, array[]::text[]) as suppressed_channels,
    coalesce(sup.all_suppressed, false) as is_suppressed,
    coalesce(sup.email_suppressed, false) as email_suppressed,
    coalesce(sup.phone_suppressed, false) as phone_suppressed,
    coalesce(sup.sms_suppressed, false) as sms_suppressed,
    coalesce(sup.whatsapp_suppressed, false) as whatsapp_suppressed,
    l.contact_source_url,
    l.verification_source_url,
    l.contact_verified_at,
    l.listing_created_at
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
      candidate.created_at as listing_created_at,
      c.slug as category_slug,
      c.label as category_label,
      candidate_src.raw_source_platform,
      candidate_src.raw_source_url,
      candidate_src.raw_suburb,
      candidate_src.raw_contact_phone,
      candidate_src.raw_contact_email,
      candidate_src.raw_website_url,
      candidate_src.contact_source_url,
      candidate_src.verification_source_url,
      candidate_src.contact_verified_at,
      candidate_src.source_is_fencing
    from public.listings candidate
    join public.categories c on c.id = candidate.category_id
    left join lateral private.outreach_listing_source(candidate.id) candidate_src on true
    where candidate.business_id = b.id
      and (
        c.slug in ('fencing-contractor', 'fencing-labour')
        or lower(coalesce(b.trading_name, '') || ' ' || coalesce(b.legal_name, '')) like '%fenc%'
        or coalesce(candidate_src.source_is_fencing, false)
      )
    order by
      (c.slug in ('fencing-contractor', 'fencing-labour')) desc,
      coalesce(candidate_src.source_is_fencing, false) desc,
      (candidate.status = 'active' and candidate.expires_at > now()) desc,
      candidate.updated_at desc,
      candidate.created_at desc
    limit 1
  ) l on true
  left join public.business_outreach o on o.business_id = b.id
  left join public.user_profiles_public ap on ap.user_id = o.assigned_user_id
  left join lateral (
    select
      array_agg(s.channel order by case s.channel
        when 'all' then 0 when 'email' then 1 when 'phone' then 2
        when 'sms' then 3 when 'whatsapp' then 4 else 9 end
      ) as suppressed_channels,
      bool_or(s.channel = 'all') as all_suppressed,
      bool_or(s.channel = 'email') as email_suppressed,
      bool_or(s.channel = 'phone') as phone_suppressed,
      bool_or(s.channel = 'sms') as sms_suppressed,
      bool_or(s.channel = 'whatsapp') as whatsapp_suppressed
    from public.business_outreach_suppressions s
    where s.business_id = b.id
  ) sup on true
  where public.current_user_can_outreach()
    and b.status = 'active'
), prioritized as (
  select
    q.*,
    case
      when q.outreach_status in (
        'sequence_complete', 'joined', 'not_interested',
        'invalid_duplicate', 'do_not_contact'
      ) or q.is_suppressed then 90
      when q.next_follow_up_at is not null and q.next_follow_up_at <= now() then 10
      when q.outreach_status in ('interested', 'contacted', 'invite_sent')
        and q.next_follow_up_at is null then 20
      when q.outreach_status = 'not_contacted'
        and q.next_follow_up_at is null
        and q.contact_email is not null
        and not q.email_suppressed then 30
      when q.outreach_status = 'not_contacted'
        and q.next_follow_up_at is null
        and q.contact_phone is not null
        and not q.phone_suppressed then 40
      when q.next_follow_up_at is not null and q.next_follow_up_at > now() then 50
      else 60
    end::integer as queue_priority
  from queue_rows q
)
select
  p.business_id,
  p.business_name,
  p.suburb,
  p.postcode,
  p.state_code,
  p.contact_phone,
  p.contact_email,
  p.website_url,
  p.source_platform,
  p.source_url,
  p.claim_status,
  p.listing_id,
  p.listing_slug,
  p.listing_kind,
  p.listing_status,
  p.category_id,
  p.category_slug,
  p.category_label,
  p.outreach_status,
  p.assigned_to,
  p.assigned_name,
  p.last_contacted_at,
  p.next_follow_up_at,
  p.latest_note,
  p.updated_at,
  p.assigned_user_id,
  p.last_contact_method,
  p.suppressed_channels,
  p.is_suppressed,
  p.email_suppressed,
  p.phone_suppressed,
  p.sms_suppressed,
  p.whatsapp_suppressed,
  p.contact_source_url,
  p.verification_source_url,
  p.contact_verified_at,
  p.queue_priority,
  case p.queue_priority
    when 10 then p.next_follow_up_at
    when 20 then coalesce(p.last_contacted_at, p.updated_at, p.listing_created_at)
    when 30 then p.listing_created_at
    when 40 then p.listing_created_at
    when 50 then p.next_follow_up_at
    else coalesce(p.updated_at, p.last_contacted_at, p.listing_created_at)
  end as queue_sort_at
from prioritized p;

revoke all on table public.admin_contractor_outreach from public, anon, authenticated;
grant select on table public.admin_contractor_outreach to authenticated, service_role;

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
  if not public.current_user_can_outreach() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'not_contacted', count(*) filter (
      where b.claim_status = 'unclaimed'
        and coalesce(o.outreach_status, 'not_contacted') = 'not_contacted'
    ),
    'contacted', count(*) filter (where (
      case when b.claim_status <> 'unclaimed' then 'joined'
           else coalesce(o.outreach_status, 'not_contacted') end
    ) in (
      'attempted', 'contacted', 'interested', 'invite_sent', 'follow_up',
      'sequence_complete', 'joined', 'not_interested', 'do_not_contact'
    )),
    'interested', count(*) filter (
      where b.claim_status = 'unclaimed' and o.outreach_status = 'interested'
    ),
    'invited', count(*) filter (
      where b.claim_status = 'unclaimed' and o.outreach_status = 'invite_sent'
    ),
    'sequence_complete', count(*) filter (
      where b.claim_status = 'unclaimed' and o.outreach_status = 'sequence_complete'
    ),
    'joined', count(*) filter (
      where o.outreach_status = 'joined' or b.claim_status <> 'unclaimed'
    ),
    'follow_ups_due', count(*) filter (
      where b.claim_status = 'unclaimed'
        and o.next_follow_up_at is not null
        and o.next_follow_up_at <= now()
        and coalesce(o.outreach_status, 'not_contacted') not in (
          'sequence_complete', 'joined', 'not_interested',
          'invalid_duplicate', 'do_not_contact'
        )
    )
  ) into v_result
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

revoke all on function public.admin_contractor_outreach_counts() from public, anon;
grant execute on function public.admin_contractor_outreach_counts()
  to authenticated, service_role;

-- Keep the superseded admin writer available for the short rolling-deploy
-- window. The follow-up migration revokes authenticated execution after the
-- new app is live, avoiding a database-first outage for the current admin UI.
revoke all on function public.record_contractor_outreach(
  uuid, text, text, text, text, timestamptz, text
) from public, anon;
grant execute on function public.record_contractor_outreach(
  uuid, text, text, text, text, timestamptz, text
) to authenticated, service_role;

notify pgrst, 'reload schema';
