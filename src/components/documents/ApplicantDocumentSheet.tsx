import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Clock, Download, FileText, Loader2, PenLine, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { invokeDocumentSigning } from "@/lib/documentSigningErrors";
import { collectSignerContext } from "@/lib/signerContext";
import type { DocumentWithApplication } from "@/hooks/useDocuments";
import { LetterText } from "./LetterText";
import { SignaturePad } from "./SignaturePad";

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
 */

/** The same words as the audit record (src/lib/auditTrail.ts, electronic_consent_confirmed). */
const CONSENT_STATEMENT =
  "I acknowledge that I am signing this document electronically and that my electronic signature has the same legal effect as a handwritten signature.";

type Body = { content?: string; uploadedFileUrl?: string; metadata?: { companyName?: string; jobTitle?: string } };

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

/** True when this screen can show the document (a written letter, not an uploaded PDF). */
export function isWrittenDocument(fileUrl: string | null | undefined): boolean {
  const body = readDocumentBody(fileUrl);
  return !!body && !body.uploadedFileUrl && typeof body.content === "string" && body.content.trim().length > 0;
}

export type ApplicantDocumentState = "yours" | "theirs" | "done" | "declined" | "withdrawn" | "expired";

export function applicantDocumentState(doc: Pick<DocumentWithApplication, "status" | "candidate_signed_at" | "is_voided" | "expires_at">, now = new Date()): ApplicantDocumentState {
  if (doc.is_voided) return "withdrawn";
  if (doc.status === "declined") return "declined";
  if (doc.status === "signed") return "done";
  if (doc.candidate_signed_at) return "theirs";
  if (doc.expires_at && new Date(doc.expires_at).getTime() < now.getTime()) return "expired";
  return "yours";
}

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

