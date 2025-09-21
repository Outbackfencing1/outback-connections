"use client";
import { useState } from "react";
import Link from "next/link";

export default function Header() {
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/", label: "Home" },
    { href: "/post-a-job", label: "Post a job" },
    { href: "/opportunities", label: "Opportunities" },
    { href: "/pricing", label: "Pricing" },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="font-extrabold text-xl text-green-700">
          OutbackConnections
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {links.map(l => (
            <Link key={l.href} href={l.href} className="text-sm font-medium hover:text-green-700">
              {l.label}
            </Link>
          ))}
          <Link href="/login" className="rounded-full border px-3 py-1.5 text-sm hover:bg-gray-50">
            Sign in
          </Link>
        </nav>

        {/* Mobile menu button */}
        <button
          aria-label="Open menu"
          onClick={() => setOpen(v => !v)}
          className="md:hidden inline-flex items-center rounded-md border px-3 py-2"
        >
          ☰
        </button>
      </div>

      {/* Mobile panel */}
      {open && (
        <div className="md:hidden border-t">
          <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex flex-col gap-2">
            {links.map(l => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-2 text-base font-medium"
              >
                {l.label}
              </Link>
            ))}
            <Link href="/login" onClick={() => setOpen(false)} className="py-2 text-base">
              Sign in
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
