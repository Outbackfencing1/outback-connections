-- ============================================================
-- DRAFT — NOT APPLIED. Apply only with Josh's approval, alongside
-- digital_services_enquiries. On approval, copy to a timestamped file in
-- supabase/migrations/ and apply through the Supabase MCP/CLI, then load the
-- rows from the private record (oc_planning.agent_updates event_key
-- 'claude-code-pilot-readiness-private-copy-2026-10-05') with the service
-- role. Never commit the rows themselves: the repository is public.
--
-- digital_services_pilot: the owner's per-company pilot view (company, lane,
-- preview check, first-contact reservation). Prospect data is owner-only
-- (AGENTS.md): RLS on, no anon/authenticated access, service role only. The
-- owner dashboard reads it server-side after getOwnerAccess().
--
-- This is a status view, not a sending tracker: drafts, approvals and send
-- records stay in Cowork's approval workflow until the engine import exists.
--
-- Drafts, approvals and contact events (same file, same rules):
--   digital_services_pilot_drafts     one row per email revision; subject/body
--                                     are immutable and hashed (new revision
--                                     instead of an edit, history preserved)
--   digital_services_pilot_approvals  bound to (draft id, sha256), so an
--                                     approval never carries over to new copy
--   digital_services_pilot_events     contacted / replied / opted_out /
--                                     suppressed / bounced, at company level
-- A 'contacted' event is refused unless the company is in the email lane, it
-- is reserved for exactly the dispatching lane, it isn't suppressed or already
-- contacted, its contact basis is confirmed for its CURRENT address, the draft
-- is the company's latest revision with all four approvals, and the sender is
-- named and isn't help@. The message approval is Josh's: it can only be
-- recorded through approve_pilot_message(), which checks the caller's own
-- signed-in identity against digital_services_settings.owner_user_id; a
-- service-role (or any direct) insert of a message approval is refused. A unique index
-- allows one first contact per company, so two concurrent dispatches can't
-- both succeed.
-- Sending (lib/digital-services/outreach/): a dispatch first records a
-- 'send_attempt' carrying our own Message-ID, under the same rules, and only
-- then calls the provider. Its outcome is recorded against that attempt:
-- 'contacted' (with the provider's message/thread ids) or 'send_failed' (a
-- definite provider refusal). An attempt with no outcome is unresolved and
-- blocks any further attempt for that company until it's reconciled from the
-- mailbox; it's never retried blindly. Replies, opt-outs and bounces are
-- recorded once per provider message. lib/digital-services/dispatch-guard.ts applies the same rules
-- in the server before any future dispatch.
--
-- Rollback: drop table if exists public.digital_services_pilot_events;
--           drop table if exists public.digital_services_pilot_approvals;
--           drop table if exists public.digital_services_pilot_drafts;
--           drop function if exists public.ds_pilot_draft_guard();
--           drop function if exists public.ds_pilot_contact_guard();
--           drop function if exists public.approve_pilot_message(uuid, text);
--           drop function if exists public.ds_pilot_approval_guard();
--           drop table if exists public.digital_services_settings;
--           drop table if exists public.digital_services_pilot;
-- ============================================================

create table if not exists public.digital_services_pilot (
  id                   text primary key check (id ~ '^OC-[0-9]{3}$'),
  company              text not null check (char_length(company) between 1 and 120),
  lane                 text not null check (lane in ('email', 'walk-in', 'phone')),
  preview_token        text check (preview_token is null or preview_token ~ '^[0-9a-f]{20}$'),
  preview_check        text not null default 'not-checked'
                         check (preview_check in ('pass', 'pass-with-note', 'not-checked')),
  preview_note         text check (preview_note is null or char_length(preview_note) <= 300),
  reserved_for         text check (reserved_for is null or reserved_for in ('cowork', 'engine')),
  offer                text check (offer is null or offer in ('website_1990', 'quote_form_490', 'care_149', 'one_page_790')),
  contact_address      text check (contact_address is null or char_length(contact_address) <= 254),
  contact_basis        text check (contact_basis is null or char_length(contact_basis) <= 500),
  contact_basis_confirmed_at timestamptz,
  contact_basis_confirmed_by text,
  contact_basis_confirmed_for text,   -- the address the confirmation was for; a changed address is unconfirmed
  checked_at           date,
  updated_at           timestamptz not null default now()
);

comment on table public.digital_services_pilot is
  'Owner-only pilot view (prospect companies, lanes, reservations). Service role only; never committed to the public repo.';

