"use client";
import { useState } from "react";
import Link from "next/link";

// Interim header for the Step 1 archive commit. Step 4 replaces this with the
// full marketplace nav (Home / Services / Jobs / Freight / Post / Sign in).
const links = [{ href: "/", label: "Home" }];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="text-lg font-extrabold text-green-800 sm:text-xl"
        >
          Outback Connections
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-neutral-800 hover:text-green-800"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {links.length > 1 && (
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-nav-mobile"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm md:hidden"
          >
            {open ? "Close" : "Menu"}
          </button>
        )}
      </div>

      {open && (
        <div id="site-nav-mobile" className="border-t md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 sm:px-6 lg:px-8">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2 text-base font-medium text-neutral-800 hover:bg-neutral-50"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
