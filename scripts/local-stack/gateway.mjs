// Local stand-in for the Supabase API gateway: /rest/v1/* is proxied to a
// local PostgREST; /auth/v1/user answers for locally minted persona tokens.
// LOCAL ONLY. Nothing here talks to a hosted service.
import http from "node:http";
import { verify } from "./jwt.mjs";

const SECRET = process.env.LOCAL_JWT_SECRET;
const REST = Number(process.env.LOCAL_PGRST_PORT ?? 54329);
const PORT = Number(process.env.LOCAL_GATEWAY_PORT ?? 54321);
const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/rest/v1")) {
      const headers = { ...req.headers, host: `127.0.0.1:${REST}` };
      delete headers.apikey; // PostgREST reads Authorization; apikey is gateway-only
      const up = http.request(
        { host: "127.0.0.1", port: REST, method: req.method, path: url.pathname.slice("/rest/v1".length) + url.search || "/", headers },
        (r) => {
          res.writeHead(r.statusCode ?? 502, r.headers);
          r.pipe(res);
        }
      );
      up.on("error", (e) => json(res, 502, { message: String(e) }));
      req.pipe(up);
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      const p = verify(token, SECRET);
      if (!p || p.role !== "authenticated") return json(res, 401, { code: 401, msg: "invalid token" });
      return json(res, 200, { id: p.sub, aud: "authenticated", role: "authenticated", email: p.email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
    }
    if (url.pathname.startsWith("/auth/v1/")) return json(res, 400, { code: 400, msg: "not supported by the local stack" });
    json(res, 404, { message: "not found" });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`gateway on ${PORT}`));
