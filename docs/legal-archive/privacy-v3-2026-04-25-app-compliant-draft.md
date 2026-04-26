# Privacy notice — frozen snapshot

- **Version:** `v3-2026-04-25-app-compliant-draft`
- **Effective from:** 25 April 2026
- **Source path at time of writing:** `app/privacy/page.tsx`
- **Status:** **Current** (still served on `/privacy` as of 26 April 2026)

This file is the authoritative wording of the version named above. Any
user who consented to this version agreed to the text described here.
The live page may have evolved; this snapshot does not change.

## Where to read the full text

The full rendered text is published at:

- Live: <https://www.outbackconnections.com.au/privacy>
- Source: [`app/privacy/page.tsx`](../../app/privacy/page.tsx) at git
  ref where this snapshot was filed

## What it covers

- All 13 Australian Privacy Principles (APP 1 – APP 13).
- 72-hour OAIC notification commitment for notifiable data breaches.
- Processor list: Supabase (Sydney region), Vercel (US region for edge,
  data residency disclosure), Resend (US region, transactional email).
- Under-18 ban with deletion procedure.
- OAIC complaints path.
- 7-year defamation/legal-evidence retention exception.
- Right of access (APP 12) and right of correction (APP 13) with
  practical pathway via `/dashboard/privacy`.

## Reproduce

To reproduce the exact wording of this version, check out the file at
the commit where this archive entry was added:

```
git log --diff-filter=A --follow -- docs/legal-archive/privacy-v3-2026-04-25-app-compliant-draft.md
```

Then `git show` the commit before it was last edited to see the
matching `app/privacy/page.tsx`.

## Database link

This version exists as a row in `public.policy_versions`:

| version | kind | source_path |
|---------|------|-------------|
| `v3-2026-04-25-app-compliant-draft` | privacy | `app/privacy/page.tsx` |

Foreign-key references from `user_profiles.terms_consent_version` and
`listings.policy_version_id` pin specific consent moments to this row.
