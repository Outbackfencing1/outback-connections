// One fixture customer's whole journey on the LOCAL stack, in three phases
// with the app server restarted between them (lifecycle.sh), so every
// unfinished state is shown to survive a restart:
//   1. service page -> one enquiry (alert fails, lead kept) -> owner queue ->
//      conversation -> draft quote from the enquiry -> sent (now fixed)
//   2. written acceptance (fixture) -> insufficient deposit (gated) -> failed
//      save (refused, visible) -> remaining deposit -> intake -> production
//   3. client review -> approved -> launch gated on the balance -> balance
//      evidence -> launched -> handed over; managed care starts at go-live
//      without a payment gate.
// Fixture data only. Not a hosted test; nothing is sent or charged.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { sessionCookie } from "./personas.mjs";

const GATEWAY = "http://localhost:54321";
const SECRET = process.env.LOCAL_JWT_SECRET!;
// Runs only under lifecycle.sh (which sets the phase); the plain flow run skips it.
const PHASE = Number(process.env.LIFECYCLE_PHASE ?? "0");
const STATE_FILE = process.env.LIFECYCLE_STATE ?? "/var/tmp/oc-local-stack/lifecycle.json";
const SHOTS = process.env.LIFECYCLE_SHOTS ?? "/tmp";
const psql = (sql: string) =>
  execFileSync("psql", ["-h", "127.0.0.1", "-p", process.env.PGPORT ?? "5499", "-U", "postgres", "-tAc", sql]).toString().trim();
