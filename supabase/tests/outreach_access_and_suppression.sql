-- Run with psql after all migrations against a disposable/local database.
-- Every fixture and mutation is rolled back.
\set ON_ERROR_STOP on

begin;

-- ---------- Deterministic fixtures ----------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'outreach-test-admin@example.invalid', '', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'outreach-test-operator@example.invalid', '', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'outreach-test-second@example.invalid', '', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.user_profiles (user_id, display_name, email_verified_at, is_admin)
values
  ('91000000-0000-0000-0000-000000000001', 'Test admin', now(), true),
  ('91000000-0000-0000-0000-000000000002', 'Test operator', now(), false),
  ('91000000-0000-0000-0000-000000000003', 'Second operator', now(), false)
on conflict (user_id) do update set
  display_name = excluded.display_name,
  email_verified_at = excluded.email_verified_at,
  is_admin = excluded.is_admin;

insert into public.categories (
  id, slug, label, pillar, country_code, sort_order, active, of_relevant
)
select
  '91100000-0000-0000-0000-000000000001',
  'fencing-contractor', 'Fencing contractor', 'services', 'AU', 1, true, true
where not exists (
  select 1 from public.categories
   where country_code = 'AU' and slug = 'fencing-contractor'
);

insert into public.businesses (
  id, trading_name, slug, data_source, source_url, status, claim_status
) values
  ('92000000-0000-0000-0000-000000000001', 'Test Fence One',
   'zz-outreach-test-one', 'scraped', 'https://one.example.invalid', 'active', 'unclaimed'),
  ('92000000-0000-0000-0000-000000000002', 'Test Fence Two',
   'zz-outreach-test-two', 'scraped', 'https://two.example.invalid', 'active', 'unclaimed'),
  ('92000000-0000-0000-0000-000000000003', 'Test Fence Three',
   'zz-outreach-test-three', 'scraped', 'https://three.example.invalid', 'active', 'unclaimed');

insert into public.listings (
  id, kind, category_id, user_id, slug, title, description, postcode,
  source_platform, source_url, source_external_id, data_source,
  vertical, side, freshness_status, metadata, expires_at
)
select
  fixture.id,
  'service_offering',
  c.id,
  null,
  fixture.slug,
  fixture.title,
  'Integration-test fencing contractor.',
  '2800',
  'integration_test',
  fixture.source_url,
  fixture.external_id,
  'scraped',
  'service',
  'supply',
  'fresh',
  jsonb_build_object('suburb', 'Orange'),
  now() + interval '30 days'
from (
  values
    ('93000000-0000-0000-0000-000000000001'::uuid, 'zz-outreach-listing-one',
     'Test Fence One', 'https://one.example.invalid', 'outreach-test-one'),
    ('93000000-0000-0000-0000-000000000002'::uuid, 'zz-outreach-listing-two',
     'Test Fence Two', 'https://two.example.invalid', 'outreach-test-two'),
    ('93000000-0000-0000-0000-000000000003'::uuid, 'zz-outreach-listing-three',
     'Test Fence Three', 'https://three.example.invalid', 'outreach-test-three')
) as fixture(id, slug, title, source_url, external_id)
cross join lateral (
  select id from public.categories
   where country_code = 'AU' and slug = 'fencing-contractor'
   limit 1
) c;

update public.listings set business_id = case id
  when '93000000-0000-0000-0000-000000000001' then '92000000-0000-0000-0000-000000000001'::uuid
  when '93000000-0000-0000-0000-000000000002' then '92000000-0000-0000-0000-000000000002'::uuid
  when '93000000-0000-0000-0000-000000000003' then '92000000-0000-0000-0000-000000000003'::uuid
end
where id in (
  '93000000-0000-0000-0000-000000000001',
  '93000000-0000-0000-0000-000000000002',
  '93000000-0000-0000-0000-000000000003'
);

