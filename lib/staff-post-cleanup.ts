// lib/staff-post-cleanup.ts
// One bounded, resumable run of the staff-post clean-up (see
// /api/cron/adopt-staff-posts). The privacy repair comes first:
//   1. sweep: closed staff posts that still hold phone/email get them archived
//      privately (listing_sources, platform staff_post) and cleared;
//   2. enquiries: quote requests still on an adopted (closed) original move
//      to the row it was re-filed as;
//   3. adoption: a small batch of active staff posts is re-filed as unclaimed
//      entries (or held), each original archived and closed.
// Every step is idempotent and conditional, so an interrupted run, a retry or
// two overlapping runs neither duplicate records nor lose contacts or
// enquiries:
//   * contact is cleared only after its archive is confirmed (or already there);
//   * ingest is keyed by source (re-ingesting returns the same row), and a
//     business already in the directory is linked to, or held if it has an owner;
//   * enquiries move before the original closes, and step 2 repairs any left behind;
//   * closes and clears only apply to rows still in the state this run read;
//     a row another run got to first is "already done", never an error or a success.
// A run stops starting new work once its time budget is spent and reports
// what it did and whether more remains. A failed write is never counted as
// done. Receipts are aggregate: no phone or email values. Pure (the store and
// clock are injected), so it is unit-tested with simulated latency.
import { closedOriginalSourceUrl, planStaffPost, type Plan, type StaffPostRow } from "./staff-post-adoption";
import type { DirectoryImportRecord } from "./directory-records";

export type ContactRow = Pick<StaffPostRow, "id" | "title" | "postcode" | "state" | "contact_phone" | "contact_email" | "user_id"> & {
  source_url: string | null;
};
export type ActiveRow = StaffPostRow & { source_url: string | null; metadata: Record<string, unknown> };
export type AdoptedOriginal = { id: string; canonical_listing_id: string };

export type Existing = { owned: string } | { unclaimed: { listing_id: string; business_id: string | null; source_external_id: string | null } } | null;

/** A write's outcome: done, already done (by an earlier or overlapping run), or failed. */
export type Write = { ok: true; changed: boolean } | { ok: false; error: string };

export interface CleanupStore {
  staffIds(): Promise<string[]>;
  closedWithContact(staffIds: string[], limit: number): Promise<ContactRow[]>;
  adoptedOriginals(staffIds: string[], limit: number): Promise<AdoptedOriginal[]>;
  enquiryCounts(listingIds: string[]): Promise<Map<string, number>>;
  activeCandidates(staffIds: string[], limit: number): Promise<ActiveRow[]>;
  /** Insert the private archive row; changed:false when it is already there. */
  archiveContact(row: ContactRow, now: string): Promise<Write>;
  /** Clear phone/email on a closed row that still has them (sets source_url). */
  clearClosedContact(row: ContactRow): Promise<Write>;
  /**
   * The same business (name + postcode) already in the directory: owned
   * (claimed, or listed by its genuine owner), an unclaimed entry to link to
   * instead of creating a second one, or nothing.
   */
  findExisting(record: DirectoryImportRecord, staffIds: string[]): Promise<Existing>;
  ingest(record: DirectoryImportRecord): Promise<{ ok: true; listing_id: string; business_id: string | null } | { ok: false; error: string; claimed?: boolean }>;
  labelCopy(listingId: string, urlKind: string): Promise<Write>;
  businessOf(listingId: string): Promise<string | null>;
  moveEnquiries(fromListing: string, toListing: string, businessId: string | null): Promise<{ ok: true; moved: number } | { ok: false; error: string }>;
  /** Close an original that is still active and unlinked. */
  closeAdopted(row: ActiveRow, intoId: string, sourceUrl: string, now: string): Promise<Write>;
  closeHeld(row: ActiveRow, reasons: string[], now: string): Promise<Write>;
  remaining(staffIds: string[]): Promise<{ active: number; closedWithContact: number; enquiriesOnClosed: number } | null>;
}

