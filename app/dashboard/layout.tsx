import type { ReactNode } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  // Dashboard pages render inside the root layout (which already includes
  // Providers, Header, and globals.css). Keep this layout minimal.
  return <>{children}</>;
}
