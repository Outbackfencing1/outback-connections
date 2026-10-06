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
--   * Packets are built here, by prep_enqueue, from one locked snapshot of
--     the company, its evidence and the draft. Nothing outside the database
--     writes a packet, so a packet can't mix facts from two evidence
--     revisions, and a capture older than the current evidence is refused
--     (never relabelled as current).
--   * A packet carries everything the work needs: the company facts, every
--     evidence item's text and limitations, and the exact draft copy. A
--     missing fact refuses the packet; it is never invented.
--   * Packets and results are stored as the exact text exchanged, and their
--     SHA-256 is computed here, never taken from the caller.
--   * A packet is immutable; enqueueing the same packet for the same company
--     and kind again returns the existing job (idempotent).
--   * A claim takes a lease (default 10 minutes) with a new lease generation
--     and a unique lease token. Heartbeat, complete and fail need that token
--     and an unexpired lease, so an earlier claim of the same job (by the
--     same worker or another) can't act under a later one.
--   * Each claim also gets a unique assignment ID. The assignment envelope a
--     worker downloads carries it, and a result file must repeat it and the
--     lease generation; complete and fail refuse ('wrong_assignment', no state
--     change) a file made for an earlier claim, even when it's paired with
--     the current claim's token. The packet itself, and its hash, don't change.
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
--     service role only); the service role can read jobs but can't insert or
--     update them directly, so nothing marks a job done without a lease.
--   * Nothing here writes drafts, reviews, approvals or contact events, and a
--     result is the worker's report: it carries no approval or send authority.
--
-- Rollback: drop function if exists public.prep_enqueue(text, text, uuid, text, integer);
--           drop function if exists public.prep_control(uuid, text, text);
--           drop function if exists public.prep_set_paused(boolean, text);
--           drop function if exists public.prep_claim(text, integer, uuid);
--           drop function if exists public.prep_heartbeat(uuid, uuid, jsonb, integer);
--           drop function if exists public.prep_complete(uuid, uuid, uuid, text);
--           drop function if exists public.prep_fail(uuid, uuid, uuid, text);
--           drop function if exists public.ds_prep_result_assignment(text);
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
  lease_generation  integer not null default 0 check (lease_generation >= 0),
  lease_token       uuid,
  assignment_id     uuid,
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
-- Earlier drafts of this file: same columns, and the old worker-name signatures.
alter table public.digital_services_prep_jobs add column if not exists lease_generation integer not null default 0;
alter table public.digital_services_prep_jobs add column if not exists lease_token uuid;
alter table public.digital_services_prep_jobs add column if not exists assignment_id uuid;
drop function if exists public.prep_heartbeat(uuid, text, jsonb, integer);
drop function if exists public.prep_complete(uuid, text, text);
drop function if exists public.prep_fail(uuid, text, text);
-- Earlier signatures without the assignment binding.
drop function if exists public.prep_complete(uuid, uuid, text);
drop function if exists public.prep_fail(uuid, uuid, text);
create index if not exists ix_ds_prep_jobs_ready on public.digital_services_prep_jobs (status, next_attempt_at, created_at);

