// /api/cron/shopify-sales-sync — refresh sales_by_postcode_monthly from
// Shopify's own analytics (ShopifyQL over the Admin GraphQL API). Aggregate
// only: orders and net sales per shipping postcode per month, last 13 months.
// Env-gated like adzuna-sync: without SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_TOKEN
// it returns not_configured and does nothing. `?dry=1` fetches and parses
// without writing. Needs the token to have the read_reports scope.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authoriseCron } from "@/lib/cron-auth";
import { upsertSalesRows } from "@/lib/sales-store";
import { parseShopifyqlSales, SALES_BY_POSTCODE_QUERY, type ShopifyqlTable } from "@/lib/shopifyql";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-07";

type GqlResponse = {
  data?: {
    shopifyqlQuery?: {
      __typename?: string;
      tableData?: ShopifyqlTable | null;
      parseErrors?: { code?: string; message?: string }[] | null;
    } | null;
  };
  errors?: { message: string }[];
};

export async function GET(req: NextRequest) {
  if (!authoriseCron(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!domain || !token) {
    return NextResponse.json({ ok: true, status: "not_configured", hint: "Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_TOKEN (read_reports scope)." });
  }

  const gql = `query SalesByPostcode($q: String!) {
    shopifyqlQuery(query: $q) {
      __typename
      ... on TableResponse { tableData { columns { name dataType } rowData } }
      parseErrors { code message }
    }
  }`;

  let json: GqlResponse;
  try {
    const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query: gql, variables: { q: SALES_BY_POSTCODE_QUERY } }),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[shopify-sales-sync] HTTP", res.status, text.slice(0, 300));
      return NextResponse.json({ ok: false, error: `shopify_http_${res.status}` }, { status: 502 });
    }
    json = (await res.json()) as GqlResponse;
  } catch (e) {
    console.error("[shopify-sales-sync] fetch failed:", e);
    return NextResponse.json({ ok: false, error: "shopify_unreachable" }, { status: 502 });
  }

  const q = json.data?.shopifyqlQuery;
  const parseErrors = q?.parseErrors ?? [];
  if (json.errors?.length || parseErrors.length || !q?.tableData) {
    console.error("[shopify-sales-sync] query problem:", json.errors, parseErrors, q?.__typename);
    return NextResponse.json(
      { ok: false, error: "shopifyql_error", details: [...(json.errors ?? []).map((e) => e.message), ...parseErrors.map((e) => e.message ?? e.code ?? "")], typename: q?.__typename ?? null },
      { status: 502 }
    );
  }

  let parsed: ReturnType<typeof parseShopifyqlSales>;
  try {
    parsed = parseShopifyqlSales(q.tableData);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }

  if (req.nextUrl.searchParams.get("dry") === "1") {
    return NextResponse.json({ ok: true, dry: true, rows: parsed.rows.length, skipped: parsed.skipped, sample: parsed.rows.slice(0, 5) });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const res = await upsertSalesRows(admin, parsed.rows, "shopify");
  if (!res.ok) {
    console.error("[shopify-sales-sync] upsert failed:", res.message);
    return NextResponse.json({ ok: false, error: res.message }, { status: 500 });
  }
  const upserted = res.upserted;
  console.info("[shopify-sales-sync] upserted", upserted, "rows; skipped", parsed.skipped);
  return NextResponse.json({ ok: true, upserted, skipped: parsed.skipped });
}
