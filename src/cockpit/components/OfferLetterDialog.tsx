import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { useOfferPeople, useSendOfferLetter, type OfferPerson } from "../hooks/useOfferLetter";
import {
  CURRENCIES,
  EVERY_WORDS,
  NOTICE_CHOICES,
  OFFER_DEFAULTS,
  OFFER_LIMITS,
  OFFER_REPLY_DAYS,
  REPLY_CHOICES,
  TRIAL_CHOICES,
  addDays,
  dayOf,
  longDate,
  nameCase,
  offerLetterText,
  offerProblems,
  offerWords,
  periodWords,
  termsSummary,
  type OfferLetterFields,
  type PayEvery,
  type PayPer,
  type WorkSchedule,
  type WorkerType,
} from "../lib/offerLetter";

/**
 * The offer letter, on one screen (lib/offerLetter.ts; docs/OFFER-LETTER.md).
 *
 * The owner, 2026-10-09: "do you think we should send ... the offer letter
 * through the portal?" Yes, but not through the six old screens. Then, on
 * 2026-10-10, with the first real letter in front of him: "it feels
 * incomplete ... I can't put the company name there ... I don't know if I
 * should put hours because they can change ... be a guided ... so that
 * somebody's just hiring for the first time, they understand how to write
 * this ... don't overcomplicate it."
 *
 * So it is four short steps, each with a line on what to write: the job (with
 * the company name), the pay, the usual terms for a remote support role (filled
 * in, shown as one line, changed only if they differ), and sending (how long
 * they have to sign). The letter beside the boxes is the letter they will
 * read, word for word, and it changes as he types.
 *
 * It emails the applicant, so the button is pressed twice: once to say who,
 * once to mean it. Changing anything takes the second press back.
 *
 * Portalled to <body> like the cockpit's other dialogs.
 */

const STAGE_WORDS: Record<string, string> = { interview: "Interviewed", offered: "Offer already out", reviewing: "In review" };

/** What stays the same for everyone hired into a job, kept on this device per job as a convenience only. */
interface Remembered {
  hours?: string;
  shift?: string;
  payEvery?: PayEvery;
  payMethod?: string;
  workerType?: WorkerType;
  schedule?: WorkSchedule;
  trialDays?: number;
  noticeDays?: number;
  reportsTo?: string;
  signerTitle?: string;
}

function remembered(jobId: string): Remembered {
  try {
    const raw = window.localStorage.getItem(`hf-offer-terms:${jobId}`);
    const read = raw ? (JSON.parse(raw) as Remembered) : null;
    return read && typeof read === "object" ? read : {};
  } catch {
    return {};
  }
}

function remember(jobId: string, terms: Remembered): void {
  try {
    window.localStorage.setItem(`hf-offer-terms:${jobId}`, JSON.stringify(terms));
  } catch {
    // Storage blocked: he chooses them again next time.
  }
}

// 16px on a phone: anything smaller and an iPhone zooms the page in when the box is tapped.
// The "!" is needed: .ck-input sets its own size.
const INPUT = "ck-input w-full px-3 py-2 !text-[16px] md:!text-[14px]";

function Field({ id, label, hint, help, problem, children }: { id: string; label: string; hint?: string; help?: string; problem?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-[12.5px] font-semibold" style={{ color: "var(--hf-text)" }}>
        {label}
        {hint && (
          <span className="ml-1.5 font-normal" style={{ color: "var(--ink-3)" }}>
            {hint}
          </span>
        )}
      </label>
      {children}
      {problem ? (
        <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--amber-fg)" }} data-offer-problem>
          {problem}
        </p>
      ) : (
        help && (
          <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--ink-3)" }}>
            {help}
          </p>
        )
      )}
    </div>
  );
}

