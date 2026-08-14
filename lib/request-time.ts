import "server-only";
import { connection } from "next/server";

/**
 * Return one wall-clock value after crossing Next's request boundary.
 * Server Components use this instead of reading the clock during render,
 * keeping the value request-scoped and React-render-pure.
 */
export async function requestTimestamp(): Promise<number> {
  await connection();
  return Date.now();
}
