// lib/staff-post-cleanup.ts
// One bounded, resumable run of the staff-post clean-up behind
// /api/cron/adopt-staff-posts. The route wires a Supabase-backed store; the
// tests wire an in-memory one with latency, failures and interleaved runs.
//
// A run does the privacy work first and stops before its time budget:
//   1. sweep: closed staff posts still holding phone/email -> archive the
//      contact privately (listing_sources), then clear it from the listing.
//   2. recover: quote requests still on an adopted (closed) original -> move
//      them to the new row, so an interrupted run never strands them.
//   3. adopt: a small batch of active staff posts -> re-file as unclaimed
//      (ingest), archive contact, move quote requests, then close the
//      original with canonical_listing_id (its URL 301s). Rows the screen or
//      the record builder rejects are held: archived, closed, never deleted.
//
// Every step is safe to repeat. ingest_scraped_business() is keyed on the
// source key, the archive is keyed on staff_post:<listing id> (unique index),
// and closes/clears only update a row still in the state the run saw. So a
// retry after an interruption, or two overlapping runs, can't create a second
// business or listing, lose an archived contact or overwrite each other: the
// loser of a race finds the row already done and counts it as skipped.
// Contact is only ever cleared after the archive is confirmed. Nothing is
// deleted. A dry run calls read methods only and sends nothing.
import { closedOriginalSourceUrl, planStaffPost, type Plan, type StaffPostRow } from "./staff-post-adoption";
import type { DirectoryImportRecord } from "./directory-records";
import type { SourceUrlKind } from "./source-platforms";

export const SWEEP_BATCH = 25;
export const RECOVER_BATCH = 25;
export const ADOPT_BATCH = 10;
/** Work stops starting new rows after this; maxDuration is 60s. */
export const WORK_BUDGET_MS = 35_000;
/** Ceiling for any one store call; the outcome of a call past it is unknown. */
export const CALL_TIMEOUT_MS = 8_000;

export type ContactRow = Pick<StaffPostRow, "id" | "title" | "postcode" | "state" | "contact_phone" | "contact_email" | "user_id"> & {
  source_url: string | null;
};

export type CandidateRow = StaffPostRow & {
  source_url: string | null;
  metadata: Record<string, unknown>;
};

export type StrandedOriginal = { id: string; title: string; canonical_listing_id: string };

export type CleanupStore = {
  /** Staff and directory-contributor accounts that are not admins. */
  staffIds(): Promise<string[]>;
  closedWithContact(staffIds: string[], limit: number): Promise<ContactRow[]>;
  strandedOriginals(staffIds: string[], limit: number): Promise<StrandedOriginal[]>;
  /** Active, manual, unheld, not linked to a business, oldest first. */
  activeCandidates(staffIds: string[], limit: number): Promise<CandidateRow[]>;
  remaining(staffIds: string[]): Promise<{ closed_with_contact: number; active_candidates: number; stranded_originals: number }>;
  /** Idempotent: an existing archive for this listing counts as done. Throws on failure. */
  archiveContact(row: ContactRow, now: string): Promise<void>;
  /** Clears phone/email on a closed row that still has some. Returns false if nothing matched. */
  clearClosedContact(id: string, sourceUrl: string): Promise<boolean>;
  ingest(record: DirectoryImportRecord): Promise<{ listing_id: string; business_id: string | null }>;
  labelSource(listingId: string, urlKind: SourceUrlKind): Promise<void>;
  businessOf(listingId: string): Promise<string | null>;
  /** Moves quote requests from one listing to another; returns how many moved. */
  moveEnquiries(fromId: string, toId: string, businessId: string | null): Promise<number>;
  /** Closes a still-active original into the new row. Returns false if it was no longer active. */
  closeAdopted(row: CandidateRow, newId: string, sourceUrl: string, now: string): Promise<boolean>;
  /** Closes a still-active held row. Returns false if it was no longer active. */
  closeHeld(row: CandidateRow, reasons: string[], sourceUrl: string, now: string): Promise<boolean>;
};

export type Stage = "sweep" | "recover" | "adopt" | "hold" | "read";

export type CleanupError = { id: string | null; title: string | null; stage: Stage; message: string };