export type CleanupLimits = { budgetMs: number; sweepBatch: number; adoptBatch: number; enquiryBatch: number };
export const DEFAULT_LIMITS: CleanupLimits = { budgetMs: 40_000, sweepBatch: 25, adoptBatch: 10, enquiryBatch: 100 };

export type CleanupReceipt = {
  ok: boolean;
  dry: boolean;
  stopped_by_budget: boolean;
  elapsed_ms: number;
  swept: { checked: number; cleared: number; already: number };
  enquiries: { originals_checked: number; moved: number };
  adoption: { candidates: number; processed: number; adopted: number; held: number; already: number };
  errors: { id: string; title: string; step: string; message: string }[];
  held: { title: string; reasons: string[] }[];
  adopted_titles: string[];
  remaining: { active: number; closed_with_contact: number; enquiries_on_closed: number } | null;
  more_work: boolean;
  plan?: { adopt: { title: string; found_on: string; state: string | null; links_existing_entry: boolean }[]; hold: { title: string; reasons: string[] }[]; closed_rows_to_clear_contact: number };
};

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

export async function runCleanup(
  store: CleanupStore,
  opts: { dry: boolean; now: () => number; limits?: Partial<CleanupLimits> }
): Promise<CleanupReceipt> {
  const limits = { ...DEFAULT_LIMITS, ...opts.limits };
  const started = opts.now();
  const nowIso = () => new Date(opts.now()).toISOString();
  // Don't start an item that wouldn't finish inside the budget: reserve the
  // longest item seen so far (an adoption is several round trips).
  let longest = 0;
  const outOfTime = () => opts.now() - started + longest >= limits.budgetMs;
  const timed = async <T>(f: () => Promise<T>): Promise<T> => {
    const t0 = opts.now();
    try {
      return await f();
    } finally {
      longest = Math.max(longest, opts.now() - t0);
    }
  };
  const receipt: CleanupReceipt = {
    ok: true,
    dry: opts.dry,
    stopped_by_budget: false,
    elapsed_ms: 0,
    swept: { checked: 0, cleared: 0, already: 0 },
    enquiries: { originals_checked: 0, moved: 0 },
    adoption: { candidates: 0, processed: 0, adopted: 0, held: 0, already: 0 },
    errors: [],
    held: [],
    adopted_titles: [],
    remaining: null,
    more_work: false,
  };
  const fail = (row: { id: string; title?: string }, step: string, message: string) =>
    receipt.errors.push({ id: row.id, title: row.title ?? "", step, message: message.slice(0, 300) });

  const staffIds = await store.staffIds();
  if (staffIds.length === 0) return finish();

  // Dry run: read and plan only. No archive, no clear, no ingest, no email.
  if (opts.dry) {
    const [closed, active] = await Promise.all([store.closedWithContact(staffIds, limits.sweepBatch), store.activeCandidates(staffIds, limits.adoptBatch)]);
    // The same decisions as the real run, including the existing-business lookup (a read).
    const plan: { row: ActiveRow; p: Plan; existing: Existing }[] = [];
    for (const row of active) {
      const p = planStaffPost(row);
      plan.push({ row, p, existing: p.verdict === "adopt" ? await store.findExisting(p.record, staffIds) : null });
    }
    receipt.adoption.candidates = plan.length;
    receipt.plan = {
      adopt: plan.flatMap(({ row, p, existing }) =>
        p.verdict === "adopt" && !(existing && "owned" in existing)
          ? [{ title: row.title, found_on: p.record.source_platform, state: p.record.state, links_existing_entry: !!existing && existing.unclaimed.source_external_id !== p.record.source_external_id }]
          : []
      ),
      hold: plan.flatMap(({ row, p, existing }) =>
        p.verdict === "hold" ? [{ title: row.title, reasons: p.reasons }] : existing && "owned" in existing ? [{ title: row.title, reasons: [existing.owned] }] : []
      ),
      closed_rows_to_clear_contact: closed.length,
    };
    return finish();
  }

  // 1. Privacy sweep of closed rows first: the quickest, most important repair.
  for (const row of await store.closedWithContact(staffIds, limits.sweepBatch)) {
    if (outOfTime()) {
      receipt.stopped_by_budget = true;
      break;
    }
    receipt.swept.checked++;
    await timed(async () => {
      const archived = await store.archiveContact(row, nowIso());
      if (!archived.ok) {
        fail(row, "archive", `contact not archived, so not cleared: ${archived.error}`);
        return;
      }
      const cleared = await store.clearClosedContact(row);
      if (!cleared.ok) fail(row, "clear", `archived, but contact not cleared: ${cleared.error}`);
      else if (cleared.changed) receipt.swept.cleared++;
      else receipt.swept.already++;
    }).catch((e) => fail(row, "sweep", msg(e)));
  }

  // 2. Quote requests still on adopted originals (a run interrupted after closing).
  if (!outOfTime()) {
    try {
      const originals = await store.adoptedOriginals(staffIds, limits.enquiryBatch);
      receipt.enquiries.originals_checked = originals.length;
      const counts = originals.length ? await store.enquiryCounts(originals.map((o) => o.id)) : new Map<string, number>();
      for (const o of originals.filter((x) => (counts.get(x.id) ?? 0) > 0)) {
        if (outOfTime()) {
          receipt.stopped_by_budget = true;
          break;
        }
        const moved = await timed(async () => store.moveEnquiries(o.id, o.canonical_listing_id, await store.businessOf(o.canonical_listing_id)));
        if (moved.ok) receipt.enquiries.moved += moved.moved;
        else fail({ id: o.id }, "enquiries", `quote requests not moved: ${moved.error}`);
      }
    } catch (e) {
      fail({ id: "-" }, "enquiries", msg(e));
    }
  } else receipt.stopped_by_budget = true;

  // 3. A small adoption batch.
  if (outOfTime()) receipt.stopped_by_budget = true;
  const active = receipt.stopped_by_budget ? [] : await store.activeCandidates(staffIds, limits.adoptBatch);
  receipt.adoption.candidates = active.length;
  for (const row of active) {
    if (outOfTime()) {
      receipt.stopped_by_budget = true;
      break;
    }
    receipt.adoption.processed++;
    await timed(() => adoptOne(row, planStaffPost(row))).catch((e) => fail(row, "adopt", msg(e)));
  }
  return finish();

  async function adoptOne(row: ActiveRow, plan: Plan) {
    const contact: ContactRow = row;
    if (plan.verdict === "hold") return hold(plan.reasons);
    // A business with an owner keeps its own listing: never add an unclaimed copy beside it.
    const existing = await store.findExisting(plan.record, staffIds);
    if (existing && "owned" in existing) return hold([existing.owned]);
    // An entry from another source is linked to; our own earlier copy (same
    // source id, e.g. from an interrupted run) goes through the idempotent ingest.
    const link = existing && existing.unclaimed.source_external_id !== plan.record.source_external_id ? existing.unclaimed : null;
    const ing = link ? ({ ok: true, ...link } as const) : await store.ingest(plan.record);
    if (!ing.ok) {
      // A business someone has claimed keeps its own listing: hold this post for a person.
      if (ing.claimed) return hold(["the business has been claimed by its owner"]);
      return fail(row, "ingest", `not re-filed: ${ing.error}`);
    }
    // Label only a row this clean-up filed; an existing entry keeps its own attribution.
    const label: Write = link ? { ok: true, changed: false } : await store.labelCopy(ing.listing_id, plan.urlKind);
    const archived = await store.archiveContact(contact, nowIso());
    if (!archived.ok) return fail(row, "archive", `re-filed, but contact not archived, so the original stays open: ${archived.error}`);
    // Enquiries move before the original closes, so an interruption can't strand them.
    const moved = await store.moveEnquiries(row.id, ing.listing_id, ing.business_id);
    if (!moved.ok) return fail(row, "enquiries", `re-filed, but quote requests not moved, so the original stays open: ${moved.error}`);
    receipt.enquiries.moved += moved.moved;
    const closed = await store.closeAdopted(row, ing.listing_id, plan.record.source_url, nowIso());
    if (!closed.ok) return fail(row, "close", `re-filed, but the original not closed: ${closed.error}`);
    if (!closed.changed) {
      receipt.adoption.already++;
      return;
    }
    if (!label.ok) fail(row, "label", `adopted, but source label not saved: ${label.error}`);
    receipt.adoption.adopted++;
    receipt.adopted_titles.push(row.title);

    async function hold(reasons: string[]) {
      const archived = await store.archiveContact(contact, nowIso());
      if (!archived.ok) return fail(row, "archive", `held, but contact not archived, so the post stays open: ${archived.error}`);
      const closed = await store.closeHeld(row, reasons, nowIso());
      if (!closed.ok) return fail(row, "close", `held, but not closed: ${closed.error}`);
      if (!closed.changed) {
        receipt.adoption.already++;
        return;
      }
      receipt.adoption.held++;
      receipt.held.push({ title: row.title, reasons });
    }
  }

  async function finish(): Promise<CleanupReceipt> {
    if (staffIds?.length) {
      try {
        const r = await store.remaining(staffIds);
        receipt.remaining = r && { active: r.active, closed_with_contact: r.closedWithContact, enquiries_on_closed: r.enquiriesOnClosed };
      } catch {
        receipt.remaining = null;
      }
    }
    // Unknown remaining work counts as more work.
    receipt.more_work =
      receipt.stopped_by_budget || !receipt.remaining || receipt.remaining.active > 0 || receipt.remaining.closed_with_contact > 0 || receipt.remaining.enquiries_on_closed > 0;
    receipt.ok = receipt.errors.length === 0;
    receipt.elapsed_ms = opts.now() - started;
    return receipt;
  }
}

