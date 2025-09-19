import { auth } from "@/auth";

export async function GET() {
  return Response.json({ ok: true, jobs: [] });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => null);
  return Response.json({ ok: true, job: body ?? null });
}
