// End-to-end first-customer enquiry flow on the LOCAL stack (fixture data):
// public page -> one persisted enquiry -> owner-only queue -> status change ->
// alert result. Run: see README.md in this folder. Not a hosted test.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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

test("Joshua reviews the exact draft before approving; approval doesn't send; a member's session is refused", async ({ page }) => {
  psql(`insert into digital_services_pilot (id, company, lane, reserved_for, uncertainties) values ('OC-980', 'Fixture Approval Co', 'email', 'cowork', '{"Form delivery untested"}') on conflict do nothing`);
  psql(`insert into digital_services_pilot_evidence (company_id, source_url, source_type, checked_at, fact_text, limitations, recorded_by) values ('OC-980', 'https://fixture-approval.example/contact', 'primary_business_website', now() - interval '1 day', 'Fixture contact page with a five-field form', '{"Form submission not tested"}', 'test')`);
  const draftId = psql(`insert into digital_services_pilot_drafts (company_id, revision, subject, body, sha256, author, offer) values ('OC-980', 1, 'Fixture subject', 'Fixture body line one.
Fixture body line two.', 'x', 'test', 'quote_form_490') returning id`).split("\n")[0];
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
    // Nobody but Joshua can open the review screen.
    await as(page, "member");
    expect((await page.goto(`/dashboard/owner/review/${draftId}`))?.status()).toBe(404);
    await page.context().clearCookies();

    await as(page, "owner");
    await page.goto("/dashboard/owner");
    const row = page.locator("tr", { hasText: "Fixture Approval Co" });
    await expect(row.getByRole("button", { name: /Approve/ })).toHaveCount(0); // no approval without the review screen
    await row.getByRole("link", { name: "Review revision 1 to approve" }).click();
    await expect(page.getByTestId("draft-subject")).toHaveText("Fixture subject");
    await expect(page.getByTestId("draft-body")).toContainText("Fixture body line two.");
    await expect(page.getByText(sha)).toBeVisible();
    await expect(page.getByText("https://fixture-approval.example/contact")).toBeVisible();
    await expect(page.getByText(/Business's own website · checked .* · 1 day old/)).toBeVisible();
    await expect(page.getByText("Form delivery untested")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: process.env.REVIEW_SCREENSHOT_PHONE ?? "/tmp/owner-review-phone.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: process.env.REVIEW_SCREENSHOT ?? "/tmp/owner-review.png", fullPage: true });
    await page.getByRole("button", { name: "Record approval of revision 1 (does not send)" }).click();
    await expect(page).toHaveURL(/pilot=approved/);
    await expect(page.locator("p[role=status]")).toContainText("Nothing was sent");
    expect(psql(`select approver_user_id || '/' || draft_revision || '/' || evidence_revision from digital_services_pilot_approvals where draft_id = '${draftId}' and kind = 'message_approval'`)).toBe(`${PERSONAS.owner.id}/1/1`);
    expect(psql(`select count(*) from digital_services_pilot_events where company_id = 'OC-980'`)).toBe("0");

    // New evidence makes the revision stale: the screen withholds approval.
    psql(`insert into digital_services_pilot_evidence (company_id, source_url, source_type, checked_at, fact_text, recorded_by) values ('OC-980', 'https://fixture-approval.example/about', 'primary_business_website', now(), 'Fixture about page', 'test')`);
    await page.reload();
    await expect(page.getByTestId("approval-blockers")).toContainText("Evidence changed after this revision was written");
    console.log("[flow] review screen showed exact copy/hash/evidence; approval recorded (owner, revision 1, evidence 1), no send event; new evidence made it stale");
  } finally {
    psql(`delete from digital_services_pilot_approvals where draft_id = '${draftId}'; delete from digital_services_pilot_drafts where company_id = 'OC-980'; delete from digital_services_pilot_evidence where company_id = 'OC-980'; delete from digital_services_pilot where id = 'OC-980'`);
  }
});

test("Joshua's sales controls: draft quote, status, payment evidence, gated delivery, conversation log", async ({ page }) => {
  const CUSTOMER = `Fixture Sales Co ${Date.now()}`;
  const quoteRow = () => page.locator("#sales li", { hasText: CUSTOMER });
  const outcome = async (name: string) => {
    await expect(page).toHaveURL(new RegExp(`sales=${name}`));
  };
  try {
    await as(page, "owner");
    await page.goto("/dashboard/owner");
    await page.locator("#sales summary", { hasText: "New draft quote" }).click();
    await page.fill("#sales input[name=customer_label]", CUSTOMER);
    await page.selectOption("#sales select[name=offer]", "website_1990");
    await page.selectOption("#sales select[name=gst_treatment]", "exclusive");
    await page.fill("#sales input[name=terms_version]", "fixture-terms");
    await page.fill("#sales textarea[name=scope_summary]", "Fixture scope: five pages, guided form, two rounds");
    await page.getByRole("button", { name: "Save draft quote" }).click();
    await outcome("saved");
    await expect(quoteRow()).toContainText("Total due A$2,189.00");
    await expect(page.getByRole("button", { name: /mark.*paid|^paid/i })).toHaveCount(0);

    // Intake can start before payment; production can't.
    await quoteRow().locator("select[name=stage]").selectOption("intake_requested");
    await quoteRow().getByRole("button", { name: "Set stage" }).click();
    await outcome("saved");
    await quoteRow().getByRole("button", { name: "I've sent this quote" }).click();
    await outcome("saved");
    await quoteRow().getByRole("button", { name: "Customer accepted in writing" }).click();
    await outcome("saved");
    await quoteRow().locator("select[name=stage]").selectOption("in_production");
    await quoteRow().getByRole("button", { name: "Set stage" }).click();
    await outcome("gated");
    await expect(page.locator("#sales p[role=alert]")).toContainText("payment due before production");

    // Deposit evidence (A$995 + GST), then production is allowed.
    const pay = async (ref: string, amount: string) => {
      await quoteRow().locator("input[name=evidence_ref]").fill(ref);
      await quoteRow().locator("input[name=amount]").fill(amount);
      await quoteRow().locator("input[name=received_on]").fill("2026-10-01");
      await quoteRow().getByRole("button", { name: "Record payment evidence" }).click();
    };
    await pay(`FIXTURE-${CUSTOMER}`, "1,094.50");
    await outcome("saved");
    await expect(quoteRow()).toContainText("deposit received");
    await pay(` fixture-${CUSTOMER.toLowerCase()} `, "1094.50");
    await outcome("duplicate");
    await expect(quoteRow()).toContainText("evidenced A$1,094.50");
    await quoteRow().locator("select[name=stage]").selectOption("in_production");
    await quoteRow().getByRole("button", { name: "Set stage" }).click();
    await outcome("saved");
    await quoteRow().locator("select[name=stage]").selectOption("launched");
    await quoteRow().getByRole("button", { name: "Set stage" }).click();
    await outcome("gated");

    // Conversation log, linked to the quote.
    await page.locator("#sales select[name=quote_id]").selectOption({ label: `${CUSTOMER} (A$1,990 website)` });
    await page.selectOption("#sales select[name=kind]", "call");
    await page.fill("#sales textarea[name=summary]", "Fixture call: agreed five pages");
    await page.getByRole("button", { name: "Add to log" }).click();
    await outcome("saved");
    await expect(quoteRow()).toContainText("Phone call: Fixture call: agreed five pages");
    expect(psql(`select status || '/' || delivery_stage from digital_services_quotes where customer_label = '${CUSTOMER}'`)).toBe("accepted/in_production");
    await page.screenshot({ path: process.env.SALES_SCREENSHOT ?? "/tmp/owner-sales.png", fullPage: true });
    console.log("[flow] sales: draft -> sent -> accepted; production gated until deposit evidence; duplicate evidence refused; launch gated; note logged");
  } finally {
    const q = `(select id from digital_services_quotes where customer_label = '${CUSTOMER}')`;
    psql(`delete from digital_services_conversations where quote_id in ${q}; delete from digital_services_payments where quote_id in ${q}; delete from digital_services_quotes where customer_label = '${CUSTOMER}'`);
  }
});

test("the quote list is paged and filtered, so no quote is out of reach", async ({ page }) => {
  const TAG = `Fixture Paging ${Date.now()}`;
  psql(
    `insert into digital_services_quotes (customer_label, offer, amount_cents, terms_version, scope_summary, created_at)
     select '${TAG} #' || g, 'quote_form_490', 49000, 't', 's', now() - (g || ' minutes')::interval from generate_series(1, 55) g`
  );
  psql(`insert into digital_services_quotes (customer_label, offer, amount_cents, terms_version, scope_summary, status) values ('${TAG} withdrawn', 'quote_form_490', 49000, 't', 's', 'withdrawn')`);
  try {
    await as(page, "owner");
    await page.goto("/dashboard/owner");
    const sales = page.locator("#sales");
    await expect(sales.getByText(/page 1 of 2/)).toBeVisible();
    await expect(sales.locator("li", { hasText: `${TAG} #55` })).toHaveCount(0); // oldest is on page 2
    await sales.getByRole("link", { name: "Older →" }).click();
    await expect(page).toHaveURL(/qp=2/);
    await expect(sales.locator("li", { hasText: `${TAG} #55` })).toBeVisible();
    await expect(sales.locator("li", { hasText: `${TAG} withdrawn` })).toHaveCount(0); // open list hides withdrawn
    await sales.getByRole("link", { name: /Show all/ }).click();
    await expect(page).toHaveURL(/qs=all/);
    await expect(sales.locator("li", { hasText: `${TAG} withdrawn` })).toBeVisible();
    console.log("[flow] quotes: 56 fixture quotes reachable across pages; withdrawn shown under 'all'");
  } finally {
    psql(`delete from digital_services_quotes where customer_label like '${TAG}%'`);
  }
});

test("the conversation log not tied to a quote is paged, so older entries stay reachable", async ({ page }) => {
  const TAG = `Fixture log ${Date.now()}`;
  psql(
    `insert into digital_services_conversations (kind, summary, pilot_company_id, recorded_by, occurred_at)
     select 'note', '${TAG} #' || g, 'OC-977', 'fixture', now() - (g || ' minutes')::interval from generate_series(1, 55) g`
  );
  try {
    await as(page, "owner");
    await page.goto("/dashboard/owner");
    const log = page.locator("#conversation-log");
    await expect(log.getByText(/not tied to a quote · page 1 of 2/)).toBeVisible();
    await expect(log.getByText(`${TAG} #55`, { exact: false })).toHaveCount(0);
    await log.getByRole("link", { name: "Older →" }).click();
    await expect(page).toHaveURL(/cp=2/);
    await expect(page.locator("#conversation-log").getByText(`${TAG} #55`, { exact: false })).toBeVisible();
    console.log("[flow] conversation log: 55 entries reachable across pages");
  } finally {
    psql(`delete from digital_services_conversations where summary like '${TAG}%'`);
  }
});

test("preparation queue: queue a job, hand it off, download its exact packet, import a result; no worker runs by itself", async ({ page }) => {
  psql(`insert into digital_services_pilot (id, company, lane, offer) values ('OC-981', 'Fixture Prep Co', 'email', 'quote_form_490') on conflict do nothing`);
  psql(`insert into digital_services_pilot_evidence (company_id, source_url, source_type, checked_at, fact_text, recorded_by) values ('OC-981', 'https://fixture.example/', 'primary_business_website', now(), 'Fixture fact for the prep packet.', 'local-stack')`);
  try {
    await as(page, "owner");
    await page.goto("/dashboard/owner#prep");
    await expect(page.locator("#prep")).toContainText("No worker runs automatically");
    await page.locator("#prep summary", { hasText: "Queue a preparation job" }).click();
    await page.fill("#prep input[name=company_id]", "OC-981");
    await page.selectOption("#prep select[name=kind]", "copy_draft");
    await page.getByRole("button", { name: "Queue job" }).click();
    await expect(page).toHaveURL(/prep=queued/);
    // Queuing the same facts again doesn't add a job.
    await page.goto("/dashboard/owner#prep");
    await page.locator("#prep summary", { hasText: "Queue a preparation job" }).click();
    await page.fill("#prep input[name=company_id]", "OC-981");
    await page.getByRole("button", { name: "Queue job" }).click();
    await expect(page).toHaveURL(/prep=already_queued/);
    expect(psql(`select count(*) from digital_services_prep_jobs where company_id = 'OC-981'`)).toBe("1");
    const [jobId, packetSha] = psql(`select id || '|' || packet_sha256 from digital_services_prep_jobs where company_id = 'OC-981'`).split("|");
    expect(psql(`select status from digital_services_prep_jobs where id = '${jobId}'`)).toBe("queued"); // nothing ran it

    const job = page.locator("#prep li", { hasText: "OC-981" });
    await job.getByRole("button", { name: "Hand off to me (24 h)" }).click();
    await expect(page).toHaveURL(/prep=claimed/);
    const packet = await page.request.get(`/dashboard/owner/prep/${jobId}/packet`);
    expect(packet.status()).toBe(200);
    const text = await packet.text();
    expect(createHash("sha256").update(text, "utf8").digest("hex")).toBe(packetSha);
    expect(packet.headers()["x-packet-sha256"]).toBe(packetSha);
    expect(JSON.parse(text)).toMatchObject({ contract_id: "oc-prep-packet/0.2", company: { id: "OC-981" }, evidence: [{ fact_text: "Fixture fact for the prep packet." }], constraints: { sendable: false } });

    // A result for a different packet is rejected; the right one is recorded once.
    const result = (sha: string) =>
      JSON.stringify({ contract_id: "oc-prep-result/0.1", job_id: jobId, packet_sha256: sha, job_kind: "copy_draft", produced_by: "fixture worker", produced_at: new Date().toISOString(), status: "completed", summary: "Fixture draft prepared" });
    await page.goto("/dashboard/owner#prep");
    await page.locator("#prep li", { hasText: "OC-981" }).locator("textarea[name=result]").fill(result("f".repeat(64)));
    await page.getByRole("button", { name: "Import result" }).click();
    await expect(page).toHaveURL(/prep=rejected/);
    await page.goto("/dashboard/owner#prep");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: process.env.PREP_SCREENSHOT_PHONE ?? "/tmp/owner-prep-phone.png", fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator("#prep li", { hasText: "OC-981" }).locator("textarea[name=result]").fill(result(packetSha));
    await page.getByRole("button", { name: "Import result" }).click();
    await expect(page).toHaveURL(/prep=succeeded/);
    await expect(page.locator("#prep p[role=status]")).toContainText("nothing was approved, sent or published");
    expect(psql(`select status || '/' || (result_sha256 = encode(sha256(convert_to(result_text, 'UTF8')), 'hex')) from digital_services_prep_jobs where id = '${jobId}'`)).toBe("succeeded/true");
    // A member can't download packets.
    await page.context().clearCookies();
    await as(page, "member");
    expect((await page.request.get(`/dashboard/owner/prep/${jobId}/packet`)).status()).toBe(404);
    console.log("[flow] prep queue: queued once (idempotent), handed off, packet hash matched the database, wrong-packet result rejected, result recorded");
  } finally {
    psql(`delete from digital_services_prep_jobs where company_id = 'OC-981'; delete from digital_services_pilot_evidence where company_id = 'OC-981'; delete from digital_services_pilot where id = 'OC-981'`);
  }
});
