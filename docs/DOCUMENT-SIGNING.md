# Document signing — design

Status: built 2026-09-16 (branch `fix/doc-signing`). Written 2026-09-15 against
production schema (project `yqklrkpptnhubsnijqze`) with 0 rows in
`public.documents`, so nothing here migrates live data — every change is
additive or a fresh lockdown. See **Revision log (2026-09-16)** immediately
below for what changed from the original design during implementation, and
why — read it before the rest of this document, since several sections below
now describe the pre-revision design and are superseded by the log.

## Revision log (2026-09-16)

A pre-implementation review raised six must-change findings and nine
should-consider items against the original §1–§9 design below. Every
must-change item was fixed before shipping; this log records what changed and
why, and is the "revision log" every implementation file's comments refer
back to.

### Must-change 1 — race condition / no atomic state transition (sign, countersign)

**Original design (§1):** "a single Postgres function called via `rpc`, so
the hash/lock/certificate write is atomic."

**What shipped instead:** no new SECURITY DEFINER SQL function for
sign/countersign/decline at all. Every terminal write is a **compare-and-swap
UPDATE performed directly by the edge function's service-role client** — the
`WHERE` clause re-checks every precondition (`status = 'pending'`,
`candidate_signed_at IS NULL`, etc.) at the moment of the write, not just at
an earlier `SELECT`. Postgres always serializes concurrent `UPDATE`s to the
same row (the second waits for the first's row lock, then re-evaluates its
own `WHERE` against the now-committed row) — this gives the exact same
atomicity guarantee as a `SELECT ... FOR UPDATE` inside a wrapping function
(the pattern `submit_voice_interview_manual_end` already uses,
`20260915110000_*.sql`), without adding a second SECURITY DEFINER surface
whose own privileges need independent review. `sign` and `decline` are a
single CAS UPDATE each — the audit-log insert and notification only run if
the UPDATE actually affected a row, so a losing race never produces a
duplicate audit row.

`countersign` is genuinely two-phase, because it renders and uploads to a
**fixed** Storage path (`documents/<id>/final.pdf`) — a DB-only CAS isn't
enough on its own, because two concurrent calls could both pass a DB
precondition check and then both race to upload to that same object,
independently of which one's DB write ultimately wins:

1. **Reserve** — `UPDATE documents SET employer_signed_at = now() WHERE id =
   $1 AND status = 'pending' AND candidate_signed_at IS NOT NULL AND
   employer_signed_at IS NULL AND is_locked = false AND is_voided = false`.
   This is the CAS: only one of two racing calls can ever match this `WHERE`
   clause and affect a row. The loser gets 0 rows back and returns
   `already_signed` immediately — **before touching Storage at all**. This is
   the piece that actually closes the storage-race half of the finding: by
   construction, only the single reservation winner ever reaches the
   render/upload step for a given document, so the object at
   `documents/<id>/final.pdf` can never be written by two callers.
2. **Finalize** — only the winner renders the PDF, uploads it, computes
   `final_pdf_hash` from the exact bytes it just rendered, builds the
   certificate, and writes everything (`status = 'signed'`, `is_locked =
   true`, `final_pdf_hash`, `completion_certificate`, `signed_at`, …) in one
   `UPDATE ... WHERE id = $1 AND employer_signed_at = <the reservation
   timestamp>` — a second CAS, defense-in-depth (by construction no other
   caller could reach this point for this document, but the clause costs
   nothing and catches a bug elsewhere).
3. **Rollback** — if rendering, the Storage upload, or the finalize write
   throws, the edge function resets `employer_signed_at` back to `NULL` with
   its own CAS (`WHERE employer_signed_at = <reservation timestamp> AND
   status = 'pending' AND is_locked = false`), so a transient failure (a
   render error, a Storage hiccup, a network blip) doesn't strand the
   document permanently "claimed" with no way for a retry to proceed. This
   is a real, accepted gap in the *original* two-phase idea that this
   revision closes rather than leaving open.

Proven directly in `scripts/document_signing_guard_pglite_check.mjs` (the
trigger/RLS side) and by static source checks in
`scripts/guards/document-signing.mjs` (`countersign-terminal-write-is-a-compare-and-swap`,
which specifically checks the Storage upload happens *after* the reservation
CAS, not before).

### Must-change 2 — legally-significant IP is sourced from a spoofable header

**Original design (§1, §4):** capture signing IP via `x-forwarded-for`'s
first hop, reusing `callerId()` from `_shared/rateLimit.ts`.

**Finding's own words, confirmed correct:** trusting the first XFF hop on a
public HTTPS endpoint is exactly as spoofable as a client-supplied body field
would be — X-Forwarded-For is not a browser-forbidden header, and anything
downstream of the browser (devtools fetch, curl, a modified client) can set
it to anything.

**What shipped:** this implementation could not, within this session,
independently verify what — if anything — Supabase's Edge Runtime guarantees
about appending (vs. simply passing through) a caller's `X-Forwarded-For`
header, so it does **not** assert a platform guarantee it can't prove (the
finding's first suggested fix). Instead it takes the **fix explicitly offered
as the alternative**: `_shared/bestEffortIp.ts` takes the **last** hop of
X-Forwarded-For (the position a reverse-proxy chain conventionally appends
to, rather than the position the client itself controls first) as a
marginally-better-than-nothing signal, and — the more important half of the
fix — **every surface that displays this value is now explicitly labeled
"self-reported"**, not presented as independently verified:
`completionCertificate.ts`'s two `IP Address (self-reported):` lines,
`certificatePDF.ts`'s two matching labels, `pdfSignatureBurner.ts`'s two
matching labels, and `AuditCertificate.tsx`'s table header. The code comment
in `bestEffortIp.ts` spells out this reasoning and explicitly does not claim
more than it can prove.

### Must-change 3 — `is_voided`/`voided_at`/`voided_reason` are unguarded

**Original design (§5):** these three columns were left off both the
closed-document and still-pending disallow lists in
`protect_document_columns()`.

**What shipped:** this revision took the **more conservative** of the
finding's two suggested fixes — not "route voiding through the edge function
with its own audit action" (which would invent a whole new product surface —
a void UI, a void audit-log action, a void notification — that nothing in
this pass's SCOPE calls for, and that the should-consider list explicitly
frames as a separate product decision: *"An employer has no path in this
design to withdraw/cancel a document before the candidate signs... worth a
product call on whether at least a minimal void action belongs in this
pass"*) — but **block writes to all three columns outright, on every
document, pending or closed**, not just on signed/locked/declined ones as the
finding's minimum bar asked for. A repo-wide grep (repeated at
implementation time, same result as the original design's own grep) confirms
nothing today writes these columns, so blocking them everywhere has zero
functional cost and fully closes the concrete regression (an employer-side
party silently invalidating a locked, completed document with no audit
trail) without inventing scope. Voiding stays a real, separate, not-yet-built
flow — a future migration's job, once product actually wants it. Proven in
`scripts/document_signing_guard_pglite_check.mjs` (both the pending-document
and the locked-document cases) and `scripts/guards/document-signing.mjs`.

### Must-change 4 — `signed_at` is never set, but every mounted UI surface reads it

**Original design (§1, §3):** neither `sign` nor `countersign` ever set
`documents.signed_at`.

