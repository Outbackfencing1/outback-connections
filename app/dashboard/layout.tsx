export const metadata = {
  title: "Dashboard – OutbackConnections",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Dashboard</h1>
      <div className="rounded-2xl border bg-white p-4 shadow-sm">{children}</div>
    </section>
  );
}
