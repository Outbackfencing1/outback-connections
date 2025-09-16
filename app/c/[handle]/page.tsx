import { prisma } from "@/lib/prisma";
import Image from "next/image";

export default async function PublicContractorPage({ params }: { params: { handle: string } }) {
  const user = await prisma.user.findFirst({
    where: { handle: params.handle },
    include: { contractor: true },
  });

  if (!user || !user.contractor) {
    return <div className="p-6">Contractor not found.</div>;
  }

  const c = user.contractor;

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-semibold">{c.company}</h1>
      <div className="text-sm text-neutral-600">@{user.handle}</div>

      {c.bio && <p className="leading-7">{c.bio}</p>}

      <div className="grid grid-cols-2 gap-4">
        <Info label="Areas" value={(c.serviceAreas ?? []).join(", ")} />
        <Info label="Skills" value={(c.skills ?? []).join(", ")} />
        {c.rateType && <Info label="Rate" value={`${c.rateType} ${c.rateAmount ?? ""}`} />}
        {c.licence && <Info label="Licence" value={c.licence} />}
        <Info label="Insured" value={c.insured ? "Yes" : "No"} />
      </div>

      {!!c.portfolio?.length && (
        <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {c.portfolio.map((src, i) => (
            <div key={i} className="relative aspect-video rounded-xl overflow-hidden border">
              {/* next/image requires allowed domains in next.config if remote */}
              <Image src={src} alt={`Portfolio ${i+1}`} fill className="object-cover" />
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

function Info({ label, value }: { label: string; value?: string | number | null }) {
  if (!value) return null;
  return (
    <div className="border rounded-xl p-3">
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
