import Link from "next/link";
import { auth } from "@/auth";
import AuthButtons from "./AuthButtons";

export default async function Header() {
  const session = await auth();
  const isAuthed = !!session?.user;

  const nav = [
    { href: "/", label: "Home", public: true },
    { href: "/dashboard", label: "Dashboard", public: false },
    { href: "/post-a-job", label: "Post a job", public: true },
    { href: "/opportunities", label: "Opportunities", public: true },
    { href: "/profile", label: "Profile", public: false },
    { href: "/pricing", label: "Pricing", public: true }
  ];

  return (
    <header className="rounded-2xl border bg-white p-3 shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <Link href="/" className="inline-flex items-center">
          <span className="text-2xl font-black tracking-tight text-green-700">
            OutbackConnections
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-2">
          {nav
            .filter((item) => item.public || isAuthed)
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-neutral-100"
              >
                {item.label}
              </Link>
            ))}
        </nav>

        <div className="flex items-center gap-2">
          {session?.user?.email ? (
            <span className="hidden sm:inline rounded-lg bg-neutral-100 px-3 py-1.5 text-sm text-neutral-700">
              {session.user.email}
            </span>
          ) : null}
          <AuthButtons isAuthed={isAuthed} />
        </div>
      </div>
    </header>
  );
}
