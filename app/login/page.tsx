// app/login/page.tsx
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-green-700">Login</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Temporary mock form — swap for real auth (Clerk, Supabase, or Shopify App Bridge) later.
        </p>

        <form className="mt-6 space-y-4">
          {/* Email */}
          <div>
            <input
              type="email"
              placeholder="Email"
              className="w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-green-600 focus:outline-none"
            />
          </div>

          {/* Password */}
          <div>
            <input
              type="password"
              placeholder="Password"
              className="w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-green-600 focus:outline-none"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full rounded-lg bg-green-700 py-2 text-white font-semibold shadow-sm hover:bg-green-800"
          >
            Sign in
          </button>
        </form>

        {/* Back to home link */}
        <div className="mt-4 text-center">
          <Link
            href="/"
            className="text-sm text-neutral-600 hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
