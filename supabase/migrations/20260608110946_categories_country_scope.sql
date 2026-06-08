-- ============================================================
-- Migration 5: categories_country_scope
-- ============================================================
-- Project : csisezoohgfrpjrhkmls
-- Date    : 2026-06-08
-- Type    : ALTER existing categories (54 rows). NO drop/recreate. All rows
--           and IDs preserved (listings.category_id and other FKs target
--           categories.id).
-- Depends : Migration 1 (countries).
--
-- Purpose : Scope the taxonomy by country so NZ/US plug in later as data.
--           - country_code on every category (default 'AU' backfills existing)
--           - slug uniqueness becomes per-country (country_code, slug)
--           - country-scoped browse index
--
-- Pre-verified on live DB: slug uniqueness is enforced solely by the UNIQUE
-- CONSTRAINT `categories_slug_key` (UNIQUE (slug)); there is no separate
-- standalone unique index. So the drop below targets the correct object.
--
-- Public read behaviour UNCHANGED ("Anyone can read active categories" stays).
-- No RLS/policy changes required.
--
-- FOLLOW-UP (tracked, NOT fixed here): once a second country exists,
-- category-by-slug-alone lookups (e.g. /services/[category-slug]) become
-- ambiguous. Resolve when NZ lands by scoping those queries to country_code.
-- ============================================================

-- 1. Add country_code. Default 'AU' backfills all existing rows in place
--    (no ID changes); FK validates against countries (AU seeded in M1).
alter table public.categories
  add column if not exists country_code text not null default 'AU'
                           references public.countries(country_code);

-- 2. Swap slug uniqueness: global (slug) -> per-country (country_code, slug).
--    Drops only the UNIQUE CONSTRAINT on slug (no FK references slug; all
--    category FKs target categories.id), which also removes its backing index.
--    While AU is the only country, existing slug-only queries still resolve to
--    exactly one row.
alter table public.categories drop constraint if exists categories_slug_key;
alter table public.categories
  add constraint categories_country_slug_key unique (country_code, slug);

-- 3. Country-scoped browse index. Existing idx_categories_pillar_active
--    (pillar, active, sort_order) is KEPT for current country-agnostic queries.
create index if not exists idx_categories_country_pillar_active
  on public.categories (country_code, pillar, active, sort_order);

-- ============================================================
-- ROLLBACK (manual):
--   drop index if exists idx_categories_country_pillar_active;
--   alter table public.categories drop constraint if exists categories_country_slug_key;
--   alter table public.categories add constraint categories_slug_key unique (slug);  -- safe only while single-country
--   alter table public.categories drop column if exists country_code;
-- ============================================================
