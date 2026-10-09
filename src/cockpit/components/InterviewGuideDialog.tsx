import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { Copy, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import AvaSeal from "@/components/ava/AvaSeal";
import {
  GUIDE_RATING_MAX,
  GUIDE_SOURCE_LABELS,
  INTERVIEW_GUIDE_MINUTES,
  RATING_LIMITS,
  earlierRatings,
  guideAnswerKeys,
  guideAsText,
  guideMarkKey,
  guideQuestionKey,
  interviewPlanFor,
  ratingsSummary,
  type GuideQuestion,
  type GuideRating,
  type PersonalQuestion,
} from "@/lib/interviewGuide";
import { GUIDE_WRITE_WORDS, useInterviewGuide } from "../hooks/useInterviewGuide";
import { RATINGS_SAVE_WORDS, useInterviewRatings } from "../hooks/useInterviewRatings";

/**
 * The interview guide: one page the owner reads before and during a live
 * interview with an applicant (src/lib/interviewGuide.ts; docs/INTERVIEWS.md).
 *
 * The owner, 2026-10-07: "make a system inside that could generate important
 * questionnaires for the interview … maybe I just start with why should we
 * hire you … I'm more concerned about the thing is constant change … team
 * leadership."
 *
 * Everything the owner needs is on the page at rest, in the order the half
 * hour runs: nothing is folded away, because it is read during a call. The
 * plan (the opening question, the ones everyone gets, the close, what to mark
 * afterwards) shows at once. The part written for this one applicant is asked
 * for with one button and kept, so opening the guide again costs nothing.
 *
 * It is also where he writes during the call (2026-10-09: "give me a button
 * that I could rate all of these answers from 1 to 10 here in the interview
 * guide, that way I don't need a separate piece of paper ... and I could
 * probably write extra notes here as well"): under every question, ten
 * numbers and a notes box. There is no Save button: a tap or a word is kept
 * a moment after he stops (hooks/useInterviewRatings.ts), and the foot of
 * the guide says so. Only the hiring team can ever read them.
 *
 * Portalled to <body> like the cockpit's other dialogs: the entrance
 * animations leave a transform on an ancestor, which would trap a fixed
 * element inside the page column.
 */

function SectionTitle({ children, minutes }: { children: ReactNode; minutes?: number }) {
  return (
    <div className="mt-6 flex items-baseline justify-between gap-3">
      <h3 className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: "var(--ink-3)" }}>
        {children}
      </h3>
      {minutes != null && (
        <span className="shrink-0 text-[11px]" style={{ color: "var(--ink-3)" }}>
          about {minutes} min
        </span>
      )}
    </div>
  );
}

/** What a question card needs to let its answer be rated. */
interface Rating {
  mine: GuideRating | undefined;
  /** False until what was saved before has been read. */
  ready: boolean;
  onRate: (score: number) => void;
  onNote: (note: string) => void;
}

/**
 * Ten numbers. The one chosen is solid and the ones under it are tinted, so a
 * rating reads as a level at a glance. Tapping the chosen one takes it away.
 * Two rows of five on a phone: ten in one row there are too narrow to hit
 * while talking.
 */
function RatingNumbers({ value, label, disabled, onRate }: { value: number | null; label: string; disabled: boolean; onRate: (score: number) => void }) {
  return (
    <div role="group" aria-label={label} className="mt-1.5 grid grid-cols-5 gap-1 sm:grid-cols-10" data-guide-rating>
      {Array.from({ length: GUIDE_RATING_MAX }, (_, i) => i + 1).map((score) => {
        const chosen = value === score;
        const under = value !== null && score < value;
        return (
          <button
            key={score}
            type="button"
            aria-pressed={chosen}
            aria-label={`${score} out of ${GUIDE_RATING_MAX}`}
            disabled={disabled}
            onClick={() => onRate(score)}
            className="h-9 rounded-[9px] border text-[13px] font-semibold tabular-nums transition-colors hover:border-[var(--jade)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--jade)] disabled:opacity-50 sm:h-8"
            style={
              chosen
                ? { background: "var(--jade)", borderColor: "var(--jade)", color: "var(--btn-fg)" }
                : under
                  ? { background: "var(--jade-soft)", borderColor: "transparent", color: "var(--jade-soft-fg)" }
                  : { background: "transparent", borderColor: "var(--line)", color: "var(--ink-2)" }
            }
            data-chosen={chosen || undefined}
          >
            {score}
          </button>
        );
      })}
    </div>
  );
}

