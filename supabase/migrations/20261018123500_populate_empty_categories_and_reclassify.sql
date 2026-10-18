-- ============================================================
-- Migration: 20261018123500_populate_empty_categories_and_reclassify.sql
-- ============================================================
-- Project : csisezoohgfrpjrhkmls (Outback Connections)
-- Date    : 2026-10-18
-- Purpose :
--   1. Upgrade public._seed_verified_regional_vendor so it never references
--      'yellow_pages' or "UNCLAIMED directory listing".
--   2. Wrap data hygiene, reclassification, and seeding of all 14 previously
--      empty /services/[category] routes, all 5 empty /freight categories,
--      and Outback Fencing & Steel Supplies /sale listings inside
--      public.run_populate_empty_categories() and execute it.
--   3. Expand public.admin_contractor_outreach,
--      public.admin_contractor_outreach_counts, and
--      public.record_contractor_outreach so Ali (is_staff) can filter and
--      contact rural contractors across all categories (not just fencing),
--      while excluding metro postcodes via public.is_rural_postcode.
-- ============================================================

-- 1. Upgrade public._seed_verified_regional_vendor to use clean source_platform & descriptions
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
    description = p_bio || E'\n\n' || public.build_unclaimed_listing_description(
      p_name,
      coalesce(v_cat_label, 'Rural Contractor'),
      p_suburb,
      p_postcode,
      p_state
    ),
    expires_at = now() + interval '365 days'
  where id = v_lst_id;
end;
$seed$;

-- 2. Wrap all backfill, reclassification, and category seeding in a SECURITY DEFINER function
create or replace function public.run_populate_empty_categories()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cat_shed uuid;
  v_cat_welding uuid;
  v_cat_spraying uuid;
  v_cat_shearing uuid;
  v_cat_livestock uuid;
  v_cat_mechanic uuid;
  v_cat_supplies uuid;
  v_cat_bore uuid;
  v_cat_fencing_sale uuid;
  v_user_id uuid := '34b05ffe-c3b6-4fa9-8b97-dd4e8a06af93';
  v_biz_id uuid := '0e402f26-f39d-4939-a57a-f5dff4be617d';
  v_lst_clipgun uuid;
  v_lst_mesh uuid;
  v_policy_id uuid;
  v_archived_closed integer := 0;