-- Hashes are computed here from the exact text; the packet, its company, kind
-- and evidence revision never change after enqueue; a result can't change.
-- A packet whose evidence revision isn't the company's current one is refused
-- outright: it was captured before an evidence change.
create or replace function public.ds_prep_job_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.packet_sha256 := encode(sha256(convert_to(new.packet_text, 'UTF8')), 'hex');
    if not exists (select 1 from public.digital_services_pilot where id = new.company_id) then
      raise exception 'no such pilot company' using errcode = 'OC403';
    end if;
    if new.evidence_revision is distinct from (select evidence_revision from public.digital_services_pilot where id = new.company_id)
       or new.evidence_revision is distinct from (new.packet_text::jsonb #>> '{company,evidence_revision}')::integer then
      raise exception 'this packet was captured before an evidence change: build a new one' using errcode = 'OC409';
    end if;
    if new.draft_id is not null and not exists (select 1 from public.digital_services_pilot_drafts d where d.id = new.draft_id and d.company_id = new.company_id) then
      raise exception 'the draft belongs to another company' using errcode = 'OC403';
    end if;
    new.status := 'queued';
    new.attempts := 0;
    new.lease_owner := null;
    new.lease_expires_at := null;
    new.lease_generation := 0;
    new.lease_token := null;
    new.assignment_id := null;
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

-- The only way to queue a job. Locks the company row first: an evidence change
-- (insert, update or delete) and an uncertainties change both update that row,
-- so they wait for this transaction, or this waits for them and then reads
-- what they committed. Every fact in the packet comes from that one snapshot.
create or replace function public.prep_enqueue(p_company text, p_kind text, p_draft uuid, p_created_by text, p_max_attempts integer default 3)
returns table (job_id uuid, outcome text, packet_sha256 text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  c public.digital_services_pilot%rowtype;
  d public.digital_services_pilot_drafts%rowtype;
  ev jsonb;
  packet jsonb;
  ptext text;
  psha text;
  new_id uuid;
begin
  if p_created_by is null or char_length(btrim(p_created_by)) not between 1 and 120 then
    raise exception 'who is queueing is required' using errcode = 'OC403';
  end if;
  if p_kind is null or p_kind not in ('research_review', 'evidence_refresh', 'preview_build', 'copy_draft', 'copy_review') then
    raise exception 'unknown job kind' using errcode = 'OC403';
  end if;
  select * into c from public.digital_services_pilot where id = p_company for update;
  if c.id is null then
    raise exception 'no such pilot company' using errcode = 'OC403';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id,
           'source_url', e.source_url,
           'source_type', e.source_type,
           'checked_at', to_char(e.checked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
           'fact_text', e.fact_text,
           'limitations', to_jsonb(e.limitations)
         ) order by e.checked_at, e.id), '[]'::jsonb)
    into ev
    from public.digital_services_pilot_evidence e
    where e.company_id = c.id;
  if jsonb_array_length(ev) = 0 then
    raise exception 'this company has no recorded evidence: record evidence first' using errcode = 'OC403';
  end if;
  if p_kind in ('copy_review', 'preview_build') then
    if p_draft is null then
      raise exception 'this kind works on a draft revision: choose one' using errcode = 'OC403';
    end if;
    select * into d from public.digital_services_pilot_drafts where id = p_draft;
    if d.id is null or d.company_id <> c.id then
      raise exception 'the draft belongs to another company' using errcode = 'OC403';
    end if;
    if d.sha256 is distinct from encode(sha256(convert_to(d.subject || E'\n\n' || d.body, 'UTF8')), 'hex') then
      raise exception 'the draft''s stored hash doesn''t match its copy' using errcode = 'OC409';
    end if;
    if d.evidence_revision is distinct from c.evidence_revision then
      raise exception 'the draft was written against older evidence: add a new revision first' using errcode = 'OC409';
    end if;
  elsif p_draft is not null then
    raise exception 'this kind doesn''t take a draft' using errcode = 'OC403';
  end if;
  if p_kind = 'copy_draft' and c.offer is null then
    raise exception 'choose the company''s offer before drafting copy' using errcode = 'OC403';
  end if;
  packet := jsonb_build_object(
    'contract_id', 'oc-prep-packet/0.2',
    'job_kind', p_kind,
    'company', jsonb_build_object(
      'id', c.id,
      'name', c.company,
      'lane', c.lane,
      'offer', c.offer,
      'evidence_revision', c.evidence_revision,
      'uncertainties', to_jsonb(c.uncertainties)
    ),
    'evidence', ev,
    'draft', case when d.id is null then null else jsonb_build_object(
      'id', d.id,
      'revision', d.revision,
      'subject', d.subject,
      'body', d.body,
      'sha256', d.sha256,
      'sha256_of', 'subject, blank line, body (UTF-8)',
      'offer', d.offer,
      'evidence_revision', d.evidence_revision
    ) end,
    'task', case p_kind
      when 'research_review' then 'Review the company''s recorded evidence for identity, lane and fit. Report holds; never mark anything sendable.'
      when 'evidence_refresh' then 'Re-check each source and report what changed, with check time and method. Record new evidence through the owner, not this result.'
      when 'preview_build' then 'Build a private preview for the named draft revision. Report the preview''s file hashes; publish nothing.'
      when 'copy_draft' then 'Draft one email for the owner''s review from the evidence in this packet only. Make no claims the evidence doesn''t support.'
      when 'copy_review' then 'Review the draft''s exact copy in this packet against the evidence in this packet. Report a verdict and notes; this is not an approval.'
    end,
    'constraints', jsonb_build_object('sendable', false, 'contact', 'none', 'spending', 'none', 'publishing', 'none',
                                      'approvals', 'owner only, on the review screen'),
    'result_contract', 'oc-prep-result/0.2'
  );
  ptext := packet::text;
  psha := encode(sha256(convert_to(ptext, 'UTF8')), 'hex');
  insert into public.digital_services_prep_jobs (company_id, kind, draft_id, packet_text, packet_sha256, evidence_revision, created_by, max_attempts)
    values (c.id, p_kind, d.id, ptext, psha, c.evidence_revision, btrim(p_created_by), coalesce(p_max_attempts, 3))
    on conflict (company_id, kind, packet_sha256) do nothing
    returning id into new_id;
  if new_id is not null then
    return query select new_id, 'queued'::text, psha;
  else
    return query select j.id, 'already_queued'::text, psha from public.digital_services_prep_jobs j
      where j.company_id = c.id and j.kind = p_kind and j.packet_sha256 = psha;
  end if;
end;
$$;

