-- ============================================================
-- For sale: livestock, hay, grain, machinery, gear
-- ============================================================
-- Josh's vision: "all livestock and harvest sales through here". A fourth
-- listing kind, first-party only (there is nothing honest to scrape for
-- sales), with a price, quantity, condition and pickup/delivery on a
-- 1:1 detail table, mirroring freight_details. Same public read rule as
-- every other listing (active + unexpired), owner insert/update, service
-- role everything.
--
-- Rollback: drop table public.sale_details; delete the 'sale' categories;
-- restore the three check constraints without 'for_sale' / 'sale'.
-- ============================================================

-- ---------- listings: new kind + vertical ----------
alter table public.listings drop constraint if exists listings_kind_check;
alter table public.listings add constraint listings_kind_check
  check (kind = any (array['job','freight','service_offering','service_request','for_sale']));

alter table public.listings drop constraint if exists listings_vertical_check;
alter table public.listings add constraint listings_vertical_check
  check (vertical is null or vertical = any (array['job','freight','service','harvest','livestock','sale']));

-- ---------- categories: new pillar ----------
alter table public.categories drop constraint if exists categories_pillar_check;
alter table public.categories add constraint categories_pillar_check
  check (pillar = any (array['jobs','freight','services','sale']));

insert into public.categories (slug, label, pillar, country_code, sort_order, active, of_relevant)
values
  ('livestock',          'Livestock',               'sale', 'AU', 10, true, true),
  ('hay-fodder',         'Hay & fodder',            'sale', 'AU', 20, true, true),
  ('grain-feed',         'Grain & stock feed',      'sale', 'AU', 30, true, true),
  ('machinery',          'Machinery & equipment',   'sale', 'AU', 40, true, true),
  ('vehicles-trailers',  'Vehicles & trailers',     'sale', 'AU', 50, true, true),
  ('fencing-materials',  'Fencing & steel',         'sale', 'AU', 60, true, true),
  ('water-irrigation',   'Water & irrigation',      'sale', 'AU', 70, true, true),
  ('sale-other',         'Something else',          'sale', 'AU', 900, true, true)
on conflict (country_code, slug) do nothing;

-- ---------- sale_details ----------
create table if not exists public.sale_details (
  listing_id   uuid primary key references public.listings(id) on delete cascade,
  price_cents  integer check (price_cents is null or price_cents >= 0),
  price_type   text not null default 'negotiable'
                 check (price_type in ('fixed','negotiable','per_head','per_bale','per_tonne','per_unit','free','poa')),
  quantity     numeric(12,2) check (quantity is null or quantity >= 0),
  unit         text check (unit is null or char_length(unit) <= 30),
  condition    text not null default 'na' check (condition in ('new','used','na')),
  delivery     text not null default 'pickup' check (delivery in ('pickup','can_deliver','either')),
  sold_at      timestamptz
);

alter table public.sale_details enable row level security;

drop policy if exists "Anyone reads sale_details for readable listings" on public.sale_details;
create policy "Anyone reads sale_details for readable listings"
  on public.sale_details for select to public
  using (exists (
    select 1 from public.listings l
     where l.id = sale_details.listing_id
       and ((l.status = 'active' and l.expires_at > now()) or l.user_id = auth.uid())
  ));

drop policy if exists "Owners insert own sale_details" on public.sale_details;
create policy "Owners insert own sale_details"
  on public.sale_details for insert to authenticated
  with check (exists (select 1 from public.listings l where l.id = sale_details.listing_id and l.user_id = auth.uid()));

drop policy if exists "Owners update own sale_details" on public.sale_details;
create policy "Owners update own sale_details"
  on public.sale_details for update to authenticated
  using (exists (select 1 from public.listings l where l.id = sale_details.listing_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.listings l where l.id = sale_details.listing_id and l.user_id = auth.uid()));

drop policy if exists "Service role manages sale_details" on public.sale_details;
create policy "Service role manages sale_details"
  on public.sale_details for all to service_role
  using (true) with check (true);

grant select on public.sale_details to anon, authenticated;
grant insert, update on public.sale_details to authenticated;
grant all on public.sale_details to service_role;
