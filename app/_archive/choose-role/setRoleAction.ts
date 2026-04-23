"use server";

import { cookies } from "next/headers";

// Persist the user's role in a cookie for now (no DB required).
// You can swap this to a Prisma update later.
export async function setRole(role: "customer" | "contractor") {
  cookies().set("fc_role", role, {
    path: "/",
    httpOnly: false, // readable by client to tweak UI if needed
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return { ok: true as const };
}
