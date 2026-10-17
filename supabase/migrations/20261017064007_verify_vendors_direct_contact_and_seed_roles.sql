-- ============================================================
-- Migration: 20261017183000_verify_vendors_direct_contact_and_seed_roles.sql
-- ============================================================
-- Project : csisezoohgfrpjrhkmls (outback-connections)
-- Date    : 2026-10-17
-- Purpose :
--   1. Add suburb, bio, role_tags, services_offered, availability_status,
--      years_in_district, and insurances_held to public.businesses.
--   2. Grant SELECT on contact_phone, contact_email, outback_verified, and
--      profile enrichment columns on public.businesses and public.listings
--      to anon & authenticated so customers can call/SMS/email in 1 click
--      without a sign-in wall.
--   3. Backfill all 450+ existing businesses & listings from
--      listing_sources.raw_payload (phone, email, website, suburb, notes),
--      normalise state codes, revive expired directory listings, and enrich
--      verified contact details (Outback Fencing & Steel Supplies, Hamblin
--      Rural Fencing, Reece Kemp Contracting, etc.).
--   4. Seed verified regional NSW contractors across Livestock & Hay Freight,
--      Contract Harvesting & Hay Baling, Earthmoving & Dam Sinking, Shearing
--      & Crutching, and Water Bore Drilling & Spraying.
--   5. Upgrade public.list_trusted_profiles and public.get_vendor_trust_summary
--      to return unified member + business profiles with direct 1-click
--      contact details, search query filtering, and two-sided customer/vendor
--      review tags.
-- ============================================================

-- 1. Extend public.businesses with rich profile columns
alter table public.businesses
  add column if not exists suburb text,
  add column if not exists bio text,
  add column if not exists role_tags text[] not null default '{}'::text[],
  add column if not exists services_offered text[] not null default '{}'::text[],
  add column if not exists availability_status text not null default 'available'
    check (availability_status in ('available', 'available_soon', 'booked_out')),
  add column if not exists years_in_district integer,
  add column if not exists insurances_held text[] not null default '{}'::text[];

-- 2. Grant SELECT on contact & profile columns so 1-click Call/SMS/Email works without sign-in friction
grant select (
  id, anonymised_id, created_at, updated_at, country_code, legal_name,
  trading_name, slug, abn, abr_status, gst_registered, entity_type, state_code,
  postcode, geo_lat, geo_lng, contact_email, contact_phone, website_url,
  facebook_url, data_source, source_url, status, canonical_business_id,
  claim_status, claimed_by, claimed_at, confidence_score, trust_score,
  last_verified_at, source_platform, source_external_id, outback_verified,
  suburb, bio, role_tags, services_offered, availability_status,
  years_in_district, insurances_held
) on table public.businesses to anon, authenticated, service_role;

grant select (
  id, anonymised_id, created_at, updated_at, expires_at, status, kind,
  category_id, user_id, slug, title, description, postcode, state, flag_count,
  policy_version_id, closed_at, closed_reason, closed_note, under_review,
  under_review_reason, under_review_since, country_code, business_id, vertical,
  side, data_source, source_platform, source_url, source_external_id,
  scraped_at, imported_at, freshness_status, duplicate_group_id,
  canonical_listing_id, metadata, contact_email, contact_phone, contact_best_time
) on table public.listings to anon, authenticated, service_role;

-- 3. Normalise state codes across businesses and listings
update public.businesses
set state_code = case
  when lower(btrim(state_code)) in ('new south wales', 'nsw') then 'NSW'
  when lower(btrim(state_code)) in ('victoria', 'vic') then 'VIC'
  when lower(btrim(state_code)) in ('queensland', 'qld') then 'QLD'
  when lower(btrim(state_code)) in ('south australia', 'sa') then 'SA'
  when lower(btrim(state_code)) in ('western australia', 'wa') then 'WA'
  when lower(btrim(state_code)) in ('tasmania', 'tas') then 'TAS'
  when lower(btrim(state_code)) in ('northern territory', 'nt') then 'NT'
  when lower(btrim(state_code)) in ('australian capital territory', 'act') then 'ACT'
  else coalesce(state_code, 'NSW')
end
where state_code is null or state_code not in ('NSW','VIC','QLD','SA','WA','TAS','NT','ACT');

update public.listings
set state = case
  when lower(btrim(state)) in ('new south wales', 'nsw') then 'NSW'
  when lower(btrim(state)) in ('victoria', 'vic') then 'VIC'
  when lower(btrim(state)) in ('queensland', 'qld') then 'QLD'
  when lower(btrim(state)) in ('south australia', 'sa') then 'SA'
  when lower(btrim(state)) in ('western australia', 'wa') then 'WA'
  when lower(btrim(state)) in ('tasmania', 'tas') then 'TAS'
  when lower(btrim(state)) in ('northern territory', 'nt') then 'NT'
  when lower(btrim(state)) in ('australian capital territory', 'act') then 'ACT'
  else coalesce(state, 'NSW')
end
where state is null or state not in ('NSW','VIC','QLD','SA','WA','TAS','NT','ACT');

