-- ============================================================
-- Outback Connections — New Tables
-- Run this manually in Supabase SQL Editor
-- ============================================================

-- 1. Freight Listings
-- ------------------------------------------------------------
create table if not exists freight_listings (
  id            bigint generated always as identity primary key,
  title         text not null,
  origin        text,
  destination   text,
  description   text not null,
  weight        text,
  vehicle_type  text,
  budget        text,
  contact_email text,
  contact_phone text,
  status        text not null default 'open',
  user_id       text,
  created_at    timestamptz not null default now()
);

-- Index for listing queries
create index if not exists idx_freight_status_created
  on freight_listings (status, created_at desc);

-- RLS
alter table freight_listings enable row level security;

-- Anyone can read open freight listings
create policy "Public can read open freight listings"
  on freight_listings for select
  using (status = 'open');

-- Authenticated users can insert
create policy "Auth users can insert freight listings"
  on freight_listings for insert
  to authenticated
  with check (true);

-- Service role can manage all
create policy "Service role full access on freight_listings"
  on freight_listings for all
  to service_role
  using (true)
  with check (true);


-- 2. Messages
-- ------------------------------------------------------------
create table if not exists messages (
  id            bigint generated always as identity primary key,
  from_user_id  text not null,
  to_user_id    text not null,
  subject       text,
  body          text not null,
  read          boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Indexes for inbox/outbox queries
create index if not exists idx_messages_to_user
  on messages (to_user_id, created_at desc);

create index if not exists idx_messages_from_user
  on messages (from_user_id, created_at desc);

-- RLS
alter table messages enable row level security;

-- Service role can manage all messages
create policy "Service role full access on messages"
  on messages for all
  to service_role
  using (true)
  with check (true);
