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
-- Rollback: drop table if exists public.digital_services_pilot;
-- ============================================================

create table if not exists public.digital_services_pilot (
  id                   text primary key check (id ~ '^OC-[0-9]{3}$'),
  company              text not null check (char_length(company) between 1 and 120),
  lane                 text not null check (lane in ('email', 'walk-in', 'phone')),
  preview_token        text check (preview_token is null or preview_token ~ '^[0-9a-f]{20}$'),
  preview_check        text not null default 'not-checked'
                         check (preview_check in ('pass', 'pass-with-note', 'not-checked')),
  preview_note         text check (preview_note is null or char_length(preview_note) <= 300),
  reserved_for_cowork  boolean not null default false,
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
