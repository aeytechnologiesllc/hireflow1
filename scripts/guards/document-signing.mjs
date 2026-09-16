/**
 * Document signing: public.documents had real candidate/employer signature
 * columns (candidate_signature_data, candidate_signed_at,
 * employer_signature_data, employer_signed_at, v1/v2/v3/document/
 * final_pdf hashes, is_locked, completion_certificate) that nothing wrote,
 * and RLS let either party UPDATE or DELETE any column with no
 * restriction. DocumentViewerDialog.tsx had a Sign/Decline flow, but it
 * wrote only the legacy (status/signed_at/signature_data) columns with a
 * raw client UPDATE and no server-side validation, and was unmounted.
 *
 * Fixed by:
 *   - supabase/migrations/20260915150000_document_signing.sql
 *     (protect_document_columns() BEFORE UPDATE trigger + DELETE policy
 *     swap — proven live against real RLS in
 *     scripts/document_signing_guard_pglite_check.mjs)
 *   - supabase/functions/document-signing/index.ts — the one service-role
 *     path that can move a document through pending -> signed, with a
 *     compare-and-swap on every terminal write (see its own comments for
 *     why that's the atomicity fix instead of a wrapping SQL function) and
 *     server-enforced signing order (candidate before employer).
 *   - DocumentViewerDialog.tsx deleted outright — kept around, it would
 *     start throwing the trigger's RAISE EXCEPTIONs the moment anyone
 *     re-mounted it, or worse, silently partial-fail.
 *
 * These are static text checks over the source — cheap, no server or DB
 * needed — not a substitute for scripts/document_signing_guard_pglite_check.mjs
 * (the trigger/RLS proof) or actually calling the deployed function.
 */

/** Strips `-- line` comments so a guard's regex only ever matches real SQL,
 *  never prose in a header comment that happens to quote the bad pattern
 *  it's warning about. */
function stripSqlComments(sql) {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

/** Strips `// line` and block comments so a guard's regex only ever matches
 *  real TS, never a doc comment describing old/replaced behavior. */
function stripTsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
}

const MIGRATION = "supabase/migrations/20260915150000_document_signing.sql";
const FUNCTION = "supabase/functions/document-signing/index.ts";
const STATE_MACHINE = "supabase/functions/document-signing/stateMachine.ts";
const OLD_DIALOG = "src/components/documents/DocumentViewerDialog.tsx";
const RENDER_PDF = "supabase/functions/_shared/renderFinalPdf.ts";

