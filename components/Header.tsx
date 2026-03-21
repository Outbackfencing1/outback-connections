"use client";
import { useState } from "react";
import Link from "next/link";

export default function Header() {
  const [open, setOpen] = useState(false);

  const links = [
    { href: "/opportunities", label: "Marketplace" },
    { href: "/contractor", label: "Contractors" },
    { href: "/dashboard", label: "Dashboard" },
    { href: "/pricing", label: "Pricing" },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-neutral-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-[#2D5016] flex items-center justify-center">
            <span className="text-white font-bold text-sm">OC</span>
          </div>
          <span className="font-bold text-neutral-900 hidden sm:inline">
            Outback <span className="text-[#2D5016]">Connections</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition"
            >
              {l.label}
            </Link>
          ))}
          <div className="ml-3 flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition"
            >
              Sign In
            </Link>
            <Link
              href="/login"
              className="rounded-md bg-[#2D5016] px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-[#234012] transition"
            >
              Sign Up
            </Link>
          </div>
        </nav>

        {/* Mobile menu button */}
        <button
          aria-label="Toggle menu"
          onClick={() => setOpen(v => !v)}
          className="md:hidden inline-flex items-center justify-center rounded-md border border-neutral-200 w-9 h-9 hover:bg-neutral-50 transition"
        >
          {open ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile panel */}
      {open && (
        <div className="md:hidden border-t border-neutral-200 bg-white">
          <nav className="mx-auto max-w-7xl px-4 py-2 flex flex-col">
            {links.map(l => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
              >
                {l.label}
              </Link>
            ))}
            <hr className="my-2 border-neutral-100" />
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
            >
              Sign In
            </Link>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="mt-1 mb-1 rounded-md bg-[#2D5016] px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-[#234012] transition"
            >
              Sign Up
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
