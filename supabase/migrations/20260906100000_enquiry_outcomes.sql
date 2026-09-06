-- ============================================================
-- Enquiry outcomes: the honest reputation signal
-- ============================================================
-- A week after an enquiry is forwarded, the farmer is asked once, by email,
-- whether the business got back to them (signed one-click links). The answer
-- is stored on the enquiry. Listings then show "Responded to N of M quote
-- requests". No free-text reviews: nothing defamatory can be published, and
-- the number is grounded in real requests we forwarded ourselves.
--
-- business_response_stats() is deliberately callable by anon: it returns
-- three aggregate counts for one listing/business and nothing else.
--
-- Rollback: drop function public.business_response_stats(uuid);
--           alter table public.listing_enquiries drop column followup_sent_at,
--             drop column outcome, drop column outcome_at;
-- ============================================================

alter table public.listing_enquiries
  add column if not exists followup_sent_at timestamptz,
  add column if not exists outcome text
    check (outcome in ('responded', 'no_response', 'done_elsewhere')),
  add column if not exists outcome_at timestamptz;

create index if not exists idx_listing_enquiries_followup_due
  on public.listing_enquiries (created_at)
  where status = 'forwarded' and followup_sent_at is null and outcome is null;

create or replace function public.business_response_stats(p_listing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  with l as (
    select id, business_id from public.listings where id = p_listing_id
  ),
  q as (
    select e.outcome
      from public.listing_enquiries e, l
     where e.status = 'forwarded'
       and e.created_at > now() - interval '12 months'
       and (
         case when l.business_id is not null
              then e.business_id = l.business_id
              else e.listing_id = l.id
         end
       )
  )
  select jsonb_build_object(
    'forwarded', (select count(*) from q),
    'answered',  (select count(*) from q where outcome is not null),
    'responded', (select count(*) from q where outcome = 'responded')
  );
$fn$;

comment on function public.business_response_stats(uuid) is
  'Aggregate only (three counts) for one listing''s business. Intentionally anon-callable; feeds "Responded to N of M quote requests".';

revoke all on function public.business_response_stats(uuid) from public;
grant execute on function public.business_response_stats(uuid) to anon, authenticated, service_role;