export default [
  {
    id: "protect-document-columns-trigger-exists-and-exempts-service-role",
    why:
      "protect_document_columns() must be (re)defined in this migration with a service_role early return " +
      "(the document-signing edge function's own writes must never be blocked by the fence it installs) " +
      "and an actual BEFORE UPDATE trigger wiring it onto public.documents — fails on old code, since no " +
      "such trigger exists today.",
    run: async ({ read }) => {
      const sql = await read(MIGRATION);
      if (!sql) return { ok: false, detail: [`${MIGRATION} not found`] };
      const bad = [];

      if (!/create or replace function public\.protect_document_columns\(\)/i.test(sql)) {
        bad.push("protect_document_columns() is not (re)defined in this migration");
      }
      if (!/auth\.role\(\)\s*=\s*'service_role'/.test(sql)) {
        bad.push("no auth.role() = 'service_role' early return found — service_role must be exempt (current_user is wrong here, see protect_application_columns()'s own comment)");
      }
      if (!/create trigger protect_document_columns_trigger[\s\S]*?before update on public\.documents/i.test(sql)) {
        bad.push("protect_document_columns_trigger is not wired as a BEFORE UPDATE trigger on public.documents");
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "protect-document-columns-uses-array-length-not-null-check",
    why:
      "Team-member detection must match this codebase's own live convention exactly — " +
      "array_length(tm.assigned_job_ids, 1) IS NULL — not a hand-rolled `tm.assigned_job_ids IS NULL`, " +
      "which is NOT true for an empty array ('{}') and misclassifies that legitimate, RLS-authorized " +
      "team member into the trigger's unrestricted pass-through branch.",
    run: async ({ read }) => {
      const sqlRaw = await read(MIGRATION);
      if (!sqlRaw) return { ok: false, detail: [`${MIGRATION} not found`] };
      // Only look at real SQL — the migration's own header comment quotes
      // the bad pattern in prose while explaining why it's wrong, which
      // must not itself trip this check.
      const sql = stripSqlComments(sqlRaw);
      const bad = [];

      if (!/array_length\(\s*tm\.assigned_job_ids\s*,\s*1\s*\)\s*is\s*null/i.test(sql)) {
        bad.push("no array_length(tm.assigned_job_ids, 1) IS NULL check found in the migration's actual SQL");
      }
      // A bare `tm.assigned_job_ids is null` (not wrapped in array_length)
      // would be the old, wrong check — catch it if it sneaks back in.
      if (/\btm\.assigned_job_ids\s+is\s+null\b/i.test(sql.replace(/array_length\([^)]*\)\s*is\s*null/gi, ""))) {
        bad.push("a bare `tm.assigned_job_ids IS NULL` check (without array_length) was found in real SQL — this is NOT true for '{}'::uuid[]");
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "protect-document-columns-blocks-void-and-legacy-columns",
    why:
      "is_voided/voided_at/voided_reason and the legacy signature_data/signed_at columns must be blocked " +
      "from a direct client UPDATE — otherwise an employer-side party can silently invalidate a fully " +
      "executed, locked document (no audit trail, no notification), or forge the displayed completion date " +
      "signed_at now carries as the live UI's 'Completed' timestamp.",
    run: async ({ read }) => {
      const sql = await read(MIGRATION);
      if (!sql) return { ok: false, detail: [`${MIGRATION} not found`] };
      const bad = [];
      for (const col of ["is_voided", "voided_at", "voided_reason", "signature_data", "signed_at"]) {
        const re = new RegExp(`new\\.${col}\\s+is\\s+distinct\\s+from\\s+old\\.${col}`, "i");
        const count = (sql.match(new RegExp(re.source, "gi")) || []).length;
        if (count < 2) {
          bad.push(`new.${col} IS DISTINCT FROM old.${col} must appear in BOTH the closed-document and still-pending disallow lists (found ${count})`);
        }
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "protect-document-columns-blocks-content-swap-after-candidate-signs",
    why:
      "name/file_url/document_type/expires_at must become read-only on a still-pending document once " +
      "candidate_signed_at is set — otherwise an employer (or a can_send_documents team member) can rewrite " +
      "the document's actual content in the window after the candidate signs and before the employer " +
      "countersigns, then countersign the swapped content: status/is_locked/hash chain all read as continuous " +
      "while the served final.pdf reflects content the candidate never reviewed or signed.",
    run: async ({ read }) => {
      const sqlRaw = await read(MIGRATION);
      if (!sqlRaw) return { ok: false, detail: [`${MIGRATION} not found`] };
      const sql = stripSqlComments(sqlRaw);
      const bad = [];
      if (!/old\.candidate_signed_at\s+is\s+not\s+null/i.test(sql)) {
        bad.push("no `old.candidate_signed_at IS NOT NULL` guard found — content columns must be blocked once the candidate has signed");
      }
      // That guard must actually gate the content columns, not some
      // unrelated check — look for it in the same IF condition as at least
      // file_url and name.
      const guardMatch = /IF\s+old\.candidate_signed_at\s+is\s+not\s+null\s+and\s*\(([\s\S]*?)\)\s*THEN/i.exec(sql);
      if (guardMatch) {
        const cond = guardMatch[1];
        for (const col of ["new.name", "new.file_url", "new.document_type", "new.expires_at"]) {
          if (!cond.includes(col)) bad.push(`candidate_signed_at content-swap guard does not cover ${col}`);
        }
      } else if (!bad.length) {
        bad.push("could not locate the candidate_signed_at content-swap IF block covering name/file_url/document_type/expires_at");
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "protect-document-columns-blocks-v1-hash-tamper",
    why:
      "documents.v1_hash must become read-only, together with the other content columns, once candidate_signed_at " +
      "is set, AND any v1_hash change on a pending document must be refused unless a content column " +
      "(name/file_url/document_type/expires_at) is changing in the same UPDATE — otherwise an employer/team-member " +
      "can raw-UPDATE v1_hash alone in the window between candidate sign and employer countersign, so the stored " +
      "v2_hash (computed from the ORIGINAL v1_hash at sign time) no longer reconciles against the v1_hash the " +
      "completion certificate reads at countersign, breaking the v1->v2->v3 chain without touching any column the " +
      "prior content-swap guard checked.",
    run: async ({ read }) => {
      const sqlRaw = await read(MIGRATION);
      if (!sqlRaw) return { ok: false, detail: [`${MIGRATION} not found`] };
      const sql = stripSqlComments(sqlRaw);
      const bad = [];

      // v1_hash must be in the same candidate_signed_at IS NOT NULL guard
      // that already covers name/file_url/document_type/expires_at.
      const guardMatch = /IF\s+old\.candidate_signed_at\s+is\s+not\s+null\s+and\s*\(([\s\S]*?)\)\s*THEN/i.exec(sql);
      if (!guardMatch) {
        bad.push("could not locate the candidate_signed_at content-swap IF block to check for v1_hash");
      } else if (!guardMatch[1].includes("new.v1_hash")) {
        bad.push("the candidate_signed_at content-swap guard does not cover new.v1_hash — a v1_hash-only UPDATE would still be allowed after the candidate signs");
      }

      // A standalone guard must also refuse ANY v1_hash change on a
      // pending document unless a content column is changing in the same
      // UPDATE — this is the general case, not scoped to post-signature.
      if (!/new\.v1_hash\s+is\s+distinct\s+from\s+old\.v1_hash[\s\S]{0,400}?raise exception/i.test(sql)) {
        bad.push("no standalone guard found refusing a v1_hash-only change on a pending document (v1_hash must only move together with a content re-save)");
      }
      if (!/new\.v1_hash\s+is\s+distinct\s+from\s+old\.v1_hash[\s\S]{0,400}?is\s+not\s+distinct\s+from\s+old\.name[\s\S]{0,400}?is\s+not\s+distinct\s+from\s+old\.file_url/i.test(sql)) {
        bad.push("the standalone v1_hash guard does not appear to require name/file_url to be UNCHANGED (IS NOT DISTINCT FROM) for the refusal to fire — it must trigger only when no content column is changing");
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "countersign-recomputes-and-verifies-v2-hash-reconciliation",
    why:
      "The countersign handler must independently recompute v2_hash from the v1_hash actually used at sign time " +
      "(read back from document_audit_logs' immutable candidate_signed row, never from the current, potentially " +
      "tampered documents.v1_hash) and refuse to countersign if it doesn't match the stored v2_hash — defense in " +
      "depth on top of the DB trigger fence, in case that trigger is ever bypassed or regressed.",
    run: async ({ read }) => {
      const src = await read(FUNCTION);
      const reconciliationSrc = await read("supabase/functions/_shared/countersignReconciliation.ts");
      const bad = [];
      if (!src) bad.push(`${FUNCTION} not found`);
      if (!reconciliationSrc) bad.push("supabase/functions/_shared/countersignReconciliation.ts not found");
      if (src) {
        if (!/reconcileCandidateSignatureChain/.test(src)) {
          bad.push("countersign handler does not call reconcileCandidateSignatureChain(...)");
        }
        if (!/pre_signature_hash/.test(src) || !/candidate_signed/.test(src)) {
          bad.push("countersign handler does not read pre_signature_hash back from the 'candidate_signed' document_audit_logs row");
        }
        const countersignStart = src.indexOf('if (action === "countersign")');
        const declineStart = src.indexOf('if (action === "decline")');
        const body =
          countersignStart === -1
            ? ""
            : declineStart > countersignStart
              ? src.slice(countersignStart, declineStart)
              : src.slice(countersignStart);
        if (!/reconciliation\.ok/.test(body) && !/!reconciliation\.ok/.test(body)) {
          bad.push("countersign branch does not check the reconciliation result's ok field before proceeding");
        }
        if (!/chain_broken/.test(src)) {
          bad.push("no 'chain_broken' error code found — a reconciliation failure must be reported distinctly, not folded into a generic 500");
        }
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "protect-document-columns-fences-recipient-id",
    why:
      "recipient_id must be included in the identity-fields check — the migration's own header comment " +
      "claims it's 'checked below', but without this it stays writable by any employer/team-member client " +
      "UPDATE at any time, including on a locked document, letting them grant an arbitrary account " +
      "document_audit_logs read access (its SELECT policy is sender_id = auth.uid() OR recipient_id = " +
      "auth.uid()) and /verify's party-only signer-name reveal (isPartyToDocument() treats recipient_id " +
      "match as sufficient).",
    run: async ({ read }) => {
      const sqlRaw = await read(MIGRATION);
      if (!sqlRaw) return { ok: false, detail: [`${MIGRATION} not found`] };
      const sql = stripSqlComments(sqlRaw);
      const bad = [];
      if (!/new\.recipient_id\s+is\s+distinct\s+from\s+old\.recipient_id/i.test(sql)) {
        bad.push("no `new.recipient_id IS DISTINCT FROM old.recipient_id` check found anywhere in the trigger");
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "document-signing-requires-auth-and-401s-without-it",
    why:
      "Unlike verify-document (public), document-signing must be config.toml verify_jwt = true AND its own " +
      "handler must hard-401 a missing/invalid caller — fails if someone builds this as an anonymous-capable " +
      "endpoint.",
    run: async ({ read }) => {
      const src = await read(FUNCTION);
      const config = await read("supabase/config.toml");
      const bad = [];
      if (!src) bad.push(`${FUNCTION} not found`);
      if (!config) bad.push("supabase/config.toml not found");
      if (src) {
        if (!/resolveCallerId/.test(src)) bad.push("no resolveCallerId(...) helper found");
        if (!/status:\s*401|,\s*401\)/.test(src) || !/unauthorized/i.test(src)) {
          bad.push("no 401 unauthorized path found for a missing/invalid caller");
        }
      }
      if (config && !/\[functions\.document-signing\][^[]*verify_jwt\s*=\s*true/s.test(config)) {
        bad.push("supabase/config.toml does not set verify_jwt = true for [functions.document-signing]");
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "countersign-enforces-signing-order-server-side",
    why:
      "canCountersign must check candidateSignedAt !== null before an employer can ever countersign — this " +
      "IS the signing-order enforcement (candidate_first), running on every server call, not just assumed " +
      "from UI ordering. Fails if signing-order enforcement is dropped from the pure precondition function.",
    run: async ({ read }) => {
      const src = await read(STATE_MACHINE);
      if (!src) return { ok: false, detail: [`${STATE_MACHINE} not found`] };
      const bad = [];
      const fnMatch = /export function canCountersign\([\s\S]*?\n}/.exec(src);
      if (!fnMatch) {
        bad.push("canCountersign(...) not found");
      } else if (!/candidateSignedAt\s*===\s*null/.test(fnMatch[0])) {
        bad.push("canCountersign does not check doc.candidateSignedAt === null before allowing countersign");
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "countersign-terminal-write-is-a-compare-and-swap",
    why:
      "Both the reservation and finalize UPDATEs inside the countersign handler must re-check preconditions " +
      "in their own WHERE clause (a compare-and-swap), not just rely on the SELECT read at the top of the " +
      "request — otherwise two concurrent countersign calls can both pass the precondition read before " +
      "either commits, racing to upload the same fixed final.pdf storage path.",
    run: async ({ read }) => {
      const src = await read(FUNCTION);
      if (!src) return { ok: false, detail: [`${FUNCTION} not found`] };
      const bad = [];

      const countersignStart = src.indexOf('if (action === "countersign")');
      const declineStart = src.indexOf('if (action === "decline")');
      if (countersignStart === -1) {
        bad.push('no `if (action === "countersign")` branch found');
        return { ok: false, detail: bad };
      }
      // Bounded to just this branch — the decline branch further down
      // legitimately has its own, unrelated .is("employer_signed_at", null)
      // check, which must not mask a missing one here.
      const body = declineStart > countersignStart ? src.slice(countersignStart, declineStart) : src.slice(countersignStart);

      if (!/is\("employer_signed_at",\s*null\)/.test(body)) {
        bad.push("the reservation UPDATE's WHERE clause does not re-check employer_signed_at IS NULL");
      }
      // Scope this check to the finalize UPDATE specifically (between
      // "finalizedRows" and its own .select("id")) — the rollback path
      // later in the same block also legitimately contains
      // .eq("employer_signed_at", nowIso), so a whole-body search would
      // still pass even with the finalize UPDATE's own CAS clause removed.
      const finalizeIdx = body.indexOf("finalizedRows");
      const finalizeSlice = finalizeIdx === -1 ? "" : body.slice(finalizeIdx, body.indexOf('.select("id");', finalizeIdx) + 1);
      if (!/\.eq\("employer_signed_at",\s*nowIso\)/.test(finalizeSlice)) {
        bad.push("the finalize UPDATE's own WHERE clause does not condition on the exact reservation timestamp");
      }
      // Storage upload must happen strictly after the reservation CAS, never before —
      // that ordering is what serializes storage writes to a single winner.
      const reserveIdx = body.indexOf("reserveQuery");
      const uploadIdx = body.indexOf(".storage");
      if (reserveIdx === -1 || uploadIdx === -1 || uploadIdx < reserveIdx) {
        bad.push("the Storage upload must happen strictly after the reservation compare-and-swap, not before");
      }
      if (!/employer_signed_at:\s*null/.test(body) || !/rollback|roll back/i.test(body)) {
        bad.push("no rollback path resetting employer_signed_at on failure was found — a crash mid-flight would strand the document permanently");
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "sign-and-countersign-set-signed-at",
    why:
      "The countersign finalize UPDATE must set documents.signed_at — every mounted UI surface " +
      "(SignedDocumentViewer's header/identity-bar/audit-trail/export/PDF footer, useActivityFeed's " +
      "'document signed' gate) already reads document.signed_at as THE completion timestamp; leaving it " +
      "unset after a real countersign would blank every one of those surfaces on a fully executed document.",
    run: async ({ read }) => {
      const src = await read(FUNCTION);
      if (!src) return { ok: false, detail: [`${FUNCTION} not found`] };
      const bad = [];
      const countersignStart = src.indexOf('if (action === "countersign")');
      const declineStart = src.indexOf('if (action === "decline")');
      const body =
        countersignStart === -1
          ? ""
          : declineStart > countersignStart
            ? src.slice(countersignStart, declineStart)
            : src.slice(countersignStart);
      // Negative lookbehind excludes employer_signed_at:/candidate_signed_at:
      // (both legitimately set to nowIso elsewhere in this block) — this
      // must be the bare `signed_at:` key specifically.
      if (!/(?<![a-zA-Z_])signed_at:\s*nowIso/.test(body)) {
        bad.push("the countersign finalize UPDATE does not set the bare signed_at: nowIso (found only employer_signed_at/candidate_signed_at, which don't count)");
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "renderFinalPdf-is-deterministic-not-timestamped-with-now",
    why:
      "The stored final PDF is hashed once and served forever after — if its render embedded the wall-clock " +
      "time it was generated (the client burner's old 'Generated: ${new Date()}' footer), two renders of the " +
      "same completed document would never produce identical bytes, and final_pdf_hash would describe a file " +
      "that can never be reproduced or independently verified.",
    run: async ({ read }) => {
      const srcRaw = await read(RENDER_PDF);
      if (!srcRaw) return { ok: false, detail: [`${RENDER_PDF} not found`] };
      // Only look at real code — this file's own doc comments describe (and
      // quote) the old client burner's non-deterministic footer as the
      // reason this port changed it, which must not itself trip the check.
      const src = stripTsComments(srcRaw);
      const bad = [];
      if (/Generated:\s*\$\{(format\()?new Date\(\)/.test(src)) {
        bad.push("still stamps the rendered PDF with a `Generated: ${new Date()...}` footer in real code — not a pure function of stored data");
      }
      if (!/setDeterministicMetadata/.test(src)) {
        bad.push("no setDeterministicMetadata(...) call found — pdf-lib's CreationDate/ModDate default to `new Date()` unless pinned explicitly");
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "countersign-writes-audit-rows-only-after-finalize-succeeds",
    why:
      "document_audit_logs is immutable (a live, unconditional BEFORE DELETE trigger with no service_role " +
      "exemption — confirmed live 2026-09-16), so employer_review_confirmed/employer_countersigned/" +
      "document_completed must not be inserted for real until AFTER the finalize UPDATE has actually " +
      "succeeded (using in-memory records for the certificate's audit trail beforehand instead) — otherwise " +
      "a failed-then-retried countersign permanently orphans an attestation for a countersign that never " +
      "completed, with no way to remove it.",
    run: async ({ read }) => {
      const src = await read(FUNCTION);
      if (!src) return { ok: false, detail: [`${FUNCTION} not found`] };
      const bad = [];
      const countersignStart = src.indexOf('if (action === "countersign")');
      const declineStart = src.indexOf('if (action === "decline")');
      const body =
        countersignStart === -1
          ? ""
          : declineStart > countersignStart
            ? src.slice(countersignStart, declineStart)
            : src.slice(countersignStart);

      // The finalize UPDATE and the real audit-log inserts must appear in
      // that order — insertAuditLog(...) for employer_countersigned must
      // come strictly after the finalizedRows/finalizeError check, never
      // before it.
      const finalizeCheckIdx = body.indexOf("finalizedRows || finalizedRows.length === 0");
      const firstRealInsertIdx = body.indexOf('insertAuditLog({\n            action: "employer_review_confirmed"');
      if (finalizeCheckIdx === -1) {
        bad.push("no finalize-result check (finalizedRows/finalizeError) found in the countersign branch");
      } else if (firstRealInsertIdx === -1) {
        bad.push('no real insertAuditLog({ action: "employer_review_confirmed", ... }) call found after finalize');
      } else if (firstRealInsertIdx < finalizeCheckIdx) {
        bad.push("employer_review_confirmed is inserted before the finalize UPDATE is confirmed to have succeeded");
      }

      // Before the finalize write, the certificate's audit trail must be
      // built from in-memory entries, not a DB insert — no `delete()` call
      // is needed or possible against document_audit_logs.
      if (/document_audit_logs['"]\)\s*\.\s*delete\(/.test(body.replace(/\s+/g, " "))) {
        bad.push("countersign still attempts to delete() document_audit_logs rows — that table is immutable, this will always throw");
      }
      if (!/auditEntries:\s*CertificateAuditEntry\[\]\s*=\s*\[\.\.\.\(priorAuditRows/.test(body.replace(/\s+/g, " "))) {
        bad.push("auditEntries for the certificate is not built from in-memory entries (...priorAuditRows, reviewConfirmedEntry, countersignedEntry)");
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "candidate-email-flows-from-sign-into-countersign-certificate",
    why:
      "The candidate's own email must be captured once, in sign's candidate_signature_data JSON " +
      "(signerEmail: callerEmail), and read back directly in countersign — not derived by comparing the " +
      "employer's own callerEmail against a field that was never written, which always resolves to \"\" and " +
      "leaves the completion certificate's candidate email permanently blank.",
    run: async ({ read }) => {
      const src = await read(FUNCTION);
      if (!src) return { ok: false, detail: [`${FUNCTION} not found`] };
      const bad = [];
      const signStart = src.indexOf('if (action === "sign")');
      const countersignStart = src.indexOf('if (action === "countersign")');
      const signBody = signStart === -1 ? "" : src.slice(signStart, countersignStart === -1 ? undefined : countersignStart);
      if (!/signerEmail:\s*callerEmail/.test(signBody)) {
        bad.push("sign's candidate_signature_data JSON does not include signerEmail: callerEmail");
      }
      const declineStart = src.indexOf('if (action === "decline")');
      const countersignBody =
        countersignStart === -1 ? "" : declineStart > countersignStart ? src.slice(countersignStart, declineStart) : src.slice(countersignStart);
      if (/callerEmail\s*===\s*candidateParsed\?\.\s*signerEmail/.test(countersignBody)) {
        bad.push("countersign still self-compares callerEmail (the employer's own email) against candidateParsed?.signerEmail — always false");
      }
      if (!/candidateParsed\?\.\s*signerEmail/.test(countersignBody)) {
        bad.push("countersign does not read candidateParsed?.signerEmail at all");
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "render-signed-uploaded-pdf-guards-typed-signature-dataurl",
    why:
      "overlaySignature's dataUrlToBytes(sig.signatureDataUrl) call must be wrapped in its own try/catch — a " +
      "typed signature's value is a plain name string, not a data: URL, and dataUrlToBytes's fetch(dataUrl) " +
      "throws a hard TypeError for it. Only embedPng/embedJpg being guarded (the pre-fix state) still crashes " +
      "on the fetch() call itself, permanently failing every countersign of an uploaded-PDF document where " +
      "either party typed rather than drew their signature.",
    run: async ({ read }) => {
      const srcRaw = await read(RENDER_PDF);
      if (!srcRaw) return { ok: false, detail: [`${RENDER_PDF} not found`] };
      const src = stripTsComments(srcRaw);
      const bad = [];
      const fnMatch = /const overlaySignature = async[\s\S]*?\n  \};/.exec(src);
      if (!fnMatch) {
        bad.push("overlaySignature(...) not found in renderSignedUploadedPdf");
      } else {
        const body = fnMatch[0];
        // The fixed shape: an outer `try {` whose first real statement is
        // the dataUrlToBytes call (with embedPng/embedJpg's own try/catch
        // nested inside it) — i.e. no `}` between `try {` and the
        // dataUrlToBytes call.
        const tryIdx = body.search(/try\s*\{/);
        const dataUrlIdx = body.indexOf("dataUrlToBytes(sig.signatureDataUrl)");
        if (dataUrlIdx === -1) {
          bad.push("dataUrlToBytes(sig.signatureDataUrl) call not found");
        } else if (tryIdx === -1 || tryIdx > dataUrlIdx || body.slice(tryIdx, dataUrlIdx).includes("}")) {
          bad.push(
            "dataUrlToBytes(sig.signatureDataUrl) is not itself inside a try block — a typed signature's " +
              "plain-string value will throw an unhandled TypeError out of fetch(), uncaught",
          );
        }
        if (!/if\s*\(\s*sigImage\s*\)/.test(body)) {
          bad.push("no `if (sigImage)` guard found before drawImage — a null/undefined sigImage from a failed embed must not reach page.drawImage");
        }
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "document-viewer-dialog-is-deleted",
    why:
      "DocumentViewerDialog.tsx wrote only the legacy (status/signed_at/signature_data) columns with a raw, " +
      "unvalidated client UPDATE. Once protect_document_columns() ships, a re-mounted copy would start " +
      "throwing RAISE EXCEPTIONs (or worse, silently partial-fail) instead of being removed outright — fails " +
      "until the file is actually deleted, not just left unmounted.",
    run: async ({ read }) => {
      const src = await read(OLD_DIALOG);
      return {
        ok: src == null,
        detail: src == null ? [] : [`${OLD_DIALOG} still exists — it must be deleted, not left unmounted`],
      };
    },
  },
];
