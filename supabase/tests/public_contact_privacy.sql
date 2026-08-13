-- Run with psql after all migrations against a disposable/local database.
-- This checks the privilege boundary directly; RLS alone cannot hide columns.
\set ON_ERROR_STOP on

do $$
declare
  denied text[] := array[
    'public.listings.contact_email',
    'public.listings.contact_phone',
    'public.listings.contact_best_time',
    'public.businesses.contact_email',
    'public.businesses.contact_phone',
    'public.contractors.contact_email',
    'public.contractors.contact_phone',
    'public.profiles.user_email',
    'public.reviews_public.reviewer_email',
    'public.reviews_public.reviewer_phone',
    'public.listing_sources.raw_payload'
  ];
  allowed text[] := array[
    'public.listings.title',
    'public.listings.status',
    'public.listings.expires_at',
    'public.businesses.claim_status',
    'public.businesses.geo_lat',
    'public.contractors.business_name',
    'public.profiles.handle',
    'public.reviews_public.body'
  ];
  qualified_column text;
  relation_name text;
  column_name text;
begin
  foreach qualified_column in array denied loop
    relation_name := split_part(qualified_column, '.', 1) || '.' ||
                     split_part(qualified_column, '.', 2);
    column_name := split_part(qualified_column, '.', 3);
    if has_column_privilege('anon', relation_name, column_name, 'select') then
      raise exception 'anon unexpectedly has SELECT on %', qualified_column;
    end if;
  end loop;

  foreach qualified_column in array allowed loop
    relation_name := split_part(qualified_column, '.', 1) || '.' ||
                     split_part(qualified_column, '.', 2);
    column_name := split_part(qualified_column, '.', 3);
    if not has_column_privilege('anon', relation_name, column_name, 'select') then
      raise exception 'anon public browse column is missing SELECT: %', qualified_column;
    end if;
  end loop;

  if not has_column_privilege(
    'authenticated', 'public.listings', 'contact_email', 'select'
  ) or not has_column_privilege(
    'authenticated', 'public.businesses', 'contact_phone', 'select'
  ) then
    raise exception 'authenticated contact access was not preserved';
  end if;

  if has_table_privilege('anon', 'public.listing_sources', 'select') then
    raise exception 'anon unexpectedly has table SELECT on listing_sources';
  end if;
end
$$;

-- Exercise the columns and joins used by the signed-out public routes. WHERE
-- false makes this data-independent while PostgreSQL still checks privileges.
begin;
set local role anon;

select
  l.anonymised_id, l.slug, l.kind, l.title, l.description, l.postcode,
  l.state, l.created_at, l.data_source, l.source_platform,
  c.slug, c.label, b.claim_status, jd.work_type, jd.pay_type, jd.pay_amount
from public.listings l
join public.categories c on c.id = l.category_id
left join public.businesses b on b.id = l.business_id
join public.job_details jd on jd.listing_id = l.id
where false;

select
  l.id, l.anonymised_id, l.slug, l.kind, l.title, l.description, l.postcode,
  l.state, l.created_at, l.expires_at, l.user_id, l.status, l.data_source,
  l.source_platform, l.source_url, l.business_id, l.metadata,
  b.claim_status, b.geo_lat, b.geo_lng
from public.listings l
left join public.businesses b on b.id = l.business_id
where false;

rollback;

\echo 'public contact privacy checks passed'
