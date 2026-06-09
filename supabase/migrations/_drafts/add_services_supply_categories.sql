-- ============================================================
-- DRAFT — DO NOT APPLY WITHOUT REVIEW.  (services taxonomy — supply buckets)
-- Kept in _drafts/ so it is NOT part of the apply chain.
-- ============================================================
-- Adds four ACTIVE Services categories for rural SUPPLY stores, which the live
-- taxonomy lacks (it is contractor-services only). These are the honest homes
-- for the services-mode scraper seeds (rural supplies / produce+stock-feed /
-- machinery dealers / fodder+hay) — see scripts/scrape-rural-directory.mjs.
--
-- Additive + idempotent. Slug uniqueness is (country_code, slug) (migration M5),
-- so the ON CONFLICT target matches that. Once applied, a re-scrape reclassifies
-- the scraped supply rows out of the services-other fallback automatically.
-- ============================================================

insert into public.categories (slug, label, pillar, country_code, sort_order, active, of_relevant)
values
  ('rural-supplies',        'Rural supplies store',  'services', 'AU', 200, true, true),
  ('produce-stock-feed',    'Produce / stock feed',  'services', 'AU', 210, true, true),
  ('farm-machinery-dealer', 'Farm machinery dealer', 'services', 'AU', 220, true, true),
  ('fodder-hay',            'Fodder / hay supplier', 'services', 'AU', 230, true, true)
on conflict (country_code, slug) do nothing;

-- ============================================================
-- ROLLBACK (manual):
--   delete from public.categories
--    where country_code = 'AU' and pillar = 'services'
--      and slug in ('rural-supplies','produce-stock-feed','farm-machinery-dealer','fodder-hay');
-- (Safe only while no listings reference these category_ids.)
-- ============================================================
