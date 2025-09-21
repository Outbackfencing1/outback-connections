// middleware.ts — safe no-op so prod can’t crash
import { NextResponse } from "next/server";
export function middleware() { return NextResponse.next(); }
export const config = { matcher: ["/((?!_next|.*\\..*).*)"] };