**What shipped:** the `countersign` finalize write sets `signed_at = <the
reservation timestamp>` alongside `status = 'signed'` and `is_locked = true`
— the cheapest fix the finding itself named as preferred, and the one
`verify-document`'s own existing fallback (`document.signed_at ||
document.employer_signed_at`) already anticipated. `sign` deliberately does
**not** set it — the document is still `pending` after only the candidate has
signed, and `signed_at` means "the document is done," which matches every
read site the finding enumerated (`SignedDocumentViewer.tsx`'s header,
identity bar, completion strip, audit-trail identity bar, both audit
export paths, the certificate/PDF footer; `useActivityFeed.ts`'s
`status === "signed" && doc.signed_at` gate). No read site needed to change.
Proven in `scripts/guards/document-signing.mjs`
(`sign-and-countersign-set-signed-at`).

### Must-change 5 — `assigned_job_ids IS NULL` vs. `array_length(..., 1) IS NULL`

**Original design (§5):** `tm.assigned_job_ids is null` as the "every job"
check.

**What shipped:** replaced with this codebase's own live convention,
confirmed via `pg_get_functiondef` against `is_active_team_member_for_job()`
and the live `"Team members can update documents if permitted"` policy
before writing the fix — `array_length(tm.assigned_job_ids, 1) IS NULL`. A
team member scoped to `'{}'::uuid[]` (empty, not genuinely `NULL`) is now
correctly treated as "every job" by the trigger, matching what RLS already
grants them, instead of being misclassified into the trigger's unrestricted
pass-through branch. Proven in
`scripts/document_signing_guard_pglite_check.mjs` with the exact
should-consider-flagged case: a team member with `assigned_job_ids = '{}'`
is both (a) still correctly fenced from signing columns, and (b) still able
to write the ordinary columns an employer-side caller may touch — proving
they're recognized as employer-side, not accidentally locked out of
everything either. Also covered as its own case in
`scripts/document_signing_state_machine.test.mjs`'s `resolveDocumentRole`
tests (the pure TS mirror of the same convention, used by the edge
function's own role resolution).

### Must-change 6 — legacy `signature_data`/`signed_at` are unguarded

**Original design (§5, §9):** neither disallow list mentioned these two
columns, directly contradicting §9's claim that they're "covered by §5's
trigger like every other column."

**What shipped:** `new.signature_data IS DISTINCT FROM old.signature_data`
and `new.signed_at IS DISTINCT FROM old.signed_at` were added to **both**
disallow lists (closed and still-pending). This closes a real integrity gap
that got *more* consequential once must-change 4 shipped: `signed_at` is now
the live, UI-displayed completion date on a locked, certificate-bearing
document, so leaving it writable would let any employer/team-member client
forge the displayed completion timestamp after the fact. Proven in
`scripts/document_signing_guard_pglite_check.mjs` and
`scripts/guards/document-signing.mjs`.

### Should-consider items — resolutions

1. **`can_send_documents` as the sole gate for countersigning.** Not
   changed — this implementation pass doesn't have standing to make that
   product/security call unilaterally. Flagged here again for an explicit
   sign-off: granting `can_send_documents` today also grants binding
   countersignature authority on the employer's behalf, which is materially
   more than "may send a document."
2. **Typed-signature identity correlation.** Not implemented — the typed
   value is still only length-validated (2–120 chars), with no check against
   `profiles.full_name`. Flagged, not fixed: a correlation check changes what
   counts as a *valid* signature (a real product/legal decision, e.g. "warn"
   vs. "block" on mismatch), not a pure security fence like the six
   must-change items.
3. **Decline captures IP/UA.** Fixed — the `decline` CAS UPDATE sets
   `ip_address`/`user_agent` the same way `sign`/`countersign` do, and its
   audit-log row goes through the same `insertAuditLog` helper, which always
   attaches IP/UA.
4. **Storage bucket policy scoping for `final.pdf`.** Resolved by design
   change, not by touching the bucket policy: rather than trust the private
   `documents` bucket's existing (uploader-folder-scoped) RLS to authorize a
   client-side `createSignedUrl` call against a `documents/<documentId>/...`
   path it was never written to match, the edge function gained a fourth
   action, `download`, which verifies the caller is a real party
   server-side (same role resolution as every other action) and mints a
   short-lived (300s) signed URL itself. The bucket's existing per-uploader
   policy is untouched and never needs to authorize per-document access at
   all.
5. **`employer_signature_data`'s exact JSON shape.** Pinned down:
   `{"signatures":{"employer": <value>},"method":...,"signerName":...}` —
   confirmed against `SignedDocumentViewer.tsx`'s own
   `parsed.signatures?.employer` read before writing the edge function.
6. **Canonical PDF must draw the signatures, not just body text.** Done —
   both `renderSignedUploadedPdf` and `renderTextDocumentPdf` in
   `_shared/renderFinalPdf.ts` embed both signature images (when present)
   before the certificate page, not just the document body.
7. **No employer withdraw/cancel path before the candidate signs.** Not
   built — still out of scope for this pass, same reasoning as must-change 3.
   Recorded here as a known, accepted product gap, not silently dropped.
8. **`signing_order` is hardcoded, not a real enum.** Unchanged — still
   hardcoded to `'candidate_first'` everywhere (the edge function's
   preconditions, the certificate builder). Acknowledged, not fixed — out of
   scope for a signing-flow pass to redesign an unrelated column's typing.
9. **PGlite guard needs the empty-array team-member case.** Fixed — see
   must-change 5's proof description above; it's in the same PGlite file,
   not a separate one.

### Other implementation deviations from the original §1–§9 text

- **No new SECURITY DEFINER SQL functions ship in the migration at all** —
  only `protect_document_columns()` and the DELETE policy swap. See
  must-change 1. Everywhere below that says "a single Postgres function...
  called via rpc" describes the superseded original design.
- **State-machine/authorization tests are Node tests, not Deno tests** —
  `scripts/document_signing_state_machine.test.mjs` and
  `scripts/document_signing_hash_and_certificate.test.mjs`, not
  `stateMachine.test.ts`. This repo's actual required-check list
  (`CLAUDE.md`) runs `node scripts/*.test.mjs`, not `deno test`; Node 24+
  strips the pure TS modules' type annotations natively (same convention
  already used by `scripts/score_aggregation.test.mjs` and
  `scripts/step_gate.test.mjs`, which import straight from
  `supabase/functions/_shared/*.ts` and `src/lib/*.ts`). The
  `renderFinalPdf.ts` determinism test *is* a `Deno.test`
  (`renderFinalPdf.test.ts`) since it needs `pdf-lib` via the same
  `esm.sh` import style the function itself uses, which Node can't resolve.
- **Geolocation is not looked up server-side.** §3's certificate shape keeps
  `location: {city, region, country}`, but the server-side certificate
  builder (`_shared/completionCertificateServer.ts`) defaults it to
  `"Unknown"` rather than calling `geolocate-ip` — added scope (an extra
  network round-trip and a third-party dependency inside the countersign
  critical path) for a field this design otherwise treats as best-effort.
  Flagged here rather than silently shipped as if it matched §3 exactly.

### Repairer pass — two blocking findings on the first implementation

A code review of the first `document-signing`/index.ts implementation found
two real bugs, both fixed in place (no design change needed):

1. **Orphaned audit rows on a failed-then-retried countersign.** The
   `employer_review_confirmed` and `employer_countersigned`
   `document_audit_logs` rows (and, further down, `document_completed`) were
   inserted *before* the render/upload/finalize steps that can genuinely
   fail (a bad fetch of the original PDF, a Storage hiccup, a network
   blip — the countersign handler's own catch block already anticipated
   this). The catch block only rolled back `employer_signed_at`, never the
   audit rows already written, so a failed attempt left a permanent,
   contradictory "employer countersigned" attestation for a countersign
   that never completed — and a later successful retry's
   `buildCompletionCertificate` call folds *every* audit row for the
   document into `audit_trail_hash`/`audit_entries_count`, so the shipped
   certificate would permanently include the duplicate. This is a distinct
   failure mode from the concurrent-race case must-change 1 covers ("a
   losing race never produces a duplicate audit row" — true for two
   simultaneous callers, not for one caller's own failed-then-retried
   attempt).

   The finding's own suggested fix ("make the catch block also delete the
   specific audit rows this attempt inserted") turned out not to be
   available: `document_audit_logs` carries a live, unconditional
   `BEFORE DELETE` trigger (`prevent_audit_delete` /
   `block_audit_modification()`, confirmed against the live database while
   fixing this — it `RAISE EXCEPTION`s for every caller, with no
   `service_role` exemption, unlike `enforce_audit_log_identity`). A
   `DELETE` from the edge function's own service-role client would itself
   throw, inside the catch block, before the reservation rollback that
   follows it ever ran — strictly worse than the original bug.

   Fix actually shipped (the finding's *first* suggested option, adapted):
   the `employer_review_confirmed`/`employer_countersigned` audit entries
   are now built as plain in-memory `CertificateAuditEntry` records —
   `action`, `created_at: nowIso`, `user_id: callerId`, `document_hash` —
   before any render/Storage I/O, since every field they need is already
   known at that point. `buildCompletionCertificate` reads that in-memory
   array (existing DB rows plus these two), exactly reconstructing what the
   old code got from re-querying the table after inserting into it. The
   real `document_audit_logs` inserts for
   `employer_review_confirmed`/`employer_countersigned`/`document_completed`
   now happen only *after* the finalize `UPDATE` has been confirmed to
   affect a row — by which point the document is genuinely, durably signed,
   so a failure in this last, best-effort audit-write step is logged and
   swallowed rather than surfaced as a user-facing failure for an action
   that already succeeded. A failed-then-retried attempt now leaves zero
   audit rows behind, rather than orphaned ones with no way to remove them.
2. **Completion certificate's candidate email was always blank.** `sign`
   never stored the candidate's own email in `candidate_signature_data`
   (only `signerName`), so `countersign`'s attempt to recover it —
   `callerEmail === candidateParsed?.signerEmail ? callerEmail : ...` —
   compared the *employer's* own email (the countersign caller) against a
   field that was always `undefined`, which can never match, so the
   expression always resolved to `""`. The candidate's email was blank on
   both the rendered PDF certificate page and the stored
   `completion_certificate` JSON, while the employer's own email field on
   the same certificate was correctly populated. Fix: `sign` now includes
   `signerEmail: callerEmail` (the candidate's own profile email, already
   in scope) in the stored `candidate_signature_data` JSON; `countersign`
   reads `candidateParsed?.signerEmail` directly, with no self-comparison,
   for both the certificate JSON and the burned-PDF certificate page.

### Repairer pass (second round) — three blocking findings

A second review of the migration and `renderFinalPdf.ts` (after the first
repairer round above had already shipped) found three real bugs, all fixed
in place:

1. **Employer can bait-and-switch document content after the candidate
   signs.** `protect_document_columns()`'s "still pending" branch never
   blocked `new.file_url` / `new.name` / `new.document_type` /
   `new.expires_at` — the closed-document branch blocks them, but the
   pending branch never did, on the (correct, but too broad) reasoning that
   `DocumentWizard` legitimately re-saves these fields right after insert,
   before anyone has signed. That left a real window open: after the
   candidate signs (`candidate_signed_at` set, `v2_hash` locked in) and
   before the employer countersigns, the document is still `status =
   'pending'`, so an employer (or a `can_send_documents` team member) could
   rewrite the actual file/name/type via a plain client `UPDATE`, then
   countersign the swapped content — `status` flips to `signed`,
   `is_locked = true`, and the certificate is produced with
   `v1_hash`/`v2_hash`/`candidate_signed_at` all unchanged (the hash chain
   still reads as continuous), while the real `final.pdf`/`final_pdf_hash`
   reflect content the candidate never reviewed or signed. Reproduced
   directly against the migration applied verbatim in PGlite before fixing:
   an employer `UPDATE` renaming/swapping `file_url` on a document with
   `candidate_signed_at` set succeeded with no exception.

   Fix: added a guard, scoped only to the window this finding actually
   describes — `old.candidate_signed_at IS NOT NULL AND (new.name IS
   DISTINCT FROM old.name OR new.file_url IS DISTINCT FROM old.file_url OR
   new.document_type IS DISTINCT FROM old.document_type OR new.expires_at
   IS DISTINCT FROM old.expires_at)` — inside the still-pending branch. An
   employer can still freely re-save these fields before the candidate has
   signed at all (the legitimate `DocumentWizard` case the original
   reasoning was protecting), but not after. Proven in
   `scripts/document_signing_guard_pglite_check.mjs` (both the blocked
   post-signature swap and the still-allowed pre-signature edit) and
   `scripts/guards/document-signing.mjs`
   (`protect-document-columns-blocks-content-swap-after-candidate-signs`).

2. **Countersign crashes on uploaded-PDF documents when either party typed
   their signature.** `renderFinalPdf.ts`'s `renderSignedUploadedPdf` ->
   `overlaySignature` called `dataUrlToBytes(sig.signatureDataUrl)` with no
   try/catch around that specific call — only the following
   `embedPng`/`embedJpg` was guarded. A typed signature's stored value
   (`DocumentSigningPanel.tsx`'s "Type" tab: `typedValue.trim()`) is the
   plain signer name, not a `data:` URL, and `dataUrlToBytes`'s `await
   fetch(dataUrl)` throws a hard `TypeError: Invalid URL` for any non-URL
   string. The exception propagated out of `renderSignedUploadedPdf` into
   the countersign handler's outer `try`/`catch`, which rolled back the
   reservation (`employer_signed_at` reset to `null`) and returned a
   generic 500 — permanently, since the candidate's stored typed signature
   never changes between retries; only re-signing by drawing instead of
   typing would unblock it, and nothing told either party that. Confirmed
   with a direct reproduction: `deno test` against the pre-fix file threw
   `TypeError: Invalid URL: 'Erin Employer'` from exactly this call site;
   the equivalent call with a real PNG data URL succeeded.
   `renderTextDocumentPdf`'s own `drawSignatureBlock` (the AI-generated/text
   document path) already wrapped the identical call, so only the
   uploaded-PDF path — a first-class, common document-creation path in
   `DocumentWizard.tsx` — was broken. No prior test exercised
   `renderSignedUploadedPdf` at all.

   Fix: wrapped `dataUrlToBytes` + the `embedPng`/`embedJpg` fallback in one
   `try`/`catch` inside `overlaySignature`. On failure (a typed signature,
   or any other non-image value), `sigImage` stays `null` and
   `page.drawImage(...)` is skipped; instead the typed name itself is drawn
   as the visual mark in the signature box (bold, in the same position a
   real signature image would occupy), so the canonical PDF still visually
   shows *something* signature-shaped for a typed signer rather than an
   empty box — the signer's name/timestamp line underneath (drawn
   unconditionally, as before) already existed for both cases. Proven with
   three new `Deno.test`s in `renderFinalPdf.test.ts` — a typed/typed pair,
   a real drawn (PNG) pair (confirming image embedding still works, since
   nothing exercised it before), and a mixed typed+drawn pair — and a new
   static guard,
   `render-signed-uploaded-pdf-guards-typed-signature-dataurl`, in
   `scripts/guards/document-signing.mjs`. Re-running the new tests against
   the pre-fix file (via `git stash`) reproduces the original crash,
   confirming the test fixture models the real bug rather than a strawman.

3. **`protect_document_columns()` never fences `documents.recipient_id`.**
   The migration's own header comment claimed `recipient_id` was "checked
   below" alongside `sender_id`/`application_id`/`document_code` in the
   shared identity-fields check, but the actual code only checked
   `application_id`, `sender_id`, and `document_code` — `recipient_id` was
   never checked anywhere, on a pending *or* closed/signed/locked document.
   Reproduced directly against the migration applied verbatim in PGlite: as
   the document's own employer, reassigning `recipient_id` to an arbitrary
   uuid succeeded with no exception, on both a pending and a fully
   signed+locked document. This matters because `recipient_id` is a live,
   currently-enforced authorization signal in two places: (1)
   `document_audit_logs`' SELECT policy is `d.sender_id = auth.uid() OR
   d.recipient_id = auth.uid()` (untouched by this or the earlier forgery
   migration), so rewriting `recipient_id` grants an arbitrary account full
   read access to that document's entire audit trail — IPs, signature
   methods, hashes, timestamps — including for an already-completed,
   locked document; (2) `_shared/documentParties.ts`'s
   `isPartyToDocument()` (used by the public `/verify/:documentCode`
   endpoint) treats `document.recipient_id === userId` as sufficient to
   count as a party, so the same rewrite grants an outside account the
   party-only signer-name reveal on `/verify` too. Only candidates were
   fully blocked from writing `documents` directly; this gap was specific
   to the employer/team-member write path the trigger was built to fence.

   Fix: added `new.recipient_id IS DISTINCT FROM old.recipient_id` to the
   shared identity-fields check (the same `IF` that already covers
   `application_id`/`sender_id`/`document_code`), matching how `sender_id`
   is already handled — a one-line addition, same pattern as the six
   must-change fixes above. Proven in
   `scripts/document_signing_guard_pglite_check.mjs` (both the pending and
   the locked-document case) and `scripts/guards/document-signing.mjs`
   (`protect-document-columns-fences-recipient-id`).

All checks re-run clean after this round: `npm run build`,
`typecheck:ratchet`, `node scripts/guardrails.mjs`, every
`scripts/*.test.mjs` and `scripts/*pglite*.mjs`, `deno check` on the edge
function, and `deno test` on `renderFinalPdf.test.ts` (5 tests, including
the 3 new ones).

## 0. What's broken today

`public.documents` (offer letters, NDAs, contracts) has real columns for a
candidate→employer signing flow — `candidate_signature_data`,
`candidate_signed_at`, `employer_signature_data`, `employer_signed_at`,
`v1_hash`/`v2_hash`/`v3_hash`/`document_hash`/`final_pdf_hash`, `is_locked`,
`locked_at`, `completion_certificate` — but nothing writes them:

- `SignedDocumentViewer.tsx` (mounted, schema-correct) is **view-only**: it
  reads those columns and renders a certificate, but has no sign/countersign
  UI.
- `DocumentViewerDialog.tsx` has a Sign/Decline flow, but it's **unmounted**
  dead code that writes the wrong (legacy) columns — `status`, `signed_at`,
  `signature_data` — with a raw client UPDATE and no server-side validation.
- `DocumentWizard.tsx` (mounted, employer side) creates the document and
  computes `v1_hash`, but the cockpit's Documents drawer just opens
  `file_url` in a new tab — no countersign UI exists there at all.
- RLS on `documents` lets a candidate `UPDATE` and `DELETE` any column on
  their own document with no column limits, and lets an employer do the same
  — so even if a client-side flow existed, nothing stops a party from typing
  their own `employer_signed_at`, hash, or `completion_certificate` straight
  into the row.

This design closes all of that: a single service-role edge function is the
only path that can move a document through pending → signed, a `BEFORE
UPDATE` trigger fences every other column, and the UI on both sides gets a
real signing action.

---

## 1. Server path — `document-signing` edge function

One new function, `supabase/functions/document-signing/index.ts`, `verify_jwt
= true` (unlike `verify-document`, every caller here must be a logged-in
party — there's no anonymous case). Service-role Supabase client inside, same
shape as every other mutation-performing function in this repo.

### Request

```ts
POST /functions/v1/document-signing
Authorization: Bearer <candidate or employer JWT>

{
  documentId: string;
  action: "view" | "sign" | "countersign" | "decline";
  // sign / countersign only:
  signature?: {
    method: "typed" | "drawn";
    value: string;          // typed: the full legal name; drawn: a data: PNG URL
    consentAccepted: true;  // must be present and true, or the call is rejected
  };
  // employer countersign only:
  reviewConfirmed?: true;   // "I have reviewed the document and the candidate's signature"
  // decline only:
  declineReason?: string;   // required, 3-500 chars after trim
}
```

### Identity & party resolution (first thing the handler does, every action)

1. Resolve the caller the same way `verify-document`'s
   `resolveAuthorizedUserId` does (anon-key client scoped to the
   `Authorization` header, `auth.getUser()`), except here a missing/invalid
   token is a hard `401`, not a silent "no signers".
2. Load the document by `documentId` with the service-role client, plus its
   `application_id → applications(candidate_id, job_id) → jobs(employer_id)`.
   Not found → `404`.
3. Determine the caller's role on this document — mirrors the RLS policies
   already on `documents` (`Team members can update documents if permitted`,
   `Employers can update their documents`) so the edge function's notion of
   "employer" never diverges from what RLS already allows to see the row:
   - `candidate`: `application.candidate_id === callerId`.
   - `employer`: `job.employer_id === callerId`, **or** an active
     `team_members` row for `job.employer_id` with `user_id = callerId`,
     `status = 'active'`, `can_send_documents = true`, and (`assigned_job_ids
     IS NULL` or `job_id = ANY(assigned_job_ids)`).
   - Neither → `403`.
4. `document.is_voided` → `409 { error: "voided" }` for every action except
   `view`.

### `view` — replaces the client's direct `viewed_at` UPDATE

Any resolved party may call this. If `viewed_at IS NULL`, the function sets
it (service-role UPDATE, so it's exempt from the new trigger — see §5) and
writes one `document_audit_logs` row (`action: 'document_viewed'`, see §4).
Idempotent: a second call from either party is a no-op on `viewed_at` but
still safe to call (no audit spam — only insert when this is the first
view). Both `SignedDocumentViewer.tsx` and the future cockpit dialog call
this once on open, replacing `DocumentViewerDialog.tsx`'s old
`recordDocumentView`.

### `sign` (candidate) — v1 → v2

Preconditions, each its own `409` with a distinct `error` code the UI can
show a real sentence for:
- caller role must be `candidate` (`role_mismatch`)
- `document.status === 'pending'` (`not_pending`)
- `document.candidate_signed_at IS NULL` (`already_signed`)
- `document.is_locked === false` (`locked`)
- `document.expires_at IS NULL OR expires_at > now()` (`expired`)
- `signature.consentAccepted === true` (`consent_required`)
- `signature.method === 'typed'` → `signature.value` trimmed, 2–120 chars.
  `signature.method === 'drawn'` → `signature.value` is a `data:image/png`
  URL, decoded size ≤ 200 KB (reject bigger before touching the DB — a
  drawn signature is a name-sized squiggle, not a photo).

On success: compute `v2_hash` (§2), then a single service-role `UPDATE
documents SET candidate_signature_data = <signature JSON>, candidate_signed_at
= now(), v2_hash = ..., document_hash = v2_hash, ip_address = <from headers>,
user_agent = <from headers> WHERE id = documentId`. `candidate_signature_data`
is stored as `{"signatures":{"recipient": <value or drawn data URL>},
"method": "...", "signerName": "..."}` — same shape
`SignedDocumentViewer.tsx`'s `parseSignatures()` already reads
(`parsed.signatures?.recipient`), so no viewer change is needed there.
`ip_address`/`user_agent` come from `x-forwarded-for` (first hop, same
helper as `callerId()` in `_shared/rateLimit.ts`) and the `user-agent`
request header — never trust a client-supplied IP/UA field, this function
doesn't accept one.

Then: audit log (`candidate_signed`, §4) and a notification to the employer
side (§6). Status stays `pending` — it only flips to `signed` once the
employer countersigns (see below), matching `signing_order = 'candidate_first'`.

### `countersign` (employer) — v2 → v3, completes the document

Preconditions:
- caller role must be `employer` (`role_mismatch`)
- `document.status === 'pending'` (`not_pending`)
- `document.candidate_signed_at IS NOT NULL` (`candidate_has_not_signed` —
  this *is* the signing-order enforcement: an employer literally cannot
  countersign before the candidate's signature lands, because this check
  runs on every call)
- `document.employer_signed_at IS NULL` (`already_signed`)
- `document.is_locked === false`, not expired, same as above
- `reviewConfirmed === true` (`review_required`)
- `signature.consentAccepted === true` (`consent_required`)
- same typed/drawn validation as `sign`

On success, in one transaction (a single Postgres function called via `rpc`,
so the hash/lock/certificate write is atomic — see §5 for why a plain
multi-statement `UPDATE` sequence from the edge function isn't safe here):
1. Compute `v3_hash` (§2).
2. Render and store the canonical final PDF, compute `final_pdf_hash` (§2).
3. `UPDATE documents SET employer_signature_data = ..., employer_signed_at =
   now(), v3_hash = ..., document_hash = v3_hash, final_pdf_hash = ...,
   status = 'signed', is_locked = true, locked_at = now(),
   completion_certificate = <cert jsonb>, ip_address = ..., user_agent = ...`.
4. Audit logs: `employer_review_confirmed` then `employer_countersigned` then
   `document_completed` (§4).
5. Notification to the candidate (§6).

### `decline`

Either resolved party, but only while it's actually their turn to act —
otherwise "declining" would let a party who has nothing left to do reopen a
finished document:
- candidate may decline only while `candidate_signed_at IS NULL`
  (`not_your_turn` otherwise — once they've signed, only the employer's
  countersign-or-decline is live).
- employer may decline only while `candidate_signed_at IS NOT NULL AND
  employer_signed_at IS NULL` (i.e. reviewing the candidate's signature) —
  an employer withdrawing a document *before* the candidate has acted is a
  void, not a decline, and voiding stays a direct employer column write
  under the new trigger (§5), not part of this function; nothing in the
  product exercises it today so it's out of scope here.
- `document.status === 'pending'`, not locked, not expired, same as above.
- `declineReason` required, 3–500 chars trimmed.

`UPDATE documents SET status = 'declined', declined_at = now(), decline_reason
= <reason>`. Audit log `document_declined` (§4). Notification to the other
party (§6). A declined document is terminal — `is_locked` is **not** set
(nothing to protect the way a completed document's bytes need protecting),
but the column-lock trigger in §5 still blocks direct client edits to a
declined row the same as a pending one, so nobody can "un-decline" a
document from the client.

### Errors

Every failure returns `{ error: <stable machine code>, message: <one
sentence> }` with the matching HTTP status (`400` bad payload, `401` no/bad
JWT, `403` wrong party, `404` not found, `409` wrong document state). The UI
maps `error` codes to copy — see §7.

---

## 2. Hashes — v1/v2/v3/document_hash/final_pdf_hash

The existing client helper `src/lib/documentHash.ts` already defines the
`v1`/`v2`/`v3` formula (`generateVersionedHash`); this design keeps that
exact algorithm but moves the v2/v3 computation server-side so it's
authoritative, and adds a concrete meaning for `final_pdf_hash`, which
nothing computes today.

**v1** (unchanged, stays client-side at creation): `DocumentWizard.tsx`
already computes it before the document exists — either
`generateV1Hash(generatedContent)` for AI-generated text, or
`generatePdfHash(pdfBytes)` for an uploaded PDF (a plain SHA-256 of the raw
file). There's no signing state yet at that point, so there's nothing for
the server to authoritatively re-derive it from that the client didn't
already supply straight into the INSERT it's already trusted to make (see
§5 — `v1_hash` stays employer/team-writable, INSERT only).

**v2** (server, on `sign`): `sha256("${v1_hash}|CANDIDATE|${signatureValue}|${candidateEmail}|${timestampUtc}|VERSION:2")`
— same shape as `generateV2Hash`, but chained off the stored `v1_hash`
instead of re-fetching/re-deriving document content. This is a deliberate
change from the current client helper (which takes raw `content`): chaining
off `v1_hash` means the server never needs to re-fetch a PDF from Storage or
re-decode the `data:` JSON blob to hash it, works identically for both
AI-generated and uploaded documents, and still detects any change to the
underlying content (because `v1_hash` itself already covers it). `signatureValue`
is the typed name or, for a drawn signature, the SHA-256 of the decoded PNG
bytes (never the full data URL — keeps the hash input bounded).
`candidateEmail` comes from `profiles.email` for `auth.uid()`, not anything
client-supplied.

**v3** (server, on `countersign`):
`sha256("${v2_hash}|EMPLOYER|${signatureValue}|${employerEmail}|${timestampUtc}|VERSION:3")`.
Same reasoning — chains off `v2_hash`.

**document_hash**: always a mirror of "whatever the current version's hash
is" — set to `v1_hash` at creation (already true today), `v2_hash` on sign,
`v3_hash` on countersign. `SignedDocumentViewer.tsx` and `verify-document`
already read `v3_hash || v2_hash || v1_hash` as their fallback chain, so this
is belt-and-suspenders, not a new read path.

**final_pdf_hash** (server, on `countersign`, new — nothing sets this
today): the SHA-256 of the actual bytes of the final, canonical signed PDF —
not a manifest hash like v1–v3, a hash of the file a human would download
and open. Today `pdfSignatureBurner.ts`'s `burnSignaturesIntoPdf` runs
**client-side**, on-demand, every time someone clicks "Signed PDF" download
in `SignedDocumentViewer.tsx` — and it stamps the render with `Generated:
${format(new Date(), ...)}` (`src/lib/pdfSignatureBurner.ts:430`), so two
downloads of the "same" signed document produce byte-different PDFs. That's
fine for a print-on-demand certificate footer, but it means there is no
single canonical rendering to hash.

Design: at `countersign` completion, the server renders the canonical PDF
**once** and stores it — the hash and the artifact it describes are then the
same object forever, and every future "Signed PDF" download for that
document serves this stored file instead of re-rendering.

- Port `burnSignaturesIntoPdf` (uploaded-PDF path) into a new
  `supabase/functions/_shared/renderFinalPdf.ts`. It's already
  framework-agnostic (`pdf-lib`, `date-fns`, `fetch`, no DOM), so it runs
  unchanged under Deno via the same `esm.sh` import style every other
  function here already uses for `@supabase/supabase-js`. One change:
  replace the non-deterministic `Generated: ${format(new Date(), ...)}`
  footer line with the document's own `completion_timestamp_utc` — makes the
  render a pure function of stored data, which is what "hash the bytes"
  requires.
- For AI-generated (text) documents, add a second render path in the same
  module that lays the stored `content` string onto a fresh `pdf-lib`
  document with `page.drawText` (replacing the client's `jsPDF`-based
  `handleDownloadGeneratedPdf` — same visual content, one PDF library
  instead of two, and `jsPDF` doesn't need to exist inside the edge
  function).
- Store the result at `documents/<documentId>/final.pdf` in the existing
  private `documents` Storage bucket (the bucket `DocumentWizard.tsx`
  already uploads originals to), hash those exact bytes with
  `crypto.subtle.digest('SHA-256', bytes)`, write the hash to
  `final_pdf_hash`.
- `SignedDocumentViewer.tsx`'s "Signed PDF" download button, once a document
  is `signed`, switches from client-side burning to a signed URL for that
  stored object (`supabase.storage.from('documents').createSignedUrl(...)`);
  its current client-side burn/generate code paths (`handleDownloadGeneratedPdf`,
  `handleDownloadSignedUploadedPdf`) stay as-is for a `pending`/`declined`
  document, where there's nothing signed yet to serve back.

`verify-document` and `completionCertificate.ts` are unaffected by this —
both already read whichever of `v3_hash`/`v2_hash`/`document_hash` is
populated and don't touch `final_pdf_hash`; this is additive.

---

## 3. Status, lock, and the completion certificate

- `status` flips `pending → signed` **only** on a successful `countersign`
  (never on `sign` alone — a candidate-signed, not-yet-countersigned
  document is still `pending`, which is exactly what
  `useEmployerPendingDocumentsCount.ts` already assumes with its
  `not("candidate_signed_at", "is", null).is("employer_signed_at", null)`
  query).
- `status` flips `pending → declined` on a successful `decline`, from either
  side, per §1.
- `is_locked`/`locked_at` are set **only** together with `status = 'signed'`,
  in the same `countersign` transaction — never independently, and never for
  a declined document (there's nothing to protect: a declined document
  can't be re-signed regardless, per the trigger in §5, so locking would be
  a no-op that only confuses "is this final" UI).
- `completion_certificate` is generated server-side in that same
  transaction, reusing the existing shape from `src/lib/completionCertificate.ts`
  (`CompletionCertificate`) verbatim — that interface, and
  `SignedDocumentViewer.tsx`'s `loadCompletionCertificate()` (which already
  prefers `document.completion_certificate` over generating one on the fly),
  don't change. The server builds the same object today's client function
  builds from audit-log entries, except it has the real signature/hash data
  in hand directly rather than re-deriving it by scanning
  `document_audit_logs` after the fact:

  ```ts
  {
    certificate_id: `CERT-${...}`,           // same generator as today
    document_id, document_name: document.name, document_type,
    version_history: {
      v1: { hash: document.v1_hash, timestamp: document.created_at },
      v2: { hash: v2Hash, timestamp: document.candidate_signed_at },
      v3: { hash: v3Hash, timestamp: now },
    },
    candidate_signature: {
      name, email, timestamp_utc: document.candidate_signed_at,
      ip_address: document.ip_address /* captured at sign time, not overwritten by countersign */,
      location: { city, region, country },   // from the same geolocate-ip lookup as today
      signature_hash: v2Hash,
      consent_confirmed_at: document.candidate_signed_at,
      signing_order_position: 1,
    },
    employer_signature: { ...mirror, signing_order_position: 2 },
    signing_order: "candidate_first",
    signing_order_verified: true,   // always true here — the server *enforced* the order, it isn't inferring it after the fact
    final_document_hash: document.final_pdf_hash,
    completion_timestamp_utc: now,
    audit_trail_hash: sha256(<audit log entries for this document, same join as generateAuditTrailHashFromEntries>),
    audit_entries_count,
    compliance_statement: <unchanged text from completionCertificate.ts>,
  }
  ```

  One field changes meaning: `final_document_hash` is now `final_pdf_hash`
  (the real PDF bytes) instead of whatever `finalHash` fallback chain the
  client used before — a strictly more correct value for a field literally
  named "final document hash", and the certificate's own IP addresses are
  captured once, at sign/countersign time (not looked up again for the
  certificate), so it can't drift from what the audit trail says. `ip_address`
  as stored on `documents` reflects the *countersign* call after
  `countersign` runs; the candidate's own sign-time IP is only preserved
  in the `candidate_signed` audit-log row and the certificate's own
  `candidate_signature.ip_address`, both captured before the employer's
  `UPDATE` overwrites the column — same one-row-per-document limit the
  schema already has today (`documents.ip_address` is a single column, not
  per-signer), just made explicit here rather than silently losing the
  candidate's IP the moment the employer signs.

---

## 4. `document_audit_logs` rows the server writes

All via the service-role client, so `enforce_document_audit_log_identity()`
(§ live trigger, unchanged) takes its `auth.role() = 'service_role'` early
return and leaves every field as the function sets it — this design relies
on that trigger already existing exactly as-is, doesn't touch it.

| Action | Written on | Key fields |
|---|---|---|
| `document_viewed` | first `view` call by either party | `signer_role`, `document_hash` = current |
| `candidate_signed` | `sign` success | `signature_method`, `consent_confirmed: true`, `document_hash: v2_hash`, `document_version: 2`, `pre_signature_hash: v1_hash`, `post_signature_hash: v2_hash`, `signing_order_position: 1` |
| `employer_review_confirmed` | `countersign`, before the signature itself | `document_hash: v2_hash` |
| `employer_countersigned` | `countersign` success | `signature_method`, `consent_confirmed: true`, `document_hash: v3_hash`, `document_version: 3`, `pre_signature_hash: v2_hash`, `post_signature_hash: v3_hash`, `signing_order_position: 2` |
| `document_completed` | `countersign` success, right after the above | `document_hash: final_pdf_hash`, `details.is_locked: true` |
| `document_declined` | `decline` success | `signer_role` of the decliner, `details.decline_reason` |

`signer_name`/`signer_email` come from `profiles` for the caller, exactly
like `logDocumentCreated` etc. already do client-side today —
`getGeolocation()`/IP/user-agent capture move server-side (headers, per §1)
instead of the client's `geolocate-ip` round trip, which also closes the gap
where a client could simply not call it.

---

## 5. `BEFORE UPDATE` trigger — `protect_document_columns()`

No `BEFORE UPDATE` trigger exists on `documents` today (confirmed live:
the only trigger is `set_document_code`, `BEFORE INSERT`). New migration
adds one, modeled directly on `protect_application_columns()`
(`src/...` pattern already in this repo — `service_role` early return via
`auth.role()`, not `current_user`, for the same SECURITY DEFINER reason
documented there).

```sql
create or replace function public.protect_document_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_candidate_id uuid;
  v_employer_id uuid;
  v_is_employer_side boolean;