/** One of a few choices, side by side. */
function Choice<T extends string | number>({ name, value, options, onChange, disabled }: { name: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex w-full rounded-[10px] p-[3px]" style={{ background: "var(--surface-2)" }}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className="min-w-0 flex-1 rounded-[8px] px-2 py-1.5 text-[13px] transition-colors"
            style={on ? { background: "var(--hf-surface)", color: "var(--hf-text)", fontWeight: 600, boxShadow: "0 1px 2px rgba(0,0,0,0.12)" } : { color: "var(--ink-2)" }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Check({ id, checked, onChange, children, disabled }: { id: string; checked: boolean; onChange: (value: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 text-[13.5px] leading-snug" style={{ color: "var(--hf-text)" }}>
      <input id={id} type="checkbox" className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--jade)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** A numbered step: the order is the order he fills it in. */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h3 className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>
        <span className="grid h-5 w-5 place-items-center rounded-full text-[11px] tracking-normal" style={{ background: "var(--jade-soft)", color: "var(--jade-soft-fg)" }}>
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** The letter as they will read it: its headings set apart, its list as a list. The words are exactly the stored text. */
function LetterPreview({ text }: { text: string }) {
  const paragraphs = text.split("\n\n");
  return (
    <>
      {paragraphs.map((paragraph, i) => {
        const lines = paragraph.split("\n");
        const heading = /^[A-Z][A-Z ]{2,24}$/.test(lines[0]) ? lines[0] : null;
        const body = heading ? lines.slice(1) : lines;
        return (
          <div key={i} className={i > 0 ? "mt-3.5" : ""}>
            {heading && (
              <div className="mb-1 text-[11px] font-semibold tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>
                {heading}
              </div>
            )}
            {body.map((line, j) =>
              line.startsWith("- ") ? (
                <div key={j} className="relative pl-4">
                  <span className="absolute left-0" aria-hidden>
                    &bull;
                  </span>
                  {line.slice(2)}
                </div>
              ) : (
                <Fragment key={j}>
                  {line}
                  {j < body.length - 1 && <br />}
                </Fragment>
              ),
            )}
          </div>
        );
      })}
    </>
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
  const [roleTitle, setRoleTitle] = useState("");
  const [company, setCompany] = useState("");
  const [startDate, setStartDate] = useState("");
  const [schedule, setSchedule] = useState<WorkSchedule>(OFFER_DEFAULTS.schedule);
  const [hours, setHours] = useState("");
  const [shift, setShift] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payCurrency, setPayCurrency] = useState<string>(OFFER_DEFAULTS.payCurrency);
  const [payPer, setPayPer] = useState<PayPer>(OFFER_DEFAULTS.payPer);
  const [payEvery, setPayEvery] = useState<PayEvery>(OFFER_DEFAULTS.payEvery);
  const [payMethod, setPayMethod] = useState("");
  const [workerType, setWorkerType] = useState<WorkerType>(OFFER_DEFAULTS.workerType);
  const [remote, setRemote] = useState<boolean>(OFFER_DEFAULTS.remote);
  const [trialDays, setTrialDays] = useState<number>(OFFER_DEFAULTS.trialDays);
  const [noticeDays, setNoticeDays] = useState<number>(OFFER_DEFAULTS.noticeDays);
  const [ownEquipment, setOwnEquipment] = useState<boolean>(OFFER_DEFAULTS.ownEquipment);
  const [privateInfo, setPrivateInfo] = useState<boolean>(OFFER_DEFAULTS.privateInfo);
  const [reportsTo, setReportsTo] = useState("");
  const [replyDays, setReplyDays] = useState<number>(OFFER_REPLY_DAYS);
  const [extra, setExtra] = useState("");
  const [signer, setSigner] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [showTerms, setShowTerms] = useState(false);
  const [editFrom, setEditFrom] = useState(false);
  const [armed, setArmed] = useState(false);
  const [tried, setTried] = useState(false);

  const person: OfferPerson | null = people.find((p) => p.applicationId === pickedId) ?? null;
  const replyBy = addDays(today, replyDays);

  // The owner's own name and company, once, when they arrive.
  useEffect(() => {
    if (!profile) return;
    setSigner((now) => now || nameCase(profile.full_name ?? ""));
    setCompany((now) => now || (profile.company_name ?? "").trim());
  }, [profile]);

  // Choosing a person fills in what is already known about them and the job.
  useEffect(() => {
    if (!person) return;
    setName(person.name === "Applicant" ? "" : person.name);
    setRoleTitle(person.jobTitle);
    setRemote(person.jobRemote);
    if (person.jobPay) {
      const pay = person.jobPay;
      setPayAmount((now) => now || pay.payAmount);
      setPayCurrency(pay.payCurrency);
      setPayPer(pay.payPer);
    }
    const kept = remembered(person.jobId);
    setHours((now) => now || kept.hours || "");
    setShift((now) => now || kept.shift || "");
    setPayMethod((now) => now || kept.payMethod || "");
    setReportsTo((now) => now || kept.reportsTo || "");
    setSignerTitle((now) => now || kept.signerTitle || "");
    if (kept.payEvery !== undefined) setPayEvery(kept.payEvery);
    if (kept.workerType) setWorkerType(kept.workerType);
    if (kept.schedule) setSchedule(kept.schedule);
    if (typeof kept.trialDays === "number") setTrialDays(kept.trialDays);
    if (typeof kept.noticeDays === "number") setNoticeDays(kept.noticeDays);
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
    roleTitle,
    companyName: company,
    signerName: signer,
    signerTitle,
    payAmount,
    payCurrency,
    payPer,
    payEvery,
    payMethod,
    workerType,
    schedule,
    hours,
    shift,
    remote,
    reportsTo,
    trialDays,
    noticeDays,
    ownEquipment,
    privateInfo,
    startDate,
    replyBy,
    extra,
    today,
  };
  const problems = offerProblems(fields);
  const problemFor = (field: keyof OfferLetterFields) => (tried ? problems.find((p) => p.field === field)?.text : undefined);
  const words = offerWords(fields, send.isPending, armed);
  const letter = offerLetterText(fields);
  const termsProblem = ["reportsTo"].map((f) => problemFor(f as keyof OfferLetterFields)).find(Boolean);

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
      if (termsProblem) setShowTerms(true);
      return;
    }
    if (!armed) {
      setArmed(true);
      return;
    }
    try {
      const sent = await send.mutateAsync({ person, fields });
      remember(person.jobId, { hours: hours.trim(), shift: shift.trim(), payEvery, payMethod: payMethod.trim(), workerType, schedule, trialDays, noticeDays, reportsTo: reportsTo.trim(), signerTitle: signerTitle.trim() });
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
        className="ck-card relative flex max-h-[calc(100dvh-24px)] w-full max-w-[1040px] flex-col p-0"
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
            Four short steps. The usual terms for a remote role are filled in; change anything that is different for you.
          </p>
        </div>

        <div className="ck-scroll grid min-h-0 flex-1 gap-x-6 gap-y-5 overflow-y-auto px-5 pb-5 pt-4 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]" data-offer-body>
          {/* What he fills in. */}
          <div className="flex min-w-0 flex-col gap-5">
            {person ? (
              <div className="flex items-center gap-3 rounded-[12px] border px-3 py-2.5" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} data-offer-person>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>
                    {person.name}
                  </div>
                  <div className="truncate text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {[STAGE_WORDS[person.status], person.jobTitle].filter(Boolean).join(" · ")}
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
                <Step n={1} title="The job">
                  <Field id="ck-offer-name" label="Their name" problem={problemFor("applicantName")}>
                    <input id="ck-offer-name" className={INPUT} value={name} maxLength={OFFER_LIMITS.name} disabled={busy} onChange={(e) => edit(setName)(e.target.value)} autoComplete="off" />
                  </Field>
                  <Field id="ck-offer-role" label="Job title" problem={problemFor("roleTitle")} help="As it should read on the letter.">
                    <input id="ck-offer-role" className={INPUT} value={roleTitle} maxLength={OFFER_LIMITS.line} disabled={busy} onChange={(e) => edit(setRoleTitle)(e.target.value)} autoComplete="off" />
                  </Field>
                  <Field id="ck-offer-company" label="Company name" problem={problemFor("companyName")} help="The business they will work for. Use your registered business name if you have one.">
                    <input id="ck-offer-company" className={INPUT} value={company} maxLength={OFFER_LIMITS.name} disabled={busy} placeholder="Zulu Support Team" onChange={(e) => edit(setCompany)(e.target.value)} autoComplete="organization" />
                  </Field>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <Field id="ck-offer-start" label="Start date" problem={problemFor("startDate")} help="Their first working day.">
                      <input id="ck-offer-start" type="date" className={INPUT} value={startDate} min={today} disabled={busy} onChange={(e) => edit(setStartDate)(e.target.value)} />
                    </Field>
                    <Field id="ck-offer-schedule" label="Full or part time">
                      <Choice<WorkSchedule> name="Full or part time" value={schedule} disabled={busy} onChange={edit(setSchedule)} options={[{ value: "full", label: "Full-time" }, { value: "part", label: "Part-time" }]} />
                    </Field>
                  </div>
                  <Field id="ck-offer-hours" label="Hours" hint="optional" problem={problemFor("hours")} help="If they can change, keep it general, like about 40 hours a week. The letter says hours may change, with notice.">
                    <input id="ck-offer-hours" className={INPUT} value={hours} maxLength={OFFER_LIMITS.line} disabled={busy} placeholder="About 40 hours a week, 5 days a week" onChange={(e) => edit(setHours)(e.target.value)} autoComplete="off" />
                  </Field>
                  <Field id="ck-offer-shift" label="Shift" hint="optional" problem={problemFor("shift")} help="With the time zone, so nobody reads it on the wrong clock.">
                    <input id="ck-offer-shift" className={INPUT} value={shift} maxLength={OFFER_LIMITS.line} disabled={busy} placeholder="3:00 AM to 11:00 AM Philippine time" onChange={(e) => edit(setShift)(e.target.value)} autoComplete="off" />
                  </Field>
                </Step>

                <Step n={2} title="Pay">
                  <Field id="ck-offer-pay" label="Pay" problem={problemFor("payAmount")}>
                    <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1fr)] gap-2">
                      <input id="ck-offer-pay" className={INPUT} value={payAmount} inputMode="decimal" disabled={busy} placeholder="500" onChange={(e) => edit(setPayAmount)(e.target.value)} autoComplete="off" aria-label="Amount" />
                      <select className={INPUT} value={payCurrency} disabled={busy} onChange={(e) => edit(setPayCurrency)(e.target.value)} aria-label="Currency">
                        {(CURRENCIES as readonly string[]).includes(payCurrency) ? null : <option value={payCurrency}>{payCurrency}</option>}
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <select className={INPUT} value={payPer} disabled={busy} onChange={(e) => edit(setPayPer)(e.target.value as PayPer)} aria-label="Per">
                        <option value="month">a month</option>
                        <option value="week">a week</option>
                        <option value="hour">an hour</option>
                      </select>
                    </div>
                  </Field>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    <Field id="ck-offer-every" label="Paid" help="Twice a month is usual for remote workers in the Philippines.">
                      <select id="ck-offer-every" className={INPUT} value={payEvery} disabled={busy} onChange={(e) => edit(setPayEvery)(e.target.value as PayEvery)}>
                        {(Object.keys(EVERY_WORDS) as Array<Exclude<PayEvery, "">>).map((key) => (
                          <option key={key} value={key}>
                            {EVERY_WORDS[key].replace(/^./, (c) => c.toUpperCase())}
                          </option>
                        ))}
                        <option value="">Leave it out</option>
                      </select>
                    </Field>
                    <Field id="ck-offer-method" label="Paid by" hint="optional" problem={problemFor("payMethod")}>
                      <input id="ck-offer-method" className={INPUT} value={payMethod} maxLength={OFFER_LIMITS.line} disabled={busy} placeholder="Wise or bank transfer" onChange={(e) => edit(setPayMethod)(e.target.value)} autoComplete="off" />
                    </Field>
                  </div>
                </Step>

                <Step n={3} title="Terms">
                  {!showTerms ? (
                    <div className="rounded-[12px] border px-3.5 py-3" style={{ borderColor: "var(--line)" }} data-offer-terms="summary">
                      <p className="text-[13.5px] leading-snug" style={{ color: "var(--hf-text)" }}>
                        {termsSummary(fields)}
                      </p>
                      <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--ink-3)" }}>
                        The usual terms for a remote support role.{" "}
                        <button type="button" className="underline underline-offset-2" style={{ color: "var(--ink-2)" }} onClick={() => setShowTerms(true)} disabled={busy}>
                          Change
                        </button>
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3.5" data-offer-terms="open">
                      <Field id="ck-offer-worker" label="Working as" help="Most remote hires in another country are contractors and handle their own taxes. Choose employee only if you run payroll for them.">
                        <Choice<WorkerType> name="Working as" value={workerType} disabled={busy} onChange={edit(setWorkerType)} options={[{ value: "contractor", label: "Independent contractor" }, { value: "employee", label: "Employee" }]} />
                      </Field>
                      <div className="grid gap-3.5 sm:grid-cols-2">
                        <Field id="ck-offer-trial" label="Trial period" help="Lets either side end it quickly if it is not a fit.">
                          <select id="ck-offer-trial" className={INPUT} value={trialDays} disabled={busy} onChange={(e) => edit(setTrialDays)(Number(e.target.value))}>
                            {TRIAL_CHOICES.map((d) => (
                              <option key={d} value={d}>
                                {d ? periodWords(d) : "No trial period"}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field id="ck-offer-notice" label="Notice to end" help="How much warning either side gives.">
                          <select id="ck-offer-notice" className={INPUT} value={noticeDays} disabled={busy} onChange={(e) => edit(setNoticeDays)(Number(e.target.value))}>
                            {NOTICE_CHOICES.map((d) => (
                              <option key={d} value={d}>
                                {d} days
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Check id="ck-offer-remote" checked={remote} disabled={busy} onChange={edit(setRemote)}>
                          Remote, working from home
                        </Check>
                        <Check id="ck-offer-equipment" checked={ownEquipment} disabled={busy} onChange={edit(setOwnEquipment)}>
                          They use their own computer and internet
                        </Check>
                        <Check id="ck-offer-private" checked={privateInfo} disabled={busy} onChange={edit(setPrivateInfo)}>
                          They keep company and customer information private
                        </Check>
                      </div>
                      <Field id="ck-offer-reports" label="Reports to" hint="optional" problem={problemFor("reportsTo")}>
                        <input id="ck-offer-reports" className={INPUT} value={reportsTo} maxLength={OFFER_LIMITS.name} disabled={busy} placeholder="Zack, Owner" onChange={(e) => edit(setReportsTo)(e.target.value)} autoComplete="off" />
                      </Field>
                      <button type="button" className="self-start text-[12.5px] underline underline-offset-2" style={{ color: "var(--ink-2)" }} onClick={() => setShowTerms(false)} disabled={busy}>
                        Done
                      </button>
                    </div>
                  )}
                </Step>

                <Step n={4} title="Sending">
                  <Field id="ck-offer-reply" label="Time to sign" problem={problemFor("replyBy")} help={`Until ${longDate(replyBy)}. Enough time to read it, without leaving the job open for weeks.`}>
                    <Choice<number> name="Time to sign" value={replyDays} disabled={busy} onChange={edit(setReplyDays)} options={REPLY_CHOICES.map((d) => ({ value: d, label: `${d} days` }))} />
                  </Field>
                  <Field id="ck-offer-extra" label="Anything else" hint="optional, in your own words" problem={problemFor("extra")}>
                    <textarea
                      id="ck-offer-extra"
                      className={`${INPUT} min-h-[72px] resize-y leading-snug`}
                      value={extra}
                      maxLength={OFFER_LIMITS.extra}
                      disabled={busy}
                      placeholder="A bonus, paid time off, who to message on the first day."
                      onChange={(e) => edit(setExtra)(e.target.value)}
                    />
                  </Field>
                  {editFrom || !signer.trim() ? (
                    <div className="grid gap-3.5 sm:grid-cols-2">
                      <Field id="ck-offer-signer" label="Your name" problem={problemFor("signerName")}>
                        <input id="ck-offer-signer" className={INPUT} value={signer} maxLength={OFFER_LIMITS.name} disabled={busy} onChange={(e) => edit(setSigner)(e.target.value)} autoComplete="name" />
                      </Field>
                      <Field id="ck-offer-title" label="Your title" hint="optional" problem={problemFor("signerTitle")}>
                        <input id="ck-offer-title" className={INPUT} value={signerTitle} maxLength={OFFER_LIMITS.name} disabled={busy} placeholder="Owner" onChange={(e) => edit(setSignerTitle)(e.target.value)} autoComplete="organization-title" />
                      </Field>
                    </div>
                  ) : (
                    <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                      Signed by {[nameCase(signer), signerTitle.trim()].filter(Boolean).join(", ")}.{" "}
                      <button type="button" className="underline underline-offset-2" style={{ color: "var(--ink-2)" }} onClick={() => setEditFrom(true)}>
                        {signerTitle.trim() ? "Change" : "Add your title"}
                      </button>
                    </p>
                  )}
                </Step>

                <p className="text-[11.5px] leading-snug" style={{ color: "var(--ink-3)" }}>
                  A plain-language letter, not legal advice. Add anything unusual in your own words.
                </p>
              </>
            )}
          </div>

          {/* What they will read. */}
          <div className="min-w-0 md:sticky md:top-0 md:self-start">
            <div className="mb-1.5 text-[12.5px] font-semibold" style={{ color: "var(--hf-text)" }}>
              The letter they will read
            </div>
            <div
              className="rounded-[12px] border px-5 py-5 text-[13.5px] leading-[1.6]"
              style={{ borderColor: "var(--line)", background: "var(--hf-surface)", color: "var(--hf-text)", boxShadow: "var(--hf-shadow-soft)", opacity: person ? 1 : 0.55 }}
              aria-live="polite"
              data-offer-preview
            >
              <LetterPreview text={letter} />
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
