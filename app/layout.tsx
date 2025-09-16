import "./globals.css";
import type { ReactNode } from "react";
import Link from "next/link";
import Providers from "./providers"; // ✅ add

export const metadata = {
  title: "OutbackConnections",
  description: "Connecting farmers and contractors across Australia.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh text-neutral-900 antialiased" style={{ backgroundColor: "#f8f9fa" }}>
        {/* ↓ If it feels too wide, change 7xl → 5xl */}
        <div className="mx-auto max-w-5xl px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
          {/* Header */}
          <header className="rounded-2xl border bg-white p-3 sm:p-4 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* Logo / Brand */}
              <Link href="/" className="inline-flex items-center">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-green-700">
                  OutbackConnections
                </span>
              </Link>

              {/* Navigation */}
              <nav className="flex flex-col sm:flex-row w-full sm:w-auto gap-2 sm:gap-3">
                <Link
                  href="/post-a-job"
                  className="rounded-xl border px-4 py-2 text-sm font-semibold text-center hover:bg-neutral-50"
                >
                  Post a Job
                </Link>
                <Link
                  href="/contractor"
                  className="rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white text-center hover:bg-green-800"
                >
                  Contractor Dashboard
                </Link>
                <Link
                  href="/pricing"
                  className="rounded-xl border px-4 py-2 text-sm font-semibold text-center hover:bg-neutral-50"
                >
                  Pricing
                </Link>
                {/* ✅ Login goes to the UI page, not an API route */}
                <Link
                  href="/login"
                  className="rounded-xl border px-4 py-2 text-sm font-semibold text-center hover:bg-neutral-50"
                >
                  Login
                </Link>
              </nav>
            </div>
          </header>

          {/* Main Content wrapped with SessionProvider */}
          <main className="mt-6 sm:mt-8">
            <Providers>{children}</Providers> {/* ✅ add */}
          </main>

          {/* Footer */}
          <footer className="mt-10 sm:mt-12 text-center text-xs sm:text-sm text-neutral-500 px-2">
            © {new Date().getFullYear()} OutbackConnections. Helping farmers and contractors work faster and fairer.
          </footer>
        </div>
      </body>
    </html>
  );
}
