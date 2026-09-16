// Document signing — the single service-role path that can move a
// public.documents row through pending -> signed. See
// docs/DOCUMENT-SIGNING.md for the design, and its revision log for how
// this differs from the first draft (atomicity, signed_at, IP capture).
//
// verify_jwt = true (config.toml) — unlike verify-document, every caller
// here must be a logged-in party. There's no anonymous case.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  canCountersign,
  canDecline,
  canSign,
  resolveDocumentRole,
  validateDeclineReason,
  validateReviewConfirmed,
  validateSignaturePayload,
  type DocumentRole,
  type DocumentSigningState,
  type TeamMembership,
} from "./stateMachine.ts";
import { computeV2Hash, computeV3Hash, sha256HexOfBytes, signatureHashInput } from "../_shared/documentHashChain.ts";
import { buildCompletionCertificate, type CertificateAuditEntry } from "../_shared/completionCertificateServer.ts";
import { renderSignedUploadedPdf, renderTextDocumentPdf, type SignatureOverlay } from "../_shared/renderFinalPdf.ts";
import { bestEffortIp } from "../_shared/bestEffortIp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(error: string, message: string, status: number): Response {
  return json({ error, message }, status);
}

// One human sentence per machine error code — kept in sync with §7 of the
// design doc, which maps these onto toast copy client-side too.
const ERROR_STATUS: Record<string, number> = {
  role_mismatch: 403,
  not_pending: 409,
  already_signed: 409,
  candidate_has_not_signed: 409,
  locked: 409,
  expired: 409,
  voided: 409,
  not_your_turn: 409,
  consent_required: 400,
  review_required: 400,
  invalid_signature: 400,
  invalid_reason: 400,
};

const ERROR_MESSAGE: Record<string, string> = {
  role_mismatch: "You are not authorized to take this action on this document.",
  not_pending: "This document is no longer pending — refresh to see its current state.",
  already_signed: "Someone already signed this — refresh to see the latest.",
  candidate_has_not_signed: "The candidate hasn't signed yet.",
  locked: "This document is locked and can no longer be changed.",
  expired: "This document has expired.",
  voided: "This document has been voided.",
  not_your_turn: "It isn't your turn to act on this document.",
  consent_required: "You must accept the electronic signature consent statement.",
  review_required: "You must confirm you reviewed the document before countersigning.",
  invalid_signature: "That signature isn't valid — try again.",
  invalid_reason: "Please give a reason between 3 and 500 characters.",
};

interface DocumentRow {
  id: string;
  application_id: string;
  name: string;
  file_url: string;
  document_type: string | null;
  status: "pending" | "signed" | "declined";
  candidate_signature_data: string | null;
  candidate_signed_at: string | null;
  employer_signature_data: string | null;
  employer_signed_at: string | null;
  v1_hash: string | null;
  v2_hash: string | null;
  v3_hash: string | null;
  document_hash: string | null;
  final_pdf_hash: string | null;
  is_locked: boolean;
  is_voided: boolean;
  expires_at: string | null;
  viewed_at: string | null;
  ip_address: string | null;
  document_code: string;
  created_at: string;
}

function toSigningState(doc: DocumentRow): DocumentSigningState {
  return {
    status: doc.status,
    candidateSignedAt: doc.candidate_signed_at,
    employerSignedAt: doc.employer_signed_at,
    isLocked: doc.is_locked,
    isVoided: doc.is_voided,
    expiresAt: doc.expires_at,
  };
}

/** The caller's user id — a missing/invalid token is a hard 401 here, not a
 *  silent "no signers" the way verify-document treats it (that function is
 *  public; this one never is). */
