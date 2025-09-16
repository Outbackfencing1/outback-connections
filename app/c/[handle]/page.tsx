// app/c/[handle]/page.tsx
// No PageProps imports in this file.

type Params = { handle: string };
type Props = { params: Promise<Params> };

export default async function ContractorPage({ params }: Props) {
  const { handle } = await params;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-green-700">Contractor: {handle}</h1>
      <p className="mt-2 text-neutral-700">Profile page coming soon.</p>
    </main>
  );
}
