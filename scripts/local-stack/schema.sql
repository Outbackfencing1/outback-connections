-- LOCAL STACK ONLY: Supabase-like roles and the minimum marketplace table the
-- personas need (user_profiles.is_admin), then the two draft migrations are
-- applied by start.sh exactly as written.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login password 'local-only' noinherit;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
create extension if not exists pgcrypto;

create table public.user_profiles (
  user_id uuid primary key,
  is_admin boolean not null default false,
  is_staff boolean not null default false
);
alter table public.user_profiles enable row level security;
create policy "own profile" on public.user_profiles for select to authenticated
  using (user_id = (current_setting('request.jwt.claims', true)::json ->> 'sub')::uuid);
grant select on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;
insert into public.user_profiles (user_id, is_admin, is_staff) values
  ('11111111-1111-4111-8111-111111111111', false, false),  -- ordinary member
  ('22222222-2222-4222-8222-222222222222', true, true),    -- a different marketplace admin
  ('33333333-3333-4333-8333-333333333333', false, false);  -- Joshua (owner id only)
