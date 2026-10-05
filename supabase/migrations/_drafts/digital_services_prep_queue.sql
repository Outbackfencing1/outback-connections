-- ============================================================
-- DRAFT — NOT APPLIED. Apply only with Josh's approval, after
-- digital_services_pilot.sql (it references the pilot tables).
--
-- digital_services_prep_jobs: a durable, owner-only queue of preparation
-- work for pilot companies (research review, evidence refresh, preview
-- build, copy draft, copy review). It is a queue and a record, not a worker:
-- no automatic worker exists in this repository. A job moves only when a
-- person (or the private engine, run by a person) claims it, works from its
-- packet and hands back a result file.
--
-- Rules the database enforces:
--   * Packets and results are stored as the exact text exchanged, and their
--     SHA-256 is computed here, never taken from the caller.
--   * A packet is immutable; enqueueing the same packet for the same company
--     and kind again returns the existing job (idempotent).
--   * A claim takes a lease (default 10 minutes). Heartbeats extend it and
--     record progress; only the lease holder can heartbeat, complete or fail.
--   * An expired lease is reclaimable (restart recovery); each claim counts
--     as an attempt, and a job that runs out of attempts fails.
--   * A failure re-queues with exponential backoff (1, 2, 4 … minutes, capped
--     at 60) until max_attempts, then fails.
--   * The whole queue, or one job, can be paused and resumed.
--   * A job is tied to the company's evidence revision when enqueued. If the
--     evidence changes, the job goes stale: it can't be claimed or completed.
--   * Completing is idempotent: the same result again returns 'already'; a
--     different result for a finished job is refused ('conflict').
--   * Every state change goes through the functions below (security definer,
--     service role only); the service role can insert and read jobs but can't
--     update them directly, so nothing marks a job done without a lease.
--   * Nothing here writes drafts, reviews, approvals or contact events.
--
-- Rollback: drop function if exists public.prep_control(uuid, text, text);
--           drop function if exists public.prep_set_paused(boolean, text);
--           drop function if exists public.prep_claim(text, integer, uuid);
--           drop function if exists public.prep_heartbeat(uuid, text, jsonb, integer);
--           drop function if exists public.prep_complete(uuid, text, text);
--           drop function if exists public.prep_fail(uuid, text, text);
--           drop function if exists public.ds_prep_job_guard();
--           drop table if exists public.digital_services_prep_jobs;
--           drop table if exists public.digital_services_prep_settings;
-- ============================================================

create table if not exists public.digital_services_prep_settings (
  id      boolean primary key default true check (id),
  paused  boolean not null default false,
  paused_at timestamptz,
  paused_by text
);
insert into public.digital_services_prep_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.digital_services_prep_jobs (
  id                uuid primary key default gen_random_uuid(),
  company_id        text not null references public.digital_services_pilot(id),
  kind              text not null check (kind in ('research_review', 'evidence_refresh', 'preview_build', 'copy_draft', 'copy_review')),
  draft_id          uuid references public.digital_services_pilot_drafts(id),
  packet_text       text not null check (char_length(packet_text) between 2 and 200000),
  packet_sha256     text not null,
  evidence_revision integer not null,
  status            text not null default 'queued'
                      check (status in ('queued', 'leased', 'succeeded', 'failed', 'paused', 'cancelled', 'stale')),
  attempts          integer not null default 0 check (attempts >= 0),
  max_attempts      integer not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at   timestamptz not null default now(),
  lease_owner       text check (lease_owner is null or char_length(lease_owner) between 1 and 120),
  lease_expires_at  timestamptz,
  progress          jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object'),
  last_error        text check (last_error is null or char_length(last_error) <= 500),
  result_text       text check (result_text is null or char_length(result_text) <= 500000),
  result_sha256     text,
  created_by        text not null check (char_length(btrim(created_by)) between 1 and 120),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  finished_at       timestamptz
);
create unique index if not exists uq_ds_prep_job_packet on public.digital_services_prep_jobs (company_id, kind, packet_sha256);
create index if not exists ix_ds_prep_jobs_ready on public.digital_services_prep_jobs (status, next_attempt_at, created_at);

