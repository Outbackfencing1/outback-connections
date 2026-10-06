// GET /dashboard/owner/research/<assignment id>/assignment — the file handed
// to the researcher: the exact issued request, schema and exclusions texts
// with their database hashes, the cohort limit and the no-contact rules.
// Owner only: anyone else gets a 404. Never cached.
import { getOwnerAccess } from "@/lib/digital-services/owner";
import { RESEARCH_ASSIGNMENTS_TABLE, assignmentPacket, type AssignmentFiles } from "@/lib/digital-services/research-staging";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plain = (status: number, text: string) => new Response(text, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const access = await getOwnerAccess();
  if (!access.ok) return plain(404, "Not found");
  const { assignmentId } = await params;
  if (!UUID.test(assignmentId)) return plain(404, "Not found");
  const admin = createAdminClient();
  if (!admin) return plain(503, "Research staging isn't connected on this environment.");
  const { data, error } = await admin
    .from(RESEARCH_ASSIGNMENTS_TABLE)
    .select("id, request_id, niche, country, cohort_limit, request_text, schema_text, exclusions_text, request_sha256, schema_sha256, exclusions_sha256, state")
    .eq("id", assignmentId)
    .maybeSingle();
  if (error) return plain(503, "Couldn't read the assignment; try again.");
  if (!data) return plain(404, "Not found");
  const a = data as AssignmentFiles;
  return new Response(assignmentPacket(a), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="research-assignment-${a.id.slice(0, 8)}.json"`,
      "X-Request-SHA256": a.request_sha256,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