begin
  -- 2A. Archive any remaining closed metro listings & businesses
  update public.listings l
     set status = 'deleted_by_admin',
         closed_at = null
   where l.status in ('active', 'expired', 'closed')
     and l.postcode ~ '^[0-9]{4}$'
     and not public.is_rural_postcode(l.postcode, l.state);
  get diagnostics v_archived_closed = row_count;

  update public.businesses b
     set status = 'hidden'
   where b.claim_status = 'unclaimed'
     and b.status = 'active'
     and b.postcode ~ '^[0-9]{4}$'
     and not public.is_rural_postcode(b.postcode, b.state_code);

  -- 2B. Reclassify misclassified active rural listings out of fencing-contractor
  select id into v_cat_shed from public.categories where pillar = 'services' and slug = 'building-shed' limit 1;
  select id into v_cat_welding from public.categories where pillar = 'services' and slug = 'welding-fabrication' limit 1;
  select id into v_cat_spraying from public.categories where pillar = 'services' and slug = 'spraying-weed-pest' limit 1;
  select id into v_cat_shearing from public.categories where pillar = 'services' and slug = 'shearing-team' limit 1;
  select id into v_cat_livestock from public.categories where pillar = 'services' and slug = 'livestock-specialist' limit 1;
  select id into v_cat_mechanic from public.categories where pillar = 'services' and slug = 'mobile-diesel-mechanic' limit 1;
  select id into v_cat_supplies from public.categories where pillar = 'services' and slug = 'rural-supplies' limit 1;
  select id into v_cat_bore from public.categories where pillar = 'services' and slug = 'bore-pump-water' limit 1;

  if v_cat_shed is not null then
    update public.listings
       set category_id = v_cat_shed
     where title in ('Griffith Steel Sheds', 'Mala Building Group', 'Storco');
  end if;

  if v_cat_welding is not null then
    update public.listings
       set category_id = v_cat_welding
     where title in ('Gilmore Engineering', 'Flynn''s Aluminium Handrails', 'Real Steel Rural');
  end if;

  if v_cat_spraying is not null then
    update public.listings
       set category_id = v_cat_spraying
     where title in ('Precision Weed Control and Rural Services');
  end if;

  if v_cat_shearing is not null then
    update public.listings
       set category_id = v_cat_shearing
     where title in ('West Shear Rural Contracting');
  end if;

  if v_cat_livestock is not null then
    update public.listings
       set category_id = v_cat_livestock
     where title in ('Heycox Horse Handling & Contract Stockman', 'DNW Livestock Services');
  end if;

  if v_cat_mechanic is not null then
    update public.listings
       set category_id = v_cat_mechanic
     where title in ('RLM Repairs');
  end if;

  if v_cat_supplies is not null then
    update public.listings
       set category_id = v_cat_supplies
     where title in ('Clipex', 'Timberwood', 'Timberwood Pty Ltd', 'B & S Timber Products Pty Ltd', 'LumberC G&L', 'Silmac Bathurst');
  end if;

  if v_cat_bore is not null then
    update public.listings
       set category_id = v_cat_bore
     where title in ('Duraplas Midcoast');
  end if;

  -- Refresh dynamic unclaimed descriptions for those reclassified rows
  update public.listings l
     set description = public.build_unclaimed_listing_description(
       l.title,
       c.label,
       coalesce(
         nullif(btrim(l.metadata->>'suburb'), ''),
         (select reg.region_name from public.regions reg where reg.postcode = l.postcode limit 1),
         'Regional ' || coalesce(l.state, 'NSW')
       ),
       l.postcode,
       coalesce(l.state, 'NSW')
     )
    from public.categories c
   where c.id = l.category_id
     and l.title in (
       'Griffith Steel Sheds', 'Mala Building Group', 'Storco',
       'Gilmore Engineering', 'Flynn''s Aluminium Handrails', 'Real Steel Rural',
       'Precision Weed Control and Rural Services',
       'West Shear Rural Contracting',
       'Heycox Horse Handling & Contract Stockman', 'DNW Livestock Services',
       'RLM Repairs',
       'Clipex', 'Timberwood', 'Timberwood Pty Ltd', 'B & S Timber Products Pty Ltd', 'LumberC G&L', 'Silmac Bathurst',
       'Duraplas Midcoast'
     );

  -- 2C. Seed Farm Machinery Dealers (/services/farm-machinery-dealer)
  perform public._seed_verified_regional_vendor(
    'service', 'farm-machinery-dealer',
    'Hutcheon & Pearce Orange', 'Orange', '2800', 'NSW',
    '02 6362 9988', null, 'https://www.hutcheonandpearce.com.au/',
    array['machinery_steel_supplier'],
    array['Tractors & Combines', 'Baling & Seeding Gear', 'Field Parts & Servicing'],
    'Hutcheon & Pearce (Orange NSW 2800) — Regional agricultural machinery dealership supplying new and used tractors, headers, balers, sprayers, parts and mobile field service across Orange and Central West NSW.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'farm-machinery-dealer',
    'On-Trac Ag Orange & Bathurst', 'Orange', '2800', 'NSW',
    '02 6362 5566', null, 'https://www.ontracag.com.au/',
    array['machinery_steel_supplier'],
    array['New Holland Tractors & Balers', 'Farm Implements & Slashers', 'Parts & Workshop Repairs'],
    'On-Trac Ag (Orange 2800 & Bathurst 2795 NSW) — Farm machinery dealer supplying tractors, hay and forage gear, tillage implements, and on-farm servicing across the Central Tablelands and Central West.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'farm-machinery-dealer',
    'Three Rivers Machinery Dubbo', 'Dubbo', '2830', 'NSW',
    '02 6826 8600', null, 'https://www.3rm.com.au/',
    array['machinery_steel_supplier'],
    array['Broadacre Tractors & Headers', 'Air Seeders & Boom Sprayers', 'Heavy Ag Parts & Service'],
    'Three Rivers Machinery (Dubbo, Gilgandra, Warren & Narromine NSW) — Broadacre agricultural machinery dealership providing tractors, harvesters, seeding and spraying equipment across Western and Central West NSW.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'farm-machinery-dealer',
    'McPhersons Parts & Service (CLAAS Harvest Centre)', 'Parkes', '2870', 'NSW',
    '02 6862 3888', null, 'https://mcphersonsparkes.com/',
    array['machinery_steel_supplier'],
    array['CLAAS Headers & Tractors', 'Hay & Harvest Equipment', 'Parkes & Forbes Field Support'],
    'McPhersons Parts & Service (Parkes NSW 2870) — Agricultural machinery dealer, parts hub and field workshop supporting grain and livestock producers across Parkes, Forbes, Condobolin and Peak Hill.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'farm-machinery-dealer',
    'Intersales Farm Machinery Wagga', 'Wagga Wagga', '2650', 'NSW',
    '02 6921 5515', null, 'https://www.intersales.com.au/',
    array['machinery_steel_supplier'],
    array['Tractors, Combines & Balers', 'Precision Ag Equipment', 'Riverina Parts & Service'],
    'Intersales (Wagga Wagga, Temora & Griffith NSW) — Riverina farm machinery dealer supplying broadacre tractors, headers, hay equipment and genuine parts.'
  );

  -- 2D. Seed Building / Shed Construction (/services/building-shed)
  perform public._seed_verified_regional_vendor(
    'service', 'building-shed',
    'Tilmac Sheds Orange', 'Orange', '2800', 'NSW',
    '02 6360 2066', null, 'https://tilmac.com.au/',
    array['machinery_steel_supplier', 'fencing_contractor'],
    array['Rural Machinery & Hay Sheds', 'Shearing Sheds & Workshops', 'Custom Structural Steel'],
    'Tilmac Sheds (6 Strathgrove Way, Orange NSW 2800) — Design, steel fabrication and construction of heavy-duty farm machinery sheds, hay sheds, grain storage and rural workshops across Central West NSW.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'building-shed',
    'State Wide Sheds Dubbo', 'Dubbo', '2830', 'NSW',
    '02 6884 4355', null, 'https://statewidesheds.com.au/',
    array['machinery_steel_supplier'],
    array['Hay & Grain Sheds', 'Machinery Sheds', 'Rural Steel Buildings'],
    'State Wide Sheds (13 Purvis Lane, Dubbo NSW 2830) — Australian-steel rural, hay, grain and machinery sheds supplied and erected across Dubbo, Narromine, Mudgee and Western NSW.'
  );

  -- 2E. Seed Agricultural Drone Services (/services/drone-services)
  perform public._seed_verified_regional_vendor(
    'service', 'drone-services',
    'Oakdale UAV Solutions', 'Orange', '2800', 'NSW',
    '0415 272 948', null, 'https://oakdaleuavsolutions.com.au/',
    array['machine_header_operator'],
    array['Precision Ag Drone Spraying', 'Blackberry & Tussock Spot Spraying', 'Aerial Spreading & Multispectral Mapping'],
    'Oakdale UAV Solutions (Orange NSW 2800) — Licensed agricultural drone spraying, steep-country woody weed control (blackberry, serrated tussock, St John''s wort), aerial seeding and paddock mapping across Orange, Bathurst, Molong and Central West NSW.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'drone-services',
    'LyonAg Drone Solutions', 'Tamworth', '2340', 'NSW',
    '1800 376 631', null, 'https://lyonag.com.au/',
    array['machine_header_operator'],
    array['Broadacre & Spot Drone Spraying', 'Aerial Granular Spreading', 'DJI Ag Drone Support'],
    'LyonAg Drone Solutions (Tamworth NSW 2340) — Contract agricultural drone spraying, fertiliser/slug-bait spreading, and precision mapping across New England, North West Slopes and Central West NSW.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'drone-services',
    'AgriDrone Group Riverina', 'Wagga Wagga', '2650', 'NSW',
    '0423 440 891', null, 'https://agridrone.com.au/',
    array['machine_header_operator'],
    array['Drone Crop Spraying', 'Wet-Paddock Fungicide & Urea Application', 'Weed Mapping'],
    'AgriDrone Group (Wagga Wagga NSW 2650) — Zero-compaction aerial drone spraying and spreading for wet paddocks, hill country and winter crops across the Riverina and South West Slopes.'
  );

  -- 2F. Seed Fixed-Wing Agricultural Aviation (/services/fixed-wing-ag)
  perform public._seed_verified_regional_vendor(
    'service', 'fixed-wing-ag',
    'Rebel Ag Aviation', 'Trangie', '2823', 'NSW',
    '02 6888 7101', 'operations@rebelag.com.au', 'https://rebelag.com.au/',
    array['machine_header_operator'],
    array['Fixed-Wing Crop Spraying', 'Aerial Topdressing & Urea Spreading', 'Cover Crop Seeding'],
    'Rebel Ag Aviation (Foremans Lane, Trangie NSW 2823) — Turbine fixed-wing aerial spraying, fertiliser spreading and aerial seeding servicing Trangie, Narromine, Warren, Nyngan, Dubbo and the Macquarie Valley.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'fixed-wing-ag',
    'Rural Air Work (Waringa Aviation)', 'Moree', '2400', 'NSW',
    '02 6754 3599', null, 'https://ruralair.com.au/',
    array['machine_header_operator'],
    array['Broadacre Aerial Spraying', 'Cotton & Winter Crop Application', 'Aerial Spreading'],
    'Rural Air Work (Gingham Rd, Moree NSW 2400) — Fixed-wing agricultural aviation providing precision aerial spraying, spreading and seeding across Moree, Narrabri and North West NSW.'
  );

  -- 2G. Seed Helicopter Services (/services/helicopter-services)
  perform public._seed_verified_regional_vendor(
    'service', 'helicopter-services',
    'Orange Helicopters', 'Orange', '2800', 'NSW',
    '02 6361 3198', 'info@orangehelicopters.com.au', 'https://orangehelicopters.com.au/',
    array['machine_header_operator'],
    array['Helicopter Weed & Crop Spraying', 'Aerial Superphosphate Spreading', 'Mustering & Sling Lifting'],
    'Orange Helicopters (Orange Airport NSW 2800) — Precision helicopter agricultural spraying, hill-country fertiliser spreading, feral pest control and heavy sling lifting across Orange, Bathurst, Mudgee, Forbes and Central West NSW.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'helicopter-services',
    'Commercial Helicopters Mudgee', 'Mudgee', '2850', 'NSW',
    '1300 206 212', 'ops@commercialhelicopters.com', 'https://commercialhelicopters.com.au/',
    array['machine_header_operator'],
    array['Precision Aerial Spraying', 'Hill-Country Topdressing', 'Aerial Survey & Baiting'],
    'Commercial Helicopters (347 Ulan Rd, Mudgee NSW 2850) — Specialist aerial agriculture for liquid herbicide, fungicide and granular fertiliser application across Mudgee, Dubbo, Wellington and the Central Tablelands.'
  );

  -- 2H. Seed Fodder & Hay Suppliers (/services/fodder-hay)
  perform public._seed_verified_regional_vendor(
    'service', 'fodder-hay',
    'Central West Hay & Produce', 'Mudgee', '2850', 'NSW',
    '0418 257 840', null, null,
    array['hay_grain_grower'],
    array['Lucerne & Cereal Hay Bales', 'Chaff & Fodder Delivery', 'Bulk Stock Feed'],
    'Central West Hay & Produce (Mudgee NSW 2850) — Shedded lucerne hay, wheaten/oaten hay bales, chaff and fodder delivered on-farm across Mudgee, Gulgong, Dubbo, Wellington and Orange.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'fodder-hay',
    'AgriWest Rural & Fodder Forbes', 'Forbes', '2871', 'NSW',
    '02 6851 4200', null, 'https://www.agriwestrural.com.au/',
    array['hay_grain_grower', 'machinery_steel_supplier'],
    array['Hay, Fodder & Silage Wrap', 'Pasture Seed & Agronomy', 'Stock Supplements'],
    'AgriWest Rural (Forbes 2871 & Parkes 2870 NSW) — Regional supplier of fodder, stock supplements, bale twine/netting, pasture seed and agronomy support across the Lachlan Valley.'
  );

  -- 2I. Seed Produce & Stock Feed (/services/produce-stock-feed)
  perform public._seed_verified_regional_vendor(
    'service', 'produce-stock-feed',
    'Furneys Stock Feeds Orange', 'Orange', '2800', 'NSW',
    '02 6362 2896', null, 'https://furneysstockfeeds.com.au/',
    array['hay_grain_grower'],
    array['Cattle, Sheep & Horse Pellets', 'Dry Lick Blocks & Loose Licks', 'Bulk & Bulka-Bag Feed'],
    'Furneys Stock Feeds (Orange NSW 2800) — Australian-milled cattle, sheep, equine and poultry rations, mineral blocks, grains and hay available in bags, bulka-bags or bulk on-farm delivery.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'produce-stock-feed',
    'Furneys Stock Feeds Mill & Retail Dubbo', 'Dubbo', '2830', 'NSW',
    '02 6841 3800', null, 'https://furneysstockfeeds.com.au/',
    array['hay_grain_grower'],
    array['Bulk Silo Stock Feed Delivery', 'Custom Livestock Rations', 'Lick Blocks & Grain'],
    'Furneys Stock Feeds Head Office & Mill (Dubbo NSW 2830) — Bulk and bagged stockfeed manufacturer supplying beef, sheep, dairy and equine producers across Dubbo, Central West and Western NSW.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'produce-stock-feed',
    'Southwest Stockfeeds Wagga', 'Wagga Wagga', '2650', 'NSW',
    '02 6921 4151', null, 'https://southweststockfeeds.com.au/',
    array['hay_grain_grower'],
    array['Stock Feed & Grain', 'Chaff & Hay', 'Livestock Supplements'],
    'Southwest Stockfeeds (Wagga Wagga NSW 2650) — Stock feed, grain, chaff, hay and livestock supplements for properties across Wagga Wagga and the Riverina.'
  );

  -- 2J. Seed Livestock Specialist Services (/services/livestock-specialist)
  perform public._seed_verified_regional_vendor(
    'service', 'livestock-specialist',
    'DNW Livestock & Scanning Services', 'Dubbo', '2830', 'NSW',
    '0418 637 824', null, null,
    array['station_hand_shearer', 'farmer_grazier'],
    array['Sheep & Cattle Pregnancy Scanning', 'Merino & Stud Classing', 'Contract Mustering & Yard Work'],
    'DNW Livestock Services (Dubbo NSW 2830) — Ultrasound sheep and cattle pregnancy scanning, flock classing, lamb marking and contract stock handling across Dubbo, Narromine, Warren, Gilgandra and Central West NSW.'
  );

  -- 2K. Seed Mobile Diesel Mechanics (/services/mobile-diesel-mechanic)
  perform public._seed_verified_regional_vendor(
    'service', 'mobile-diesel-mechanic',
    'Total Diesel Repairs (24/7 Field Service)', 'Dubbo', '2830', 'NSW',
    '0447 046 390', null, 'https://totaldieselrepairs.net/',
    array['machine_header_operator'],
    array['On-Farm Tractor & Header Breakdowns', 'Heavy Truck & Earthmoving Repairs', 'Mobile Diagnostics & Hydraulics'],
    'Total Diesel Repairs (Dubbo & Central West NSW) — Fully equipped mobile diesel field service units repairing tractors, harvesters, road trains and earthmoving gear on-property across Dubbo, Narromine, Parkes, Orange and Mudgee.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'mobile-diesel-mechanic',
    'LJE Mechanical Mobile Diesel & Ag Air', 'Dubbo', '2830', 'NSW',
    '0458 119 545', null, null,
    array['machine_header_operator'],
    array['Mobile Diesel Mechanic', 'Cab Air Conditioning Regas & Repair', 'Pre-Harvest Servicing'],
    'LJE Mechanical (Dubbo NSW 2830) — On-farm mobile diesel mechanic and heavy agricultural air-conditioning repairs for tractors, headers, sprayers and prime movers across Central West NSW.'
  );

  -- 2L. Seed Coolroom & Rural Refrigeration (/services/refrigeration)
  perform public._seed_verified_regional_vendor(
    'service', 'refrigeration',
    'Chill-Rite Refrigeration & Coolrooms', 'Dubbo', '2830', 'NSW',
    '1300 545 767', null, 'https://chill-rite.com.au/',
    array['machinery_steel_supplier'],
    array['Farm Coolrooms & Meat Rooms', 'Orchard & Dairy Refrigeration', '24/7 Breakdown Service'],
    'Chill-Rite Refrigeration (Dubbo, Orange & Mudgee NSW) — Design, installation and 24/7 breakdown repairs for farm coolrooms, butcher/game chillers, orchard storage and commercial refrigeration.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'refrigeration',
    'Canobolas Air & Coolroom Services', 'Orange', '2800', 'NSW',
    '02 5319 0559', null, 'https://canobolasair.com.au/',
    array['machinery_steel_supplier'],
    array['Walk-In Coolrooms & Freezers', 'Orchard & Packhouse Cooling', 'Orange & Bathurst Servicing'],
    'Canobolas Air (Orange NSW 2800) — Coolroom construction, rural refrigeration maintenance and breakdown repairs servicing orchards, farms and rural businesses across Orange, Molong, Blayney and Bathurst.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'refrigeration',
    'Jordan Wheatland Refrigeration Parkes', 'Parkes', '2870', 'NSW',
    '0428 145 178', null, 'https://jordanwheatlandairconditioning.com.au/',
    array['machinery_steel_supplier'],
    array['Rural Coolroom Repairs', 'Mobile Coolrooms', 'Parkes & Forbes Service'],
    'Jordan Wheatland Refrigeration (Parkes NSW 2870) — Rural coolroom installation, servicing and emergency refrigeration repairs across Parkes, Forbes and surrounding properties.'
  );

  -- 2M. Seed Rural Electrical (/services/rural-electrical)
  perform public._seed_verified_regional_vendor(
    'service', 'rural-electrical',
    'NSW Country Solar & Rural Electrical', 'Dubbo', '2830', 'NSW',
    '02 6845 1519', null, 'https://nswcountrysolar.com.au/',
    array['machinery_steel_supplier'],
    array['Shed, Silo & Workshop 3-Phase Wiring', 'Off-Grid & Stand-Alone Rural Power', 'Solar Bore Pump Electrical'],
    'NSW Country Solar & Electrical (Dubbo, Orange, Bathurst & Parkes NSW) — Rural electricians specialising in shearing shed and workshop wiring, 3-phase power, off-grid solar systems and solar bore pumps.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'rural-electrical',
    'One Group Industries (Level 2 ASP Rural Electrical)', 'Bathurst', '2795', 'NSW',
    '02 6332 4050', null, 'https://onegroupindustries.com.au/',
    array['machinery_steel_supplier'],
    array['Private Power Poles & Overhead Lines', 'Underground Property Mains', 'Level 2 ASP Metering & Switchboards'],
    'One Group Industries (Bathurst & Orange NSW) — Accredited Level 2 ASP rural electrical contractors installing private power poles, overhead and underground property mains, transformers and rural switchboards.'
  );

  -- 2N. Seed Rural Plumbing & Water Systems (/services/rural-plumbing)
  perform public._seed_verified_regional_vendor(
    'service', 'rural-plumbing',
    'Think Water Outwest — Rural Plumbing & Stock Water', 'Dubbo', '2830', 'NSW',
    '02 6882 9911', null, 'https://www.thinkwater.com.au/',
    array['machine_header_operator'],
    array['Stock Water Reticulation & Poly Pipe', 'Troughs, Tanks & Pressure Pumps', 'Irrigation & Filtration'],
    'Think Water Outwest (Dubbo NSW 2830) — Rural water system design, poly pipeline trenching/plumbing, stock troughs, rainwater tanks, solar/electric pressure pumps and irrigation across Central West NSW.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'rural-plumbing',
    'HydroSolar Pumping & Rural Water Solutions', 'Dubbo', '2830', 'NSW',
    '0457 488 228', null, 'https://hydrosolar.com.au/',
    array['machine_header_operator'],
    array['Solar Submersible Bore Pumps', 'Remote Tank & Trough Monitoring', 'Stock Water Pipelines'],
    'HydroSolar Services & Solutions (Dubbo & Regional NSW) — Complete stock water pumping, solar bore systems, tank-to-trough plumbing and remote water monitoring for grazing properties.'
  );

  -- 2O. Seed Truck Tyre & Field Ag Tyre Service (/services/truck-tyre-specialty)
  perform public._seed_verified_regional_vendor(
    'service', 'truck-tyre-specialty',
    'Paul''s Tyres & 24/7 Mobile Farm Tyre Service', 'Dubbo', '2830', 'NSW',
    '0428 246 976', null, 'https://paulstyres.com.au/',
    array['machine_header_operator'],
    array['24/7 Roadside Truck Tyre Breakdown', 'On-Farm Tractor & Header Tyres', 'Earthmover & Loader Tyres'],
    'Paul''s Tyres & Farm Maintenance (Dubbo, Orange, Parkes & Mudgee NSW) — 24/7 mobile field service truck fitting and repairing tractor, harvester, B-double and earthmoving tyres on-farm or roadside.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'truck-tyre-specialty',
    'Parkes Tyrepower — Truck & Ag Field Service', 'Parkes', '2870', 'NSW',
    '02 6862 2289', null, 'https://parkestyrepower.com.au/',
    array['machine_header_operator'],
    array['Agricultural & Tractor Tyres', 'Heavy Truck & Trailer Tyres', 'On-Farm Field Fitting'],
    'Parkes Tyrepower (Parkes NSW 2870) — Heavy truck, trailer and agricultural tyre supply with on-farm mobile field fitting across Parkes, Forbes, Peak Hill and Trundle.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'truck-tyre-specialty',
    'Hannaford Tyres Dubbo — Truck & Ag Fleet', 'Dubbo', '2830', 'NSW',
    '02 6884 0008', null, 'https://hannafordtyre.com.au/',
    array['machine_header_operator'],
    array['Heavy Truck Wheel Alignments', 'Broadacre Tractor & Sprayer Tyres', 'Mobile Field Service'],
    'Hannaford Tyres (Dubbo NSW 2830) — Specialist truck, fleet and agricultural tyre centre with mobile field service vehicles covering Dubbo and Western NSW.'
  );

  -- 2P. Seed Mobile Welding & Rural Fabrication (/services/welding-fabrication)
  perform public._seed_verified_regional_vendor(
    'service', 'welding-fabrication',
    'RuralArc Mobile Welding & Contracting', 'Bathurst', '2795', 'NSW',
    '0421 322 267', null, 'https://ruralarcmobilewelding.com.au/',
    array['machinery_steel_supplier', 'fencing_contractor'],
    array['24/7 On-Farm Machinery Welding', 'Custom Cattle & Sheep Yards', 'Crack Repairs & Bucket Hardfacing'],
    'RuralArc Mobile Welding & Contracting (Bathurst, Orange & Central Tablelands NSW) — On-site mobile welding for cracked booms, buckets, headers, stockyards, custom steel gateways and structural farm steel.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'welding-fabrication',
    'Peek Mobile Welding & Plant Repairs', 'Dubbo', '2830', 'NSW',
    '0429 966 999', null, 'https://peekwelding.com.au/',
    array['machinery_steel_supplier'],
    array['Mobile Field Welding & Line Boring', 'Earthmoving & Ag Equipment Repairs', 'Custom Steel Fabrication'],
    'Peek Welding (Dubbo NSW 2830) — Mobile breakdown welding and heavy fabrication for agricultural machinery, trailers, augers, stock crates and earthmoving plant across Central West NSW.'
  );

  perform public._seed_verified_regional_vendor(
    'service', 'welding-fabrication',
    'Absolute Steel Fabrication & Mobile Welding', 'Wagga Wagga', '2650', 'NSW',
    '0467 596 240', null, 'https://absolutesteelfabandwelding.com.au/',
    array['machinery_steel_supplier'],
    array['AS/NZS 1554 Structural Welding', 'Mobile Ag & Trailer Repairs', 'Custom Farm Steelwork'],
    'Absolute Steel Fabrication & Welding (East Wagga Wagga NSW 2650) — Workshop and on-farm mobile welding for agricultural implements, trailers, stockyards and structural steel across the Riverina.'
  );

  -- 2Q. Seed All Remaining Freight Categories (grain-freight, machinery-freight, fuel-water-freight, refrigerated-freight, freight-other)
  perform public._seed_verified_regional_vendor(
    'freight', 'grain-freight',
    'Hangan Transport — Bulk Grain & Fertiliser Haulage', 'Dubbo', '2830', 'NSW',
    '0447 114 400', null, 'https://hangantransport.com.au/',
    array['truck_driver_carrier'],
    array['B-Double & Road Train Tippers', 'Bulk Grain, Lime & Gypsum Cartage', 'Harvest Paddock-to-Silo Haulage'],
    'Hangan Transport Pty Ltd (Dubbo NSW 2830) — Bulk tipper B-doubles and road trains carting grain, cottonseed, fertiliser, lime and gypsum across Dubbo, Narromine, Gilgandra, Parkes and Western NSW.'
  );

  perform public._seed_verified_regional_vendor(
    'freight', 'grain-freight',
    'McNaughts Transport Dubbo Depot', 'Dubbo', '2830', 'NSW',
    '02 6885 6132', null, 'https://mcnaughts.com/',
    array['truck_driver_carrier'],
    array['Bulk Grain & Fertiliser Fleet', 'A-Double & Road Train Tippers', 'On-Farm Silo Bag & Auger Support'],
    'McNaughts Transport (6L Boothenba Rd, Dubbo NSW 2830) — Specialist agricultural bulk haulage fleet moving grain, fertiliser and hay across NSW, VIC and QLD.'
  );

  perform public._seed_verified_regional_vendor(
    'freight', 'machinery-freight',
    'MidWest Trucks & Machinery Heavy Haulage', 'Bathurst', '2795', 'NSW',
    '02 6331 4331', null, 'https://mwtmgroup.com.au/',
    array['truck_driver_carrier'],
    array['Low Loader & Float Haulage', 'Oversize Headers, Dozers & Tractors', 'Tilt-Tray & Drop-Deck Transport'],
    'MidWest Trucks & Machinery (35 Great Western Hwy, Kelso / Bathurst NSW 2795) — Heavy haulage floats, low loaders, drop decks and tilt trays moving tractors, headers, excavators and dozers across Orange, Bathurst, Dubbo, Parkes and NSW-wide.'
  );

  perform public._seed_verified_regional_vendor(
    'freight', 'machinery-freight',
    'Transforce Logistics — Ag Machinery & Return Freight', 'Dubbo', '2830', 'NSW',
    '02 6884 1402', null, 'https://transforce.com.au/',
    array['truck_driver_carrier'],
    array['Machinery & Steel Drop-Decks', 'Backload & Return Freight', 'Central West & Interstate'],
    'Transforce Logistics (5/17 Purvis Ln, Dubbo NSW 2830) — Regional machinery transport, steel packs, fencing bundles and return backload freight connecting Dubbo, Orange and Parkes.'
  );

  perform public._seed_verified_regional_vendor(
    'freight', 'fuel-water-freight',
    'Dencol Bulk Water Cartage & Tank Refills', 'Orange', '2800', 'NSW',
    '02 6362 8035', null, 'https://dencoltransport.com.au/',
    array['truck_driver_carrier'],
    array['Bulk Potable Water Delivery', 'Domestic & Stock Tank Refills', 'Orange, Molong & Blayney'],
    'Dencol Bulk Water Cartage (Orange NSW 2800) — Council-approved food-grade stainless water tankers delivering bulk drinking and stock water across Orange, Molong, Cargo, Millthorpe and Blayney.'
  );

  perform public._seed_verified_regional_vendor(
    'freight', 'fuel-water-freight',
    'Oilsplus Central West — On-Farm Bulk Diesel & Lubricants', 'Orange', '2800', 'NSW',
    '02 6391 5000', null, 'https://oilsplus.com/',
    array['truck_driver_carrier'],
    array['On-Farm Bulk Diesel Delivery', 'Agricultural Oils & Greases', 'Overhead & Self-Bunded Farm Tanks'],
    'Oilsplus (Orange 2800 & Gulgong 2852 NSW) — Direct-to-property bulk agricultural diesel, petrol, AdBlue and lubricants delivered across Orange, Molong, Bathurst, Mudgee and Central West NSW.'
  );

  perform public._seed_verified_regional_vendor(
    'freight', 'refrigerated-freight',
    'SDM Refrigerated & General Rural Transport', 'Orange', '2800', 'NSW',
    '02 6361 3606', null, 'https://sdmtransport.com.au/',
    array['truck_driver_carrier'],
    array['Chilled Produce & Meat Freight', 'Temperature-Controlled B-Doubles', 'Central West to Markets'],
    'SDM Transport (Orange NSW 2800) — Temperature-controlled refrigerated transport for orchards, meat processors and primary producers across Orange, Bathurst, Cowra, Young and interstate markets.'
  );

  perform public._seed_verified_regional_vendor(
    'freight', 'freight-other',
    'Nagle Transport — Central West Daily Rural Freight', 'Orange', '2800', 'NSW',
    '02 6361 3606', null, 'https://nagletrans.com.au/',
    array['truck_driver_carrier'],
    array['Palletised Rural Supplies & Steel', 'Tail-Lift & Forklift Unload', 'Orange, Dubbo, Parkes & Bathurst'],
    'Nagle Transport (3a Stephen Place, Orange NSW 2800) — Daily regional freight distribution carrying palletised farm supplies, fencing rolls, spare parts and wool/produce across Orange, Dubbo, Parkes, Forbes and Bathurst.'
  );

  -- 2R. Seed Outback Fencing & Steel Supplies flagship listings in /sale (fencing-materials)
  select id into v_cat_fencing_sale
    from public.categories
   where pillar = 'sale' and slug = 'fencing-materials'
   limit 1;

  -- Owner-posted listings use data_source = 'manual', which requires a consent
  -- policy version (listings_consent_when_user_posted).
  select id into v_policy_id
    from public.policy_versions
   order by effective_from desc
   limit 1;

  if v_cat_fencing_sale is not null then
    select id into v_lst_clipgun
      from public.listings
     where slug = 'outback-18v-cordless-fencing-clip-gun-full-kit-2800';

    if v_lst_clipgun is null then
      insert into public.listings (
        kind, vertical, side, category_id, user_id, business_id, country_code,
        title, description, postcode, state,
        contact_email, contact_phone, contact_best_time,
        data_source, policy_version_id, freshness_status, status, expires_at,
        metadata, slug
      ) values (
        'for_sale', 'sale', 'supply', v_cat_fencing_sale, v_user_id, v_biz_id, 'AU',
        'Outback 18V Cordless Fencing Clip Gun — Full Kit ($1,699) & Contractor Bundles',
        E'Tie rural fencing wire up to 5x faster with the Outback 18V Cordless Fencing Clip Gun. Built for Australian fencing contractors and graziers fastening Hinge Joint, Fixed Knot and plain/barbed wire to steel pickets.\n\nAustralian Bundle Options (AUD inc. GST):\n• Full Kit ($1,699): 1 × 18V Clipgun + 1 × 18V 4.0Ah Battery + 240V Charger + Carry Bag + Belt Clip + Manual.\n• Ready to Work Bundle ($1,879): Everything in the Full Kit + 10,000 C24 Stainless Clips (1 box).\n• Contractor Kit ($2,699): Everything in the Full Kit + 2 Extra 18V 4.0Ah Batteries (3 batteries total) + 40,000 C24 Stainless Clips (4 boxes).\n• Milwaukee Crew Kit ($1,749): 1 × Tool / Skin + Milwaukee M18 Adaptor INCLUDED + 20,000 C24 Stainless Clips (2 boxes).\n• Skin Only ($1,499): 1 × Tool Only.\n\nBattery Compatibility: Runs on the included 18V 4.0Ah high-output lithium-ion battery, fits Makita 18V batteries directly, or runs Milwaukee M18 batteries using the optional $40 Milwaukee M18 Adaptor (included in the Milwaukee Crew Kit). Pick up at 76 Astill Drive, Orange NSW 2800 or fast dispatch Australia-wide.',
        '2800', 'NSW',
        'support@outbackfencingsupplies.com.au', '0421 572 245', 'Mon–Fri 7:30am–5pm (Orange NSW or Australia-wide dispatch)',
        'manual', v_policy_id, 'fresh', 'active', now() + interval '365 days',
        jsonb_build_object('suburb', 'Orange', 'verified_supplier', true),
        'outback-18v-cordless-fencing-clip-gun-full-kit-2800'
      ) returning id into v_lst_clipgun;

      insert into public.sale_details (
        listing_id, price_cents, price_type, quantity, unit, condition, delivery
      ) values (
        v_lst_clipgun, 169900, 'per_unit', 20, 'kit', 'new', 'either'
      ) on conflict (listing_id) do update set
        price_cents = excluded.price_cents,
        price_type = excluded.price_type,
        condition = excluded.condition,
        delivery = excluded.delivery;
    end if;

    select id into v_lst_mesh
      from public.listings
     where slug = 'outback-fixed-knot-hinge-joint-mesh-pickets-gates-2800';

    if v_lst_mesh is null then
      insert into public.listings (
        kind, vertical, side, category_id, user_id, business_id, country_code,
        title, description, postcode, state,
        contact_email, contact_phone, contact_best_time,
        data_source, policy_version_id, freshness_status, status, expires_at,
        metadata, slug
      ) values (
        'for_sale', 'sale', 'supply', v_cat_fencing_sale, v_user_id, v_biz_id, 'AU',
        'Outback Fixed Knot 16/180/15 & Hinge Joint Mesh Rolls, Pickets & N-Brace Gates',
        E'Direct from the manufacturer in Orange NSW (76 Astill Drive) — Australian-rolled rural fencing mesh, steel pickets, strainer assemblies and heavy-duty N-Brace gates ready for yard pickup or regional truck / Mainfreight delivery.\n\nCore Mesh Range:\n• Fixed Knot Exclusion Mesh: 16/180/15 (180cm height, 16 line wires, 15cm stay spacing — 100m, 200m & 250m rolls; 2.8mm HT top/bottom, 2.5mm MT inner).\n• Hinge Joint Mesh: 7/90/30 (Mixed livestock all-rounder), 8/90/30 (Heavy-duty cattle), 8/90/15 (Breeding ewes & lambs), 8/115/15 (Tall exclusion), 8/115/30 (Horses & tall boundary), 11/142/15 (Full exclusion), 11/142/30 (Tall boundary / kangaroos), 6/70/30 (Sheep & goats), 6/90/30 (Budget cattle), 5/51/30 (Apron / dog skirt).\n\nPickets, Strainers & Gates:\n• Outback Bitumen Pickets, Outback Galvanised Pickets & Outback Jumbo Pickets (1.65m, 1.80m, 2.10m, 2.40m).\n• End & Corner Strainer Assemblies (100NB × 2.4m with 40NB/50NB stays).\n• Heavy-duty N-Brace Gates (12ft, 14ft & 16ft + hinge kits).\n\nCall 0421 572 245 for a complete job quote including roll lengths, 5m or 6m picket spacing, wire rows and freight to your property.',
        '2800', 'NSW',
        'support@outbackfencingsupplies.com.au', '0421 572 245', 'Mon–Fri 7:30am–5pm (76 Astill Drive, Orange NSW)',
        'manual', v_policy_id, 'fresh', 'active', now() + interval '365 days',
        jsonb_build_object('suburb', 'Orange', 'verified_supplier', true),
        'outback-fixed-knot-hinge-joint-mesh-pickets-gates-2800'
      ) returning id into v_lst_mesh;

      insert into public.sale_details (
        listing_id, price_cents, price_type, quantity, unit, condition, delivery
      ) values (
        v_lst_mesh, null, 'poa', null, 'roll / pack', 'new', 'either'
      ) on conflict (listing_id) do nothing;
    end if;
  end if;

  return jsonb_build_object('archived_closed_metro_rows', v_archived_closed);
