import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Clock, Download, FileText, Loader2, PenLine, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { invokeDocumentSigning } from "@/lib/documentSigningErrors";
import { collectSignerContext } from "@/lib/signerContext";
import { shownPdfProblem, useShownPdf } from "@/lib/shownPdf";
import type { DocumentWithApplication } from "@/hooks/useDocuments";
import { readDocumentBody } from "@/components/documents/ApplicantDocumentSheet";
import { goToSignPlace, PaperDesk, PaperLetter, PaperPdf, SignatureLineInput, type PaperSpot } from "@/components/documents/PaperDesk";

/**
 * The hiring team's own view of a document it sent (an offer letter, most
 * often), on staff.hireflownow.com → Documents.
 *
 * The owner, 2026-10-11, on the old viewer: "it's still showing signed PDF
 * when it hasn't even been signed. Why does it say audit PDF? ... there's no
 * way for me to sign this. There's no button." The applicant signs first, so
 * there was nothing for him to sign yet, and nothing said so. By state:
 *   - waiting for them: what is sent, by when they must sign, "nothing to do
 *     yet", and a quiet Withdraw;
 *   - your turn: their signature with when, where and on what device (the
 *     team sees the applicant's record; the applicant never sees the
 *     team's), then "Sign and finish";
 *   - signed by both: both signatures, "Download signed copy", and the full
 *     signing record one tap away;
 *   - declined, withdrawn, voided or expired: said plainly, with the reason,
 *     and the signing record one tap away (the tenth product review).
 * The signing is the document-signing function's, unchanged.
 *
 * The owner, 2026-11-05: free floating, "scroll, you sign". The letter, or
 * an uploaded PDF page by page, lies on the desk (PaperDesk.tsx) with the
 * signatures on the paper where they go; the place to sign is under it, with
 * nothing around it. A PDF is drawn from the bytes the screen fetched
 * (src/lib/shownPdf.ts), as the signing record's viewer did.
 */

// The desk's buttons and their row (PaperDesk.tsx).
const PILL = "ck-btn ck-btn-primary !rounded-full !px-5 !py-2.5 !text-[14px]";
const ROW = "mx-auto mt-8 flex max-w-[816px] flex-wrap items-center justify-center gap-4";

const CONSENT_STATEMENT =
  "I acknowledge that I am signing this document electronically and that my electronic signature has the same legal effect as a handwritten signature.";

export type TeamDocumentState = "waiting" | "yours" | "done" | "declined" | "withdrawn" | "voided" | "expired";

export function teamDocumentState(
  doc: Pick<DocumentWithApplication, "status" | "candidate_signed_at" | "employer_signed_at" | "is_voided" | "expires_at">,
  now = new Date(),
): TeamDocumentState {
  if (doc.is_voided) return doc.candidate_signed_at ? "voided" : "withdrawn";
  if (doc.status === "declined") return "declined";
  if (doc.status === "signed") return "done";
  if (doc.candidate_signed_at && !doc.employer_signed_at) return "yours";
  if (doc.expires_at && new Date(doc.expires_at).getTime() < now.getTime()) return "expired";
  return "waiting";
}

function signatureOf(raw: string | null | undefined, side: "recipient" | "employer"): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { signatures?: Record<string, string> };
    const s = parsed.signatures ?? {};
    return (side === "recipient" ? s.recipient || s.candidate_signature || s.positioned_signature : s.employer || s.employer_signature || s.positioned_signature) || null;
  } catch {
    return null;
  }
}

interface SignRecord {
  action: string;
  created_at: string;
  ip_address: string | null;
  location_city: string | null;
  location_region: string | null;
  location_country: string | null;
  details: { device?: { deviceType?: string; platform?: string; timeZone?: string } } | null;
}