function SignatureLine({ who, at, sig }: { who: string; at: string | null | undefined; sig: { value: string; name: string } | null }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background/60 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{who}</div>
      {sig ? (
        sig.value.startsWith("data:image") ? (
          <img src={sig.value} alt={`${who} signature`} className="mt-1 h-12 max-w-full object-contain dark:invert" />
        ) : (
          <div className="mt-1 truncate font-signature text-[32px] leading-tight text-foreground">{sig.value}</div>
        )
      ) : (
        <div className="mt-1 text-sm text-muted-foreground">Not signed yet</div>
      )}
      {at && <div className="mt-0.5 text-xs text-muted-foreground">{format(new Date(at), "MMM d, yyyy 'at' h:mm a")}</div>}
    </div>
  );
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
  const body = useMemo(() => readDocumentBody(document?.file_url), [document?.file_url]);
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
  const title = isOffer ? "Your job offer" : document.name;
  const signBy = document.expires_at ? format(new Date(document.expires_at), "EEEE, MMMM d") : null;
  const mine = signatureOf(document.candidate_signature_data, "recipient");
  const theirs = signatureOf(document.employer_signature_data, "employer");
  const signature = how === "typed" ? typed.trim() : drawn;
  const canSign = consent && !!signature && (how === "drawn" || typed.trim().length >= 2) && !busy;

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
      await invokeDocumentSigning(supabase, { documentId: document.id, action: "sign", signature: { method: how, value: signature, consentAccepted: true }, signerContext });
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
      ? { text: "Waiting for your signature", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300", Icon: PenLine }
      : state === "theirs"
        ? { text: `You signed · ${company} signs next`, cls: "bg-primary/15 text-primary", Icon: Clock }
        : state === "done"
          ? { text: "Signed by both", cls: "bg-primary/15 text-primary", Icon: CheckCircle2 }
          : state === "declined"
            ? { text: "You declined", cls: "bg-muted text-muted-foreground", Icon: XCircle }
            : state === "withdrawn"
              ? { text: "Withdrawn", cls: "bg-muted text-muted-foreground", Icon: XCircle }
              : { text: "Expired", cls: "bg-muted text-muted-foreground", Icon: Clock };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-2xl flex-col gap-0 overflow-hidden p-0" data-applicant-document={state}>
        {/* Head: who it is from, what it is, where it stands */}
        <div className="border-b border-border px-5 pb-4 pt-5 sm:px-6">
          <div className="text-xs font-medium text-muted-foreground">{company === "the hiring team" ? "From the hiring team" : `From ${company}`}</div>
          <DialogTitle className="mt-0.5 font-display text-[24px] font-semibold leading-tight text-foreground">{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${chip.cls}`} data-applicant-document-chip>
                <chip.Icon className="h-3.5 w-3.5" aria-hidden />
                {chip.text}
              </span>
              {state === "yours" && signBy && <span className="text-xs text-muted-foreground">Please sign by {signBy}</span>}
            </div>
          </DialogDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {state === "theirs" && justSigned ? (
            // The moment they accept: a celebration, then what happens next.
            <div className="py-6 text-center" data-applicant-document-celebration>
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/15">
                <CheckCircle2 className="h-9 w-9 text-primary" aria-hidden />
              </div>
              <h3 className="mt-4 font-display text-[26px] font-semibold text-foreground">{isOffer ? "You accepted the offer!" : "Signed!"}</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                {company === "the hiring team" ? "The hiring team" : company} signs next. You'll get the final copy here, and an email when it's ready.
              </p>
              {isOffer && (
                <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
                  They may also ask for your ID and the email you're paid on. If they do, it shows in Your documents.
                </p>
              )}
              <Button className="mt-6" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          ) : (
            <>
              {state === "yours" && (
                <p className="mb-4 text-sm text-muted-foreground">
                  {isOffer ? "Read your offer, then sign at the bottom to accept it. It takes a minute." : "Read it, then sign at the bottom."}
                </p>
              )}
              {state === "declined" && <p className="mb-4 text-sm text-muted-foreground">You declined this. {company === "the hiring team" ? "The hiring team" : company} was told.</p>}
              {state === "withdrawn" && <p className="mb-4 text-sm text-muted-foreground">{company === "the hiring team" ? "The hiring team" : company} withdrew this. There's nothing to sign.</p>}
              {state === "expired" && <p className="mb-4 text-sm text-muted-foreground">The date to sign has passed. If you still want it, message {company === "the hiring team" ? "the hiring team" : company}.</p>}

              {/* The letter itself */}
              <article className="rounded-xl border border-border bg-card px-5 py-5 text-[14.5px] leading-[1.65] text-foreground shadow-sm" data-applicant-document-letter>
                {body?.content ? <LetterText text={body.content} /> : <p className="text-muted-foreground">This document can't be shown here.</p>}
              </article>

              {/* Signatures, once anyone has signed */}
              {(state === "theirs" || state === "done") && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2" data-applicant-document-signatures>
                  <SignatureLine who="You" at={document.candidate_signed_at} sig={mine} />
                  <SignatureLine who={company === "the hiring team" ? "The hiring team" : company} at={document.employer_signed_at} sig={theirs} />
                </div>
              )}

              {/* The one thing to do */}
              {state === "yours" && !declining && (
                <section className="mt-5 rounded-xl border border-primary/40 bg-primary/5 px-4 py-4 sm:px-5" aria-labelledby="sign-title" data-applicant-document-sign>
                  <h3 id="sign-title" className="text-base font-semibold text-foreground">
                    {isOffer ? "Sign to accept" : "Sign"}
                  </h3>
                  {how === "typed" ? (
                    <>
                      <label htmlFor="sign-name" className="mt-3 block text-sm text-muted-foreground">
                        Type your full name
                      </label>
                      <input
                        id="sign-name"
                        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5 font-signature text-[30px] leading-snug text-foreground outline-none focus:ring-2 focus:ring-primary/40"
                        value={typed}
                        maxLength={120}
                        onChange={(e) => setTyped(e.target.value)}
                        autoComplete="name"
                      />
                      <button type="button" className="mt-1.5 text-xs font-medium text-muted-foreground underline underline-offset-2" onClick={() => setHow("drawn")}>
                        Draw it instead
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="mt-3 text-sm text-muted-foreground">Draw your signature</div>
                      <div className="mt-1">
                        <SignaturePad onChange={setDrawn} />
                      </div>
                      <button type="button" className="mt-1.5 text-xs font-medium text-muted-foreground underline underline-offset-2" onClick={() => setHow("typed")}>
                        Type it instead
                      </button>
                    </>
                  )}
                  <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug text-muted-foreground">
                    <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" id="sign-consent" />
                    <span>{CONSENT_STATEMENT}</span>
                  </label>
                  {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
                  <Button className="mt-4 h-11 w-full text-[15px]" onClick={() => void sign()} disabled={!canSign} data-applicant-document-sign-button>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
                    {busy ? "Signing..." : isOffer ? "Sign and accept the offer" : "Sign"}
                  </Button>
                  <button type="button" className="mt-3 w-full text-center text-[13px] text-muted-foreground underline underline-offset-2" onClick={() => setDeclining(true)}>
                    {isOffer ? "I don't want to accept" : "I don't want to sign"}
                  </button>
                </section>
              )}

              {state === "yours" && declining && (
                <section className="mt-5 rounded-xl border border-border bg-muted/40 px-4 py-4 sm:px-5" data-applicant-document-decline>
                  <h3 className="text-base font-semibold text-foreground">{isOffer ? "Decline the offer?" : "Decline?"}</h3>
                  <label htmlFor="decline-reason" className="mt-2 block text-sm text-muted-foreground">
                    A short reason for {company === "the hiring team" ? "the hiring team" : company}
                  </label>
                  <textarea
                    id="decline-reason"
                    className="mt-1 min-h-[72px] w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground sm:text-sm"
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="I accepted another job."
                  />
                  {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" onClick={() => setDeclining(false)} disabled={busy}>
                      Back
                    </Button>
                    <Button variant="destructive" onClick={() => void decline()} disabled={busy || reason.trim().length < 3}>
                      {busy ? "Sending..." : isOffer ? "Decline the offer" : "Decline"}
                    </Button>
                  </div>
                </section>
              )}

              {state === "theirs" && (
                <p className="mt-4 text-sm text-muted-foreground">
                  {company === "the hiring team" ? "The hiring team" : company} signs next. You'll get the final copy here, and an email when it's ready.
                </p>
              )}

              {state === "done" && (
                <div className="mt-5 flex flex-wrap items-center gap-3" data-applicant-document-done>
                  <Button onClick={() => void download()} disabled={downloading}>
                    {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download signed copy
                  </Button>
                  <button type="button" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-2" onClick={() => onShowRecord(document)}>
                    <FileText className="h-4 w-4" aria-hidden />
                    Signing record
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ApplicantDocumentSheet;
