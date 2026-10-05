-- ============================================================
-- DRAFT — NOT APPLIED. Apply only with Josh's approval, after the seller,
-- GST treatment and payment destination are confirmed (see
-- docs/digital-services/FIRST-CUSTOMER-KIT.md). Owner-only data.
--
-- digital_services_quotes: one row per written quote. Its status covers
-- draft/sent/accepted/withdrawn and deliberately has NO "paid" value:
-- payment is derived only from digital_services_payments, each row of which
-- carries genuine evidence (a bank-statement transaction reference or a
-- payment-provider id). The same evidence can't be recorded twice, so a
-- duplicate notification or double entry doesn't double-count.
-- digital_services_quote_balance (view): paid, outstanding, deposit received.
--
-- Amounts are integer cents, before applicable tax; gst_treatment stays
-- 'pending' until Josh confirms it, and a quote can't be sent while pending.
--
-- Rollback: drop view if exists public.digital_services_quote_balance;
--           drop table if exists public.digital_services_payments;
--           drop table if exists public.digital_services_quotes;
-- ============================================================

create table if not exists public.digital_services_quotes (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  customer_label   text not null check (char_length(customer_label) between 1 and 120),
  pilot_company_id text,            -- digital_services_pilot.id when the customer came from the pilot
  enquiry_id       uuid,            -- digital_services_enquiries.id when it came from the public page
  offer            text not null check (offer in ('website_1990', 'quote_form_490', 'care_149', 'one_page_790')),
  amount_cents     integer not null check (amount_cents > 0),
  deposit_cents    integer not null default 0 check (deposit_cents >= 0),
  gst_treatment    text not null default 'pending' check (gst_treatment in ('pending', 'exclusive', 'inclusive', 'not_registered')),
  terms_version    text not null,
  scope_summary    text not null check (char_length(scope_summary) between 1 and 2000),
  status           text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'withdrawn')),
  sent_at          timestamptz,
  accepted_at      timestamptz,
  check (deposit_cents <= amount_cents),
  check (status = 'draft' or status = 'withdrawn' or gst_treatment <> 'pending'),
  check (status <> 'accepted' or accepted_at is not null)
);

create table if not exists public.digital_services_payments (
  id               uuid primary key default gen_random_uuid(),
  quote_id         uuid not null references public.digital_services_quotes(id),
  amount_cents     integer not null check (amount_cents > 0),
  received_on      date not null,
  evidence_source  text not null check (evidence_source in ('bank_statement', 'provider_record')),
  evidence_ref     text not null check (char_length(btrim(evidence_ref)) between 3 and 200),
  recorded_by      text not null check (char_length(btrim(recorded_by)) between 1 and 120),
  recorded_at      timestamptz not null default now(),
  unique (evidence_source, evidence_ref)
);

create or replace view public.digital_services_quote_balance
with (security_invoker = true) as
select q.id as quote_id,
       q.customer_label,
       q.offer,
       q.status,
       q.amount_cents,
       q.deposit_cents,
       coalesce(sum(p.amount_cents), 0)::integer as paid_cents,
       (q.amount_cents - coalesce(sum(p.amount_cents), 0))::integer as outstanding_cents,
       coalesce(sum(p.amount_cents), 0) >= q.deposit_cents and q.deposit_cents > 0 as deposit_received
from public.digital_services_quotes q
left join public.digital_services_payments p on p.quote_id = q.id
group by q.id;

alter table public.digital_services_quotes enable row level security;
alter table public.digital_services_payments enable row level security;
drop policy if exists "Service role manages quotes" on public.digital_services_quotes;
create policy "Service role manages quotes" on public.digital_services_quotes for all to service_role using (true) with check (true);
drop policy if exists "Service role manages payments" on public.digital_services_payments;
create policy "Service role manages payments" on public.digital_services_payments for all to service_role using (true) with check (true);
revoke all on public.digital_services_quotes, public.digital_services_payments, public.digital_services_quote_balance from anon, authenticated;
grant select, insert, update on public.digital_services_quotes to service_role;
grant select, insert on public.digital_services_payments to service_role;  -- evidence is append-only
grant select on public.digital_services_quote_balance to service_role;
