// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  // your session check here (or skip if using next-auth middleware)
  const isAuthed = true; // replace

  if (!isAuthed) {
    const login = new URL("/login", req.url);
    login.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}
