// app/api/jobs/route.ts
import { auth } from "@/auth";

// Return a simple list so the route compiles & works without a DB.
export async function GET() {
  return Response.json({
    ok: true,
    jobs: []
  });
}

export async function POST(req: Request) {
  // Protect POST
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  // TODO: save to DB (Prisma) when ready
  return Response.json({ ok: true, job: body ?? null });
}
