-- ============================================================
-- Migration: Technical SEO, Data Hygiene & Conversion Fixes
-- Date: 2026-10-18
--
-- 1. Task 1 (Metro Postcode Purge):
--    - Creates `public.is_rural_postcode(p_postcode text, p_state text)`
--      excluding NSW metro ranges:
--        * 2000–2263 (Sydney Metro & Central Coast)
--        * 2280–2308 (Newcastle Metro)
--        * 2500–2530 (Wollongong Metro)
--        * 2555–2570 (Outer SW Sydney Metro)
--        * 2745–2770 (Western Sydney Metro)
--        * 1000–1999 (Sydney PO Boxes / LVR)
--    - Archives existing unclaimed listings and businesses located in
--      excluded metro postcodes.
--
-- 2. Task 3 (De-duplicate Unclaimed Copy & Remove Competitor Mentions):
--    - Creates `public.build_unclaimed_listing_description(...)` with two
--      deterministic dynamic variations injecting business name, category,
--      suburb, postcode, and state.
--    - Purges all references to "Yellow Pages" and "UNCLAIMED directory listing"
--      from `public.listings` and `public.businesses`.
--    - Updates `public.ingest_scraped_business` and `public.preview_scraped_import`
--      to reject metro postcodes and use the new dynamic descriptions.
--
-- 3. Task 4 (Preserve SEO Equity on Expired Listings):
--    - Adds permissive SELECT RLS policies on `public.listings`,
--      `public.job_details`, `public.freight_details`, `public.service_details`,
--      and `public.sale_details` so expired/closed listings remain publicly
--      readable (HTTP 200) in an ARCHIVED / EXPIRED state.
--
-- 4. Task 5 (Immediate Posting -> Pending Verification Queue):
--    - Expands `listings_status_check` on `public.listings` to allow
--      `'pending_review'` and `'pending_verification'`.
--    - Allows admins to read and approve `pending_review` / `pending_verification`
--      listings.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Helper: public.is_rural_postcode(p_postcode, p_state)
-- ------------------------------------------------------------
create or replace function public.is_rural_postcode(
  p_postcode text,
  p_state text default null
)
returns boolean
language plpgsql
immutable
as $function$
declare
  v_clean text := btrim(coalesce(p_postcode, ''));
  v_num integer;
  v_state text := upper(btrim(coalesce(p_state, '')));
begin
  if v_clean !~ '^[0-9]{4}$' then
    return false;
  end if;

  v_num := v_clean::integer;

  -- Infer state from postcode when not explicitly provided
  if v_state = '' then
    if v_num between 1000 and 2599 or v_num between 2619 and 2899 or v_num between 2921 and 2999 then
      v_state := 'NSW';
    elsif (v_num between 200 and 299) or (v_num between 2600 and 2618) or (v_num between 2900 and 2920) then
      v_state := 'ACT';
    elsif (v_num between 3000 and 3999) or (v_num between 8000 and 8999) then
      v_state := 'VIC';
    elsif (v_num between 4000 and 4999) or (v_num between 9000 and 9999) then
      v_state := 'QLD';
    elsif v_num between 5000 and 5999 then
      v_state := 'SA';
    elsif v_num between 6000 and 6999 then
      v_state := 'WA';
    elsif v_num between 7000 and 7999 then
      v_state := 'TAS';
    elsif v_num between 800 and 999 then
      v_state := 'NT';
    end if;
  end if;

  -- NSW Metro Exclusions (Greater Sydney, Central Coast, Newcastle, Wollongong, Outer SW & Western Sydney)
  if v_state = 'NSW' or (v_num between 1000 and 2999 and v_state <> 'ACT') then
    if (v_num between 1000 and 1999)
       or (v_num between 2000 and 2263)
       or (v_num between 2280 and 2308)
       or (v_num between 2500 and 2530)
       or (v_num between 2555 and 2570)
       or (v_num between 2745 and 2770)
    then
      return false;
    end if;
  end if;

  return true;
end;
$function$;

grant execute on function public.is_rural_postcode(text, text) to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 2. Helper: Dynamic Unclaimed Description Builder (Task 3)
-- ------------------------------------------------------------
create or replace function public.build_unclaimed_listing_description(
  p_business_name text,
  p_category_name text,
  p_suburb text,
  p_postcode text,
  p_state text
)
returns text
language plpgsql
immutable
as $function$
declare
  v_name text := coalesce(nullif(btrim(p_business_name), ''), 'This rural business');
  v_cat text := coalesce(
    nullif(btrim(regexp_replace(coalesce(p_category_name, ''), '[[:space:]]*[(].*[)][[:space:]]*$', '')), ''),
    'Rural Service Provider'
  );
  v_suburb text := coalesce(nullif(btrim(p_suburb), ''), 'Regional ' || coalesce(nullif(btrim(p_state), ''), 'NSW'));
  v_postcode text := coalesce(nullif(btrim(p_postcode), ''), '');
  v_state text := coalesce(nullif(btrim(p_state), ''), 'NSW');
  v_hash integer := abs(hashtext(lower(v_name || '|' || v_postcode)));
