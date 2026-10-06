-- ============================================================
-- DRAFT — NOT APPLIED. Apply only with Josh's approval, after
-- digital_services_pilot.sql (accepted rows link to pilot companies).
--
-- Owner-only research work units: an assignment (one niche, one small
-- cohort, the exact request/schema/exclusions it was issued with), the raw
-- returns a researcher hands back (immutable, versioned), the candidates each
-- return staged, and the owner's decisions. It is a record of research, not a
-- worker: the only connection is a file hand-off, and nothing here contacts
-- anyone or makes a row sendable.
--
-- Rules the database enforces:
--   * An assignment's request, schema and exclusions text are stored as
--     issued and hashed here; they never change. Re-creating the same request
--     with the same hashes returns the same assignment; different hashes are
--     refused (a new request needs a new request ID).
--   * connection is 'file_handoff_only': Start means "the assignment file is
--     ready to hand over", never that a model or agent was invoked.
--   * A return's raw text is stored exactly as received, hashed here, and
--     immutable. The same text again is 'already_staged'; different text is
--     the next version. A return whose contract checks failed is kept (the
--     exception queue) but stages no candidates.
--   * Candidates are keyed (request_id, candidate_key, version): candidate
--     keys are only unique within one request, so the same key in another
--     request is another business. A newer version supersedes the older rows
--     (kept as history) and any decision on them.
--   * Every staged candidate is sendable = false with contact basis
--     'not_established'. Holds and reasons are kept as given.
--   * Decisions are append-only. Accepting needs the latest version of a row
--     proposed for owner review, and an existing pilot company the owner
--     names: no OC ID is ever invented here.
--   * Every change goes through the security-definer functions below, which
--     only the service role can execute; the service role reads directly.
--     anon and authenticated get nothing.
--
-- Rollback: drop function if exists public.research_decide(uuid, text, text, text, text);
--           drop function if exists public.research_stage_return(uuid, text, jsonb, text);
--           drop function if exists public.research_checkpoint(uuid, jsonb, text, text);
--           drop function if exists public.research_assignment_control(uuid, text, text);
--           drop function if exists public.research_assignment_create(text, text, text, integer, text, text, text, text);
--           drop function if exists public.ds_research_immutable();
--           drop table if exists public.digital_services_research_decisions;
--           drop table if exists public.digital_services_research_candidates;
--           drop table if exists public.digital_services_research_returns;
--           drop table if exists public.digital_services_research_events;
--           drop table if exists public.digital_services_research_assignments;
-- ============================================================

