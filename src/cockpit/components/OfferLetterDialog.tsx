import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { useOfferPeople, useSendOfferLetter, type OfferPerson } from "../hooks/useOfferLetter";
import {
  OFFER_LIMITS,
  OFFER_REPLY_DAYS,
  addDays,
  dayOf,
  longDate,
  offerLetterText,
  offerProblems,
  offerWords,
  type OfferLetterFields,
} from "../lib/offerLetter";

/**
 * The offer letter, on one screen (lib/offerLetter.ts; docs/OFFER-LETTER.md).
 *
 * The owner, 2026-10-09: "do you think we should send ... the offer letter
 * through the portal?" Yes, but not through the six old screens: they asked
 * for an annual salary, let the pay through empty and had an AI write the
 * letter. Here he says who, the pay, the hours, the shift, the start date and
 * the day the offer ends; the letter beside the boxes is the letter they
 * will read, word for word, and it changes as he types.
 *
 * It emails the applicant, so the button is pressed twice: once to say who,
 * once to mean it. Changing anything takes the second press back.
 *
 * Portalled to <body> like the cockpit's other dialogs.
 */

const STAGE_WORDS: Record<string, string> = { interview: "Interviewed", offered: "Offer already out", reviewing: "In review" };

/** Hours and shift are the same for everyone hired into a job: kept on this device per job, as a convenience only. */
function rememberedTerms(jobId: string): { hours: string; shift: string } {
  try {
    const raw = window.localStorage.getItem(`hf-offer-terms:${jobId}`);
    const read = raw ? (JSON.parse(raw) as { hours?: unknown; shift?: unknown }) : null;
    return { hours: typeof read?.hours === "string" ? read.hours : "", shift: typeof read?.shift === "string" ? read.shift : "" };
  } catch {
    return { hours: "", shift: "" };
  }
}

function rememberTerms(jobId: string, hours: string, shift: string): void {
  try {
    window.localStorage.setItem(`hf-offer-terms:${jobId}`, JSON.stringify({ hours, shift }));
  } catch {
    // Storage blocked: he types them again next time.
  }
}

// 16px on a phone: anything smaller and an iPhone zooms the page in when the box is tapped.
// The "!" is needed: .ck-input sets its own size.
const INPUT = "ck-input w-full px-3 py-2 !text-[16px] md:!text-[14px]";

function Field({ id, label, hint, problem, children }: { id: string; label: string; hint?: string; problem?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12.5px] font-semibold" style={{ color: "var(--hf-text)" }}>
        {label}
        {hint && (
          <span className="ml-1.5 font-normal" style={{ color: "var(--ink-3)" }}>
            {hint}
          </span>
        )}
      </label>
      {children}
      {problem && (
        <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--amber-fg)" }} data-offer-problem>
          {problem}
        </p>
      )}
    </div>
  );
}

