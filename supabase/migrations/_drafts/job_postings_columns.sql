-- ============================================================
-- DRAFT — DO NOT APPLY WITHOUT REVIEW.  (job-ad ingestion — schema)
-- Kept in _drafts/ so it is NOT part of the apply chain.
-- Review-gated WITH docs/JOBS-INGESTION-PLAN.md.
-- ============================================================
-- Additive columns on job_details for REAL job ADS (distinct from the business
-- directory entries already supported). Additive + nullable → safe to apply
-- later without breaking the existing posting/ingest paths.
--
-- job_details ALREADY has, and we REUSE (no duplicate columns):
--   work_type              <- ImportRecord.employment_type (full_time/casual/contract/seasonal/day_rate)
--   accommodation_provided <- ImportRecord.accommodation_included
--   start_date             <- ImportRecord.start_date
--   pay_type, pay_amount   -- legacy coarse pay; the structured salary_* below supersede for ads
--
-- NEW columns (the genuinely-missing ad fields):
-- ============================================================

alter table public.job_details
  add column if not exists application_url    text,
  add column if not exists closing_date       date,                         -- application deadline
  add column if not exists salary_min         numeric(12,2),
  add column if not exists salary_max         numeric(12,2),
  add column if not exists salary_period      text,                         -- hour|day|week|month|year
  add column if not exists salary_currency    text not null default 'AUD',
  add column if not exists salary_raw         text,                         -- verbatim scraped salary string
  add column if not exists employer_name_raw  text;                         -- raw employer string pre business-linking

alter table public.job_details
  drop constraint if exists job_details_salary_period_check;
alter table public.job_details
  add constraint job_details_salary_period_check
  check (salary_period is null or salary_period in ('hour','day','week','month','year'));

-- ============================================================
-- ROLLBACK (manual):
--   alter table public.job_details
--     drop constraint if exists job_details_salary_period_check,
--     drop column if exists employer_name_raw,
--     drop column if exists salary_raw,
--     drop column if exists salary_currency,
--     drop column if exists salary_period,
--     drop column if exists salary_max,
--     drop column if exists salary_min,
--     drop column if exists closing_date,
--     drop column if exists application_url;
-- ============================================================
