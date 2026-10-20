export const PENDING_LISTING_STATUSES = [
  "pending_review",
  "pending_verification",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidListingId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export type PendingApprovalOutcome =
  | { ok: true; id: string; flash: string }
  | {
      ok: false;
      reason: "invalid_id" | "not_pending" | "db_error";
      flash: string;
      errorMessage?: string;
    };

type ListingsUpdateAdminClient = {
  from: (table: "listings") => {
    update: (values: { status: "active" }) => {
      eq: (
        column: "id",
        value: string
      ) => {
        in: (
          column: "status",
          values: readonly string[]
        ) => {
          select: (columns: "id, status") => {
            maybeSingle: () => PromiseLike<{
              data: { id: string; status: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
};

/**
 * Atomically transitions a listing to `active` ONLY if its current status is in
 * `('pending_review', 'pending_verification')`. Prevents crafted requests from
 * reactivating closed, expired, or admin-deleted listings, and detects
 * concurrent state changes (`0` rows updated).
 */
export async function executePendingListingApproval(
  admin: ListingsUpdateAdminClient,
  rawId: unknown
): Promise<PendingApprovalOutcome> {
  if (!isValidListingId(rawId)) {
    return {
      ok: false,
      reason: "invalid_id",
      flash: "Invalid listing ID.",
    };
  }
  const id = rawId.trim();

  const { data: updated, error } = await admin
    .from("listings")
    .update({ status: "active" })
    .eq("id", id)
    .in("status", PENDING_LISTING_STATUSES)
    .select("id, status")
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: "db_error",
      flash: "Couldn't approve listing.",
      errorMessage: error.message,
    };
  }

  if (!updated) {
    return {
      ok: false,
      reason: "not_pending",
      flash:
        "Listing is no longer pending verification (already approved or status changed).",
    };
  }

  return {
    ok: true,
    id: updated.id,
    flash: "Listing approved and published live.",
  };
}