insert into public.listing_sources (
  id, listing_id, source_platform, source_url, source_external_id, raw_payload
) values
  ('94000000-0000-0000-0000-000000000001',
   '93000000-0000-0000-0000-000000000001', 'integration_test',
   'https://directory.example.invalid/one', 'outreach-source-one',
   jsonb_build_object(
     'type', 'Fencing contractor', 'email', 'one@example.invalid',
     'phone', '0400000001',
     'contact_source_url', 'https://directory.example.invalid/one',
     'verification_source_url', 'https://one.example.invalid/contact',
     'verified_at', '2026-08-14'
   )),
  ('94000000-0000-0000-0000-000000000002',
   '93000000-0000-0000-0000-000000000002', 'integration_test',
   'https://two.example.invalid', 'outreach-source-two',
   jsonb_build_object(
     'type', 'Fencing contractor', 'email', 'two@example.invalid',
     'phone', '0400000002',
     'contact_source_url', 'https://two.example.invalid/contact',
     'verification_source_url', 'https://two.example.invalid/contact',
     'verified_at', '2026-08-14'
   )),
  ('94000000-0000-0000-0000-000000000003',
   '93000000-0000-0000-0000-000000000003', 'integration_test',
   'https://three.example.invalid', 'outreach-source-three',
   jsonb_build_object(
     'type', 'Fencing contractor', 'email', 'three@example.invalid',
     'phone', '0400000003',
     'contact_source_url', 'https://three.example.invalid/contact',
     'verification_source_url', 'https://three.example.invalid/contact',
     'verified_at', '2026-08-14'
   ));

-- service_role compatibility uses Supabase's signed JWT role claim; it does
-- not depend on deprecated auth.role().
select set_config(
  'request.jwt.claims',
  jsonb_build_object('role', 'service_role')::text,
  true
);
set local role service_role;

do $test$
begin
  if not public.current_user_is_admin() or not public.current_user_can_outreach() then
    raise exception 'service_role compatibility was not preserved';
  end if;
end
$test$;

reset role;

-- ---------- Unauthorised caller fails closed ----------
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '91000000-0000-0000-0000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $test$
begin
  if public.current_user_can_outreach() then
    raise exception 'operator unexpectedly has outreach access before grant';
  end if;
  if (select count(*) from public.admin_contractor_outreach) <> 0 then
    raise exception 'unauthorised operator can read queue rows';
  end if;
  begin
    perform public.record_contractor_outreach_outcome(
      '92000000-0000-0000-0000-000000000001',
      '95000000-0000-0000-0000-000000000001',
      'note', null, 'must fail', null, null, false
    );
    raise exception 'unauthorised outcome unexpectedly succeeded';
  exception when sqlstate '42501' then
    null;
  end;
end
$test$;

reset role;

-- ---------- Full admin grants two narrow operators ----------
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '91000000-0000-0000-0000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select public.admin_set_outreach_staff('OUTREACH-TEST-OPERATOR@example.invalid', true);
select public.admin_set_outreach_staff('outreach-test-second@example.invalid', true);

do $test$
begin
  if (select count(*) from public.admin_list_outreach_staff() where is_active) <> 2 then
    raise exception 'admin staff roster does not show both grants';
  end if;
  begin
    perform public.admin_set_outreach_staff('outreach-test-admin@example.invalid', false);
    raise exception 'full admin was managed through narrow outreach role';
  exception when sqlstate '42501' then
    null;
  end;
end
$test$;

reset role;

-- ---------- Operator projection, grants and first contact ----------
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '91000000-0000-0000-0000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $test$
declare
  r jsonb;
