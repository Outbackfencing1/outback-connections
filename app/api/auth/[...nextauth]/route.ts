// app/api/jobs/route.ts
import { auth } from "@/auth";

// Simple placeholder GET so the route compiles without a DB
export async function GET() {
  return Response.json({
    ok: true,
    jobs: []
  });
}

// Protected POST example (requires sign-in)
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  // TODO: save to DB (Prisma) when you’re ready
  return Response.json({ ok: true, job: body ?? null });
}
