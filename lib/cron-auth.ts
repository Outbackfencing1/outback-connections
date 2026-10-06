// lib/cron-auth.ts
// One rule for every /api/cron route. Vercel Cron sends
// `Authorization: Bearer <CRON_SECRET>`; a manual run may pass `?k=<secret>`,
// except on routes that ask for `headerOnly` (a secret in a URL ends up in
// logs and browser history).
// Without CRON_SECRET the routes are open ONLY outside production, so a
// preview or a fresh environment can't be used to spam the team inbox or
// drive external APIs.
import type { NextRequest } from "next/server";

export function authoriseCron(req: NextRequest, opts: { headerOnly?: boolean } = {}): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  if (opts.headerOnly) return false;
  return req.nextUrl.searchParams.get("k") === secret;
}