/** The team email for a real run (never for a dry run). Titles only; no phone or email values. */
export function receiptEmail(r: CleanupReceipt, baseUrl: string): { subject: string; text: string } | null {
  const did = r.swept.cleared + r.adoption.adopted + r.adoption.held + r.enquiries.moved + r.errors.length;
  if (r.dry || did === 0) return null;
  const rem = r.remaining;
  const text = [
    `Directory clean-up: ${r.adoption.adopted} published as unclaimed entries, ${r.adoption.held} held for a look, ${r.swept.cleared} closed posts cleared of phone/email (kept privately), ${r.enquiries.moved} quote requests moved, ${r.errors.length} errors.`,
    rem
      ? `Still to do: ${rem.active} active staff posts, ${rem.closed_with_contact} closed posts with phone/email, ${rem.enquiries_on_closed} quote requests on closed originals.${r.more_work ? " The next run continues." : ""}`
      : "Couldn't count what's left; the next run continues.",
    r.stopped_by_budget ? "This run stopped at its time limit and reported what it had done." : "",
    "",
    `These were added through the public "post a listing" form instead of ${baseUrl}/dashboard/directory/add.`,
    "",
    ...(r.held.length
      ? [
          `Held (closed, not deleted). To list one, add it at ${baseUrl}/dashboard/directory/add; its phone/email were moved to a private source record (listing_sources, platform staff_post) an admin can look up.`,
          ...r.held.map((h) => `- ${h.title}: ${h.reasons.join(", ")}`),
          "",
        ]
      : []),
    ...(r.errors.length ? ["Errors (nothing marked done that wasn't):", ...r.errors.map((e) => `- ${e.title || e.id} [${e.step}]: ${e.message}`), ""] : []),
    ...(r.adopted_titles.length ? ["Published:", ...r.adopted_titles.map((t) => `- ${t}`)] : []),
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
  return { subject: `Directory clean-up: ${r.adoption.adopted} published, ${r.adoption.held} held, ${r.swept.cleared} cleared`, text };
}
