// The staff-post clean-up run (lib/staff-post-cleanup.ts) against an in-memory
// store that mimics the database's conditional writes: a virtual clock for
// latency, kills at every write, injected failures and two overlapping runs.
// All contacts are fake (0400 000 xxx, example.test).
import { describe, expect, it } from "vitest";
import { receiptEmail, runCleanup, type ActiveRow, type CleanupStore, type ContactRow, type Write } from "@/lib/staff-post-cleanup";
import type { DirectoryImportRecord } from "@/lib/directory-records";

const STAFF = "44444444-4444-4444-8444-444444444444";
const CONTRIB = "55555555-5555-4555-8555-555555555555";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const OWNER = "66666666-6666-4666-8666-666666666666";
const DESC = "Rural fencing contractor we found listed on yellow_pages in Testville, NSW.";

type Listing = {
  id: string;
  user_id: string | null;
  kind: string;
  data_source: string;
  status: "active" | "closed";
  title: string;
  description: string;
  postcode: string;
  state: string;
  contact_phone: string | null;
  contact_email: string | null;
  source_url: string | null;
  canonical_listing_id: string | null;
  business_id: string | null;
  closed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  external_id?: string;
};
type Enquiry = { id: string; listing_id: string; business_id: string | null };

class Killed extends Error {}

/** The database, shared by every store (run) that opens it. */
class Db {
  listings = new Map<string, Listing>();
  sources = new Map<string, { listing_id: string; raw: Record<string, unknown> }>();
  enquiries: Enquiry[] = [];
  businesses = new Map<string, { id: string; claimed: boolean }>();
  profiles = [
    { user_id: STAFF, is_admin: false, is_staff: true, directory_contributor: false },
    { user_id: CONTRIB, is_admin: false, is_staff: false, directory_contributor: true },
    { user_id: ADMIN, is_admin: true, is_staff: true, directory_contributor: false },
    { user_id: OWNER, is_admin: false, is_staff: false, directory_contributor: false },
  ];
  writes = 0;
  private n = 0;
  nextId = (p: string) => `${p}-${String(++this.n).padStart(4, "0")}`;

  post(user: string, title: string, n: number, extra: Partial<Listing> = {}): Listing {
    const l: Listing = {
      id: this.nextId("lst"),
      user_id: user,
      kind: "service_offering",
      data_source: "manual",
      status: "active",
      title,
      description: DESC,
      postcode: "2800",
      state: "NSW",
      contact_phone: `0400 000 ${String(n).padStart(3, "0")}`,
      contact_email: `fixture${n}@example.test`,
      source_url: null,
      canonical_listing_id: null,
      business_id: null,
      closed_at: null,
      metadata: {},
      created_at: new Date(Date.UTC(2026, 7, 1) + n * 60_000).toISOString(),
      ...extra,
    };
    if (l.status === "closed") l.closed_at ??= "2026-09-01T00:00:00.000Z";
    this.listings.set(l.id, l);
    return l;
  }

  /** Mirrors the listings_contact_required and closed-consistency constraints. */
  check(l: Listing) {
    if (!l.contact_phone && !l.contact_email && !l.source_url) throw new Error("violates check constraint listings_contact_required");
    if ((l.status === "closed") !== (l.closed_at !== null)) throw new Error("violates check constraint closed_consistency");
  }

  snapshot() {
    return JSON.stringify({ l: [...this.listings.entries()], s: [...this.sources.entries()], e: this.enquiries, b: [...this.businesses.entries()] });
  }
}

type Fault = (method: string, arg?: { id?: string; name?: string }) => string | null;

