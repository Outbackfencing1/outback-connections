-- ============================================================
-- DRAFT — DO NOT APPLY WITHOUT REVIEW.  (item 9: dead-table cleanup)
-- Kept in _drafts/ so it is NOT part of the apply chain.
-- ============================================================
-- Audited 2026-06-08 on project csisezoohgfrpjrhkmls:
--   * public.jobs    — 0 rows; referenced only by dead app/_archive code
--                      (not routed, not imported); no inbound FKs.
--   * public.profiles — 0 rows; same (app/_archive only); no inbound FKs.
--   These are the v1 (Prisma-era) tables, superseded by listings + user_profiles.
--
-- Dropping each table cascades ITS OWN dependent objects only:
--   jobs:     trigger trg_jobs_updated_at, policies (anyone-read-open /
--             authenticated-insert), index idx_jobs_status_created.
--   profiles: trigger trg_profiles_updated_at, policies (anyone-read /
--             service-role-manage), index idx_profiles_handle.
-- The shared set_updated_at() function is NOT dropped (used by live tables).
--
-- Reversal: recreate from the baseline (00000000000000_baseline_live_schema.sql).
--
-- BEFORE APPLYING, also remove the dead references so nothing points at gone
-- tables (optional, separate commit): app/_archive/{dashboard/opportunities,
-- dashboard/profile,dashboard/post-a-job,c/[handle]}.
-- ============================================================

drop table if exists public.jobs cascade;
drop table if exists public.profiles cascade;

-- ============================================================
-- COMPANION (NOT SQL) — Prisma removal, a repo/package change to apply
-- alongside, reviewed separately. Prisma is dead weight (no live importer):
--   1. package.json: delete the "postinstall": "prisma generate" script;
--      remove "@prisma/client" from dependencies and "prisma" from
--      devDependencies.
--   2. delete lib/prisma.ts, prisma/schema.prisma, prisma/dev.db (the prisma/ dir).
--   3. optional: drop the "/generated/prisma" line from .gitignore.
--   4. run a clean install + build to confirm nothing referenced it.
-- ============================================================
