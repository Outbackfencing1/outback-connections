import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Outback Connections — rural Australia's free marketplace",
  description:
    "Jobs, freight, and the bloke who's handy with a bore pump. A free rural marketplace — no lead fees, no rip-offs, direct contact between parties.",
};

export const dynamic = "force-dynamic";

async function getLiveStats() {
  const supabase = createClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  const [active, recent, postcodes] = await Promise.all([
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gt("expires_at", nowIso),
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gt("expires_at", nowIso)
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("listings")
      .select("postcode")
      .eq("status", "active")
      .gt("expires_at", nowIso),
  ]);

  const distinctPostcodes = new Set((postcodes.data ?? []).map((r) => r.postcode))
    .size;

  return {
    active: active.count ?? 0,
    recent: recent.count ?? 0,
    postcodes: distinctPostcodes,
  };
}

export default async function HomePage() {
  const stats = await getLiveStats();
  const showStats = stats.active >= 10;

  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl md:text-5xl">
          Jobs, freight, and the bloke who&apos;s handy with a bore pump.
        </h1>
        <p className="mt-5 text-base text-neutral-700 sm:text-lg">
          Rural Australia&apos;s free marketplace — no lead fees, no
          rip-offs, just direct contact.
        </p>
      </section>

      {/* Live stats (item 12). Hidden if active count < 10 — never show
          fake numbers. */}
      {showStats && (
        <section className="mx-auto max-w-3xl px-4 pb-2">
          <p className="text-sm text-neutral-700">
            <strong>{stats.active.toLocaleString("en-AU")}</strong> active
            listing{stats.active === 1 ? "" : "s"}.{" "}
            <strong>{stats.recent.toLocaleString("en-AU")}</strong> new
            this week.{" "}
            <strong>{stats.postcodes.toLocaleString("en-AU")}</strong>{" "}
            postcode{stats.postcodes === 1 ? "" : "s"} covered.
          </p>
        </section>
      )}

      {/* Three pillars: Services is the hero card, Jobs + Freight below. */}
      <section className="mx-auto max-w-6xl px-4 pb-6 sm:px-6 lg:px-8">
        <Link
          href="/services"
          className="block rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:border-green-700 hover:shadow-md sm:p-8"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
                Services
              </p>
              <h2 className="mt-1 text-2xl font-bold text-neutral-900 sm:text-3xl">
                Find a bloke who can actually do the job
              </h2>
              <p className="mt-3 text-sm text-neutral-700 sm:text-base">
                Bore pump specialists, helicopter mustering, drone spraying,
                mobile diesel mechanics, contract croppers, shearing teams,
                welders. The rural specialists nobody else indexes.
              </p>
            </div>
            <span
              aria-hidden="true"
              className="shrink-0 text-2xl text-neutral-400"
            >
              →
            </span>
          </div>
        </Link>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Link
            href="/jobs"
            className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md sm:p-6"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
              Jobs
            </p>
            <h2 className="mt-1 text-xl font-bold text-neutral-900">
              Post rural work, find rural hands
            </h2>
            <p className="mt-2 text-sm text-neutral-700">
              Station hands, shearers, fencing labour, harvest, mustering,
              dairy, truckies. Free to post, free to reach out.
            </p>
            <p className="mt-3 text-sm font-medium text-green-800">
              Browse jobs →
            </p>
          </Link>

          <Link
            href="/freight"
            className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md sm:p-6"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
              Freight
            </p>
            <h2 className="mt-1 text-xl font-bold text-neutral-900">
              Move livestock, hay, grain, machinery
            </h2>
            <p className="mt-2 text-sm text-neutral-700">
              Farmers posting what needs moving; truckies posting available
              runs. No brokers, no cut, no mark-up.
            </p>
            <p className="mt-3 text-sm font-medium text-green-800">
              Browse freight →
            </p>
          </Link>
        </div>
      </section>

      {/* Post a listing */}
      <section className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center sm:p-8">
          <h2 className="text-xl font-bold text-neutral-900 sm:text-2xl">
            Got a job, a truck, or a service to offer?
          </h2>
          <p className="mt-2 text-sm text-neutral-700 sm:text-base">
            Takes a few minutes. Free forever.
          </p>
          <Link
            href="/post"
            className="mt-4 inline-block rounded-xl bg-green-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
          >
            Post a listing
          </Link>
          <p className="mt-3 text-xs text-neutral-600">
            You&apos;ll need to sign in first. No passwords — just a link to
            your email.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="text-xl font-bold text-neutral-900 sm:text-2xl">
          How it works
        </h2>
        <ol className="mt-4 space-y-3 text-neutral-800">
          <li className="flex gap-3">
            <span className="shrink-0 font-bold text-green-800">1.</span>
            <span>
              <strong>Sign in to post.</strong> Email magic link — no
              password to remember.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 font-bold text-green-800">2.</span>
            <span>
              <strong>Browse freely.</strong> No account needed to look
              around.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 font-bold text-green-800">3.</span>
            <span>
              <strong>Contact each other directly.</strong> No middleman,
              no messaging system, no lead fees. Sign in to see contact
              details.
            </span>
          </li>
        </ol>
      </section>

      {/* What we don't do */}
      <section className="mx-auto max-w-3xl px-4 py-8">
        <h2 className="text-xl font-bold text-neutral-900 sm:text-2xl">
          What we don&apos;t do
        </h2>
        <ul className="mt-4 space-y-2 text-neutral-800">
          <li>
            <strong>No lead fees.</strong> Not now, not ever. Other sites
            charge tradies $20–30 per lead whether they win or not. Not
            here.
          </li>
          <li>
            <strong>No paid placement.</strong> No featured listings,
            nobody pays to rise in search.
          </li>
          <li>
            <strong>No reviews or star ratings.</strong> It&apos;s too
            easy to fake, too easy to defame, and we&apos;re not running
            a trust-and-safety team. Maybe later, properly.
          </li>
          <li>
            <strong>No messaging system.</strong> Direct email or phone
            contact — that&apos;s it.
          </li>
          <li>
            <strong>No spam.</strong> Sign-in is email-only. Listings
            auto-expire at 30 days so stale ones fall off.
          </li>
        </ul>
      </section>

      {/* COI */}
      <section className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-neutral-700">
          <strong>Upfront:</strong> Outback Connections is run by{" "}
          <a
            href="https://outbackfencing.com.au"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Outback Fencing &amp; Steel Supplies Pty Ltd
          </a>
          , a rural fencing manufacturer. We built this because rural
          Australia deserves a decent marketplace. We disclose who we are
          upfront, on every page.
        </p>
      </section>
    </div>
  );
}
