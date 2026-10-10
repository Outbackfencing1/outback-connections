// lib/postcode-input.ts
// What someone typed in a postcode box. Australian postcodes are four digits;
// one to three digits is a deliberate "starts with" search (e.g. "28" for
// the Central West). Anything else is a typo, so the page says so instead of
// showing a false "no listings" state.
export type PostcodeInput =
  | { kind: "none" }
  | { kind: "invalid"; raw: string }
  | { kind: "prefix"; value: string }
  | { kind: "postcode"; value: string };

export function checkPostcodeInput(raw: string | null | undefined): PostcodeInput {
  const value = (raw ?? "").trim();
  if (!value) return { kind: "none" };
  if (/^\d{4}$/.test(value)) return { kind: "postcode", value };
  if (/^\d{1,3}$/.test(value)) return { kind: "prefix", value };
  return { kind: "invalid", raw: value.slice(0, 20) };
}

/** The value to filter on: a postcode or prefix, never a typo. */
export function postcodeFilterValue(input: PostcodeInput): string {
  return input.kind === "postcode" || input.kind === "prefix" ? input.value : "";
}