/** One run's connection to the Db: latency on a virtual clock, optional kill and faults. */
function connect(db: Db, opts: { clock: { t: number }; latencyMs?: number; slow?: Record<string, number>; killAfterWrites?: number; fault?: Fault } = { clock: { t: 0 } }) {
  let writes = 0;
  const lat = opts.latencyMs ?? 0;
  const step = async (method?: string) => {
    opts.clock.t += lat + (method ? (opts.slow?.[method] ?? 0) : 0);
    await new Promise((r) => setImmediate(r)); // let an overlapping run interleave
  };
  const read = async <T>(f: () => T): Promise<T> => {
    await step();
    if (opts.killAfterWrites !== undefined && writes >= opts.killAfterWrites) throw new Killed("killed");
    return f();
  };
  const write = async <T>(method: string, arg: { id?: string; name?: string } | undefined, f: () => T): Promise<T> => {
    await step(method);
    if (opts.killAfterWrites !== undefined && writes >= opts.killAfterWrites) throw new Killed("killed");
    const injected = opts.fault?.(method, arg);
    if (injected) return { ok: false, error: injected } as T;
    writes++;
    db.writes++;
    return f();
  };
  const isStaffPost = (l: Listing, ids: string[]) => l.kind === "service_offering" && l.data_source === "manual" && !!l.user_id && ids.includes(l.user_id);
  const contact = (l: Listing): ContactRow => ({
    id: l.id,
    title: l.title,
    postcode: l.postcode,
    state: l.state,
    contact_phone: l.contact_phone,
    contact_email: l.contact_email,
    source_url: l.source_url,
    user_id: l.user_id ?? "",
  });
  const stranded = (ids: string[]) =>
    db.enquiries.filter((e) => {
      const l = db.listings.get(e.listing_id);
      return !!l && isStaffPost(l, ids) && l.status === "closed" && l.canonical_listing_id !== null;
    });
  const closeIf = (row: ActiveRow, patch: Partial<Listing>): Write => {
    const l = db.listings.get(row.id);
    if (!l || l.status !== "active" || l.canonical_listing_id !== null) return { ok: true, changed: false };
    const next = { ...l, ...patch };
    db.check(next);
    db.listings.set(l.id, next);
    return { ok: true, changed: true };
  };

  const store: CleanupStore = {
    staffIds: () => read(() => db.profiles.filter((p) => (p.is_staff || p.directory_contributor) && !p.is_admin).map((p) => p.user_id)),
    closedWithContact: (ids, limit) =>
      read(() =>
        [...db.listings.values()]
          .filter((l) => isStaffPost(l, ids) && l.status === "closed" && (l.contact_phone || l.contact_email))
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, limit)
          .map(contact)
      ),
    adoptedOriginals: (ids, limit) =>
      read(() => {
        const seen = new Map<string, { id: string; canonical_listing_id: string }>();
        for (const e of stranded(ids).slice(0, limit)) seen.set(e.listing_id, { id: e.listing_id, canonical_listing_id: db.listings.get(e.listing_id)!.canonical_listing_id! });
        return [...seen.values()];
      }),
    enquiryCounts: (ids) =>
      read(() => {
        const m = new Map<string, number>();
        for (const e of db.enquiries) if (ids.includes(e.listing_id)) m.set(e.listing_id, (m.get(e.listing_id) ?? 0) + 1);
        return m;
      }),
    activeCandidates: (ids, limit) =>
      read(() =>
        [...db.listings.values()]
          .filter((l) => isStaffPost(l, ids) && l.status === "active" && l.canonical_listing_id === null && !l.metadata.held_from_staff_post)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .slice(0, limit)
          .map((l) => ({ ...contact(l), description: l.description, created_at: l.created_at, category_slug: "fencing", metadata: { ...l.metadata } }) as ActiveRow)
      ),
    archiveContact: (row) =>
      write("archiveContact", row, (): Write => {
        if (!row.contact_phone && !row.contact_email) return { ok: true, changed: false };
        const key = `staff_post:${row.id}`;
        if (db.sources.has(key)) return { ok: true, changed: false };
        db.sources.set(key, { listing_id: row.id, raw: { phone: row.contact_phone, email: row.contact_email } });
        return { ok: true, changed: true };
      }),
    clearClosedContact: (row) =>
      write("clearClosedContact", row, (): Write => {
        const l = db.listings.get(row.id);
        // Compare-and-swap on the values the run read, as the real store does.
        if (!l || l.status !== "closed" || (!l.contact_phone && !l.contact_email)) return { ok: true, changed: false };
        if (l.contact_phone !== row.contact_phone || l.contact_email !== row.contact_email) return { ok: true, changed: false };
        const next = { ...l, contact_phone: null, contact_email: null, source_url: row.source_url ?? `https://www.google.com/search?q=${encodeURIComponent(l.title)}` };
        db.check(next);
        db.listings.set(l.id, next);
        return { ok: true, changed: true };
      }),
    findExisting: (r, ids) =>
      read(() => {
        const same = (l: Listing) => l.title.toLowerCase() === r.name.toLowerCase() && l.postcode === r.postcode && l.status === "active";
        if (db.businesses.get(`${r.name.toLowerCase()}|${r.postcode}`)?.claimed) return { owned: "the business has been claimed by its owner" };
        const all = [...db.listings.values()];
        if (all.some((l) => same(l) && l.data_source !== "scraped" && !ids.includes(l.user_id ?? ""))) return { owned: "the business already has its own listing" };
        const copy = all.find((l) => same(l) && l.data_source === "scraped");
        return copy ? { unclaimed: { listing_id: copy.id, business_id: copy.business_id, source_external_id: copy.external_id ?? null } } : null;
      }),
    ingest: (r: DirectoryImportRecord) =>
      write("ingest", r, () => {
        const bizKey = `${r.name.toLowerCase()}|${r.postcode}`;
        if (db.businesses.get(bizKey)?.claimed) return { ok: false as const, error: "refusing to create a scraped listing for a claimed business", claimed: true };
        const existing = [...db.listings.values()].find((l) => l.external_id === r.source_external_id);
        if (existing) return { ok: true as const, listing_id: existing.id, business_id: existing.business_id };
        const biz = db.businesses.get(bizKey) ?? { id: db.nextId("biz"), claimed: false };
        db.businesses.set(bizKey, biz);
        const l = db.post("", r.name, 0, { user_id: null, data_source: "scraped", contact_phone: null, contact_email: null, source_url: r.source_url, business_id: biz.id, external_id: r.source_external_id });
        return { ok: true as const, listing_id: l.id, business_id: biz.id };
      }),
    labelCopy: (id, kind) =>
      write("labelCopy", { id }, (): Write => {
        const l = db.listings.get(id)!;
        if (l.metadata.source_url_kind === kind) return { ok: true, changed: false };
        l.metadata = { ...l.metadata, source_url_kind: kind };
        return { ok: true, changed: true };
      }),
    businessOf: (id) => read(() => db.listings.get(id)?.business_id ?? null),
    moveEnquiries: (from, to, biz) =>
      write("moveEnquiries", { id: from }, () => {
        let moved = 0;
        for (const e of db.enquiries)
          if (e.listing_id === from) {
            e.listing_id = to;
            e.business_id = biz;
            moved++;
          }
        return { ok: true as const, moved };
      }),
    closeAdopted: (row, into, url, now) =>
      write("closeAdopted", row, () =>
        closeIf(row, { status: "closed", closed_at: now, canonical_listing_id: into, contact_phone: null, contact_email: null, source_url: url, metadata: { ...row.metadata, adopted_from_staff_post: { at: now, into } } })
      ),
    closeHeld: (row, reasons, now) =>
      write("closeHeld", row, () =>
        closeIf(row, {
          status: "closed",
          closed_at: now,
          contact_phone: null,
          contact_email: null,
          source_url: row.source_url ?? "https://www.google.com/search?q=held",
          metadata: { ...row.metadata, held_from_staff_post: { at: now, reasons } },
        })
      ),
    remaining: (ids) =>
      read(() => ({
        active: [...db.listings.values()].filter((l) => isStaffPost(l, ids) && l.status === "active" && l.canonical_listing_id === null && !l.metadata.held_from_staff_post).length,
        closedWithContact: [...db.listings.values()].filter((l) => isStaffPost(l, ids) && l.status === "closed" && (l.contact_phone || l.contact_email)).length,
        enquiriesOnClosed: stranded(ids).length,
      })),
  };
  return store;
}