export type Receipt = {
  ok: boolean;
  dry: boolean;
  sweep: { seen: number; cleared: number; skipped: number };
  recover: { seen: number; originals_fixed: number; enquiries_moved: number };
  adopt: { seen: number; adopted: number; held: number; skipped: number };
  errors: CleanupError[];
  stopped_early: boolean;
  more_work: boolean;
  remaining: { closed_with_contact: number; active_candidates: number; stranded_originals: number } | null;
  elapsed_ms: number;
  /** Titles only (business names), for the team email. Never contact values. */
  adopted_titles: string[];
  held: { title: string; reasons: string[] }[];
  /** Dry run only: what the adopt step would do with this batch. */
  plan?: { adopt: { title: string; found_on: string; state: string | null }[]; hold: { title: string; reasons: string[] }[] };
};

export class CallTimeout extends Error {
  constructor() {
    super("timed out; outcome unknown, the next run re-checks it");
  }
}

/** Removes anything that looks like an email address or phone number. */
export function redact(message: string): string {
  return message
    .replace(/[^\s@"'(),;:<>]+@[^\s@"'(),;:<>]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]")
    .slice(0, 300);
}

function errMessage(e: unknown): string {
  return redact(e instanceof Error ? e.message : typeof e === "string" ? e : "unknown error");
}

type Clock = { now(): number };

export async function runCleanup(
  store: CleanupStore,
  opts: { dry: boolean; clock?: Clock; budgetMs?: number; callTimeoutMs?: number }
): Promise<Receipt> {
  const clock = opts.clock ?? { now: () => Date.now() };
  const started = clock.now();
  const budget = opts.budgetMs ?? WORK_BUDGET_MS;
  const callTimeout = opts.callTimeoutMs ?? CALL_TIMEOUT_MS;
  const outOfTime = () => clock.now() - started >= budget;

  // Each store call is bounded; a call that outlives it is reported as
  // unknown, and the idempotent steps let the next run settle it.
  const call = <T>(p: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new CallTimeout()), callTimeout);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        }
      );
    });

  const receipt: Receipt = {
    ok: true,
    dry: opts.dry,
    sweep: { seen: 0, cleared: 0, skipped: 0 },
    recover: { seen: 0, originals_fixed: 0, enquiries_moved: 0 },
    adopt: { seen: 0, adopted: 0, held: 0, skipped: 0 },
    errors: [],
    stopped_early: false,
    more_work: false,
    remaining: null,
    elapsed_ms: 0,
    adopted_titles: [],
    held: [],
  };
  const fail = (id: string | null, title: string | null, stage: Stage, e: unknown) =>
    receipt.errors.push({ id, title, stage, message: errMessage(e) });

  const finish = async (staffIds: string[] | null): Promise<Receipt> => {
    if (staffIds) {
      try {
        receipt.remaining = await call(store.remaining(staffIds));
      } catch (e) {
        fail(null, null, "read", e);
      }
    }
    const r = receipt.remaining;
    receipt.more_work =
      receipt.stopped_early || r === null || r.closed_with_contact > 0 || r.active_candidates > 0 || r.stranded_originals > 0;
    receipt.ok = receipt.errors.length === 0;
    receipt.elapsed_ms = clock.now() - started;
    return receipt;
  };

  let staffIds: string[];
  try {
    staffIds = await call(store.staffIds());
  } catch (e) {
    fail(null, null, "read", e);
    return finish(null);
  }
  if (staffIds.length === 0) {
    receipt.remaining = { closed_with_contact: 0, active_candidates: 0, stranded_originals: 0 };
    return finish(null);
  }

  // 1. Sweep closed rows that still carry contact.
  let closed: ContactRow[] = [];
  try {
    closed = await call(store.closedWithContact(staffIds, SWEEP_BATCH));
  } catch (e) {
    fail(null, null, "read", e);
  }
  receipt.sweep.seen = closed.length;
  if (!opts.dry) {
    for (const row of closed) {
      if (outOfTime()) {
        receipt.stopped_early = true;
        break;
      }
      try {
        await call(store.archiveContact(row, new Date(clock.now()).toISOString()));
      } catch (e) {
        fail(row.id, row.title, "sweep", `contact not archived, so not cleared: ${errMessage(e)}`);
        continue;
      }
      try {
        const done = await call(store.clearClosedContact(row.id, row.source_url ?? closedOriginalSourceUrl(row)));
        if (done) receipt.sweep.cleared += 1;
        else receipt.sweep.skipped += 1;
      } catch (e) {
        fail(row.id, row.title, "sweep", `archived, contact not cleared: ${errMessage(e)}`);
      }
    }
  }

  // 2. Quote requests left on adopted originals.
  let stranded: StrandedOriginal[] = [];
  if (!receipt.stopped_early) {
    try {
      stranded = await call(store.strandedOriginals(staffIds, RECOVER_BATCH));
    } catch (e) {
      fail(null, null, "read", e);
    }
  }
  receipt.recover.seen = stranded.length;
  if (!opts.dry) {
    for (const s of stranded) {
      if (outOfTime()) {
        receipt.stopped_early = true;
        break;
      }
      try {
        const businessId = await call(store.businessOf(s.canonical_listing_id));
        const moved = await call(store.moveEnquiries(s.id, s.canonical_listing_id, businessId));
        receipt.recover.enquiries_moved += moved;
        receipt.recover.originals_fixed += 1;
      } catch (e) {
        fail(s.id, s.title, "recover", `quote requests not moved: ${errMessage(e)}`);
      }
    }
  }

  // 3. Adopt a small batch.
  let candidates: CandidateRow[] = [];
  if (!receipt.stopped_early) {
    try {
      candidates = await call(store.activeCandidates(staffIds, ADOPT_BATCH));
    } catch (e) {
      fail(null, null, "read", e);
    }
  }
  receipt.adopt.seen = candidates.length;
  const plan: { row: CandidateRow; p: Plan }[] = candidates.map((row) => ({ row, p: planStaffPost(row) }));

  if (opts.dry) {
    receipt.plan = {
      adopt: plan.flatMap(({ row, p }) =>
        p.verdict === "adopt" ? [{ title: row.title, found_on: p.record.source_platform, state: p.record.state }] : []
      ),
      hold: plan.flatMap(({ row, p }) => (p.verdict === "hold" ? [{ title: row.title, reasons: p.reasons }] : [])),
    };
    return finish(staffIds);
  }

  for (const { row, p } of plan) {
    if (outOfTime()) {
      receipt.stopped_early = true;
      break;
    }
    const now = new Date(clock.now()).toISOString();

    if (p.verdict === "hold") {
      try {
        await call(store.archiveContact(row, now));
      } catch (e) {
        fail(row.id, row.title, "hold", `contact not archived, row left as is: ${errMessage(e)}`);
        continue;
      }
      try {
        const done = await call(store.closeHeld(row, p.reasons, row.source_url ?? closedOriginalSourceUrl(row), now));
        if (done) {
          receipt.adopt.held += 1;
          receipt.held.push({ title: row.title, reasons: p.reasons });
        } else receipt.adopt.skipped += 1;
      } catch (e) {
        fail(row.id, row.title, "hold", `archived, not closed: ${errMessage(e)}`);
      }
      continue;
    }

    // Order matters for recovery: ingest (keyed, repeatable), archive, move
    // quote requests, then close. A run cut short anywhere before the close
    // leaves the original active, so the next run repeats the row and gets
    // the same business and listing back.
    let ingested: { listing_id: string; business_id: string | null };
    try {
      ingested = await call(store.ingest(p.record));
      if (!ingested?.listing_id) throw new Error("no listing id returned");
    } catch (e) {
      fail(row.id, row.title, "adopt", `not re-filed: ${errMessage(e)}`);
      continue;
    }
    const notes: string[] = [];
    try {
      await call(store.labelSource(ingested.listing_id, p.urlKind));
    } catch (e) {
      notes.push(`source label not saved (${errMessage(e)})`);
    }
    try {
      await call(store.archiveContact(row, now));
    } catch (e) {
      fail(row.id, row.title, "adopt", `re-filed, contact not archived, original left open: ${errMessage(e)}`);
      continue;
    }
    try {
      await call(store.moveEnquiries(row.id, ingested.listing_id, ingested.business_id));
    } catch (e) {
      fail(row.id, row.title, "adopt", `re-filed, quote requests not moved, original left open: ${errMessage(e)}`);
      continue;
    }
    try {
      const done = await call(store.closeAdopted(row, ingested.listing_id, p.record.source_url, now));
      if (!done) {
        receipt.adopt.skipped += 1;
        continue;
      }
    } catch (e) {
      fail(row.id, row.title, "adopt", `re-filed, original not closed: ${errMessage(e)}`);
      continue;
    }
    if (notes.length) fail(row.id, row.title, "adopt", `adopted, but ${notes.join("; ")}`);
    receipt.adopt.adopted += 1;
    receipt.adopted_titles.push(row.title);
  }

  return finish(staffIds);
}
