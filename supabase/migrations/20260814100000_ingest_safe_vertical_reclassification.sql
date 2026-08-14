-- ============================================================
-- Safe scraped-listing vertical reclassification
-- ============================================================
-- A source identity can move to a better taxonomy on a later scrape (for
-- example, the old Google Maps "fencing contractor" job seed is now a
-- service/fencing-contractor seed). The previous ingest update path refreshed
-- the sighting but left kind/vertical/category unchanged, then inserted the
-- newly requested detail row. That produced mixed job + service records.
--
-- Only scraper-owned, ownerless listings attached to an unclaimed business may
-- be reclassified. Claimed/user-owned listings and moderation state are never
-- overwritten by a directory refresh. Re-running the relevant import performs
-- the reconciliation; this migration intentionally does not guess which
-- historic rows should change without the source input that selected them.
-- ============================================================

create or replace function public.ingest_scraped_business(
  p_vertical text,
  p_source_platform text,
  p_source_external_id text,
  p_source_url text,
  p_name text,
  p_category_slug text,
  p_postcode text,
  p_suburb text,
  p_state text,
  p_website text,
  p_geo_lat numeric,
  p_geo_lng numeric,
  p_raw_payload jsonb,
  p_expiry_days integer default 45
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'extensions'
as $function$
declare
  v_country text := 'AU';
  v_pillar text := case p_vertical
    when 'job' then 'jobs'
    when 'freight' then 'freight'
    when 'service' then 'services'
  end;
  v_kind text := case
    when p_vertical = 'service' then 'service_offering'
    else p_vertical
  end;
  v_side text := case when p_vertical = 'job' then 'demand' else 'supply' end;
  v_fallback text := case p_vertical
    when 'job' then 'jobs-other'
    when 'freight' then 'freight-other'
    when 'service' then 'services-other'
  end;
  v_descriptor text := case p_vertical
    when 'job' then 'rural employer'
    when 'freight' then 'rural transport operator'
    when 'service' then 'rural supplies or service business'
  end;
  v_cta text := case p_vertical
    when 'service' then 'Claim it to manage the details and list what you supply.'
    else 'Claim it to manage the details and add a real job ad.'
  end;
  v_now timestamptz := now();
  v_category_id uuid;
  v_business_id uuid;
  v_canonical uuid;
  v_business_claim_status text;
  v_canonical_claim_status text;
  v_business_mutable boolean := false;
  v_listing_id uuid;
  v_existing_listing_vertical text;
  v_existing_listing_kind text;
  v_existing_listing_source text;
  v_existing_listing_user uuid;
  v_existing_listing_business uuid;
  v_existing_listing_claim_status text;
  v_existing_listing_status text;
  v_existing_under_review boolean;
  v_existing_flag_count integer;
  v_listing_mutable boolean := false;
  v_listing_moderated boolean := false;
  v_manage_details boolean := false;
  v_source_id uuid;
  v_biz_action text;
  v_lst_action text;
begin
  if p_vertical is null or p_vertical not in ('job', 'freight', 'service') then
    raise exception 'ingest: vertical must be job, freight or service, got %', p_vertical;
  end if;
  if p_source_platform is null or p_source_url is null or p_source_external_id is null then
    raise exception 'ingest: source_platform, source_url, source_external_id are required for scraped rows';
  end if;
  if p_name is null or p_postcode is null then
    raise exception 'ingest: name and postcode are required';
  end if;

  select id
    into v_category_id
    from public.categories
   where country_code = v_country
     and pillar = v_pillar
     and slug = p_category_slug
     and active = true
   limit 1;

  if v_category_id is null then
    select id
      into v_category_id
      from public.categories
     where country_code = v_country
       and pillar = v_pillar
       and slug = v_fallback
     limit 1;
  end if;

  if v_category_id is null then
    raise exception 'ingest: no category for vertical % (looked up % and %)',
      p_vertical, p_category_slug, v_fallback;
  end if;

  select
      b.id,
      coalesce(b.canonical_business_id, b.id),
      b.claim_status
    into v_business_id, v_canonical, v_business_claim_status
    from public.businesses b
   where b.source_platform = p_source_platform
     and b.source_external_id = p_source_external_id
   limit 1
   for update of b;

  if v_business_id is null then
    insert into public.businesses (
      country_code, legal_name, trading_name, postcode, state_code,
      geo_lat, geo_lng, website_url,
      data_source, source_url, source_platform, source_external_id,
      status, claim_status, last_verified_at
    ) values (
      v_country, p_name, p_name, p_postcode, p_state,
      p_geo_lat, p_geo_lng, p_website,
      'scraped', p_source_url, p_source_platform, p_source_external_id,
      'active', 'unclaimed', v_now
    )
    returning id into v_business_id;

    v_canonical := v_business_id;
    v_business_claim_status := 'unclaimed';
    v_canonical_claim_status := 'unclaimed';
    v_business_mutable := true;
    v_biz_action := 'created';
  else
    select claim_status
      into v_canonical_claim_status
      from public.businesses
     where id = v_canonical
     for update;

    v_business_mutable :=
      v_business_claim_status = 'unclaimed'
      and coalesce(v_canonical_claim_status, 'unclaimed') = 'unclaimed';

    if v_business_mutable then
      update public.businesses set
        trading_name = coalesce(nullif(trading_name, ''), p_name),
        postcode = coalesce(p_postcode, postcode),
        state_code = coalesce(p_state, state_code),
        geo_lat = coalesce(p_geo_lat, geo_lat),
        geo_lng = coalesce(p_geo_lng, geo_lng),
        website_url = coalesce(website_url, p_website),
        source_url = coalesce(p_source_url, source_url),
        last_verified_at = v_now
      where id = v_business_id;
      v_biz_action := 'updated';
    else
      -- External data must not overwrite a business after ownership transfer.
      v_biz_action := 'preserved_claimed';
    end if;
  end if;

  select
      l.id,
      l.vertical,
      l.kind,
      l.data_source,
      l.user_id,
      l.business_id,
      linked_business.claim_status,
      l.status,
      coalesce(l.under_review, false),
      l.flag_count
    into
      v_listing_id,
      v_existing_listing_vertical,
      v_existing_listing_kind,
      v_existing_listing_source,
      v_existing_listing_user,
      v_existing_listing_business,
      v_existing_listing_claim_status,
      v_existing_listing_status,
      v_existing_under_review,
      v_existing_flag_count
    from public.listings l
    left join public.businesses linked_business on linked_business.id = l.business_id
   where l.source_platform = p_source_platform
     and l.source_external_id = p_source_external_id
   limit 1
   for update of l;

  if v_listing_id is null then
    if not v_business_mutable then
      raise exception 'ingest: refusing to create a scraped listing for a claimed business';
    end if;

    insert into public.listings (
      kind, vertical, side, category_id, user_id, business_id, country_code,
      title, description, postcode, state,
      contact_email, contact_phone,
      data_source, source_platform, source_url, source_external_id,
      scraped_at, expires_at, freshness_status, status, policy_version_id,
      metadata, slug
    ) values (
      v_kind, p_vertical, v_side, v_category_id, null, v_canonical, v_country,
      p_name,
      format(
        '%s is a %s we found listed on %s%s. This is an UNCLAIMED directory listing -- it was not posted by the business. Is this your business? %s',
        p_name,
        v_descriptor,
        p_source_platform,
        case
          when coalesce(p_suburb, '') <> ''
            then ' in ' || p_suburb || coalesce(', ' || p_state, '')
          else coalesce(' in ' || p_state, '')
        end,
        v_cta
      ),
      p_postcode, p_state,
      null, null,
      'scraped', p_source_platform, p_source_url, p_source_external_id,
      v_now, v_now + make_interval(days => p_expiry_days), 'fresh', 'active', null,
      jsonb_build_object(
        'directory_entry', true,
        'suburb', p_suburb,
        'scraped_name', p_name
      ),
      'pending-' || gen_random_uuid()::text
    )
    returning id into v_listing_id;

    update public.listings
       set slug = left(
         regexp_replace(
           regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'),
           '(^-+|-+$)', '', 'g'
         ),
         60
       ) || '-' || p_postcode || '-' || anonymised_id
     where id = v_listing_id;

    v_listing_mutable := true;
    v_manage_details := true;
    v_lst_action := 'created';
  else
    v_listing_mutable :=
      v_existing_listing_source = 'scraped'
      and v_existing_listing_user is null
      and v_existing_listing_business = v_canonical
      and coalesce(v_existing_listing_claim_status, 'unclaimed') = 'unclaimed'
      and coalesce(v_canonical_claim_status, 'unclaimed') = 'unclaimed';
    v_listing_moderated :=
      coalesce(v_existing_under_review, false)
      or coalesce(v_existing_flag_count, 0) > 0
      or v_existing_listing_status not in ('active', 'expired');

    if v_listing_mutable and not v_listing_moderated then
      update public.listings set
        kind = v_kind,
        vertical = p_vertical,
        side = v_side,
        category_id = v_category_id,
        title = p_name,
        description = format(
          '%s is a %s we found listed on %s%s. This is an UNCLAIMED directory listing -- it was not posted by the business. Is this your business? %s',
          p_name,
          v_descriptor,
          p_source_platform,
          case
            when coalesce(p_suburb, '') <> ''
              then ' in ' || p_suburb || coalesce(', ' || p_state, '')
            else coalesce(' in ' || p_state, '')
          end,
          v_cta
        ),
        postcode = coalesce(p_postcode, postcode),
        state = coalesce(p_state, state),
        business_id = v_canonical,
        source_url = coalesce(p_source_url, source_url),
        scraped_at = v_now,
        expires_at = case
          when v_listing_moderated then expires_at
          else v_now + make_interval(days => p_expiry_days)
        end,
        freshness_status = case
          when v_listing_moderated then freshness_status
          else 'fresh'
        end,
        status = case
          when v_listing_moderated then status
          else 'active'
        end,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'directory_entry', true,
          'suburb', p_suburb,
          'scraped_name', p_name
        )
      where id = v_listing_id;

      v_manage_details := true;
      v_lst_action := case
        when v_existing_listing_vertical is distinct from p_vertical
          or v_existing_listing_kind is distinct from v_kind
          then 'reclassified'
        else 'updated'
      end;
    else
      -- Keep the private source sighting current, but do not alter the public
      -- listing or add a detail row from a different vertical. This also
      -- freezes content while a row is flagged, under review, or in an
      -- administrator/user-controlled lifecycle state.
      v_lst_action := case
        when v_listing_moderated then 'preserved_moderation'
        else 'preserved_owned_or_claimed'
      end;
    end if;
  end if;

  if v_manage_details then
    -- A listing has exactly one vertical-specific shape. Clean old detail rows
    -- as part of the same transaction before installing the requested shape.
    if p_vertical = 'job' then
      delete from public.freight_details where listing_id = v_listing_id;
      delete from public.service_details where listing_id = v_listing_id;
      insert into public.job_details (listing_id)
      values (v_listing_id)
      on conflict (listing_id) do nothing;
    elsif p_vertical = 'freight' then
      delete from public.job_details where listing_id = v_listing_id;
      delete from public.service_details where listing_id = v_listing_id;
      insert into public.freight_details (listing_id, direction)
      values (v_listing_id, 'offering_truck')
      on conflict (listing_id) do update set direction = excluded.direction;
    else
      delete from public.job_details where listing_id = v_listing_id;
      delete from public.freight_details where listing_id = v_listing_id;
      insert into public.service_details (listing_id, direction)
      values (v_listing_id, 'offering')
      on conflict (listing_id) do update set direction = excluded.direction;
    end if;
  end if;

  insert into public.listing_sources (
    listing_id, source_platform, source_url, source_external_id, raw_payload,
    first_seen_at, last_seen_at, active
  ) values (
    v_listing_id, p_source_platform, p_source_url, p_source_external_id,
    coalesce(p_raw_payload, '{}'::jsonb), v_now, v_now, true
  )
  on conflict (source_platform, source_external_id)
    where source_external_id is not null
  do update set
    listing_id = excluded.listing_id,
    source_url = excluded.source_url,
    raw_payload = excluded.raw_payload,
    last_seen_at = v_now,
    active = true
  returning id into v_source_id;

  return jsonb_build_object(
    'business_id', v_business_id,
    'canonical_business_id', v_canonical,
    'listing_id', v_listing_id,
    'listing_source_id', v_source_id,
    'business_action', v_biz_action,
    'listing_action', v_lst_action
  );
