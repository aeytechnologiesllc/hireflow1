import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Clock, Download, FileText, Loader2, PenLine, X, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { invokeDocumentSigning } from "@/lib/documentSigningErrors";
import { collectSignerContext } from "@/lib/signerContext";
import type { DocumentWithApplication } from "@/hooks/useDocuments";
import { LetterText } from "@/components/documents/LetterText";
import { SignaturePad } from "@/components/documents/SignaturePad";
import { readDocumentBody } from "@/components/documents/ApplicantDocumentSheet";

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
 *   - declined, withdrawn, voided or expired: said plainly, with the reason.
 * The signing is the document-signing function's, unchanged.
 */

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

function Mark({ value }: { value: string | null }) {
  if (!value) return <div className="mt-1 text-[13px]" style={{ color: "var(--ink-3)" }}>Not signed yet</div>;
  return value.startsWith("data:image") ? (
    <img src={value} alt="" className="mt-1 h-12 max-w-full object-contain dark:invert" />
  ) : (
    <div className="mt-1 truncate font-signature text-[32px] leading-tight" style={{ color: "var(--hf-text)" }}>
      {value}
    </div>
  );
}

export function TeamDocumentSheet({
  document,
  open,
  onClose,
  onWithdraw,
  onShowRecord,
}: {
  document: DocumentWithApplication | null;
  open: boolean;
  onClose: () => void;
  /** Opens the page's own Withdraw box for this document. */
  onWithdraw: (document: DocumentWithApplication) => void;
  /** Opens the full signing record (certificate, audit trail). */
  onShowRecord: (document: DocumentWithApplication) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
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

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
  const canSign = consent && reviewed && !!signature && (how === "drawn" || typed.trim().length >= 2) && !busy;

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

  const chip =
    state === "waiting"
      ? { text: `Waiting for ${first} to sign`, bg: "var(--amber-bg)", fg: "var(--amber-fg)", Icon: Clock }
      : state === "yours"
        ? { text: `${First} signed · your turn`, bg: "var(--jade-soft)", fg: "var(--jade-soft-fg)", Icon: PenLine }
        : state === "done"
          ? { text: "Signed by both", bg: "var(--jade-soft)", fg: "var(--jade-soft-fg)", Icon: CheckCircle2 }
          : state === "declined"
            ? { text: `${First} declined`, bg: "var(--crit-bg)", fg: "var(--crit)", Icon: XCircle }
            : state === "withdrawn"
              ? { text: "Withdrawn", bg: "var(--surface-2)", fg: "var(--ink-2)", Icon: XCircle }
              : state === "voided"
                ? { text: "Voided", bg: "var(--crit-bg)", fg: "var(--crit)", Icon: XCircle }
                : { text: "Expired", bg: "var(--surface-2)", fg: "var(--ink-2)", Icon: Clock };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-4">
      <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--hf-bg) 70%, transparent)", backdropFilter: "blur(2px)" }} onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ck-teamdoc-title"
        data-team-document={state}
        className="ck-card relative flex max-h-[calc(100dvh-24px)] w-full max-w-[760px] flex-col p-0"
        style={{ animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both" }}
      >
        <div className="border-b px-5 pb-4 pt-5" style={{ borderColor: "var(--line)" }}>
          <button onClick={onClose} disabled={busy} className="absolute right-3 top-3 p-1 disabled:opacity-40" style={{ color: "var(--hf-text-muted)" }} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
          <h2 id="ck-teamdoc-title" className="pr-8 font-display text-[22px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
            {title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: chip.bg, color: chip.fg }} data-team-document-chip>
              <chip.Icon className="h-3.5 w-3.5" aria-hidden />
              {chip.text}
            </span>
            <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              Sent {sentOn}
              {state === "waiting" && signBy ? ` · they have until ${signBy}` : ""}
            </span>
          </div>
        </div>

        <div className="ck-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {justFinished ? (
            <div className="py-6 text-center" data-team-document-finished>
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full" style={{ background: "var(--jade-soft)" }}>
                <CheckCircle2 className="h-9 w-9" style={{ color: "var(--jade)" }} aria-hidden />
              </div>
              <h3 className="mt-4 font-display text-[26px]" style={{ color: "var(--hf-text)", fontWeight: 600 }}>
                {isOffer ? "Signed by both. It's official." : "Signed by both."}
              </h3>
              <p className="mx-auto mt-2 max-w-sm text-[13.5px]" style={{ color: "var(--ink-2)" }}>
                {First} gets the final copy too. When you're ready, press Hire on {first === "they" ? "their" : `${first}'s`} page to welcome them and ask for their documents.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button type="button" className="ck-btn ck-btn-primary !py-2 !text-[13px]" onClick={() => void download()} disabled={downloading}>
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Download signed copy
                </button>
                <button type="button" className="ck-btn ck-btn-ghost !py-2 !text-[13px]" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              {state === "waiting" && (
                <div className="mb-4 rounded-[12px] px-4 py-3 text-[13.5px] leading-snug" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }} data-team-document-wait>
                  <strong style={{ color: "var(--hf-text)" }}>Nothing to do yet.</strong> {First} signs first. You'll get a notification when they do, and then you sign here to finish.
                </div>
              )}
              {state === "declined" && (
                <div className="mb-4 rounded-[12px] px-4 py-3 text-[13.5px]" style={{ background: "var(--crit-bg)", color: "var(--crit)" }}>
                  {First} declined{document.decline_reason ? `: "${document.decline_reason}"` : "."}
                </div>
              )}
              {(state === "withdrawn" || state === "voided") && (
                <div className="mb-4 rounded-[12px] px-4 py-3 text-[13.5px]" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
                  You {state === "withdrawn" ? "withdrew" : "voided"} this{document.voided_reason ? `: "${document.voided_reason}"` : "."}
                </div>
              )}
              {state === "expired" && (
                <div className="mb-4 rounded-[12px] px-4 py-3 text-[13.5px]" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
                  {First} didn't sign by {signBy ?? "the date given"}. Send a new offer letter if you still want them.
                </div>
              )}

              <article className="rounded-[12px] border px-5 py-5 text-[14px] leading-[1.6]" style={{ borderColor: "var(--line)", background: "var(--hf-surface)", color: "var(--hf-text)" }} data-team-document-letter>
                {body?.content ? <LetterText text={body.content} /> : <p style={{ color: "var(--ink-3)" }}>This document can't be shown here. Open the signing record.</p>}
              </article>

              {(state === "yours" || state === "done" || state === "voided") && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2" data-team-document-signatures>
                  <div className="min-w-0 rounded-[12px] border px-4 py-3" style={{ borderColor: "var(--line)" }}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
                      {person === "the applicant" ? "Applicant" : person}
                    </div>
                    <Mark value={theirMark} />
                    {document.candidate_signed_at && (
                      <div className="mt-0.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
                        {format(new Date(document.candidate_signed_at), "MMM d, yyyy 'at' h:mm a")}
                      </div>
                    )}
                    {theirWhere && (
                      <div className="mt-0.5 text-[12px]" style={{ color: "var(--ink-3)" }} data-team-document-where>
                        {theirWhere}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 rounded-[12px] border px-4 py-3" style={{ borderColor: "var(--line)" }}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
                      You
                    </div>
                    <Mark value={myMark} />
                    {document.employer_signed_at && state === "done" && (
                      <div className="mt-0.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
                        {format(new Date(document.employer_signed_at), "MMM d, yyyy 'at' h:mm a")}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {state === "yours" && (
                <section className="mt-5 rounded-[14px] border px-4 py-4" style={{ borderColor: "var(--jade)", background: "color-mix(in srgb, var(--jade-soft) 55%, transparent)" }} data-team-document-sign>
                  <h3 className="text-[15px] font-semibold" style={{ color: "var(--hf-text)" }}>
                    Sign to finish
                  </h3>
                  {how === "typed" ? (
                    <>
                      <label htmlFor="ck-teamdoc-name" className="mt-3 block text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                        Type your full name
                      </label>
                      <input
                        id="ck-teamdoc-name"
                        className="ck-input mt-1 w-full px-3 py-1.5 font-signature !text-[30px] leading-snug"
                        value={typed}
                        maxLength={120}
                        onChange={(e) => setTyped(e.target.value)}
                        autoComplete="name"
                      />
                      <button type="button" className="mt-1.5 text-[12px] underline underline-offset-2" style={{ color: "var(--ink-3)" }} onClick={() => setHow("drawn")}>
                        Draw it instead
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="mt-3 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                        Draw your signature
                      </div>
                      <div className="mt-1">
                        <SignaturePad onChange={setDrawn} />
                      </div>
                      <button type="button" className="mt-1.5 text-[12px] underline underline-offset-2" style={{ color: "var(--ink-3)" }} onClick={() => setHow("typed")}>
                        Type it instead
                      </button>
                    </>
                  )}
                  <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug" style={{ color: "var(--ink-2)" }}>
                    <input id="ck-teamdoc-review" type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--jade)]" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
                    <span>I've read the letter and {first === "they" ? "their" : `${first}'s`} signature above.</span>
                  </label>
                  <label className="mt-2 flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug" style={{ color: "var(--ink-2)" }}>
                    <input id="ck-teamdoc-consent" type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--jade)]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    <span>{CONSENT_STATEMENT}</span>
                  </label>
                  {error && (
                    <p className="mt-3 text-[13px]" style={{ color: "var(--crit)" }}>
                      {error}
                    </p>
                  )}
                  <button type="button" className="ck-btn ck-btn-primary mt-4 w-full !py-2.5 !text-[14px]" onClick={() => void finish()} disabled={!canSign} data-team-document-sign-button>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                    {busy ? "Signing..." : "Sign and finish"}
                  </button>
                </section>
              )}

              {state === "done" && (
                <div className="mt-5 flex flex-wrap items-center gap-3" data-team-document-done>
                  <button type="button" className="ck-btn ck-btn-primary !py-2 !text-[13px]" onClick={() => void download()} disabled={downloading}>
                    {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Download signed copy
                  </button>
                  <button type="button" className="inline-flex items-center gap-1.5 text-[13px] underline underline-offset-2" style={{ color: "var(--ink-2)" }} onClick={() => onShowRecord(document)}>
                    <FileText className="h-4 w-4" aria-hidden />
                    Signing record
                  </button>
                </div>
              )}

              {state === "waiting" && (
                <div className="mt-5 flex justify-end">
                  <button type="button" className="text-[13px] underline underline-offset-2" style={{ color: "var(--ink-3)" }} onClick={() => onWithdraw(document)} data-team-document-withdraw>
                    {isOffer ? "Withdraw this offer" : "Withdraw"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    // window.document: `document` here is the prop (the letter).
    window.document.body,
  );
}

export default TeamDocumentSheet;
