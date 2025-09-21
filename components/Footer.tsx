// components/Footer.tsx
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-12 border-t bg-white/60 backdrop-blur supports-[backdrop-filter]:bg-white/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-neutral-600">
          © {new Date().getFullYear()} OutbackConnections. All rights reserved.
        </p>

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
        </nav>
      </div>
    </footer>
  );
}
