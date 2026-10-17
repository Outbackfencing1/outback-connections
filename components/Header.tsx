// components/Header.tsx — server component.
// Reads auth server-side so the nav can show "Sign in" or "Dashboard +
// Sign out" without needing client-side hydration.
// Mobile nav is a plain stacked list (no hamburger, no JS) — better for
// patchy signal and zero-JS clients.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/dashboard/actions";

const primaryLinks: { href: string; label: string }[] = [
  { href: "/services", label: "Services" },
  { href: "/jobs", label: "Work & Skills" },
  { href: "/sale", label: "Livestock & Harvest" },
  { href: "/freight", label: "Freight" },
];

export default async function Header() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const signedIn = !!data.user;
  const links = primaryLinks;

  return (
    <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="shrink-0 text-base font-extrabold leading-tight text-green-800 sm:text-lg"
          >
            Outback Connections
          </Link>

          <nav className="hidden items-center gap-2.5 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded px-2 py-2 text-sm font-medium text-neutral-800 hover:text-green-800"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/post/job?direction=available_for_work"
              className="rounded-lg border border-green-700 bg-white px-3 py-1.5 text-sm font-semibold text-green-800 hover:bg-green-50"
            >
              List your skills
            </Link>
            <Link
              href="/post"
              className="rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
            >
              Post a listing
            </Link>
            {signedIn ? (
              <>
                <Link
                  href="/dashboard"
                  className="rounded px-2 py-2 text-sm font-medium text-neutral-800 hover:text-green-800"
                >
                  Dashboard
                </Link>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="rounded px-2 py-2 text-sm font-medium text-neutral-800 hover:text-green-800"
                  >
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link
                href="/signin"
                className="rounded px-2 py-2 text-sm font-medium text-neutral-800 hover:text-green-800"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>

        {/* Mobile nav: stacked, always visible. No JS. Bigger tap targets. */}
        <nav className="-mx-1 mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm md:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded px-2 py-2 font-medium text-neutral-800"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/post/job?direction=available_for_work"
            className="rounded-lg border border-green-700 bg-white px-2.5 py-1.5 text-xs font-semibold text-green-800"
          >
            List skills
          </Link>
          <Link
            href="/post"
            className="rounded-lg bg-green-700 px-3 py-2 text-xs font-semibold text-white"
          >
            Post
          </Link>
          {signedIn ? (
            <>
              <Link
                href="/dashboard"
                className="rounded px-2 py-2 font-medium text-neutral-800"
              >
                Dashboard
              </Link>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded px-2 py-2 font-medium text-neutral-800"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/signin"
              className="rounded px-2 py-2 font-medium text-neutral-800"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