export function OfferLetterDialog({
  open,
  applicationId,
  onClose,
}: {
  open: boolean;
  /** The applicant to start with, when opened from their profile or the hire prompt. */
  applicationId?: string | null;
  onClose: () => void;
}) {
  const { data: people = [], isLoading, isError } = useOfferPeople(open);
  const { data: profile } = useProfile();
  const send = useSendOfferLetter();
  const today = useMemo(() => dayOf(new Date()), []);

  const [pickedId, setPickedId] = useState<string | null>(applicationId ?? null);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [pay, setPay] = useState("");
  const [hours, setHours] = useState("");
  const [shift, setShift] = useState("");
  const [startDate, setStartDate] = useState("");
  const [replyBy, setReplyBy] = useState(() => addDays(dayOf(new Date()), OFFER_REPLY_DAYS));
  const [extra, setExtra] = useState("");
  const [signer, setSigner] = useState("");
  const [company, setCompany] = useState("");
  const [editFrom, setEditFrom] = useState(false);
  const [armed, setArmed] = useState(false);
  const [tried, setTried] = useState(false);

  const person: OfferPerson | null = people.find((p) => p.applicationId === pickedId) ?? null;

  // The owner's own name and company, once, when they arrive.
  useEffect(() => {
    if (!profile) return;
    setSigner((now) => now || (profile.full_name ?? "").trim());
    setCompany((now) => now || (profile.company_name ?? "").trim());
  }, [profile]);

  // Choosing a person fills in what is already known about them and the job.
  useEffect(() => {
    if (!person) return;
    setName(person.name === "Applicant" ? "" : person.name);
    setPay((now) => now || person.jobPay);
    const kept = rememberedTerms(person.jobId);
    setHours((now) => now || kept.hours);
    setShift((now) => now || kept.shift);
    // Only when the person changes: typing must never be overwritten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.applicationId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !send.isPending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, send.isPending]);

  const fields: OfferLetterFields = {
    applicantName: name,
    roleTitle: person?.jobTitle ?? "",
    companyName: company,
    signerName: signer,
    pay,
    hours,
    shift,
    startDate,
    replyBy,
    extra,
    today,
  };
  const problems = offerProblems(fields);
  const problemFor = (field: keyof OfferLetterFields) => (tried ? problems.find((p) => p.field === field)?.text : undefined);
  const words = offerWords(fields, send.isPending, armed);
  const letter = offerLetterText(fields);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? people.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)) : people.filter((p) => p.status === "interview");
    return (list.length > 0 || q ? list : people).slice(0, 8);
  }, [people, search]);

  if (!open) return null;

  // Any change takes the second press back: what he confirms is what he last read.
  const edit = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setArmed(false);
  };

  const run = async () => {
    if (!person || problems.length > 0) {
      setTried(true);
      setArmed(false);
      return;
    }
    if (!armed) {
      setArmed(true);
      return;
    }
    try {
      const sent = await send.mutateAsync({ person, fields });
      rememberTerms(person.jobId, hours.trim(), shift.trim());
      const who = name.trim().split(/\s+/)[0] || "them";
      toast.success(`Offer letter sent to ${who}`, {
        description: sent.moved
          ? `They have until ${longDate(replyBy)} to sign. You sign after they do.`
          : `They have until ${longDate(replyBy)} to sign. Moving them to Offer did not go through: do that on their profile.`,
      });
      onClose();
    } catch (error) {
      setArmed(false);
      toast.error("The letter was not sent", { description: (error as Error).message });
    }
  };

  const busy = send.isPending;
  const status = !person ? "Choose who the offer is for." : tried && problems.length > 0 ? problems[0].text : words.note;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-4">
      <div
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--hf-bg) 70%, transparent)", backdropFilter: "blur(2px)" }}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ck-offer-title"
        data-offer-letter
        className="ck-card relative flex max-h-[calc(100dvh-24px)] w-full max-w-[980px] flex-col p-0"
        style={{ animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both" }}
      >
        <div className="border-b px-5 pb-3.5 pt-5" style={{ borderColor: "var(--line)" }}>
          <button onClick={onClose} disabled={busy} className="absolute right-3 top-3 p-1 disabled:opacity-40" style={{ color: "var(--hf-text-muted)" }} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
          <h2 id="ck-offer-title" className="pr-8 font-display text-[19px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
            Offer letter
          </h2>
          <p className="mt-0.5 pr-8 text-[13px]" style={{ color: "var(--hf-text-soft)" }}>
            A plain letter they sign online. It says only what you type here.
          </p>
        </div>

        <div className="ck-scroll grid min-h-0 flex-1 gap-x-6 gap-y-5 overflow-y-auto px-5 pb-5 pt-4 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]" data-offer-body>
          {/* What he types. */}
          <div className="flex min-w-0 flex-col gap-3.5">
            {person ? (
              <div className="flex items-center gap-3 rounded-[12px] border px-3 py-2.5" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} data-offer-person>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>
                    {person.name}
                  </div>
                  <div className="truncate text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {[STAGE_WORDS[person.status], person.jobTitle].filter(Boolean).join(" \u00B7 ")}
                  </div>
                </div>
                <button
                  type="button"
                  className="ck-btn ck-btn-ghost !px-2 !py-1.5 !text-[12.5px]"
                  disabled={busy}
                  onClick={() => {
                    setPickedId(null);
                    setArmed(false);
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              <div data-offer-pick>
                <label htmlFor="ck-offer-search" className="mb-1 block text-[12.5px] font-semibold" style={{ color: "var(--hf-text)" }}>
                  Who is the offer for?
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--ink-3)" }} aria-hidden />
                  <input id="ck-offer-search" className={`${INPUT} !pl-9`} placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
                </div>
                <ul className="mt-2 overflow-hidden rounded-[12px] border" style={{ borderColor: "var(--line)" }}>
                  {isLoading && (
                    <li className="px-3 py-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
                      Loading your applicants...
                    </li>
                  )}
                  {isError && (
                    <li className="px-3 py-3 text-[13px]" style={{ color: "var(--crit)" }}>
                      Your applicants could not be loaded. Close this and try again.
                    </li>
                  )}
                  {!isLoading && !isError && matches.length === 0 && (
                    <li className="px-3 py-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
                      {search.trim() ? "Nobody by that name is in review or at interview." : "Nobody is in review or at interview yet."}
                    </li>
                  )}
                  {matches.map((p, i) => (
                    <li key={p.applicationId} className={i > 0 ? "border-t" : ""} style={{ borderColor: "var(--line)" }}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]"
                        onClick={() => {
                          setPickedId(p.applicationId);
                          setSearch("");
                          setArmed(false);
                        }}
                        data-offer-option
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium" style={{ color: "var(--hf-text)" }}>
                            {p.name}
                          </span>
                          <span className="block truncate text-[12px]" style={{ color: "var(--ink-3)" }}>
                            {p.jobTitle}
                          </span>
                        </span>
                        <span
                          className="shrink-0 rounded-[5px] px-2 py-[3px] text-[10px] font-bold uppercase leading-none tracking-[0.06em]"
                          style={p.status === "interview" ? { background: "var(--jade-soft)", color: "var(--jade-soft-fg)" } : { background: "var(--surface-2)", color: "var(--ink-2)" }}
                        >
                          {STAGE_WORDS[p.status] ?? p.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {!search.trim() && people.some((p) => p.status !== "interview") && matches.every((p) => p.status === "interview") && matches.length > 0 && (
                  <p className="mt-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
                    These are the people you have interviewed. Search for anyone else.
                  </p>
                )}
              </div>
            )}

            {person && (
              <>
                <Field id="ck-offer-name" label="Their name on the letter" problem={problemFor("applicantName")}>
                  <input id="ck-offer-name" className={INPUT} value={name} maxLength={OFFER_LIMITS.name} disabled={busy} onChange={(e) => edit(setName)(e.target.value)} autoComplete="off" />
                </Field>
                <Field id="ck-offer-pay" label="Pay" problem={problemFor("pay")}>
                  <input id="ck-offer-pay" className={INPUT} value={pay} maxLength={OFFER_LIMITS.line} disabled={busy} placeholder="USD 500 a month" onChange={(e) => edit(setPay)(e.target.value)} autoComplete="off" />
                </Field>
                {/* Full width each: "40 hours a week, 5 days a week" does not fit half a row. */}
                <div className="grid gap-3.5">
                  <Field id="ck-offer-hours" label="Hours" hint="optional">
                    <input id="ck-offer-hours" className={INPUT} value={hours} maxLength={OFFER_LIMITS.line} disabled={busy} placeholder="40 hours a week, 5 days a week" onChange={(e) => edit(setHours)(e.target.value)} autoComplete="off" />
                  </Field>
                  <Field id="ck-offer-shift" label="Shift" hint="optional">
                    <input id="ck-offer-shift" className={INPUT} value={shift} maxLength={OFFER_LIMITS.line} disabled={busy} placeholder="3:00 AM to 11:00 AM Philippine time" onChange={(e) => edit(setShift)(e.target.value)} autoComplete="off" />
                  </Field>
                </div>
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <Field id="ck-offer-start" label="Start date" problem={problemFor("startDate")}>
                    <input id="ck-offer-start" type="date" className={INPUT} value={startDate} min={today} disabled={busy} onChange={(e) => edit(setStartDate)(e.target.value)} />
                  </Field>
                  <Field id="ck-offer-reply" label="Offer ends" problem={problemFor("replyBy")}>
                    <input id="ck-offer-reply" type="date" className={INPUT} value={replyBy} min={today} disabled={busy} onChange={(e) => edit(setReplyBy)(e.target.value)} />
                  </Field>
                </div>
                <Field id="ck-offer-extra" label="Anything else" hint="optional, in your own words" problem={problemFor("extra")}>
                  <textarea
                    id="ck-offer-extra"
                    className={`${INPUT} min-h-[84px] resize-y leading-snug`}
                    value={extra}
                    maxLength={OFFER_LIMITS.extra}
                    disabled={busy}
                    placeholder="A trial period, contractor terms, who they report to."
                    onChange={(e) => edit(setExtra)(e.target.value)}
                  />
                </Field>

                {editFrom || !signer.trim() || !company.trim() ? (
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <Field id="ck-offer-signer" label="Your name" problem={problemFor("signerName")}>
                      <input id="ck-offer-signer" className={INPUT} value={signer} maxLength={OFFER_LIMITS.name} disabled={busy} onChange={(e) => edit(setSigner)(e.target.value)} autoComplete="off" />
                    </Field>
                    <Field id="ck-offer-company" label="Company" problem={problemFor("companyName")}>
                      <input id="ck-offer-company" className={INPUT} value={company} maxLength={OFFER_LIMITS.name} disabled={busy} onChange={(e) => edit(setCompany)(e.target.value)} autoComplete="off" />
                    </Field>
                  </div>
                ) : (
                  <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                    From {signer.trim()}, {company.trim()}.{" "}
                    <button type="button" className="underline underline-offset-2" style={{ color: "var(--ink-2)" }} onClick={() => setEditFrom(true)}>
                      Change
                    </button>
                  </p>
                )}
              </>
            )}
          </div>

          {/* What they will read. */}
          <div className="min-w-0">
            <div className="mb-1.5 text-[12.5px] font-semibold" style={{ color: "var(--hf-text)" }}>
              The letter they will read
            </div>
            <div
              className="whitespace-pre-wrap rounded-[12px] border px-5 py-5 text-[13.5px] leading-[1.6]"
              style={{ borderColor: "var(--line)", background: "var(--hf-surface)", color: "var(--hf-text)", boxShadow: "var(--hf-shadow-soft)", opacity: person ? 1 : 0.55 }}
              aria-live="polite"
              data-offer-preview
            >
              {letter}
            </div>
            <ol className="mt-3 space-y-1 text-[12.5px] leading-snug" style={{ color: "var(--hf-text-soft)" }} data-offer-steps>
              <li>1. They get an email and sign online, by typing or drawing their name.</li>
              <li>2. You sign after them.</li>
              <li>3. You both keep a locked copy with the date and time of each signature.</li>
            </ol>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3" style={{ borderColor: "var(--line)" }}>
          <span className="min-w-0 flex-1 text-[12px] leading-snug" style={{ color: tried && problems.length > 0 ? "var(--amber-fg)" : "var(--ink-3)" }} role="status" data-offer-status>
            {busy ? "Sending. Keep this open." : status}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <button type="button" className="ck-btn ck-btn-ghost !py-2 !text-[13px]" onClick={armed && !busy ? () => setArmed(false) : onClose} disabled={busy}>
              {armed && !busy ? "Back" : "Cancel"}
            </button>
            <button type="button" className={`ck-btn !py-2 !text-[13px] ${armed || busy ? "ck-btn-primary" : "ck-btn-outline"}`} onClick={() => void run()} disabled={busy || !person} data-offer-send={armed ? "armed" : "idle"}>
              {armed || busy ? words.confirm : words.arm}
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
