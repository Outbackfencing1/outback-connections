// app/api/jobs/route.ts
import { auth } from "@/auth";
import { supabaseServer, supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const supa = supabaseServer();
  if (!supa) {
    return Response.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const { data, error } = await supa
    .from("jobs")
    .select("id, title, description, location, rate, slug, status, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, jobs: data });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const supa = supabaseAdmin();
  if (!supa) {
    return Response.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.title || !body.description) {
    return Response.json({ ok: false, error: "title and description are required" }, { status: 400 });
  }

  const slug = body.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const { data, error } = await supa.from("jobs").insert({
    title: body.title,
    location: body.location || null,
    rate: body.rate || null,
    description: body.description,
    slug,
    status: "open",
  }).select().single();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, job: data });
}
