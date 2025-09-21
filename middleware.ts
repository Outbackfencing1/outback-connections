// middleware.ts — safe no-op (never throws)
import { NextResponse } from "next/server";

export function middleware() {
  return NextResponse.next();
}

// Match all pages except static assets/_next to keep it cheap
export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"]
};
