// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LockdownBanner from "@/components/LockdownBanner";
import { organizationJsonLd, jsonLdScript, socialMeta } from "@/lib/seo";

const baseUrl =
  process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "Outback Connections | Rural directory: fencing contractors across NSW",
  description:
    "A free rural directory for Australia: find a fencing contractor and ask for a quote. Built by Outback Fencing & Steel Supplies.",
  icons: { icon: "/favicon.ico" },
  // Default share card; pages with their own title pass their own.
  ...socialMeta({
    title: "Outback Connections: find a fencing contractor near you",
    description:
      "Free rural directory. Fencing contractors across NSW; ask for a quote without an account.",
    path: "/",
  }),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-50 text-neutral-900">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationJsonLd(baseUrl)) }}
        />
        <div className="flex min-h-dvh flex-col">
          <LockdownBanner />
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