-- Hashes are computed here from the exact text; the packet, its company, kind
-- and evidence revision never change after enqueue; a result can't change.
create or replace function public.ds_prep_job_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.packet_sha256 := encode(sha256(convert_to(new.packet_text, 'UTF8')), 'hex');
    new.evidence_revision := (select evidence_revision from public.digital_services_pilot where id = new.company_id);
    if new.evidence_revision is null then
      raise exception 'no such pilot company' using errcode = 'OC403';
    end if;
    if new.draft_id is not null and not exists (select 1 from public.digital_services_pilot_drafts d where d.id = new.draft_id and d.company_id = new.company_id) then
      raise exception 'the draft belongs to another company' using errcode = 'OC403';
    end if;
    new.status := 'queued';
    new.attempts := 0;
    new.result_text := null;
    new.result_sha256 := null;
    return new;
  end if;
  if (new.packet_text, new.company_id, new.kind, new.draft_id, new.evidence_revision, new.created_by, new.created_at)
     is distinct from (old.packet_text, old.company_id, old.kind, old.draft_id, old.evidence_revision, old.created_by, old.created_at) then
    raise exception 'a queued packet is immutable: enqueue a new job' using errcode = 'OC409';
  end if;
  if old.result_text is not null and new.result_text is distinct from old.result_text then
    raise exception 'a recorded result is immutable' using errcode = 'OC409';
  end if;
  new.packet_sha256 := old.packet_sha256;
  new.result_sha256 := case when new.result_text is null then null else encode(sha256(convert_to(new.result_text, 'UTF8')), 'hex') end;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_ds_prep_job_guard on public.digital_services_prep_jobs;
create trigger trg_ds_prep_job_guard
  before insert or update on public.digital_services_prep_jobs
  for each row execute function public.ds_prep_job_guard();

-- Claim the next ready job (or one named job). Expired leases are reclaimed;
-- each claim counts as an attempt; stale evidence retires a job instead.
create or replace function public.prep_claim(p_worker text, p_lease_seconds integer default 600, p_job uuid default null)
returns setof public.digital_services_prep_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.digital_services_prep_jobs%rowtype;
begin
  if p_worker is null or char_length(btrim(p_worker)) not between 1 and 120 then
    raise exception 'a worker name is required' using errcode = 'OC403';
  end if;
  if p_lease_seconds not between 30 and 86400 then
    raise exception 'lease must be between 30 seconds and 24 hours' using errcode = 'OC403';
  end if;
  if (select paused from public.digital_services_prep_settings) then
    return;
  end if;
  loop
    select * into j from public.digital_services_prep_jobs
      where (p_job is null or id = p_job)
        and ((status = 'queued' and next_attempt_at <= now()) or (status = 'leased' and lease_expires_at < now()))
      order by next_attempt_at, created_at
      limit 1
      for update skip locked;
    if j.id is null then return; end if;
    if j.evidence_revision is distinct from (select evidence_revision from public.digital_services_pilot where id = j.company_id) then
      update public.digital_services_prep_jobs
        set status = 'stale', lease_owner = null, lease_expires_at = null,
            last_error = 'evidence changed since this job was queued', finished_at = now()
        where id = j.id;
      if p_job is not null then return; end if;
      continue;
    end if;
    if j.attempts >= j.max_attempts then
      update public.digital_services_prep_jobs
        set status = 'failed', lease_owner = null, lease_expires_at = null,
            last_error = coalesce(last_error, 'no attempts left'), finished_at = now()
        where id = j.id;
      if p_job is not null then return; end if;
      continue;
    end if;
    return query
      update public.digital_services_prep_jobs
        set status = 'leased', attempts = attempts + 1, lease_owner = btrim(p_worker),
            lease_expires_at = now() + make_interval(secs => p_lease_seconds)
        where id = j.id
        returning *;
    return;
  end loop;
end;
$$;

-- Extend the lease and record progress; only the current, unexpired holder.
create or replace function public.prep_heartbeat(p_job uuid, p_worker text, p_progress jsonb default '{}'::jsonb, p_lease_seconds integer default 600)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_lease_seconds not between 30 and 86400 then
    raise exception 'lease must be between 30 seconds and 24 hours' using errcode = 'OC403';
  end if;
  update public.digital_services_prep_jobs
    set progress = coalesce(p_progress, '{}'::jsonb), lease_expires_at = now() + make_interval(secs => p_lease_seconds)
    where id = p_job and status = 'leased' and lease_owner = btrim(p_worker) and lease_expires_at >= now();
  return found;
end;
$$;

