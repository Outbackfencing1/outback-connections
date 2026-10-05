// lib/digital-services/flags.ts
// The public digital-services page is off unless DIGITAL_SERVICES_PUBLIC is
// exactly "on". A missing, misspelt or accidental value leaves it off; it
// never affects the marketplace. The owner area does not depend on it.
export function digitalServicesPublic(env: Record<string, string | undefined> = process.env): boolean {
  return env.DIGITAL_SERVICES_PUBLIC === "on";
}