alter table public.digital_services_pilot enable row level security;

drop policy if exists "Service role manages digital services pilot" on public.digital_services_pilot;
create policy "Service role manages digital services pilot"
  on public.digital_services_pilot for all to service_role
  using (true) with check (true);

revoke all on public.digital_services_pilot from anon, authenticated;
grant select, insert, update, delete on public.digital_services_pilot to service_role;

-- -------------------------------------------------------------- settings
-- One row: Josh's Supabase auth user id (the same value as the app's
-- DIGITAL_SERVICES_OWNER_USER_ID), set when this migration is applied.
create table if not exists public.digital_services_settings (
  id             boolean primary key default true check (id),
  owner_user_id  uuid not null
);
alter table public.digital_services_settings enable row level security;
revoke all on public.digital_services_settings from anon, authenticated;
grant select on public.digital_services_settings to service_role;

-- REQUIRED AT APPLY TIME (the owner id is not committed to this public repo).
-- In the same session, immediately before this file, run:
--   select set_config('app.ds_owner_user_id', '<DIGITAL_SERVICES_OWNER_USER_ID>', false);
-- Without it this insert fails (owner_user_id is NOT NULL) and the migration
-- stops here, rather than leaving every message approval impossible. Re-running
-- with a value updates the one row.
insert into public.digital_services_settings (owner_user_id)
values (nullif(current_setting('app.ds_owner_user_id', true), '')::uuid)
on conflict (id) do update set owner_user_id = excluded.owner_user_id;

-- ---------------------------------------------------------------- drafts
create table if not exists public.digital_services_pilot_drafts (
  id             uuid primary key default gen_random_uuid(),
  company_id     text not null references public.digital_services_pilot(id),
  revision       integer not null check (revision >= 1),
  subject        text not null check (char_length(subject) between 1 and 200),
  body           text not null check (char_length(body) between 1 and 5000),
  sha256         text not null,
  preview_token  text check (preview_token is null or preview_token ~ '^[0-9a-f]{20}$'),
  offer          text check (offer is null or offer in ('website_1990', 'quote_form_490', 'care_149', 'one_page_790')),
  author         text not null,
  change_reason  text,
  created_at     timestamptz not null default now(),
  unique (company_id, revision),
  unique (id, sha256)
);

-- The hash is always computed here (subject, blank line, body), never trusted
-- from the caller, and the copy can't be edited after insert.
create or replace function public.ds_pilot_draft_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (new.subject is distinct from old.subject or new.body is distinct from old.body
                           or new.company_id is distinct from old.company_id or new.revision is distinct from old.revision) then
    raise exception 'pilot drafts are immutable: add a new revision' using errcode = 'OC409';
  end if;
  new.sha256 := encode(sha256(convert_to(new.subject || E'\n\n' || new.body, 'UTF8')), 'hex');
  return new;
end;
$$;
drop trigger if exists trg_ds_pilot_draft_guard on public.digital_services_pilot_drafts;
create trigger trg_ds_pilot_draft_guard
  before insert or update on public.digital_services_pilot_drafts
  for each row execute function public.ds_pilot_draft_guard();

-- ------------------------------------------------------------- approvals
create table if not exists public.digital_services_pilot_approvals (
  id            uuid primary key default gen_random_uuid(),
  draft_id      uuid not null,
  draft_sha256  text not null,
  kind          text not null check (kind in ('evidence_refresh', 'preview_review', 'copy_review', 'message_approval')),
  actor         text not null check (char_length(btrim(actor)) between 1 and 120),
  approver_user_id uuid,          -- message_approval: Josh's auth user id, set by approve_pilot_message()
  approved_at   timestamptz not null default now(),
  note          text,
  foreign key (draft_id, draft_sha256) references public.digital_services_pilot_drafts (id, sha256),
  unique (draft_id, kind)
);

-- Josh's message approval: never a direct insert. Only approve_pilot_message()
-- (security definer, running as the function owner) may insert one, after
-- checking the caller's own JWT subject is the configured owner.
create or replace function public.ds_pilot_approval_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind = 'message_approval' and (current_user in ('service_role', 'authenticated', 'anon')
      or new.approver_user_id is distinct from (select owner_user_id from public.digital_services_settings)) then
    raise exception 'message approval must come from the owner via approve_pilot_message()' using errcode = 'OC403';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_ds_pilot_approval_guard on public.digital_services_pilot_approvals;