end;
$fn$;

revoke all on function public.run_populate_empty_categories() from public;
grant execute on function public.run_populate_empty_categories() to service_role;

select public.run_populate_empty_categories();

-- 3. Expand Contractor Outreach Workspace so Ali (is_staff) can filter & contact
--    all rural contractors across every category (excluding metro postcodes).
create or replace view public.admin_contractor_outreach
with (security_invoker = true)
as
select
  b.id as business_id,
  coalesce(nullif(b.trading_name, ''), nullif(b.legal_name, ''), '(Unnamed business)') as business_name,
  coalesce(
    nullif(b.suburb, ''),
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
    and candidate.status in ('active', 'expired')
  order by
    (c.slug in ('fencing-contractor', 'fencing-labour')) desc,
    (candidate.status = 'active' and candidate.expires_at > now()) desc,
    candidate.updated_at desc,
    candidate.created_at desc
  limit 1
) l on true
left join public.business_outreach o on o.business_id = b.id
where
  public.current_user_is_staff()
  and b.status = 'active'
  and public.is_rural_postcode(
    coalesce(nullif(b.postcode, ''), nullif(l.postcode, '')),
    coalesce(nullif(b.state_code, ''), nullif(l.state, 'NSW'))
  );

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
  if not public.current_user_is_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

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
    and public.is_rural_postcode(b.postcode, coalesce(b.state_code, 'NSW'))
    and exists (
      select 1
        from public.listings l
       where l.business_id = b.id
         and l.status in ('active', 'expired')
    );

  return v_result;
end;
$function$;

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
