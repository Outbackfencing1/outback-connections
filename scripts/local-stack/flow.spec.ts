// End-to-end first-customer enquiry flow on the LOCAL stack (fixture data):
// public page -> one persisted enquiry -> owner-only queue -> status change ->
// alert result. Run: see README.md in this folder. Not a hosted test.
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { PERSONAS, sessionCookie } from "./personas.mjs";

const GATEWAY = "http://localhost:54321";
const SECRET = process.env.LOCAL_JWT_SECRET!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUSINESS = `Fixture Cleaning Co ${Date.now()}`;
const psql = (sql: string) =>
  execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PGPORT ?? "5499", "-U", "postgres", "-tAc", sql]).toString().trim();

async function rows(): Promise<Array<Record<string, string | null>>> {
  const r = await fetch(
    `${GATEWAY}/rest/v1/digital_services_enquiries?select=id,status,notified_at,notify_error,email&business_name=eq.${encodeURIComponent(BUSINESS)}`,
    { headers: { Authorization: `Bearer ${SERVICE}` } }
  );
  return r.json();
}
async function as(page: Page, persona: keyof typeof PERSONAS) {
  const c = sessionCookie(persona, SECRET, GATEWAY);
  await page.context().addCookies([{ ...c, domain: "localhost", path: "/" }]);
}
async function fill(page: Page) {
  await page.fill("input[name=business_name]", BUSINESS);
  await page.fill("input[name=contact_name]", "Pat Fixture");
  await page.fill("input[name=email]", "pat.fixture@example.test");
  await page.fill("input[name=phone]", "0400 000 000");
  await page.selectOption("select[name=interest]", "website");
  await page.fill("textarea[name=message]", "Fixture enquiry from the local end-to-end test. Not a real customer.");
  await page.check("input[name=consent]");
}

test.describe.configure({ mode: "serial" });

test("owner queue gate: logged out, member and another admin are refused", async ({ page }) => {
  await page.goto("/dashboard/owner");
  await expect(page).toHaveURL(/\/signin\?next=%2Fdashboard%2Fowner|\/signin\?next=\/dashboard\/owner/);

  expect(psql(`select is_admin from user_profiles where user_id = '${PERSONAS.admin.id}'`)).toBe("t");
  for (const persona of ["member", "admin"] as const) {
    await page.context().clearCookies();
    await as(page, persona);
    const res = await page.goto("/dashboard/owner");
    expect(res?.status(), persona).toBe(404);
    await expect(page.getByText("Digital services — owner")).toHaveCount(0);
  }
});

test("without JavaScript the form saves nothing and leaks nothing into the URL", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/digital-services");
  await expect(page.getByRole("button", { name: "Send enquiry" })).toBeDisabled();
  await page.fill("input[name=email]", "nojs.fixture@example.test");
  await page.fill("input[name=business_name]", BUSINESS);
  await page.locator("input[name=email]").press("Enter");
  await page.waitForTimeout(500);
  expect(page.url()).not.toMatch(/email=|nojs|fixture|business_name/i);
  await expect(page.getByText(/we have it/i)).toHaveCount(0);
  expect(await rows()).toHaveLength(0);
  await ctx.close();
});

test("public page -> one persisted enquiry; a failed alert keeps the lead; a retry doesn't duplicate", async ({ page }) => {
  await page.goto("/digital-services");
  await fill(page);
  let actionRequest: { url: string; headers: Record<string, string>; body: string } | null = null;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.headers()["next-action"]) actionRequest = { url: r.url(), headers: r.headers(), body: r.postData() ?? "" };
  });
  await page.getByRole("button", { name: "Send enquiry" }).click();
  const thanks = page.getByText(/Thanks, we have it\. Reference DSE-[0-9A-F]{8}\./);
  await expect(thanks).toBeVisible();
  const reference = (await thanks.textContent())!.match(/DSE-[0-9A-F]{8}/)![0];
  expect(page.url()).not.toMatch(/pat|fixture|email=/i);

  let saved = await rows();
  expect(saved).toHaveLength(1);
  expect(`DSE-${saved[0].id!.replace(/-/g, "").slice(0, 8).toUpperCase()}`).toBe(reference);
  // No mail transport on this stack: the alert fails, the lead stays.
  expect(saved[0].notified_at).toBeNull();
  expect(saved[0].notify_error).toBe("no_api_key");
  console.log(`[flow] saved ${reference}; alert result: notify_error=${saved[0].notify_error}`);

  // Replay the exact submission (same idempotency key): no duplicate row.
  expect(actionRequest).not.toBeNull();
  const replay = await page.request.post(actionRequest!.url, { headers: actionRequest!.headers, data: actionRequest!.body });
  expect(replay.status()).toBe(200);
  expect(await replay.text()).toContain(reference);
  saved = await rows();
  expect(saved).toHaveLength(1);
  console.log(`[flow] replayed submission returned ${reference} again; rows for fixture: ${saved.length}`);
});

