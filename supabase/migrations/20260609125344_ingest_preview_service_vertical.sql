-- ============================================================
-- Migration: ingest_preview_service_vertical
-- ============================================================
-- Project : csisezoohgfrpjrhkmls
-- Date    : 2026-06-09
-- Type    : CREATE OR REPLACE both scraped-directory functions to ADD the
--           'service' vertical (rural supply stores -> Services). ADDITIVE only:
--           the 'job' and 'freight' branches are preserved byte-for-byte; this
--           just adds a third branch. No table/schema change, no data change.
--
-- For a scraped service row:
--   vertical = 'service'        (listings_vertical_check allows it)
--   side     = 'supply'         (a supplier offers)
--   kind     = 'service_offering' (listings_kind_check has no bare 'service')
--   pillar   = 'services'       (categories pillar)
--   category fallback = 'services-other' (active catch-all)
--   service_details.direction = 'offering' (NOT NULL, check = offering|requesting)
-- Same guarantees as job/freight: scraped + unclaimed + source-attributed,
-- place_id dedup, 45-day expiry, contact columns left null (no harvest vector).
-- ============================================================

create or replace function public.ingest_scraped_business(
  p_vertical text, p_source_platform text, p_source_external_id text, p_source_url text,
  p_name text, p_category_slug text, p_postcode text, p_suburb text, p_state text,
  p_website text, p_geo_lat numeric, p_geo_lng numeric, p_raw_payload jsonb,
  p_expiry_days integer default 45)
returns jsonb
language plpgsql
set search_path to 'public', 'extensions'
as $function$
declare
  v_country  text := 'AU';
  v_pillar   text := case p_vertical
                       when 'job' then 'jobs'
                       when 'freight' then 'freight'
                       when 'service' then 'services'
                     end;
  v_kind     text := case when p_vertical = 'service' then 'service_offering' else p_vertical end;
  v_side     text := case when p_vertical = 'job' then 'demand' else 'supply' end;
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
  v_cta      text := case p_vertical
                       when 'service' then 'Claim it to manage the details and list what you supply.'
                       else 'Claim it to manage the details and add a real job ad.'
                     end;
  v_now      timestamptz := now();
  v_category_id uuid;
  v_business_id uuid;
  v_canonical   uuid;
  v_listing_id  uuid;
  v_source_id   uuid;
  v_biz_action  text;
  v_lst_action  text;
