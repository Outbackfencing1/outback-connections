"use server";

// Public intake for the digital-services page. The flow (validate, dedupe,
// rate-limit, save, then alert) lives in lib/digital-services/intake.ts; this
// file only wires it to the service-role client, the request and Resend.
// Next's server actions reject cross-site posts by comparing Origin with the
// Host the request arrived on, so www and the bare domain each accept their
// own form and nothing else.
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_FROM, sendEmail } from "@/lib/email";
import { alertDestination, digitalServicesPublic } from "@/lib/digital-services/flags";
import { processIntake, type IntakeResult, type IntakeStore } from "@/lib/digital-services/intake";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";
const TABLE = "digital_services_enquiries";

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

async function requestMeta() {
  try {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    const ip = xff ? xff.split(",")[0]?.trim() || null : h.get("x-real-ip");
    return { ip: ip || null, ua: h.get("user-agent"), host: h.get("x-forwarded-host") ?? h.get("host") };
  } catch {
    return { ip: null, ua: null, host: null };
  }
}

function storeFor(): IntakeStore | null {
  const admin = createAdminClient();
  if (!admin) return null;
  return {
    findByKey: async (key) => {
      const { data, error } = await admin.from(TABLE).select("id").eq("idempotency_key", key).maybeSingle();
      return { data, error };
    },
    countRecentByIp: async (ip, sinceIso) => {
      const { count, error } = await admin
        .from(TABLE)
        .select("id", { count: "exact", head: true })
        .eq("consent_ip", ip)
        .gte("created_at", sinceIso);
      return { count, error };
    },
    insert: async (row) => {
      const { data, error } = await admin.from(TABLE).insert(row).select("id").single();
      return { data, error };
    },
    markNotified: async (id, patch) => {
      const { error } = await admin.from(TABLE).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      return { error };
    },
  };
}

export async function submitDigitalServicesEnquiry(formData: FormData): Promise<IntakeResult> {
  if (!digitalServicesPublic()) return { ok: false, errors: { _: "This page isn't open yet." } };
  return processIntake(
    {
      idempotency_key: str(formData, "idempotency_key"),
      business_name: str(formData, "business_name"),
      contact_name: str(formData, "contact_name"),
      email: str(formData, "email"),
      phone: str(formData, "phone"),
      website: str(formData, "website_url"),
      interest: str(formData, "interest"),
      message: str(formData, "message"),
      consent: str(formData, "consent") === "on",
      honeypot: str(formData, "website"),
    },
    {
      store: storeFor(),
      now: () => new Date(),
      log: (m) => console.error(m),
      meta: await requestMeta(),
      // Reference and link only: the customer's details stay in the
      // owner-only queue, not in an inbox.
      notifyOwner: async (reference) => {
        const text = [
          `New digital-services enquiry ${reference}.`,
          ``,
          `Open the owner queue to read it: ${BASE_URL}/dashboard/owner`,
          ``,
          `No customer details are included in this email.`,
        ].join("\n");
        const r = await sendEmail({
          to: alertDestination(),
          from: DEFAULT_FROM,
          subject: `[Digital services] New enquiry ${reference}`,
          text,
          html: `<p>New digital-services enquiry <strong>${reference}</strong>.</p><p><a href="${BASE_URL}/dashboard/owner">Open the owner queue</a> to read it.</p><p>No customer details are included in this email.</p>`,
        });
        if (r.ok) return { ok: true };
        return { ok: false, error: r.reason === "api_error" ? `${r.status ?? ""} ${r.error}`.trim() : r.reason };
      },
    }
  );
}
