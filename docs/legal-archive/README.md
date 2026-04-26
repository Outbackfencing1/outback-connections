# Legal documents archive

Frozen snapshots of every public legal document we've ever shipped.
Each file is named `<kind>-<version>.md` and corresponds to a row in
the `policy_versions` Supabase table.

When we update a public legal document we:

1. Save a snapshot of the current published version into this directory
   under the existing version stamp (so the file matches the version
   that any user agreed to).
2. Bump the in-page `POLICY_VERSION` constant in the relevant
   `app/<page>/page.tsx`.
3. Insert a new row into `policy_versions` referencing the new
   version stamp.
4. Save the new draft into this directory under its new version stamp.
5. Update `MEMORY.md` (project memory) with the version pivot reason.

Why
---

- A user who consented to v3 has agreed to *that text*. Showing them
  v4 doesn't change what they agreed to.
- A defamation, copyright, or consumer-law claim turns on the wording
  of the policy at the time. We need to be able to evidence that
  wording.
- The `policy_versions` table provides a uuid each row pinned in
  `listings.policy_version_id`, `user_profiles.terms_consent_version`,
  etc. The markdown file is the human-readable version of that row.

Naming
------

`<kind>-<version>.md`

Examples:

- `terms-v3-2026-04-25-defamation-hardened-draft.md`
- `terms-v4-2026-04-26-legal-hardening-draft.md`
- `privacy-v3-2026-04-25-app-compliant-draft.md`

The version slug is the `version` column in `policy_versions`, which is
also what appears at the top of each public legal page.

Files
-----

The current shipped versions are reproduced verbatim from the live
pages. The version stamps in these files are authoritative — if a user
agreed to a version that no longer exists in the codebase, the agreed
text lives here.
