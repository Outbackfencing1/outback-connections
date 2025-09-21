"use server";

// No-DB placeholder action.
// Later: swap to Prisma once DATABASE_URL + schema are ready.
export async function saveProfile(_data: unknown) {
  // pretend we saved successfully
  return { ok: true as const };
}