begin
  -- The signing edge function runs on service_role and is authoritative.
  if auth.role() = 'service_role' then
    return new;
  end if;

  select a.candidate_id, j.employer_id
    into v_candidate_id, v_employer_id
  from public.applications a
  join public.jobs j on j.id = a.job_id
  where a.id = old.application_id;

  v_is_employer_side := v_employer_id = auth.uid()
    or exists (
      select 1 from public.team_members tm
      where tm.user_id = auth.uid()
        and tm.employer_id = v_employer_id
        and tm.status = 'active'
        and tm.can_send_documents = true
        and (tm.assigned_job_ids is null
             or old.application_id in (
               select a2.id from public.applications a2
               where a2.job_id = any(tm.assigned_job_ids)
             ))
    );

  -- Candidates never write documents directly, full stop. `view`,
  -- `sign`, `decline` all go through the edge function now.
  if auth.uid() = v_candidate_id and not v_is_employer_side then
    raise exception 'Candidates cannot update documents directly — use the document-signing function';
  end if;

  if not v_is_employer_side then
    -- RLS should already have refused this write; don't second-guess it.
    return new;
  end if;

  -- Employer/team side: an explicit allow-list of what they may still
  -- change with a plain client UPDATE. Everything signing-related routes
  -- through the edge function; this is what's left over from real,
  -- observed client writes (DocumentWizard's own follow-up edits, package
  -- assignment, reminders, voiding) that never touch a signature or hash.
  if old.status in ('signed', 'declined') or old.is_locked then
    -- A completed or declined document is closed. The only thing still
    -- legitimately writable past that point is voiding it (see below) —
    -- everything else about a finished document is permanent record.
    if new.name is distinct from old.name
      or new.file_url is distinct from old.file_url
      or new.document_type is distinct from old.document_type
      or new.expires_at is distinct from old.expires_at
      or new.status is distinct from old.status
      or new.candidate_signature_data is distinct from old.candidate_signature_data
      or new.candidate_signed_at is distinct from old.candidate_signed_at
      or new.employer_signature_data is distinct from old.employer_signature_data
      or new.employer_signed_at is distinct from old.employer_signed_at
      or new.is_locked is distinct from old.is_locked
      or new.locked_at is distinct from old.locked_at
      or new.completion_certificate is distinct from old.completion_certificate
      or new.v1_hash is distinct from old.v1_hash
      or new.v2_hash is distinct from old.v2_hash
      or new.v3_hash is distinct from old.v3_hash
      or new.document_hash is distinct from old.document_hash
      or new.final_pdf_hash is distinct from old.final_pdf_hash
      or new.document_code is distinct from old.document_code
      or new.declined_at is distinct from old.declined_at
      or new.decline_reason is distinct from old.decline_reason
    then
      raise exception 'This document is % — only voiding is allowed', old.status;
    end if;
  else
    -- Still pending: block the columns that only the edge function may
    -- ever set, on top of what's structurally read-only (id, application_id,
    -- created_at, document_code, sender_id, recipient_id).
    if new.candidate_signature_data is distinct from old.candidate_signature_data
      or new.candidate_signed_at is distinct from old.candidate_signed_at
      or new.employer_signature_data is distinct from old.employer_signature_data
      or new.employer_signed_at is distinct from old.employer_signed_at
      or new.status is distinct from old.status
      or new.is_locked is distinct from old.is_locked
      or new.locked_at is distinct from old.locked_at
      or new.completion_certificate is distinct from old.completion_certificate
      or new.v2_hash is distinct from old.v2_hash
      or new.v3_hash is distinct from old.v3_hash
      or new.final_pdf_hash is distinct from old.final_pdf_hash
      or new.document_hash is distinct from old.document_hash
      or new.declined_at is distinct from old.declined_at
      or new.decline_reason is distinct from old.decline_reason
      or new.viewed_at is distinct from old.viewed_at
      or new.ip_address is distinct from old.ip_address
      or new.user_agent is distinct from old.user_agent
    then
      raise exception 'Signing fields can only be set by the document-signing function';
    end if;
  end if;

  if new.application_id is distinct from old.application_id
    or new.sender_id is distinct from old.sender_id
    or new.document_code is distinct from old.document_code
  then
    raise exception 'Cannot change document identity fields';
  end if;

  return new;
