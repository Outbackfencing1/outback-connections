import type { ReactNode } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  // Root layout already includes Header and globals.css
  return <>{children}</>;
}