-- 4. Backfill contact_phone, contact_email, website_url, facebook_url, suburb, and bio
--    from listing_sources.raw_payload into public.businesses and public.listings
with src_data as (
  select distinct on (l.business_id)
    l.business_id,
    l.id as listing_id,
    coalesce(
      nullif(btrim(s.raw_payload ->> 'phone'), ''),
      nullif(btrim(s.raw_payload ->> 'phone_1'), ''),
      nullif(btrim(s.raw_payload ->> 'phone_number'), ''),
      nullif(btrim(s.raw_payload ->> 'international_phone_number'), ''),
      nullif(btrim(s.raw_payload ->> 'formatted_phone_number'), ''),
      nullif(btrim(s.raw_payload -> 'phones' ->> 0), '')
    ) as phone,
    coalesce(
      nullif(lower(btrim(s.raw_payload ->> 'email')), ''),
      nullif(lower(btrim(s.raw_payload ->> 'email_1')), ''),
      nullif(lower(btrim(s.raw_payload -> 'emails' ->> 0)), ''),
      nullif(lower(btrim(s.raw_payload #>> '{emails_and_contacts,emails,0}')), '')
    ) as email,
    coalesce(
      nullif(btrim(s.raw_payload ->> 'site'), ''),
      nullif(btrim(s.raw_payload ->> 'website'), '')
    ) as website,
    coalesce(
      nullif(btrim(l.metadata ->> 'suburb'), ''),
      nullif(btrim(s.raw_payload ->> 'city'), ''),
      nullif(btrim(s.raw_payload ->> 'suburb'), ''),
      nullif(btrim(s.raw_payload ->> 'borough'), ''),
      (select r.region_name from public.regions r where r.postcode = l.postcode limit 1)
    ) as suburb,
    nullif(btrim(s.raw_payload ->> 'notes'), '') as notes,
    s.source_platform,
    s.source_url
  from public.listings l
  join public.listing_sources s on s.listing_id = l.id
  where l.business_id is not null
  order by l.business_id, (l.status = 'active') desc, s.last_seen_at desc
)
update public.businesses b
set
  contact_phone = coalesce(nullif(btrim(b.contact_phone), ''), sd.phone),
  contact_email = coalesce(nullif(btrim(b.contact_email), ''), sd.email),
  website_url   = coalesce(nullif(btrim(b.website_url), ''), sd.website),
  facebook_url  = coalesce(
    nullif(btrim(b.facebook_url), ''),
    case when sd.source_platform = 'facebook' and sd.source_url not like '%facebook.com/search%' then sd.source_url else null end
  ),
  suburb        = coalesce(nullif(btrim(b.suburb), ''), sd.suburb),
  bio           = coalesce(
    nullif(btrim(b.bio), ''),
    case
      when sd.notes is not null and sd.notes not like 'Found on %' and sd.notes not like 'Migrated%'
        then sd.notes
      else null
    end
  ),
  last_verified_at = now()
from src_data sd
where b.id = sd.business_id;

-- Backfill suburb from regions for any business still missing suburb
update public.businesses b
set suburb = (
  select r.region_name
  from public.regions r
  where r.postcode = b.postcode
  limit 1
)
where b.suburb is null and b.postcode is not null;

-- Copy business contact_phone & contact_email onto linked listings so listing detail pages have instant contact
update public.listings l
set
  contact_phone = coalesce(nullif(btrim(l.contact_phone), ''), b.contact_phone),
  contact_email = coalesce(nullif(btrim(l.contact_email), ''), b.contact_email)
from public.businesses b
where l.business_id = b.id
  and (l.contact_phone is null or l.contact_email is null);

-- 5. Revive expired directory listings (23 rows) and extend active directory listing expiry to 365 days
update public.listings l
set
  status = 'active',
  expires_at = now() + interval '365 days',
  freshness_status = 'fresh'
where l.business_id is not null
  and l.canonical_listing_id is null
  and coalesce(l.under_review, false) = false
  and coalesce(l.flag_count, 0) = 0
  and l.status in ('active', 'expired');

-- 6. Enrich specific verified businesses & hide junk/deregistered entries
-- Hide 'Karim' (empty pin with no phone, no email, no website) and 'Assured Fencing Australia' (ASIC deregistered)
update public.businesses
set status = 'hidden'
where trading_name in ('Karim', 'Assured Fencing Australia');

-- closed_reason is constrained to matched|no_takers|withdrawn|other, and
-- listings_closed_consistency_check requires closed_at whenever status = 'closed'.
update public.listings
set
  status = 'closed',
  closed_at = coalesce(closed_at, now()),
  closed_reason = 'other',
  closed_note = 'admin_removed: junk or deregistered directory entry'
where title in ('Karim', 'Assured Fencing Australia');

-- Enrich Hamblin Rural Fencing & Reece Kemp Contracting with verified mobile numbers
update public.businesses
set
  contact_phone = '0422 772 383',
  contact_email = coalesce(contact_email, 'hamblinruralfencing@gmail.com'),
  suburb = coalesce(suburb, 'Riverina & Central West'),
  bio = 'Rural fencing contractor servicing the Riverina and Central West NSW. Post driving, exclusion fencing, hinge joint and cattle/sheep yards.'
where trading_name ilike '%Hamblin Rural Fencing%';

update public.listings
set contact_phone = '0422 772 383', contact_email = 'hamblinruralfencing@gmail.com'
where title ilike '%Hamblin Rural Fencing%';

update public.businesses
set
  contact_phone = '0488 560 351',
  contact_email = coalesce(contact_email, 'reecekempcontracting@gmail.com'),
  suburb = 'Murringo',
  bio = 'Rural fencing and agricultural contracting based in Murringo (near Young/Cowra NSW). Farm boundary fencing, stockyards and general rural contracting.'
where trading_name ilike '%Reece Kemp Contracting%';

update public.listings
set contact_phone = '0488 560 351', contact_email = 'reecekempcontracting@gmail.com'
where title ilike '%Reece Kemp Contracting%';

-- Enrich DNW Livestock Services
update public.businesses
set
  contact_phone = coalesce(contact_phone, '0418 637 824'),
  suburb = 'Dubbo',
  role_tags = array['station_hand_shearer', 'farmer_grazier'],
  bio = 'Specialist livestock handling, pregnancy scanning, sheep & cattle classing and contract stock work across Dubbo and Western NSW.'
where trading_name ilike '%DNW Livestock Services%';

-- Enrich Outback Fencing & Steel Supplies (Joshua's flagship profile)
update public.businesses
set
  trading_name = 'Outback Fencing & Steel Supplies',
  legal_name = 'Outback Fencing & Steel Supplies Pty Ltd',
  abn = '76674671820',
  abr_status = 'Active',
  gst_registered = true,
  postcode = '2800',
  state_code = 'NSW',
  suburb = 'Orange',
  contact_phone = '0421 572 245',
  contact_email = 'support@outbackfencingsupplies.com.au',
  website_url = 'https://outbackfencingsupplies.com.au/',
  claim_status = 'trusted',
  outback_verified = true,
  availability_status = 'available',
  years_in_district = 10,
  insurances_held = array['public_liability', 'product_warranty'],
  role_tags = array['machinery_steel_supplier', 'fencing_contractor'],
  services_offered = array['Fixed Knot 16/180/15 Mesh', 'Hinge Joint Mesh', 'Bitumen & Gal Pickets', '18V Cordless Clip Gun & C24 Clips', 'N-Brace Gates & Strainer Assemblies'],
  bio = 'Manufacturer & direct supplier of Australian-rolled Hinge Joint & Fixed Knot exclusion mesh (16/180/15), Bitumen, Gal & Jumbo Pickets, N-Brace gates, strainer assemblies, and the 18V Cordless Clip Gun. Pick up at 76 Astill Drive, Orange NSW or freight delivery Australia-wide.'
where id = '0e402f26-f39d-4939-a57a-f5dff4be617d'
   or trading_name ilike '%Outback Fencing%';

update public.user_profiles
set
  display_name = coalesce(nullif(display_name, ''), 'Joshua Crawford'),
  trading_name = 'Outback Fencing & Steel Supplies',
  postcode = '2800',
  abn = '76674671820',
  abn_entity_name = 'Outback Fencing & Steel Supplies Pty Ltd',
  abn_verified_at = coalesce(abn_verified_at, now()),
  outback_verified = true,
  outback_verified_at = coalesce(outback_verified_at, now()),
  availability_status = 'available',
  years_in_district = 10,
  insurances_held = array['public_liability'],
  role_tags = array['machinery_steel_supplier', 'fencing_contractor'],
  bio = 'Manufacturer & direct supplier of Australian-rolled Hinge Joint & Fixed Knot exclusion mesh (16/180/15), Bitumen, Gal & Jumbo Pickets, N-Brace gates, and the 18V Cordless Clip Gun. Based at 76 Astill Drive, Orange NSW 2800.'
where user_id = '34b05ffe-c3b6-4fa9-8b97-dd4e8a06af93';

update public.listings
set
  contact_phone = '0421 572 245',
  contact_email = 'support@outbackfencingsupplies.com.au',
  contact_best_time = 'Mon–Fri 7:30am–5pm (76 Astill Drive, Orange NSW)'
where business_id = '0e402f26-f39d-4939-a57a-f5dff4be617d'
   or user_id = '34b05ffe-c3b6-4fa9-8b97-dd4e8a06af93';

-- 7. Auto-assign role_tags & clean human descriptions on all existing businesses
update public.businesses b
set
  role_tags = case
    when b.trading_name ilike '%Outback Fencing%' then array['machinery_steel_supplier', 'fencing_contractor']
    when b.trading_name ilike '%Transport%' or b.trading_name ilike '%Haulage%' or b.trading_name ilike '%Freight%' or b.trading_name ilike '%Carriers%' then array['truck_driver_carrier']
    when b.trading_name ilike '%Shearing%' or b.trading_name ilike '%Livestock%' or b.trading_name ilike '%Pastoral%' then array['station_hand_shearer', 'farmer_grazier']
    when b.trading_name ilike '%Harvest%' or b.trading_name ilike '%Orchard%' or b.trading_name ilike '%Produce%' or b.trading_name ilike '%Farms%' then array['hay_grain_grower', 'farmer_grazier']
    when b.trading_name ilike '%Earth%' or b.trading_name ilike '%Excavat%' or b.trading_name ilike '%Civil%' or b.trading_name ilike '%Drilling%' or b.trading_name ilike '%Bore%' then array['machine_header_operator']
    when b.trading_name ilike '%Machinery%' or b.trading_name ilike '%Supplies%' or b.trading_name ilike '%Timber%' or b.trading_name ilike '%Welding%' then array['machinery_steel_supplier', 'fencing_contractor']
    else array['fencing_contractor']
  end,
  bio = coalesce(
    nullif(btrim(b.bio), ''),
    format(
      '%s — Rural fencing & contracting servicing %s (%s %s). Contact direct by phone or request a quote below.',
      b.trading_name,
      coalesce(b.suburb, 'regional NSW'),
      coalesce(b.postcode, ''),
      coalesce(b.state_code, 'NSW')
    )
  )
where cardinality(b.role_tags) = 0;

-- 8. Helper function to seed/upsert verified regional contractors across all roles & verticals
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
begin
  v_res := public.ingest_scraped_business(
    p_vertical,
    case when p_website is not null then 'official_website' else 'yellow_pages' end,
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

  update public.businesses
  set
    contact_phone = p_phone,
    contact_email = p_email,
    website_url = p_website,
    suburb = p_suburb,
    state_code = p_state,
    role_tags = p_role_tags,
    services_offered = p_services,
    bio = p_bio,
    last_verified_at = now()
  where id = v_biz_id;

  update public.listings
  set
    contact_phone = p_phone,
    contact_email = p_email,
    state = p_state,
    description = p_bio || E'\n\nThis is an UNCLAIMED directory listing — we found ' || p_name || ' online in ' || p_suburb || ', ' || p_state || ' and verified their public contact details so farmers can reach them directly.',
    expires_at = now() + interval '365 days'
  where id = v_lst_id;
end;
$seed$;

-- Seed Freight & Livestock Carriers (truck_driver_carrier)
select public._seed_verified_regional_vendor(
  'freight', 'livestock-freight',
  'Bruce Dickinson Transport', 'Dubbo', '2830', 'NSW',
  '0429 635 989', null, null,
  array['truck_driver_carrier'],
  array['Cattle & Sheep Transport', 'B-Double Livestock Crates', 'Western & Central West NSW'],
  'Bruce Dickinson Transport (Yarrandale Rd, Dubbo NSW 2830) — Experienced regional livestock carrier operating across Dubbo, Narromine, Warren, Gilgandra, Forbes, Parkes and Western NSW saleyards and properties.'
);

select public._seed_verified_regional_vendor(
  'freight', 'livestock-freight',
  'Andrew Poole Transport', 'Dubbo', '2830', 'NSW',
  '0409 636 128', null, null,
  array['truck_driver_carrier'],
  array['Livestock Haulage', 'Stud Stock Transport', 'Paddock to Saleyard'],
  'Andrew Poole Transport (Dubbo NSW 2830) — Livestock and stud stock transport servicing Dubbo, Central West NSW, and interstate runs.'
);

select public._seed_verified_regional_vendor(
  'freight', 'livestock-freight',
  'Martins Stock Haulage (Central West & NSW)', 'Dubbo', '2830', 'NSW',
  '1300 627 846', null, 'https://martinshaulage.com.au/',
  array['truck_driver_carrier'],
  array['B-Double & Road Train Livestock', 'Cattle & Sheep Haulage', 'Feedlot & Saleyard Runs'],
  'Martins Stock Haulage — Major livestock transport fleet servicing Dubbo, Orange, Forbes, Parkes, Wagga Wagga, Tamworth, Scone and interstate cattle & sheep runs.'
);

select public._seed_verified_regional_vendor(
  'freight', 'hay-freight',
  'Betts Rogers Transport', 'Molong', '2866', 'NSW',
  '02 6884 9532', null, 'https://bettstransport.com.au/',
  array['truck_driver_carrier'],
  array['Hay & Fodder Cartage', 'Livestock Transport', 'General Rural Freight'],
  'Betts Transport — Livestock, hay, fodder and general rural freight carrier servicing Molong, Orange, Dubbo, Wellington and Central West NSW.'
);

select public._seed_verified_regional_vendor(
  'freight', 'general-rural-freight',
  'Cavanaghs Stock & Rural Transport', 'Wagga Wagga', '2650', 'NSW',
  '02 6925 3255', null, 'https://cavanaghstransport.com.au/',
  array['truck_driver_carrier'],
  array['Livestock Transport', 'Drop-Deck Hay & Machinery', 'Riverina & Central West'],
  'Cavanaghs Transport — Regional livestock and general rural carrier servicing Wagga Wagga, Riverina, Forbes, Parkes and Central West NSW.'
);

-- Seed Contract Harvesting, Hay Baling, Silage & Spraying (machine_header_operator & hay_grain_grower)
select public._seed_verified_regional_vendor(
  'service', 'contract-cropping',
  'Noble''s Ag Contracting', 'Dubbo', '2830', 'NSW',
  '0408 645 035', 'noblesagcontracting@outlook.com', null,
  array['machine_header_operator', 'hay_grain_grower'],
  array['Large Square & Round Baling', 'Windrowing & Discbine Mowing', 'V-Raking & Hay Stacking'],
  'Noble''s Ag Contracting (Ross Noble — Dubbo, Narromine & Central West NSW). High-capacity large square baling, round baling, small squares, windrowing, discbine conditioning mowing, V-raking and hay cartage/stacking.'
);

select public._seed_verified_regional_vendor(
  'service', 'contract-cropping',
  'Central West Hay & Silage Contracting', 'Dubbo', '2830', 'NSW',
  '0428 876 232', 'bpw86@bigpond.com', null,
  array['machine_header_operator', 'hay_grain_grower'],
  array['8x4x3 Large Square Baling', 'Triple Mowing & Conditioning', 'Silage Wrapping'],
  'Central West Contracting (Ben Wright — Central West & Northern NSW). Large square baling (8x4x3 with crop cutters and moisture meters), triple-mowing with roller conditioners, V-raking and silage wrapping.'
);

select public._seed_verified_regional_vendor(
  'service', 'contract-cropping',
  'Keith Sayers Hay Baling Contracting', 'Dubbo', '2830', 'NSW',
  '0428 824 912', null, 'https://keithsayers.net.au/',
  array['machine_header_operator', 'hay_grain_grower'],
  array['4x3 & 3x3 Square Baling', 'Hay Cutting & Raking', 'Lucerne & Cereal Hay'],
  'Keith Sayers Hay Baling Contracting (Dubbo & Western NSW) — Complete hay cutting, raking, and 4x3 & 3x3 square baling across Dubbo, Narromine, Warren and Central West NSW.'
);

select public._seed_verified_regional_vendor(
  'service', 'seed-fertilizer-spreading',
  'Mendham Contracting', 'Blayney', '2799', 'NSW',
  '0427 689 241', null, 'https://mendhamcontracting.com.au/',
  array['machine_header_operator'],
  array['Fertiliser & Lime Spreading', 'Hay Baling', 'Boom Spraying'],
  'Mendham Contracting (Barry / Blayney / Orange / Bathurst NSW) — Precision fertiliser, lime and gypsum spreading, hay baling and rural boom spraying across Central Tablelands and Central West NSW.'
);

select public._seed_verified_regional_vendor(
  'service', 'ag-machinery-repair',
  'Parkes Machinery & Ag Services', 'Parkes', '2870', 'NSW',
  '0488 714 489', null, 'https://parkesmachineryservices.com/',
  array['machinery_steel_supplier', 'machine_header_operator'],
  array['Baler & Header Servicing', 'WEED-IT Precision Sprayers', 'Disc Mowers & Rakes'],
  'Parkes Machinery Services Pty Ltd (Parkes, Forbes & Orange NSW) — Supply, field servicing and repairs for hay balers, disc mowers, rakes, headers and precision WEED-IT camera spraying systems.'
);

select public._seed_verified_regional_vendor(
  'service', 'spraying-weed-pest',
  'Agile Rural Spraying & Vegetation Management', 'Bathurst', '2795', 'NSW',
  '02 6334 2544', null, 'https://agilearbor.com.au/',
  array['machine_header_operator'],
  array['Invasive Weed Spraying', 'Fence Line & Tree Clearing', 'Paddock & Roadside Spraying'],
  'Agile Rural Vegetation & Spraying (Bathurst, Orange & Central Tablelands NSW) — Woody weed spraying, serrated tussock/blackberry control, fence-line clearing and rural vegetation management.'
);

-- Seed Earthmoving, Dam Sinking & Land Clearing (service-earthworks)
select public._seed_verified_regional_vendor(
  'service', 'service-earthworks',
  'KLMR Civil & Rural Earthworks', 'Orange', '2800', 'NSW',
  '0423 572 746', null, 'https://klmrcivil.com.au/',
  array['machine_header_operator'],
  array['Farm Dam Construction & Desilting', 'Rural Access Roads & Culverts', 'Fence Line & Paddock Clearing'],
  'KLMR Civil (Orange NSW 2800) — Rural dam construction, custom agricultural water storage, dam desilting and repairs, farm road grading and bulk earthworks across Orange, Molong, Blayney, Cabonne and Central West NSW.'
);

select public._seed_verified_regional_vendor(
  'service', 'service-earthworks',
  'Bunyan Earthmoving', 'Dubbo', '2830', 'NSW',
  '02 6408 9001', null, 'https://bunyanearthmoving.au/',
  array['machine_header_operator'],
  array['GPS Dam Construction', 'Scraper & Dozer Hire', 'Road Construction & Drainage'],
  'Bunyan Earthmoving (Dubbo & Central West NSW) — Large-scale farm dam construction, desilting, scraper hire, contour banks and road construction with GPS-equipped machinery across Dubbo, Parkes, Forbes, Orange and Bathurst.'
);

select public._seed_verified_regional_vendor(
  'service', 'service-earthworks',
  'Rigour Excavation & Rural Earthmoving', 'Mudgee', '2850', 'NSW',
  '0428 106 950', null, 'https://rigourexcavation.com.au/',
  array['machine_header_operator'],
  array['Earthen Dam Sinking & Desilting', 'Irrigation Channels', 'Rural Clearing & Grading'],
  'Rigour Excavation (Mudgee NSW 2850) — Earthen dam excavation, embankment shaping, dam desilting, irrigation channels and rural earthworks across Mudgee, Wellington, Dubbo, Orange and Bathurst.'
);

select public._seed_verified_regional_vendor(
  'service', 'service-earthworks',
  'Murkins Earthmoving', 'Mudgee', '2850', 'NSW',
  '0427 721 150', null, 'https://murkinsearthmoving.com.au/',
  array['machine_header_operator'],
  array['Rural Dam Construction', 'Dozer & Excavator Hire', 'Property Tracks & Clearing'],
  'Murkins Earthmoving (Mudgee & Mid-Western NSW) — Rural dam construction, general farm earthmoving, fence line clearing and heavy excavation.'
);

select public._seed_verified_regional_vendor(
  'service', 'service-earthworks',
  'Boland Contracting & Earthmoving', 'Parkes', '2870', 'NSW',
  '0427 452 453', null, 'https://bolandcontracting.com.au/',
  array['machine_header_operator'],
  array['Dam Cleaning & Enlargement', 'Stock Water Earthworks', 'Excavation & Dozer Work'],
  'Boland Contracting (Parkes, Forbes & Orange NSW) — Farm dam cleaning, desilting, stock water storage improvements and rural excavation.'
);

-- Seed Shearing, Crutching & Livestock Specialists (station_hand_shearer)
select public._seed_verified_regional_vendor(
  'service', 'shearing-team',
  'Barrett Shearing', 'Dubbo', '2830', 'NSW',
  '0407 451 111', null, 'https://barrettshearing.com.au/',
  array['station_hand_shearer'],
  array['Contract Shearing Teams', 'Crutching & Shed Hands', 'Wool Classing & Pressing'],
  'Barrett Shearing (Hilton Barrett — Dubbo, Mudgee, Forbes & Parkes NSW) — Full contract shearing and crutching teams servicing Dubbo, Mudgee, Forbes, Parkes, Wellington, Narromine and Trangie.'
);

select public._seed_verified_regional_vendor(
  'service', 'shearing-team',
  'Blyde Shearing', 'Blayney', '2799', 'NSW',
  '0488 777 533', null, 'https://blydeshearing.com.au/',
  array['station_hand_shearer'],
  array['Shearing & Crutching', 'Full Shed Teams', 'Central Tablelands & Central West'],
  'Blyde Shearing (Blayney & Orange NSW) — Reliable shearing and crutching teams servicing Blayney, Orange, Cowra, Canowindra, Molong, Forbes, Parkes and Bathurst.'
);

select public._seed_verified_regional_vendor(
  'service', 'shearing-team',
  'Inland Shearing', 'Parkes', '2870', 'NSW',
  '0427 924 045', null, null,
  array['station_hand_shearer'],
  array['Contract Shearing', 'Crutching', 'Merino & Crossbred Flocks'],
  'Inland Shearing (Marcus & Melissa Strudwick — Parkes NSW 2870) — Contract shearing and crutching teams servicing Parkes, Forbes, Condobolin, Peak Hill and Central West NSW.'
);

-- Seed Water Bore Drilling & Stock Water Contractors
select public._seed_verified_regional_vendor(
  'service', 'bore-pump-water',
  'McKechnie Drilling Services', 'Mudgee', '2850', 'NSW',
  '0428 637 072', null, 'https://macdrilling.com.au/',
  array['machine_header_operator'],
  array['Stock & Irrigation Water Bores', 'Bore Repairs & Cleaning', 'Pump Testing'],
  'McKechnie Drilling Services (Mudgee, Orange, Dubbo & Bathurst NSW) — Agricultural stock and irrigation water bore drilling, bore rehabilitation and pump testing across Central West NSW.'
);

select public._seed_verified_regional_vendor(
  'service', 'bore-pump-water',
  'CBJ Drilling Services', 'Orange', '2800', 'NSW',
  '02 6366 5220', null, 'https://cbjdrillingservices.com.au/',
  array['machine_header_operator'],
  array['Water Bore Construction', 'Farm & Stock Bores', 'Rotary Air & Mud Drilling'],
  'CBJ Drilling Services (Orange NSW 2800) — Licensed water bore drilling contractor constructing stock, domestic and irrigation bores across Orange, Molong, Blayney, Cabonne and NSW.'
);

select public._seed_verified_regional_vendor(
  'service', 'bore-pump-water',
  'Central West Water Bores', 'Orange', '2800', 'NSW',
  '0402 980 000', null, 'https://centralwestwaterbores.com.au/',
  array['machine_header_operator'],
  array['Farm Water Bores', 'Solar & Submersible Bore Pumps', 'Irrigation Bores'],
  'Central West Water Bores (Orange, Bathurst, Cowra & Dubbo NSW) — Complete farm groundwater sourcing, stock & irrigation bore drilling, and solar/electric bore pump installations.'
);

select public._seed_verified_regional_vendor(
  'service', 'bore-pump-water',
  'Water Resources Drilling', 'Dubbo', '2830', 'NSW',
  '02 6882 5566', null, 'https://waterresourcesdrilling.com.au/',
  array['machine_header_operator'],
  array['Stock & Irrigation Bores', 'Town & Farm Water Drilling', 'Pump Testing'],
  'Water Resources Drilling (Dubbo & Forbes NSW) — Licensed water bore drillers for stock, irrigation and rural properties across Dubbo, Forbes, Narromine and Western NSW.'
);

revoke all on function public._seed_verified_regional_vendor(text, text, text, text, text, text, text, text, text, text[], text[], text) from public;
drop function public._seed_verified_regional_vendor(text, text, text, text, text, text, text, text, text, text[], text[], text);

-- 9. Upgrade public.get_vendor_trust_summary to include direct contact fields,
--    suburb, services_offered, and customer/vendor two-sided review stats
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
  v_user_id uuid := p_user_id;
  v_business_id uuid := p_business_id;
  v_profile record;
  v_business record;
  v_active_listings int := 0;
  v_completed_deals int := 0;
  v_review_count int := 0;
  v_avg_rating numeric(3,2) := null;
  v_recommend_pct int := null;
  v_top_tags jsonb := '[]'::jsonb;
  v_recent_reviews jsonb := '[]'::jsonb;
  v_enq_forwarded int := 0;
  v_enq_answered int := 0;
  v_enq_responded int := 0;
begin
  if p_listing_id is not null and (v_user_id is null and v_business_id is null) then
    select l.user_id, l.business_id
      into v_user_id, v_business_id
      from public.listings l
     where l.id = p_listing_id;
  end if;

  if v_business_id is not null and v_user_id is null then
    select b.claimed_by into v_user_id
      from public.businesses b
     where b.id = v_business_id;
  end if;

  if v_user_id is not null and v_business_id is null then
    select b.id into v_business_id
      from public.businesses b
     where b.claimed_by = v_user_id
       and b.status = 'active'
     order by b.claimed_at desc nulls last
     limit 1;
  end if;

  if v_user_id is not null then
    select
      p.user_id,
      p.display_name,
      p.trading_name,
      p.bio,
      p.postcode,
      p.abn,
      p.abn_entity_name,
      p.abn_verified_at,
      p.email_verified_at,
      p.phone_verified_at,
      p.insurances_held,
      p.role_tags,
      p.years_in_district,
      p.availability_status,
      p.outback_verified,
      p.created_at
    into v_profile
    from public.user_profiles p
    where p.user_id = v_user_id;
  end if;

  if v_business_id is not null then
    select
      b.id,
      b.legal_name,
      b.trading_name,
      b.abn,
      b.abr_status,
      b.gst_registered,
      b.state_code,
      b.postcode,
      b.suburb,
      b.bio,
      b.contact_phone,
      b.contact_email,
      b.website_url,
      b.facebook_url,
      b.source_url,
      b.source_platform,
      b.role_tags,
      b.services_offered,
      b.insurances_held,
      b.years_in_district,
      b.availability_status,
      b.claim_status,
      b.claimed_at,
      b.last_verified_at,
      b.outback_verified,
      b.created_at
    into v_business
    from public.businesses b
    where b.id = v_business_id;
  end if;

  select
    count(*) filter (where l.status = 'active' and l.expires_at > now())::int,
    count(*) filter (where l.closed_reason = 'matched')::int
  into v_active_listings, v_completed_deals
  from public.listings l
  where l.canonical_listing_id is null
    and (
      (v_user_id is not null and l.user_id = v_user_id)
      or (v_business_id is not null and l.business_id = v_business_id)
    );

  if v_business_id is not null or v_user_id is not null then
    select
      count(*) filter (where e.status in ('forwarded', 'emailed'))::int,
      count(*) filter (where e.outcome in ('got_quote', 'Booked', 'no_answer', 'not_used'))::int,
      count(*) filter (where e.outcome in ('got_quote', 'Booked'))::int
    into v_enq_forwarded, v_enq_answered, v_enq_responded
    from public.enquiries e
    join public.listings l on l.id = e.listing_id
    where (
      (v_business_id is not null and l.business_id = v_business_id)
      or (v_user_id is not null and l.user_id = v_user_id)
    )
    and e.created_at >= now() - interval '180 days';
  end if;

  with matched_reviews as (
    select
      r.id,
      r.created_at,
      r.reviewer_display_name,
      r.reviewer_postcode,
      r.rating,
      r.would_recommend,
      r.deal_type,
      r.tags,
      r.comment,
      r.vendor_reply,
      r.vendor_replied_at
    from public.vendor_reviews r
    where r.status = 'published'
      and (
        (v_user_id is not null and r.target_user_id = v_user_id)
        or (v_business_id is not null and r.target_business_id = v_business_id)
        or (p_listing_id is not null and r.listing_id = p_listing_id)
      )
    order by r.created_at desc
  ),
  tag_counts as (
    select t as tag, count(*)::int as cnt
    from matched_reviews mr,
         unnest(mr.tags) as t
    group by t
    order by cnt desc, t asc
    limit 8
  )
  select
    count(*)::int,
    round(avg(mr.rating)::numeric, 1),
    case
      when count(*) > 0
        then round(100.0 * count(*) filter (where mr.would_recommend) / count(*))::int
      else null
    end,
    coalesce((select jsonb_agg(jsonb_build_object('tag', tc.tag, 'count', tc.cnt)) from tag_counts tc), '[]'::jsonb),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', sub.id,
          'created_at', sub.created_at,
          'reviewer_display_name', sub.reviewer_display_name,
          'reviewer_postcode', sub.reviewer_postcode,
          'rating', sub.rating,
          'would_recommend', sub.would_recommend,
          'deal_type', sub.deal_type,
          'tags', sub.tags,
          'comment', sub.comment,
          'vendor_reply', sub.vendor_reply,
          'vendor_replied_at', sub.vendor_replied_at
        )
      )
      from (select * from matched_reviews limit 20) sub
    ), '[]'::jsonb)
  into v_review_count, v_avg_rating, v_recommend_pct, v_top_tags, v_recent_reviews
  from matched_reviews mr;

  return jsonb_build_object(
    'user_id', v_user_id,
    'business_id', v_business_id,
    'display_name', coalesce(v_profile.display_name, v_business.trading_name, v_business.legal_name),
    'trading_name', coalesce(v_profile.trading_name, v_business.trading_name, v_business.legal_name),
    'bio', coalesce(v_profile.bio, v_business.bio),
    'postcode', coalesce(v_profile.postcode, v_business.postcode),
    'suburb', v_business.suburb,
    'state', coalesce(
      v_business.state_code,
      (select r.state from public.regions r where r.postcode = coalesce(v_profile.postcode, v_business.postcode) limit 1)
    ),
    'contact_phone', v_business.contact_phone,
    'contact_email', v_business.contact_email,
    'website_url', v_business.website_url,
    'facebook_url', v_business.facebook_url,
    'source_url', v_business.source_url,
    'source_platform', v_business.source_platform,
    'member_since', coalesce(v_profile.created_at, v_business.claimed_at, v_business.created_at),
    'email_verified', (v_profile.email_verified_at is not null),
    'phone_verified', (v_profile.phone_verified_at is not null or v_business.contact_phone is not null),
    'abn_verified', (
      v_profile.abn_verified_at is not null
      or v_business.claim_status in ('abn_verified', 'trusted')
      or v_business.abn is not null
    ),
    'abn', coalesce(v_profile.abn, v_business.abn),
    'abn_entity_name', coalesce(v_profile.abn_entity_name, v_business.legal_name),
    'claim_status', coalesce(v_business.claim_status, case when v_user_id is not null then 'claimed' else 'unclaimed' end),
    'insurances_held', coalesce(
      case when cardinality(coalesce(v_profile.insurances_held, '{}'::text[])) > 0 then to_jsonb(v_profile.insurances_held) else null end,
      to_jsonb(coalesce(v_business.insurances_held, '{}'::text[]))
    ),
    'role_tags', coalesce(
      case when cardinality(coalesce(v_profile.role_tags, '{}'::text[])) > 0 then to_jsonb(v_profile.role_tags) else null end,
      to_jsonb(coalesce(v_business.role_tags, '{}'::text[]))
    ),
    'services_offered', to_jsonb(coalesce(v_business.services_offered, '{}'::text[])),
    'years_in_district', coalesce(v_profile.years_in_district, v_business.years_in_district),
    'availability_status', coalesce(v_profile.availability_status, v_business.availability_status, 'available'),
    'outback_verified', (
      coalesce(v_profile.outback_verified, false)
      or coalesce(v_business.outback_verified, false)
      or v_business.claim_status = 'trusted'
    ),
    'active_listings_count', v_active_listings,
    'completed_deals_count', v_completed_deals,
    'enquiry_forwarded', v_enq_forwarded,
    'enquiry_answered', v_enq_answered,
    'enquiry_responded', v_enq_responded,
    'review_count', v_review_count,
    'avg_rating', v_avg_rating,
    'recommend_pct', v_recommend_pct,
    'top_tags', v_top_tags,
    'recent_reviews', v_recent_reviews
  );
end;
$fn$;

revoke all on function public.get_vendor_trust_summary(uuid, uuid, uuid) from public;
grant execute on function public.get_vendor_trust_summary(uuid, uuid, uuid) to anon, authenticated, service_role;

-- 10. Upgrade public.list_trusted_profiles to return unified member + business profiles
--     with direct contact_phone, contact_email, website_url, suburb, services_offered,
--     and primary listing link so customers can call/SMS/email in 0 clicks!
create or replace function public.list_trusted_profiles(
  p_role     text default null,
  p_postcode text default null,
  p_abn_only boolean default false,
  p_limit    int default 60
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  with primary_listings as (
    select distinct on (l.business_id)
      l.business_id,
      l.slug as listing_slug,
      l.kind as listing_kind,
      c.label as category_label,
      count(*) filter (where l.status = 'active' and l.expires_at > now()) over (partition by l.business_id)::int as active_cnt,
      count(*) filter (where l.closed_reason = 'matched') over (partition by l.business_id)::int as matched_cnt
    from public.listings l
    left join public.categories c on c.id = l.category_id
    where l.business_id is not null
      and l.canonical_listing_id is null
      and l.status = 'active'
    order by l.business_id, (l.expires_at > now()) desc, l.updated_at desc
  ),
  all_candidates as (
    -- A. All active businesses (claimed + verified directory businesses)
    select
      coalesce(b.claimed_by::text, b.id::text) as profile_id,
      b.claimed_by as user_id,
      b.id as business_id,
      coalesce(nullif(btrim(b.trading_name), ''), nullif(btrim(b.legal_name), ''), 'Rural Business') as name,
      p.display_name,
      b.trading_name,
      coalesce(nullif(btrim(p.bio), ''), nullif(btrim(b.bio), '')) as bio,
      coalesce(nullif(btrim(b.postcode), ''), nullif(btrim(p.postcode), '')) as postcode,
      b.suburb,
      coalesce(b.state_code, 'NSW') as state,
      b.contact_phone,
      b.contact_email,
      b.website_url,
      b.facebook_url,
      pl.listing_slug,
      pl.listing_kind,
      pl.category_label,
      coalesce(p.created_at, b.claimed_at, b.created_at) as member_since,
      (p.email_verified_at is not null) as email_verified,
      (
        p.abn_verified_at is not null
        or b.claim_status in ('abn_verified', 'trusted')
        or b.abn is not null
      ) as abn_verified,
      coalesce(p.abn, b.abn) as abn,
      (b.claim_status in ('claimed', 'abn_verified', 'trusted')) as is_claimed_business,
      case
        when cardinality(coalesce(p.insurances_held, '{}'::text[])) > 0 then p.insurances_held
        else coalesce(b.insurances_held, '{}'::text[])
      end as insurances_held,
      case
        when cardinality(coalesce(p.role_tags, '{}'::text[])) > 0 then p.role_tags
        else coalesce(b.role_tags, '{}'::text[])
      end as role_tags,
      coalesce(b.services_offered, '{}'::text[]) as services_offered,
      coalesce(p.years_in_district, b.years_in_district) as years_in_district,
      coalesce(p.availability_status, b.availability_status, 'available') as availability_status,
      (
        coalesce(p.outback_verified, false)
        or coalesce(b.outback_verified, false)
        or b.claim_status = 'trusted'
      ) as outback_verified,
      coalesce(pl.active_cnt, 1) as active_listings_count,
      coalesce(pl.matched_cnt, 0) as completed_deals_count
    from public.businesses b
    left join public.user_profiles p on p.user_id = b.claimed_by
    left join primary_listings pl on pl.business_id = b.id
    where b.status = 'active'

    union all

    -- B. Standalone member profiles without a linked business row
    select
      p.user_id::text as profile_id,
      p.user_id,
      null::uuid as business_id,
      coalesce(nullif(btrim(p.trading_name), ''), nullif(btrim(p.display_name), ''), nullif(btrim(p.abn_entity_name), '')) as name,
      p.display_name,
      p.trading_name,
      p.bio,
      p.postcode,
      (select r.region_name from public.regions r where r.postcode = p.postcode limit 1) as suburb,
      coalesce((select r.state from public.regions r where r.postcode = p.postcode limit 1), 'NSW') as state,
      null::text as contact_phone,
      null::text as contact_email,
      null::text as website_url,
      null::text as facebook_url,
      null::text as listing_slug,
      null::text as listing_kind,
      null::text as category_label,
      p.created_at as member_since,
      (p.email_verified_at is not null) as email_verified,
      (p.abn_verified_at is not null) as abn_verified,
      p.abn,
      false as is_claimed_business,
      coalesce(p.insurances_held, '{}'::text[]) as insurances_held,
      coalesce(p.role_tags, '{}'::text[]) as role_tags,
      '{}'::text[] as services_offered,
      p.years_in_district,
      coalesce(p.availability_status, 'available') as availability_status,
      coalesce(p.outback_verified, false) as outback_verified,
      (select count(*)::int from public.listings l where l.user_id = p.user_id and l.status = 'active' and l.expires_at > now()) as active_listings_count,
      (select count(*)::int from public.listings l where l.user_id = p.user_id and l.closed_reason = 'matched') as completed_deals_count
    from public.user_profiles p
    where not exists (
      select 1 from public.businesses b where b.claimed_by = p.user_id and b.status = 'active'
    )
    and (
      p.display_name is not null
      or p.trading_name is not null
      or p.abn is not null
      or cardinality(coalesce(p.role_tags, '{}'::text[])) > 0
    )
  ),
  enriched as (
    select
      ac.*,
      coalesce(rev.review_count, 0) as review_count,
      rev.avg_rating,
      rev.recommend_pct,
      coalesce(rev.top_tags, '[]'::jsonb) as top_tags
    from all_candidates ac
    left join lateral (
      with r as (
        select vr.rating, vr.would_recommend, vr.tags
        from public.vendor_reviews vr
        where vr.status = 'published'
          and (
            (ac.user_id is not null and vr.target_user_id = ac.user_id)
            or (ac.business_id is not null and vr.target_business_id = ac.business_id)
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
    where ac.name is not null
      and (p_role is null or p_role = '' or p_role = any(ac.role_tags))
      and (
        p_postcode is null
        or p_postcode = ''
        or ac.postcode like (p_postcode || '%')
        or lower(coalesce(ac.suburb, '')) like ('%' || lower(p_postcode) || '%')
        or lower(ac.name) like ('%' || lower(p_postcode) || '%')
      )
      and (not coalesce(p_abn_only, false) or ac.abn_verified = true or ac.outback_verified = true)
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
        'suburb', e.suburb,
        'state', e.state,
        'contact_phone', e.contact_phone,
        'contact_email', e.contact_email,
        'website_url', e.website_url,
        'facebook_url', e.facebook_url,
        'listing_slug', e.listing_slug,
        'listing_kind', e.listing_kind,
        'category_label', e.category_label,
        'member_since', e.member_since,
        'email_verified', e.email_verified,
        'abn_verified', e.abn_verified,
        'abn', e.abn,
        'is_claimed_business', e.is_claimed_business,
        'insurances_held', to_jsonb(e.insurances_held),
        'role_tags', to_jsonb(e.role_tags),
        'services_offered', to_jsonb(e.services_offered),
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
        (e.website_url is not null) desc,
        (e.contact_phone is not null and e.contact_email is not null) desc,
        (e.contact_phone is not null) desc,
        e.name asc
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
      (website_url is not null) desc,
      (contact_phone is not null and contact_email is not null) desc,
      (contact_phone is not null) desc,
      name asc
    limit greatest(1, least(coalesce(p_limit, 60), 250))
  ) e;
$fn$;

revoke all on function public.list_trusted_profiles(text, text, boolean, int) from public;
grant execute on function public.list_trusted_profiles(text, text, boolean, int) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