end;
$$;

create trigger protect_document_columns_trigger
  before update on public.documents
  for each row execute function public.protect_document_columns();
```

Left writable for the employer/team side on a still-`pending` document (no
`raise` above blocks them): `name`, `document_type`, `file_url`,
`recipient_id`, `expires_at`, `reminder_sent_at`, `package_id`, `v1_hash`
(covers `DocumentWizard.tsx` re-saving it right after insert if that ever
happens), and `is_voided`/`voided_at`/`voided_reason` (the void path — no
code writes these today per a repo-wide grep, but the columns and their
intended shape already exist, so this leaves that door open rather than
inventing new scope here). `RAISE EXCEPTION` text always says *why*, for the
same reason `protect_application_columns()` does — a denied write should
read like an error, not a mystery permission failure.

### DELETE

Two live policies today have no restriction at all:
`"Candidates can delete their documents"` and `"Employers can delete their
documents"`. Replace both:

```sql
drop policy "Candidates can delete their documents" on public.documents;
-- Candidates were never supposed to delete evidence of their own
-- signature; nothing in the product exercises this today.

drop policy "Employers can delete their documents" on public.documents;
create policy "Employers can delete undelivered documents"
  on public.documents for delete
  using (
    exists (
      select 1 from applications a join jobs j on j.id = a.job_id
      where a.id = documents.application_id and j.employer_id = auth.uid()
    )
    and candidate_signed_at is null
    and is_locked = false
  );
```

