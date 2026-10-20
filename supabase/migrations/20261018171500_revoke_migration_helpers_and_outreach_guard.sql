-- ============================================================
-- Migration: 20261018171500_revoke_migration_helpers_and_outreach_guard.sql
-- ============================================================
-- Project : csisezoohgfrpjrhkmls (Outback Connections)
-- Date    : 2026-10-18
-- Purpose :
--   1. Lock down the three SECURITY DEFINER migration helpers
--      (`_seed_verified_regional_vendor`, `run_populate_empty_categories`,
--       `run_seo_hygiene_backfill`) by adding an internal service_role /
--      postgres guard AND explicitly revoking EXECUTE from PUBLIC, anon,
--      and authenticated (fixing Supabase default-privilege inheritance).
--   2. Preserve contact privacy and ownership guards:
--      - `_seed_verified_regional_vendor` only updates `businesses` where
--        `claim_status = 'unclaimed'` and `listings` where
--        `data_source = 'scraped' and user_id is null`, keeping
--        `listings.contact_phone` and `listings.contact_email` NULL on
--        unclaimed scraped rows (public business contacts live on `businesses`).
--      - Backfill any unclaimed scraped `listings` rows so `listings.contact_*`
--        is NULL while preserving `businesses.contact_*`.
--   3. Enforce `public.is_rural_postcode` inside `public.record_contractor_outreach`
--      so the outreach write RPC enforces the exact same rural boundary as
--      `public.admin_contractor_outreach`.
-- ============================================================

-- 1. Harden public._seed_verified_regional_vendor with caller guard,
--    unclaimed/scraped ownership checks, and NULL listings.contact_*
create or replace function public._seed_verified_regional_vendor(
  p_vertical text,
  p_category_slug text,
  p_name text,
  p_suburb text,
  p_postcode text,
  p_state text,
  p_phone text,
  p_email text,
  p_website text,
  p_role_tags text[],
  p_services text[],
  p_bio text
)
returns void
language plpgsql
security definer
set search_path = public
as $seed$
declare
  v_ext_id text := 'verified-seed:' || lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g')) || ':' || p_postcode;
  v_res jsonb;
  v_biz_id uuid;
  v_lst_id uuid;
  v_cat_label text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if not public.is_rural_postcode(p_postcode, p_state) then
    raise exception 'Metro postcode % (%) rejected by _seed_verified_regional_vendor', p_postcode, p_state;
  end if;

  select label into v_cat_label
    from public.categories
   where slug = p_category_slug
     and active = true
   limit 1;

  v_res := public.ingest_scraped_business(
    p_vertical,
    'official_website',
    v_ext_id,
    coalesce(p_website, 'https://www.google.com/search?q=' || replace(p_name || ' ' || p_suburb || ' ' || p_state, ' ', '+')),
    p_name,
    p_category_slug,
    p_postcode,
    p_suburb,
    p_state,
    p_website,
    null,
    null,
    jsonb_build_object(
      'phone', p_phone,
      'email', p_email,
      'website', p_website,
      'city', p_suburb,
      'notes', p_bio,
      'type', p_category_slug
    ),
    365
  );

  v_biz_id := (v_res ->> 'business_id')::uuid;
  v_lst_id := (v_res ->> 'listing_id')::uuid;

  -- Only update businesses if still unclaimed (never overwrite a claimed business)
  update public.businesses
  set
    contact_phone = coalesce(p_phone, contact_phone),
    contact_email = coalesce(p_email, contact_email),
    website_url = coalesce(p_website, website_url),
    suburb = coalesce(p_suburb, suburb),
    state_code = coalesce(p_state, state_code),
    role_tags = p_role_tags,
    services_offered = p_services,
    bio = p_bio,
    last_verified_at = now()
  where id = v_biz_id
    and claim_status = 'unclaimed';

  -- Only update listings if still an unclaimed scraped row, and keep
  -- listings.contact_phone / listings.contact_email NULL per AGENTS.md Rule 2
  update public.listings
  set
    contact_phone = null,
    contact_email = null,
    state = p_state,
    description = p_bio || E'\n\n' || public.build_unclaimed_listing_description(
      p_name,
      coalesce(v_cat_label, 'Rural Contractor'),
      p_suburb,
      p_postcode,
      p_state
    ),
    expires_at = now() + interval '365 days'
  where id = v_lst_id
    and data_source = 'scraped'
    and user_id is null;
end;
$seed$;

-- 2. Harden one-off migration helpers with internal service_role / postgres guards
create or replace function public.run_populate_empty_categories()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'status', 'noop_already_applied',
    'note', 'Initial category population completed in 20261018123500; use _seed_verified_regional_vendor via service_role for future imports.'
  );
end;
$fn$;

