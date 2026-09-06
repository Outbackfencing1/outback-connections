-- ============================================================
-- Staff role: outreach + enquiries + directory + import + reports
-- ============================================================
-- Josh (6 Sep 2026): "make it so Ali can help manage and outreach". A staff
-- member needs the outreach workspace, the enquiry queue, directory add,
-- bulk import and the read-only reports. NOT lockdown, moderation,
-- flags, duplicate-account review, incidents, or claim approval: those keep
-- checking user_profiles.is_admin directly, in SQL and in the app.
--
-- Mechanics: user_profiles.is_staff + current_user_is_staff(). Every read
-- policy and function that used current_user_is_admin() is a staff-scope
-- surface (verified 6 Sep: businesses/listings/listing_enquiries/
-- business_outreach(+events) reads, the admin_contractor_outreach view, and
-- the two outreach RPCs), so they switch to the staff predicate. The view
-- and the RPCs are rewritten in place from their current definitions rather
-- than retyped; run this AFTER 20260814090000 and 20260906070000.
--
-- Rollback: recreate the policies with current_user_is_admin(); rerun the
-- DO block with the names swapped back; drop function current_user_is_staff();
-- alter table user_profiles drop column is_staff.
-- ============================================================

alter table public.user_profiles
  add column if not exists is_staff boolean not null default false;

comment on column public.user_profiles.is_staff is
  'Trusted staff: outreach workspace, enquiry queue, directory add, bulk import, reports. Not moderation/lockdown/claims. service_role sets it.';

create or replace function public.current_user_is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce(auth.role() = 'service_role', false)
    or exists (
      select 1
        from public.user_profiles p
       where p.user_id = auth.uid()
         and (p.is_admin = true or p.is_staff = true)
    );
$function$;

revoke all on function public.current_user_is_staff() from public, anon;
grant execute on function public.current_user_is_staff() to authenticated, service_role;

-- ---------- read policies: admin -> staff ----------
drop policy if exists "Admins read all businesses" on public.businesses;
drop policy if exists "Staff read all businesses" on public.businesses;
create policy "Staff read all businesses"
  on public.businesses for select to authenticated
  using (public.current_user_is_staff());

drop policy if exists "Admins read all listings" on public.listings;
drop policy if exists "Staff read all listings" on public.listings;
create policy "Staff read all listings"
  on public.listings for select to authenticated
  using (public.current_user_is_staff());

drop policy if exists "Admins read enquiries" on public.listing_enquiries;
drop policy if exists "Staff read enquiries" on public.listing_enquiries;
create policy "Staff read enquiries"
  on public.listing_enquiries for select to authenticated
  using (public.current_user_is_staff());

drop policy if exists "Admins read business outreach" on public.business_outreach;
drop policy if exists "Staff read business outreach" on public.business_outreach;
create policy "Staff read business outreach"
  on public.business_outreach for select to authenticated
  using (public.current_user_is_staff());

drop policy if exists "Admins read business outreach events" on public.business_outreach_events;
drop policy if exists "Staff read business outreach events" on public.business_outreach_events;
create policy "Staff read business outreach events"
  on public.business_outreach_events for select to authenticated
  using (public.current_user_is_staff());

-- The outreach view reads private raw_payload for the row's contact details.
drop policy if exists "Admins read listing_sources" on public.listing_sources;
drop policy if exists "Staff read listing_sources" on public.listing_sources;
create policy "Staff read listing_sources"
  on public.listing_sources for select to authenticated
  using (public.current_user_is_staff());

-- ---------- view + outreach RPCs: swap the predicate in place ----------
do $do$
declare
  v_def text;
  f record;
begin
  v_def := pg_get_viewdef('public.admin_contractor_outreach'::regclass, true);
  v_def := replace(v_def, 'public.current_user_is_admin()', 'public.current_user_is_staff()');
  v_def := replace(v_def, 'current_user_is_admin()', 'current_user_is_staff()');
  execute 'create or replace view public.admin_contractor_outreach with (security_invoker = true) as ' || v_def;

  for f in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('record_contractor_outreach', 'admin_contractor_outreach_counts')
  loop
    execute replace(
      replace(pg_get_functiondef(f.oid), 'public.current_user_is_admin()', 'public.current_user_is_staff()'),
      'current_user_is_admin()', 'current_user_is_staff()'
    );
  end loop;
end
$do$;

-- The view only ever needed SELECT.
revoke insert, update, delete, truncate, references, trigger on public.admin_contractor_outreach from authenticated;
