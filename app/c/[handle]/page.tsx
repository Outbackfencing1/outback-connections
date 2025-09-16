// app/c/[handle]/page.tsx
import { notFound } from "next/navigation";
// import type { PageProps } from "next"; // ❌ remove any PageProps import

type Params = { handle: string };
type Props = { params: Params; searchParams?: Record<string, string | string[] | undefined> };

export default function ContractorPage({ params }: Props) {
  const { handle } = params;

  // Example fetch if/when you add data:
  // const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/contractors/${handle}`, { cache: "no-store" });
  // if (!res.ok) notFound();
  // const data = await res.json();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-green-700">Contractor: {handle}</h1>
      <p className="mt-2 text-neutral-700">Profile page coming soon.</p>
    </main>
  );
}

// If you later add this, type it the same explicit way (no PageProps):
// export async function generateMetadata({ params }: Props): Promise<Metadata> { ... }
