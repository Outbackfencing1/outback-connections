// The daily purge must not report success when the digital-services
// enquiry purge fails: expired personal enquiries would outlive 12 months.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { purgeOutcome } from "@/lib/digital-services/flags";

describe("purgeOutcome", () => {
  it("is purged without an error", () => {
    expect(purgeOutcome(null, {})).toBe("purged");
  });
  it("a missing function is fine only before launch", () => {
    const missing = { code: "PGRST202", message: "Could not find the function" };
    expect(purgeOutcome(missing, {})).toBe("not_installed");
    expect(purgeOutcome({ code: "42883", message: "function does not exist" }, {})).toBe("not_installed");
    expect(purgeOutcome(missing, { DIGITAL_SERVICES_PUBLIC: "on" })).toBe("failed");
    expect(purgeOutcome(missing, { DIGITAL_SERVICES_LAUNCHED_ON: "2026-10-01" })).toBe("failed");
  });
  it("any operational error is a failure", () => {
    expect(purgeOutcome({ code: "PGRST001", message: "database unreachable" }, {})).toBe("failed");
    expect(purgeOutcome({ code: "42501", message: "permission denied" }, {})).toBe("failed");
    expect(purgeOutcome({ message: "fetch failed" }, {})).toBe("failed");
  });
});

const rpc = vi.hoisted(() => ({ results: {} as Record<string, { data: unknown; error: { code?: string; message: string } | null }> }));
vi.mock("@/lib/cron-auth", () => ({ authoriseCron: () => true }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: async (name: string) => rpc.results[name] ?? { data: 0, error: null } }),
}));

describe("purge cron route", () => {
  beforeEach(() => {
    rpc.results = {};
    vi.unstubAllEnvs();
    vi.stubEnv("DIGITAL_SERVICES_PUBLIC", "");
    vi.stubEnv("DIGITAL_SERVICES_LAUNCHED_ON", "");
  });
  const call = async () => {
    const { GET } = await import("@/app/api/cron/purge-auth-events/route");
    const res = await GET(new Request("http://localhost/api/cron/purge-auth-events") as never);
    return { status: res.status, body: await res.json() };
  };

  it("returns 200 when every purge ran", async () => {
    rpc.results.purge_old_digital_services_enquiries = { data: 3, error: null };
    expect(await call()).toMatchObject({ status: 200, body: { ok: true, digital_services_enquiries_deleted: 3, digital_services_purge: "purged" } });
  });
  it("returns 200 before launch when the digital-services purge isn't installed", async () => {
    rpc.results.purge_old_digital_services_enquiries = { data: null, error: { code: "PGRST202", message: "not found" } };
    expect(await call()).toMatchObject({ status: 200, body: { ok: true, digital_services_purge: "not_installed" } });
  });
  it("returns 500 when the digital-services purge fails operationally", async () => {
    rpc.results.purge_old_digital_services_enquiries = { data: null, error: { code: "PGRST001", message: "database unreachable" } };
    expect(await call()).toMatchObject({ status: 500, body: { ok: false, digital_services_purge: "failed" } });
  });
  it("returns 500 after launch when the purge function is missing", async () => {
    vi.stubEnv("DIGITAL_SERVICES_PUBLIC", "on");
    rpc.results.purge_old_digital_services_enquiries = { data: null, error: { code: "PGRST202", message: "not found" } };
    expect(await call()).toMatchObject({ status: 500, body: { ok: false } });
  });
});
