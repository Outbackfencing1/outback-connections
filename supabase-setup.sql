-- ============================================================
-- Outback Connections — Supabase Table Setup
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. JOBS TABLE
-- Used by: dashboard/post-a-job (insert), dashboard/opportunities (select)
-- ============================================================
create table if not exists public.jobs (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  company     text,
  location    text,
  pay_rate    text,
  description text not null,
  status      text not null default 'open' check (status in ('open', 'filled', 'closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index for listing open jobs sorted by newest
create index if not exists idx_jobs_status_created on public.jobs (status, created_at desc);

-- Auto-update updated_at on row change
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_jobs_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- RLS: anyone can read open jobs, only authenticated users can insert
alter table public.jobs enable row level security;

create policy "Anyone can read open jobs"
  on public.jobs for select
  using (status = 'open');

create policy "Authenticated users can insert jobs"
  on public.jobs for insert
  to authenticated
  with check (true);


-- 2. PROFILES TABLE
-- Used by: dashboard/profile (upsert + select), /c/[handle] (public select)
-- ============================================================
create table if not exists public.profiles (
  id             uuid primary key default gen_random_uuid(),
  user_email     text not null unique,
  handle         text unique,
  company        text,
  abn            text,
  service_areas  text[] default '{}',
  skills         text[] default '{}',
  rate_type      text check (rate_type in ('hourly', 'day') or rate_type is null),
  rate_amount    numeric(10,2) default 0,
  licence        text,
  insured        boolean default false,
  insurance_exp  date,
  bio            text,
  portfolio      text[] default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Index for public profile lookup by handle
create index if not exists idx_profiles_handle on public.profiles (handle);

-- Auto-update updated_at
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- RLS: anyone can read profiles (public pages), service role can upsert
alter table public.profiles enable row level security;

create policy "Anyone can read profiles"
  on public.profiles for select
  using (true);

create policy "Service role can manage profiles"
  on public.profiles for all
  to service_role
  using (true)
  with check (true);
