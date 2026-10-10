// lib/weekly-digest.ts
// Pure formatter for the Monday digest email. The cron route gathers the
// numbers; this turns them into plain text a busy person reads in 30 seconds.
// Traffic numbers are verified people only (admin_gate_metrics, migration
// 20261010120000): bot check passed, page script ran, not our own team.

export type DigestWeek = {
  week_start: string;
  human_searches: number;
  human_sessions: number;
  listing_views: number;
  contact_reveals: number;
  source_clicks: number;
  enquiries: number;
  claims: number;
  first_party_posts: number;
  signups: number;
  directory_adds: number;
  // Optional: absent until migration 20261010120000 is applied.
  trade_cta_clicks?: number;
};

export type DigestSource = { source: string; medium: string; sessions: number };

export type DigestData = {
  generatedAt: string;
  gate: {
    target_searches_per_week: number;
    target_claims_30d: number;
    target_first_party_posts_30d: number;
    human_searches_7d: number;
    claims_30d: number;
    first_party_posts_30d: number;
    enquiries_30d: number;
    bot_share_30d_pct: number;
    unverified_searches_7d?: number;
    internal_searches_7d?: number;
    trade_cta_clicks_30d?: number;
    sources_30d?: DigestSource[];
  };
  /** First day verified counting ran (first human_ping), if any. */
  verifiedSince?: string | null;
  thisWeek: DigestWeek | null;
  lastWeek: DigestWeek | null;
  enquiries: {
    last7d: number;
    open: number;
    waitingOver48h: number;
    answered30d: number;
    responded30d: number;
  };
  directory: {
    active: number;
    unclaimed: number;
    claimed: number;
    expiring14d: number;
    pendingClaims: number;
  };
  gaps: Array<{ region_name: string | null; state: string | null; category: string | null; demand: number }>;
  baseUrl: string;
};

function delta(now: number, before: number): string {
  const d = now - before;
  if (d === 0) return "same as last week";
  return `${d > 0 ? "up" : "down"} ${Math.abs(d)} on last week`;
}

function gateLine(label: string, value: number, target: number): string {
  const mark = value >= target ? "OK " : "-- ";
  return `${mark}${label}: ${value} (target ${target})`;
}

