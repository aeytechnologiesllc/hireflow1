import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Clock, Download, FileText, Loader2, PenLine, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { invokeDocumentSigning } from "@/lib/documentSigningErrors";
import { collectSignerContext } from "@/lib/signerContext";
import { generateV1Hash } from "@/lib/documentHash";
import { applicantDocumentState } from "@/lib/applicantDocumentTurn";
import { shownPdfProblem, useShownPdf } from "@/lib/shownPdf";
import type { DocumentWithApplication } from "@/hooks/useDocuments";
import { goToSignPlace, PaperDesk, PaperLetter, PaperPdf, SignatureLineInput, type PaperField, type PaperSpot } from "./PaperDesk";

/**
 * What an applicant sees when they open a document to sign (an offer
 * letter, most often): the letter, then one clear thing to do.
 *
 * The owner, 2026-10-11, testing it as an applicant: "the UX is ridiculously
 * bad ... I don't know why it says signed PDF at the bottom, audit PDF. Why
 * does it say that? They haven't even signed it. It should be a clear
 * indication." So, by state, and nothing else:
 *   - waiting for you: what it is, the date to sign by, the letter, "Sign and
 *     accept" at the bottom (type or draw your name), and a quiet way to say no;
 *   - you signed: a celebration, and who signs next;
 *   - signed by both: the signatures and "Download signed copy";
 *   - declined, withdrawn or expired: said plainly.
 * No PDFs, certificates or audit trails before there is anything to download;
 * the full signing record (SignedDocumentViewer) is one tap away once it
 * exists. The signing itself is unchanged: the document-signing function, the
 * same consent words, the same record.
 *
 * The owner, 2026-11-05: free floating, "scroll, you sign". The letter, or
 * an uploaded PDF page by page, lies on the desk (PaperDesk.tsx) with the
 * signatures on the paper where they go, and the place to sign is under it.
 * A PDF is signed with the hash of the very bytes it is drawn from
 * (src/lib/shownPdf.ts), as the old file viewer signed.
 */

// The desk's buttons and their row (PaperDesk.tsx).
const PILL = "ck-btn ck-btn-primary !rounded-full !px-5 !py-2.5 !text-[14px]";
const ROW = "mx-auto mt-8 flex max-w-[816px] flex-wrap items-center justify-center gap-4";

/** The same words as the audit record (src/lib/auditTrail.ts, electronic_consent_confirmed). */
const CONSENT_STATEMENT =
  "I acknowledge that I am signing this document electronically and that my electronic signature has the same legal effect as a handwritten signature.";

type Body = { content?: string; uploadedFileUrl?: string; signatureFields?: PaperField[]; metadata?: { companyName?: string; jobTitle?: string } };

/** The stored body (base64 JSON, or base64 plain text). */
export function readDocumentBody(fileUrl: string | null | undefined): Body | null {
  if (!fileUrl) return null;
  try {
    if (fileUrl.startsWith("data:application/json;base64,")) return JSON.parse(atob(fileUrl.split(",")[1])) as Body;
    if (fileUrl.startsWith("data:text/plain;base64,")) return { content: atob(fileUrl.split(",")[1]) };
  } catch {
    return null;
  }
  return null;
}

/** True when the document is a written letter, not an uploaded PDF. */
export function isWrittenDocument(fileUrl: string | null | undefined): boolean {
  const body = readDocumentBody(fileUrl);
  return !!body && !body.uploadedFileUrl && typeof body.content === "string" && body.content.trim().length > 0;
}

/** True when the document is a file the business uploaded (a PDF to sign). */
export function isUploadedDocument(fileUrl: string | null | undefined): boolean {
  const body = readDocumentBody(fileUrl);
  return !!body?.uploadedFileUrl && !body.content;
}

/** The signing screens show both (the owner, 2026-11-05: a PDF opened the old boxed viewer). */
export function opensInSigningScreen(fileUrl: string | null | undefined): boolean {
  return isWrittenDocument(fileUrl) || isUploadedDocument(fileUrl);
}

// Whose turn it is: one rule with My Documents and the sidebar's badge.
export { applicantDocumentState, type ApplicantDocumentState } from "@/lib/applicantDocumentTurn";


function signatureOf(raw: string | null | undefined, side: "recipient" | "employer"): { value: string; name: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { signatures?: Record<string, string>; signerName?: string };
    const s = parsed.signatures ?? {};
    const value = side === "recipient" ? s.recipient || s.candidate_signature || s.positioned_signature : s.employer || s.employer_signature || s.positioned_signature;
    return value ? { value, name: parsed.signerName || "" } : null;
  } catch {
    return null;
  }
}

