"use client";
import { useState } from "react";
import Link from "next/link";

export default function Header() {
  const [open, setOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);

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
          {/* Marketplace dropdown */}
          <div className="relative">
            <button
              onClick={() => setMarketOpen((v) => !v)}
              onBlur={() => setTimeout(() => setMarketOpen(false), 150)}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition inline-flex items-center gap-1"
            >
              Marketplace
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {marketOpen && (
              <div className="absolute left-0 top-full mt-1 w-44 rounded-lg border border-neutral-200 bg-white shadow-lg py-1 z-50">
                <Link href="/opportunities" className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50">Jobs</Link>
                <Link href="/freight" className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50">Freight</Link>
                <Link href="/opportunities" className="block px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50">Opportunities</Link>
              </div>
            )}
          </div>
          <Link
            href="/contractor"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition"
          >
            Contractors
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition"
          >
            Dashboard
          </Link>
          <Link
            href="/pricing"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition"
          >
            Pricing
          </Link>
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
            <span className="px-3 pt-2 pb-1 text-xs font-semibold text-neutral-400 uppercase tracking-wider">Marketplace</span>
            <Link href="/opportunities" onClick={() => setOpen(false)} className="rounded-md px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition pl-6">Jobs</Link>
            <Link href="/freight" onClick={() => setOpen(false)} className="rounded-md px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition pl-6">Freight</Link>
            <Link href="/opportunities" onClick={() => setOpen(false)} className="rounded-md px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition pl-6">Opportunities</Link>
            <hr className="my-2 border-neutral-100" />
            <Link href="/contractor" onClick={() => setOpen(false)} className="rounded-md px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition">Contractors</Link>
            <Link href="/dashboard" onClick={() => setOpen(false)} className="rounded-md px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition">Dashboard</Link>
            <Link href="/pricing" onClick={() => setOpen(false)} className="rounded-md px-3 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition">Pricing</Link>
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
