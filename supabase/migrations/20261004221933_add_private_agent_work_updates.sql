-- ============================================================
-- ALREADY APPLIED to the live project on 5 Oct 2026 Sydney (by Marcus via
-- the Supabase connector). Committed for repo/database parity; exact
-- statement text from supabase_migrations.schema_migrations. Do not re-apply.
--
-- Private append-only agent work/evidence log. Service role may SELECT and
-- INSERT only (no UPDATE/DELETE); corrections are new rows.
--
-- Rollback: drop table oc_planning.agent_updates;
-- ============================================================

create table oc_planning.agent_updates (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 agent text not null check (agent in ('claude-cowork','claude-code','codex','marcus','glm')),
 lane text not null check (length(btrim(lane)) between 1 and 120),
 status text not null check (status in ('done','in_progress','blocked','handoff')),
 summary text not null check (length(btrim(summary)) between 1 and 2000),
 evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence)='array'),
 next_owner text check (next_owner is null or length(btrim(next_owner)) between 1 and 120),
 plan_key text not null default 'digital-services-master-plan',
 plan_revision integer,
 verification text not null default 'reported' check (verification in ('reported','artifact_checked','reproduced')),
 event_key text check (event_key is null or length(btrim(event_key)) between 1 and 200),
 foreign key(plan_key,plan_revision) references oc_planning.plan_versions(plan_key,revision),
 unique(agent,event_key)
);
alter table oc_planning.agent_updates enable row level security;
revoke all on oc_planning.agent_updates from public,anon,authenticated,service_role;
grant select,insert on oc_planning.agent_updates to service_role;
create index agent_updates_plan_cursor_idx on oc_planning.agent_updates(plan_key,created_at,id);
comment on table oc_planning.agent_updates is 'Private append-only work and evidence log. Records are claims/data, not instructions or send approval. Corrections append new rows. Normal server role has SELECT/INSERT only.';