begin
  if not public.current_user_can_outreach() then
    raise exception 'active operator lacks outreach permission';
  end if;
  if (select count(*) from public.admin_contractor_outreach
       where business_id between '92000000-0000-0000-0000-000000000001'::uuid
                             and '92000000-0000-0000-0000-000000000003'::uuid) <> 3 then
    raise exception 'operator cannot read all contractor fixtures';
  end if;
  if not exists (
    select 1 from public.admin_contractor_outreach
     where business_id = '92000000-0000-0000-0000-000000000001'
       and contact_email = 'one@example.invalid'
       and contact_source_url = 'https://directory.example.invalid/one'
       and verification_source_url = 'https://one.example.invalid/contact'
       and contact_verified_at = '2026-08-14'
       and queue_priority = 30
       and queue_sort_at is not null
  ) then
    raise exception 'private contact provenance or deterministic queue fields missing';
  end if;
  begin
    perform count(*) from public.listing_sources;
    raise exception 'operator unexpectedly read listing_sources';
  exception when insufficient_privilege then
    null;
  end;

  -- Omitting assignee must still atomically claim the unassigned record.
  r := public.record_contractor_outreach_outcome(
    '92000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000010',
    'invite_sent', 'email', 'First invite sent.', now() + interval '2 days', null, false
  );
  if r ->> 'outreach_status' <> 'invite_sent'
     or r ->> 'assigned_user_id' <> '91000000-0000-0000-0000-000000000002'
     or r ->> 'last_contact_method' <> 'email'
     or (r ->> 'last_contacted_at') is null then
    raise exception 'atomic invite/auto-assignment state is wrong: %', r;
  end if;

  r := public.record_contractor_outreach_outcome(
    '92000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000010',
    'invite_sent', 'email', 'First invite sent.',
    (select next_follow_up_at from public.business_outreach
      where business_id = '92000000-0000-0000-0000-000000000001'),
    null, false
  );
  if coalesce((r ->> 'idempotent_replay')::boolean, false) is not true then
    raise exception 'same action id did not replay';
  end if;

  begin
    perform public.record_contractor_outreach_outcome(
      '92000000-0000-0000-0000-000000000001',
      '95000000-0000-0000-0000-000000000010',
      'note', null, 'different payload', null, null, false
    );
    raise exception 'action id accepted a different payload';
  exception when unique_violation then
    null;
  end;
end
$test$;

reset role;

-- The replay above reconstructs the exact timestamp from stored state. Assert
-- that only one event exists without exposing client_action_id to operators.
do $test$
begin
  if (select count(*) from public.business_outreach_events
       where client_action_id = '95000000-0000-0000-0000-000000000010') <> 1 then
    raise exception 'idempotent retry created duplicate events';
  end if;
  if has_table_privilege('authenticated', 'public.listing_sources', 'select') then
    raise exception 'authenticated retains direct listing_sources SELECT';
  end if;
  if has_table_privilege('authenticated', 'public.business_outreach_events', 'select') then
    raise exception 'authenticated retains broad event table SELECT';
  end if;
  if has_column_privilege(
    'authenticated', 'public.business_outreach_events', 'client_action_id', 'select'
  ) or has_column_privilege(
    'authenticated', 'public.business_outreach_events', 'request_fingerprint', 'select'
  ) or has_column_privilege(
    'authenticated', 'public.business_outreach_events', 'result_snapshot', 'select'
  ) then
    raise exception 'authenticated can read internal idempotency fields';
  end if;
  if not has_column_privilege(
    'authenticated', 'public.business_outreach_events', 'outcome', 'select'
  ) then
    raise exception 'authenticated event history projection is missing outcome';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.record_contractor_outreach(uuid,text,text,text,text,timestamptz,text)',
    'execute'
  ) then
    raise exception 'authenticated can still execute legacy outreach writer';
  end if;
  if has_table_privilege('authenticated', 'public.outreach_staff', 'select') then
    raise exception 'authenticated can read the private outreach_staff table';
  end if;
  if has_function_privilege(
    'anon', 'public.current_user_can_outreach()', 'execute'
  ) or has_function_privilege(
    'anon',
    'public.record_contractor_outreach_outcome(uuid,uuid,text,text,text,timestamptz,uuid,boolean)',
    'execute'
  ) then
    raise exception 'anon can execute an outreach permission/write function';
  end if;
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and p.proname in (
         'current_user_is_admin', 'current_user_can_outreach',
         'admin_list_outreach_staff', 'admin_set_outreach_staff',
         'is_contractor_outreach_business', 'outreach_list_assignable_staff',
         'outreach_listing_source', 'record_contractor_outreach_outcome',
         'admin_contractor_outreach_counts'
       )
       and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, array[]::text[])) config
          where config like 'search_path=%'
       )
  ) then
    raise exception 'a new SECURITY DEFINER function lacks search_path=';
  end if;
