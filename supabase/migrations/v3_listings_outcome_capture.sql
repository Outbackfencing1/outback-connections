-- Outcome capture: when an active listing closes, record why.
-- Public browse filters status='active' so closed listings auto-disappear.
alter table public.listings
  add column if not exists closed_at timestamptz,
  add column if not exists closed_reason text,
  add column if not exists closed_note text;

alter table public.listings
  drop constraint if exists listings_status_check;
alter table public.listings
  add constraint listings_status_check
  check (status in (
    'draft','active','hidden_flagged','expired',
    'deleted_by_user','deleted_by_admin','closed'
  ));

alter table public.listings
  drop constraint if exists listings_closed_reason_check;
alter table public.listings
  add constraint listings_closed_reason_check
  check (
    closed_reason is null
    or closed_reason in ('matched','no_takers','withdrawn','other')
  );

alter table public.listings
  drop constraint if exists listings_closed_consistency_check;
alter table public.listings
  add constraint listings_closed_consistency_check
  check (
    (closed_at is null and status <> 'closed')
    or (closed_at is not null and status = 'closed')
  );