Same tightening on `"Team members can update documents if permitted"` isn't
needed — that policy only decides *who may attempt* an UPDATE; the new
trigger decides *what* they may change regardless of which RLS policy let
the statement through, so it stays as-is.

---

## 6. In-app notifications

Reuse the existing `notifications` table exactly as `DocumentWizard.tsx`
already does today (`type: "system"`, `link`) — no new columns, no new
type. Written from inside the same service-role transaction as the
triggering action, right after its audit-log row:

| Event | To | Title / message |
|---|---|---|
| candidate signs | employer (`job.employer_id`; not every team member — same as today's single-recipient pattern) | "A candidate signed — your turn" / `"${candidateName} signed ${documentName}. Countersign it to finish."`, `link: "/documents"` |
| employer countersigns (document completes) | candidate | "Your document is fully signed" / `"${documentName} is complete. Download your copy anytime."`, `link: "/my-documents"` |
| either party declines | the other party | "A document was declined" / `"${declinerName} declined ${documentName}: ${reason}"`, `link` matching the recipient's side |

No email — `RESEND_API_KEY` is unset project-wide (`send-notification-email`
returns `skipped`), and this design doesn't add an email dependency; it only
uses the in-app table, same as every other notification already shipped
this cycle (applications, interviews, offers, phase moves).

---

## 7. UI

### `DocumentViewerDialog.tsx` — delete it

Justification: it is unmounted (no import anywhere reaches it — confirmed by
`MyDocuments.tsx` using `SignedDocumentViewer`, `cockpit/pages/Documents.tsx`
using neither), it writes only the legacy columns
(`status`/`signed_at`/`signature_data`/`user_agent`) with a bare client
`UPDATE` and no consent/state checks, and everything it does (view content,
sign, decline, audit trail, download) has a schema-correct equivalent either
already built in `SignedDocumentViewer.tsx` or added to it below. Keeping an
unmounted file that still compiles against `documents` around is actively
dangerous once §5's trigger ships: it's exactly the kind of forgotten
client-write path that would start throwing `raise exception`s the moment
someone re-mounts it, or — worse — silently no-op some of its writes (the
ones the trigger allows) while others fail, which is a confusing way to
fail. Delete the file and its one lingering reference, if any turns up in a
grep at implementation time.

### `SignedDocumentViewer.tsx` — gains the signing actions

Stays the one dialog both `MyDocuments.tsx` (candidate) and the cockpit's
Documents drawer open — no new component split. Additions:

- On open, call `document-signing` with `action: "view"` (replacing nothing
  that exists today — this is new).
- New state derived from `document` + `useAuth()`'s `role`/`user`:
  `canSignAsCandidate = role === 'candidate' && document.status === 'pending'
  && !document.candidate_signed_at`, `canCountersignAsEmployer = role ===
  'employer' && document.status === 'pending' && document.candidate_signed_at
  && !document.employer_signed_at`, `canDecline` = either of those.
- When `canSignAsCandidate` or `canCountersignAsEmployer`, replace the
  read-only "Awaiting Signature" strip (`document.status !== "signed"`
  branch, `SignedDocumentViewer.tsx:940-959`) with a signing panel:
  - Consent checkbox with the exact statement `auditTrail.ts` already uses
    for `electronic_consent_confirmed` ("I acknowledge that I am signing
    this document electronically...") — one wording, reused instead of
    invented twice.
  - Employer side only: a second checkbox, "I've reviewed the document and
    the candidate's signature before countersigning" (maps to
    `reviewConfirmed`).
  - A signature capture tab: **Type** (text input, pre-filled from
    `profiles.full_name`, editable) or **Draw** (new small
    `src/components/documents/SignaturePad.tsx` — a `<canvas>` with
    pointer-event drawing and a Clear button, exporting `toDataURL('image/png')`
    on submit; no new dependency, canvas is native). Either tab produces the
    `signature.method`/`signature.value` pair §1 expects.
  - Primary button ("Sign document" / "Countersign") disabled until consent
    (+ review, for employer) is checked and a signature is present; calls
    `supabase.functions.invoke("document-signing", { body: { documentId,
    action: role === 'candidate' ? 'sign' : 'countersign', signature,
    reviewConfirmed } })`, then `queryClient.invalidateQueries({ queryKey:
    ["documents"] })` and closes or refreshes the dialog.
  - Secondary "Decline" button opens the same reason textarea pattern
    `DocumentViewerDialog.tsx` had (`showDeclineForm`/`declineReason`), now
    posting `action: "decline"`.
  - Every `error` code from §1 maps to one toast sentence (`already_signed`
    → "Someone already signed this — refresh to see the latest.",
    `candidate_has_not_signed` → "The candidate hasn't signed yet.", etc.)
    instead of a raw Supabase error string.
- The finished-document view (`document.status === "signed"` branch) is
  unchanged — it already reads exactly the columns the server now
  authoritatively writes.

### Cockpit — `src/cockpit/pages/Documents.tsx`

Every `DocRow` here already comes 1:1 from a `documents` row via
`mapDocumentRow` (`useCockpitDocuments` sources only `useDocuments()`, never
`document_requests` — confirmed by reading the hook). So the fix is narrow:
`DocRowItem`'s "Open" button currently always calls `openDocument(row.fileUrl)`
(`src/cockpit/pages/Documents.tsx:186-195`). Change it to open
`SignedDocumentViewer` in a dialog (same component `MyDocuments.tsx` uses)
whenever the row's status is `Pending` or `Signed` — i.e. whenever there's a
real signing lifecycle to show — and keep the existing "open the raw file in
a new tab" behavior only as the `Declined` fallback (nothing to sign there,
just the original file). This needs the full `DocumentWithApplication` for
the clicked row, not just the flattened `DocRow` — `CockpitDocuments` already
holds `documents` from `useCockpitDocuments`'s underlying `useDocuments()`
call one level up, so it's a matter of looking the row up by `id` from that
list (already in scope, no new fetch) and passing it to `SignedDocumentViewer`
the same way `MyDocuments.tsx` does with `viewerDocument`.

