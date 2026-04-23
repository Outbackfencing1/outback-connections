type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props) {
  return { title: `${params.slug.replace(/-/g, " ")} – Opportunity` };
}

export default async function OpportunityDetailPage({ params }: Props) {
  const { slug } = params;
  // placeholder details
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <a href="/opportunities" className="text-sm text-gray-600 underline">
        ← Back to opportunities
      </a>
      <h1 className="mt-3 text-2xl font-semibold">
        {slug.replace(/-/g, " ")}
      </h1>
      <p className="mt-2 text-gray-700">
        This is a placeholder detail page for <code>{slug}</code>. We’ll wire real data after Supabase actions.
      </p>
    </main>
  );
}
