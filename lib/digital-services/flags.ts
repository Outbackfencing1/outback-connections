// lib/digital-services/flags.ts
// The public digital-services page is off unless DIGITAL_SERVICES_PUBLIC is
// exactly "on". A missing, misspelt or accidental value leaves it off; it
// never affects the marketplace. The owner area does not depend on it.
export function digitalServicesPublic(env: Record<string, string | undefined> = process.env): boolean {
  return env.DIGITAL_SERVICES_PUBLIC === "on";
}

export type AlertReadiness = { ok: boolean | null; detail: string };

/**
 * Owner-alert readiness for the owner dashboard. A destination alone isn't
 * enough: without RESEND_API_KEY, sendEmail() only logs, and every enquiry is
 * saved with "owner alert not confirmed". A set key is configuration, not
 * proof of delivery; each enquiry's notified_at is the per-alert evidence.
 */
export function alertReadiness(env: Record<string, string | undefined> = process.env): AlertReadiness {
  if (!env.RESEND_API_KEY?.trim()) {
    return {
      ok: false,
      detail: "RESEND_API_KEY isn't set on this environment: alerts are only logged, never emailed. Set it before switching the page on.",
    };
  }
  if (!env.DIGITAL_SERVICES_ALERT_TO?.trim()) {
    return {
      ok: null,
      detail: `Mail transport configured. Alerts fall back to ${alertDestination(env)}; set DIGITAL_SERVICES_ALERT_TO for a dedicated address.`,
    };
  }
  return {
    ok: true,
    detail: "Mail transport configured; alerts go to the dedicated owner address. Each enquiry shows whether its alert was confirmed.",
  };
}

const DEFAULT_ALERT_TO = "help@outbackconnections.com.au";

/**
 * The owner-alert recipient: DIGITAL_SERVICES_ALERT_TO, else
 * NOTIFICATION_EMAIL, else help@. Each is trimmed, so a blank or padded
 * value falls through instead of becoming a bad Resend recipient.
 */
export function alertDestination(env: Record<string, string | undefined> = process.env): string {
  return env.DIGITAL_SERVICES_ALERT_TO?.trim() || env.NOTIFICATION_EMAIL?.trim() || DEFAULT_ALERT_TO;
}

/**
 * The privacy notice must keep describing the enquiry form for as long as
 * enquiries it collected are kept (12 months), not only while the form is
 * live. DIGITAL_SERVICES_LAUNCHED_ON is the date the page was first switched
 * on; leave it set until 12 months after the page is switched off.
 */
export function digitalServicesNoticeShown(env: Record<string, string | undefined> = process.env): boolean {
  return digitalServicesPublic(env) || /^\d{4}-\d{2}-\d{2}$/.test(env.DIGITAL_SERVICES_LAUNCHED_ON?.trim() ?? "");
}

/**
 * The daily purge of digital-services enquiries. Before the feature has ever
 * been switched on, its migration may not be applied, so a missing function
 * is expected and fine. Any other error, or a missing function once the page
 * has launched, is a failure the cron must report so it's retried and seen:
 * enquiries must not outlive the promised 12 months silently.
 */
export function purgeOutcome(
  error: { code?: string; message: string } | null,
  env: Record<string, string | undefined> = process.env
): "purged" | "not_installed" | "failed" {
  if (!error) return "purged";
  const missing = error.code === "PGRST202" || error.code === "42883";
  return missing && !digitalServicesNoticeShown(env) ? "not_installed" : "failed";
}
