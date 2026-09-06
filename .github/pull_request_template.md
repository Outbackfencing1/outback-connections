## What changed

<!-- One paragraph. What a reader sees differently after this merges. -->

## Why

<!-- The problem or decision this serves. Link HANDOFF.md decisions if relevant. -->

## Honesty + privacy check (AGENTS.md rules 1–4)

- [ ] No third-party business is written as owner-posted (`data_source='manual'`)
- [ ] No scraped phone/email lands in public contact columns
- [ ] No `JobPosting` JSON-LD on scraped or syndicated rows
- [ ] No farmer enquiry data or contractor private contact reaches a public surface

## Database

- [ ] No schema change
- [ ] Migration file(s) added under `supabase/migrations/` with rollback note, and applied to the live project
- [ ] Supabase security advisors checked after applying

## Gate

- [ ] `npx tsc --noEmit` green
- [ ] `npm run lint` green
- [ ] `npm run build` green
- [ ] Manual steps still required before/after deploy (list them, and mirror in `HANDOFF.md`):
