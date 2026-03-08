// components/Footer.tsx
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-12 border-t bg-white/60 backdrop-blur supports-[backdrop-filter]:bg-white/40">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-neutral-800">
              Built by Outback Fencing & Steel Supplies Pty Ltd
            </p>
            <p className="text-xs text-neutral-500">ABN 76 674 671 820</p>
          </div>

          <nav className="flex flex-wrap gap-4 text-sm text-neutral-700">
            <Link href="/pricing" className="hover:text-neutral-900">
              Pricing
            </Link>
            <Link href="/opportunities" className="hover:text-neutral-900">
              Opportunities
            </Link>
            <Link href="/post-a-job" className="hover:text-neutral-900">
              Post a job
            </Link>
            <a
              href="https://outbackfencing.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-neutral-900"
            >
              outbackfencing.com.au
            </a>
          </nav>
        </div>

        <p className="mt-6 text-xs text-neutral-500">
          &copy; {new Date().getFullYear()} Outback Connections. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
