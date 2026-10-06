// A tiny stand-in for the Supabase API, for checking built pages with fake
// signed-in people. LOCAL ONLY: fixture data, fake contacts, no hosted service.
// Persona tokens are "persona:<name>" inside an unsigned JWT; /auth/v1/user
// answers for them, /rest/v1 answers from the fixtures below.
import http from "node:http";

export const PERSONAS = {
  member: { id: "11111111-1111-4111-8111-111111111111", is_admin: false, is_staff: false },
  staff: { id: "44444444-4444-4444-8444-444444444444", is_admin: false, is_staff: true },
  admin: { id: "22222222-2222-4222-8222-222222222222", is_admin: true, is_staff: false },
};

const PROSPECTS = [
  {
    business_id: "b0000000-0000-4000-8000-000000000001",
    business_name: "Fixture Fencing Co",
    suburb: "Dalmeny",
    postcode: "2546",
    state_code: "NSW",
    contact_phone: "0400 000 000",
    contact_email: "fixture@example.test",
    website_url: null,
    source_platform: "yellow_pages",
    source_url: "https://example.test/listing",
    claim_status: "unclaimed",
    listing_id: "l0000000-0000-4000-8000-000000000001",
    listing_slug: "fixture-fencing-co",
    listing_kind: "service_offering",
    listing_status: "active",
    category_id: 1,
    category_slug: "fencing-contractor",
    category_label: "Fencing contractor",
    outreach_status: "follow_up",
    assigned_to: null,
    assigned_name: "Ali",
    last_contacted_at: "2026-10-01T00:00:00Z",
    next_follow_up_at: "2026-10-08T00:00:00Z",
    latest_note: "Fixture note",
    updated_at: "2026-10-01T00:00:00Z",
  },
];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export const tokenFor = (name) =>
  `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: PERSONAS[name].id, role: "authenticated", aud: "authenticated", persona: name, exp: Math.floor(Date.now() / 1000) + 3600 })}.x`;

export function sessionCookie(name, supabaseUrl) {
  const access_token = tokenFor(name);
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: PERSONAS[name].id, aud: "authenticated", role: "authenticated", email: `${name}@example.test` };
  const session = { access_token, token_type: "bearer", expires_in: 3600, expires_at, refresh_token: "fake-refresh", user };
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  return { name: `sb-${ref}-auth-token`, value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url") };
}

function personaOf(req) {
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  try {
    const p = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
    return PERSONAS[p.persona] ? p.persona : null;
  } catch {
    return null;
  }
}

const send = (res, code, body, headers = {}) => {
  res.writeHead(code, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

export function start(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const who = personaOf(req);
    if (url.pathname === "/auth/v1/user") {
      if (!who) return send(res, 401, { code: 401, msg: "invalid token" });
      const p = PERSONAS[who];
      return send(res, 200, { id: p.id, aud: "authenticated", role: "authenticated", email: `${who}@example.test`, app_metadata: {}, user_metadata: {} });
    }
    const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const staffish = who && (PERSONAS[who].is_admin || PERSONAS[who].is_staff);
    if (url.pathname === "/rest/v1/user_profiles") {
      const row = who ? { is_admin: PERSONAS[who].is_admin, is_staff: PERSONAS[who].is_staff } : null;
      return single ? (row ? send(res, 200, row) : send(res, 406, { code: "PGRST116" })) : send(res, 200, row ? [row] : []);
    }
    if (url.pathname === "/rest/v1/admin_contractor_outreach") {
      const rows = staffish ? PROSPECTS : [];
      return send(res, 200, rows, { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
    }
    if (url.pathname === "/rest/v1/rpc/admin_contractor_outreach_counts") {
      return send(res, 200, staffish ? [{ outreach_status: "follow_up", count: 1 }] : []);
    }
    if (url.pathname === "/rest/v1/categories") {
      return send(res, 200, [{ id: 1, slug: "fencing-contractor", label: "Fencing contractor", pillar: "services" }]);
    }
    if (url.pathname.startsWith("/rest/v1/")) return send(res, 200, single ? {} : []);
    send(res, 404, { message: "not found" });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
