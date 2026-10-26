import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, X } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { useOwnBusiness } from "@/hooks/useBusinessPage";
import { useCompanyNames } from "@/hooks/useCompanyNames";
import { requestLocks, useBusinessStanding } from "@/hooks/useBusinessStanding";
import { DUE_CHOICES, hireOfferLine, ID_DELETE_HOURS_AFTER_OPENED, REQUEST_KINDS, SIGN_OFFER_LINE, todoLine } from "@/lib/documentRequests";
import { addDays, dayOf, longDate } from "../lib/offerLetter";
import { useApplicantRequests, type NewRequest } from "../hooks/useApplicantRequests";
import { useHireWithDocuments, useOfferLetterState } from "../hooks/useHire";
import { useAuth } from "@/hooks/useAuth";
import { useTeamMemberPermissions } from "@/hooks/useTeamMemberPermissions";
import { CANT_MOVE_APPLICANTS, teamRoleCant } from "@/lib/teamPermissions";

/**
 * Hire, and ask for documents in the same welcome email
 * (docs/DOCUMENT-REQUESTS.md, "Hiring"; approved by the owner 2026-10-10 from
 * the "Interview to First Day" mock-up).
 *
 * The usual documents are ticked already (government ID, NBI clearance, the
 * email they are paid on); beside them, the welcome email as it will read,
 * built from the same lines the email function uses. The button locks on the
 * first press, and the hire itself only happens once (useHireWithDocuments).
 */

// The owner, 2026-10-10: "Why did I ask for NBI clearance? What is that?" An
// NBI clearance (the Philippines' police record) is there to tick, never
// ticked for him.
const DEFAULT_KINDS = ["government_id", "payment_email"];