async function resolveCallerId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  if (!authHeader || !anonKey || !url) return null;
  try {
    const supabaseUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabaseUser.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

interface DocumentContentData {
  content: string | null;
  uploadedFileUrl?: string;
  signatureFields?: { id: string; type?: string; x?: number; y?: number; page?: number; width?: number; height?: number }[];
}

function parseDocumentData(fileUrl: string): DocumentContentData {
  try {
    if (fileUrl.startsWith("data:application/json;base64,")) {
      const json = atob(fileUrl.split(",")[1]);
      return JSON.parse(json) as DocumentContentData;
    }
    if (fileUrl.startsWith("data:text/plain;base64,")) {
      return { content: atob(fileUrl.split(",")[1]) };
    }
  } catch (_e) {
    // Falls through to the empty-content default — rendering still produces
    // a valid (if content-less) canonical PDF rather than failing the whole
    // countersign over a parse error in a field this function doesn't own.
  }
  return { content: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const callerId = await resolveCallerId(req);
    if (!callerId) return errorResponse("unauthorized", "Sign in to continue.", 401);

    let payload: {
      documentId?: string;
      action?: string;
      signature?: { method?: string; value?: string; consentAccepted?: boolean };
      reviewConfirmed?: boolean;
      declineReason?: string;
    };
    try {
      payload = await req.json();
    } catch {
      return errorResponse("bad_request", "Invalid request body.", 400);
    }

    const { documentId, action } = payload;
    if (!documentId || !action) {
      return errorResponse("bad_request", "documentId and action are required.", 400);
    }
    if (!["view", "sign", "countersign", "decline", "download"].includes(action)) {
      return errorResponse("bad_request", `Unknown action: ${action}`, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: document, error: docError } = await admin
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .maybeSingle<DocumentRow>();
    if (docError || !document) {
      return errorResponse("not_found", "Document not found.", 404);
    }

    const { data: application } = await admin
      .from("applications")
      .select("candidate_id, job_id")
      .eq("id", document.application_id)
      .maybeSingle();
    if (!application) {
      return errorResponse("not_found", "Document not found.", 404);
    }

    const { data: job } = await admin
      .from("jobs")
      .select("employer_id")
      .eq("id", application.job_id)
      .maybeSingle();
    if (!job) {
      return errorResponse("not_found", "Document not found.", 404);
    }

    const { data: teamRows } = await admin
      .from("team_members")
      .select("user_id, employer_id, status, can_send_documents, assigned_job_ids")
      .eq("user_id", callerId)
      .eq("employer_id", job.employer_id);
    const teamMemberships: TeamMembership[] = (teamRows ?? []).map((tm: any) => ({
      userId: tm.user_id,
      employerId: tm.employer_id,
      status: tm.status,
      canSendDocuments: tm.can_send_documents,
      assignedJobIds: tm.assigned_job_ids,
    }));

    const role: DocumentRole = resolveDocumentRole({
      callerId,
      candidateId: application.candidate_id,
      employerId: job.employer_id,
      jobId: application.job_id,
      teamMemberships,
    });

    if (!role) return errorResponse("role_mismatch", "You are not a party to this document.", 403);

    if (document.is_voided && action !== "view") {
      return errorResponse("voided", ERROR_MESSAGE.voided, 409);
    }

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", callerId)
      .maybeSingle();
    const callerName = callerProfile?.full_name || (role === "candidate" ? "Candidate" : "Employer");
    const callerEmail = callerProfile?.email || "";

    const nowIso = new Date().toISOString();
    const ip = bestEffortIp(req);
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    async function insertAuditLog(entry: {
      action: string;
      signerRole: "candidate" | "employer";
      signatureMethod?: string | null;
      consentConfirmed?: boolean | null;
      documentHash?: string | null;
      documentVersion?: number;
      preSignatureHash?: string | null;
      postSignatureHash?: string | null;
      signingOrderPosition?: number | null;
      details?: Record<string, unknown>;
    }) {
      await admin.from("document_audit_logs").insert({
        document_id: documentId,
        user_id: callerId,
        action: entry.action,
        signer_name: callerName,
        signer_email: callerEmail,
        signer_role: entry.signerRole,
        signature_method: entry.signatureMethod ?? null,
        consent_confirmed: entry.consentConfirmed ?? null,
        document_hash: entry.documentHash ?? null,
        document_version: entry.documentVersion ?? 1,
        pre_signature_hash: entry.preSignatureHash ?? null,
        post_signature_hash: entry.postSignatureHash ?? null,
        signing_order_position: entry.signingOrderPosition ?? null,
        ip_address: ip,
        user_agent: userAgent,
        details: entry.details ?? {},
      });
    }

    async function notify(userId: string, title: string, message: string, link: string) {
      await admin.from("notifications").insert({ user_id: userId, title, message, type: "system", link });
    }

    // ------------------------------------------------------------------
    // view
    // ------------------------------------------------------------------
    if (action === "view") {
      const { data: updated } = await admin
        .from("documents")
        .update({ viewed_at: nowIso })
        .eq("id", documentId)
        .is("viewed_at", null)
        .select("id")
        .maybeSingle();
      if (updated) {
        await insertAuditLog({ action: "document_viewed", signerRole: role, documentHash: document.document_hash });
      }
      return json({ ok: true });
    }

    // ------------------------------------------------------------------
    // download — a short-lived signed URL for the canonical final.pdf,
    // minted server-side after confirming the caller is a real party, so
    // the private 'documents' bucket never needs a per-document RLS
    // policy of its own (its live SELECT policy is scoped to the
    // uploader's own folder, `documents/<uploaderId>/...`, which doesn't
    // match the `documents/<documentId>/...` path this design stores the
    // final PDF under).
    // ------------------------------------------------------------------
    if (action === "download") {
      if (document.status !== "signed" || !document.final_pdf_hash) {
        return errorResponse("not_pending", "This document has no finished PDF yet.", 409);
      }
      const { data: signed, error: signErr } = await admin.storage
        .from("documents")
        .createSignedUrl(`documents/${documentId}/final.pdf`, 300);
      if (signErr || !signed) {
        return errorResponse("internal_error", "Could not prepare the download.", 500);
      }
      return json({ ok: true, url: signed.signedUrl });
    }

    // ------------------------------------------------------------------
    // sign (candidate)
    // ------------------------------------------------------------------
    if (action === "sign") {
      const precondition = canSign(toSigningState(document), role);
      if (!precondition.ok) {
        return errorResponse(precondition.error, ERROR_MESSAGE[precondition.error], ERROR_STATUS[precondition.error]);
      }
      const sigCheck = validateSignaturePayload(payload.signature);
      if (!sigCheck.ok) {
        return errorResponse(sigCheck.error, ERROR_MESSAGE[sigCheck.error], ERROR_STATUS[sigCheck.error]);
      }
      const signature = payload.signature!;
      const signatureValue = await signatureHashInput({ method: signature.method!, value: signature.value! });
      const v2Hash = await computeV2Hash({
        v1Hash: document.v1_hash ?? "",
        signatureValue,
        candidateEmail: callerEmail,
        timestampUtc: nowIso,
      });
      const signatureData = JSON.stringify({
        signatures: { recipient: signature.value },
        method: signature.method,
        signerName: callerName,
      });

      // Compare-and-swap: the WHERE clause re-checks every precondition at
      // the moment of the write, not just at the SELECT above. Postgres
      // serializes concurrent UPDATEs to the same row, so only one of two
      // racing `sign` calls can ever match this WHERE clause and return a
      // row — the loser gets 0 rows back and is treated as a lost race,
      // never inserting a duplicate audit row or notification.
      let query = admin
        .from("documents")
        .update({
          candidate_signature_data: signatureData,
          candidate_signed_at: nowIso,
          v2_hash: v2Hash,
          document_hash: v2Hash,
          ip_address: ip,
          user_agent: userAgent,
        })
        .eq("id", documentId)
        .eq("status", "pending")
        .is("candidate_signed_at", null)
        .eq("is_locked", false)
        .eq("is_voided", false);
      query = document.expires_at
        ? query.or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        : query;
      const { data: updatedRows, error: updateError } = await query.select("id");

      if (updateError || !updatedRows || updatedRows.length === 0) {
        // Lost the race (or the state changed under us) — re-check against
        // a fresh read so the error code reflects reality, not the stale
        // precondition read from the top of this request.
        const { data: fresh } = await admin.from("documents").select("*").eq("id", documentId).maybeSingle<DocumentRow>();
        const reCheck = fresh ? canSign(toSigningState(fresh), role) : { ok: false as const, error: "not_pending" as const };
        const code = reCheck.ok ? "already_signed" : reCheck.error;
        return errorResponse(code, ERROR_MESSAGE[code] ?? "Could not sign this document.", ERROR_STATUS[code] ?? 409);
      }

      await insertAuditLog({
        action: "candidate_signed",
        signerRole: "candidate",
        signatureMethod: signature.method,
        consentConfirmed: true,
        documentHash: v2Hash,
        documentVersion: 2,
        preSignatureHash: document.v1_hash,
        postSignatureHash: v2Hash,
        signingOrderPosition: 1,
        details: { event: "Candidate signed document", version_transition: "v1 -> v2" },
      });

      if (job.employer_id) {
        await notify(
          job.employer_id,
          "A candidate signed — your turn",
          `${callerName} signed ${document.name}. Countersign it to finish.`,
          "/documents",
        );
      }

      return json({ ok: true });
    }

    // ------------------------------------------------------------------
    // countersign (employer) — two-phase: reserve, then render+finalize.
    // See docs/DOCUMENT-SIGNING.md's revision log (item 1) for why this is
    // split instead of one write: a fixed storage path
    // (documents/<id>/final.pdf) means storage writes themselves must be
    // serialized, not just the DB row — the reservation CAS below fails
    // fast, before any render/Storage I/O, for every caller but the one
    // true winner of a race.
    // ------------------------------------------------------------------
    if (action === "countersign") {
      const precondition = canCountersign(toSigningState(document), role);
      if (!precondition.ok) {
        return errorResponse(precondition.error, ERROR_MESSAGE[precondition.error], ERROR_STATUS[precondition.error]);
      }
      const reviewCheck = validateReviewConfirmed(payload.reviewConfirmed);
      if (!reviewCheck.ok) {
        return errorResponse(reviewCheck.error, ERROR_MESSAGE[reviewCheck.error], ERROR_STATUS[reviewCheck.error]);
      }
      const sigCheck = validateSignaturePayload(payload.signature);
      if (!sigCheck.ok) {
        return errorResponse(sigCheck.error, ERROR_MESSAGE[sigCheck.error], ERROR_STATUS[sigCheck.error]);
      }
      const signature = payload.signature!;

      // Phase 1: reserve. Setting employer_signed_at now (before rendering
      // anything) is what makes a concurrent call's own CAS fail instead of
      // racing to upload the same storage object.
      let reserveQuery = admin
        .from("documents")
        .update({ employer_signed_at: nowIso })
        .eq("id", documentId)
        .eq("status", "pending")
        .not("candidate_signed_at", "is", null)
        .is("employer_signed_at", null)
        .eq("is_locked", false)
        .eq("is_voided", false);
      reserveQuery = document.expires_at
        ? reserveQuery.or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        : reserveQuery;
      const { data: reservedRows, error: reserveError } = await reserveQuery.select("*");

      if (reserveError || !reservedRows || reservedRows.length === 0) {
        const { data: fresh } = await admin.from("documents").select("*").eq("id", documentId).maybeSingle<DocumentRow>();
        const reCheck = fresh ? canCountersign(toSigningState(fresh), role) : { ok: false as const, error: "not_pending" as const };
        const code = reCheck.ok ? "already_signed" : reCheck.error;
        return errorResponse(code, ERROR_MESSAGE[code] ?? "Could not countersign this document.", ERROR_STATUS[code] ?? 409);
      }

      const reserved = reservedRows[0] as DocumentRow;

      try {
        const signatureValue = await signatureHashInput({ method: signature.method!, value: signature.value! });
        const v3Hash = await computeV3Hash({
          v2Hash: reserved.v2_hash ?? "",
          signatureValue,
          employerEmail: callerEmail,
          timestampUtc: nowIso,
        });
        const employerSignatureData = JSON.stringify({
          signatures: { employer: signature.value },
          method: signature.method,
          signerName: callerName,
        });

        // Render the ONE canonical final PDF.
        const contentData = parseDocumentData(document.file_url);
        const candidateParsed = document.candidate_signature_data ? JSON.parse(document.candidate_signature_data) : null;
        const candidateSigValue = candidateParsed?.signatures?.recipient ?? null;
        const candidateField = contentData.signatureFields?.find((f) => f.type === "candidate");
        const employerField = contentData.signatureFields?.find((f) => f.type === "employer");

        const candidateOverlay: SignatureOverlay | null = candidateSigValue
          ? {
              signatureDataUrl: candidateSigValue,
              x: candidateField?.x ?? 10,
              y: candidateField?.y ?? 80,
              width: candidateField?.width ?? 25,
              height: candidateField?.height ?? 8,
              page: candidateField?.page ?? 1,
              signerName: candidateParsed?.signerName || "Candidate",
              signedAt: reserved.candidate_signed_at ?? "",
              signerRole: "candidate",
            }
          : null;
        const employerOverlay: SignatureOverlay = {
          signatureDataUrl: signature.value!,
          x: employerField?.x ?? 55,
          y: employerField?.y ?? 80,
          width: employerField?.width ?? 25,
          height: employerField?.height ?? 8,
          page: employerField?.page ?? 1,
          signerName: callerName,
          signedAt: nowIso,
          signerRole: "employer",
        };

        // Audit entries first (matches how the client's own certificate
        // builder always scanned the *completed* audit trail — see
        // docs/DOCUMENT-SIGNING.md §3): employer_review_confirmed and
        // employer_countersigned are written now, before the certificate is
        // built, so audit_entries_count/audit_trail_hash on the certificate
        // reflect the complete signing history, not a partial one.
        await insertAuditLog({
          action: "employer_review_confirmed",
          signerRole: "employer",
          documentHash: reserved.v2_hash,
          details: { event: "Employer confirmed review of document and candidate signature" },
        });
        await insertAuditLog({
          action: "employer_countersigned",
          signerRole: "employer",
          signatureMethod: signature.method,
          consentConfirmed: true,
          documentHash: v3Hash,
          documentVersion: 3,
          preSignatureHash: reserved.v2_hash,
          postSignatureHash: v3Hash,
          signingOrderPosition: 2,
          details: { event: "Employer countersigned document", version_transition: "v2 -> v3" },
        });

        const { data: auditRows } = await admin
          .from("document_audit_logs")
          .select("action, created_at, user_id, document_hash")
          .eq("document_id", documentId)
          .order("created_at", { ascending: true });
        const auditEntries: CertificateAuditEntry[] = auditRows ?? [];

        const certificateData = {
          documentId,
          documentCode: reserved.document_code,
          documentName: reserved.name,
          documentType: reserved.document_type,
          completionTimestampUtc: nowIso,
          candidateName: candidateParsed?.signerName || "Candidate",
          candidateEmail: undefined,
          candidateSignedAt: reserved.candidate_signed_at ?? nowIso,
          candidateIp: reserved.ip_address ?? undefined,
          employerName: callerName,
          employerEmail: callerEmail || undefined,
          employerSignedAt: nowIso,
          employerIp: ip,
          v1Hash: reserved.v1_hash,
          v2Hash: reserved.v2_hash,
          v3Hash,
          auditEntriesCount: auditEntries.length,
        };

        let finalBytes: Uint8Array;
        if (contentData.uploadedFileUrl) {
          const originalResp = await fetch(contentData.uploadedFileUrl);
          if (!originalResp.ok) throw new Error("Could not fetch the original uploaded PDF");
          const originalBytes = await originalResp.arrayBuffer();
          finalBytes = await renderSignedUploadedPdf(originalBytes, candidateOverlay, employerOverlay, certificateData);
        } else {
          finalBytes = await renderTextDocumentPdf(contentData.content ?? "", candidateOverlay, employerOverlay, certificateData);
        }

        const finalPdfHash = await sha256HexOfBytes(finalBytes);
        const storagePath = `documents/${documentId}/final.pdf`;
        const { error: uploadError } = await admin.storage
          .from("documents")
          .upload(storagePath, finalBytes, { contentType: "application/pdf", upsert: true });
        if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

        const certificate = await buildCompletionCertificate({
          documentId,
          documentName: reserved.name,
          documentType: reserved.document_type,
          v1Hash: reserved.v1_hash,
          v1Timestamp: reserved.created_at,
          v2Hash: reserved.v2_hash ?? "",
          v3Hash,
          candidateName: certificateData.candidateName,
          candidateEmail: callerEmail === candidateParsed?.signerEmail ? callerEmail : (candidateParsed?.signerEmail ?? ""),
          candidateSignedAt: reserved.candidate_signed_at ?? nowIso,
          candidateIp: reserved.ip_address ?? "unknown",
          employerName: callerName,
          employerEmail: callerEmail,
          employerSignedAt: nowIso,
          employerReviewConfirmedAt: nowIso,
          employerIp: ip,
          finalPdfHash,
          completionTimestampUtc: nowIso,
          auditEntries,
        });

        await insertAuditLog({
          action: "document_completed",
          signerRole: "employer",
          documentHash: finalPdfHash,
          details: { is_locked: true },
        });

        // Phase 2 finalize — CAS on the reservation timestamp is
        // defense-in-depth: by construction we're the only caller that
        // could have reached this point for this document.
        const { data: finalizedRows, error: finalizeError } = await admin
          .from("documents")
          .update({
            employer_signature_data: employerSignatureData,
            v3_hash: v3Hash,
            document_hash: v3Hash,
            final_pdf_hash: finalPdfHash,
            status: "signed",
            is_locked: true,
            locked_at: nowIso,
            completion_certificate: certificate,
            signed_at: nowIso,
            ip_address: ip,
            user_agent: userAgent,
          })
          .eq("id", documentId)
          .eq("employer_signed_at", nowIso)
          .select("id");

        if (finalizeError || !finalizedRows || finalizedRows.length === 0) {
          throw new Error("Could not finalize the countersigned document");
        }

        const candidateId = application.candidate_id;
        if (candidateId) {
          await notify(
            candidateId,
            "Your document is fully signed",
            `${reserved.name} is complete. Download your copy anytime.`,
            "/my-documents",
          );
        }

        return json({ ok: true });
      } catch (e) {
        // Roll back the reservation so a transient failure (render error,
        // storage hiccup, network blip) doesn't leave the document
        // permanently stuck "claimed" with no way for a retry to proceed.
        // Only rolls back if it's still exactly the state we reserved it
        // into — a no-op if it somehow already finished or moved on.
        await admin
          .from("documents")
          .update({ employer_signed_at: null })
          .eq("id", documentId)
          .eq("employer_signed_at", nowIso)
          .eq("status", "pending")
          .eq("is_locked", false);
        console.error("[document-signing] countersign failed:", e);
        return errorResponse("internal_error", "Could not countersign this document. Please try again.", 500);
      }
    }

    // ------------------------------------------------------------------
    // decline
    // ------------------------------------------------------------------
    if (action === "decline") {
      const precondition = canDecline(toSigningState(document), role);
      if (!precondition.ok) {
        return errorResponse(precondition.error, ERROR_MESSAGE[precondition.error], ERROR_STATUS[precondition.error]);
      }
      const reasonCheck = validateDeclineReason(payload.declineReason);
      if (!reasonCheck.ok) {
        return errorResponse(reasonCheck.error, ERROR_MESSAGE[reasonCheck.error], ERROR_STATUS[reasonCheck.error]);
      }

      let query = admin
        .from("documents")
        .update({
          status: "declined",
          declined_at: nowIso,
          decline_reason: reasonCheck.value,
          ip_address: ip,
          user_agent: userAgent,
        })
        .eq("id", documentId)
        .eq("status", "pending")
        .eq("is_locked", false)
        .eq("is_voided", false);
      if (role === "candidate") {
        query = query.is("candidate_signed_at", null);
      } else {
        query = query.not("candidate_signed_at", "is", null).is("employer_signed_at", null);
      }
      const { data: updatedRows, error: updateError } = await query.select("id");

      if (updateError || !updatedRows || updatedRows.length === 0) {
        const { data: fresh } = await admin.from("documents").select("*").eq("id", documentId).maybeSingle<DocumentRow>();
        const reCheck = fresh ? canDecline(toSigningState(fresh), role) : { ok: false as const, error: "not_pending" as const };
        const code = reCheck.ok ? "not_your_turn" : reCheck.error;
        return errorResponse(code, ERROR_MESSAGE[code] ?? "Could not decline this document.", ERROR_STATUS[code] ?? 409);
      }

      await insertAuditLog({
        action: "document_declined",
        signerRole: role,
        details: { decline_reason: reasonCheck.value },
      });

      const otherPartyId = role === "candidate" ? job.employer_id : application.candidate_id;
      if (otherPartyId) {
        await notify(
          otherPartyId,
          "A document was declined",
          `${callerName} declined ${document.name}: ${reasonCheck.value}`,
          role === "candidate" ? "/documents" : "/my-documents",
        );
      }

      return json({ ok: true });
    }

    return errorResponse("bad_request", "Unhandled action.", 400);
  } catch (error) {
    console.error("[document-signing] Error:", error);
    return errorResponse("internal_error", "Something went wrong. Please try again.", 500);
  }
});