end;
$function$;

revoke all on function public.ingest_scraped_business(
  text, text, text, text, text, text, text, text, text, text,
  numeric, numeric, jsonb, integer
) from public;
grant execute on function public.ingest_scraped_business(
  text, text, text, text, text, text, text, text, text, text,
  numeric, numeric, jsonb, integer
) to service_role;

-- Post-deploy diagnostic (expected to return no rows after affected source IDs
-- have been re-imported):
-- select l.id, l.kind, l.vertical,
--        exists (select 1 from public.job_details j where j.listing_id = l.id) as has_job,
--        exists (select 1 from public.freight_details f where f.listing_id = l.id) as has_freight,
--        exists (select 1 from public.service_details s where s.listing_id = l.id) as has_service
--   from public.listings l
--  where l.data_source = 'scraped'
--    and ((l.vertical = 'job' and (
--           exists (select 1 from public.freight_details f where f.listing_id = l.id)
--        or exists (select 1 from public.service_details s where s.listing_id = l.id)))
--      or (l.vertical = 'freight' and (
--           exists (select 1 from public.job_details j where j.listing_id = l.id)
--        or exists (select 1 from public.service_details s where s.listing_id = l.id)))
--      or (l.vertical = 'service' and (
--           exists (select 1 from public.job_details j where j.listing_id = l.id)
--        or exists (select 1 from public.freight_details f where f.listing_id = l.id))));
