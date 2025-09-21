import { auth, signIn } from "@/auth";

export default async function DashboardHome() {
  const session = await auth();

  if (!session) {
    async function login() {
      "use server";
      await signIn("google");
    }

    return (
      <div className="space-y-4">
        <p className="text-gray-700">You need to sign in to access the dashboard.</p>
        <form action={login}>
          <button
            type="submit"
            className="rounded-xl border px-4 py-2 font-medium shadow-sm transition hover:bg-gray-50"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-4">
        <p className="text-gray-600">Welcome back,</p>
        <p className="text-lg font-medium">{session.user?.name ?? "there"} 👋</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <a
          href="/dashboard/post-a-job"
          className="rounded-xl border p-5 shadow-sm transition hover:bg-gray-50"
        >
          <h2 className="font-semibold">Post a Job</h2>
          <p className="mt-1 text-sm text-gray-500">
            Create a new job listing (placeholder form – no DB required yet).
          </p>
        </a>

        <a
          href="/dashboard/opportunities"
          className="rounded-xl border p-5 shadow-sm transition hover:bg-gray-50"
        >
          <h2 className="font-semibold">Opportunities</h2>
          <p className="mt-1 text-sm text-gray-500">
            Browse sample opportunities (static data for now).
          </p>
        </a>
      </div>
    </div>
  );
}
