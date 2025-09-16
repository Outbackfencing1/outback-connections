// app/c/[handle]/page.tsx
import { notFound } from "next/navigation";

type RouteParams = { handle: string };

export default async function ContractorPage(
  { params }: { params: RouteParams }
) {
  const { handle } = params;

  // Example: fetch contractor/profile by "handle"
  // const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/contractors/${handle}`, { cache: 'no-store' });
  // if (!res.ok) notFound();
  // const data = await res.json();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-green-700">Contractor: {handle}</h1>
      {/* render profile here */}
    </main>
  );
}

// If you don't fetch and want a sync component, remove `async` — both forms are fine:
// export default function ContractorPage({ params }: { params: RouteParams }) { ... }
