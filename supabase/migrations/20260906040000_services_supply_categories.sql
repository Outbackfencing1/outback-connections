-- ============================================================
-- Services taxonomy: supply buckets (promoted from _drafts, 6 Sep 2026)
-- ============================================================
-- Adds four ACTIVE Services categories for rural SUPPLY stores, which the
-- taxonomy lacked (it was contractor-services only). Honest homes for rural
-- supplies / produce + stock feed / machinery dealers / fodder + hay rows,
-- including Outback Fencing & Steel Supplies' own directory entry (the
-- disclosed-operator listing Josh decided to claim as listing #1 on 4 Jul).
--
-- Additive + idempotent. Slug uniqueness is (country_code, slug) (migration
-- M5). Scraped supply rows currently in services-other reclassify on the
-- next re-import.
--
-- Rollback (manual, safe only while no listings reference these ids):
--   delete from public.categories
--    where country_code = 'AU' and pillar = 'services'
--      and slug in ('rural-supplies','produce-stock-feed','farm-machinery-dealer','fodder-hay');
-- ============================================================

insert into public.categories (slug, label, pillar, country_code, sort_order, active, of_relevant)
values
  ('rural-supplies',        'Rural supplies store',  'services', 'AU', 200, true, true),
  ('produce-stock-feed',    'Produce / stock feed',  'services', 'AU', 210, true, true),
  ('farm-machinery-dealer', 'Farm machinery dealer', 'services', 'AU', 220, true, true),
  ('fodder-hay',            'Fodder / hay supplier', 'services', 'AU', 230, true, true)
on conflict (country_code, slug) do nothing;
