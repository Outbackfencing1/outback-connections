// app/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Outback Connections | Fencing Contractors & Rural Jobs",
  description:
    "Australia's marketplace for fencing contractors. Post fencing jobs, find qualified contractors, and get rural work done.",
};

export default function HomePage() {
  return (
    <main>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Hero */}
        <section className="py-12 sm:py-16 md:py-24">
          <div className="mx-auto max-w-3xl lg:max-w-5xl">
            <div className="inline-block rounded-full bg-green-50 border border-green-200 px-4 py-1.5 text-sm font-medium text-green-800 mb-6">
              Built for rural Australia
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-neutral-900 [text-wrap:balance]">
              Find fencing contractors.{" "}
              <span className="text-green-700">Get the job done.</span>
            </h1>

            <p className="mt-5 text-base sm:text-lg md:text-xl text-neutral-600 max-w-2xl [text-wrap:pretty]">
              Outback Connections is the marketplace for fencing work across rural
              and regional Australia. Post a job, get quotes from qualified
              contractors, and hire with confidence.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href="/post-a-job"
                className="w-full sm:w-auto rounded-full px-6 py-3.5 text-center bg-green-700 text-white font-semibold hover:bg-green-800 transition shadow-sm"
              >
                Post a fencing job
              </Link>
              <Link
                href="/opportunities"
                className="w-full sm:w-auto rounded-full px-6 py-3.5 text-center border border-neutral-300 font-semibold text-neutral-700 hover:bg-neutral-50 transition"
              >
                Browse opportunities
              </Link>
            </div>

            <p className="mt-4 text-sm text-neutral-500">
              Powered by{" "}
              <a
                href="https://outbackfencing.com.au"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-4 hover:text-green-700"
              >
                Outback Fencing &amp; Steel Supplies
              </a>
              {" "}&mdash; Orange, NSW.
            </p>
          </div>
        </section>

        {/* Stats bar */}
        <section className="pb-12 sm:pb-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Fencing types" value="All" />
            <Stat label="Service areas" value="Nationwide" />
            <Stat label="Post a job" value="Free" />
            <Stat label="Get quotes" value="Fast" />
          </div>
        </section>

        {/* What we cover */}
        <section className="pb-12 sm:pb-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
            Every type of fencing work
          </h2>
          <p className="mt-2 text-neutral-600 max-w-2xl">
            Whether you need a boundary rebuilt or a new set of cattle yards, find
            contractors who specialise in the work you need.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <ServiceCard
              title="Boundary fencing"
              body="Post & rail, hinge joint, plain wire, and barbed wire boundary runs for properties of any size."
            />
            <ServiceCard
              title="Stock yards & cattle yards"
              body="Steel and timber yard construction, crush installations, loading ramps, and yard repairs."
            />
            <ServiceCard
              title="Electric fencing"
              body="Energiser installs, electric tape & poly setups, and strip-grazing systems for rotational management."
            />
            <ServiceCard
              title="Post driving & strainer assembly"
              body="Star pickets, timber posts, concrete strainers, and end assemblies across all terrain."
            />
            <ServiceCard
              title="Gate installation"
              body="Farm gates, cattle grids, swing gates, and automated entry systems for driveways and paddocks."
            />
            <ServiceCard
              title="Fence repairs & maintenance"
              body="Storm damage, flood recovery, roo damage, and general wear-and-tear repairs and re-straining."
            />
          </div>
        </section>

        {/* Value bullets */}
        <section className="pb-12 sm:pb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            <Feature
              title="Local contractors"
              body="Connect with fencing contractors in your region. No middlemen, no city-based agencies."
            />
            <Feature
              title="Fair &amp; transparent"
              body="Clear job descriptions, upfront pricing, and direct communication between landholders and contractors."
            />
            <Feature
              title="Built for the bush"
              body="Designed by people who understand rural work. Fast, simple, and built to work on patchy mobile signal."
            />
          </div>
        </section>

        {/* Secondary CTA */}
        <section className="pb-16 sm:pb-24">
          <div className="rounded-2xl bg-green-700 p-8 sm:p-10 md:p-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 md:gap-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Ready to get your fence sorted?
              </h2>
              <p className="mt-2 text-green-100">
                Post a job in under 2 minutes. It&apos;s free to get started.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/post-a-job"
                className="rounded-full px-6 py-3 text-center bg-white text-green-800 font-semibold hover:bg-green-50 transition shadow-sm"
              >
                Post a job
              </Link>
              <Link
                href="/pricing"
                className="rounded-full px-6 py-3 text-center border border-green-500 text-white font-semibold hover:bg-green-600 transition"
              >
                See pricing
              </Link>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 text-center shadow-sm">
      <div className="text-lg font-bold text-green-700">{value}</div>
      <div className="mt-1 text-sm text-neutral-600">{label}</div>
    </div>
  );
}

function ServiceCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm hover:border-green-300 transition">
      <h3 className="font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{body}</p>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border bg-white p-5 md:p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 text-neutral-600 text-sm sm:text-base leading-relaxed">{body}</p>
    </div>
  );
}