test("Joshua's queue shows the lead, a status change saves, failures are visible", async ({ page }) => {
  await as(page, "owner");
  const res = await page.goto("/dashboard/owner");
  expect(res?.status()).toBe(200);
  const item = page.locator("li", { hasText: BUSINESS });
  await expect(item).toBeVisible();
  await expect(item.getByText("Owner alert failed: no_api_key")).toBeVisible();
  await expect(page.getByText("Owner alerts")).toBeVisible();

  // Success: only a confirmed save says saved.
  await item.locator("select[name=status]").selectOption("replied");
  await item.getByRole("button", { name: "Update" }).click();
  await expect(page).toHaveURL(/notice=saved/);
  await expect(page.locator("p[role=status]")).toContainText("Status saved.");
  expect((await rows())[0].status).toBe("replied");
  await page.screenshot({ path: process.env.FLOW_SCREENSHOT ?? "/tmp/owner-queue.png", fullPage: true });

  // Failure: the database refuses the write.
  psql("revoke update on public.digital_services_enquiries from service_role");
  try {
    await page.goto("/dashboard/owner?status=all");
    const again = page.locator("li", { hasText: BUSINESS });
    await again.locator("select[name=status]").selectOption("closed");
    await again.getByRole("button", { name: "Update" }).click();
    await expect(page).toHaveURL(/notice=failed/);
    await expect(page.locator("p[role=alert]")).toContainText("Not saved: the database refused the change");
    expect((await rows())[0].status).toBe("replied");
  } finally {
    psql("grant update on public.digital_services_enquiries to service_role");
  }

  // Missing row: the enquiry is gone by the time the owner submits.
  await page.goto("/dashboard/owner?status=all");
  const last = page.locator("li", { hasText: BUSINESS });
  await last.locator("select[name=status]").selectOption("closed");
  psql(`delete from public.digital_services_enquiries where business_name = '${BUSINESS.replace(/'/g, "''")}'`);
  await last.getByRole("button", { name: "Update" }).click();
  await expect(page).toHaveURL(/notice=not_found/);
  await expect(page.locator("p[role=alert]")).toContainText("no longer exists");
});

test("Joshua's message approval goes through his own session; a member's session is refused", async ({ page }) => {
  psql(`insert into digital_services_pilot (id, company, lane, reserved_for) values ('OC-980', 'Fixture Approval Co', 'email', 'cowork') on conflict do nothing`);
  const draftId = psql(`insert into digital_services_pilot_drafts (company_id, revision, subject, body, sha256, author) values ('OC-980', 1, 'Fixture subject', 'Fixture body', 'x', 'test') returning id`).split("\n")[0];
  psql(`insert into digital_services_pilot_approvals (draft_id, draft_sha256, kind, actor) select id, sha256, k, 'reviewer' from digital_services_pilot_drafts, unnest(array['evidence_refresh','preview_review','copy_review']) k where id = '${draftId}'`);
  const sha = psql(`select sha256 from digital_services_pilot_drafts where id = '${draftId}'`);
  try {
    // A member's own session calling the function directly is refused.
    const member = sessionCookie("member", SECRET, GATEWAY);
    const memberToken = JSON.parse(Buffer.from(member.value.replace("base64-", ""), "base64url").toString()).access_token;
    const r = await fetch(`${GATEWAY}/rest/v1/rpc/approve_pilot_message`, {
      method: "POST",
      headers: { Authorization: `Bearer ${memberToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_draft_id: draftId, p_draft_sha256: sha }),
    });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(await r.text()).toContain("only the owner");

    await as(page, "owner");
    await page.goto("/dashboard/owner");
    const row = page.locator("tr", { hasText: "Fixture Approval Co" });
    await row.getByRole("button", { name: "Approve revision 1" }).click();
    await expect(page).toHaveURL(/pilot=approved/);
    await expect(page.locator("p[role=status]", { hasText: "Message approval recorded" })).toBeVisible();
    expect(psql(`select approver_user_id from digital_services_pilot_approvals where draft_id = '${draftId}' and kind = 'message_approval'`)).toBe(PERSONAS.owner.id);
    console.log("[flow] message approval recorded with approver_user_id = owner via the owner's own session");
  } finally {
    psql(`delete from digital_services_pilot_approvals where draft_id = '${draftId}'; delete from digital_services_pilot_drafts where company_id = 'OC-980'; delete from digital_services_pilot where id = 'OC-980'`);
  }
});
