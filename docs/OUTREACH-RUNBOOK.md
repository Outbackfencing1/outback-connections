# Outreach runbook — directory + contractor outreach

For Ali, Jess, Daryl and Josh. How the tools fit together and what not to do.

## The loop

1. **Find** a fencing contractor (Facebook, Yellow Pages, TrueLocal, Google
   Maps, their website).
2. **Add** it at **Dashboard → Add a directory entry**
   (`/dashboard/directory/add`). It goes in as an *unclaimed* listing with a
   business record, says where you found it, and keeps phone/email private.
   Adding the same name + postcode again updates it instead of duplicating.
3. **Work the queue** at **Admin → Contractor outreach**
   (`/dashboard/admin/contractor-outreach`): filter by town/state/status, log
   calls, SMS, WhatsApp, notes, follow-ups, assignment.
4. **Invite** them to claim: **Send invite email** (one click, from
   help@outbackconnections.com.au, logged automatically, one per 14 days) or
   the Copy invitation / Open email / Open SMS buttons for a personal message.
   Every invite links to `/claim/<business>`.
5. **They claim** → the claim lands in **Admin → Claims**
   (`/dashboard/admin/claims`) → approve → the listing shows their confirmed
   details and the Unclaimed badge disappears.
6. **Trade pitch.** Fencing listings and the claim page carry the disclosed
   Outback Fencing trade-pricing card (clipgun link with UTM). Contractors who
   claim are warm leads for the wholesale pipeline.

## Quote requests (enquiries)

Farmers can ask any service listing for a quote without an account
(**Get a quote** on the listing). Requests land in **Admin → Enquiries**
(`/dashboard/admin/enquiries`) and in the help@ inbox.

- **Unclaimed listing**: a person forwards it. The contractor's private phone
  and email are shown on the queue row. Call or text them, then **Mark
  forwarded**. This is also the best claim pitch there is: "a farmer near you
  wants a quote; claim your listing and these come straight to you."
- **Claimed listing**: the business is emailed automatically; the row arrives
  as *forwarded*. Nothing to do unless they don't reply.
- The farmer's details go to that one business only, and are deleted after
  12 months.

## Never do this

- **Never** add someone else's business through **Post a listing**. That form
  is for your own business: it publishes contact details and marks the
  listing as posted by you. The site now warns you if you try.
- Never paste a scraped phone number or email into a public field. The
  private fields on the add form are the right place.
- Never send a second cold ask to the same business (Josh's first-touch rule).
  Rural stores get the clip-gun pitch first; contractors get the claim invite.

## Statuses (outreach workspace)

`not_contacted → attempted → contacted → interested → invite_sent → follow_up → joined`,
plus `not_interested`, `invalid_duplicate`, `do_not_contact` (these three
disable all contact buttons). Someone who says "remove me" = `do_not_contact`
and close the listing.

## Monthly refresh (first Monday)

Unclaimed entries expire 60 days after they were added or last re-added. The
team gets one email per entry 7 days before it expires. To keep an entry:
re-add it (same name + postcode) via the add form, or re-run the import for
its source. Better: get it claimed, then it never expires this way.

## Numbers that matter

`/dashboard/admin/analytics` → **Traction gate**: human searches per week
(target 25), claims in 30 days (target 5), first-party posts in 30 days
(target 10). Crawlers are excluded.

## Links Jess posts

Always add `?utm_source=facebook&utm_medium=jess_organic` to any link posted
on Facebook, or the traffic can't be attributed.
