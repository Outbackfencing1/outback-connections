// app/dashboard/opportunities/[slug]/loading.tsx
export default function LoadingJob() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="animate-pulse space-y-4">
        <div className="h-4 w-40 rounded bg-gray-200" />
        <div className="h-8 w-2/3 rounded bg-gray-200" />
        <div className="h-5 w-1/3 rounded bg-gray-200" />
        <div className="mt-4 h-48 w-full rounded-2xl bg-gray-200" />
      </div>
    </main>
  );
}