/** A notes box as tall as what is in it: one line when empty, growing as he types. */
function NotesBox({ value, placeholder, label, max, disabled, onChange }: { value: string; placeholder: string; label: string; max: number; disabled: boolean; onChange: (text: string) => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(Math.max(box.scrollHeight, 38), 260)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={max}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      // 16px on a phone: an iPhone zooms the page in on a field with smaller text.
      className="ck-input mt-2 block w-full resize-none px-3 py-2 !text-[16px] leading-[1.45] disabled:opacity-50 md:!text-[13px]"
      data-guide-note
    />
  );
}

/** The interviewer's own part of a card: the rating and the notes for one answer. */
function MyRating({ rating, label, notesHint = "Notes on this answer" }: { rating: Rating; label: string; notesHint?: string }) {
  const score = rating.mine?.score ?? null;
  return (
    <div className="mt-3 border-t pt-2.5" style={{ borderColor: "var(--line-soft)" }} data-guide-mine>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
          Your rating
        </span>
        <span className="text-[12px] tabular-nums" style={{ color: score !== null ? "var(--hf-text)" : "var(--ink-3)" }} data-guide-score>
          {score !== null ? `${score} / ${GUIDE_RATING_MAX}` : "Tap a number"}
        </span>
      </div>
      <RatingNumbers value={score} label={`Your rating for: ${label}`} disabled={!rating.ready} onRate={rating.onRate} />
      <NotesBox
        value={rating.mine?.note ?? ""}
        placeholder={notesHint}
        label={`Your notes on: ${label}`}
        max={RATING_LIMITS.note}
        disabled={!rating.ready}
        onChange={rating.onNote}
      />
    </div>
  );
}

function QuestionCard({ n, q, rating }: { n: number; q: GuideQuestion | PersonalQuestion; rating: Rating }) {
  const personal = "source" in q ? q : null;
  return (
    <li
      className="rounded-[12px] border px-3.5 py-3"
      style={{ borderColor: "var(--line)", background: "var(--surface-1, transparent)" }}
      data-guide-question={personal ? "personal" : "plan"}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold"
          style={{ background: "var(--jade-soft)", color: "var(--jade-soft-fg)" }}
          aria-hidden
        >
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold leading-snug" style={{ color: "var(--hf-text)" }}>
            {q.question}
          </p>
          {personal?.quote && (
            <p
              className="mt-2 border-l-2 pl-2.5 text-[12.5px] italic leading-snug"
              style={{ borderColor: "var(--brass-line, var(--line))", color: "var(--hf-text-soft)" }}
            >
              Their words: “{personal.quote}”
            </p>
          )}
          <dl className="mt-2 space-y-1 text-[12.5px] leading-snug">
            {personal && (
              <div>
                <dt className="inline font-semibold" style={{ color: "var(--ink-2)" }}>
                  Why ask ({GUIDE_SOURCE_LABELS[personal.source].toLowerCase()}):{" "}
                </dt>
                <dd className="inline" style={{ color: "var(--hf-text-soft)" }}>
                  {personal.why}
                </dd>
              </div>
            )}
            <div>
              <dt className="inline font-semibold" style={{ color: "var(--jade)" }}>
                Listen for:{" "}
              </dt>
              <dd className="inline" style={{ color: "var(--hf-text-soft)" }}>
                {q.listenFor}
              </dd>
            </div>
            <div>
              <dt className="inline font-semibold" style={{ color: "var(--amber-fg)" }}>
                Red flag:{" "}
              </dt>
              <dd className="inline" style={{ color: "var(--hf-text-soft)" }}>
                {q.redFlag}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <MyRating rating={rating} label={q.question} />
    </li>
  );
}

