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
    /[\r\n\0]/.test(value) ||
    value.length > 2048
  ) {
    return "/dashboard";
  }
  return value;
}
