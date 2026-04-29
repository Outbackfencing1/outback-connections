# HANDOFF

Date: 2026-04-27
Branch: `main` · HEAD: `b712f6f` · pushed to `origin/main` · working tree clean.

## State

- **Production is live** at https://www.outbackconnections.com.au.
- The marketplace (auth, schema, browse, posting, dashboard, admin) is fully built and shipped — the May 15 MVP build window in `PLAN-MARKETPLACE.md` never needed to happen, we accelerated. **`PLAN-MARKETPLACE.md` is stale; do not treat it as a build plan.**
- Last meaningful commit: `b712f6f` — `chore(email): sweep support@outbackfencingsupplies → help@outbackconnections`.
- Today's work was a 23-item legal hardening pass on top of the live site (see `LEGAL-HARDENING-PASS.md`).

## Email sender — important

Outgoing transactional email still sends **from `support@outbackfencingsupplies.com.au`** (the Resend-verified domain). The site copy and reply-to addresses point at `help@outbackconnections.com.au`, but the actual From header won't switch until Resend DNS verification on `outbackconnections.com.au` completes.

## Parked items (do not pick up without confirming)

1. **Sentry DSN** — `lib/sentry.ts` is a no-op stub. Needs `SENTRY_DSN` env var and `npx @sentry/wizard@latest -i nextjs`.
2. **`account_deletions` wiring** — table exists; the existing delete-account flow in `/dashboard/settings` doesn't yet write a row.
3. **Lawyer review** — see "What still needs the lawyer" in `LEGAL-HARDENING-PASS.md`.

## Resume order

When picking back up, read in this order:

1. `LEGAL-HARDENING-PASS.md` — what shipped today, env vars, smoke tests, lawyer items.
2. `LINK-AUDIT.md` — current routing / link map.
3. `PHASE-1-AUDIT.md` — Phase 1 surface audit.

Then decide what to pick up — do not assume `PLAN-MARKETPLACE.md` is current.