export function HireDialog({
  open,
  applicationId,
  candidateId,
  name,
  jobTitle,
  onClose,
}: {
  open: boolean;
  applicationId: string;
  candidateId: string | null;
  name: string;
  jobTitle: string;
  onClose: () => void;
}) {
  const hire = useHireWithDocuments();
  const { data: profile } = useProfile();
  const { data: existing = [] } = useApplicantRequests(open ? applicationId : null);
  const { data: offer } = useOfferLetterState(applicationId, open);
  const today = useMemo(() => dayOf(new Date()), []);
  const first = name.trim().split(/\s+/)[0] || "them";
  // The business's name (the job owner's), so a team member's welcome email
  // names the business, not their own blank profile.
  const { data: ownBusiness } = useOwnBusiness();
  const businessNames = useCompanyNames([ownBusiness?.employerId]);
  const company =
    (ownBusiness?.employerId && businessNames.get(ownBusiness.employerId)) ||
    ((profile as { company_name?: string | null } | null | undefined)?.company_name ?? "").trim();

  // What is already asked: still waiting (listed in the email anyway), sent, or approved.
  const already = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of existing) {
      if (r.custom_document_name) continue;
      map.set(r.document_type, r.status === "approved" ? "approved" : r.status === "submitted" || r.status === "reviewed" ? "already sent" : "already asked");
    }
    return map;
  }, [existing]);

  // A paused business can ask for nothing (the 2026-10-11 mock-ups, #4); ID
  // papers follow what the database says (open from sign-up since 2026-10-11),
  // so a refusal never takes the payment email down with it.
  const { idsLocked, allLocked } = requestLocks(useBusinessStanding(open));
  // A team member asks for documents only with "Send documents" on (the
  // database refuses the request otherwise), and "Request documents" on the
  // applicant's page is the owner's: theirs is Documents, Ask for ID or papers.
  const { isTeamMember } = useAuth();
  const { data: teamPermissions } = useTeamMemberPermissions();
  const cantAsk = isTeamMember && teamPermissions !== undefined && !teamPermissions.canSendDocuments;
  // Pointed to Documents for a new offer letter only when they can send one:
  // a teammate's switches must have arrived and say so (the eleventh product
  // review: a teammate without "Send documents" was told to send one).
  const canSendLetters = !isTeamMember || teamPermissions?.canSendDocuments === true;
  const askLaterWhere = isTeamMember ? "Documents, Ask for ID or papers" : `${first}'s page`;
  const isLocked = (key: string) => cantAsk || allLocked || (idsLocked && !!REQUEST_KINDS.find((k) => k.key === key)?.idPaper);

  const [picked, setPicked] = useState<string[]>(DEFAULT_KINDS);
  const [dueDays, setDueDays] = useState<number>(5);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (open) {
      setPicked(DEFAULT_KINDS);
      setDueDays(5);
      setLocked(false);
    }
  }, [open]);

  // The standing (or a team member's switches) can arrive after the dialog
  // opened: drop what it locks.
  useEffect(() => {
    if (idsLocked || allLocked || cantAsk) setPicked((now) => now.filter((key) => !isLocked(key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsLocked, allLocked, cantAsk]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !locked) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, locked]);

  if (!open) return null;

  const items: NewRequest[] = REQUEST_KINDS.filter((k) => picked.includes(k.key) && !already.has(k.key) && !isLocked(k.key)).map((k) => ({ documentType: k.key, ask: k.ask }));
  const dueDate = addDays(today, dueDays);
  const offerUnsigned = offer?.kind === "unsigned";

  // The welcome email's list, in the function's order: the offer, then what
  // is still waiting from before, then what is asked now.
  const waitingBefore = existing.filter((r) => r.status === "pending" || r.status === "rejected").map((r) => todoLine(r.document_type, r.custom_document_name));
  const todo = [...(offerUnsigned ? [SIGN_OFFER_LINE] : []), ...new Set([...waitingBefore, ...items.map((i) => todoLine(i.documentType, i.customName))])];
  const deletesIds = [...items.map((i) => i.documentType), ...existing.filter((r) => r.status === "pending" || r.status === "rejected").map((r) => r.document_type)].some((k) => ["government_id", "nbi_clearance", "proof_of_address"].includes(k));
  const asksForDocuments = items.length > 0 || waitingBefore.length > 0;
  // "Within N days", worked out as the email function does: the earliest due
  // date still ahead, in whole days rounded down.
  const now = Date.now();
  const dues = [
    ...(items.length > 0 ? [new Date(`${dueDate}T23:59:59`).getTime()] : []),
    ...existing.filter((r) => (r.status === "pending" || r.status === "rejected") && r.due_date).map((r) => new Date(r.due_date as string).getTime()),
  ].filter((t) => !Number.isNaN(t) && t > now);
  const dueInDays = dues.length > 0 ? Math.max(1, Math.floor((Math.min(...dues) - now) / 86_400_000)) : null;

  const toggle = (key: string) => setPicked((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]));

  const run = async () => {
    if (locked || !candidateId) return;
    // Locked before anything is awaited: a second press does nothing.
    setLocked(true);
    try {
      const result = await hire.mutateAsync({
        applicationId,
        candidateId,
        jobTitle,
        items,
        dueDate: new Date(`${dueDate}T23:59:59`).toISOString(),
      });
      if (result.already) {
        toast.message(`${first} is already hired`, { description: "Nothing was sent again." });
      } else if (result.refused === "declined") {
        toast.message(`${first} was declined`, { description: "They can't be hired from here. Nothing was sent." });
      } else if (result.refused === "not_allowed") {
        toast.error(`${first} was not hired`, { description: `${CANT_MOVE_APPLICANTS} Nothing was sent.` });
      } else if (result.askFailed) {
        toast.success(`${first} is hired`, { description: `The welcome email went, but the documents could not be asked for. Use ${isTeamMember ? "Documents, Ask for ID or papers" : "Request documents on their page"}.` });
      } else {
        toast.success(`${first} is hired`, {
          description: todo.length > 0 ? `One welcome email sent, with ${todo.length} ${todo.length === 1 ? "thing" : "things"} to do.` : "One welcome email sent.",
        });
      }
      onClose();
    } catch (error) {
      setLocked(false);
      toast.error("Hiring did not go through", { description: (error as Error).message });
    }
  };

  const busy = locked;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-4">
      <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--hf-bg) 70%, transparent)", backdropFilter: "blur(2px)" }} onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ck-hire-title"
        data-hire-dialog
        className="ck-card relative flex max-h-[calc(100dvh-24px)] w-full max-w-[860px] flex-col p-0"
        style={{ animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both" }}
      >
        <div className="border-b px-5 pb-3.5 pt-5" style={{ borderColor: "var(--line)" }}>
          <button onClick={onClose} disabled={busy} className="absolute right-3 top-3 p-1 disabled:opacity-40" style={{ color: "var(--hf-text-muted)" }} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
          <h2 id="ck-hire-title" className="pr-8 font-display text-[21px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
            Hire {first}?
          </h2>
          <p className="mt-0.5 pr-8 text-[13px]" style={{ color: "var(--hf-text-soft)" }}>
            {first} gets one welcome email from {company || "you"}. It asks for what you tick here.
          </p>
        </div>

        <div className="ck-scroll grid min-h-0 flex-1 gap-x-6 gap-y-5 overflow-y-auto px-5 pb-5 pt-4 md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <fieldset className="flex flex-col gap-2" data-hire-kinds>
              <legend className="mb-1.5 text-[12.5px] font-semibold" style={{ color: "var(--hf-text)" }}>
                Ask for these in the same email
              </legend>
              {REQUEST_KINDS.map((kind) => {
                const done = already.get(kind.key);
                const lockedKind = !done && isLocked(kind.key);
                const on = !done && !lockedKind && picked.includes(kind.key);
                return (
                  <label
                    key={kind.key}
                    htmlFor={`ck-hire-${kind.key}`}
                    className={`flex items-center gap-3 rounded-[12px] border px-3 py-2 transition-colors ${done || lockedKind ? "cursor-default opacity-60" : "cursor-pointer"}`}
                    style={{ borderColor: on ? "var(--action)" : "var(--line)", background: on ? "var(--action-soft)" : "transparent" }}
                    data-hire-kind={kind.key}
                    data-hire-kind-locked={lockedKind ? "true" : undefined}
                  >
                    <input id={`ck-hire-${kind.key}`} type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--action)]" checked={on} disabled={busy || !!done || lockedKind} onChange={() => toggle(kind.key)} />
                    <span className="min-w-0 flex-1 text-[14px] font-medium" style={{ color: "var(--hf-text)" }}>
                      {kind.label}
                    </span>
                    {lockedKind ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px]" style={{ color: "var(--hf-gold)" }}>
                        <Lock className="h-3 w-3" aria-hidden />
                        {cantAsk ? "off" : allLocked ? "paused" : "not open"}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                        {done ?? (kind.key === "payment_email" ? "Wise or PayPal" : kind.answer === "text" ? "typed" : "photo")}
                      </span>
                    )}
                  </label>
                );
              })}
              {(idsLocked || allLocked || cantAsk) && (
                <p className="rounded-[12px] px-3 py-2.5 text-[13px] leading-snug" style={{ background: "var(--amber-bg)", color: "var(--amber-fg)" }} data-hire-approval-note>
                  {allLocked
                    ? "Your business is paused, so nothing can be asked for right now. Open Help to message HireFlow."
                    : cantAsk
                      ? `${teamRoleCant("ask for documents", "canSendDocuments")} ${first} still gets the welcome email.`
                      : `ID papers aren't open for ${company || "your business"} right now. You can ask for them later from ${askLaterWhere}.`}
                </p>
              )}
            </fieldset>

            <div>
              <div className="mb-1 text-[12.5px] font-semibold" style={{ color: "var(--hf-text)" }}>Due in</div>
              <div role="radiogroup" aria-label="Due in" className="inline-flex w-full rounded-[10px] p-[3px]" style={{ background: "var(--surface-2)" }}>
                {DUE_CHOICES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={dueDays === d}
                    disabled={busy}
                    onClick={() => setDueDays(d)}
                    className="min-w-0 flex-1 rounded-[8px] px-2 py-1.5 text-[13px]"
                    style={dueDays === d ? { background: "var(--hf-surface)", color: "var(--hf-text)", fontWeight: 600, boxShadow: "0 1px 2px rgba(0,0,0,0.12)" } : { color: "var(--ink-2)" }}
                  >
                    {d} days
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>By {longDate(dueDate)}.</p>
            </div>

            <div
              className="rounded-[12px] px-3 py-2.5 text-[13px] leading-snug"
              style={offerUnsigned ? { background: "var(--amber-bg)", color: "var(--amber-fg)" } : offer?.kind === "signed" ? { background: "var(--action-soft)", color: "var(--action-soft-fg)" } : { background: "var(--surface-2)", color: "var(--ink-2)" }}
              data-hire-offer={offer?.kind ?? "loading"}
            >
              {/* An expired letter is nobody's to sign now (the tenth product
                  review: the email asked them to sign one that had expired);
                  a declined, voided or withdrawn one went out and says so,
                  and only someone who can send a new one is told where (the
                  eleventh product review): hireOfferLine. */}
              {!offer ? "Checking the offer letter..." : hireOfferLine(offer, first, canSendLetters, offer.kind === "signed" ? longDate(dayOf(new Date(offer.signedAt))) : "")}
            </div>
          </div>

          <div className="min-w-0 md:sticky md:top-0 md:self-start">
            <div className="mb-1.5 text-[12.5px] font-semibold" style={{ color: "var(--hf-text)" }}>The welcome email {first} gets</div>
            <div className="rounded-[12px] border px-4 py-4 text-[13.5px] leading-[1.55]" style={{ borderColor: "var(--line)", background: "var(--hf-surface)", color: "var(--hf-text)" }} data-hire-preview>
              <div className="font-display text-[18px]" style={{ fontWeight: 600 }}>You're hired!</div>
              <p className="mt-1.5">
                Congratulations, {first}. You're joining {company || "your team"} as <strong>{jobTitle}</strong>.
              </p>
              {todo.length > 0 ? (
                <>
                  <p className="mt-2">Before your first day, please:</p>
                  <ol className="mt-1 list-decimal pl-5">
                    {todo.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                  {dueInDays && <p className="mt-2">Please do this within {dueInDays} {dueInDays === 1 ? "day" : "days"}.</p>}
                  {asksForDocuments && (
                    <p className="mt-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
                      Only {company || "your team"} can see what you send.{deletesIds ? ` ID papers are deleted ${ID_DELETE_HOURS_AFTER_OPENED} hours after ${company || "your team"} first opens them.` : ""}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-2" style={{ color: "var(--ink-2)" }}>
                  We'll follow up with your start date and next steps.
                </p>
              )}
              <div className="mt-3 inline-block rounded-[6px] px-3 py-1.5 text-[12.5px] font-semibold" style={{ background: "var(--action)", color: "var(--btn-fg)" }}>
                {todo.length > 0 ? "Open HireFlow" : "Open your application"}
              </div>
              <p className="mt-3 border-t pt-2 text-[12px]" style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
                — The {company ? (/\bteam$/i.test(company) ? company : `${company} team`) : "hiring team"}
              </p>
            </div>
            <div className="mt-3 flex gap-2.5 rounded-[12px] px-3 py-2.5 text-[12.5px] leading-snug" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>What {first} sends shows on their page under Documents. Only you can open it, and every opening is recorded.</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3" style={{ borderColor: "var(--line)" }}>
          <span className="min-w-0 flex-1 text-[12px] leading-snug" style={{ color: "var(--ink-3)" }} role="status">
            {busy ? "Sending. Keep this open." : "Pressed once, it locks. Nothing is sent twice."}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <button type="button" className="ck-btn ck-btn-ghost !py-2 !text-[13px]" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="ck-btn ck-btn-primary !py-2 !text-[13px]" onClick={() => void run()} disabled={busy || !candidateId} data-hire-confirm>
              {busy ? "Sending..." : `Hire ${first} and send`}
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