create table if not exists public.digital_services_research_assignments (
  id                 uuid primary key default gen_random_uuid(),
  request_id         text not null unique check (char_length(request_id) between 3 and 120),
  niche              text not null check (niche in ('cleaning', 'detailing')),
  country            text not null default 'AU' check (country ~ '^[A-Z]{2}$'),
  cohort_limit       integer not null check (cohort_limit between 1 and 25),
  request_text       text not null check (char_length(request_text) between 2 and 500000),
  schema_text        text not null check (char_length(schema_text) between 2 and 500000),
  exclusions_text    text not null check (char_length(exclusions_text) between 2 and 2000000),
  request_sha256     text not null,
  schema_sha256      text not null,
  exclusions_sha256  text not null,
  connection         text not null default 'file_handoff_only' check (connection in ('file_handoff_only')),
  state              text not null default 'draft' check (state in ('draft', 'started', 'paused', 'returned', 'closed')),
  progress           jsonb not null default '{}'::jsonb check (jsonb_typeof(progress) = 'object'),
  created_by         text not null check (char_length(btrim(created_by)) between 1 and 120),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.digital_services_research_events (
  id             bigint generated always as identity primary key,
  assignment_id  uuid not null references public.digital_services_research_assignments(id),
  kind           text not null check (kind in ('created', 'start', 'pause', 'resume', 'close', 'checkpoint', 'return_staged', 'return_repeated', 'return_failed', 'decision')),
  detail         jsonb not null default '{}'::jsonb,
  actor          text not null,
  at             timestamptz not null default now()
);
create index if not exists ix_ds_research_events on public.digital_services_research_events (assignment_id, id);

create table if not exists public.digital_services_research_returns (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.digital_services_research_assignments(id),
  version        integer not null check (version >= 1),
  raw_text       text not null check (char_length(raw_text) between 2 and 2000000),
  raw_sha256     text not null,
  contract_ok    boolean not null,
  contract_errors text[] not null default '{}',
  report         jsonb not null check (jsonb_typeof(report) = 'object'),
  counts         jsonb not null default '{}'::jsonb,
  staged_by      text not null,
  created_at     timestamptz not null default now(),
  unique (assignment_id, version),
  unique (assignment_id, raw_sha256)
);

create table if not exists public.digital_services_research_candidates (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.digital_services_research_assignments(id),
  return_id      uuid not null references public.digital_services_research_returns(id),
  request_id     text not null,
  candidate_key  text not null check (char_length(candidate_key) between 1 and 200),
  version        integer not null,
  business       text not null default '',
  locality       text,
  domain         text,
  outcome        text not null check (outcome in ('proposed_for_owner_review', 'held', 'excluded', 'rejected')),
  reasons        text[] not null default '{}',
  holds          text[] not null default '{}',
  review         jsonb not null check (jsonb_typeof(review) = 'object'),
  sendable       boolean not null default false check (sendable = false),
  contact_basis_status text not null default 'not_established' check (contact_basis_status = 'not_established'),
  superseded_by_version integer,
  created_at     timestamptz not null default now(),
  unique (request_id, candidate_key, version)
);
create index if not exists ix_ds_research_candidates_current on public.digital_services_research_candidates (assignment_id, superseded_by_version, outcome);

create table if not exists public.digital_services_research_decisions (
  id                uuid primary key default gen_random_uuid(),
  candidate_id      uuid not null references public.digital_services_research_candidates(id),
  decision          text not null check (decision in ('hold', 'reject', 'accept')),
  pilot_company_id  text references public.digital_services_pilot(id),
  note              text check (note is null or char_length(note) <= 1000),
  decided_by        text not null,
  decided_at        timestamptz not null default now(),
  check ((decision = 'accept') = (pilot_company_id is not null))
);

-- Issued and returned text never changes; a staged row only gains its
-- superseded_by_version; history rows are never edited.
create or replace function public.ds_research_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'research records are kept: nothing is deleted' using errcode = 'OC409';
  end if;
  if tg_table_name = 'digital_services_research_assignments' then
    if (new.request_id, new.niche, new.country, new.cohort_limit, new.request_text, new.schema_text, new.exclusions_text,
        new.request_sha256, new.schema_sha256, new.exclusions_sha256, new.connection, new.created_by, new.created_at)
       is distinct from
       (old.request_id, old.niche, old.country, old.cohort_limit, old.request_text, old.schema_text, old.exclusions_text,
        old.request_sha256, old.schema_sha256, old.exclusions_sha256, old.connection, old.created_by, old.created_at) then
      raise exception 'an issued assignment is immutable: create a new request' using errcode = 'OC409';
    end if;
    new.updated_at := now();
    return new;
  elsif tg_table_name = 'digital_services_research_candidates' then
    if old.superseded_by_version is not null or new.superseded_by_version is null
       or (to_jsonb(new) - 'superseded_by_version') is distinct from (to_jsonb(old) - 'superseded_by_version') then
      raise exception 'a staged candidate is immutable' using errcode = 'OC409';
    end if;
    return new;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = 'OC409';
end;
$$;
drop trigger if exists trg_ds_research_assignments_immutable on public.digital_services_research_assignments;
create trigger trg_ds_research_assignments_immutable before update or delete on public.digital_services_research_assignments
  for each row execute function public.ds_research_immutable();
drop trigger if exists trg_ds_research_events_immutable on public.digital_services_research_events;
create trigger trg_ds_research_events_immutable before update or delete on public.digital_services_research_events
  for each row execute function public.ds_research_immutable();
drop trigger if exists trg_ds_research_returns_immutable on public.digital_services_research_returns;
create trigger trg_ds_research_returns_immutable before update or delete on public.digital_services_research_returns
  for each row execute function public.ds_research_immutable();
drop trigger if exists trg_ds_research_candidates_immutable on public.digital_services_research_candidates;
create trigger trg_ds_research_candidates_immutable before update or delete on public.digital_services_research_candidates
  for each row execute function public.ds_research_immutable();
drop trigger if exists trg_ds_research_decisions_immutable on public.digital_services_research_decisions;
create trigger trg_ds_research_decisions_immutable before update or delete on public.digital_services_research_decisions
  for each row execute function public.ds_research_immutable();

create or replace function public.research_assignment_create(
  p_request_id text, p_niche text, p_country text, p_cohort_limit integer,
  p_request_text text, p_schema_text text, p_exclusions_text text, p_by text)
returns table (assignment_id uuid, outcome text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  a public.digital_services_research_assignments%rowtype;
  rs text := encode(sha256(convert_to(p_request_text, 'UTF8')), 'hex');
  ss text := encode(sha256(convert_to(p_schema_text, 'UTF8')), 'hex');
  es text := encode(sha256(convert_to(p_exclusions_text, 'UTF8')), 'hex');
begin
  if p_by is null or char_length(btrim(p_by)) not between 1 and 120 then
    raise exception 'who is creating the assignment is required' using errcode = 'OC403';
  end if;
  select * into a from public.digital_services_research_assignments where request_id = p_request_id for update;
  if a.id is not null then
    if (a.request_sha256, a.schema_sha256, a.exclusions_sha256, a.niche, a.cohort_limit) is distinct from (rs, ss, es, p_niche, p_cohort_limit) then
      raise exception 'this request ID was issued with different files: use a new request ID' using errcode = 'OC409';
    end if;
    return query select a.id, 'already_exists'::text;
    return;
  end if;
  insert into public.digital_services_research_assignments
    (request_id, niche, country, cohort_limit, request_text, schema_text, exclusions_text, request_sha256, schema_sha256, exclusions_sha256, created_by)
    values (p_request_id, p_niche, coalesce(p_country, 'AU'), p_cohort_limit, p_request_text, p_schema_text, p_exclusions_text, rs, ss, es, btrim(p_by))
    returning * into a;
  insert into public.digital_services_research_events (assignment_id, kind, detail, actor)
    values (a.id, 'created', jsonb_build_object('request_sha256', rs, 'schema_sha256', ss, 'exclusions_sha256', es, 'connection', a.connection), btrim(p_by));
  return query select a.id, 'created'::text;
end;
$$;

-- start: the file is ready to hand over (no worker is invoked); pause/resume:
-- the owner's bookkeeping while research is out; close: no more returns.
create or replace function public.research_assignment_control(p_id uuid, p_action text, p_by text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.digital_services_research_assignments%rowtype;
  next_state text;
begin
  select * into a from public.digital_services_research_assignments where id = p_id for update;
  if a.id is null then return 'not_found'; end if;
  next_state := case
    when p_action = 'start' and a.state = 'draft' then 'started'
    when p_action = 'pause' and a.state = 'started' then 'paused'
    when p_action = 'resume' and a.state = 'paused' then 'started'
    when p_action = 'close' and a.state <> 'closed' then 'closed'
  end;
  if p_action not in ('start', 'pause', 'resume', 'close') then
    raise exception 'unknown action' using errcode = 'OC403';
  end if;
  if next_state is null then return 'not_allowed'; end if;
  update public.digital_services_research_assignments set state = next_state where id = p_id;
  insert into public.digital_services_research_events (assignment_id, kind, detail, actor)
    values (p_id, p_action, jsonb_build_object('from', a.state, 'to', next_state, 'connection', a.connection), left(btrim(p_by), 120));
  return 'done';
end;
$$;

create or replace function public.research_checkpoint(p_id uuid, p_progress jsonb, p_note text, p_by text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.digital_services_research_assignments%rowtype;
begin
  select * into a from public.digital_services_research_assignments where id = p_id for update;
  if a.id is null then return 'not_found'; end if;
  if a.state not in ('started', 'paused') then return 'not_allowed'; end if;
  if jsonb_typeof(coalesce(p_progress, '{}'::jsonb)) <> 'object' then
    raise exception 'progress must be an object' using errcode = 'OC403';
  end if;
  update public.digital_services_research_assignments set progress = coalesce(p_progress, '{}'::jsonb) where id = p_id;
  insert into public.digital_services_research_events (assignment_id, kind, detail, actor)
    values (p_id, 'checkpoint', jsonb_build_object('progress', coalesce(p_progress, '{}'::jsonb), 'note', left(p_note, 500)), left(btrim(p_by), 120));
  return 'done';
end;
$$;

-- Stage one return. p_report is the adapter's review of p_raw_text against
-- this assignment's request, schema and exclusions (and earlier staged rows).
-- The database checks the report names this assignment's request and pinned
-- exclusions, refuses a candidate that could be sent, and keeps everything.
create or replace function public.research_stage_return(p_id uuid, p_raw_text text, p_report jsonb, p_by text)
returns table (return_id uuid, version integer, outcome text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  a public.digital_services_research_assignments%rowtype;
  sha text := encode(sha256(convert_to(p_raw_text, 'UTF8')), 'hex');
  prior public.digital_services_research_returns%rowtype;
  v integer;
  rid uuid;
  ok boolean;
  errs text[];
  c jsonb;
  n_staged integer := 0;
begin
  select * into a from public.digital_services_research_assignments where id = p_id for update;
  if a.id is null then raise exception 'no such assignment' using errcode = 'OC403'; end if;
  if a.state = 'closed' then raise exception 'this assignment is closed: no more returns' using errcode = 'OC409'; end if;
  if a.state = 'draft' then raise exception 'start the assignment before staging a return' using errcode = 'OC409'; end if;
  select * into prior from public.digital_services_research_returns where assignment_id = a.id and raw_sha256 = sha;
  if prior.id is not null then
    insert into public.digital_services_research_events (assignment_id, kind, detail, actor)
      values (a.id, 'return_repeated', jsonb_build_object('version', prior.version, 'raw_sha256', sha), left(btrim(p_by), 120));
    return query select prior.id, prior.version, 'already_staged'::text;
    return;
  end if;
  if p_report is null or jsonb_typeof(p_report) <> 'object' then
    raise exception 'a review report is required' using errcode = 'OC403';
  end if;
  errs := coalesce(array(select jsonb_array_elements_text(coalesce(p_report -> 'contract_errors', '[]'::jsonb))), '{}');
  if (p_report ->> 'request_id') is distinct from a.request_id then
    errs := errs || 'the report is for another request'::text;
  end if;
  if (p_report #>> '{exclusions,sha256}') is distinct from a.exclusions_sha256 then
    errs := errs || 'the report was not made with this assignment''s exclusions'::text;
  end if;
  ok := cardinality(errs) = 0;
  select coalesce(max(r.version), 0) + 1 into v from public.digital_services_research_returns r where r.assignment_id = a.id;
  insert into public.digital_services_research_returns (assignment_id, version, raw_text, raw_sha256, contract_ok, contract_errors, report, counts, staged_by)
    values (a.id, v, p_raw_text, sha, ok, errs, p_report, coalesce(p_report -> 'counts', '{}'::jsonb), left(btrim(p_by), 120))
    returning id into rid;
  if ok then
    for c in select * from jsonb_array_elements(coalesce(p_report -> 'candidates', '[]'::jsonb)) loop
      if coalesce((c ->> 'sendable')::boolean, false) or coalesce(c ->> 'contact_basis_status', 'not_established') <> 'not_established' then
        raise exception 'a staged candidate can never be sendable' using errcode = 'OC409';
      end if;
      insert into public.digital_services_research_candidates
        (assignment_id, return_id, request_id, candidate_key, version, business, locality, domain, outcome, reasons, holds, review)
        values (a.id, rid, a.request_id, c ->> 'candidate_key', v, coalesce(c ->> 'business', ''), c ->> 'locality', c #>> '{identity,domain}',
                c ->> 'outcome',
                coalesce(array(select jsonb_array_elements_text(coalesce(c -> 'row_errors', '[]'::jsonb) || coalesce(c -> 'eligibility', '[]'::jsonb))), '{}'),
                coalesce(array(select jsonb_array_elements_text(coalesce(c -> 'holds', '[]'::jsonb))), '{}'),
                c);
      n_staged := n_staged + 1;
    end loop;
    -- The new version supersedes every older row of this request.
    update public.digital_services_research_candidates set superseded_by_version = v
      where assignment_id = a.id and version < v and superseded_by_version is null;
    update public.digital_services_research_assignments set state = 'returned' where id = a.id and state in ('started', 'paused');
  end if;
  insert into public.digital_services_research_events (assignment_id, kind, detail, actor)
    values (a.id, case when ok then 'return_staged' else 'return_failed' end,
            jsonb_build_object('version', v, 'raw_sha256', sha, 'staged', n_staged, 'contract_errors', to_jsonb(errs)), left(btrim(p_by), 120));
  return query select rid, v, case when ok then 'staged' else 'contract_failed' end;
end;
$$;

create or replace function public.research_decide(p_candidate uuid, p_decision text, p_pilot_company text, p_note text, p_by text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.digital_services_research_candidates%rowtype;
begin
  select * into c from public.digital_services_research_candidates where id = p_candidate;
  if c.id is null then return 'not_found'; end if;
  if c.superseded_by_version is not null then return 'superseded'; end if;
  if p_decision not in ('hold', 'reject', 'accept') then
    raise exception 'unknown decision' using errcode = 'OC403';
  end if;
  if p_decision = 'accept' then
    if c.outcome <> 'proposed_for_owner_review' then return 'not_allowed'; end if;
    if p_pilot_company is null or not exists (select 1 from public.digital_services_pilot where id = p_pilot_company) then
      return 'no_such_company';
    end if;
  end if;
  insert into public.digital_services_research_decisions (candidate_id, decision, pilot_company_id, note, decided_by)
    values (c.id, p_decision, case when p_decision = 'accept' then p_pilot_company end, left(p_note, 1000), left(btrim(p_by), 120));
  insert into public.digital_services_research_events (assignment_id, kind, detail, actor)
    values (c.assignment_id, 'decision', jsonb_build_object('candidate_key', c.candidate_key, 'version', c.version, 'decision', p_decision, 'pilot_company_id', p_pilot_company), left(btrim(p_by), 120));
  return 'done';
end;
$$;

alter table public.digital_services_research_assignments enable row level security;
alter table public.digital_services_research_events enable row level security;
alter table public.digital_services_research_returns enable row level security;
alter table public.digital_services_research_candidates enable row level security;
alter table public.digital_services_research_decisions enable row level security;
drop policy if exists "Service role reads research assignments" on public.digital_services_research_assignments;
create policy "Service role reads research assignments" on public.digital_services_research_assignments for select to service_role using (true);
drop policy if exists "Service role reads research events" on public.digital_services_research_events;
create policy "Service role reads research events" on public.digital_services_research_events for select to service_role using (true);
drop policy if exists "Service role reads research returns" on public.digital_services_research_returns;
create policy "Service role reads research returns" on public.digital_services_research_returns for select to service_role using (true);
drop policy if exists "Service role reads research candidates" on public.digital_services_research_candidates;
create policy "Service role reads research candidates" on public.digital_services_research_candidates for select to service_role using (true);
drop policy if exists "Service role reads research decisions" on public.digital_services_research_decisions;
create policy "Service role reads research decisions" on public.digital_services_research_decisions for select to service_role using (true);
revoke all on public.digital_services_research_assignments, public.digital_services_research_events, public.digital_services_research_returns,
  public.digital_services_research_candidates, public.digital_services_research_decisions from anon, authenticated, service_role;
grant select on public.digital_services_research_assignments, public.digital_services_research_events, public.digital_services_research_returns,
  public.digital_services_research_candidates, public.digital_services_research_decisions to service_role;
revoke execute on function public.research_assignment_create(text, text, text, integer, text, text, text, text),
  public.research_assignment_control(uuid, text, text), public.research_checkpoint(uuid, jsonb, text, text),
  public.research_stage_return(uuid, text, jsonb, text), public.research_decide(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.research_assignment_create(text, text, text, integer, text, text, text, text),
  public.research_assignment_control(uuid, text, text), public.research_checkpoint(uuid, jsonb, text, text),
  public.research_stage_return(uuid, text, jsonb, text), public.research_decide(uuid, text, text, text, text) to service_role;