/** The production-shaped fixture: staff and contributor posts, legacy closed rows, a stranded enquiry, and rows that must not be touched. */
function seed() {
  const db = new Db();
  const adoptable = Array.from({ length: 12 }, (_, i) => db.post(STAFF, `Fixture Fencing ${String(i + 1).padStart(2, "0")}`, i + 1));
  adoptable.push(db.post(CONTRIB, "Contributor Fixture Fencing", 21));
  const offTopic = db.post(STAFF, "Fixture Pool Glass Co", 30);
  const claimedPost = db.post(STAFF, "Claimed Fixture Fencing", 31);
  db.businesses.set("claimed fixture fencing|2800", { id: "biz-claimed", claimed: true });
  const legacyClosed = Array.from({ length: 6 }, (_, i) => db.post(STAFF, `Legacy Closed Fixture ${i + 1}`, 40 + i, { status: "closed" }));
  const copy = db.post("", "Legacy Adopted Fixture", 0, { user_id: null, data_source: "scraped", contact_phone: null, contact_email: null, source_url: "https://example.test/yp", business_id: "biz-legacy" });
  const legacyOriginal = db.post(STAFF, "Legacy Adopted Fixture", 50, {
    status: "closed",
    contact_phone: null,
    contact_email: null,
    source_url: "https://www.google.com/search?q=legacy",
    canonical_listing_id: copy.id,
  });
  db.enquiries.push({ id: "enq-legacy", listing_id: legacyOriginal.id, business_id: null });
  // A quote request on a post that is about to be adopted: it must follow the post.
  db.enquiries.push({ id: "enq-live", listing_id: adoptable[0].id, business_id: null });
  // Already in the directory from a monthly import under another source: link, don't duplicate.
  const imported = db.post("", "Imported Fixture Fencing", 0, { user_id: null, data_source: "scraped", contact_phone: null, contact_email: null, source_url: "https://example.test/fb", business_id: "biz-imported", external_id: "facebook:imported" });
  const importedDup = db.post(STAFF, "Imported Fixture Fencing", 32);
  // A business whose genuine owner posted it: the staff duplicate is held, the owner's row untouched.
  const ownerDup = db.post(STAFF, "Genuine Owner Fencing", 33);
  const genuine = db.post(OWNER, "Genuine Owner Fencing", 60);
  const adminOwn = db.post(ADMIN, "Admin Own Fencing Ad", 61);
  const untouched = [genuine, adminOwn].map((l) => JSON.stringify(l));
  return { db, adoptable, offTopic, claimedPost, legacyClosed, legacyOriginal, copy, imported, importedDup, ownerDup, genuine, adminOwn, untouched };
}