export function InterviewGuideDialog({
  open,
  applicationId,
  applicantName,
  jobTitle,
  onClose,
}: {
  open: boolean;
  applicationId: string | null;
  applicantName: string;
  jobTitle?: string | null;
  onClose: () => void;
}) {
  const { record, isLoading, write, isWriting, writeFailure } = useInterviewGuide(applicationId, open);
  const { ratings, ready, loadFailed, state: saveState, setScore, setNote, setOverallNote, flush } = useInterviewRatings(applicationId, open);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const first = applicantName.trim().split(/\s+/)[0] || "them";
  const plan = useMemo(() => interviewPlanFor(record?.family), [record?.family]);
  const personal = record?.personal ?? null;
  const stageMinutes = (title: string) => plan.stages.find((s) => s.title === title)?.minutes;
  const summary = useMemo(() => ratingsSummary(ratings, guideAnswerKeys(plan, personal)), [ratings, plan, personal]);
  const earlier = useMemo(() => earlierRatings(ratings, plan, personal), [ratings, plan, personal]);
  // Closing is also "send what I have not sent yet".
  const close = () => {
    flush();
    onClose();
  };
  const ratingFor = (key: string, question: string) => ({
    mine: ratings.answers[key],
    ready,
    onRate: (score: number) => setScore(key, score, question),
    onNote: (note: string) => setNote(key, note, question),
  });
  const rate = (q: GuideQuestion | PersonalQuestion) => ratingFor(guideQuestionKey(q), q.question);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => closeRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      flush();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, flush]);

  if (!open || typeof document === "undefined") return null;

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(guideAsText(plan, personal, applicantName.trim() || "the applicant", ratings));
      toast.success("Guide copied");
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  };

  const writePersonal = () => {
    // The failure is worded in the dialog (writeFailure); nothing to do here.
    void write().catch(() => {});
  };

  // One running number across the whole guide, in the order it is asked.
  let n = 0;
  const next = () => (n += 1);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--hf-bg) 70%, transparent)", backdropFilter: "blur(2px)" }}
        onClick={close}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ck-interview-guide-title"
        data-interview-guide
        className="ck-card relative flex max-h-[calc(100dvh-32px)] w-full max-w-[720px] flex-col p-0"
        style={{ animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both" }}
      >
        {/* ── Head ── */}
        <div className="border-b px-5 pb-3.5 pt-5" style={{ borderColor: "var(--line)" }}>
          <button ref={closeRef} onClick={close} className="absolute right-3 top-3 p-1" style={{ color: "var(--hf-text-muted)" }} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
          <h2 id="ck-interview-guide-title" className="pr-8 font-display text-[19px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
            Interview guide
          </h2>
          <p className="mt-0.5 pr-8 text-[13px]" style={{ color: "var(--hf-text-soft)" }}>
            {applicantName}
            {jobTitle ? ` · ${jobTitle}` : ""} · {INTERVIEW_GUIDE_MINUTES} minutes
          </p>
        </div>

        {/* ── The guide, in the order the half hour runs ── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5" data-guide-body>
          {/* Which plan fits the job is read first (a moment), so the page never
              shows one set of questions and then swaps it for another. */}
          {isLoading ? (
            <p className="flex items-center gap-2 py-10 text-[13px]" style={{ color: "var(--hf-text-soft)" }} data-guide-loading>
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--jade)" }} aria-hidden />
              Opening the guide…
            </p>
          ) : (
          <>
          {/* The half hour at a glance. */}
          <ol className="mt-4 flex flex-wrap gap-1.5" aria-label="How the half hour runs">
            {plan.stages.map((stage) => (
              <li
                key={stage.title}
                className="rounded-full px-2.5 py-1 text-[11.5px] font-medium"
                style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}
              >
                {stage.title} · {stage.minutes} min
              </li>
            ))}
          </ol>

          {personal && personal.atAGlance.length > 0 && (
            <>
              <SectionTitle>Before the call: {first} on paper</SectionTitle>
              <ul className="mt-2 space-y-1.5 text-[13px] leading-snug" style={{ color: "var(--hf-text)" }} data-guide-glance>
                {personal.atAGlance.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden style={{ color: "var(--ink-3)" }}>
                      •
                    </span>
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {loadFailed && (
            <p className="mt-4 text-[12.5px] leading-snug" style={{ color: "var(--amber-fg)" }} role="status" data-guide-ratings-unread>
              Your earlier ratings for {first} could not be read, so rating is off for now. Close the guide and open it again.
            </p>
          )}

          <SectionTitle minutes={stageMinutes("Welcome")}>Welcome</SectionTitle>
          <p className="mt-2 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
            Say something like:
          </p>
          <p
            className="mt-1 border-l-2 pl-3 text-[14px] leading-relaxed"
            style={{ borderColor: "var(--brass-line, var(--line))", color: "var(--hf-text)" }}
            data-guide-welcome
          >
            “{plan.welcome}”
          </p>

          <SectionTitle minutes={stageMinutes("Opening question")}>Open with</SectionTitle>
          <ol className="mt-2 space-y-2">
            <QuestionCard n={next()} q={plan.opener} rating={rate(plan.opener)} />
          </ol>

          <SectionTitle minutes={stageMinutes("Questions everyone gets")}>Ask everyone</SectionTitle>
          {plan.alreadyAsked.length > 0 && (
            <div className="mt-2 rounded-[10px] px-3 py-2.5 text-[12px] leading-snug" style={{ background: "var(--surface-2)", color: "var(--hf-text-soft)" }} data-guide-already>
              <p className="font-semibold" style={{ color: "var(--ink-2)" }}>
                Not asked again. {first} already answered these on the form and in the written interview:
              </p>
              <ul className="mt-1 space-y-0.5">
                {plan.alreadyAsked.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden style={{ color: "var(--ink-3)" }}>
                      •
                    </span>
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5">Go back to one only if an answer left you with a question. “Ask {first}” below does that from their own answers.</p>
            </div>
          )}
          <ol className="mt-2 space-y-2">
            {plan.core.map((q) => (
              <QuestionCard key={q.id} n={next()} q={q} rating={rate(q)} />
            ))}
          </ol>

          <SectionTitle minutes={stageMinutes("Questions for this person")}>Ask {first}</SectionTitle>
          {personal ? (
            <ol className="mt-2 space-y-2" data-guide-personal>
              {personal.questions.map((q) => (
                <QuestionCard key={q.question} n={next()} q={q} rating={rate(q)} />
              ))}
            </ol>
          ) : (
            <div className="mt-2 rounded-[12px] border px-3.5 py-3.5" style={{ borderColor: "var(--hf-border-strong, var(--line))" }} data-guide-write-card>
              <div className="flex items-start gap-3">
                <span className="shrink-0">
                  <AvaSeal size={26} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold leading-snug" style={{ color: "var(--hf-text)" }}>
                    {isWriting ? `Reading ${first}'s application and results…` : `Three questions only ${first} should be asked`}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--hf-text-soft)" }}>
                    {isWriting
                      ? "This takes about half a minute. You can keep reading the guide."
                      : `I'll read ${first}'s application and test results and write them, with what to listen for. They are kept here; ${first} never sees them.`}
                  </p>
                  {!isWriting && (
                    <button
                      type="button"
                      className="ck-btn ck-btn-primary mt-3 !py-2 !text-[12.5px]"
                      onClick={writePersonal}
                      disabled={isLoading || record?.deployed === false}
                      data-guide-write
                    >
                      Write {first}'s questions
                    </button>
                  )}
                  {isWriting && <Loader2 className="mt-3 h-4 w-4 animate-spin" style={{ color: "var(--jade)" }} aria-label="Writing" />}
                </div>
              </div>
            </div>
          )}
          {(writeFailure || record?.deployed === false) && !isWriting && (
            <p className="mt-2 text-[12.5px] leading-snug" style={{ color: "var(--amber-fg)" }} role="status" data-guide-write-failure>
              {GUIDE_WRITE_WORDS[writeFailure ?? "not_deployed"]}
            </p>
          )}

          <SectionTitle minutes={stageMinutes("Their questions and next steps")}>Before you finish</SectionTitle>
          <ol className="mt-2 space-y-2">
            {plan.close.map((q) => (
              <QuestionCard key={q.id} n={next()} q={q} rating={rate(q)} />
            ))}
          </ol>
          {personal && personal.confirm.length > 0 && (
            <>
              <p className="mt-3 text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
                Confirm in passing
              </p>
              <ul className="mt-1 space-y-1 text-[12.5px] leading-snug" style={{ color: "var(--hf-text-soft)" }} data-guide-confirm>
                {personal.confirm.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden style={{ color: "var(--ink-3)" }}>
                      •
                    </span>
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 text-[12.5px] leading-snug" style={{ color: "var(--hf-text-soft)" }}>
            Then tell them what happens next and when they will hear from you.
          </p>

          <SectionTitle>Right after the call</SectionTitle>
          <ul className="mt-2 space-y-2" data-guide-marks>
            {plan.marks.map((mark) => (
              <li key={mark.id} className="rounded-[12px] border px-3.5 py-3" style={{ borderColor: "var(--line)" }} data-guide-mark>
                <p className="text-[14px] font-semibold leading-snug" style={{ color: "var(--hf-text)" }}>
                  {mark.label}
                </p>
                <MyRating rating={ratingFor(guideMarkKey(mark), mark.label)} label={mark.label} notesHint="Notes on this" />
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[12px] px-3.5 py-3" style={{ background: "var(--surface-2)" }} data-guide-average>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
              Your average
            </span>
            <span className="font-display text-[26px] leading-none tabular-nums" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
              {summary.average !== null ? summary.average.toFixed(1) : "–"}
              <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
                {" "}
                / {GUIDE_RATING_MAX}
              </span>
            </span>
            <span className="text-[12px]" style={{ color: "var(--hf-text-soft)" }}>
              {summary.rated === 0 ? "Rate an answer and it adds up here." : `${summary.rated} of ${summary.of} answers rated`}
            </span>
          </div>

          <p className="mt-4 text-[13.5px] font-semibold leading-snug" style={{ color: "var(--hf-text)" }}>
            {plan.verdict}
          </p>
          <NotesBox
            value={ratings.overallNote}
            placeholder={`Your overall notes on ${first}`}
            label={`Your overall notes on ${first}`}
            max={RATING_LIMITS.overallNote}
            disabled={!ready}
            onChange={setOverallNote}
          />

          {earlier.length > 0 && (
            <>
              <p className="mt-4 text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
                Rated earlier, on questions that have since been rewritten
              </p>
              <ul className="mt-1 space-y-1.5 text-[12.5px] leading-snug" style={{ color: "var(--hf-text-soft)" }} data-guide-earlier>
                {earlier.map((r) => (
                  <li key={r.question}>
                    <span style={{ color: "var(--hf-text)" }}>{r.question}</span>
                    {r.score !== null && <span className="tabular-nums"> · {r.score} / {GUIDE_RATING_MAX}</span>}
                    {r.note.trim() && <span> · {r.note.trim()}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          </>
          )}
        </div>

        {/* ── Foot ── */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3" style={{ borderColor: "var(--line)" }}>
          {saveState !== "idle" ? (
            <span
              className="min-w-0 text-[11.5px]"
              style={{ color: saveState === "saving" || saveState === "saved" ? "var(--ink-3)" : "var(--amber-fg)" }}
              role="status"
              data-guide-saved={saveState}
            >
              {RATINGS_SAVE_WORDS[saveState]}
            </span>
          ) : (
            <span className="min-w-0 text-[11.5px]" style={{ color: "var(--ink-3)" }} data-guide-written>
              {personal && record?.generatedAt
                ? `${first}'s questions written ${format(new Date(record.generatedAt), "MMM d 'at' h:mm a")}`
                : "Your ratings and notes are kept as you go. Only your team can see them."}
            </span>
          )}
          <span className="flex shrink-0 items-center gap-2">
            {personal && (
              <button type="button" className="ck-btn ck-btn-ghost !py-2 !text-[12px]" onClick={writePersonal} disabled={isWriting} data-guide-rewrite>
                {isWriting ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="mr-1 inline h-3.5 w-3.5" aria-hidden />}
                {isWriting ? "Writing…" : `Write ${first}'s again`}
              </button>
            )}
            <button type="button" className="ck-btn ck-btn-outline !py-2 !text-[12px]" onClick={copyAll} disabled={isLoading} data-guide-copy>
              <Copy className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              Copy all
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
