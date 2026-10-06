// The bounded clean-up run against an in-memory store that behaves like the
// Supabase one (keyed ingest, unique archive key, conditional closes) and can
// add latency, fail a call, or apply a write and then lose the response.
// These are simulations: they prove the run's logic, not a hosted database.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADOPT_BATCH,
  FINISH_BUDGET_MS,
  NOTIFY_BUDGET_MS,
  ROUTE_MAX_DURATION_S,
  WORK_BUDGET_MS,
  redact,
  runCleanup,
  type CandidateRow,
  type CleanupStore,
  type ContactRow,
} from "@/lib/staff-post-cleanup";
import type { DirectoryImportRecord } from "@/lib/directory-records";

const STAFF = "34b05ffe-c3b6-4fa9-8b97-dd4e8a06af93";
const ADMIN = "aaaaaaaa-0000-0000-0000-00000000000a";
const OWNER = "bbbbbbbb-0000-0000-0000-00000000000b";

type Listing = {
  id: string;
  title: string;
  description: string | null;
  postcode: string | null;
  state: string | null;
  category_slug: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  source_url: string | null;
  created_at: string;
  user_id: string | null;
  data_source: "manual" | "scraped";
  status: "active" | "closed";
  canonical_listing_id: string | null;
  business_id: string | null;
  metadata: Record<string, unknown>;
  source_key: string | null;
};

type Fault = { method: keyof CleanupStore; id?: string; mode: "fail" | "lost" | "hang"; times?: number };

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

class World {
  listings = new Map<string, Listing>();
  businesses = new Map<string, { id: string; source_key: string; claim_status: string }>();
  sources = new Map<string, { listing_id: string; phone: string | null; email: string | null }>();
  enquiries = new Map<string, { id: string; listing_id: string; business_id: string | null }>();
  profiles = [
    { user_id: STAFF, is_admin: false, is_staff: true, directory_contributor: false },
    { user_id: ADMIN, is_admin: true, is_staff: true, directory_contributor: false },
    { user_id: OWNER, is_admin: false, is_staff: false, directory_contributor: false },
  ];
  latencyMs = 0;
  /** Per-method latency, overriding latencyMs. */
  methodLatency: Partial<Record<keyof CleanupStore, number>> = {};
  /** When each call started (Date.now(), faked in the deadline tests). */
  calls: { method: keyof CleanupStore; at: number }[] = [];
  faults: Fault[] = [];
  writes = 0;
  private seq = 0;

  nextId(prefix: string) {
    this.seq += 1;
    return `${prefix}-${String(this.seq).padStart(4, "0")}`;
  }

  add(l: Partial<Listing> & { title: string }): Listing {
    const row: Listing = {
      id: this.nextId("lst"),
      description: `${l.title} is a general fencing business we found listed on yellow_pages in Dalmeny, NSW.`,
      postcode: "2546",
      state: "NSW",
      category_slug: "fencing-contractor",
      contact_phone: "0400 111 222",
      contact_email: `${l.title.toLowerCase().replace(/[^a-z]/g, "")}@example.test`,
      source_url: null,
      created_at: `2026-10-01T00:00:${String(this.seq % 60).padStart(2, "0")}Z`,
      user_id: STAFF,
      data_source: "manual",
      status: "active",
      canonical_listing_id: null,
      business_id: null,
      metadata: {},
      source_key: null,
      ...l,
    };
    this.listings.set(row.id, row);
    return row;
  }

  enquiry(listingId: string) {
    const id = this.nextId("enq");
    this.enquiries.set(id, { id, listing_id: listingId, business_id: null });
  }

  snapshot() {
    return JSON.stringify({
      l: [...this.listings.values()],
      b: [...this.businesses.values()],
      s: [...this.sources.entries()],
      e: [...this.enquiries.values()],
    });
  }