/** Run to completion, as the daily cron would, until nothing remains. */
async function drain(db: Db, opts: Parameters<typeof connect>[1] & { limits?: Record<string, number> }, max = 20) {
  const receipts = [];
  for (let i = 0; i < max; i++) {
    const clock = opts?.clock ?? { t: 0 };
    const r = await runCleanup(connect(db, { ...opts, clock }), { dry: false, now: () => clock.t, limits: opts?.limits });
    receipts.push(r);
    if (!r.more_work) break;
  }
  return receipts;
}

/** The end state every path must reach. */
function expectClean(s: ReturnType<typeof seed>) {
  const { db } = s;
  const staffPosts = [...db.listings.values()].filter((l) => l.data_source === "manual" && (l.user_id === STAFF || l.user_id === CONTRIB));
  // No staff post holds a phone or email any more, and every one that did is archived.
  for (const l of staffPosts) {
    expect(l.contact_phone, l.title).toBeNull();
    expect(l.contact_email, l.title).toBeNull();
    expect(l.status, l.title).toBe("closed");
  }
  for (const l of [...s.adoptable, s.importedDup, s.ownerDup, s.offTopic, s.claimedPost, ...s.legacyClosed]) {
    const src = db.sources.get(`staff_post:${l.id}`);
    expect(src?.raw.phone, l.title).toMatch(/^0400 000 /);
  }
  // Exactly one unclaimed copy per adoptable business: no duplicates.
  const copies = [...db.listings.values()].filter((l) => l.data_source === "scraped");
  const names = copies.map((l) => l.title);
  expect(new Set(names).size).toBe(names.length);
  for (const l of s.adoptable) {
    const now = db.listings.get(l.id)!;
    const copy = db.listings.get(now.canonical_listing_id!);
    expect(copy?.title).toBe(l.title);
    expect(copy?.contact_phone ?? null).toBeNull();
    // Every copy this clean-up filed carries its source label, even after a kill mid-adoption.
    expect(copy?.metadata.source_url_kind, l.title).toBeTruthy();
  }
  // The imported business is linked to its existing row, not copied again, and that row keeps its own label.
  expect(db.listings.get(s.importedDup.id)?.canonical_listing_id).toBe(s.imported.id);
  expect(db.listings.get(s.imported.id)?.metadata).toEqual({});
  expect(names.filter((n) => n === "Imported Fixture Fencing")).toHaveLength(1);
  // Held, not deleted; a claimed or owner-listed business gets no unclaimed copy.
  const reasons = (l: Listing) => (db.listings.get(l.id)?.metadata.held_from_staff_post as { reasons: string[] } | undefined)?.reasons;
  expect(reasons(s.offTopic)).toEqual(['not a farm trade ("pool")']);
  expect(reasons(s.claimedPost)).toEqual(["the business has been claimed by its owner"]);
  expect(reasons(s.ownerDup)).toEqual(["the business already has its own listing"]);
  expect(names).not.toContain("Claimed Fixture Fencing");
  expect(names).not.toContain("Genuine Owner Fencing");
  // Quote requests end on live rows, none on a closed original.
  expect(db.enquiries.find((e) => e.id === "enq-legacy")?.listing_id).toBe(s.copy.id);
  expect(db.enquiries.find((e) => e.id === "enq-live")?.listing_id).toBe(db.listings.get(s.adoptable[0].id)!.canonical_listing_id);
  expect(db.enquiries).toHaveLength(2);
  // Genuine owner and admin rows untouched; nothing deleted.
  expect([s.genuine, s.adminOwn].map((l) => JSON.stringify(db.listings.get(l.id)))).toEqual(s.untouched);
}