begin
  if p_vertical not in ('job','freight','service') then
    raise exception 'ingest: vertical must be job, freight or service, got %', p_vertical;
  end if;
  if p_source_platform is null or p_source_url is null or p_source_external_id is null then
    raise exception 'ingest: source_platform, source_url, source_external_id are required for scraped rows';
  end if;
  if p_name is null or p_postcode is null then
    raise exception 'ingest: name and postcode are required';
  end if;

  select id into v_category_id from public.categories
   where country_code = v_country and pillar = v_pillar and slug = p_category_slug and active = true
   limit 1;
  if v_category_id is null then
    select id into v_category_id from public.categories
     where country_code = v_country and pillar = v_pillar and slug = v_fallback
     limit 1;
  end if;
  if v_category_id is null then
    raise exception 'ingest: no category for vertical % (looked up % and %)', p_vertical, p_category_slug, v_fallback;
  end if;

  select id, coalesce(canonical_business_id, id)
    into v_business_id, v_canonical
    from public.businesses
   where source_platform = p_source_platform
     and source_external_id = p_source_external_id
   limit 1;

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
    v_canonical  := v_business_id;
    v_biz_action := 'created';
  else
    update public.businesses set
      trading_name     = coalesce(trading_name, p_name),
      postcode         = coalesce(p_postcode, postcode),
      state_code       = coalesce(p_state, state_code),
      geo_lat          = coalesce(p_geo_lat, geo_lat),
      geo_lng          = coalesce(p_geo_lng, geo_lng),
      website_url      = coalesce(website_url, p_website),
      source_url       = coalesce(p_source_url, source_url),
      last_verified_at = v_now
    where id = v_business_id;
    v_biz_action := 'updated';
  end if;

  select id into v_listing_id from public.listings
   where source_platform = p_source_platform
     and source_external_id = p_source_external_id
   limit 1;

  if v_listing_id is null then
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
        '%s is a %s we found listed on %s%s. This is an UNCLAIMED directory listing — it was not posted by the business. Is this your business? %s',
        p_name,
        v_descriptor,
        p_source_platform,
        case when coalesce(p_suburb,'') <> '' then ' in '||p_suburb||coalesce(', '||p_state,'') else coalesce(' in '||p_state,'') end,
        v_cta
      ),
      p_postcode, p_state,
      null, null,
      'scraped', p_source_platform, p_source_url, p_source_external_id,
      v_now, v_now + make_interval(days => p_expiry_days), 'fresh', 'active', null,
      jsonb_build_object('directory_entry', true, 'suburb', p_suburb, 'scraped_name', p_name),
      'pending-' || gen_random_uuid()::text
    )
    returning id into v_listing_id;

    update public.listings
       set slug = left(regexp_replace(regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'),
                                      '(^-+|-+$)', '', 'g'), 60)
                  || '-' || p_postcode || '-' || anonymised_id
     where id = v_listing_id;

    v_lst_action := 'created';
  else
    update public.listings set
      title            = p_name,
      postcode         = coalesce(p_postcode, postcode),
      state            = coalesce(p_state, state),
      business_id      = v_canonical,
      source_url       = coalesce(p_source_url, source_url),
      scraped_at       = v_now,
      expires_at       = v_now + make_interval(days => p_expiry_days),
      freshness_status = 'fresh',
      status           = case when status in ('hidden_flagged','deleted_by_admin','deleted_by_user','closed')
                              then status else 'active' end
    where id = v_listing_id;
    v_lst_action := 'updated';
  end if;

  if p_vertical = 'job' then
    insert into public.job_details (listing_id) values (v_listing_id)
      on conflict (listing_id) do nothing;
  elsif p_vertical = 'freight' then
    insert into public.freight_details (listing_id, direction)
      values (v_listing_id, 'offering_truck')
      on conflict (listing_id) do update set direction = excluded.direction;
  else  -- service: a scraped supplier is offering
    insert into public.service_details (listing_id, direction)
      values (v_listing_id, 'offering')
      on conflict (listing_id) do nothing;
  end if;

  insert into public.listing_sources (
    listing_id, source_platform, source_url, source_external_id, raw_payload,
    first_seen_at, last_seen_at, active
  ) values (
    v_listing_id, p_source_platform, p_source_url, p_source_external_id, p_raw_payload,
    v_now, v_now, true
  )
  on conflict (source_platform, source_external_id) where source_external_id is not null
  do update set
    listing_id  = excluded.listing_id,
    source_url  = excluded.source_url,
    raw_payload = excluded.raw_payload,
    last_seen_at = v_now,
    active      = true
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

revoke all on function public.ingest_scraped_business(text,text,text,text,text,text,text,text,text,text,numeric,numeric,jsonb,integer) from public;
grant execute on function public.ingest_scraped_business(text,text,text,text,text,text,text,text,text,text,numeric,numeric,jsonb,integer) to service_role;

-- ------------------------------------------------------------

create or replace function public.preview_scraped_import(p_records jsonb)
returns jsonb
language plpgsql
set search_path to 'public', 'extensions'
as $function$
declare
  v_country text := 'AU';
  rec       jsonb;
  v_vertical text; v_pillar text; v_slug text; v_name text; v_postcode text;
  v_cat_id uuid; v_cat_label text; v_cat_resolved text;
  v_biz_id uuid; v_lst_id uuid; v_lst_slug text;
  v_biz_action text; v_lst_action text;
  v_errors   text[]; v_warnings text[];
  v_seen     jsonb := '{}'::jsonb;
  v_key      text;
  v_rows     jsonb := '[]'::jsonb;
  v_total int := 0; v_valid int := 0; v_invalid int := 0;
  v_create int := 0; v_update int := 0; v_dupes int := 0;