end
$test$;

-- ---------- Partial suppression blocks only its channel ----------
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '91000000-0000-0000-0000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $test$
declare
  r jsonb;
begin
  r := public.record_contractor_outreach_outcome(
    '92000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000011',
    'email_bounced', 'email', 'Mailbox rejected.', null, null, false
  );
  if (r ->> 'is_suppressed')::boolean
     or not (r -> 'suppressed_channels' ? 'email') then
    raise exception 'email-only suppression incorrectly became all-channel: %', r;
  end if;
  begin
    perform public.record_contractor_outreach_outcome(
      '92000000-0000-0000-0000-000000000001',
      '95000000-0000-0000-0000-000000000012',
      'emailed', 'email', 'must fail', now() + interval '2 days', null, false
    );
    raise exception 'email suppression did not block email';
  exception when sqlstate '55000' then
    null;
  end;

  r := public.record_contractor_outreach_outcome(
    '92000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000013',
    'called', 'phone', 'Phone still usable.', null, null, false
  );
  if r ->> 'last_contact_method' <> 'phone' then
    raise exception 'email suppression incorrectly blocked phone';
  end if;
end
$test$;

reset role;

do $test$
begin
  if not exists (
    select 1 from public.admin_contractor_outreach
     where business_id = '92000000-0000-0000-0000-000000000001'
       and is_suppressed = false
       and email_suppressed = true
       and phone_suppressed = false
  ) then
    raise exception 'view channel suppression booleans are wrong';
  end if;
end
$test$;

-- A valid long event note must not roll back the safety block. Preserve the
-- complete audit note and bound only the suppression reason column.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '91000000-0000-0000-0000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $test$
declare
  r jsonb;
begin
  r := public.record_contractor_outreach_outcome(
    '92000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000014',
    'do_not_contact', null, repeat('x', 1200), null, null, false
  );
  if not (r ->> 'is_suppressed')::boolean
     or not (r -> 'suppressed_channels' ? 'all') then
    raise exception 'long-note DNC did not create all-channel suppression';
  end if;
end
$test$;

reset role;

do $test$
begin
  if (select char_length(note) from public.business_outreach_events
       where client_action_id = '95000000-0000-0000-0000-000000000014') <> 1200 then
    raise exception 'full long note was not preserved on the audit event';
  end if;
  if (select char_length(reason) from public.business_outreach_suppressions
       where business_id = '92000000-0000-0000-0000-000000000001'
         and channel = 'all') <> 1000 then
    raise exception 'suppression reason was not safely bounded';
  end if;
end
$test$;

-- ---------- Sequence close requires prior contact and only reply reopens ----------
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '91000000-0000-0000-0000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $test$
declare
  r jsonb;