export function formatWeeklyDigest(d: DigestData): { subject: string; text: string } {
  const tw = d.thisWeek;
  const lw = d.lastWeek;
  const gateOk =
    d.gate.human_searches_7d >= d.gate.target_searches_per_week &&
    d.gate.claims_30d >= d.gate.target_claims_30d &&
    d.gate.first_party_posts_30d >= d.gate.target_first_party_posts_30d;

  const lines: string[] = [];
  lines.push(`Outback Connections, week starting ${tw?.week_start ?? d.generatedAt.slice(0, 10)}`);
  lines.push(``);
  lines.push(`TRACTION GATE ${gateOk ? "(met)" : "(not yet)"}`);
  // The pre-10-Oct gate function has no unverified count: say which definition is live.
  if (d.gate.unverified_searches_7d !== undefined) {
    lines.push(`   Verified people only: bot check passed, page script ran, not our team.`);
    if (!d.verifiedSince) lines.push(`   Verified counting has not started yet (no page-script pings received).`);
  } else {
    lines.push(`   User-agent check only (migration 20261010120000 not applied): includes disguised bots and our team.`);
  }
  lines.push(gateLine("Human searches, last 7 days", d.gate.human_searches_7d, d.gate.target_searches_per_week));
  lines.push(gateLine("Claims, last 30 days", d.gate.claims_30d, d.gate.target_claims_30d));
  lines.push(gateLine("First-party posts, last 30 days", d.gate.first_party_posts_30d, d.gate.target_first_party_posts_30d));
  lines.push(`   Quote requests, last 30 days: ${d.gate.enquiries_30d}`);
  if (d.gate.unverified_searches_7d !== undefined || d.gate.internal_searches_7d !== undefined) {
    lines.push(
      `   Not counted, last 7 days: ${d.gate.unverified_searches_7d ?? 0} searches where the page script never ran, ${d.gate.internal_searches_7d ?? 0} from our own team`
    );
  }
  lines.push(`   Crawlers and out-of-date browsers: ${d.gate.bot_share_30d_pct}% of browse loads`);
  lines.push(``);

  if (tw) {
    lines.push(`LAST 7 DAYS${lw ? " (vs the week before)" : ""}`);
    const row = (label: string, k: keyof DigestWeek) => {
      const v = tw[k] as number;
      const before = lw?.[k] as number | undefined;
      lines.push(`   ${label}: ${v}${typeof before === "number" ? `, ${delta(v, before)}` : ""}`);
    };
    row("People (distinct daily visitors)", "human_sessions");
    row("Listing views", "listing_views");
    row("Quote requests", "enquiries");
    row("Contact reveals", "contact_reveals");
    row("Source clicks", "source_clicks");
    if (tw.trade_cta_clicks !== undefined) row("Trade pricing clicks", "trade_cta_clicks");
    row("Signups", "signups");
    row("Claims", "claims");
    row("Directory rows added", "directory_adds");
    lines.push(``);
  }

  const sources = d.gate.sources_30d ?? [];
  if (sources.length > 0) {
    lines.push(`WHERE PEOPLE CAME FROM (last 30 days, first page of each visit)`);
    for (const src of sources.slice(0, 5)) {
      lines.push(`   ${src.source} / ${src.medium}: ${src.sessions}`);
    }
    lines.push(``);
  }

  lines.push(`ENQUIRY QUEUE`);
  lines.push(`   Open: ${d.enquiries.open}${d.enquiries.waitingOver48h > 0 ? ` (${d.enquiries.waitingOver48h} waiting more than 48 hours: forward these today)` : ""}`);
  lines.push(`   Received last 7 days: ${d.enquiries.last7d}`);
  if (d.enquiries.answered30d > 0) {
    lines.push(`   Farmers who answered the follow-up, last 30 days: ${d.enquiries.answered30d}, of whom ${d.enquiries.responded30d} were called back`);
  }
  lines.push(`   ${d.baseUrl}/dashboard/admin/enquiries`);
  lines.push(``);

  lines.push(`DIRECTORY`);
  lines.push(`   Live listings: ${d.directory.active}. Businesses: ${d.directory.claimed} claimed, ${d.directory.unclaimed} unclaimed.`);
  if (d.directory.pendingClaims > 0) lines.push(`   Claims waiting for approval: ${d.directory.pendingClaims}  ${d.baseUrl}/dashboard/admin/claims`);
  if (d.directory.expiring14d > 0) lines.push(`   Directory rows expiring in the next 14 days: ${d.directory.expiring14d} (re-add or get them claimed)`);
  lines.push(``);

  if (d.gaps.length > 0) {
    lines.push(`ASKED FOR, NOBODY LISTED (last month)`);
    const clean = (v: string | null | undefined, max: number) =>
      (v ?? "").replace(/[^ -~]/g, "").slice(0, max);
    for (const g of d.gaps.slice(0, 10)) {
      const where = g.region_name ? `${clean(g.region_name, 40)}${g.state ? `, ${clean(g.state, 4)}` : ""}` : "unknown region";
      lines.push(`   ${clean(g.category, 40) || "any category"} near ${where}: ${g.demand}`);
    }
    lines.push(`   ${d.baseUrl}/dashboard/admin/demand`);
    lines.push(``);
  }

  lines.push(`Full numbers: ${d.baseUrl}/dashboard/admin/analytics`);
  lines.push(`Sent automatically every Monday morning.`);

  const subject = `Connections week: ${d.enquiries.last7d} quote request${d.enquiries.last7d === 1 ? "" : "s"}, ${tw?.human_sessions ?? 0} people, ${d.directory.pendingClaims} claim${d.directory.pendingClaims === 1 ? "" : "s"} waiting`;
  return { subject, text: lines.join("\n") };
}