begin
  if jsonb_typeof(p_records) <> 'array' then
    raise exception 'preview_scraped_import: p_records must be a JSON array';
  end if;

  for rec in select value from jsonb_array_elements(p_records)
  loop
    v_total := v_total + 1;
    v_errors := array[]::text[];
    v_warnings := array[]::text[];
    v_vertical := rec->>'vertical';
    v_name     := rec->>'name';
    v_postcode := rec->>'postcode';

    if v_vertical is null or v_vertical not in ('job','freight','service') then
      v_errors := array_append(v_errors, 'vertical must be job, freight or service');
    end if;
    if coalesce(v_name,'') = '' then
      v_errors := array_append(v_errors, 'name required');
    end if;
    if v_postcode is null or v_postcode !~ '^[0-9]{4}$' then
      v_errors := array_append(v_errors, 'postcode must be 4 digits');
    end if;
    if coalesce(rec->>'source_external_id','') = '' then
      v_errors := array_append(v_errors, 'source_external_id (place_id) required');
    end if;
    if coalesce(rec->>'source_url','') = '' then
      v_errors := array_append(v_errors, 'source_url required (scraped trust guard)');
    end if;
    if coalesce(rec->>'source_platform','') = '' then
      v_errors := array_append(v_errors, 'source_platform required (scraped trust guard)');
    end if;

    v_key := coalesce(rec->>'source_platform','') || '|' || coalesce(rec->>'source_external_id','');
    if rec->>'source_external_id' is not null and v_seen ? v_key then
      v_warnings := array_append(v_warnings, 'duplicate place_id within this batch — would resolve to one row');
      v_dupes := v_dupes + 1;
    elsif rec->>'source_external_id' is not null then
      v_seen := v_seen || jsonb_build_object(v_key, true);
    end if;

    v_cat_resolved := null; v_cat_label := null;
    v_biz_action := null; v_lst_action := null; v_lst_slug := null;

    if v_vertical in ('job','freight','service') then
      v_pillar := case v_vertical when 'job' then 'jobs' when 'freight' then 'freight' when 'service' then 'services' end;
      v_slug   := rec->>'category_slug';
      select id, label into v_cat_id, v_cat_label from public.categories
        where country_code=v_country and pillar=v_pillar and slug=v_slug and active=true limit 1;
      if v_cat_id is null then
        v_slug := case v_vertical when 'job' then 'jobs-other' when 'freight' then 'freight-other' when 'service' then 'services-other' end;
        select id, label into v_cat_id, v_cat_label from public.categories
          where country_code=v_country and pillar=v_pillar and slug=v_slug limit 1;
        if (rec->>'category_slug') is not null and (rec->>'category_slug') <> v_slug then
          v_warnings := array_append(v_warnings,
            format('category "%s" not found — fell back to %s', rec->>'category_slug', v_slug));
        end if;
      end if;
      v_cat_resolved := v_slug;

      select id into v_biz_id from public.businesses
        where source_platform=rec->>'source_platform' and source_external_id=rec->>'source_external_id' limit 1;
      v_biz_action := case when v_biz_id is null then 'would_create' else 'would_update' end;

      select id, slug into v_lst_id, v_lst_slug from public.listings
        where source_platform=rec->>'source_platform' and source_external_id=rec->>'source_external_id' limit 1;
      v_lst_action := case when v_lst_id is null then 'would_create' else 'would_update' end;
    end if;

    if array_length(v_errors,1) is null then
      v_valid := v_valid + 1;
      if v_lst_action = 'would_create' then v_create := v_create + 1; else v_update := v_update + 1; end if;
    else
      v_invalid := v_invalid + 1;
    end if;

    v_rows := v_rows || jsonb_build_object(
      'name', v_name,
      'vertical', v_vertical,
      'side', case when v_vertical='job' then 'demand'
                   when v_vertical in ('freight','service') then 'supply'
                   else null end,
      'kind', v_vertical,
      'postcode', v_postcode,
      'suburb', rec->>'suburb',
      'state', rec->>'state',
      'source_platform', rec->>'source_platform',
      'source_external_id', rec->>'source_external_id',
      'source_url', rec->>'source_url',
      'category_input', rec->>'category_slug',
      'category_resolved', v_cat_resolved,
      'category_label', v_cat_label,
      'data_source', 'scraped',
      'claim_status', 'unclaimed',
      'business_action', v_biz_action,
      'listing_action', v_lst_action,
      'existing_listing_slug', v_lst_slug,
      'expires_in_days', 45,
      'valid', (array_length(v_errors,1) is null),
      'errors', to_jsonb(v_errors),
      'warnings', to_jsonb(v_warnings)
    );
  end loop;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'total', v_total, 'valid', v_valid, 'invalid', v_invalid,
      'would_create', v_create, 'would_update', v_update, 'intra_batch_duplicates', v_dupes
    ),
    'rows', v_rows
  );
end;
$function$;

revoke all on function public.preview_scraped_import(jsonb) from public;
grant execute on function public.preview_scraped_import(jsonb) to service_role;

-- ============================================================
-- ROLLBACK: re-apply the prior bodies from
--   20260608151703_business_source_key_and_ingest_fn.sql  (ingest)
--   20260608160031_preview_scraped_import_fn.sql          (preview)
-- (Both are additive here; rollback only needed to drop the 'service' branch.)
-- ============================================================