### Typed vs. drawn

Both are offered, candidate's choice, same for the employer — this project
has no notarization or ID-verification requirement, and ESIGN/UETA (the
compliance language already in `completionCertificate.ts`) don't require a
drawn signature specifically, just clear consent and an identifiable
signer. Typed is the accessible, low-friction default tab; Draw is there for
people who want it to look like a signature.

---

## 8. Tests and guards

New Deno unit tests, same style as the existing
`documentParties.test.ts` (pure functions, no live Supabase needed):

- `supabase/functions/document-signing/stateMachine.test.ts` — extract the
  precondition checks in §1 into pure functions (`canSign(document, role)`,
  `canCountersign(...)`, `canDecline(...)`) so every one of the `409` cases
  above is a table-driven test, not something only exercisable through a
  live call.
- `supabase/functions/_shared/renderFinalPdf.test.ts` — feeds the same
  fixed input twice, asserts identical output bytes (guards the
  determinism fix in §2 from regressing back to a timestamp-stamped
  footer).

New PGlite proof, `scripts/document_signing_guard_pglite_check.mjs` (added
to the "every `scripts/*pglite*.mjs`" check list this repo's CLAUDE.md
already runs): loads `protect_document_columns()` and the two replaced
DELETE policies verbatim from the new migration into PGlite with the
auth stub, then proves — as a candidate — a direct
`UPDATE documents SET employer_signed_at = now() WHERE id = ...` is
rejected; as an employer, the same for `candidate_signed_at`; as either,
that `name`/`expires_at` still succeed on a pending document; and that once
`status = 'signed'`, even the employer's own client can no longer touch
`file_url`.