-- Record the result text. Idempotent for the same result; refuses a lost
-- lease, a different result, or a job whose evidence changed meanwhile.
create or replace function public.prep_complete(p_job uuid, p_worker text, p_result_text text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.digital_services_prep_jobs%rowtype;
begin
  select * into j from public.digital_services_prep_jobs where id = p_job for update;
  if j.id is null then return 'not_found'; end if;
  if j.status = 'succeeded' then
    return case when j.result_sha256 = encode(sha256(convert_to(p_result_text, 'UTF8')), 'hex') then 'already' else 'conflict' end;
  end if;
  if j.status <> 'leased' or j.lease_owner is distinct from btrim(p_worker) or j.lease_expires_at < now() then
    return 'lost_lease';
  end if;
  if j.evidence_revision is distinct from (select evidence_revision from public.digital_services_pilot where id = j.company_id) then
    update public.digital_services_prep_jobs
      set status = 'stale', lease_owner = null, lease_expires_at = null,
          last_error = 'evidence changed while the job was running', finished_at = now()
      where id = p_job;
    return 'stale';
  end if;
  update public.digital_services_prep_jobs
    set status = 'succeeded', result_text = p_result_text, lease_owner = null, lease_expires_at = null,
        last_error = null, finished_at = now()
    where id = p_job;
  return 'succeeded';
end;
$$;

-- A failed attempt: back off (1, 2, 4 … minutes, capped at 60) and re-queue,
-- or fail for good once attempts are used up. Only the lease holder.
create or replace function public.prep_fail(p_job uuid, p_worker text, p_error text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.digital_services_prep_jobs%rowtype;
begin
  select * into j from public.digital_services_prep_jobs where id = p_job for update;
  if j.id is null then return 'not_found'; end if;
  if j.status <> 'leased' or j.lease_owner is distinct from btrim(p_worker) then
    return 'lost_lease';
  end if;
  if j.attempts >= j.max_attempts then
    update public.digital_services_prep_jobs
      set status = 'failed', lease_owner = null, lease_expires_at = null, last_error = left(p_error, 500), finished_at = now()
      where id = p_job;
    return 'failed';
  end if;
  update public.digital_services_prep_jobs
    set status = 'queued', lease_owner = null, lease_expires_at = null, last_error = left(p_error, 500),
        next_attempt_at = now() + make_interval(mins => least(60, power(2, greatest(j.attempts - 1, 0))::int))
    where id = p_job;
  return 'retrying';
end;
$$;

-- Owner controls. pause: a queued job waits; resume: back to queued; retry:
-- a backing-off job runs now, a failed one gets a fresh set of attempts;
-- cancel: stops a job (a worker still holding it then finds its lease lost).
-- A stale job can't be retried: its evidence changed, so enqueue a new packet.
create or replace function public.prep_control(p_job uuid, p_action text, p_by text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.digital_services_prep_jobs%rowtype;
begin
  if p_by is null or char_length(btrim(p_by)) not between 1 and 120 then
    raise exception 'who is acting is required' using errcode = 'OC403';
  end if;
  select * into j from public.digital_services_prep_jobs where id = p_job for update;
  if j.id is null then return 'not_found'; end if;
  if p_action = 'pause' and j.status = 'queued' then
    update public.digital_services_prep_jobs set status = 'paused' where id = p_job;
  elsif p_action = 'resume' and j.status = 'paused' then
    update public.digital_services_prep_jobs set status = 'queued' where id = p_job;
  elsif p_action = 'retry' and j.status = 'queued' then
    update public.digital_services_prep_jobs set next_attempt_at = now() where id = p_job;
  elsif p_action = 'retry' and j.status = 'failed' then
    update public.digital_services_prep_jobs set status = 'queued', attempts = 0, next_attempt_at = now(), finished_at = null where id = p_job;
  elsif p_action = 'cancel' and j.status in ('queued', 'paused', 'leased', 'failed') then
    update public.digital_services_prep_jobs
      set status = 'cancelled', lease_owner = null, lease_expires_at = null,
          last_error = left('cancelled by ' || btrim(p_by), 500), finished_at = now()
      where id = p_job;
  elsif p_action in ('pause', 'resume', 'retry', 'cancel') then
    return 'not_allowed';
  else
    raise exception 'unknown action' using errcode = 'OC403';
  end if;
  return 'done';
end;
$$;

create or replace function public.prep_set_paused(p_paused boolean, p_by text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.digital_services_prep_settings
    set paused = p_paused, paused_at = case when p_paused then now() else null end,
        paused_by = case when p_paused then left(btrim(p_by), 120) else null end;
  return p_paused;
end;
$$;

alter table public.digital_services_prep_jobs enable row level security;
alter table public.digital_services_prep_settings enable row level security;
drop policy if exists "Service role manages prep jobs" on public.digital_services_prep_jobs;
create policy "Service role manages prep jobs" on public.digital_services_prep_jobs for all to service_role using (true) with check (true);
drop policy if exists "Service role manages prep settings" on public.digital_services_prep_settings;
create policy "Service role manages prep settings" on public.digital_services_prep_settings for all to service_role using (true) with check (true);
revoke all on public.digital_services_prep_jobs, public.digital_services_prep_settings from anon, authenticated, service_role;
-- Enqueue and read; every change after that goes through the functions.
grant select, insert on public.digital_services_prep_jobs to service_role;
grant select on public.digital_services_prep_settings to service_role;
revoke execute on function public.prep_claim(text, integer, uuid), public.prep_heartbeat(uuid, text, jsonb, integer),
  public.prep_complete(uuid, text, text), public.prep_fail(uuid, text, text),
  public.prep_control(uuid, text, text), public.prep_set_paused(boolean, text) from public, anon, authenticated;
grant execute on function public.prep_claim(text, integer, uuid), public.prep_heartbeat(uuid, text, jsonb, integer),
  public.prep_complete(uuid, text, text), public.prep_fail(uuid, text, text),
  public.prep_control(uuid, text, text), public.prep_set_paused(boolean, text) to service_role;
