-- ============================================================
-- DRAFT — NOT APPLIED. Apply only with Josh's approval, after the seller,
-- GST treatment and payment destination are confirmed (see
-- docs/digital-services/FIRST-CUSTOMER-KIT.md). Owner-only data.
--
-- digital_services_quotes: one row per written quote. Its status covers
-- draft/sent/accepted/withdrawn and deliberately has NO "paid" value:
-- payment is derived only from digital_services_payments, each row of which
-- carries genuine evidence (a bank-statement transaction reference or a
-- payment-provider id). The same evidence can't be recorded twice, even with
-- different spacing or letter case, so a duplicate notification or double
-- entry doesn't double-count.
-- digital_services_quote_balance (view): total due including any GST, paid,
-- outstanding, deposit due and whether it's received.
--
-- Amounts are integer cents as quoted. gst_treatment says how GST applies:
-- 'exclusive' adds 10% GST on top (to the total and the deposit), 'inclusive'
-- means the amount already includes it, 'not_registered' means none. It stays
-- 'pending' until Josh confirms it; a pending quote has no total due and
-- can't be sent.
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
  recorded_at      timestamptz not null default now()
);
-- One payment per piece of evidence, ignoring spacing and letter case.
create unique index if not exists uq_ds_payments_evidence
  on public.digital_services_payments (evidence_source, upper(regexp_replace(evidence_ref, '\s+', '', 'g')));

create or replace view public.digital_services_quote_balance
with (security_invoker = true) as
with t as (
  select q.*,
         case q.gst_treatment when 'pending' then null when 'exclusive' then 1.1 else 1.0 end as factor,
         (select coalesce(sum(p.amount_cents), 0) from public.digital_services_payments p where p.quote_id = q.id)::integer as paid_cents
  from public.digital_services_quotes q
)
select id as quote_id,
       customer_label,
       offer,
       status,
       gst_treatment,
       amount_cents,
       round(amount_cents * factor)::integer as total_due_cents,      -- null while GST is pending
       round(deposit_cents * factor)::integer as deposit_due_cents,
       paid_cents,
       (round(amount_cents * factor) - paid_cents)::integer as outstanding_cents,
       deposit_cents > 0 and factor is not null and paid_cents >= round(deposit_cents * factor) as deposit_received
from t;

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
