// app/c/[handle]/page.tsx

type Props = {
  params: {
    handle: string;
  };
};

export default function ContractorPage({ params }: Props) {
  const { handle } = params;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-green-700">Contractor: {handle}</h1>
      <p className="mt-2 text-neutral-700">Profile page coming soon.</p>
    </main>
  );
}