create trigger trg_ds_pilot_approval_guard
  before insert or update on public.digital_services_pilot_approvals
  for each row execute function public.ds_pilot_approval_guard();

create or replace function public.approve_pilot_message(p_draft_id uuid, p_draft_sha256 text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
  owner uuid := (select owner_user_id from public.digital_services_settings);
  reviews int;
  new_id uuid;
begin
  if caller is null or owner is null or caller <> owner then
    raise exception 'only the owner can approve a message' using errcode = 'OC403';
  end if;
  select count(distinct kind) into reviews from public.digital_services_pilot_approvals
    where draft_id = p_draft_id and draft_sha256 = p_draft_sha256
      and kind in ('evidence_refresh', 'preview_review', 'copy_review');
  if reviews < 3 then
    raise exception 'evidence, preview and copy reviews come first' using errcode = 'OC403';
  end if;
  -- Idempotent: a double click or a retry after a lost response returns the
  -- approval already recorded for this exact revision instead of failing.
  insert into public.digital_services_pilot_approvals (draft_id, draft_sha256, kind, actor, approver_user_id)
  values (p_draft_id, p_draft_sha256, 'message_approval', 'owner', caller)
  on conflict (draft_id, kind) do nothing
  returning id into new_id;
  if new_id is null then
    select id into new_id from public.digital_services_pilot_approvals
      where draft_id = p_draft_id and kind = 'message_approval'
        and draft_sha256 = p_draft_sha256 and approver_user_id = caller;
    if new_id is null then
      -- The revision already carries an approval by someone else (for example
      -- a previous owner). It doesn't count for the current owner, and this
      -- call must not look like success: re-approve on a new revision.
      raise exception 'this revision already has an approval by a different owner; add a new revision' using errcode = 'OC409';
    end if;
  end if;
  return new_id;
end;
$$;
revoke execute on function public.approve_pilot_message(uuid, text) from public, anon, service_role;
grant execute on function public.approve_pilot_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------- events
create table if not exists public.digital_services_pilot_events (
  id                   uuid primary key default gen_random_uuid(),
  company_id           text not null references public.digital_services_pilot(id),
  kind                 text not null check (kind in ('send_attempt', 'send_failed', 'contacted', 'replied', 'opted_out', 'suppressed', 'bounced')),
  lane                 text check (lane is null or lane in ('cowork', 'engine')),
  draft_id             uuid references public.digital_services_pilot_drafts(id),
  sender               text,
  provider_message_id  text,
  provider_thread_id   text,
  rfc822_message_id    text,  -- our own Message-ID, set on the send attempt before anything is sent
  occurred_at          timestamptz not null default now(),
  recorded_by          text not null,
  note                 text
);
create unique index if not exists uq_ds_pilot_first_contact
  on public.digital_services_pilot_events (company_id) where kind = 'contacted';
-- Columns added after the first draft (no-ops on a fresh apply).
alter table public.digital_services_pilot_events add column if not exists provider_thread_id text;
alter table public.digital_services_pilot_events add column if not exists rfc822_message_id text;
-- One attempt per draft revision, one outcome per attempt, and a provider
-- message is recorded once per kind, so reply sync can run repeatedly.
create unique index if not exists uq_ds_pilot_attempt_per_draft
  on public.digital_services_pilot_events (company_id, draft_id) where kind = 'send_attempt';
create unique index if not exists uq_ds_pilot_attempt_outcome
  on public.digital_services_pilot_events (rfc822_message_id) where kind in ('contacted', 'send_failed');
create unique index if not exists uq_ds_pilot_provider_message
  on public.digital_services_pilot_events (kind, provider_message_id) where provider_message_id is not null;

create or replace function public.ds_pilot_contact_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  c public.digital_services_pilot%rowtype;
  d public.digital_services_pilot_drafts%rowtype;
  missing int;
begin
  if new.kind not in ('send_attempt', 'send_failed', 'contacted') then return new; end if;
  select * into c from public.digital_services_pilot where id = new.company_id for update;
  -- The outcome of a recorded attempt is a fact about what the provider did:
  -- it must match that attempt, and isn't re-gated (a reply arriving after
  -- the send mustn't stop us recording that we sent).
  if new.kind = 'send_failed' or (new.kind = 'contacted' and new.rfc822_message_id is not null) then
    if not exists (select 1 from public.digital_services_pilot_events e
                   where e.company_id = new.company_id and e.kind = 'send_attempt'
                     and e.rfc822_message_id = new.rfc822_message_id
                     and e.draft_id is not distinct from new.draft_id) then
      raise exception 'no matching send attempt' using errcode = 'OC403';
    end if;
    return new;
  end if;
  -- A new attempt or a directly recorded contact passes every rule below.
  if exists (select 1 from public.digital_services_pilot_events e
             where e.company_id = new.company_id and e.kind = 'contacted') then
    raise exception 'company already contacted' using errcode = 'OC403';
  end if;
  if exists (select 1 from public.digital_services_pilot_events a
             where a.company_id = new.company_id and a.kind = 'send_attempt'
               and not exists (select 1 from public.digital_services_pilot_events o
                               where o.kind in ('contacted', 'send_failed') and o.rfc822_message_id = a.rfc822_message_id)) then
    raise exception 'an earlier send attempt is unresolved; reconcile it first' using errcode = 'OC409';
  end if;
  if new.kind = 'send_attempt' and (new.rfc822_message_id is null or new.rfc822_message_id !~ '^<[^<>@\s]+@[^<>@\s]+>$') then
    raise exception 'a send attempt needs its own Message-ID' using errcode = 'OC403';
  end if;
  if c.lane <> 'email' then raise exception 'not an email-lane company' using errcode = 'OC403'; end if;
  if new.lane is null or c.reserved_for is null or c.reserved_for <> new.lane then
    raise exception 'company is not reserved for this lane' using errcode = 'OC403';
  end if;
  if exists (select 1 from public.digital_services_pilot_events e
             where e.company_id = new.company_id and e.kind in ('opted_out', 'suppressed', 'bounced', 'replied')) then
    raise exception 'company is suppressed or has replied' using errcode = 'OC403';
  end if;
  if c.contact_address is null or c.contact_basis_confirmed_at is null
     or lower(btrim(coalesce(c.contact_basis_confirmed_for, ''))) <> lower(btrim(c.contact_address)) then
    raise exception 'contact basis not confirmed for the current address' using errcode = 'OC403';
  end if;
  select * into d from public.digital_services_pilot_drafts where id = new.draft_id;
  if d.id is null or d.company_id <> new.company_id
     or d.revision <> (select max(revision) from public.digital_services_pilot_drafts where company_id = new.company_id) then
    raise exception 'draft is not this company''s latest revision' using errcode = 'OC403';
  end if;
  select 4 - count(distinct a.kind) into missing from public.digital_services_pilot_approvals a
    where a.draft_id = d.id and a.draft_sha256 = d.sha256
      and (a.kind <> 'message_approval'
           or a.approver_user_id = (select owner_user_id from public.digital_services_settings));
  if missing > 0 then raise exception 'draft lacks % approval(s)', missing using errcode = 'OC403'; end if;
  if new.sender is null or new.sender ~* '^help@' then
    raise exception 'a named outreach sender is required (never help@)' using errcode = 'OC403';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_ds_pilot_contact_guard on public.digital_services_pilot_events;
create trigger trg_ds_pilot_contact_guard
  before insert on public.digital_services_pilot_events
  for each row execute function public.ds_pilot_contact_guard();

-- Owner-only, like the pilot table: service role only.
alter table public.digital_services_pilot_drafts enable row level security;
alter table public.digital_services_pilot_approvals enable row level security;
alter table public.digital_services_pilot_events enable row level security;
drop policy if exists "Service role manages pilot drafts" on public.digital_services_pilot_drafts;
create policy "Service role manages pilot drafts" on public.digital_services_pilot_drafts for all to service_role using (true) with check (true);
drop policy if exists "Service role manages pilot approvals" on public.digital_services_pilot_approvals;
create policy "Service role manages pilot approvals" on public.digital_services_pilot_approvals for all to service_role using (true) with check (true);
drop policy if exists "Service role manages pilot events" on public.digital_services_pilot_events;
create policy "Service role manages pilot events" on public.digital_services_pilot_events for all to service_role using (true) with check (true);
revoke all on public.digital_services_pilot_drafts, public.digital_services_pilot_approvals, public.digital_services_pilot_events from anon, authenticated;
grant select, insert on public.digital_services_pilot_drafts, public.digital_services_pilot_approvals, public.digital_services_pilot_events to service_role;
grant update (preview_token, offer, change_reason) on public.digital_services_pilot_drafts to service_role;