/** "from Manila, PH · on a phone (iOS) · IP 49.145.1.1" for the applicant's signature. */
function whereLine(row: SignRecord | undefined): string | null {
  if (!row) return null;
  const place = [row.location_city, row.location_country].filter((p) => p && p !== "Unknown").join(", ");
  const device = row.details?.device;
  const on = device?.deviceType ? `on a ${device.deviceType}${device.platform ? ` (${device.platform})` : ""}` : null;
  const parts = [place ? `from ${place}` : null, on, row.ip_address && row.ip_address !== "unknown" ? `IP ${row.ip_address}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** The name under "Sincerely," in a letter, or null. */
export function signerInLetter(content: string | null | undefined): string | null {
  if (!content) return null;
  const lines = content.split("\n").map((l) => l.trim());
  const at = lines.findIndex((l) => /^(sincerely|regards|best regards|kind regards),?$/i.test(l));
  if (at < 0) return null;
  const name = lines.slice(at + 1).find((l) => l.length > 0);
  return name && name.length <= 120 ? name : null;
}


export function TeamDocumentSheet({
  document,
  open,
  canSend,
  isOwner = false,
  newerLetterSentAt = null,
  onClose,
  onWithdraw,
  onShowRecord,
}: {
  document: DocumentWithApplication | null;
  open: boolean;
  /** The owner, or a teammate with "Send documents": the only ones told to send a new letter. */
  canSend: boolean;
  /** The account owner (the one document-signing notifies when the applicant signs). */
  isOwner?: boolean;
  /** When a later letter to the same person went out (laterLetter), if one did. */
  newerLetterSentAt?: string | null;
  onClose: () => void;
  /** Opens the page's own Withdraw box for this document. */
  onWithdraw: (document: DocumentWithApplication) => void;
  /** Opens the full signing record (certificate, audit trail). */
  onShowRecord: (document: DocumentWithApplication) => void;
}) {
  const queryClient = useQueryClient();
  const { user, role, isTeamMember } = useAuth();
  const body = useMemo(() => readDocumentBody(document?.file_url), [document?.file_url]);
  const documentId = document?.id ?? null;
  const [typed, setTyped] = useState("");
  const [drawn, setDrawn] = useState<string | null>(null);
  const [how, setHow] = useState<"typed" | "drawn">("typed");
  const [consent, setConsent] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justFinished, setJustFinished] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // An uploaded PDF, shown from the bytes fetched for this screen.
  const isPdf = !!body?.uploadedFileUrl && !body?.content;
  const { shownPdf, shownPdfFailed } = useShownPdf({
    documentId,
    uploadedFileUrl: isPdf ? body?.uploadedFileUrl : null,
    signedByApplicant: !!document?.candidate_signed_at,
    enabled: open,
  });

  // The applicant's signing record (when, where, on what device): the team's to see.
  const { data: record = [] } = useQuery({
    queryKey: ["document-audit-log", documentId, document?.candidate_signed_at ?? null],
    enabled: open && !!documentId && !!document?.candidate_signed_at,
    staleTime: 30_000,
    queryFn: async (): Promise<SignRecord[]> => {
      const { data, error: rpcError } = await supabase.rpc("document_audit_log" as never, { p_document_id: documentId } as never);
      if (rpcError) return [];
      return (data as unknown as SignRecord[]) ?? [];
    },
  });

  // Fresh each time a document opens. Only on open or a different document:
  // the page refreshes the document after signing, and resetting then would
  // hide the "signed by both" moment.
  const userId = user?.id ?? null;
  const fileUrl = document?.file_url ?? null;
  useEffect(() => {
    if (!open || !documentId) return;
    setDrawn(null);
    setHow("typed");
    setConsent(false);
    setReviewed(false);
    setBusy(false);
    setError(null);
    setJustFinished(false);
    let cancelled = false;
    // The name the letter is signed with ("Sincerely,\nShahzaib Rehman"),
    // else their profile's.
    const signedAs = signerInLetter(readDocumentBody(fileUrl)?.content);
    if (signedAs) setTyped(signedAs);
    (async () => {
      if (signedAs || !userId) return;
      const { data } = await supabase.from("profiles").select("full_name").eq("user_id", userId).maybeSingle();
      if (!cancelled) setTyped((data?.full_name ?? "").trim());
    })();
    return () => {
      cancelled = true;
    };
  }, [open, documentId, userId, fileUrl]);

  if (!open || !document) return null;

  const state: TeamDocumentState = justFinished ? "done" : teamDocumentState(document);
  const isOffer = document.document_type === "offer_letter";
  const person = (document.applications?.profiles?.full_name ?? (body?.metadata as { recipientName?: string } | undefined)?.recipientName ?? "").trim() || "the applicant";
  const first = person === "the applicant" ? "they" : person.split(/\s+/)[0];
  const First = first === "they" ? "They" : first;
  const title = isOffer ? `Offer letter · ${person === "the applicant" ? "applicant" : person}` : document.name;
  const sentOn = format(new Date(document.created_at), "MMMM d");
  const signBy = document.expires_at ? format(new Date(document.expires_at), "EEEE, MMMM d") : null;
  const theirMark = signatureOf(document.candidate_signature_data, "recipient");
  const myMark = signatureOf(document.employer_signature_data, "employer");
  const theirRow = record.find((r) => r.action === "candidate_signed");
  const theirWhere = whereLine(theirRow);
  const signature = how === "typed" ? typed.trim() : drawn;
  const canSign = consent && reviewed && !!signature && (how === "drawn" || typed.trim().length >= 2) && !busy && (!isPdf || !!shownPdf);
  const signing = state === "yours" && canSend;

  const finish = async () => {
    if (!canSign || !signature) return;
    setBusy(true);
    setError(null);
    try {
      const signerContext = await collectSignerContext();
      await invokeDocumentSigning(supabase, {
        documentId: document.id,
        action: "countersign",
        signature: { method: how, value: signature, consentAccepted: true },
        reviewConfirmed: true,
        signerContext,
      });
      setJustFinished(true);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
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
      onShowRecord(document);
    } finally {
      setDownloading(false);
    }
  };

  // Declined after the applicant signed, it was the team's own decline on its
  // turn (document-signing lets the team decline only then; offerLetterState
  // reads it the same way): never quote the team's reason as the applicant's
  // (the twelfth product review).
  const declinedByTeam = state === "declined" && !!document.candidate_signed_at;

  const chip =
    state === "waiting"
      ? { text: `Waiting for ${first} to sign`, bg: "var(--amber-bg)", fg: "var(--amber-fg)", Icon: Clock }
      : state === "yours"
        ? { text: canSend ? `${First} signed · your turn` : `${First} signed · waiting on your team`, bg: "var(--action-soft)", fg: "var(--action-soft-fg)", Icon: PenLine }
        : state === "done"
          ? { text: "Signed by both", bg: "var(--action-soft)", fg: "var(--action-soft-fg)", Icon: CheckCircle2 }
          : state === "declined"
            ? { text: declinedByTeam ? "You declined" : `${First} declined`, bg: "var(--crit-bg)", fg: "var(--crit)", Icon: XCircle }
            : state === "withdrawn"
              ? { text: "Withdrawn", bg: "var(--surface-2)", fg: "var(--ink-2)", Icon: XCircle }
              : state === "voided"
                ? { text: "Voided", bg: "var(--crit-bg)", fg: "var(--crit)", Icon: XCircle }
                : { text: "Expired", bg: "var(--surface-2)", fg: "var(--ink-2)", Icon: Clock };

  // The two places to sign, on the paper: what is signed there, else who signs it.
  const stillOpen = state === "waiting" || state === "yours";
  const theirSpot: PaperSpot = theirMark
    ? { mark: { value: theirMark, at: document.candidate_signed_at } }
    : { mark: null, waitingLabel: stillOpen ? `${First} ${First === "They" ? "sign" : "signs"} here` : undefined };
  const mySpot: PaperSpot = myMark
    ? { mark: { value: myMark, at: document.employer_signed_at } }
    : signing
      ? { mark: null, mine: true, preview: signature || null }
      : { mark: null, waitingLabel: stillOpen ? (canSend ? "You sign here, after them" : "Your team signs here") : undefined };
  const goSign = () => goToSignPlace("ck-teamdoc-sign");
  const note = "mx-auto mb-5 max-w-[816px] text-[14px] leading-snug";

  return (
    <PaperDesk
      open={open}
      busy={busy}
      onClose={onClose}
      titleId="ck-teamdoc-title"
      title={title}
      status={
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: chip.bg, color: chip.fg }} data-team-document-chip>
            <chip.Icon className="h-3.5 w-3.5" aria-hidden />
            {chip.text}
          </span>
          <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            Sent {sentOn}
            {state === "waiting" && signBy ? ` · they have until ${signBy}` : ""}
          </span>
        </>
      }
      signPlaceId={signing && !justFinished ? "ck-teamdoc-sign" : null}
      signLabel="Sign"
      data={{ "data-team-document": state }}
    >
      {justFinished ? (
        <div className="ck-rise mx-auto max-w-md py-16 text-center" data-team-document-finished>
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full" style={{ background: "var(--action-soft)" }}>
            <CheckCircle2 className="h-9 w-9" style={{ color: "var(--action)" }} aria-hidden />
          </div>
          <h3 className="mt-4 font-display text-[28px]" style={{ color: "var(--hf-text)", fontWeight: 600 }}>
            {isOffer ? "Signed by both. It's official." : "Signed by both."}
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-[14px]" style={{ color: "var(--ink-2)" }}>
            {/* An already-hired person has no Hire to press (the twelfth product review: a letter sent after the hire). */}
            {document.applications?.status === "hired"
              ? `${First} gets the final copy too. ${First === "They" ? "They're" : `${First} is`} already hired, so there is nothing more to do here.`
              : <>{First} gets the final copy too. When you're ready, press Hire on {first === "they" ? "their" : `${first}'s`} page to welcome them and ask for their documents.</>}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" className={PILL} onClick={() => void download()} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download signed copy
            </button>
            <button type="button" className="ck-btn ck-btn-ghost !rounded-full !px-5 !py-2.5 !text-[14px]" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          {state === "waiting" && (
            <p className={note} style={{ color: "var(--ink-2)" }} data-team-document-wait>
              {/* Only the account owner is notified when the applicant signs (document-signing), so this
                  never promises a teammate a notification (the fourteenth product review), and tells each
                  reader who signs next (the fifteenth: the owner read about "the account owner"). */}
              <strong style={{ color: "var(--hf-text)" }}>Nothing to do yet.</strong> {First} signs first.{" "}
              {isOwner
                ? "You'll get a notification when they do, and then you sign here to finish."
                : canSend
                  ? "The account owner gets a notification when they do; then you or the owner sign here to finish."
                  : "The account owner gets a notification when they do; then someone on your team who may send documents signs it here."}
            </p>
          )}
          {state === "yours" && document.candidate_signed_at && (
            <p className={note} style={{ color: "var(--ink-2)" }} data-team-document-where>
              <strong style={{ color: "var(--hf-text)" }}>
                {First} signed {format(new Date(document.candidate_signed_at), "MMM d 'at' h:mm a")}
              </strong>
              {theirWhere ? ` · ${theirWhere}` : ""}
              {canSend ? ". Read it, then sign at the bottom." : "."}
            </p>
          )}
          {state === "declined" && (
            <p className={note} style={{ color: "var(--crit)" }}>
              {declinedByTeam ? "You declined this" : `${First} declined`}{document.decline_reason ? `: "${document.decline_reason}"` : "."}
            </p>
          )}
          {(state === "withdrawn" || state === "voided") && (
            <p className={note} style={{ color: "var(--ink-2)" }}>
              You {state === "withdrawn" ? "withdrew" : "voided"} this{document.voided_reason ? `: "${document.voided_reason}"` : "."}
            </p>
          )}
          {/* What to do about it: nothing once a later letter went out, and
              "send a new one" only to someone who can (the eleventh product
              review: it was said to a teammate without "Send documents",
              and beside a newer letter already signed). Offer letter lists
              hired people too, so it still works after the hire. */}
          {state === "expired" && (
            <p className={note} style={{ color: "var(--ink-2)" }} data-team-document-expired>
              {First} didn't sign by {signBy ?? "the date given"}.
              {newerLetterSentAt
                ? ` A newer offer letter went out on ${format(new Date(newerLetterSentAt), "MMMM d")}.`
                : isOffer && canSend
                  ? " Send a new offer letter if you still want them."
                  : ""}
            </p>
          )}

          {/* The paper itself, with the signatures where they go. */}
          {isPdf ? (
            shownPdf ? (
              <PaperPdf src={shownPdf.src} fields={body?.signatureFields} spots={{ candidate: theirSpot, employer: mySpot }} labels={{ candidate: person === "the applicant" ? "Applicant" : person, employer: "You" }} onSignHere={goSign} />
            ) : (
              <p className="py-20 text-center text-[14px]" style={{ color: "var(--ink-2)" }} data-team-document-file-problem>
                {shownPdfProblem(shownPdfFailed, role, isTeamMember)}
              </p>
            )
          ) : body?.content ? (
            <PaperLetter text={body.content} candidate={{ who: person === "the applicant" ? "Applicant" : person, spot: theirSpot }} employer={{ who: "You", spot: mySpot }} onSignHere={goSign} />
          ) : (
            <p className="py-20 text-center text-[14px]" style={{ color: "var(--ink-3)" }}>
              This document can't be shown here. Open the signing record.
            </p>
          )}

          {/* Only someone who may send documents signs for the business, keeps the
              signed copy and reads the signing record (document-signing's
              resolveDocumentRole, document_audit_log): a teammate without "Send
              documents" was offered "Sign to finish", refused on pressing it, and
              links that opened an empty viewer (the thirteenth product review). */}
          {!canSend && (state === "yours" || state === "done" || state === "declined" || state === "withdrawn" || state === "voided" || state === "expired") && (
            <p className="mx-auto mt-8 max-w-[816px] text-center text-[13.5px] leading-snug" style={{ color: "var(--ink-2)" }} data-team-document-no-send>
              {/* Only a letter signed by both has a signed copy (the fourteenth product review). */}
              {state === "yours"
                ? "Someone on your team who may send documents signs this to finish it."
                : state === "done"
                  ? "Only someone on your team who may send documents can open the signed copy and the signing record."
                  : "Only someone on your team who may send documents can open the signing record."}
            </p>
          )}

          {state === "yours" && canSend && (
            <section id="ck-teamdoc-sign" className="mx-auto mt-12 w-full max-w-[520px] scroll-mt-24" aria-labelledby="ck-teamdoc-sign-title" data-team-document-sign>
              <h3 id="ck-teamdoc-sign-title" className="text-center font-display text-[26px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
                Sign to finish
              </h3>
              <p className="mt-1 text-center text-[13.5px]" style={{ color: "var(--ink-3)" }}>
                Your signature goes on the {isOffer ? "letter" : "document"}{theirMark ? `, beside ${first === "they" ? "theirs" : `${First}'s`}` : ""}.
              </p>
              <SignatureLineInput id="ck-teamdoc-name" how={how} onHow={setHow} typed={typed} onTyped={setTyped} onDrawn={setDrawn} />
              <label className="mt-6 flex cursor-pointer items-start gap-3 text-[13.5px] leading-snug" style={{ color: "var(--ink-2)" }}>
                <input id="ck-teamdoc-review" type="checkbox" className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--action)]" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
                <span>I've read the {isOffer ? "letter" : "document"} and {first === "they" ? "their" : `${first}'s`} signature above.</span>
              </label>
              <label className="mt-3 flex cursor-pointer items-start gap-3 text-[13.5px] leading-snug" style={{ color: "var(--ink-2)" }}>
                <input id="ck-teamdoc-consent" type="checkbox" className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--action)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>{CONSENT_STATEMENT}</span>
              </label>
              {error && (
                <p className="mt-4 text-center text-[13.5px]" style={{ color: "var(--crit)" }}>
                  {error}
                </p>
              )}
              <button type="button" className="ck-btn ck-btn-primary mt-6 w-full !rounded-full !py-3.5 !text-[15px]" onClick={() => void finish()} disabled={!canSign} data-team-document-sign-button>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                {busy ? "Signing..." : "Sign and finish"}
              </button>
            </section>
          )}

          {state === "done" && canSend && (
            <div className={ROW} data-team-document-done>
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

          {/* A closed letter keeps its record too: who did what and when,
              and a copy of that record to save (the tenth product review:
              the link was there only once both had signed, so a declined,
              withdrawn, voided or expired letter had no way to it). */}
          {(state === "declined" || state === "withdrawn" || state === "voided" || state === "expired") && canSend && (
            <div className="mt-5 flex justify-end" data-team-document-closed-record>
              <button type="button" className="inline-flex items-center gap-1.5 text-[13.5px] underline underline-offset-2" style={{ color: "var(--ink-2)" }} onClick={() => onShowRecord(document)}>
                <FileText className="h-4 w-4" aria-hidden />
                Signing record
              </button>
            </div>
          )}

          {state === "waiting" && canSend && (
            <div className="mx-auto mt-8 flex max-w-[816px] justify-center">
              <button type="button" className="text-[13.5px] underline underline-offset-2" style={{ color: "var(--ink-3)" }} onClick={() => onWithdraw(document)} data-team-document-withdraw>
                {isOffer ? "Withdraw this offer" : "Withdraw"}
              </button>
            </div>
          )}
        </>
      )}
    </PaperDesk>
  );
}

export default TeamDocumentSheet;