New `scripts/guards/document-signing.mjs` (one file per fix, per
`scripts/guards/README.md`), following the `verify-document-hardening.mjs`
shape (static source checks, no live server needed):
- `protect_document_columns()` is defined in the new migration and contains
  the `service_role` early return (fails on old code: no trigger exists
  today).
- `document-signing/index.ts` requires `Authorization` and 401s without it
  (fails if someone builds this as `verify_jwt = false`).
- `countersign`'s handler contains the `candidate_signed_at is not null`
  check before it ever sets `employer_signed_at` (fails if signing-order
  enforcement is dropped).
- `DocumentViewerDialog.tsx` no longer exists in the tree (fails until it's
  actually deleted, not just unmounted).

---

## 9. Legacy columns

`documents.signature_data` and `documents.signed_at` (the pre-versioned
columns `DocumentViewerDialog.tsx` wrote) are not deprecated by a migration
here — no code outside the deleted dialog reads or writes them, so there's
nothing to migrate. They stay in the schema, untouched, covered by §5's
trigger like every other column (nobody can write them directly once the
trigger ships; the new edge function never writes them either). A future,
separate cleanup migration can drop them once someone's confirmed no
external integration reads them — out of scope for this pass, which is
additive-only per the ambient hard rules.

---

## Implementation order

1. Migration: `protect_document_columns()` trigger + DELETE policy swap
   (§5) — safe to land alone; 0 live rows, and it only *removes* client
   write surface, so nothing currently working can regress from this step
   by itself.
2. `supabase/functions/_shared/renderFinalPdf.ts` (§2) + its determinism
   test — no callers yet, safe in isolation.
3. `supabase/functions/document-signing/index.ts` (§1, §2, §3, §4, §6) +
   `stateMachine.test.ts`.
4. `SignaturePad.tsx` + `SignedDocumentViewer.tsx` signing panel (§7).
5. Cockpit `Documents.tsx` wiring (§7).
6. Delete `DocumentViewerDialog.tsx` (§7).
7. PGlite guard + `scripts/guards/document-signing.mjs` (§8) — written
   alongside 1 and 3, not after; per this worktree's own rule, one guard
   file per fix, and this fix has two distinct wrong-old-behaviors (the
   missing trigger, the missing signing-order check) worth a guard each if
   that reads cleaner than one combined file.
