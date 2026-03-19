import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props) {
  const { handle } = await params;
  return { title: `${handle} – Outback Connections` };
}

export default async function ContractorPublicPage({ params }: Props) {
  const { handle } = await params;
  const supa = supabaseServer();

  if (!supa) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-xl border bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-green-700">{handle}</h1>
          <p className="mt-2 text-neutral-600">Contractor profiles are coming soon.</p>
        </div>
      </main>
    );
  }

  const { data: profile } = await supa
    .from("profiles")
    .select("*")
    .eq("handle", handle)
    .single();

  if (!profile) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-xl border bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-neutral-900">Contractor not found</h1>
          <p className="mt-2 text-neutral-600">
            No contractor with the handle &quot;{handle}&quot; exists.
          </p>
          <Link
            href="/opportunities"
            className="mt-4 inline-block rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 transition"
          >
            Browse opportunities
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-xl border bg-white p-6 sm:p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-green-700">
          {profile.company || handle}
        </h1>

        {profile.bio && (
          <p className="mt-3 text-neutral-700 leading-relaxed">{profile.bio}</p>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {profile.abn && (
            <Detail label="ABN" value={profile.abn} />
          )}
          {profile.rate_type && (
            <Detail
              label="Rate"
              value={`$${profile.rate_amount}/${profile.rate_type === "hourly" ? "hr" : "day"}`}
            />
          )}
          {profile.licence && (
            <Detail label="Licence" value={profile.licence} />
          )}
          {profile.insured && (
            <Detail
              label="Insurance"
              value={profile.insurance_exp ? `Insured until ${profile.insurance_exp}` : "Insured"}
            />
          )}
        </div>

        {(profile.skills ?? []).length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Fencing Skills
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {profile.skills.map((s: string) => (
                <span
                  key={s}
                  className="rounded-full bg-green-50 border border-green-200 px-3 py-1 text-sm font-medium text-green-800"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {(profile.service_areas ?? []).length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Service Areas
            </h2>
            <p className="mt-1 text-neutral-700">{profile.service_areas.join(", ")}</p>
          </div>
        )}

        {(profile.portfolio ?? []).length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Portfolio
            </h2>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {profile.portfolio.map((url: string) => (
                <img
                  key={url}
                  src={url}
                  alt="Portfolio"
                  className="rounded-lg border object-cover h-48 w-full"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-neutral-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{label}</div>
      <div className="mt-1 font-medium text-neutral-800">{value}</div>
    </div>
  );
}
