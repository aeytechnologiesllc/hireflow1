import { useEffect, useState } from "react";
import { supabase, SUPABASE_URL } from "@/integrations/supabase/client";
import { externalHref } from "@/lib/safeLink";
import { ownDocumentsPath } from "@/lib/ownDocumentFile";
import { refusedForRole } from "@/lib/documentSigningErrors";
import { generatePdfHash } from "@/lib/pdfSignatureBurner";
import { TEAM_PERMISSION_NAMES } from "@/lib/teamPermissions";

/**
 * The uploaded PDF a signing screen shows, and its hash: fetched once and
 * shown from those very bytes, and the signature is sent with their hash, so
 * the server signs nothing the applicant did not see (the third Phase 7
 * security review; supabase/functions/_shared/documentShown.ts). One loader
 * for every screen that shows a file to sign: the two signing screens
 * (ApplicantDocumentSheet, TeamDocumentSheet) and the signing record
 * (SignedDocumentViewer).
 */
export type ShownPdf = { src: string; hash: string };

/** Why it could not be shown: the file is not a PDF ("not_pdf"), or it could
 *  not be fetched just now ("unavailable"). Only the first is the file's
 *  fault (the tenth product review: a voided PDF was "not a PDF"). Or the
 *  signed copy is not this person's to open ("not_allowed": on the team, it
 *  is for those who may send documents; the eleventh product review). */
export type ShownPdfFailure = "not_pdf" | "unavailable" | "not_allowed";

export function useShownPdf({
  documentId,
  uploadedFileUrl,
  signedByApplicant,
  enabled = true,
}: {
  documentId: string | null | undefined;
  /** The address in the document's own body, which the sender wrote. */
  uploadedFileUrl: string | null | undefined;
  signedByApplicant: boolean;
  enabled?: boolean;
}): { shownPdf: ShownPdf | null; shownPdfFailed: ShownPdfFailure | null } {
  const [shownPdf, setShownPdf] = useState<ShownPdf | null>(null);
  const [shownPdfFailed, setShownPdfFailed] = useState<"not_pdf" | "unavailable" | "not_allowed" | null>(null);

  useEffect(() => {
    // Only an http(s) address may be fetched and shown (a javascript: frame
    // would run inside this page). src/lib/safeLink.ts.
    const sent = enabled ? externalHref(uploadedFileUrl) : null;
    setShownPdf(null);
    setShownPdfFailed(null);
    if (!sent) return;
    let cancelled = false;
    let blobUrl: string | null = null;
    (async () => {
      try {
        // After the applicant signs, the copy the server kept, which is what
        // was signed; the sender's own folder could hold another file by then
        // (the fourth security review). Before, only this project's own
        // documents file (ownDocumentsPath), as the signing function reads.
        let address = sent;
        if (!signedByApplicant && !ownDocumentsPath(sent, SUPABASE_URL)) throw new Error("not this project's file");
        if (signedByApplicant && documentId) {
          const { data, error } = await supabase.functions.invoke("document-signing", { body: { documentId, action: "original" } });
          // Not theirs to open (a teammate without "Send documents"): said
          // as that, not as a failed load (the eleventh product review).
          if (await refusedForRole(data, error)) {
            if (!cancelled) setShownPdfFailed("not_allowed");
            return;
          }
          const kept = externalHref((data as { url?: string } | null)?.url);
          if (!kept) throw new Error("no signed copy");
          address = kept;
        }
        const response = await fetch(address);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        // A PDF only: a Word or text file cannot be shown or signed here.
        const head = new Uint8Array(bytes.slice(0, 5));
        if (String.fromCharCode(...head) !== "%PDF-") {
          if (!cancelled) setShownPdfFailed("not_pdf");
          return;
        }
        const hash = await generatePdfHash(bytes);
        if (cancelled) return;
        blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        setShownPdf({ src: blobUrl, hash });
      } catch {
        // Refused or unreachable (the kept copy, the network): not the file's fault.
        if (!cancelled) setShownPdfFailed("unavailable");
      }
    })();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [enabled, uploadedFileUrl, documentId, signedByApplicant]);

  return { shownPdf, shownPdfFailed };
}

/** What to say while it loads or when it cannot be shown, to whoever is
 *  looking (the fifth product review: the team was told to ask the hiring
 *  team), and "not a PDF" only for a file that is not one (the tenth product
 *  review: a PDF the team voided was blamed on its file). */
export function shownPdfProblem(shownPdfFailed: ShownPdfFailure | null, role: string | null | undefined, isTeamMember: boolean): string {
  return shownPdfFailed === "not_pdf"
    ? role === "candidate"
      ? "This file is not a PDF, so it can't be shown or signed here. Ask the hiring team to send it again as a PDF."
      : "This file is not a PDF, so it can't be shown or signed here. Send it again as a PDF."
    : shownPdfFailed === "unavailable"
      ? "This document could not be loaded just now. Close it and open it again."
      : shownPdfFailed === "not_allowed"
        ? `On your team, only someone who may send documents can open the signed file.${isTeamMember ? ` Ask the owner to turn on ${TEAM_PERMISSION_NAMES.canSendDocuments} for you.` : ""}`
        : "Loading document...";
}
