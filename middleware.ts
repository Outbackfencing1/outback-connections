// middleware.ts — refreshes the Supabase session on every non-static request
// so cookies stay current and server components can trust auth.getUser().
import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Match all request paths except:
    //   - _next/static, _next/image (framework static)
    //   - favicon.ico, robots.txt, sitemap.xml
    //   - any file with an extension (images, fonts, etc.)
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)",
  ],
};