describe("staff-post clean-up run", () => {
  it("dry run plans without a single write", async () => {
    const s = seed();
    const before = s.db.snapshot();
    const clock = { t: 0 };
    const r = await runCleanup(connect(s.db, { clock }), { dry: true, now: () => clock.t });
    expect(s.db.writes).toBe(0);
    expect(s.db.snapshot()).toBe(before);
    expect(r.dry).toBe(true);
    expect(r.plan?.closed_rows_to_clear_contact).toBe(6);
    // It plans exactly the next run's batch: the 10 oldest active posts.
    expect(r.plan?.adopt).toHaveLength(10);
    expect(r.plan?.adopt[0]).toEqual({ title: "Fixture Fencing 01", found_on: "yellow_pages", state: "NSW", links_existing_entry: false });
    // The next batch, in full: it shows the owner-listed and claimed holds and the link the real run will make.
    const all = await runCleanup(connect(s.db, { clock }), { dry: true, now: () => clock.t, limits: { adoptBatch: 50 } });
    expect(s.db.writes).toBe(0);
    expect(all.plan?.hold).toEqual([
      { title: "Fixture Pool Glass Co", reasons: ['not a farm trade ("pool")'] },
      { title: "Claimed Fixture Fencing", reasons: ["the business has been claimed by its owner"] },
      { title: "Genuine Owner Fencing", reasons: ["the business already has its own listing"] },
    ]);
    expect(all.plan?.adopt.filter((a) => a.links_existing_entry).map((a) => a.title)).toEqual(["Imported Fixture Fencing"]);
    expect(JSON.stringify(r)).not.toMatch(/0400 000|example\.test/);
    expect(r.more_work).toBe(true);
    expect(receiptEmail(r, "https://example.test")).toBeNull();
  });

  it("sweeps closed rows first, adopts a small batch, and says more remains", async () => {
    const s = seed();
    const clock = { t: 0 };
    const r = await runCleanup(connect(s.db, { clock }), { dry: false, now: () => clock.t, limits: { adoptBatch: 10 } });
    expect(r.ok).toBe(true);
    expect(r.swept).toEqual({ checked: 6, cleared: 6, already: 0 });
    expect(r.enquiries.moved).toBe(2); // the legacy one, then the live one with its post
    expect(r.adoption.candidates).toBe(10);
    expect(r.adoption.adopted).toBe(10);
    expect(r.remaining).toEqual({ active: 7, closed_with_contact: 0, enquiries_on_closed: 0 });
    expect(r.more_work).toBe(true);
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/0400 000|example\.test/);
    const email = receiptEmail(r, "https://example.test")!;
    expect(email.text).toContain("The next run continues.");
    expect(email.text).not.toMatch(/0400 000|fixture\d+@/);
  });

  it("finishes over several runs and reaches the clean end state", async () => {
    const s = seed();
    const receipts = await drain(s.db, { clock: { t: 0 } });
    expect(receipts.at(-1)!.more_work).toBe(false);
    expect(receipts.every((r) => r.ok)).toBe(true);
    expectClean(s);
    // A further run finds nothing and sends no email.
    const clock = { t: 0 };
    const idle = await runCleanup(connect(s.db, { clock }), { dry: false, now: () => clock.t });
    expect(idle.more_work).toBe(false);
    expect(receiptEmail(idle, "https://example.test")).toBeNull();
  });

  it("makes progress under heavy latency and stops inside its budget with a truthful receipt", async () => {
    const s = seed();
    const clock = { t: 0 };
    // 1.5s per database call (production's 21:30 run hit the 60s limit): budget 40s.
    const r = await runCleanup(connect(s.db, { clock, latencyMs: 1500 }), { dry: false, now: () => clock.t, limits: { budgetMs: 40_000 } });
    expect(r.stopped_by_budget).toBe(true);
    expect(r.more_work).toBe(true);
    expect(r.swept.cleared).toBeGreaterThan(0);
    // It doesn't start an item it can't finish, so the reply fits well within 60s.
    expect(r.elapsed_ms).toBeLessThan(40_000 + 4 * 1500);
    // The receipt counts only what really happened.
    const cleared = [...s.db.listings.values()].filter((l) => l.status === "closed" && l.user_id === STAFF && !l.contact_phone && !l.canonical_listing_id && !l.metadata.held_from_staff_post);
    expect(cleared.length - 0).toBeGreaterThanOrEqual(r.swept.cleared);
    // Repeated slow runs still finish.
    const receipts = await drain(s.db, { clock: { t: 0 }, latencyMs: 1500, limits: { budgetMs: 40_000 } }, 40);
    expect(receipts.at(-1)!.more_work).toBe(false);
    expectClean(s);
  });

  it("says it stopped for time whenever it skipped work for time", async () => {
    for (let latencyMs = 100; latencyMs <= 5000; latencyMs += 100) {
      const s = seed();
      const clock = { t: 0 };
      const r = await runCleanup(connect(s.db, { clock, latencyMs }), { dry: false, now: () => clock.t, limits: { budgetMs: 40_000 } });
      const finishedBatch = r.adoption.processed === Math.min(10, r.adoption.candidates) && r.adoption.candidates > 0;
      if (!finishedBatch) expect(r.stopped_by_budget, `latency ${latencyMs}`).toBe(true);
      expect(r.more_work).toBe(true);
    }
    // The budget running out between phases: a slow enquiry repair leaves no time to adopt.
    const s = seed();
    const clock = { t: 0 };
    const r = await runCleanup(connect(s.db, { clock, slow: { moveEnquiries: 39_000 } }), { dry: false, now: () => clock.t, limits: { budgetMs: 40_000 } });
    expect(r.enquiries.moved).toBe(1);
    expect(r.adoption.candidates).toBe(0);
    expect(r.stopped_by_budget).toBe(true);
    expect(r.more_work).toBe(true);
  });

  it("is safe to kill after any write and run again", async () => {
    const probe = seed();
    await drain(probe.db, { clock: { t: 0 } });
    const totalWrites = probe.db.writes;
    expect(totalWrites).toBeGreaterThan(30);
    for (let k = 0; k < totalWrites; k++) {
      const s = seed();
      const clock = { t: 0 };
      // Killed mid-run: every call after the k-th write throws; the run may report errors.
      await runCleanup(connect(s.db, { clock, killAfterWrites: k }), { dry: false, now: () => clock.t }).catch(() => null);
      await drain(s.db, { clock: { t: 0 } });
      expectClean(s);
    }
  });

  it("two overlapping runs neither duplicate nor overwrite each other", async () => {
    const s = seed();
    const c1 = { t: 0 };
    const c2 = { t: 0 };
    const [a, b] = await Promise.all([
      runCleanup(connect(s.db, { clock: c1, latencyMs: 10 }), { dry: false, now: () => c1.t, limits: { adoptBatch: 20 } }),
      runCleanup(connect(s.db, { clock: c2, latencyMs: 10 }), { dry: false, now: () => c2.t, limits: { adoptBatch: 20 } }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    // Each closed row and each adopted post is counted once across both runs.
    expect(a.swept.cleared + b.swept.cleared).toBe(6);
    expect(a.adoption.adopted + b.adoption.adopted).toBe(14);
    expect(a.adoption.held + b.adoption.held).toBe(3);
    await drain(s.db, { clock: { t: 0 } });
    expectClean(s);
  });

  it("never clears contact it failed to archive, reports the failure, and recovers on the next run", async () => {
    const s = seed();
    const victim = s.legacyClosed[0];
    const target = s.adoptable[0];
    const fault: Fault = (m, arg) => ((m === "archiveContact" && (arg?.id === victim.id || arg?.id === target.id)) ? "insert failed (simulated)" : null);
    const clock = { t: 0 };
    const r = await runCleanup(connect(s.db, { clock, fault }), { dry: false, now: () => clock.t });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => [e.id, e.step])).toEqual([
      [victim.id, "archive"],
      [target.id, "archive"],
    ]);
    expect(r.swept.cleared).toBe(5);
    // The failed rows keep their contact (nothing lost) and the adoptee stays open.
    expect(s.db.listings.get(victim.id)?.contact_phone).toMatch(/^0400 000 /);
    expect(s.db.listings.get(target.id)?.status).toBe("active");
    expect(s.db.enquiries.find((e) => e.id === "enq-live")?.listing_id).toBe(target.id);
    expect(r.adopted_titles).not.toContain(target.title);
    expect(receiptEmail(r, "https://example.test")!.text).toContain("Errors (nothing marked done that wasn't):");
    expect(JSON.stringify(r)).not.toMatch(/0400 000|example\.test/);
    await drain(s.db, { clock: { t: 0 } });
    expectClean(s);
  });

  it("a failed close or enquiry move is an error, not a success", async () => {
    const s = seed();
    const [p1, p2] = s.adoptable;
    const fault: Fault = (m, arg) => (m === "closeAdopted" && arg?.id === p2.id ? "update failed (simulated)" : m === "moveEnquiries" && arg?.id === p1.id ? "update failed (simulated)" : null);
    const clock = { t: 0 };
    const r = await runCleanup(connect(s.db, { clock, fault }), { dry: false, now: () => clock.t });
    expect(r.errors.map((e) => [e.title, e.step])).toEqual([
      [p1.title, "enquiries"],
      [p2.title, "close"],
    ]);
    expect(r.adopted_titles).not.toContain(p1.title);
    expect(r.adopted_titles).not.toContain(p2.title);
    expect(s.db.listings.get(p1.id)?.status).toBe("active");
    await drain(s.db, { clock: { t: 0 } });
    expectClean(s);
  });

  it("a claimed business's post is held, never re-filed over the owner's listing", async () => {
    const s = seed();
    await drain(s.db, { clock: { t: 0 } });
    const held = s.db.listings.get(s.claimedPost.id)!;
    expect(held.status).toBe("closed");
    expect((held.metadata.held_from_staff_post as { reasons: string[] }).reasons).toEqual(["the business has been claimed by its owner"]);
  });

  it("does nothing when there are no staff accounts", async () => {
    const s = seed();
    s.db.profiles = s.db.profiles.filter((p) => !p.is_staff && !p.directory_contributor);
    const before = s.db.snapshot();
    const clock = { t: 0 };
    const r = await runCleanup(connect(s.db, { clock }), { dry: false, now: () => clock.t });
    expect(s.db.snapshot()).toBe(before);
    expect(r.ok).toBe(true);
    expect(receiptEmail(r, "https://example.test")).toBeNull();
  });
});
