/**
 * Document signing shipped with no way for an employer to cancel a document
 * once sent (docs/DOCUMENT-SIGNING.md's "Must-change 3" revision-log entry
 * called this out explicitly as future work: "An employer has no path in
 * this design to withdraw/cancel a document before the candidate signs").
 * protect_document_columns() blocked is_voided/voided_at/voided_reason from
 * every client, including the document-signing edge function's own
 * withdraw/void actions — except the edge function runs as service_role,
 * which that trigger has always exempted, so no migration change was
 * needed to unlock the write path itself.
 *
 * This pass adds the two missing lifecycle actions, both through the same
 * service-role document-signing function (never a direct client write):
 *
 *   - WITHDRAW — the sender cancels a document before the candidate signs
 *     (status stays 'pending'; is_voided/voided_at/voided_reason record it;
 *     the candidate's to-sign badge counts stop counting it; the candidate
 *     sees an honest "withdrawn" note, not "awaiting your signature").
 *   - VOID — the employer cancels a document the candidate already signed,
 *     before countersigning. A completed (locked) document cannot be
 *     voided in this pass — canVoid() refuses with "locked", a deliberate
 *     scope cut, not an oversight.
 *
 * Fixed by:
 *   - supabase/functions/document-signing/stateMachine.ts — canWithdraw() /
 *     canVoid() precondition functions (proven directly in
 *     scripts/document_signing_state_machine.test.mjs).
 *   - supabase/functions/document-signing/index.ts — "withdraw"/"void"
 *     actions, each a single compare-and-swap UPDATE (same shape as
 *     decline), a required reason (validateDeclineReason), a
 *     document_withdrawn/document_voided audit-log row, and a candidate
 *     notification.
 *   - src/hooks/usePendingDocumentsCount.ts /
 *     useEmployerPendingDocumentsCount.ts — both exclude is_voided, so a
 *     cancelled document stops inflating "waiting on you".
 *   - src/cockpit/lib/mappers.ts / src/cockpit/data.ts /
 *     src/cockpit/pages/Documents.tsx — Withdrawn/Voided read as their own
 *     DocStatus (not "Pending"), with Withdraw/Void row actions.
 *   - src/components/documents/SignedDocumentViewer.tsx /
 *     src/pages/MyDocuments.tsx — the candidate-facing viewer/list report
 *     is_voided truthfully and hide the sign/countersign panel on a
 *     cancelled document.
 *   - supabase/functions/verify-document/index.ts / src/pages/VerifyDocument.tsx —
 *     /verify reports a voided document as cancelled, not "could not be
 *     verified" (which reads as tampering).
 *
 * These are static text checks over the source — cheap, no server or DB
 * needed — not a substitute for scripts/document_signing_state_machine.test.mjs
 * (the precondition proofs) or actually calling the deployed function.
 */

const STATE_MACHINE = "supabase/functions/document-signing/stateMachine.ts";
const FUNCTION = "supabase/functions/document-signing/index.ts";
const CANDIDATE_COUNT = "src/hooks/usePendingDocumentsCount.ts";
const EMPLOYER_COUNT = "src/hooks/useEmployerPendingDocumentsCount.ts";
const VERIFY_FUNCTION = "supabase/functions/verify-document/index.ts";
const VERIFY_PAGE = "src/pages/VerifyDocument.tsx";
const VIEWER = "src/components/documents/SignedDocumentViewer.tsx";
const MAPPERS = "src/cockpit/lib/mappers.ts";
const COCKPIT_DOCS_PAGE = "src/cockpit/pages/Documents.tsx";

/** Strips `//` and block comments so a regex only ever matches real code. */
function stripTsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

