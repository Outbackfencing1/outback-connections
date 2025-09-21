import "./globals.css";
import type { ReactNode } from "react";
import Header from "@/components/Header";

export const metadata = {
  title: "OutbackConnections",
  description: "Connecting farmers and contractors across Australia."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-neutral-50">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4">
          <Header />
          <main className="rounded-2xl border bg-white p-4 shadow-sm">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