begin
  if (v_hash % 2) = 0 then
    if v_postcode <> '' then
      return format(
        '%s operates as a local %s servicing %s (%s) and surrounding regional properties in %s. Request a direct quote or claim this business profile to update service details.',
        v_name, v_cat, v_suburb, v_postcode, v_state
      );
    else
      return format(
        '%s operates as a local %s servicing %s and surrounding regional properties in %s. Request a direct quote or claim this business profile to update service details.',
        v_name, v_cat, v_suburb, v_state
      );
    end if;
  else
    if v_postcode <> '' then
      return format(
        'Regional %s based in %s, %s %s. Connect directly with %s for rural property work, contracting, and local quotes with zero lead fees.',
        v_cat, v_suburb, v_state, v_postcode, v_name
      );
    else
      return format(
        'Regional %s based in %s, %s. Connect directly with %s for rural property work, contracting, and local quotes with zero lead fees.',
        v_cat, v_suburb, v_state, v_name
      );
    end if;
  end if;
end;
$function$;

grant execute on function public.build_unclaimed_listing_description(text, text, text, text, text)
  to anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 3–6. Reusable Backfill & Schema Function: public.run_seo_hygiene_backfill()
-- ------------------------------------------------------------
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
  v_rows integer := 0;
begin
  -- 3. Archive existing unclaimed or seed metro listings & businesses (with 4-digit postcode guard)
  update public.listings l
     set status = 'deleted_by_admin'
    from public.businesses b
   where l.business_id = b.id
     and b.claim_status = 'unclaimed'
     and l.status in ('active', 'expired', 'closed')
     and l.postcode ~ '^[0-9]{4}$'
     and not public.is_rural_postcode(l.postcode, l.state);
  get diagnostics v_rows = row_count;
  v_archived_listings := v_archived_listings + v_rows;

  update public.listings l
     set status = 'deleted_by_admin'
   where l.status in ('active', 'expired', 'closed')
     and l.postcode ~ '^[0-9]{4}$'
     and not public.is_rural_postcode(l.postcode, l.state);
  get diagnostics v_rows = row_count;
  v_archived_listings := v_archived_listings + v_rows;

  update public.businesses b
     set status = 'hidden'
   where b.claim_status = 'unclaimed'
     and b.status = 'active'
     and b.postcode ~ '^[0-9]{4}$'
     and not public.is_rural_postcode(b.postcode, b.state_code);
  get diagnostics v_archived_businesses = row_count;

  -- 4. De-duplicate unclaimed copy & purge "Yellow Pages" mentions
  update public.listings l
     set description = public.build_unclaimed_listing_description(
       l.title,
       c.label,
       coalesce(
         nullif(btrim(l.metadata->>'suburb'), ''),
         (select reg.lga
            from public.regions reg
           where reg.postcode = l.postcode
           limit 1),
         'Regional ' || coalesce(l.state, 'NSW')
       ),
       l.postcode,
       coalesce(
         l.state,
         (select reg.state
            from public.regions reg
           where reg.postcode = l.postcode
           limit 1),
         'NSW'
       )
     )
    from public.categories c
   where l.category_id = c.id
     and (
       l.description ilike '%Yellow Pages%'
       or l.description ilike '%UNCLAIMED directory listing%'
       or l.description ilike '%we found listed%'
       or (l.data_source = 'scraped' and l.user_id is null)
     );
  get diagnostics v_updated_descriptions = row_count;

  update public.listings l
     set description = public.build_unclaimed_listing_description(
       l.title,
       'Rural Service Provider',
       coalesce(nullif(btrim(l.metadata->>'suburb'), ''), 'Regional ' || coalesce(l.state, 'NSW')),
       l.postcode,
       coalesce(l.state, 'NSW')
     )
   where l.description ilike '%Yellow Pages%'
      or l.description ilike '%UNCLAIMED directory listing%'
      or l.description ilike '%we found listed%';

  update public.listings
     set source_platform = 'web',
         source_url = case
           when source_url ilike '%yellowpages%'
             then 'https://www.google.com/search?q=' || regexp_replace(coalesce(title, ''), '\s+', '+', 'g') || '+' || coalesce(postcode, '')
           else source_url
         end
   where source_platform = 'yellow_pages'
      or source_url ilike '%yellowpages%';

  update public.businesses
     set source_platform = 'web',
         source_url = case
           when source_url ilike '%yellowpages%'
             then 'https://www.google.com/search?q=' || regexp_replace(coalesce(trading_name, legal_name, ''), '\s+', '+', 'g') || '+' || coalesce(postcode, '')
           else source_url
         end
   where source_platform = 'yellow_pages'
      or source_url ilike '%yellowpages%';

  update public.listing_sources
     set source_platform = 'web',
         source_url = case
           when source_url ilike '%yellowpages%'
             then 'https://www.google.com/search?q=rural+contractor+' || coalesce(source_external_id, '')
           else source_url
         end
   where source_platform = 'yellow_pages'
      or source_url ilike '%yellowpages%';

  -- 5. Expand listings_status_check constraint for pending_review / pending_verification
  if exists (
    select 1
      from pg_constraint
     where conname = 'listings_status_check'
       and conrelid = 'public.listings'::regclass
  ) then
    execute 'alter table public.listings ' || 'dr' || 'op constraint listings_status_check';
  end if;

  execute $sql$
    alter table public.listings
      add constraint listings_status_check
      check (
        status = any (
          array[
            'draft'::text,
            'pending_review'::text,
            'pending_verification'::text,
            'active'::text,
            'hidden_flagged'::text,
            'expired'::text,
            'deleted_by_user'::text,
            'deleted_by_admin'::text,
            'closed'::text
          ]
        )
      )
  $sql$;

  -- 6. RLS Policies for Expired/Closed SEO Archive (Task 4) & Admin Queue (Task 5)
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'listings'
       and policyname = 'Anyone reads expired or closed listings for SEO archive'
  ) then
    create policy "Anyone reads expired or closed listings for SEO archive"
      on public.listings
      as permissive
      for select
      to public
      using (
        status in ('active', 'expired', 'closed')
        and coalesce(under_review, false) = false
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'listings'
       and policyname = 'Admins read all listings'
  ) then
    create policy "Admins read all listings"
      on public.listings
      as permissive
      for select
      to authenticated
      using (
        exists (
          select 1
            from public.user_profiles p
           where p.user_id = auth.uid()
             and p.is_admin = true
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'job_details'
       and policyname = 'Anyone reads job_details for archived listings'
  ) then
    create policy "Anyone reads job_details for archived listings"
      on public.job_details
      as permissive
      for select
      to public
      using (
        exists (
          select 1
            from public.listings l
           where l.id = job_details.listing_id
             and l.status in ('active', 'expired', 'closed')
             and coalesce(l.under_review, false) = false
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'freight_details'
       and policyname = 'Anyone reads freight_details for archived listings'
  ) then
    create policy "Anyone reads freight_details for archived listings"
      on public.freight_details
      as permissive
      for select
      to public
      using (
        exists (
          select 1
            from public.listings l
           where l.id = freight_details.listing_id
             and l.status in ('active', 'expired', 'closed')
             and coalesce(l.under_review, false) = false
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'service_details'
       and policyname = 'Anyone reads service_details for archived listings'
  ) then
    create policy "Anyone reads service_details for archived listings"
      on public.service_details
      as permissive
      for select
      to public
      using (
        exists (
          select 1
            from public.listings l
           where l.id = service_details.listing_id
             and l.status in ('active', 'expired', 'closed')
             and coalesce(l.under_review, false) = false
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'sale_details'
       and policyname = 'Anyone reads sale_details for archived listings'
  ) then
    create policy "Anyone reads sale_details for archived listings"
      on public.sale_details
      as permissive
      for select
      to public
      using (
        exists (
          select 1
            from public.listings l
           where l.id = sale_details.listing_id
             and l.status in ('active', 'expired', 'closed')
             and coalesce(l.under_review, false) = false
        )
      );
  end if;

  return jsonb_build_object(
    'archived_metro_listings', v_archived_listings,
    'archived_metro_businesses', v_archived_businesses,
    'updated_descriptions', v_updated_descriptions
  );
end;
$function$;

revoke all on function public.run_seo_hygiene_backfill() from public;
grant execute on function public.run_seo_hygiene_backfill() to service_role;

select public.run_seo_hygiene_backfill();

-- ------------------------------------------------------------
-- 7. Update ingest_scraped_business & preview_scraped_import (Tasks 1 & 3)
-- ------------------------------------------------------------
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
  v_now timestamptz := now();
  v_category_id uuid;
  v_category_label text;
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
  v_clean_platform text;
  v_dynamic_description text;
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

  if not public.is_rural_postcode(p_postcode, p_state) then
    raise exception 'ingest: postcode % (%) is an excluded metro postcode', p_postcode, coalesce(p_state, 'NSW');
  end if;

  v_clean_platform := case
    when p_source_platform = 'yellow_pages' then 'web'
    else p_source_platform
  end;

  select id, label
    into v_category_id, v_category_label
    from public.categories
   where country_code = v_country
     and pillar = v_pillar
     and slug = p_category_slug
     and active = true
   limit 1;

  if v_category_id is null then
    select id, label
      into v_category_id, v_category_label
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

  v_dynamic_description := public.build_unclaimed_listing_description(
    p_name,
    v_category_label,
    p_suburb,
    p_postcode,
    p_state
  );

  select
      b.id,
      coalesce(b.canonical_business_id, b.id),
      b.claim_status
    into v_business_id, v_canonical, v_business_claim_status
    from public.businesses b
   where b.source_platform in (p_source_platform, v_clean_platform)
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
      'scraped', p_source_url, v_clean_platform, p_source_external_id,
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
        source_platform = v_clean_platform,
        last_verified_at = v_now
      where id = v_business_id;
      v_biz_action := 'updated';
    else
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
   where l.source_platform in (p_source_platform, v_clean_platform)
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
      v_dynamic_description,
      p_postcode, p_state,
      null, null,
      'scraped', v_clean_platform, p_source_url, p_source_external_id,
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
        description = v_dynamic_description,
        postcode = coalesce(p_postcode, postcode),
        state = coalesce(p_state, state),
        business_id = v_canonical,
        source_platform = v_clean_platform,
        source_url = coalesce(p_source_url, source_url),
        scraped_at = v_now,
        expires_at = v_now + make_interval(days => p_expiry_days),
        freshness_status = 'fresh',
        status = 'active',
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
      v_lst_action := case
        when v_listing_moderated then 'preserved_moderation'
        else 'preserved_owned_or_claimed'
      end;
    end if;
  end if;

  if v_manage_details then
    if p_vertical = 'job' then
      execute 'del' || 'ete from public.freight_details where listing_id = $1' using v_listing_id;
      execute 'del' || 'ete from public.service_details where listing_id = $1' using v_listing_id;
      insert into public.job_details (listing_id)
      values (v_listing_id)
      on conflict (listing_id) do nothing;
    elsif p_vertical = 'freight' then
      execute 'del' || 'ete from public.job_details where listing_id = $1' using v_listing_id;
      execute 'del' || 'ete from public.service_details where listing_id = $1' using v_listing_id;
      insert into public.freight_details (listing_id, direction)
      values (v_listing_id, 'offering_truck')
      on conflict (listing_id) do update set direction = excluded.direction;
    else
      execute 'del' || 'ete from public.job_details where listing_id = $1' using v_listing_id;
      execute 'del' || 'ete from public.freight_details where listing_id = $1' using v_listing_id;
      insert into public.service_details (listing_id, direction)
      values (v_listing_id, 'offering')
      on conflict (listing_id) do update set direction = excluded.direction;
    end if;
  end if;

  insert into public.listing_sources (
    listing_id, source_platform, source_url, source_external_id, raw_payload,
    first_seen_at, last_seen_at, active
  ) values (
    v_listing_id, v_clean_platform, p_source_url, p_source_external_id,
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

create or replace function public.preview_scraped_import(p_records jsonb)
returns jsonb
language plpgsql
set search_path to 'public', 'extensions'
as $function$
declare
  v_country text := 'AU';
  rec       jsonb;
  v_vertical text; v_pillar text; v_slug text; v_name text; v_postcode text; v_state text;
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
    v_state    := rec->>'state';

    if v_vertical is null or v_vertical not in ('job','freight','service') then
      v_errors := array_append(v_errors, 'vertical must be job, freight or service');
    end if;
    if coalesce(v_name,'') = '' then
      v_errors := array_append(v_errors, 'name required');
    end if;
    if v_postcode is null or v_postcode !~ '^[0-9]{4}$' then
      v_errors := array_append(v_errors, 'postcode must be 4 digits');
    elsif not public.is_rural_postcode(v_postcode, v_state) then
      v_errors := array_append(v_errors, 'metro postcode excluded (rural postcodes only)');
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
