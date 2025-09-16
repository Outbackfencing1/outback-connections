import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="space-y-10 sm:space-y-14">
      {/* Hero */}
      <section className="grid items-center gap-5 sm:gap-8 rounded-2xl border bg-white p-5 sm:p-8 shadow-sm md:grid-cols-2">
        <div className="space-y-4 sm:space-y-6">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black leading-tight tracking-tight text-green-800">
            Find trusted contractors. Get farm jobs done with OutbackConnections.
          </h1>
          <p className="max-w-prose text-base sm:text-lg text-neutral-700">
            Post a job in minutes and receive quotes. Contractors start free and only pay after real value is delivered.
          </p>

          {/* CTAs: full width on mobile */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Link
              href="/post-a-job"
              className="w-full sm:w-auto rounded-2xl bg-green-700 px-5 py-3 text-base font-semibold text-white text-center hover:bg-green-800"
            >
              Post a Job (Free)
            </Link>
            <a
              href="#contractors"
              className="w-full sm:w-auto rounded-2xl border px-5 py-3 text-base font-semibold text-center hover:bg-neutral-50"
            >
              I’m a Contractor
            </a>
          </div>

          <ul className="mt-2 grid gap-2 sm:gap-3 text-sm text-neutral-600 sm:grid-cols-2">
            <li>• No platform fee for farmers</li>
            <li>• Contractors start free up to $1k job value*</li>
            <li>• In-app quoting & invoicing</li>
            <li>• Fair leads, no bidding wars</li>
          </ul>
          <p className="text-xs text-neutral-500">* Example threshold; adjustable in pricing.</p>
        </div>

        {/* Simple illustration block (kept short for mobile) */}
        <div className="rounded-2xl border bg-neutral-50 p-4 sm:p-6">
          <div className="space-y-3">
            <div className="h-3 w-24 rounded bg-neutral-200" />
            <div className="h-4 w-40 rounded bg-neutral-200" />
            <div className="h-24 rounded-xl bg-neutral-200" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-16 rounded-lg bg-neutral-200" />
              <div className="h-16 rounded-lg bg-neutral-200" />
            </div>
            <div className="h-28 sm:h-32 rounded-xl bg-neutral-200" />
          </div>
        </div>
      </section>

      {/* Farmers vs Contractors */}
      <section id="audiences" className="grid gap-4 sm:gap-6 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5 sm:p-6 shadow-sm">
          <h2 className="text-lg sm:text-xl font-extrabold text-neutral-900">For Farmers</h2>
          <ul className="mt-3 space-y-2 text-neutral-700 text-sm sm:text-base">
            <li>• Post a job with photos and location</li>
            <li>• Compare contractor profiles and quotes</li>
            <li>• Pay securely after work milestones</li>
          </ul>
          <Link
            href="/post-a-job"
            className="mt-4 inline-block w-full sm:w-auto rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white text-center hover:bg-green-800"
          >
            Post a Job
          </Link>
        </div>

        <div id="contractors" className="rounded-2xl border bg-white p-5 sm:p-6 shadow-sm">
          <h2 className="text-lg sm:text-xl font-extrabold text-neutral-900">For Contractors</h2>
          <ul className="mt-3 space-y-2 text-neutral-700 text-sm sm:text-base">
            <li>• Start free until you earn real value</li>
            <li>• Lead inbox, quotes, and invoicing</li>
            <li>• Build reputation with verified reviews</li>
          </ul>
          <Link
            href="/contractor"
            className="mt-4 inline-block w-full sm:w-auto rounded-xl border px-4 py-2 text-sm font-semibold text-center hover:bg-neutral-50"
          >
            Open Dashboard
          </Link>
        </div>
      </section>

      {/* Highlights */}
      <section className="rounded-2xl border bg-white p-5 sm:p-6 shadow-sm">
        <h3 className="text-base sm:text-lg font-extrabold">Why OutbackConnections?</h3>
        <div className="mt-3 sm:mt-4 grid gap-3 sm:gap-4 md:grid-cols-3">
          {[
            { title: "Fair to Contractors", desc: "Free until you’ve earned; simple, transparent pricing after." },
            { title: "Fast for Farmers", desc: "Post once, reach multiple local pros. Approve milestones, pay after results." },
            { title: "Rural-Ready", desc: "Built for ag jobs, remote sites, and bad reception realities." },
          ].map((c) => (
            <div key={c.title} className="rounded-xl border p-4">
              <div className="text-sm sm:text-base font-bold">{c.title}</div>
              <div className="mt-1 text-xs sm:text-sm text-neutral-700">{c.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