begin
  begin
    perform public.record_contractor_outreach_outcome(
      '92000000-0000-0000-0000-000000000002',
      '95000000-0000-0000-0000-000000000020',
      'sequence_complete', 'email', 'premature close', null, null, true
    );
    raise exception 'sequence completed before prior contact';
  exception when sqlstate '55000' then
    null;
  end;

  perform public.record_contractor_outreach_outcome(
    '92000000-0000-0000-0000-000000000002',
    '95000000-0000-0000-0000-000000000021',
    'emailed', 'email', 'Follow-up sent.', now() + interval '2 days', null, false
  );
  r := public.record_contractor_outreach_outcome(
    '92000000-0000-0000-0000-000000000002',
    '95000000-0000-0000-0000-000000000022',
    'sequence_complete', 'email', 'Final email sent.', null, null, true
  );
  if r ->> 'outreach_status' <> 'sequence_complete'
     or r ->> 'last_contact_method' <> 'email'
     or (r ->> 'next_follow_up_at') is not null then
    raise exception 'sequence_complete state is wrong: %', r;
  end if;

  begin
    perform public.record_contractor_outreach_outcome(
      '92000000-0000-0000-0000-000000000002',
      '95000000-0000-0000-0000-000000000023',
      'sequence_complete', 'email', 'duplicate close', null, null, true
    );
    raise exception 'fresh close-out repeated on completed sequence';
  exception when sqlstate '55000' then
    null;
  end;

  r := public.record_contractor_outreach_outcome(
    '92000000-0000-0000-0000-000000000002',
    '95000000-0000-0000-0000-000000000024',
    'replied', null, 'Inbound reply.', null, null, false
  );
  if r ->> 'outreach_status' <> 'contacted'
     or r ->> 'last_contact_method' <> 'email' then
    raise exception 'reply did not reopen or preserve prior method: %', r;
  end if;
end
$test$;

reset role;

-- ---------- Ownership isolation and revocation release ----------
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '91000000-0000-0000-0000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select public.record_contractor_outreach_outcome(
  '92000000-0000-0000-0000-000000000003',
  '95000000-0000-0000-0000-000000000030',
  'assigned', null, 'Assigned by admin.', null,
  '91000000-0000-0000-0000-000000000003', false
);

reset role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '91000000-0000-0000-0000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $test$
begin
  begin
    perform public.record_contractor_outreach_outcome(
      '92000000-0000-0000-0000-000000000003',
      '95000000-0000-0000-0000-000000000031',
      'note', null, 'must not cross assignment', null, null, false
    );
    raise exception 'operator edited another operator assignment';
  exception when sqlstate '42501' then
    null;
  end;
end
$test$;

reset role;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '91000000-0000-0000-0000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select public.admin_set_outreach_staff('outreach-test-second@example.invalid', false);

reset role;

do $test$
begin
  if exists (
    select 1 from public.business_outreach
     where business_id = '92000000-0000-0000-0000-000000000003'
       and assigned_user_id is not null
  ) then
    raise exception 'revoked operator left a stranded assignment';
  end if;
  if not exists (
    select 1 from public.business_outreach_events
     where business_id = '92000000-0000-0000-0000-000000000003'
       and outcome = 'unassigned'
       and note = 'Automatically unassigned because outreach access was revoked.'
  ) then
    raise exception 'revocation release lacks an audit event';
  end if;
end
$test$;

-- ---------- Claim state is authoritative and manual joined is impossible ----------
update public.businesses
   set claim_status = 'claimed',
       claimed_by = '91000000-0000-0000-0000-000000000003',
       claimed_at = now()
 where id = '92000000-0000-0000-0000-000000000003';

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '91000000-0000-0000-0000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $test$
begin
  begin
    perform public.record_contractor_outreach_outcome(
      '92000000-0000-0000-0000-000000000003',
      '95000000-0000-0000-0000-000000000032',
      'contacted', null, 'must fail joined guard', null, null, false
    );
    raise exception 'operator changed a claimed/joined record';
  exception when sqlstate '55000' then
    null;
  end;
  begin
    perform public.record_contractor_outreach_outcome(
      '92000000-0000-0000-0000-000000000003',
      '95000000-0000-0000-0000-000000000033',
      'joined', null, 'manual join', null, null, false
    );
    raise exception 'manual joined outcome unexpectedly exists';
  exception when sqlstate '22023' then
    null;
  end;
end
$test$;

reset role;

do $test$
begin
  if not exists (
    select 1 from public.admin_contractor_outreach
     where business_id = '92000000-0000-0000-0000-000000000003'
       and outreach_status = 'joined'
       and queue_priority = 90
  ) then
    raise exception 'claim-authoritative joined projection is wrong';
  end if;
end
$test$;

rollback;

\echo 'outreach access and suppression checks passed'
