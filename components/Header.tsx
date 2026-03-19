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
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-neutral-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-green-700 flex items-center justify-center">
            <span className="text-white font-bold text-sm">OC</span>
          </div>
          <span className="font-bold text-lg text-neutral-900">
            Outback <span className="text-green-700">Connections</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/login"
            className="ml-2 rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 transition shadow-sm"
          >
            Sign in
          </Link>
        </nav>

        {/* Mobile menu button */}
        <button
          aria-label="Open menu"
          onClick={() => setOpen(v => !v)}
          className="md:hidden inline-flex items-center justify-center rounded-lg border border-neutral-200 w-10 h-10 hover:bg-neutral-50 transition"
        >
          {open ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile panel */}
      {open && (
        <div className="md:hidden border-t border-neutral-200 bg-white">
          <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex flex-col gap-1">
            {links.map(l => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-base font-medium text-neutral-700 hover:bg-neutral-50 transition"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-full bg-green-700 px-4 py-2.5 text-center text-base font-semibold text-white hover:bg-green-800 transition"
            >
              Sign in
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