const q = (v: string) => v.replace(/'/g, "''");

type State = { business: string; enquiryId?: string; reference?: string; prepJob?: string; prepSha?: string };
const load = (): State => JSON.parse(readFileSync(STATE_FILE, "utf8"));
const save = (s: State) => writeFileSync(STATE_FILE, JSON.stringify(s));

async function asOwner(page: Page) {
  const c = sessionCookie("owner", SECRET, GATEWAY);
  await page.context().addCookies([{ ...c, domain: "localhost", path: "/" }]);
}
async function shots(page: Page, name: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  // Open every disclosure so hidden forms are measured too, then check nothing scrolls sideways.
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
  expect(await page.evaluate(() => document.documentElement.scrollWidth), `${name}: no sideways scroll at phone width`).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${SHOTS}/${name}-phone.png`, fullPage: true });
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = false)));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: `${SHOTS}/${name}-desktop.png`, fullPage: true });
}
const quoteRow = (page: Page, label: string) => page.locator("#sales li", { hasText: label });
// Every action starts from a URL without an outcome, so an outcome check can
// only match the redirect that action produced (never the previous one's).
async function fresh(page: Page) {
  await page.goto("/dashboard/owner?qs=all");
  expect(page.url()).not.toContain("sales=");
}
async function outcome(page: Page, name: string) {
  await expect(page).toHaveURL(new RegExp(`sales=${name}`));
}
async function click(page: Page, label: string, button: string) {
  await fresh(page);
  await quoteRow(page, label).getByRole("button", { name: button }).click();
}
async function stage(page: Page, label: string, to: string) {
  await fresh(page);
  await quoteRow(page, label).locator("select[name=stage]").selectOption(to);
  await quoteRow(page, label).getByRole("button", { name: "Set stage" }).click();
}
async function pay(page: Page, label: string, ref: string, amount: string) {
  await fresh(page);
  const row = quoteRow(page, label);
  await row.locator("input[name=evidence_ref]").fill(ref);
  await row.locator("input[name=amount]").fill(amount);
  await row.locator("input[name=received_on]").fill("2026-10-02");
  await row.getByRole("button", { name: "Record payment evidence" }).click();
}
const quoteState = (label: string) => psql(`select status || '/' || delivery_stage from digital_services_quotes where customer_label = '${q(label)}'`);

test.describe.configure({ mode: "serial" });

test.describe("phase 1: enquiry to sent quote", () => {
  test.skip(PHASE !== 1, "phase 1 only");

  test("service page -> one enquiry; failed alert keeps the lead; owner logs a call and drafts a quote from it", async ({ page }) => {
    const state: State = { business: `Lifecycle Fixture Cleaning ${Date.now()}` };
    save(state);
    await page.goto("/digital-services");
    await shots(page, "lifecycle-1-service-page");
    await page.fill("input[name=business_name]", state.business);
    await page.fill("input[name=contact_name]", "Sam Fixture");
    await page.fill("input[name=email]", "sam.fixture@example.test");
    await page.fill("input[name=phone]", "0400 000 001");
    await page.selectOption("select[name=interest]", "website");
    await page.fill("textarea[name=message]", "Lifecycle fixture: we'd like a five-page site with a quote form. Not a real customer.");
    await page.check("input[name=consent]");
    await page.getByRole("button", { name: "Send enquiry" }).click();
    const thanks = page.getByText(/Thanks, we have it\. Reference DSE-[0-9A-F]{8}\./);
    await expect(thanks).toBeVisible();
    state.reference = (await thanks.textContent())!.match(/DSE-[0-9A-F]{8}/)![0];
    const row = psql(`select id || '|' || coalesce(notify_error, '') || '|' || coalesce(notified_at::text, '') from digital_services_enquiries where business_name = '${q(state.business)}'`).split("\n");
    expect(row).toHaveLength(1);
    const [id, notifyError, notifiedAt] = row[0].split("|");
    expect(notifyError).toBe("no_api_key"); // the alert failed (no mail key here); the lead is kept
    expect(notifiedAt).toBe("");
    state.enquiryId = id;
    save(state);

    await asOwner(page);
    await page.goto(`/dashboard/owner?q=${encodeURIComponent(state.business)}`);
    const item = page.locator("li", { hasText: state.business });
    await expect(item.getByText("Owner alert failed: no_api_key")).toBeVisible();
    await item.locator("input[name=summary]").fill("Lifecycle fixture call: wants five pages and a guided quote form");
    await item.getByRole("button", { name: "Log" }).click();
    await outcome(page, "saved");

    await page.goto(`/dashboard/owner?q=${encodeURIComponent(state.business)}`);
    const again = page.locator("li", { hasText: state.business });
    await again.getByText("Draft a quote for this enquiry").click();
    await expect(again.locator("input[name=customer_label]")).toHaveValue(state.business);
    await again.locator("select[name=gst_treatment]").selectOption("exclusive");
    await again.locator("input[name=terms_version]").fill("fixture-terms-v1");
    await again.locator("textarea[name=scope_summary]").fill("Fixture scope: up to five template pages, guided quote form, two change rounds");
    await again.getByRole("button", { name: "Save draft quote" }).click();
    await outcome(page, "saved");
    expect(psql(`select enquiry_id from digital_services_quotes where customer_label = '${q(state.business)}'`)).toBe(id);

    await page.goto("/dashboard/owner#sales");
    await expect(quoteRow(page, state.business)).toContainText("Total due A$2,189.00");
    await quoteRow(page, state.business).getByRole("button", { name: "I've sent this quote" }).click();
    await outcome(page, "saved");
    // A sent quote is fixed: the database refuses a price change.
    expect(() => psql(`update digital_services_quotes set amount_cents = 100 where customer_label = '${q(state.business)}'`)).toThrow(/sent quote is fixed/);
    expect(quoteState(state.business)).toBe("sent/not_started");
    await shots(page, "lifecycle-1-owner-quote-sent");

    // A preparation job handed off before the restart.
    psql(`insert into digital_services_pilot (id, company, lane, offer) values ('OC-982', 'Lifecycle Prep Fixture', 'email', 'quote_form_490') on conflict do nothing`);
    psql(`insert into digital_services_pilot_evidence (company_id, source_url, source_type, checked_at, fact_text, recorded_by) values ('OC-982', 'https://fixture.example/', 'primary_business_website', now(), 'Lifecycle fixture fact.', 'local-stack')`);
    await page.goto("/dashboard/owner#prep");
    await page.locator("#prep summary", { hasText: "Queue a preparation job" }).click();
    await page.fill("#prep input[name=company_id]", "OC-982");
    await page.getByRole("button", { name: "Queue job" }).click();
    await expect(page).toHaveURL(/prep=queued/);
    await page.locator("#prep li", { hasText: "OC-982" }).getByRole("button", { name: "Hand off to me (24 h)" }).click();
    await expect(page).toHaveURL(/prep=claimed/);
    [state.prepJob, state.prepSha] = psql(`select id || '|' || packet_sha256 from digital_services_prep_jobs where company_id = 'OC-982'`).split("|");
    save(state);
    console.log(`[lifecycle] phase 1: ${state.reference} saved (alert failed, lead kept); call logged; quote drafted from the enquiry and sent; price change refused`);
  });
});

test.describe("phase 2: acceptance to production (after a restart)", () => {
  test.skip(PHASE !== 2, "phase 2 only");

  test("state survived the restart; acceptance; insufficient deposit gated; refused save visible; production", async ({ page }) => {
    expect(existsSync(STATE_FILE)).toBe(true);
    const { business } = load();
    expect(quoteState(business)).toBe("sent/not_started");
    await asOwner(page);
    await page.goto("/dashboard/owner#sales");
    await expect(quoteRow(page, business)).toBeVisible();

    // Written acceptance (fixture), logged against the quote.
    await fresh(page);
    await page.locator("#sales select[name=quote_id]").selectOption({ label: `${business} (A$1,990 website)` });
    await page.selectOption("#sales select[name=kind]", "email_in");
    await page.fill("#sales textarea[name=summary]", "Fixture written acceptance: 'We accept quote fixture-terms-v1.'");
    await page.getByRole("button", { name: "Add to log" }).click();
    await outcome(page, "saved");
    await click(page, business, "Customer accepted in writing");
    await outcome(page, "saved");

    // Intake can begin; production needs the deposit (A$995 + GST = A$1,094.50).
    await stage(page, business, "intake_requested");
    await outcome(page, "saved");
    await pay(page, business, `LIFE-DEP-1-${business}`, "500.00");
    await outcome(page, "saved");
    await stage(page, business, "in_production");
    await outcome(page, "gated"); // insufficient deposit

    // A failed save is visible and changes nothing.
    psql("revoke insert on public.digital_services_payments from service_role");
    try {
      await pay(page, business, `LIFE-DEP-2-${business}`, "594.50");
      await outcome(page, "refused");
      await expect(page.locator("#sales p[role=alert]")).toContainText("Not saved");
    } finally {
      psql("grant insert on public.digital_services_payments to service_role");
    }
    expect(psql(`select count(*) from digital_services_payments p join digital_services_quotes qq on qq.id = p.quote_id where qq.customer_label = '${q(business)}'`)).toBe("1");
    await pay(page, business, `LIFE-DEP-2-${business}`, "594.50");
    await outcome(page, "saved");
    await stage(page, business, "intake_received");
    await outcome(page, "saved");
    await stage(page, business, "in_production");
    await outcome(page, "saved");
    expect(quoteState(business)).toBe("accepted/in_production");
    await shots(page, "lifecycle-2-in-production");
    // The hand-off survived the restart; its result is recorded once.
    const { prepJob, prepSha } = load();
    expect(psql(`select status || '/' || lease_owner from digital_services_prep_jobs where id = '${prepJob}'`)).toBe("leased/handoff:owner");
    const result = JSON.stringify({ contract_id: "oc-prep-result/0.1", job_id: prepJob, packet_sha256: prepSha, job_kind: "copy_draft", produced_by: "fixture worker", produced_at: new Date().toISOString(), status: "completed", summary: "Fixture draft prepared" });
    for (const expected of ["succeeded", null]) {
      await page.goto("/dashboard/owner#prep");
      const row = page.locator("#prep li", { hasText: "OC-982" });
      if (expected) {
        await row.locator("textarea[name=result]").fill(result);
        await row.getByRole("button", { name: "Import result" }).click();
        await expect(page).toHaveURL(/prep=succeeded/);
      } else {
        // Re-importing after success isn't offered, and the database answers 'already'.
        await expect(row.locator("textarea[name=result]")).toHaveCount(0);
        expect(psql(`select prep_complete('${prepJob}', (select coalesce(lease_token, gen_random_uuid()) from digital_services_prep_jobs where id = '${prepJob}'), '${result.replace(/'/g, "''")}')`)).toBe("already");
      }
    }
    console.log("[lifecycle] phase 2: restart survived; accepted in writing; A$500 deposit gated; refused save visible; remaining deposit -> production; prep hand-off survived and recorded once");
  });
});

