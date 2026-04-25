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
      {/* Hero — single primary CTA, supporting actions in smaller text. */}
      <section className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl md:text-5xl">
          Jobs, freight, and the bloke who&apos;s handy with a bore pump.
        </h1>
        <p className="mt-5 text-base text-neutral-700 sm:text-lg">
          Free rural marketplace. No lead fees ever.
        </p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/services"
            className="inline-flex items-center justify-center rounded-xl bg-green-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-green-800 focus:ring-offset-2"
          >
            Browse listings
          </Link>
          <p className="text-sm text-neutral-700">
            Or{" "}
            <Link href="/post" className="font-medium text-green-800 underline">
              post a listing
            </Link>{" "}
            — free, takes 3 minutes.
          </p>
        </div>
        <p className="mt-4 text-xs text-neutral-500">
          Run by{" "}
          <a
            href="https://outbackfencing.com.au"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Outback Fencing &amp; Steel Supplies
          </a>
          .
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

      {/* Three pillars — user-mindset CTAs, not category labels. */}
      <section className="mx-auto max-w-6xl px-4 pb-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          <PillarCard
            href="/services"
            icon={<WrenchIcon />}
            heading="I need a tradie or specialist"
            blurb="Bore pumps, mustering, shearing, welding — the rural specialists."
            cta="Browse services"
          />
          <PillarCard
            href="/post"
            icon={<HammerIcon />}
            heading="I&rsquo;ve got work that needs doing"
            blurb="Post a job — station hands, harvest, fencing, dairy, truckies."
            cta="Post a job"
          />
          <PillarCard
            href="/freight"
            icon={<TruckIcon />}
            heading="I need freight moved"
            blurb="Livestock, hay, grain, machinery. No brokers, no cut."
            cta="Browse freight"
          />
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

function PillarCard({
  href,
  icon,
  heading,
  blurb,
  cta,
}: {
  href: string;
  icon: React.ReactNode;
  heading: React.ReactNode;
  blurb: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md sm:p-6"
    >
      <div
        aria-hidden="true"
        className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-800"
      >
        {icon}
      </div>
      <h2 className="text-lg font-bold leading-tight text-neutral-900">
        {heading}
      </h2>
      <p className="mt-2 text-sm text-neutral-700">{blurb}</p>
      <p className="mt-4 text-sm font-medium text-green-800">{cta} →</p>
    </Link>
  );
}

function WrenchIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function HammerIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 12-8.5 8.5a2.12 2.12 0 1 1-3-3L12 9" />
      <path d="M17.64 15 22 10.64" />
      <path d="m20.91 11.7-1.25-1.25c-.6-.6-.93-1.4-.93-2.25v-.86L16.01 4.6a5.56 5.56 0 0 0-3.94-1.64H9l.92.82A6.18 6.18 0 0 1 12 8.4v1.56l2 2h2.47l2.26 1.91" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </svg>
  );
}
