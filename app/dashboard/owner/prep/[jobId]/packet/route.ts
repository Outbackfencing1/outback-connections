// GET /dashboard/owner/prep/<job id>/packet — the exact packet text of one
// preparation job, as stored (its SHA-256 was computed by the database).
// Owner only: anyone else gets a 404. Never cached.
import { getOwnerAccess } from "@/lib/digital-services/owner";
import { PREP_JOBS_TABLE } from "@/lib/digital-services/prep-queue";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const access = await getOwnerAccess();
  if (!access.ok) return notFound();
  const { jobId } = await params;
  if (!UUID.test(jobId)) return notFound();
  const admin = createAdminClient();
  if (!admin) return new Response("The preparation queue isn't connected on this environment.", { status: 503, headers: { "Cache-Control": "no-store" } });
  const { data, error } = await admin.from(PREP_JOBS_TABLE).select("id, packet_text, packet_sha256").eq("id", jobId).maybeSingle();
  if (error) return new Response("Couldn't read the job; try again.", { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!data) return notFound();
  const job = data as { id: string; packet_text: string; packet_sha256: string };
  return new Response(job.packet_text, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="prep-packet-${job.id.slice(0, 8)}.json"`,
      "X-Packet-SHA256": job.packet_sha256,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
