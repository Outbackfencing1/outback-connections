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
