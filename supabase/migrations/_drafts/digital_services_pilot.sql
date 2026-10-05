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
-- A 'contacted' event is refused unless the company is in the email lane, its
-- reservation matches the lane, it isn't suppressed or already contacted, its
-- contact basis is confirmed, the draft is the company's latest revision with
-- all four approvals, and the sender is named and isn't help@. A unique index
-- allows one first contact per company, so two concurrent dispatches can't
-- both succeed. lib/digital-services/dispatch-guard.ts applies the same rules
-- in the server before any future dispatch.
--
-- Rollback: drop table if exists public.digital_services_pilot_events;
--           drop table if exists public.digital_services_pilot_approvals;
--           drop table if exists public.digital_services_pilot_drafts;
--           drop function if exists public.ds_pilot_draft_guard();
--           drop function if exists public.ds_pilot_contact_guard();
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
  approved_at   timestamptz not null default now(),
  note          text,
  foreign key (draft_id, draft_sha256) references public.digital_services_pilot_drafts (id, sha256),
  unique (draft_id, kind)
);

-- ---------------------------------------------------------------- events
create table if not exists public.digital_services_pilot_events (
  id                   uuid primary key default gen_random_uuid(),
  company_id           text not null references public.digital_services_pilot(id),
  kind                 text not null check (kind in ('contacted', 'replied', 'opted_out', 'suppressed', 'bounced')),
  lane                 text check (lane is null or lane in ('cowork', 'engine')),
  draft_id             uuid references public.digital_services_pilot_drafts(id),
  sender               text,
  provider_message_id  text,
  occurred_at          timestamptz not null default now(),
  recorded_by          text not null,
  note                 text
);
create unique index if not exists uq_ds_pilot_first_contact
  on public.digital_services_pilot_events (company_id) where kind = 'contacted';

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
  if new.kind <> 'contacted' then return new; end if;
  select * into c from public.digital_services_pilot where id = new.company_id for update;
  if c.lane <> 'email' then raise exception 'not an email-lane company' using errcode = 'OC403'; end if;
  if new.lane is null or (c.reserved_for is not null and c.reserved_for <> new.lane) then
    raise exception 'company is reserved for another lane' using errcode = 'OC403';
  end if;
  if exists (select 1 from public.digital_services_pilot_events e
             where e.company_id = new.company_id and e.kind in ('opted_out', 'suppressed', 'bounced', 'replied')) then
    raise exception 'company is suppressed or has replied' using errcode = 'OC403';
  end if;
  if c.contact_address is null or c.contact_basis_confirmed_at is null then
    raise exception 'contact basis not confirmed' using errcode = 'OC403';
  end if;
  select * into d from public.digital_services_pilot_drafts where id = new.draft_id;
  if d.id is null or d.company_id <> new.company_id
     or d.revision <> (select max(revision) from public.digital_services_pilot_drafts where company_id = new.company_id) then
    raise exception 'draft is not this company''s latest revision' using errcode = 'OC403';
  end if;
  select 4 - count(distinct kind) into missing from public.digital_services_pilot_approvals
    where draft_id = d.id and draft_sha256 = d.sha256;
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