create or replace function public.run_seo_hygiene_backfill()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_archived_listings integer := 0;
  v_archived_businesses integer := 0;
  v_updated_descriptions integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  -- Archive unclaimed scraped metro listings & businesses only
  update public.listings l
     set status = 'deleted_by_admin',
         closed_at = null
    from public.businesses b
   where l.business_id = b.id
     and b.claim_status = 'unclaimed'
     and l.data_source = 'scraped'
     and l.user_id is null
     and l.status in ('active', 'expired', 'closed')
     and l.postcode ~ '^[0-9]{4}$'
     and not public.is_rural_postcode(l.postcode, l.state);
  get diagnostics v_archived_listings = row_count;

  update public.businesses b
     set status = 'hidden'
   where b.claim_status = 'unclaimed'
     and b.status = 'active'
     and b.postcode ~ '^[0-9]{4}$'
     and not public.is_rural_postcode(b.postcode, b.state_code);
  get diagnostics v_archived_businesses = row_count;

  -- Refresh boilerplate unclaimed descriptions on unclaimed scraped rows only
  update public.listings l
     set description = public.build_unclaimed_listing_description(
       l.title,
       c.label,
       coalesce(
         nullif(btrim(l.metadata->>'suburb'), ''),
         (select reg.lga from public.regions reg where reg.postcode = l.postcode limit 1),
         'Regional ' || coalesce(l.state, 'NSW')
       ),
       l.postcode,
       coalesce(l.state, 'NSW')
     )
    from public.categories c
   where l.category_id = c.id
     and l.data_source = 'scraped'
     and l.user_id is null
     and (
       l.description ilike '%Yellow Pages%'
       or l.description ilike '%UNCLAIMED directory listing%'
       or l.description ilike '%we found listed%'
     );
  get diagnostics v_updated_descriptions = row_count;

  return jsonb_build_object(
    'archived_metro_listings', v_archived_listings,
    'archived_metro_businesses', v_archived_businesses,
    'updated_descriptions', v_updated_descriptions
  );
end;
$function$;

-- 3. Explicitly revoke EXECUTE from PUBLIC, anon, and authenticated on all three helpers
revoke execute on function public._seed_verified_regional_vendor(
  text, text, text, text, text, text, text, text, text, text[], text[], text
) from public, anon, authenticated;

revoke execute on function public.run_populate_empty_categories()
  from public, anon, authenticated;

revoke execute on function public.run_seo_hygiene_backfill()
  from public, anon, authenticated;

grant execute on function public._seed_verified_regional_vendor(
  text, text, text, text, text, text, text, text, text, text[], text[], text
) to service_role;

grant execute on function public.run_populate_empty_categories()
  to service_role;

grant execute on function public.run_seo_hygiene_backfill()
  to service_role;

-- 4. Reconcile contact privacy on unclaimed scraped rows:
--    Ensure any phone/email on unclaimed scraped listings is stored on
--    public.businesses, and clear listings.contact_phone / listings.contact_email
--    on unclaimed scraped rows (where data_source = 'scraped' and user_id is null).
update public.businesses b
   set contact_phone = coalesce(b.contact_phone, l.contact_phone),
       contact_email = coalesce(b.contact_email, l.contact_email)
  from public.listings l
 where l.business_id = b.id
   and b.claim_status = 'unclaimed'
   and l.data_source = 'scraped'
   and l.user_id is null
   and (l.contact_phone is not null or l.contact_email is not null);

update public.listings
   set contact_phone = null,
       contact_email = null
 where data_source = 'scraped'
   and user_id is null
   and (contact_phone is not null or contact_email is not null);

-- 5. Enforce public.is_rural_postcode inside public.record_contractor_outreach
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
  if not public.current_user_is_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.listings l
      join public.businesses b on b.id = l.business_id
     where l.business_id = p_business_id
       and b.status = 'active'
       and l.status in ('active', 'expired')
       and public.is_rural_postcode(
         coalesce(nullif(b.postcode, ''), l.postcode),
         coalesce(nullif(b.state_code, ''), l.state, 'NSW')
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

revoke all on function public.record_contractor_outreach(uuid, text, text, text, text, timestamptz, text) from public, anon;
grant execute on function public.record_contractor_outreach(uuid, text, text, text, text, timestamptz, text) to authenticated, service_role;

-- 6. Post-revoke verification assertion: fail migration if anon or authenticated
--    retains EXECUTE on any of the three migration helper functions.
do $$
declare
  v_leaked integer;
begin
  select count(*) into v_leaked
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      '_seed_verified_regional_vendor',
      'run_populate_empty_categories',
      'run_seo_hygiene_backfill'
    )
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
    );

  if v_leaked > 0 then
    raise exception 'SECURITY CHECK FAILED: % migration helper function(s) still callable by anon or authenticated', v_leaked;
  end if;
end $$;
