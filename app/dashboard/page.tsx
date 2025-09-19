import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  // Require a signed-in session
  const session = await auth();
  if (!session) {
    redirect("/login?callbackUrl=/dashboard");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-neutral-600">
        You are signed in as{" "}
        <span className="font-medium">{session.user?.email}</span>.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-700">Quick links</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-neutral-700">
            <li><a className="underline" href="/post-a-job">Post a job</a></li>
            <li><a className="underline" href="/opportunities">Find opportunities</a></li>
            <li><a className="underline" href="/profile">Edit profile</a></li>
          </ul>
        </section>

        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-neutral-700">Session (debug)</h2>
          <pre className="mt-2 overflow-auto rounded-lg bg-neutral-50 p-3 text-xs leading-5">
{JSON.stringify(session, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  );
}
