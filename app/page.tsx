// app/page.tsx
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";

export const metadata = {
  title: "Outback Connections | Fencing Contractors & Rural Jobs",
  description:
    "Find fencing contractors across rural Australia. Post jobs, get quotes, and connect with experienced fencing professionals.",
};

async function getLiveStats() {
  const supa = supabaseServer();
  if (!supa) return { profiles: 0, jobs: 0, active: 0 };

  const [profilesRes, jobsRes, activeRes] = await Promise.all([
    supa.from("profiles").select("*", { count: "exact", head: true }),
    supa.from("jobs").select("*", { count: "exact", head: true }),
    supa.from("customer_activities").select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  return {
    profiles: profilesRes.count ?? 0,
    jobs: jobsRes.count ?? 0,
    active: activeRes.count ?? 0,
  };
}

export default async function HomePage() {
  const stats = await getLiveStats();

  return (
    <main>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-[#1a3a0a] via-[#2D5016] to-[#1a2e0a] overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M0%200h60v60H0z%22%20fill%3D%22none%22%2F%3E%3Cpath%20d%3D%22M30%200v60M0%2030h60%22%20stroke%3D%22rgba(255%2C255%2C255%2C0.03)%22%20stroke-width%3D%221%22%2F%3E%3C%2Fsvg%3E')] opacity-50" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-20 md:py-28">
          <div className="max-w-3xl">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
              Find Fencing Contractors.{" "}
              <span className="text-amber-400">Get the Job Done.</span>
            </h1>
            <p className="mt-5 text-lg sm:text-xl text-white/80 max-w-xl">
              Connect with experienced fencing contractors across rural Australia.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href="/post-a-job"
                className="w-full sm:w-auto rounded-lg px-6 py-3.5 text-center bg-amber-500 text-neutral-900 font-semibold hover:bg-amber-400 transition shadow-lg shadow-amber-500/20"
              >
                Post a Job
              </Link>
              <Link
                href="/opportunities"
                className="w-full sm:w-auto rounded-lg px-6 py-3.5 text-center border border-white/30 text-white font-semibold hover:bg-white/10 transition"
              >
                Find Contractors
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="bg-neutral-100 border-b border-neutral-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <TrustItem icon={<ShieldIcon />} label="Verified IDs" />
            <TrustItem icon={<StarIcon />} label="Transparent reviews" />
            <TrustItem icon={<DocIcon />} label="Simple quotes" />
            <TrustItem icon={<MapIcon />} label="Built for rural" />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Live stats */}
        <section className="py-8">
          <div className="grid grid-cols-3 gap-4">
            <LiveStat label="Contractors Registered" value={stats.profiles} />
            <LiveStat label="Jobs Posted" value={stats.jobs} />
            <LiveStat label="Active This Week" value={stats.active} />
          </div>
        </section>

        {/* Service categories */}
        <section className="pb-12 sm:pb-16">
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">
            Top Services
          </h2>
          <p className="mt-2 text-neutral-600">
            Find contractors who specialise in the fencing work you need.
          </p>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <ServiceCard
              title="Boundary Fencing"
              body="Hinge joint, plain wire, barbed wire, and post & rail boundary runs for properties of any size."
            />
            <ServiceCard
              title="Cattle Yards"
              body="Steel and timber yard construction, crush installations, loading ramps, and repairs."
            />
            <ServiceCard
              title="Sheep Yards"
              body="Portable and permanent sheep yard setups, drafting races, and handling systems."
            />
            <ServiceCard
              title="Electric Fencing"
              body="Energiser installs, poly setups, and strip-grazing systems for rotational management."
            />
            <ServiceCard
              title="Post &amp; Rail"
              body="Timber and steel post & rail for paddocks, driveways, horse properties, and lifestyle blocks."
            />
            <ServiceCard
              title="Repairs &amp; Maintenance"
              body="Storm damage, flood recovery, roo damage, and general wear-and-tear repairs."
            />
          </div>
        </section>

        {/* Value props */}
        <section className="pb-12 sm:pb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Feature
              title="Local contractors"
              body="Connect directly with fencing contractors in your region. No middlemen."
            />
            <Feature
              title="Fair &amp; transparent"
              body="Clear job descriptions, upfront pricing, and direct communication."
            />
            <Feature
              title="Built for the bush"
              body="Fast, simple, and designed to work on patchy mobile signal."
            />
          </div>
        </section>

        {/* CTA */}
        <section className="pb-16 sm:pb-20">
          <div className="rounded-xl bg-[#2D5016] p-8 sm:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl font-bold text-white">
                Ready to get your fence sorted?
              </h2>
              <p className="mt-1.5 text-white/70">
                Post a job in under 2 minutes. Free to get started.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/post-a-job"
                className="rounded-lg px-6 py-3 text-center bg-amber-500 text-neutral-900 font-semibold hover:bg-amber-400 transition"
              >
                Post a Job
              </Link>
              <Link
                href="/pricing"
                className="rounded-lg px-6 py-3 text-center border border-white/30 text-white font-semibold hover:bg-white/10 transition"
              >
                See Pricing
              </Link>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}

/* ---------- Sub-components ---------- */

function LiveStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 text-center shadow-sm">
      <p className="text-2xl font-bold text-neutral-900">{value > 0 ? value.toLocaleString("en-AU") : "\u2014"}</p>
      <p className="mt-1 text-xs font-medium text-neutral-500">{label}</p>
    </div>
  );
}

function TrustItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="text-[#2D5016]">{icon}</div>
      <span className="text-sm font-medium text-neutral-700">{label}</span>
    </div>
  );
}

function ServiceCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm hover:border-[#2D5016]/40 hover:shadow-md transition">
      <h3 className="font-semibold text-neutral-900">{title}</h3>
      <p className="mt-1.5 text-sm text-neutral-600 leading-relaxed">{body}</p>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-neutral-900">{title}</h3>
      <p className="mt-1.5 text-sm text-neutral-600 leading-relaxed">{body}</p>
    </div>
  );
}

/* ---------- SVG Icons ---------- */

function ShieldIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}