-- Claim the next ready job (or one named job). Expired leases are reclaimed;
-- each claim counts as an attempt; stale evidence retires a job instead. The
-- returned row carries the new lease token: the claimant's only key to
-- heartbeat, complete or fail this claim.
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
        set status = 'stale', lease_owner = null, lease_expires_at = null, lease_token = null, assignment_id = null,
            last_error = 'evidence changed since this job was queued', finished_at = now()
        where id = j.id;
      if p_job is not null then return; end if;
      continue;
    end if;
    if j.attempts >= j.max_attempts then
      update public.digital_services_prep_jobs
        set status = 'failed', lease_owner = null, lease_expires_at = null, lease_token = null, assignment_id = null,
            last_error = coalesce(last_error, 'no attempts left'), finished_at = now()
        where id = j.id;
      if p_job is not null then return; end if;
      continue;
    end if;
    return query
      update public.digital_services_prep_jobs
        set status = 'leased', attempts = attempts + 1, lease_owner = btrim(p_worker),
            lease_expires_at = now() + make_interval(secs => p_lease_seconds),
            lease_generation = lease_generation + 1, lease_token = gen_random_uuid(), assignment_id = gen_random_uuid()
        where id = j.id
        returning *;
    return;
  end loop;
end;
$$;

-- Extend the lease and record progress: only this claim's token, unexpired.
create or replace function public.prep_heartbeat(p_job uuid, p_token uuid, p_progress jsonb default '{}'::jsonb, p_lease_seconds integer default 600)
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
    where id = p_job and status = 'leased' and lease_token = p_token and lease_expires_at >= now();
  return found;
end;
$$;

-- The assignment a result file names (null if it names none or isn't JSON).
create or replace function public.ds_prep_result_assignment(p_text text)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  return (p_text::jsonb) ->> 'assignment_id';
exception when others then
  return null;
end;
$$;

-- Record the result text. Idempotent for the same result; refuses an expired
-- or superseded claim, a file made for another claim, a different result, or
-- a job whose evidence changed.
create or replace function public.prep_complete(p_job uuid, p_token uuid, p_assignment uuid, p_result_text text)
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
  if j.status <> 'leased' or p_token is null or j.lease_token is distinct from p_token or j.lease_expires_at < now() then
    return 'lost_lease';
  end if;
  -- The file must be the one made for this claim: the caller's assignment and
  -- the one written in the file both equal the live claim's. Nothing changes otherwise.
  if p_assignment is null or j.assignment_id is distinct from p_assignment
     or ds_prep_result_assignment(p_result_text) is distinct from p_assignment::text then
    return 'wrong_assignment';
  end if;
  if j.evidence_revision is distinct from (select evidence_revision from public.digital_services_pilot where id = j.company_id) then
    update public.digital_services_prep_jobs
      set status = 'stale', lease_owner = null, lease_expires_at = null, lease_token = null, assignment_id = null,
          last_error = 'evidence changed while the job was running', finished_at = now()
      where id = p_job;
    return 'stale';
  end if;
  update public.digital_services_prep_jobs
    set status = 'succeeded', result_text = p_result_text, lease_owner = null, lease_expires_at = null, lease_token = null, assignment_id = null,
        last_error = null, finished_at = now()
    where id = p_job;
  return 'succeeded';
end;
$$;

-- A failed attempt: back off (1, 2, 4 … minutes, capped at 60) and re-queue,
-- or fail for good once attempts are used up. Only this claim's token, and
-- only while its lease is live: a late failure changes nothing.
create or replace function public.prep_fail(p_job uuid, p_token uuid, p_assignment uuid, p_error text)
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
  if j.status <> 'leased' or p_token is null or j.lease_token is distinct from p_token or j.lease_expires_at < now() then
    return 'lost_lease';
  end if;
  if p_assignment is null or j.assignment_id is distinct from p_assignment then
    return 'wrong_assignment';
  end if;
  if j.attempts >= j.max_attempts then
    update public.digital_services_prep_jobs
      set status = 'failed', lease_owner = null, lease_expires_at = null, lease_token = null, assignment_id = null,
          last_error = left(p_error, 500), finished_at = now()
      where id = p_job;
    return 'failed';
  end if;
  update public.digital_services_prep_jobs
    set status = 'queued', lease_owner = null, lease_expires_at = null, lease_token = null, assignment_id = null, last_error = left(p_error, 500),
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
      set status = 'cancelled', lease_owner = null, lease_expires_at = null, lease_token = null, assignment_id = null,
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
-- Read only; queueing and every change after that go through the functions.
grant select on public.digital_services_prep_jobs to service_role;
grant select on public.digital_services_prep_settings to service_role;
revoke execute on function public.prep_enqueue(text, text, uuid, text, integer),
  public.prep_claim(text, integer, uuid), public.prep_heartbeat(uuid, uuid, jsonb, integer),
  public.prep_complete(uuid, uuid, uuid, text), public.prep_fail(uuid, uuid, uuid, text),
  public.prep_control(uuid, text, text), public.prep_set_paused(boolean, text),
  public.ds_prep_result_assignment(text) from public, anon, authenticated;
grant execute on function public.prep_enqueue(text, text, uuid, text, integer),
  public.prep_claim(text, integer, uuid), public.prep_heartbeat(uuid, uuid, jsonb, integer),
  public.prep_complete(uuid, uuid, uuid, text), public.prep_fail(uuid, uuid, uuid, text),
  public.prep_control(uuid, text, text), public.prep_set_paused(boolean, text) to service_role;
