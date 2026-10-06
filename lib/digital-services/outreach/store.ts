// lib/digital-services/outreach/store.ts
// The OutreachStore over the owner-only pilot tables (service role, server only).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PilotApproval, PilotCompany, PilotDraft } from "../dispatch-guard";
import { PILOT_APPROVALS_TABLE, PILOT_DRAFTS_TABLE, PILOT_EVENTS_TABLE, PILOT_TABLE } from "../pilot";
import type { CompanyState, OutreachStore, StoredEvent, SyncRun } from "./dispatch";

export const SYNC_RUNS_TABLE = "digital_services_outreach_sync_runs";
const PAGE = 1000;

const EVENT_COLS = "company_id, kind, lane, draft_id, sender, recipient, rfc822_message_id, provider_thread_id, occurred_at";

export function supabaseOutreachStore(admin: SupabaseClient): OutreachStore {
  return {
    async load(companyId) {
      const [c, d, a, e, s] = await Promise.all([
        admin.from(PILOT_TABLE).select("id, lane, reserved_for, contact_address, contact_basis_confirmed_at, contact_basis_confirmed_for, evidence_revision").eq("id", companyId).maybeSingle(),
        admin.from(PILOT_DRAFTS_TABLE).select("id, company_id, revision, subject, body, sha256, evidence_revision").eq("company_id", companyId),
        admin.from(PILOT_APPROVALS_TABLE).select("draft_id, draft_sha256, kind, actor, approved_at, approver_user_id"),
        admin.from(PILOT_EVENTS_TABLE).select(EVENT_COLS).eq("company_id", companyId),
        admin.from("digital_services_settings").select("owner_user_id").maybeSingle(),
      ]);
      // Any read error is a refusal to proceed, never an empty (permissive) state.
      if (c.error || d.error || a.error || e.error || s.error) throw new Error("outreach store: read failed");
      if (!c.data) return null;
      const state: CompanyState = {
        company: c.data as PilotCompany,
        drafts: (d.data ?? []) as PilotDraft[],
        approvals: (a.data ?? []) as PilotApproval[],
        events: (e.data ?? []) as StoredEvent[],
        ownerUserId: (s.data as { owner_user_id?: string } | null)?.owner_user_id ?? null,
      };
      return state;
    },
    async insertEvent(ev) {
      const { error } = await admin.from(PILOT_EVENTS_TABLE).insert(ev);
      return { error: error ? { code: error.code, message: error.message } : null };
    },
    async contacted() {
      // Every page: a capped read would silently drop companies from reply sync.
      const rows: StoredEvent[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin.from(PILOT_EVENTS_TABLE).select(EVENT_COLS).eq("kind", "contacted").order("occurred_at").range(from, from + PAGE - 1);
        if (error) throw new Error("outreach store: read failed");
        rows.push(...((data ?? []) as StoredEvent[]));
        if ((data ?? []).length < PAGE) break;
      }
      const by = new Map<string, StoredEvent[]>();
      for (const ev of rows) by.set(ev.company_id, [...(by.get(ev.company_id) ?? []), ev]);
      return [...by].map(([company_id, events]) => ({ company_id, events }));
    },
    async lastSync() {
      const { data, error } = await admin.from(SYNC_RUNS_TABLE).select("status, finished_at").order("finished_at", { ascending: false }).limit(1).maybeSingle();
      // Unreadable is treated as no healthy run (dispatch holds).
      if (error) return null;
      return (data as SyncRun | null) ?? null;
    },
    async recordSync(run) {
      const { error } = await admin.from(SYNC_RUNS_TABLE).insert(run);
      return { error: error ? { code: error.code, message: error.message } : null };
    },
  };
}
