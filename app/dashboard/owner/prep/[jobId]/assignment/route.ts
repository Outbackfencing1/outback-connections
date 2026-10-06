// GET /dashboard/owner/prep/<job id>/assignment — the assignment envelope for
// the job's live hand-off: the exact packet text (its database hash
// unchanged) plus this claim's assignment ID and lease generation, which the
// result file must repeat. A job nobody holds has no assignment (409).
// Owner only: anyone else gets a 404. Never cached.
import { getOwnerAccess } from "@/lib/digital-services/owner";
import { PREP_JOBS_TABLE, buildAssignment, type PrepJobFacts } from "@/lib/digital-services/prep-queue";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plain = (status: number, text: string) => new Response(text, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const access = await getOwnerAccess();
  if (!access.ok) return plain(404, "Not found");
  const { jobId } = await params;
  if (!UUID.test(jobId)) return plain(404, "Not found");
  const admin = createAdminClient();
  if (!admin) return plain(503, "The preparation queue isn't connected on this environment.");
  const { data, error } = await admin
    .from(PREP_JOBS_TABLE)
    .select("id, kind, packet_text, packet_sha256, created_at, status, assignment_id, lease_generation, lease_expires_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error) return plain(503, "Couldn't read the job; try again.");
  if (!data) return plain(404, "Not found");
  const job = data as PrepJobFacts & { packet_text: string; status: string; lease_expires_at: string | null };
  const live = job.status === "leased" && !!job.lease_expires_at && Date.parse(job.lease_expires_at) > Date.now();
  const body = live ? buildAssignment(job) : null;
  if (!body) return plain(409, "This job isn't handed off now. Hand it off, then download its assignment.");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="prep-assignment-${job.id.slice(0, 8)}-${job.lease_generation}.json"`,
      "X-Packet-SHA256": job.packet_sha256,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
