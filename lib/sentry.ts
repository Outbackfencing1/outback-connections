// lib/sentry.ts
// Sentry stub. The SDK isn't installed yet; this file is a no-op until
// SENTRY_DSN is set AND @sentry/nextjs is installed via the wizard:
//
//   npx @sentry/wizard@latest -i nextjs
//
// The wizard generates sentry.client.config.ts, sentry.server.config.ts,
// sentry.edge.config.ts, and updates next.config.js. After it runs, the
// captureException() call below should be replaced with a re-export of
// Sentry.captureException — or the wizard will do it automatically.
//
// Until then, captureException is a console.error so calls in the
// codebase are forward-compatible. Always call captureException from
// catch blocks where the failure is interesting (e.g. unexpected DB
// errors, payment failures, abuse detection) so the eventual Sentry
// integration starts capturing useful events on day one.

export type CaptureContext = {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  user?: { id?: string; email?: string };
};

export function captureException(err: unknown, context?: CaptureContext): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.error("[sentry-stub] would capture:", err, context);
    return;
  }
  // When @sentry/nextjs is installed and the wizard has wired up the
  // SDK, replace this branch with:
  //   const Sentry = await import("@sentry/nextjs");
  //   Sentry.captureException(err, context);
  console.error("[sentry-stub] DSN configured but SDK not installed:", err, context);
}

export function captureMessage(msg: string, context?: CaptureContext): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.warn("[sentry-stub] would capture message:", msg, context);
    return;
  }
  console.warn("[sentry-stub] DSN configured but SDK not installed:", msg, context);
}