test.describe("phase 3: review to hand-over, and care from go-live (after another restart)", () => {
  test.skip(PHASE !== 3, "phase 3 only");

  test("state survived; launch gated on the balance; balance evidence; launched and handed over; care needs no payment gate", async ({ page }) => {
    const { business, enquiryId } = load();
    expect(quoteState(business)).toBe("accepted/in_production");
    await asOwner(page);
    await page.goto("/dashboard/owner#sales");
    await stage(page, business, "client_review");
    await outcome(page, "saved");
    await stage(page, business, "approved");
    await outcome(page, "saved");
    await stage(page, business, "launched");
    await outcome(page, "gated"); // remaining balance not evidenced
    await pay(page, business, `LIFE-BAL-${business}`, "1,094.50");
    await outcome(page, "saved");
    // The same evidence again is a duplicate, never counted twice.
    await pay(page, business, ` life-bal-${business.toLowerCase()} `, "1094.50");
    await outcome(page, "duplicate");
    await stage(page, business, "launched");
    await outcome(page, "saved");
    await stage(page, business, "handed_over");
    await outcome(page, "saved");
    expect(quoteState(business)).toBe("accepted/handed_over");

    // Managed care is agreed at go-live and billed from then: no payment gate on its stages.
    const care = `${business} care`;
    await fresh(page);
    await page.locator("#sales summary", { hasText: "New draft quote" }).click();
    await page.fill("#sales input[name=customer_label]", care);
    await page.selectOption("#sales select[name=offer]", "care_149");
    await page.selectOption("#sales select[name=gst_treatment]", "exclusive");
    await page.fill("#sales input[name=terms_version]", "fixture-terms-v1");
    await page.fill("#sales input[name=enquiry_id]", enquiryId!);
    await page.fill("#sales textarea[name=scope_summary]", "Fixture care: hosting and look-after within written limits, from go-live");
    await page.getByRole("button", { name: "Save draft quote" }).click();
    await outcome(page, "saved");
    await click(page, care, "I've sent this quote");
    await outcome(page, "saved");
    await click(page, care, "Customer accepted in writing");
    await outcome(page, "saved");
    await stage(page, care, "launched");
    await outcome(page, "saved");
    expect(quoteState(care)).toBe("accepted/launched");
    await page.goto("/dashboard/owner?qs=all#sales");
    await shots(page, "lifecycle-3-handed-over");
    console.log("[lifecycle] phase 3: restart survived; launch gated until balance; duplicate balance refused; launched -> handed over; care accepted and live without a payment gate");
  });

  test.afterAll(() => {
    const { business } = load();
    const ids = `(select id from digital_services_quotes where customer_label like '${q(business)}%')`;
    psql(
      `delete from digital_services_conversations where quote_id in ${ids} or enquiry_id in (select id from digital_services_enquiries where business_name = '${q(business)}');` +
        ` delete from digital_services_payments where quote_id in ${ids};` +
        ` delete from digital_services_quotes where customer_label like '${q(business)}%';` +
        ` delete from digital_services_enquiries where business_name = '${q(business)}';` +
        ` delete from digital_services_prep_jobs where company_id = 'OC-982'; delete from digital_services_pilot_evidence where company_id = 'OC-982'; delete from digital_services_pilot where id = 'OC-982'`
    );
  });
});