  /** Wraps a method: latency, then any matching fault. "lost" applies the write, then hangs. */
  private async gate<T>(method: keyof CleanupStore, id: string | undefined, write: boolean, body: () => T): Promise<T> {
    this.calls.push({ method, at: Date.now() });
    const latency = this.methodLatency[method] ?? this.latencyMs;
    if (latency) await tick(latency);
    const f = this.faults.find((x) => x.method === method && (!x.id || x.id === id) && (x.times ?? 1) > 0);
    if (f) {
      f.times = (f.times ?? 1) - 1;
      if (f.mode === "fail") throw new Error(`simulated ${method} failure for ${id ?? "run"}: 0400 111 222 bad@example.test`);
      if (f.mode === "hang") return new Promise<T>(() => {});
      const out = body();
      if (write) this.writes += 1;
      void out;
      return new Promise<T>(() => {});
    }
    const out = body();
    if (write) this.writes += 1;
    return out;
  }

  private isStaff = (uid: string | null, staffIds: string[]) => !!uid && staffIds.includes(uid);

  store(): CleanupStore {
    const w = this;
    const manualService = (l: Listing) => l.data_source === "manual";
    const toContact = (l: Listing): ContactRow => ({
      id: l.id,
      title: l.title,
      postcode: l.postcode,
      state: l.state,
      contact_phone: l.contact_phone,
      contact_email: l.contact_email,
      source_url: l.source_url,
      user_id: l.user_id ?? "",
    });
    const closedWithContact = (staffIds: string[]) =>
      [...w.listings.values()].filter(
        (l) => manualService(l) && l.status === "closed" && w.isStaff(l.user_id, staffIds) && (l.contact_phone || l.contact_email)
      );
    const active = (staffIds: string[]) =>
      [...w.listings.values()]
        .filter(
          (l) =>
            manualService(l) &&
            l.status === "active" &&
            !l.canonical_listing_id &&
            !l.business_id &&
            !l.metadata.held_from_staff_post &&
            w.isStaff(l.user_id, staffIds)
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const stranded = (staffIds: string[]) =>
      [...w.listings.values()].filter(
        (l) =>
          manualService(l) &&
          l.status === "closed" &&
          w.isStaff(l.user_id, staffIds) &&
          l.canonical_listing_id &&
          [...w.enquiries.values()].some((e) => e.listing_id === l.id)
      );

    return {
      staffIds: () => w.gate("staffIds", undefined, false, () => w.profiles.filter((p) => (p.is_staff || p.directory_contributor) && !p.is_admin).map((p) => p.user_id)),
      closedWithContact: (ids, limit) => w.gate("closedWithContact", undefined, false, () => closedWithContact(ids).slice(0, limit).map(toContact)),
      strandedOriginals: (ids, limit) =>
        w.gate("strandedOriginals", undefined, false, () =>
          stranded(ids)
            .slice(0, limit)
            .map((l) => ({ id: l.id, title: l.title, canonical_listing_id: l.canonical_listing_id as string }))
        ),
      activeCandidates: (ids, limit) =>
        w.gate("activeCandidates", undefined, false, () =>
          active(ids)
            .slice(0, limit)
            .map(
              (l): CandidateRow => ({
                ...toContact(l),
                description: l.description,
                category_slug: l.category_slug,
                created_at: l.created_at,
                metadata: { ...l.metadata },
              })
            )
        ),
      remaining: (ids) =>
        w.gate("remaining", undefined, false, () => ({
          closed_with_contact: closedWithContact(ids).length,
          active_candidates: active(ids).length,
          stranded_originals: stranded(ids).length,
        })),
      archiveContact: (row) =>
        w.gate("archiveContact", row.id, true, () => {
          if (!row.contact_phone && !row.contact_email) return;
          const key = `staff_post:${row.id}`;
          if (w.sources.has(key)) return; // unique index; existing archive is kept as is
          w.sources.set(key, { listing_id: row.id, phone: row.contact_phone, email: row.contact_email });
        }),
      clearClosedContact: (id, sourceUrl) =>
        w.gate("clearClosedContact", id, true, () => {
          const l = w.listings.get(id);
          if (!l || l.status !== "closed" || (!l.contact_phone && !l.contact_email)) return false;
          if (!w.sources.has(`staff_post:${id}`)) throw new Error("test invariant: cleared before archive");
          Object.assign(l, { contact_phone: null, contact_email: null, source_url: sourceUrl });
          return true;
        }),
      ingest: (r: DirectoryImportRecord) =>
        w.gate("ingest", r.source_external_id, true, () => {
          const key = `${r.source_platform}:${r.source_external_id}`;
          let biz = [...w.businesses.values()].find((b) => b.source_key === key);
          if (!biz) {
            biz = { id: w.nextId("biz"), source_key: key, claim_status: "unclaimed" };
            w.businesses.set(biz.id, biz);
          }
          let listing = [...w.listings.values()].find((l) => l.source_key === key);
          if (!listing) {
            listing = w.add({
              title: r.name,
              user_id: null,
              data_source: "scraped",
              business_id: biz.id,
              source_key: key,
              source_url: r.source_url,
              contact_phone: null,
              contact_email: null,
            });
          }
          return { listing_id: listing.id, business_id: biz.id };
        }),
      labelSource: (id, kind) =>
        w.gate("labelSource", id, true, () => {
          const l = w.listings.get(id);
          if (l) l.metadata = { ...l.metadata, source_url_kind: kind };
        }),
      businessOf: (id) => w.gate("businessOf", id, false, () => w.listings.get(id)?.business_id ?? null),
      moveEnquiries: (from, to, biz) =>
        w.gate("moveEnquiries", from, true, () => {
          let n = 0;
          for (const e of w.enquiries.values())
            if (e.listing_id === from) {
              Object.assign(e, { listing_id: to, business_id: biz });
              n += 1;
            }
          return n;
        }),
      closeAdopted: (row, newId, sourceUrl, now) =>
        w.gate("closeAdopted", row.id, true, () => {
          const l = w.listings.get(row.id);
          if (!l || l.status !== "active") return false;
          if (!w.sources.has(`staff_post:${row.id}`)) throw new Error("test invariant: closed before archive");
          Object.assign(l, {
            status: "closed",
            canonical_listing_id: newId,
            contact_phone: null,
            contact_email: null,
            source_url: sourceUrl,
            metadata: { ...row.metadata, adopted_from_staff_post: { at: now, into: newId } },
          });
          return true;
        }),
      closeHeld: (row, reasons, sourceUrl, now) =>
        w.gate("closeHeld", row.id, true, () => {
          const l = w.listings.get(row.id);
          if (!l || l.status !== "active") return false;
          if (!w.sources.has(`staff_post:${row.id}`)) throw new Error("test invariant: held before archive");
          Object.assign(l, {
            status: "closed",
            contact_phone: null,
            contact_email: null,
            source_url: sourceUrl,
            metadata: { ...row.metadata, held_from_staff_post: { at: now, reasons } },
          });
          return true;
        }),
    };
  }
}

/** A typical production shape: active staff posts, closed ones with contact, plus rows that must not change. */
function seed(activeStaff = 14, closedStaff = 6) {
  const w = new World();
  const originalContacts = new Map<string, { phone: string | null; email: string | null }>();
  for (let i = 0; i < activeStaff; i++) {
    const l = w.add({ title: `Ridge Fencing ${String.fromCharCode(65 + i)}` });
    originalContacts.set(l.id, { phone: l.contact_phone, email: l.contact_email });
    if (i % 3 === 0) w.enquiry(l.id);
  }
  // Held by the screen: off-topic trade.
  const held = w.add({ title: "Sparkle Pool Cleaning" });
  originalContacts.set(held.id, { phone: held.contact_phone, email: held.contact_email });
  for (let i = 0; i < closedStaff; i++) {
    const l = w.add({ title: `Closed Fencing ${i}`, status: "closed" });
    originalContacts.set(l.id, { phone: l.contact_phone, email: l.contact_email });
  }
  // Must never change: a genuine owner's post, an admin's post, a staff row linked to a claimed business.
  const owner = w.add({ title: "Bob's Own Fencing", user_id: OWNER });
  const adminRow = w.add({ title: "Outback Fencing", user_id: ADMIN });
  const claimedBiz = { id: "biz-claimed", source_key: "claimed", claim_status: "claimed" };
  w.businesses.set(claimedBiz.id, claimedBiz);
  const claimed = w.add({ title: "Staff Member Own Fencing", business_id: claimedBiz.id });
  w.enquiry(owner.id);
  return { w, originalContacts, untouched: [owner.id, adminRow.id, claimed.id], held: held.id };
}

function untouchedJson(w: World, ids: string[]) {
  return JSON.stringify(ids.map((id) => w.listings.get(id)));
}

/** The invariants that must hold after any sequence of runs. */
function checkInvariants(w: World, originalContacts: Map<string, { phone: string | null; email: string | null }>) {
  // One business and one scraped listing per source key.
  const bizKeys = [...w.businesses.values()].map((b) => b.source_key);
  expect(new Set(bizKeys).size).toBe(bizKeys.length);
  const listingKeys = [...w.listings.values()].filter((l) => l.source_key).map((l) => l.source_key);
  expect(new Set(listingKeys).size).toBe(listingKeys.length);
  // Any staff post whose contact is gone has an exact private archive.
  for (const [id, orig] of originalContacts) {
    const l = w.listings.get(id)!;
    expect(l).toBeDefined();
    if (!l.contact_phone && !l.contact_email) {
      expect(w.sources.get(`staff_post:${id}`)).toEqual({ listing_id: id, phone: orig.phone, email: orig.email });
      expect(l.source_url).toBeTruthy(); // listings_contact_required
    }
  }
}

describe("runCleanup", () => {
  it("dry run writes nothing and plans the batch", async () => {
    const { w } = seed();
    const before = w.snapshot();
    const r = await runCleanup(w.store(), { dry: true });
    expect(w.writes).toBe(0);
    expect(w.snapshot()).toBe(before);
    expect(r.dry).toBe(true);
    expect(r.sweep).toEqual({ seen: 6, cleared: 0, skipped: 0 });
    expect(r.adopt.seen).toBe(ADOPT_BATCH);
    expect(r.adopt.adopted).toBe(0);
    expect(r.plan!.adopt.length + r.plan!.hold.length).toBe(ADOPT_BATCH);
    expect(r.more_work).toBe(true);
  });

  it("clears closed rows first, then adopts a bounded batch, and finishes over repeated runs", async () => {
    const { w, originalContacts, untouched, held } = seed();
    const keep = untouchedJson(w, untouched);
    const enquiriesBefore = w.enquiries.size;

    const first = await runCleanup(w.store(), { dry: false });
    expect(first.errors).toEqual([]);
    expect(first.sweep.cleared).toBe(6);
    expect(first.adopt.seen).toBe(ADOPT_BATCH);
    expect(first.adopt.adopted).toBe(ADOPT_BATCH);
    expect(first.more_work).toBe(true);
    expect(first.remaining).toEqual({ closed_with_contact: 0, active_candidates: 5, stranded_originals: 0 });

    const second = await runCleanup(w.store(), { dry: false });
    expect(second.errors).toEqual([]);
    expect(second.adopt.adopted).toBe(4);
    expect(second.adopt.held).toBe(1);
    expect(second.held[0].title).toBe("Sparkle Pool Cleaning");
    expect(second.more_work).toBe(false);

    const third = await runCleanup(w.store(), { dry: false });
    expect(third.adopt.seen + third.sweep.seen + third.recover.seen).toBe(0);

    checkInvariants(w, originalContacts);
    expect(untouchedJson(w, untouched)).toBe(keep);
    expect(w.enquiries.size).toBe(enquiriesBefore);
    expect(w.listings.get(held)!.metadata.held_from_staff_post).toBeTruthy();
    // Every staff original is now closed and contact-free; adopted ones point at their new row.
    for (const id of originalContacts.keys()) {
      const l = w.listings.get(id)!;
      expect(l.status).toBe("closed");
      expect(l.contact_phone ?? l.contact_email).toBeNull();
    }
    // Quote requests followed the business.
    for (const e of w.enquiries.values()) {
      const l = w.listings.get(e.listing_id)!;
      if (l.user_id === OWNER) continue;
      expect(l.data_source).toBe("scraped");
      expect(e.business_id).toBe(l.business_id);
    }
  });

  it("stops inside the time budget under latency and resumes on the next run", async () => {
    const { w, originalContacts } = seed();
    w.latencyMs = 15;
    const runs = [];
    for (let i = 0; i < 20; i++) {
      const t0 = Date.now();
      // The budget must exceed the reads plus one row (here 4 x 15 + 5 x 15 ms),
      // as the real 35s does by orders of magnitude, or no row could finish.
      const r = await runCleanup(w.store(), { dry: false, budgetMs: 250, callTimeoutMs: 1000 });
      // Nothing runs past the budget; then only the closing count.
      expect(Date.now() - t0).toBeLessThan(250 + 15 + 200);
      expect(r.errors).toEqual([]);
      runs.push(r);
      if (!r.more_work) break;
    }
    expect(runs.length).toBeGreaterThan(2);
    expect(runs.slice(0, -1).every((r) => r.more_work)).toBe(true);
    expect(runs.some((r) => r.stopped_early)).toBe(true);
    expect(runs.at(-1)!.more_work).toBe(false);
    checkInvariants(w, originalContacts);
    const total = runs.reduce((n, r) => n + r.adopt.adopted, 0);
    expect(total).toBe(14);
  });

  it("never clears contact when the archive fails, and says so", async () => {
    const { w, originalContacts } = seed(2, 2);
    const closed = [...w.listings.values()].find((l) => l.status === "closed")!;
    w.faults.push({ method: "archiveContact", id: closed.id, mode: "fail" });
    const r = await runCleanup(w.store(), { dry: false });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([
      expect.objectContaining({ id: closed.id, stage: "sweep", message: expect.stringContaining("not archived, so not cleared") }),
    ]);
    expect(w.listings.get(closed.id)!.contact_phone).not.toBeNull();
    // Error text never carries contact values.
    expect(JSON.stringify(r)).not.toMatch(/0400 111 222|@example\.test/);
    const again = await runCleanup(w.store(), { dry: false });
    expect(again.errors).toEqual([]);
    expect(w.listings.get(closed.id)!.contact_phone).toBeNull();
    checkInvariants(w, originalContacts);
  });

  it("a failed close or quote-request move leaves the original open and is retried without duplicates", async () => {
    const { w, originalContacts } = seed(3, 0);
    const [a, b] = [...w.listings.values()].filter((l) => l.user_id === STAFF && l.status === "active");
    w.enquiry(b.id);
    w.faults.push({ method: "closeAdopted", id: a.id, mode: "fail" });
    w.faults.push({ method: "moveEnquiries", id: b.id, mode: "fail" });
    const r = await runCleanup(w.store(), { dry: false });
    expect(r.errors.map((e) => [e.id, e.stage])).toEqual([
      [a.id, "adopt"],
      [b.id, "adopt"],
    ]);
    expect(w.listings.get(a.id)!.status).toBe("active");
    expect(w.listings.get(b.id)!.status).toBe("active");
    const r2 = await runCleanup(w.store(), { dry: false });
    expect(r2.errors).toEqual([]);
    expect(w.listings.get(a.id)!.status).toBe("closed");
    expect([...w.enquiries.values()].filter((e) => e.listing_id === b.id)).toHaveLength(0);
    checkInvariants(w, originalContacts);
  });

  it("an ingest whose response is lost is reported as unknown, and the retry finds the same business", async () => {
    const { w, originalContacts } = seed(2, 0);
    const first = [...w.listings.values()].find((l) => l.user_id === STAFF && l.status === "active")!;
    w.faults.push({ method: "ingest", mode: "lost" });
    const r = await runCleanup(w.store(), { dry: false, callTimeoutMs: 50 });
    expect(r.errors[0]).toMatchObject({ id: first.id, stage: "adopt" });
    expect(r.errors[0].message).toMatch(/timed out; outcome unknown/);
    const bizBefore = w.businesses.size;
    const r2 = await runCleanup(w.store(), { dry: false });
    expect(r2.errors).toEqual([]);
    expect(w.businesses.size).toBe(bizBefore); // the retry found the business the lost call created
    expect(w.businesses.size).toBe(1 + 2);
    checkInvariants(w, originalContacts);
  });

  it("a close whose response is lost doesn't strand quote requests that arrive afterwards", async () => {
    const { w, originalContacts } = seed(1, 0);
    const row = [...w.listings.values()].find((l) => l.user_id === STAFF && l.status === "active")!;
    w.faults.push({ method: "closeAdopted", id: row.id, mode: "lost" });
    const r = await runCleanup(w.store(), { dry: false, callTimeoutMs: 50 });
    expect(r.errors[0].message).toMatch(/outcome unknown/);
    expect(w.listings.get(row.id)!.status).toBe("closed"); // the write landed
    // A farmer's quote request lands on the old URL's row before it 301s.
    w.enquiry(row.id);
    const r2 = await runCleanup(w.store(), { dry: false });
    expect(r2.recover).toEqual({ seen: 1, originals_fixed: 1, enquiries_moved: 1 });
    expect(r2.more_work).toBe(false);
    const e = [...w.enquiries.values()].find((x) => x.listing_id === w.listings.get(row.id)!.canonical_listing_id);
    expect(e).toBeDefined();
    checkInvariants(w, originalContacts);
  });

  it("two overlapping runs don't duplicate businesses, lose archives or double count", async () => {
    const { w, originalContacts, untouched } = seed(12, 4);
    const keep = untouchedJson(w, untouched);
    w.latencyMs = 3;
    const [r1, r2] = await Promise.all([runCleanup(w.store(), { dry: false }), runCleanup(w.store(), { dry: false })]);
    expect([...r1.errors, ...r2.errors]).toEqual([]);
    expect(r1.sweep.cleared + r2.sweep.cleared).toBe(4);
    expect(r1.sweep.skipped + r2.sweep.skipped).toBe(4);
    const adopted = r1.adopt.adopted + r2.adopt.adopted;
    expect(adopted).toBe(10);
    expect(r1.adopt.skipped + r2.adopt.skipped).toBe(10);
    await runCleanup(w.store(), { dry: false });
    checkInvariants(w, originalContacts);
    expect(untouchedJson(w, untouched)).toBe(keep);
    expect(w.businesses.size).toBe(1 + 12); // the claimed one + one per adopted row
  });

  it("reports a store that can't be read as an error with more work, not success", async () => {
    const { w } = seed(2, 0);
    w.faults.push({ method: "staffIds", mode: "fail" });
    const r = await runCleanup(w.store(), { dry: false });
    expect(r.ok).toBe(false);
    expect(r.more_work).toBe(true);
    expect(r.errors[0].stage).toBe("read");
  });
});

describe("redact", () => {
  it("removes emails and phone numbers from error text", () => {
    expect(redact("duplicate for jobs@example.com and 0400 123 456 (+61 2 6555 1234)")).toBe(
      "duplicate for [email] and [number] ([number])"
    );
  });
});

// Codex's exact-source repro (6 Oct): row 1 takes 34s, row 2 starts under
// budget and its sub-8s calls used to carry the run to ~70s, past the route's
// 60s maxDuration, before the awaited team email. Fake timers, no real waiting.
describe("deadline per stage", () => {
  afterEach(() => vi.useRealTimers());

  const slowAdopt = (w: World) => {
    w.methodLatency = { ingest: 7_000, labelSource: 7_000, archiveContact: 7_000, moveEnquiries: 6_500, closeAdopted: 6_500, remaining: 1_000 };
  };

  it("the time plan fits inside maxDuration", () => {
    expect(WORK_BUDGET_MS + FINISH_BUDGET_MS + NOTIFY_BUDGET_MS).toBeLessThanOrEqual(ROUTE_MAX_DURATION_S * 1000 - 10_000);
  });

  it("no stage starts or runs past the deadline; the count has its own window; the next run finishes the row", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { w, originalContacts } = seed(3, 0);
    slowAdopt(w);
    const t0 = Date.now();
    const pending = runCleanup(w.store(), { dry: false });
    await vi.advanceTimersByTimeAsync(120_000);
    const r = await pending;
    const work = w.calls.filter((c) => c.method !== "remaining");
    // Row 1 (34s) completes; row 2's ingest starts at 34s and is cut off at 35s,
    // which stops the run (outcome unknown, not an error).
    expect(r.adopt.adopted).toBe(1);
    expect(Math.max(...work.map((c) => c.at - t0))).toBeLessThan(WORK_BUDGET_MS);
    expect(r.stopped_early).toBe(true);
    expect(r.more_work).toBe(true);
    expect(r.errors).toEqual([]);
    expect(w.calls.filter((c) => c.method === "ingest")).toHaveLength(2);
    // The remaining count started at the deadline and finished in its window.
    const count = w.calls.find((c) => c.method === "remaining")!;
    expect(count.at - t0).toBe(WORK_BUDGET_MS);
    expect(r.elapsed_ms).toBeLessThanOrEqual(WORK_BUDGET_MS + FINISH_BUDGET_MS);
    expect(r.remaining).toEqual({ closed_with_contact: 0, active_candidates: 3, stranded_originals: 0 }); // 2 rows + the held one
    // The cut-off ingest still lands later; the next (fast) runs reuse it and finish cleanly.
    w.methodLatency = {};
    vi.useRealTimers();
    let last = r;
    for (let i = 0; i < 5 && last.more_work; i++) last = await runCleanup(w.store(), { dry: false });
    expect(last).toMatchObject({ ok: true, more_work: false });
    checkInvariants(w, originalContacts);
  });

  it("a hanging count or a slow sweep still returns by deadline plus the reserved window", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { w } = seed(2, 25);
    w.methodLatency = { archiveContact: 4_000, clearClosedContact: 4_000 };
    w.faults.push({ method: "remaining", mode: "hang" });
    const t0 = Date.now();
    const pending = runCleanup(w.store(), { dry: false });
    await vi.advanceTimersByTimeAsync(120_000);
    const r = await pending;
    expect(Math.max(...w.calls.filter((c) => c.method !== "remaining").map((c) => c.at - t0))).toBeLessThan(WORK_BUDGET_MS);
    expect(r.elapsed_ms).toBeLessThanOrEqual(WORK_BUDGET_MS + FINISH_BUDGET_MS);
    expect(r.stopped_early).toBe(true);
    expect(r.more_work).toBe(true); // unknown remaining counts as more work
    expect(r.adopt.seen).toBe(0); // the sweep used the budget; adopting waits for the next run
    expect(r.errors.map((e) => e.stage)).toEqual(["read"]);
  });

  it("a dry run under the same latency still writes nothing and stays inside the window", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { w } = seed(3, 2);
    slowAdopt(w);
    const before = w.snapshot();
    const pending = runCleanup(w.store(), { dry: true });
    await vi.advanceTimersByTimeAsync(120_000);
    const r = await pending;
    expect(w.snapshot()).toBe(before);
    expect(w.writes).toBe(0);
    expect(r.elapsed_ms).toBeLessThanOrEqual(WORK_BUDGET_MS + FINISH_BUDGET_MS);
  });
});
