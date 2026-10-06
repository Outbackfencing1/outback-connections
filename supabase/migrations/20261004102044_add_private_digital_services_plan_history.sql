-- ============================================================
-- ALREADY APPLIED to the live project on 4 Oct 2026 (by Marcus via the
-- Supabase connector). Committed on 5 Oct for repo/database parity; the SQL
-- below is the exact statement text recorded in
-- supabase_migrations.schema_migrations. Do not re-apply.
--
-- Private digital-services planning store: append-only plan versions and
-- daily model-review jobs. Service role only; no anon/authenticated access.
-- Not a CRM, queue or outreach store.
--
-- Rollback (destroys the planning history; export first):
--   drop schema oc_planning cascade;
-- ============================================================

create schema oc_planning;
revoke all on schema oc_planning from public, anon, authenticated;
grant usage on schema oc_planning to service_role;

create table oc_planning.plan_versions (
  plan_key text not null,
  revision integer not null check (revision > 0),
  parent_revision integer,
  filename text not null,
  markdown text not null check (length(markdown) > 0),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  author text not null,
  change_reason text not null,
  created_at timestamptz not null default now(),
  primary key (plan_key, revision),
  foreign key (plan_key, parent_revision) references oc_planning.plan_versions (plan_key, revision),
  check ((revision = 1 and parent_revision is null) or (revision > 1 and parent_revision = revision - 1))
);
alter table oc_planning.plan_versions enable row level security;
revoke all on oc_planning.plan_versions from public, anon, authenticated, service_role;
grant select, insert on oc_planning.plan_versions to service_role;

create table oc_planning.plan_review_jobs (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null,
  plan_revision integer not null,
  review_date date not null,
  reviewer text not null check (reviewer in ('glm', 'claude', 'marcus')),
  status text not null check (status in ('pending', 'running', 'completed', 'blocked', 'failed', 'missed', 'superseded')),
  scheduled_for timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  blocker text,
  actual_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (plan_key, plan_revision) references oc_planning.plan_versions (plan_key, revision),
  unique (plan_key, review_date, reviewer),
  check (status <> 'completed' or (finished_at is not null and result is not null and actual_model is not null)),
  check (status <> 'blocked' or blocker is not null)
);
alter table oc_planning.plan_review_jobs enable row level security;
revoke all on oc_planning.plan_review_jobs from public, anon, authenticated, service_role;
grant select, insert, update on oc_planning.plan_review_jobs to service_role;

comment on schema oc_planning is 'Private Outback Connections digital-services planning. No marketplace or outreach activation.';
comment on table oc_planning.plan_versions is 'Append-only Markdown plan versions; newest revision is authoritative. Only authorised server or administrative connections.';
comment on table oc_planning.plan_review_jobs is 'Daily model reviews bound to an exact plan revision. Queued or blocked is not proof of model execution.';
