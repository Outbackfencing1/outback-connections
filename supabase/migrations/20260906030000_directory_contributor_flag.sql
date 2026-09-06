-- ============================================================
-- user_profiles.directory_contributor
-- ============================================================
-- Lets a trusted staff account add UNCLAIMED directory entries through
-- /dashboard/directory/add (which calls ingest_scraped_business via the
-- service role). It grants nothing else: no moderation, claims, import,
-- lockdown or outreach powers.
--
-- Why: the 39 fencing contractors added 26 Aug-4 Sep 2026 went in through
-- the PUBLIC post form because the staff member had no other path, so the
-- site treated them as owner-posted. This flag + the quick-add page is the
-- proper path. Users cannot set it themselves (the own-row UPDATE policy on
-- user_profiles was removed on 14 Aug 2026; only service_role writes here).
--
-- Rollback: alter table public.user_profiles drop column directory_contributor;
-- ============================================================

alter table public.user_profiles
  add column if not exists directory_contributor boolean not null default false;

comment on column public.user_profiles.directory_contributor is
  'May add unclaimed directory entries via /dashboard/directory/add (ingest_scraped_business). Grants nothing else. service_role sets it.';