export default [
  {
    id: "state-machine-has-withdraw-and-void-preconditions",
    why:
      "canWithdraw() must refuse once the candidate has signed (that's a void, not a withdraw), and canVoid() " +
      "must refuse before the candidate has signed AND once the document is locked (completed documents cannot " +
      "be voided in this pass) — without these, the edge function has no server-side authorization gate for " +
      "either new action.",
    run: async ({ read }) => {
      const src = await read(STATE_MACHINE);
      if (!src) return { ok: false, detail: [`${STATE_MACHINE} not found`] };
      const bad = [];

      const withdrawMatch = /export function canWithdraw\([\s\S]*?\n\}/.exec(src);
      if (!withdrawMatch) {
        bad.push("canWithdraw(...) not found");
      } else {
        const body = withdrawMatch[0];
        if (!/candidateSignedAt\s*!==\s*null/.test(body)) {
          bad.push("canWithdraw does not refuse once doc.candidateSignedAt is set");
        }
        if (!/role\s*!==\s*["']employer["']/.test(body)) {
          bad.push("canWithdraw does not restrict the caller to the employer side");
        }
        if (!/isLocked/.test(body)) {
          bad.push("canWithdraw does not check doc.isLocked");
        }
      }

      const voidMatch = /export function canVoid\([\s\S]*?\n\}/.exec(src);
      if (!voidMatch) {
        bad.push("canVoid(...) not found");
      } else {
        const body = voidMatch[0];
        if (!/candidateSignedAt\s*===\s*null/.test(body)) {
          bad.push("canVoid does not refuse before doc.candidateSignedAt is set");
        }
        if (!/isLocked/.test(body)) {
          bad.push("canVoid does not check doc.isLocked — a completed/locked document must not be voidable in this pass");
        }
        if (!/role\s*!==\s*["']employer["']/.test(body)) {
          bad.push("canVoid does not restrict the caller to the employer side");
        }
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "document-signing-withdraw-and-void-actions-are-cas-updates-with-a-required-reason",
    why:
      "Both withdraw and void must (a) call their own precondition function, (b) require and validate a " +
      "reason before writing anything, (c) write is_voided/voided_at/voided_reason via a compare-and-swap " +
      "UPDATE whose WHERE clause re-checks is_voided = false (so two concurrent withdraw/void calls can't " +
      "both succeed and double-notify), and (d) write an audit-log row — otherwise a cancelled document has " +
      "no reason on record and no audit trail.",
    run: async ({ read }) => {
      const src = await read(FUNCTION);
      if (!src) return { ok: false, detail: [`${FUNCTION} not found`] };
      const bad = [];

      if (!/\[\s*"view"\s*,\s*"sign"\s*,\s*"countersign"\s*,\s*"decline"\s*,\s*"download"\s*,\s*"withdraw"\s*,\s*"void"\s*\]/.test(src)) {
        bad.push('the allowed-actions list does not include "withdraw" and "void"');
      }

      for (const [action, fn] of [["withdraw", "canWithdraw"], ["void", "canVoid"]]) {
        const startIdx = src.indexOf(`if (action === "${action}")`);
        if (startIdx === -1) {
          bad.push(`no \`if (action === "${action}")\` branch found`);
          continue;
        }
        // Bounded to roughly this branch — the next top-level `if (action ===`
        // (or end of file) closes it off.
        const nextIdx = src.indexOf('if (action === "', startIdx + 10);
        const body = nextIdx === -1 ? src.slice(startIdx) : src.slice(startIdx, nextIdx);

        if (!new RegExp(`${fn}\\(`).test(body)) {
          bad.push(`the ${action} branch does not call ${fn}(...)`);
        }
        if (!/validateDeclineReason\(payload\.reason\)/.test(body)) {
          bad.push(`the ${action} branch does not validate payload.reason via validateDeclineReason(...)`);
        }
        if (!/is_voided:\s*true/.test(body)) {
          bad.push(`the ${action} branch does not set is_voided: true`);
        }
        if (!/voided_at:\s*nowIso/.test(body)) {
          bad.push(`the ${action} branch does not set voided_at: nowIso`);
        }
        if (!/voided_reason:\s*reasonCheck\.value/.test(body)) {
          bad.push(`the ${action} branch does not set voided_reason from the validated reason`);
        }
        // The compare-and-swap: the UPDATE's own WHERE clause must re-check
        // is_voided = false, not just the earlier SELECT read at the top of
        // the request — otherwise two concurrent withdraw/void calls on the
        // same document could both pass and both fire a notification.
        const updateIdx = body.indexOf(".update({");
        const selectIdx = body.indexOf('.select("id")', updateIdx);
        const updateSlice = updateIdx === -1 || selectIdx === -1 ? "" : body.slice(updateIdx, selectIdx);
        if (!/\.eq\("is_voided",\s*false\)/.test(updateSlice)) {
          bad.push(`the ${action} branch's UPDATE WHERE clause does not re-check is_voided = false (not a real compare-and-swap)`);
        }
        const insertAuditAction = action === "withdraw" ? "document_withdrawn" : "document_voided";
        if (!new RegExp(`action:\\s*"${insertAuditAction}"`).test(body)) {
          bad.push(`the ${action} branch does not insert an audit-log row with action "${insertAuditAction}"`);
        }
        if (!/await notify\(/.test(body)) {
          bad.push(`the ${action} branch does not notify the other party`);
        }
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "withdraw-and-void-require-a-genuinely-pending-not-already-voided-document",
    why:
      "Neither withdraw nor void's UPDATE WHERE clause may be missing status = 'pending' or is_locked = false " +
      "— without both, a completed (locked, fully signed) document could be silently voided with no audit " +
      "trail on the countersigned result, which is exactly the regression protect_document_columns() closed " +
      "for a direct client write.",
    run: async ({ read }) => {
      const srcRaw = await read(FUNCTION);
      if (!srcRaw) return { ok: false, detail: [`${FUNCTION} not found`] };
      const src = stripTsComments(srcRaw);
      const bad = [];

      for (const action of ["withdraw", "void"]) {
        const startIdx = src.indexOf(`if (action === "${action}")`);
        if (startIdx === -1) {
          bad.push(`no \`if (action === "${action}")\` branch found`);
          continue;
        }
        const nextIdx = src.indexOf('if (action === "', startIdx + 10);
        const body = nextIdx === -1 ? src.slice(startIdx) : src.slice(startIdx, nextIdx);
        const updateIdx = body.indexOf(".update({");
        const selectIdx = body.indexOf('.select("id")', updateIdx);
        const updateSlice = updateIdx === -1 || selectIdx === -1 ? "" : body.slice(updateIdx, selectIdx);
        if (!/\.eq\("status",\s*"pending"\)/.test(updateSlice)) {
          bad.push(`the ${action} branch's UPDATE WHERE clause does not require status = 'pending'`);
        }
        if (!/\.eq\("is_locked",\s*false\)/.test(updateSlice)) {
          bad.push(`the ${action} branch's UPDATE WHERE clause does not require is_locked = false`);
        }
      }

      // void specifically must require the candidate to have already signed
      // (candidate_signed_at IS NOT NULL) and the employer to not have
      // countersigned yet (employer_signed_at IS NULL) — otherwise void and
      // withdraw would overlap.
      const voidIdx = src.indexOf('if (action === "void")');
      const voidBody = voidIdx === -1 ? "" : src.slice(voidIdx, src.indexOf('if (action === "', voidIdx + 10) === -1 ? undefined : src.indexOf('if (action === "', voidIdx + 10));
      if (!/\.not\("candidate_signed_at",\s*"is",\s*null\)/.test(voidBody)) {
        bad.push('the void branch does not require candidate_signed_at IS NOT NULL');
      }
      if (!/\.is\("employer_signed_at",\s*null\)/.test(voidBody)) {
        bad.push('the void branch does not require employer_signed_at IS NULL');
      }

      // withdraw specifically must require the candidate to NOT have signed
      // yet — otherwise it overlaps with void's own scope.
      const withdrawIdx = src.indexOf('if (action === "withdraw")');
      const withdrawBody =
        withdrawIdx === -1 ? "" : src.slice(withdrawIdx, src.indexOf('if (action === "', withdrawIdx + 10) === -1 ? undefined : src.indexOf('if (action === "', withdrawIdx + 10));
      if (!/\.is\("candidate_signed_at",\s*null\)/.test(withdrawBody)) {
        bad.push('the withdraw branch does not require candidate_signed_at IS NULL');
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "pending-document-badge-counts-exclude-voided",
    why:
      "A withdrawn/voided document is still status = 'pending' underneath — both badge-count hooks must add " +
      "is_voided = false to their documents query, or a cancelled document keeps inflating \"waiting on you\" " +
      "for the candidate and \"needs your countersignature\" for the employer forever.",
    run: async ({ read }) => {
      const bad = [];
      const candidateSrc = await read(CANDIDATE_COUNT);
      if (!candidateSrc) bad.push(`${CANDIDATE_COUNT} not found`);
      else if (!/\.eq\("is_voided",\s*false\)/.test(candidateSrc)) {
        bad.push(`${CANDIDATE_COUNT} does not filter is_voided = false on its documents count query`);
      }
      const employerSrc = await read(EMPLOYER_COUNT);
      if (!employerSrc) bad.push(`${EMPLOYER_COUNT} not found`);
      else if (!/\.eq\("is_voided",\s*false\)/.test(employerSrc)) {
        bad.push(`${EMPLOYER_COUNT} does not filter is_voided = false on its documents count query`);
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "signed-document-viewer-hides-sign-and-countersign-on-a-voided-document",
    why:
      "canSignAsCandidate/canCountersignAsEmployer must both check !document.is_voided — otherwise a " +
      "candidate could still sign a document the employer just withdrew (or an employer could countersign " +
      "one they just voided), racing the server's own is_voided check with a UI that still shows the panel.",
    run: async ({ read }) => {
      const src = await read(VIEWER);
      if (!src) return { ok: false, detail: [`${VIEWER} not found`] };
      const bad = [];
      const signMatch = /const canSignAsCandidate =[\s\S]*?;/.exec(src);
      if (!signMatch || !/is_voided/.test(signMatch[0])) {
        bad.push("canSignAsCandidate does not check document.is_voided");
      }
      const countersignMatch = /const canCountersignAsEmployer =[\s\S]*?;/.exec(src);
      if (!countersignMatch || !/is_voided/.test(countersignMatch[0])) {
        bad.push("canCountersignAsEmployer does not check document.is_voided");
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "verify-document-reports-voided-documents-truthfully",
    why:
      "A withdrawn/voided document is still status = 'pending', and the existing generic " +
      "'Document integrity could not be verified' message reads as tampering — /verify must say the " +
      "document was withdrawn or voided by the employer, and carry isVoided on the wire so the page can " +
      "show an honest status instead of a bare 'pending'.",
    run: async ({ read }) => {
      const bad = [];
      const fnSrc = await read(VERIFY_FUNCTION);
      if (!fnSrc) bad.push(`${VERIFY_FUNCTION} not found`);
      else {
        if (!/isVoided\??:\s*boolean/.test(fnSrc)) {
          bad.push("VerificationResponse does not declare isVoided");
        }
        if (!/isVoided:\s*!!document\.is_voided/.test(fnSrc)) {
          bad.push("the response object does not set isVoided from document.is_voided");
        }
        if (!/withdrawn by the employer/.test(fnSrc) || !/voided by the employer/.test(fnSrc)) {
          bad.push("no distinct withdrawn/voided copy found — the errorMessage still reads as generic tampering language");
        }
      }
      const pageSrc = await read(VERIFY_PAGE);
      if (!pageSrc) bad.push(`${VERIFY_PAGE} not found`);
      else if (!/isVoided/.test(pageSrc)) {
        bad.push(`${VERIFY_PAGE} never reads data.isVoided — the status badge still shows a bare 'pending' for a cancelled document`);
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "cockpit-documents-surface-withdrawn-and-voided-as-their-own-status",
    why:
      "mapDocStatus must check is_voided before falling through to the raw status, and DocStatus/CHIPS must " +
      "include Withdrawn and Voided — otherwise a cancelled document keeps reading as \"Pending\" (\"Waiting\") " +
      "in the cockpit's own Documents drawer, the exact surface an employer uses to withdraw/void it from.",
    run: async ({ read }) => {
      const bad = [];
      const mappersSrc = await read(MAPPERS);
      if (!mappersSrc) bad.push(`${MAPPERS} not found`);
      else {
        const fnMatch = /function mapDocStatus\([\s\S]*?\n\}/.exec(mappersSrc);
        if (!fnMatch) {
          bad.push("mapDocStatus(...) not found");
        } else if (!/isVoided/.test(fnMatch[0]) || !/["']Withdrawn["']/.test(fnMatch[0]) || !/["']Voided["']/.test(fnMatch[0])) {
          bad.push("mapDocStatus does not return \"Withdrawn\"/\"Voided\" based on isVoided");
        }
      }
      const pageSrc = await read(COCKPIT_DOCS_PAGE);
      if (!pageSrc) bad.push(`${COCKPIT_DOCS_PAGE} not found`);
      else {
        if (!/Withdrawn:\s*\{/.test(pageSrc) || !/Voided:\s*\{/.test(pageSrc)) {
          bad.push("CHIPS does not have Withdrawn/Voided entries");
        }
        if (!/onWithdraw/.test(pageSrc) || !/onVoid/.test(pageSrc)) {
          bad.push("the Documents page has no Withdraw/Void row action wired up");
        }
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
  {
    id: "cockpit-withdraw-void-surfaces-the-real-server-error",
    why:
      "@supabase/functions-js treats every non-2xx response (which is every error the document-signing " +
      "function returns — role_mismatch, not_pending, locked, voided, invalid_reason, candidate_already_signed, " +
      "countersign_in_progress, unauthorized, all via errorResponse()) as a thrown FunctionsHttpError with " +
      "`data: null` — the JSON error body only lives on `error.context`. Reading `data?.error` after " +
      "`invoke()` (instead of going through invokeDocumentSigning, which parses error.context) always sees " +
      "`data === null` and silently falls back to the generic \"Something went wrong\" message, so the " +
      "purpose-built copy in documentSigningErrors.ts (e.g. \"void it instead of withdrawing\") never reaches " +
      "the employer.",
    run: async ({ read }) => {
      const bad = [];
      const helperSrc = await read("src/lib/documentSigningErrors.ts");
      if (!helperSrc) bad.push("src/lib/documentSigningErrors.ts not found");
      else if (!/export async function invokeDocumentSigning/.test(helperSrc) || !/error\.context/.test(helperSrc) && !/\}\)\.context/.test(helperSrc) && !/as \{ context\?: Response \}\)\.context/.test(helperSrc)) {
        bad.push("invokeDocumentSigning is missing or does not parse error.context");
      }
      const pageSrc = await read(COCKPIT_DOCS_PAGE);
      if (!pageSrc) bad.push(`${COCKPIT_DOCS_PAGE} not found`);
      else {
        if (!/invokeDocumentSigning/.test(pageSrc)) {
          bad.push(`${COCKPIT_DOCS_PAGE} does not call invokeDocumentSigning — withdraw/void errors will be swallowed`);
        }
        const stripped = stripTsComments(pageSrc);
        if (/data\?\.error/.test(stripped) || /data\.error/.test(stripped)) {
          bad.push(`${COCKPIT_DOCS_PAGE} still reads data?.error directly — that field is always null on a FunctionsHttpError`);
        }
      }
      const panelSrc = await read("src/components/documents/DocumentSigningPanel.tsx");
      if (!panelSrc) bad.push("src/components/documents/DocumentSigningPanel.tsx not found");
      else if (!/invokeDocumentSigning/.test(panelSrc)) {
        bad.push("DocumentSigningPanel.tsx no longer routes through invokeDocumentSigning");
      }
      return { ok: bad.length === 0, detail: bad };
    },
  },
];
