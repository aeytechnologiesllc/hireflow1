import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { Copy, Loader2, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import AvaSeal from "@/components/ava/AvaSeal";
import {
  GUIDE_RATING_MAX,
  GUIDE_SOURCE_LABELS,
  INTERVIEW_GUIDE_MINUTES,
  NO_PLAN_EDITS,
  PLAN_EDIT_LIMITS,
  RATING_LIMITS,
  applyPlanEdits,
  earlierRatings,
  editedPart,
  guideAnswerKeys,
  guideAsText,
  guideMarkKey,
  guideQuestionKey,
  interviewPlanFor,
  planEditsAreEmpty,
  ratingsSummary,
  removedQuestions,
  withNewQuestion,
  withOriginalWords,
  withQuestionBack,
  withQuestionPart,
  withWelcome,
  withoutQuestion,
  type GuideQuestion,
  type GuideRating,
  type InterviewPlan,
  type PersonalQuestion,
  type PlanEdits,
  type QuestionPart,
} from "@/lib/interviewGuide";
import { interviewScore } from "../lib/interviewScore";
import { GUIDE_WRITE_WORDS, PLAN_SAVE_WORDS, useInterviewGuide, type PlanSaveFailure } from "../hooks/useInterviewGuide";
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
 * And it can be changed (2026-10-09: "why don't you also allow me to edit the
 * interview guide"): "Edit questions" turns the same page into boxes: the
 * welcome, every question with what to listen for and the red flag, a
 * question of his own added, one he does not use taken out and put back.
 * The changes are the JOB's (public.interview_plans), so everyone interviewed
 * for it is asked the same set and the ratings can still be compared.
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
            {q.listenFor && (
              <div>
                <dt className="inline font-semibold" style={{ color: "var(--jade)" }}>
                  Listen for:{" "}
                </dt>
                <dd className="inline" style={{ color: "var(--hf-text-soft)" }}>
                  {q.listenFor}
                </dd>
              </div>
            )}
            {q.redFlag && (
              <div>
                <dt className="inline font-semibold" style={{ color: "var(--amber-fg)" }}>
                  Red flag:{" "}
                </dt>
                <dd className="inline" style={{ color: "var(--hf-text-soft)" }}>
                  {q.redFlag}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
      <MyRating rating={rating} label={q.question} />
    </li>
  );
}

/** A box as tall as what is in it, for changing a line of the plan. */
function EditBox({ label, value, max, placeholder, strong, onChange }: { label: string; value: string; max: number; placeholder?: string; strong?: boolean; onChange: (text: string) => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.max(box.scrollHeight, 38)}px`;
  }, [value]);
  return (
    <label className="block">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ink-3)" }}>
        {label}
      </span>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        // 16px on a phone: an iPhone zooms the page in on a field with smaller text.
        className={`ck-input mt-1 block w-full resize-none px-3 py-2 leading-[1.45] !text-[16px] ${strong ? "font-semibold md:!text-[14px]" : "md:!text-[13px]"}`}
        data-plan-box={label}
      />
    </label>
  );
}

/** One question while the plan is being changed: its words, what to listen for, the red flag. */
function QuestionEditor({
  id,
  base,
  edits,
  removable,
  onEdits,
}: {
  id: string;
  base: InterviewPlan;
  edits: PlanEdits;
  /** False for the opening question: it can be reworded, not taken out. */
  removable: boolean;
  onEdits: (next: PlanEdits) => void;
}) {
  const own = edits.added.some((a) => a.id === id);
  const reworded = !own && !!edits.changed[id];
  const box = (part: QuestionPart, label: string, strong = false, placeholder?: string) => (
    <EditBox
      label={label}
      strong={strong}
      placeholder={placeholder}
      max={part === "question" ? PLAN_EDIT_LIMITS.question : PLAN_EDIT_LIMITS.line}
      value={editedPart(base, edits, id, part)}
      onChange={(text) => onEdits(withQuestionPart(base, edits, id, part, text))}
    />
  );
  return (
    <li className="space-y-2.5 rounded-[12px] border px-3.5 py-3" style={{ borderColor: own ? "var(--jade)" : "var(--line)" }} data-plan-question={own ? "own" : "plan"} data-plan-id={id}>
      {box("question", own ? "Your question" : "Question", true, "Write it the way you would say it")}
      {box("listenFor", "Listen for", false, own ? "Optional: what a good answer sounds like" : undefined)}
      {box("redFlag", "Red flag", false, own ? "Optional: what should worry you" : undefined)}
      {(removable || reworded) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
          {reworded && (
            <button type="button" className="underline underline-offset-2" style={{ color: "var(--ink-2)" }} onClick={() => onEdits(withOriginalWords(edits, id))} data-plan-original>
              Back to the original words
            </button>
          )}
          {removable && (
            <button type="button" className="underline underline-offset-2" style={{ color: "var(--hf-danger)" }} onClick={() => onEdits(withoutQuestion(base, edits, id))} data-plan-remove>
              {own ? "Delete this question" : "Do not ask this one"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** The built-in questions taken out of a section, each with a way back. */
function TakenOut({ questions, edits, onEdits }: { questions: GuideQuestion[]; edits: PlanEdits; onEdits: (next: PlanEdits) => void }) {
  if (questions.length === 0) return null;
  return (
    <div className="mt-2 rounded-[10px] px-3 py-2.5 text-[12.5px] leading-snug" style={{ background: "var(--surface-2)", color: "var(--hf-text-soft)" }} data-plan-taken-out>
      <p className="font-semibold" style={{ color: "var(--ink-2)" }}>
        Not asked for this job
      </p>
      <ul className="mt-1 space-y-1.5">
        {questions.map((q) => (
          <li key={q.id} className="flex items-start justify-between gap-3">
            <span className="min-w-0">{q.question}</span>
            <button type="button" className="shrink-0 underline underline-offset-2" style={{ color: "var(--jade)" }} onClick={() => onEdits(withQuestionBack(edits, q.id))} data-plan-back>
              Put back
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The plan as boxes. Everything typed is in `edits` (lib/interviewGuide.ts,
 * PlanEdits) and nothing is saved until "Save questions".
 */
function PlanEditor({ base, edits, jobName, onEdits }: { base: InterviewPlan; edits: PlanEdits; jobName: string; onEdits: (next: PlanEdits) => void }) {
  const asked = (q: GuideQuestion) => !edits.removed.includes(q.id);
  const taken = removedQuestions(base, edits);
  const add = () => {
    const next = withNewQuestion(edits);
    if (!next) return;
    onEdits(next.edits);
    // Once it is drawn, the cursor goes in it.
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(`[data-plan-id="${next.id}"] textarea`)?.focus();
    });
  };
  return (
    <div data-plan-editor>
      <p className="mt-4 rounded-[10px] px-3 py-2.5 text-[12.5px] leading-snug" style={{ background: "var(--surface-2)", color: "var(--hf-text-soft)" }}>
        These are the questions for <span style={{ color: "var(--hf-text)", fontWeight: 600 }}>{jobName}</span>. Everyone you interview for it is asked the same ones, so your ratings can be compared. The questions
        written for one person, and your ratings, are not changed here.
      </p>

      <SectionTitle>Welcome</SectionTitle>
      <div className="mt-2">
        <EditBox label="Say something like" max={PLAN_EDIT_LIMITS.welcome} value={edits.welcome ?? base.welcome} onChange={(text) => onEdits(withWelcome(base, edits, text))} />
        {edits.welcome !== null && (
          <button type="button" className="mt-1.5 text-[12px] underline underline-offset-2" style={{ color: "var(--ink-2)" }} onClick={() => onEdits({ ...edits, welcome: null })}>
            Back to the original words
          </button>
        )}
      </div>

      <SectionTitle>Open with</SectionTitle>
      <ol className="mt-2 space-y-2">
        <QuestionEditor id={base.opener.id} base={base} edits={edits} removable={false} onEdits={onEdits} />
      </ol>

      <SectionTitle>Ask everyone</SectionTitle>
      <ol className="mt-2 space-y-2">
        {base.core.filter(asked).map((q) => (
          <QuestionEditor key={q.id} id={q.id} base={base} edits={edits} removable onEdits={onEdits} />
        ))}
        {edits.added.map((q) => (
          <QuestionEditor key={q.id} id={q.id} base={base} edits={edits} removable onEdits={onEdits} />
        ))}
      </ol>
      <button type="button" className="ck-btn ck-btn-outline mt-2 !py-2 !text-[12.5px]" onClick={add} disabled={edits.added.length >= PLAN_EDIT_LIMITS.added} data-plan-add>
        <Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden />
        Add a question of your own
      </button>
      <TakenOut questions={taken.filter((q) => base.core.some((c) => c.id === q.id))} edits={edits} onEdits={onEdits} />

      <SectionTitle>Before you finish</SectionTitle>
      <ol className="mt-2 space-y-2">
        {base.close.filter(asked).map((q) => (
          <QuestionEditor key={q.id} id={q.id} base={base} edits={edits} removable onEdits={onEdits} />
        ))}
      </ol>
      <TakenOut questions={taken.filter((q) => base.close.some((c) => c.id === q.id))} edits={edits} onEdits={onEdits} />
    </div>
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
  const { record, isLoading, write, isWriting, writeFailure, savePlan, isSavingPlan } = useInterviewGuide(applicationId, open);
  const { ratings, ready, loadFailed, state: saveState, setScore, setNote, setOverallNote, flush } = useInterviewRatings(applicationId, open);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const first = applicantName.trim().split(/\s+/)[0] || "them";
  // The plan as written here, and the plan this job is actually asked: the
  // same with the job's own changes laid over it.
  const basePlan = useMemo(() => interviewPlanFor(record?.family), [record?.family]);
  const plan = useMemo(() => applyPlanEdits(basePlan, record?.planEdits), [basePlan, record?.planEdits]);
  const personal = record?.personal ?? null;
  // Changing the questions: `draft` holds what is being typed; null = reading.
  const [draft, setDraft] = useState<PlanEdits | null>(null);
  const [planFailure, setPlanFailure] = useState<PlanSaveFailure | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const editing = draft !== null;
  const stopEditing = () => {
    setDraft(null);
    setPlanFailure(null);
    setResetArmed(false);
  };
  // Another applicant, or the guide closed: never carry a half-made change over.
  useEffect(() => {
    setDraft(null);
    setPlanFailure(null);
    setResetArmed(false);
  }, [open, applicationId]);
  const stageMinutes = (title: string) => plan.stages.find((s) => s.title === title)?.minutes;
  const summary = useMemo(() => ratingsSummary(ratings, guideAnswerKeys(plan, personal)), [ratings, plan, personal]);
  // The same number the profile, the list and the Interviews page show
  // (lib/interviewScore.ts): every answer scored for this person.
  const average = useMemo(() => interviewScore(ratings).average, [ratings]);
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
  const startEditing = () => {
    flush();
    setDraft(record?.planEdits ?? NO_PLAN_EDITS);
    setPlanFailure(null);
    setResetArmed(false);
  };
  // Save what was typed, or (null) go back to the questions as written.
  const savePlanEdits = async (edits: PlanEdits | null) => {
    setPlanFailure(null);
    try {
      await savePlan(edits);
      stopEditing();
      toast.success(edits ? "Questions saved for this job" : "Back to the original questions");
    } catch (error) {
      setPlanFailure((error as { reason?: PlanSaveFailure }).reason ?? "failed");
    }
  };

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
          ) : editing && draft ? (
            <PlanEditor
              base={basePlan}
              edits={draft}
              jobName={jobTitle?.trim() || "this job"}
              onEdits={(next) => {
                setDraft(next);
                setResetArmed(false);
              }}
            />
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
              {average !== null ? average.toFixed(1) : "–"}
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
        {editing && draft ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3" style={{ borderColor: "var(--line)" }} data-plan-foot>
            <span className="min-w-0 flex-1 text-[11.5px] leading-snug" style={{ color: planFailure ? "var(--amber-fg)" : "var(--ink-3)" }} role="status" data-plan-status>
              {planFailure ? PLAN_SAVE_WORDS[planFailure] : resetArmed ? "This drops every change made to this job's questions." : "Nothing changes until you save."}
            </span>
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {!planEditsAreEmpty(record?.planEdits) && (
                <button
                  type="button"
                  className="ck-btn ck-btn-ghost !py-2 !text-[12px]"
                  style={resetArmed ? { color: "var(--hf-danger)" } : undefined}
                  onClick={() => (resetArmed ? void savePlanEdits(null) : setResetArmed(true))}
                  disabled={isSavingPlan}
                  data-plan-reset={resetArmed ? "armed" : "idle"}
                >
                  {resetArmed ? "Yes, back to the original" : "Back to the original questions"}
                </button>
              )}
              <button type="button" className="ck-btn ck-btn-ghost !py-2 !text-[12px]" onClick={stopEditing} disabled={isSavingPlan} data-plan-cancel>
                Cancel
              </button>
              <button type="button" className="ck-btn ck-btn-primary !py-2 !text-[12.5px]" onClick={() => void savePlanEdits(draft)} disabled={isSavingPlan} data-plan-save>
                {isSavingPlan ? "Saving…" : "Save questions"}
              </button>
            </span>
          </div>
        ) : (
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
            {record?.jobId && record.plansDeployed && (
              <button type="button" className="ck-btn ck-btn-ghost !py-2 !text-[12px]" onClick={startEditing} disabled={isLoading} data-guide-edit>
                <Pencil className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                Edit questions
              </button>
            )}
            <button type="button" className="ck-btn ck-btn-outline !py-2 !text-[12px]" onClick={copyAll} disabled={isLoading} data-guide-copy>
              <Copy className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              Copy all
            </button>
          </span>
        </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