export function ApplicantDocumentSheet({
  document,
  open,
  onOpenChange,
  onShowRecord,
}: {
  document: DocumentWithApplication | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the full signing record (certificate, audit trail). */
  onShowRecord: (document: DocumentWithApplication) => void;
}) {
  const queryClient = useQueryClient();
  const { role, isTeamMember } = useAuth();
  // The letter as it was when this sheet opened: the screen never changes it
  // under a half-typed signature. If the stored one ever differs (the database
  // refuses a change to a sent letter since 20261025470000), it says so and
  // signing waits until they read the new one (the fourth security review).
  const [shownFileUrl, setShownFileUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setShownFileUrl(document?.file_url ?? null);
    // Only when another document opens: a refetch of this one must not replace what is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document?.id]);
  const shownLetter = shownFileUrl === undefined ? document?.file_url : shownFileUrl;
  const body = useMemo(() => readDocumentBody(shownLetter), [shownLetter]);
  const letterChanged = shownFileUrl !== undefined && (document?.file_url ?? null) !== shownFileUrl;
  const [typed, setTyped] = useState("");
  const [drawn, setDrawn] = useState<string | null>(null);
  const [how, setHow] = useState<"typed" | "drawn">("typed");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [justSigned, setJustSigned] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // An uploaded PDF, drawn from the bytes fetched for this screen and signed with their hash.
  const isPdf = !!body?.uploadedFileUrl && !body?.content;
  const { shownPdf, shownPdfFailed } = useShownPdf({
    documentId: document?.id,
    uploadedFileUrl: isPdf ? body?.uploadedFileUrl : null,
    signedByApplicant: !!document?.candidate_signed_at,
    enabled: open,
  });

  // Fresh each time it opens (not when the same document refreshes after
  // signing, which would hide the celebration); their name to start the
  // typed signature.
  const documentId = document?.id ?? null;
  useEffect(() => {
    if (!open || !documentId) return;
    setDrawn(null);
    setHow("typed");
    setConsent(false);
    setBusy(false);
    setError(null);
    setDeclining(false);
    setReason("");
    setJustSigned(false);
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
      if (!cancelled) setTyped((data?.full_name ?? "").trim());
    })();
    // The "they opened it" mark (idempotent on the server); never blocks reading.
    supabase.functions.invoke("document-signing", { body: { documentId, action: "view" } }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, documentId]);

  if (!document) return null;

  const state = justSigned ? "theirs" : applicantDocumentState(document);
  const isOffer = document.document_type === "offer_letter";
  const company = body?.metadata?.companyName?.trim() || "the hiring team";
  const Company = company === "the hiring team" ? "The hiring team" : company;
  const title = isOffer ? "Your job offer" : document.name;
  const signBy = document.expires_at ? format(new Date(document.expires_at), "EEEE, MMMM d") : null;
  const mine = signatureOf(document.candidate_signature_data, "recipient");
  const theirs = signatureOf(document.employer_signature_data, "employer");
  const signature = how === "typed" ? typed.trim() : drawn;
  const canSign = consent && !!signature && (how === "drawn" || typed.trim().length >= 2) && !busy && !letterChanged && (!isPdf || !!shownPdf);
  const signing = state === "yours" && !declining;
  const close = () => !busy && onOpenChange(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["documents"] });
  };

  const sign = async () => {
    if (!canSign || !signature) return;
    setBusy(true);
    setError(null);
    try {
      // The device and the place it is signed from (the team sees it; the applicant never sees the team's).
      const signerContext = await collectSignerContext();
      // The hash of what this screen shows, the letter's text or the PDF's
      // bytes: the server signs only that (supabase/functions/_shared/documentShown.ts).
      const viewedHash = isPdf ? shownPdf?.hash ?? null : await generateV1Hash(body?.content ?? "");
      if (!viewedHash) throw new Error("The document is not open yet. Please wait a moment and try again.");
      await invokeDocumentSigning(supabase, { documentId: document.id, action: "sign", signature: { method: how, value: signature, consentAccepted: true }, signerContext, viewedHash });
      setJustSigned(true);
      refresh();
    } catch (e) {
      setError((e as Error).message || "It did not go through. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    const why = reason.trim();
    if (why.length < 3 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await invokeDocumentSigning(supabase, { documentId: document.id, action: "decline", declineReason: why.slice(0, 500) });
      refresh();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message || "It did not go through. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      const { data, error: dlError } = await supabase.functions.invoke("document-signing", { body: { documentId: document.id, action: "download" } });
      const url = (data as { url?: string } | null)?.url;
      if (dlError || !url) throw new Error("no url");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // The full record can always make the copy.
      onShowRecord(document);
    } finally {
      setDownloading(false);
    }
  };

  const chip =
    state === "yours"
      ? { text: "Waiting for your signature", bg: "var(--amber-bg)", fg: "var(--amber-fg)", Icon: PenLine }
      : state === "theirs"
        ? { text: `You signed · ${company} signs next`, bg: "var(--action-soft)", fg: "var(--action-soft-fg)", Icon: Clock }
        : state === "done"
          ? { text: "Signed by both", bg: "var(--action-soft)", fg: "var(--action-soft-fg)", Icon: CheckCircle2 }
          : state === "declined"
            ? { text: "You declined", bg: "var(--surface-2)", fg: "var(--ink-2)", Icon: XCircle }
            : state === "withdrawn"
              ? { text: "Withdrawn", bg: "var(--surface-2)", fg: "var(--ink-2)", Icon: XCircle }
              : { text: "Expired", bg: "var(--surface-2)", fg: "var(--ink-2)", Icon: Clock };

  // The two places to sign, on the paper.
  const stillOpen = state === "yours" || state === "theirs";
  const mySpot: PaperSpot = mine
    ? { mark: { value: mine.value, at: document.candidate_signed_at } }
    : signing
      ? { mark: null, mine: true, preview: signature || null }
      : { mark: null };
  const theirSpot: PaperSpot = theirs
    ? { mark: { value: theirs.value, at: document.employer_signed_at } }
    : { mark: null, waitingLabel: stillOpen ? `${Company} signs here` : undefined };
  const goSign = () => goToSignPlace("ck-appdoc-sign");
  const note = "mx-auto mb-5 max-w-[816px] text-[14px] leading-snug";

  return (
    <PaperDesk
      open={open}
      busy={busy}
      onClose={close}
      titleId="ck-appdoc-title"
      eyebrow={company === "the hiring team" ? "From the hiring team" : `From ${company}`}
      title={title}
      status={
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: chip.bg, color: chip.fg }} data-applicant-document-chip>
            <chip.Icon className="h-3.5 w-3.5" aria-hidden />
            {chip.text}
          </span>
          {state === "yours" && signBy && (
            <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              Please sign by {signBy}
            </span>
          )}
        </>
      }
      signPlaceId={signing && !justSigned ? "ck-appdoc-sign" : null}
      signLabel={isOffer ? "Sign to accept" : "Sign"}
      data={{ "data-applicant-document": state }}
    >
      {state === "theirs" && justSigned ? (
        // The moment they accept: a celebration, then what happens next.
        <div className="ck-rise mx-auto max-w-md py-16 text-center" data-applicant-document-celebration>
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full" style={{ background: "var(--action-soft)" }}>
            <CheckCircle2 className="h-9 w-9" style={{ color: "var(--action)" }} aria-hidden />
          </div>
          <h3 className="mt-4 font-display text-[28px] font-semibold" style={{ color: "var(--hf-text)" }}>
            {isOffer ? "You accepted the offer!" : "Signed!"}
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-[14px]" style={{ color: "var(--ink-2)" }}>
            {Company} signs next. You'll get the final copy here, and an email when it's ready.
          </p>
          {isOffer && (
            <p className="mx-auto mt-3 max-w-sm text-[14px]" style={{ color: "var(--ink-2)" }}>
              They may also ask for your ID and the email you're paid on. If they do, it shows in Your documents.
            </p>
          )}
          <button type="button" className="ck-btn ck-btn-primary mt-6 !rounded-full !px-6 !py-2.5 !text-[14px]" onClick={() => onOpenChange(false)}>
            Done
          </button>
        </div>
      ) : (
        <>
          {state === "yours" && (
            <p className={note} style={{ color: "var(--ink-2)" }}>
              {isOffer ? "Read your offer, then sign at the bottom to accept it. It takes a minute." : "Read it, then sign at the bottom."}
            </p>
          )}
          {state === "declined" && <p className={note} style={{ color: "var(--ink-2)" }}>You declined this. {Company} was told.</p>}
          {state === "withdrawn" && <p className={note} style={{ color: "var(--ink-2)" }}>{Company} withdrew this. There's nothing to sign.</p>}
          {state === "expired" && <p className={note} style={{ color: "var(--ink-2)" }}>The date to sign has passed. If you still want it, message {company}.</p>}
          {state === "theirs" && <p className={note} style={{ color: "var(--ink-2)" }}>{Company} signs next. You'll get the final copy here, and an email when it's ready.</p>}

          {letterChanged && (
            <p className={note} style={{ color: "var(--crit)" }} role="alert" data-applicant-document-changed>
              This letter was changed while you were reading it.{" "}
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => {
                  setShownFileUrl(document.file_url ?? null);
                  setConsent(false);
                }}
              >
                Show the new version
              </button>
            </p>
          )}

          {/* The paper itself, with the signatures where they go. */}
          {isPdf ? (
            shownPdf ? (
              <PaperPdf src={shownPdf.src} fields={body?.signatureFields} spots={{ candidate: mySpot, employer: theirSpot }} labels={{ candidate: "You", employer: Company }} onSignHere={goSign} />
            ) : (
              <p className="py-20 text-center text-[14px]" style={{ color: "var(--ink-2)" }} data-applicant-document-file-problem>
                {shownPdfProblem(shownPdfFailed, role, isTeamMember)}
              </p>
            )
          ) : body?.content ? (
            <PaperLetter text={body.content} candidate={{ who: "You", spot: mySpot }} employer={{ who: Company, spot: theirSpot }} onSignHere={goSign} />
          ) : (
            <p className="py-20 text-center text-[14px]" style={{ color: "var(--ink-3)" }}>
              This document can't be shown here.
            </p>
          )}

          {/* The one thing to do */}
          {state === "yours" && !declining && (
            <section id="ck-appdoc-sign" className="mx-auto mt-12 w-full max-w-[520px] scroll-mt-24" aria-labelledby="sign-title" data-applicant-document-sign>
              <h3 id="sign-title" className="text-center font-display text-[26px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
                {isOffer ? "Sign to accept" : "Sign"}
              </h3>
              <p className="mt-1 text-center text-[13.5px]" style={{ color: "var(--ink-3)" }}>
                Your signature goes on the {isOffer ? "letter" : "document"}, where it says Sign here.
              </p>
              <SignatureLineInput id="sign-name" how={how} onHow={setHow} typed={typed} onTyped={setTyped} onDrawn={setDrawn} />
              <label className="mt-6 flex cursor-pointer items-start gap-3 text-[13.5px] leading-snug" style={{ color: "var(--ink-2)" }}>
                <input id="sign-consent" type="checkbox" className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--action)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>{CONSENT_STATEMENT}</span>
              </label>
              {error && (
                <p className="mt-4 text-center text-[13.5px]" style={{ color: "var(--crit)" }}>
                  {error}
                </p>
              )}
              <button type="button" className="ck-btn ck-btn-primary mt-6 w-full !rounded-full !py-3.5 !text-[15px]" onClick={() => void sign()} disabled={!canSign} data-applicant-document-sign-button>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                {busy ? "Signing..." : isOffer ? "Sign and accept the offer" : "Sign"}
              </button>
              <button type="button" className="mt-4 w-full text-center text-[13.5px] underline underline-offset-2" style={{ color: "var(--ink-3)" }} onClick={() => setDeclining(true)}>
                {isOffer ? "I don't want to accept" : "I don't want to sign"}
              </button>
            </section>
          )}

          {state === "yours" && declining && (
            <section className="mx-auto mt-12 w-full max-w-[520px]" data-applicant-document-decline>
              <h3 className="text-center font-display text-[24px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
                {isOffer ? "Decline the offer?" : "Decline?"}
              </h3>
              <label htmlFor="decline-reason" className="mt-4 block text-[13.5px]" style={{ color: "var(--ink-2)" }}>
                A short reason for {company}
              </label>
              <textarea
                id="decline-reason"
                className="ck-input mt-1.5 min-h-[84px] w-full px-3 py-2 text-base sm:text-sm"
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="I accepted another job."
              />
              {error && (
                <p className="mt-2 text-[13.5px]" style={{ color: "var(--crit)" }}>
                  {error}
                </p>
              )}
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" className="ck-btn ck-btn-ghost !rounded-full !px-5" onClick={() => setDeclining(false)} disabled={busy}>
                  Back
                </button>
                <button type="button" className="ck-btn !rounded-full !px-5" style={{ background: "var(--crit)", color: "#fff" }} onClick={() => void decline()} disabled={busy || reason.trim().length < 3}>
                  {busy ? "Sending..." : isOffer ? "Decline the offer" : "Decline"}
                </button>
              </div>
            </section>
          )}

          {state === "done" && (
            <div className={ROW} data-applicant-document-done>
              <button type="button" className={PILL} onClick={() => void download()} disabled={downloading}>
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download signed copy
              </button>
              <button type="button" className="inline-flex items-center gap-1.5 text-[13.5px] underline underline-offset-2" style={{ color: "var(--ink-2)" }} onClick={() => onShowRecord(document)}>
                <FileText className="h-4 w-4" aria-hidden />
                Signing record
              </button>
            </div>
          )}
        </>
      )}
    </PaperDesk>
  );
}

export default ApplicantDocumentSheet;
