/**
 * Allow only same-site absolute paths in auth redirects. This keeps claim and
 * contact flows intact without creating an open-redirect surface.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    // Any control character: browsers drop tabs and newlines inside URLs, so
    // "/\t/evil.com" would become "//evil.com" (off-site).
    /[\u0000-\u001f\u007f]/.test(value) ||
    value.length > 2048
  ) {
    return "/dashboard";
  }
  return value;
}

/** Sign-in URL that comes back to `path` (query included) afterwards. */
export function signInHref(path: string): string {
  return `/signin?next=${encodeURIComponent(safeNextPath(path))}`;
}
