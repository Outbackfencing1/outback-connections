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
        <h1 className="text-2xl font-bold text-green-700">{handle}</h1>
        <p className="mt-2 text-neutral-700">Profile page coming soon.</p>
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
        <h1 className="text-2xl font-bold text-neutral-800">Contractor not found</h1>
        <p className="mt-2 text-neutral-600">
          No contractor with the handle &quot;{handle}&quot; exists.
        </p>
        <Link href="/opportunities" className="mt-4 inline-block text-green-700 underline">
          Browse opportunities
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-green-700">
        {profile.company || handle}
      </h1>

      {profile.bio && (
        <p className="mt-3 text-neutral-700">{profile.bio}</p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Skills</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {profile.skills.map((s: string) => (
              <span key={s} className="rounded-full border px-3 py-1 text-sm">{s}</span>
            ))}
          </div>
        </div>
      )}

      {(profile.service_areas ?? []).length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Service Areas</h2>
          <p className="mt-1 text-neutral-700">{profile.service_areas.join(", ")}</p>
        </div>
      )}

      {(profile.portfolio ?? []).length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">Portfolio</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {profile.portfolio.map((url: string) => (
              <img
                key={url}
                src={url}
                alt="Portfolio"
                className="rounded-xl border object-cover h-48 w-full"
              />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-neutral-800">{value}</div>
    </div>
  );
}
