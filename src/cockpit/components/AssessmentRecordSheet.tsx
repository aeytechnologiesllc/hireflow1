import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, Check, CheckCircle2, Circle, FileText, X, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  correctOptionsFor,
  formatCount,
  integritySummary,
  quizKeyMap,
  toneColor,
  type AssessmentDetail,
  type AssessmentEntry,
  type IntegrityEvent,
  type IntegrityTally,
  type QuizItem,
  type QuizKeyRow,
  type RecordTurn,
} from "../lib/assessmentRecord";
import { EntryIcon } from "./AssessmentRecordList";

/**
 * The full record behind one row of "What they submitted": every answer,
 * every quiz pick against the right answer, the typing numbers, the practice
 * chat's grading, the written interview with its transcript, and every
 * integrity flag with its time.
 *
 * Same letterhead as DocumentPreviewDialog (brass rule, ck-scroll body on the
 * ground colour, Escape and an X to close, z-[70] above the phone tab bar).
 * On a phone it takes the whole screen; from 768px it is a sheet down the
 * right side, so the applicant panel stays in view behind it.
 *
 * Rendered into document.body: the page it opens from sits inside the shell's
 * `.ck-page` (whose entrance animation leaves a transform behind) and a
 * z-[1] layer, and either one traps a `fixed` child — inset from the page
 * edge and painted under the phone's tab bar.
 *
 * What the record never kept is said once, plainly — "The conversation itself
 * was not kept for this attempt" — never reconstructed.
 */

interface AssessmentRecordSheetProps {
  open: boolean;
  entry: AssessmentEntry | null;
  candidateName: string;
  /** The job, for its answer key (owner and team only). */
  jobId: string | null;
  onClose: () => void;
  /** Opens the resume in the page's own viewer. */
  onOpenResume?: () => void;
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}

function when(iso: string | null | undefined, pattern = "EEE h:mm a"): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : format(d, pattern);
}

/** "3:33" into a conversation, from its first line. */
function offset(at: string | null, start: number | null): string | null {
  if (!at || start == null) return null;
  const ms = Date.parse(at) - start;
  if (!Number.isFinite(ms) || ms < 0) return null;
  const secs = Math.round(ms / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

function Label({ children, color = "var(--ink-3)" }: { children: ReactNode; color?: string }) {
  return (
    <span className="block text-[10px] font-bold uppercase leading-[1.2] tracking-[0.1em]" style={{ color }}>
      {children}
    </span>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <Label>{title}</Label>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A line about something the record does not hold. Quiet, never alarming. */
function NotKept({ children }: { children: ReactNode }) {
  return (
    <p
      className="rounded-[10px] border border-dashed px-3.5 py-3 text-[12.5px] leading-[1.55]"
      style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}
    >
      {children}
    </p>
  );
}

function Facts({ items }: { items: Array<{ label: string; value: string; note?: string | null; tone?: string }> }) {
  if (items.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-2">
      {items.map((f) => (
        <div
          key={f.label}
          className="rounded-[10px] border px-3 py-2.5"
          style={{ borderColor: "var(--line-soft)", background: "var(--surface)" }}
        >
          <dt>
            <Label>{f.label}</Label>
          </dt>
          <dd className="ck-num mt-1 text-[18px] font-semibold leading-[1.15]" style={{ color: f.tone ?? "var(--ink)" }}>
            {f.value}
          </dd>
          {f.note && (
            <dd className="mt-[2px] text-[11px]" style={{ color: "var(--ink-3)" }}>
              {f.note}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function Bullets({ items, tone = "ink" }: { items: string[]; tone?: "ink" | "amber" | "jade" }) {
  if (items.length === 0) return null;
  const dot = tone === "amber" ? "var(--amber-fg)" : tone === "jade" ? "var(--jade)" : "var(--hair)";
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[13px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
          <span aria-hidden className="mt-[7px] block h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: dot }} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return (
    <p className="whitespace-pre-wrap text-[13.5px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
      {children}
    </p>
  );
}

/** The conversation, turn by turn, with any integrity flag placed where it happened. */
function Transcript({
  turns,
  candidateName,
  otherName,
  events = [],
}: {
  turns: RecordTurn[];
  candidateName: string;
  otherName: string;
  events?: IntegrityEvent[];
}) {
  const start = turns.map((t) => (t.at ? Date.parse(t.at) : NaN)).find((n) => Number.isFinite(n)) ?? null;
  const flagStart = events.map((e) => (e.at ? Date.parse(e.at) : NaN)).find((n) => Number.isFinite(n)) ?? null;
  const origin = start != null && flagStart != null ? Math.min(start, flagStart) : start;
  type Line = { kind: "turn"; turn: RecordTurn } | { kind: "flag"; event: IntegrityEvent };
  const timed = turns.every((t) => t.at) && events.every((e) => e.at);
  const lines: Line[] = [
    ...turns.map((turn) => ({ kind: "turn" as const, turn })),
    ...events.map((event) => ({ kind: "flag" as const, event })),
  ];
  if (timed) {
    const at = (l: Line) => Date.parse(l.kind === "turn" ? l.turn.at! : l.event.at!);
    lines.sort((a, b) => at(a) - at(b));
  }

  return (
    <ol className="flex flex-col gap-2.5">
      {lines.map((line, i) => {
        if (line.kind === "flag") {
          const t = offset(line.event.at, origin);
          return (
            <li key={`f${i}`} className="flex items-center justify-center gap-1.5 text-[11px] font-semibold" style={{ color: "var(--amber-fg)" }}>
              <AlertCircle className="h-3 w-3" aria-hidden />
              {line.event.label}
              {t && <span className="ck-num font-normal">· {t}</span>}
            </li>
          );
        }
        const mine = line.turn.role === "candidate";
        const t = offset(line.turn.at, origin);
        return (
          <li key={`t${i}`} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
            <span className="mb-1 px-1 text-[10.5px] font-semibold" style={{ color: "var(--ink-3)" }}>
              {mine ? candidateName : otherName}
              {t && <span className="ck-num font-normal"> · {t}</span>}
            </span>
            <span
              className="max-w-[88%] whitespace-pre-wrap rounded-[12px] px-3.5 py-2.5 text-[13.5px] leading-[1.5]"
              style={
                mine
                  ? { background: "var(--jade-soft)", color: "var(--ink)", borderTopRightRadius: 4 }
                  : { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line-soft)", borderTopLeftRadius: 4 }
              }
            >
              {line.turn.text}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function IntegrityBlock({ tally }: { tally: IntegrityTally }) {
  if (tally.total === 0) return null;
  const summary = integritySummary(tally);
  return (
    <Section title="Integrity" aside={<span className="text-[11px] font-semibold" style={{ color: "var(--amber-fg)" }}>{tally.total} {tally.total === 1 ? "flag" : "flags"}</span>}>
      {summary && (
        <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
          {summary}.
        </p>
      )}
      {tally.events.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {tally.events.map((e, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
              <span>
                {e.label}
                {e.detail && e.detail !== e.label && <span style={{ color: "var(--ink-3)" }}> — {e.detail}</span>}
              </span>
              <span className="ck-num shrink-0 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                {when(e.at, "h:mm:ss a") ?? ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
          Only the counts were kept for this test, not the times.
        </p>
      )}
    </Section>
  );
}

/* ── One body per kind ─────────────────────────────────────────────────── */

function ApplicationBody({
  detail,
  onOpenResume,
}: {
  detail: Extract<AssessmentDetail, { kind: "application" }>;
  onOpenResume?: () => void;
}) {
  return (
    <>
      {detail.flags.length > 0 && (
        <div
          className="mb-5 flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-[12.5px] leading-[1.5]"
          style={{ background: "var(--amber-bg)", borderColor: "var(--brass-line)", color: "var(--amber-fg)" }}
        >
          <AlertCircle className="mt-[2px] h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">Ava flagged:</span> {detail.flags.join(" ")} Check the answers below against
            the job before you decide.
          </span>
        </div>
      )}
      <Section title={`Their answers · ${detail.answers.length}`}>
        {detail.answers.length === 0 ? (
          <NotKept>They sent the form, but no answers are on the record for this application.</NotKept>
        ) : (
          <ol className="flex flex-col gap-2">
            {detail.answers.map((a) => (
              <li
                key={a.id}
                className="rounded-[10px] border px-3.5 py-3"
                style={{ borderColor: "var(--line-soft)", background: "var(--surface)" }}
              >
                <p className="text-[12px] leading-[1.45]" style={{ color: "var(--ink-3)" }}>
                  {a.question}
                </p>
                {a.selected ? (
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {a.selected.map((s) => (
                      <li key={s} className="flex items-start gap-2 text-[13.5px] leading-[1.45]" style={{ color: "var(--ink)" }}>
                        <Check className="mt-[3px] h-3.5 w-3.5 shrink-0" style={{ color: "var(--jade)" }} aria-hidden />
                        {s}
                      </li>
                    ))}
                  </ul>
                ) : a.answer.trim() ? (
                  <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-[1.5]" style={{ color: "var(--ink)" }}>
                    {a.answer}
                  </p>
                ) : (
                  <p className="mt-1 text-[13px] italic" style={{ color: "var(--ink-3)" }}>
                    Left blank
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>
      {detail.coverLetter && (
        <Section title="Cover letter">
          <Prose>{detail.coverLetter}</Prose>
        </Section>
      )}
      <Section title="Resume">
        {detail.hasResume ? (
          <button type="button" className="ck-btn ck-btn-outline !py-2 !text-[12.5px]" onClick={onOpenResume}>
            <FileText className="h-3.5 w-3.5" />
            Open their resume
          </button>
        ) : (
          <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
            No resume was attached.
          </p>
        )}
      </Section>
    </>
  );
}

function QuizQuestion({ item, correct, keysReady }: { item: QuizItem; correct: { indexes: number[]; texts: string[] } | null; keysReady: boolean }) {
  const verdict =
    item.type === "fit"
      ? { text: "About fit — no right answer", color: "var(--ink-3)" }
      : item.type === "text"
        ? { text: "Written answer", color: "var(--ink-3)" }
        : item.isCorrect === true
          ? { text: "Right", color: "var(--jade)" }
          : item.partial
            ? { text: "Half right", color: "var(--amber-fg)" }
            : item.isCorrect === false
              ? { text: "Wrong", color: "var(--crit)" }
              : null;
  // Right/Wrong is how the answer was marked when they took it; the green
  // ticks come from today's answer key. If the job's key has changed since,
  // the two can disagree, and the sheet says so instead of contradicting itself.
  const pickJudgedNow =
    item.type === "multiple_choice" && keysReady && correct != null && item.picked.length === 1
      ? correct.indexes.includes(item.picked[0])
      : null;
  const keyChanged = pickJudgedNow != null && item.isCorrect != null && pickJudgedNow !== item.isCorrect;

  return (
    <li className="rounded-[10px] border px-3.5 py-3" style={{ borderColor: "var(--line-soft)", background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
          Question {item.index + 1}
          {item.category ? ` · ${item.category.replace(/_/g, " ")}` : ""}
        </span>
        {verdict && (
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: verdict.color }}>
            {verdict.text}
          </span>
        )}
      </div>
      <p className="mt-1 text-[13.5px] font-medium leading-[1.45]" style={{ color: "var(--ink)" }}>
        {item.question}
      </p>

      {item.type === "text" ? (
        <p className="mt-2 whitespace-pre-wrap rounded-[8px] px-2.5 py-2 text-[13px]" style={{ background: "var(--ground-2)", color: "var(--ink)" }}>
          {item.textAnswer ?? "Not answered"}
        </p>
      ) : item.options.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {item.options.map((option, i) => {
            const picked = item.picked.includes(i);
            const known = keysReady && correct != null;
            const right = known && correct!.indexes.includes(i);
            // With the key, every option is judged on its own. Without it, a
            // single-answer pick is still judged by the stored right/wrong; a
            // pick-several one is not (one wrong box makes it "half right").
            const mark: "picked-right" | "picked-wrong" | "picked" | "right" | "plain" = picked
              ? known
                ? right
                  ? "picked-right"
                  : "picked-wrong"
                : item.type === "multiple_choice" && item.isCorrect != null
                  ? item.isCorrect
                    ? "picked-right"
                    : "picked-wrong"
                  : "picked"
              : right
                ? "right"
                : "plain";
            const Icon = mark === "picked-wrong" ? XCircle : mark === "right" ? Check : mark === "plain" ? Circle : CheckCircle2;
            const iconColor =
              mark === "picked-wrong"
                ? "var(--crit)"
                : mark === "picked"
                  ? "var(--ink-2)"
                  : mark === "plain"
                    ? "var(--hair)"
                    : "var(--jade)";
            return (
              <li
                key={i}
                className="flex items-start gap-2.5 rounded-[8px] px-2.5 py-1.5 text-[13px] leading-[1.45]"
                style={{
                  background: picked ? "var(--ground-2)" : right ? "var(--jade-soft)" : "transparent",
                  color: "var(--ink)",
                }}
              >
                <Icon className="mt-[2px] h-3.5 w-3.5 shrink-0" style={{ color: iconColor }} aria-hidden />
                <span className="min-w-0 flex-1">{option}</span>
                {(picked || right) && (
                  <span className="shrink-0 pt-[2px] text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: picked ? "var(--ink-3)" : "var(--jade-soft-fg)" }}>
                    {picked ? "Their pick" : "Right answer"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-[13px]" style={{ color: "var(--ink-2)" }}>
          <span style={{ color: "var(--ink-3)" }}>Their pick: </span>
          {item.pickedText.length > 0 ? item.pickedText.join("; ") : "Not answered"}
        </p>
      )}
      {item.options.length > 0 && item.picked.length === 0 && item.type !== "text" && (
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
          {item.pickedText.length > 0 ? `Their pick (no longer an option): ${item.pickedText.join("; ")}` : "Not answered"}
        </p>
      )}
      {keyChanged && (
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
          The answer key for this question has changed since they took it. &ldquo;{verdict?.text}&rdquo; is how it was
          marked then.
        </p>
      )}
    </li>
  );
}

function QuizBody({ detail, jobId, enabled }: { detail: Extract<AssessmentDetail, { kind: "quiz" }>; jobId: string | null; enabled: boolean }) {
  // The right answers are never in notes (the candidate can read their own
  // notes). Owner and team read them through get_job_quiz_keys, only while
  // this sheet is open; anyone else is refused, and that reads as
  // "unavailable", never as a broken sheet.
  const keysQ = useQuery({
    queryKey: ["job-quiz-keys", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_job_quiz_keys", { p_job_id: jobId! });
      if (error) throw error;
      return (data ?? []) as QuizKeyRow[];
    },
    enabled: enabled && !!jobId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const keys = useMemo(() => quizKeyMap(keysQ.data, detail.keyStepId), [keysQ.data, detail.keyStepId]);
  const keysReady = keysQ.isSuccess && keys.size > 0;

  const keyNote = !jobId || keysQ.isError
    ? "Correct answers unavailable — showing what they picked and whether it was marked right."
    : keysQ.isLoading
      ? "Looking up the answer key…"
      : keysQ.isSuccess && keys.size === 0
        ? "No answer key is stored for this quiz — showing what they picked and whether it was marked right."
        : null;

  return (
    <>
      <Facts
        items={[
          ...(detail.correct != null && detail.total != null
            ? [{ label: "Right", value: `${formatCount(detail.correct)} of ${formatCount(detail.total)}`, tone: detail.passed === false ? "var(--amber-fg)" : "var(--jade)" }]
            : []),
          ...(detail.score != null ? [{ label: "Score", value: `${Math.round(detail.score)}%`, note: detail.passed === true ? "Passed" : detail.passed === false ? "Did not pass" : null }] : []),
        ]}
      />
      <Section title={`Every question · ${detail.items.length}`}>
        {keyNote && (
          <p className="mb-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
            {keyNote}
          </p>
        )}
        {detail.items.length === 0 ? (
          <NotKept>Only the score was kept for this quiz, not the answers question by question.</NotKept>
        ) : (
          <ol className="flex flex-col gap-2">
            {detail.items.map((item) => (
              <QuizQuestion
                key={item.id}
                item={item}
                keysReady={keysReady}
                correct={keysReady ? correctOptionsFor(item, keys.get(item.id)) : null}
              />
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

function TypingBody({ detail }: { detail: Extract<AssessmentDetail, { kind: "typing_test" }> }) {
  const slow = detail.wpm != null && detail.requiredWpm != null && detail.wpm < detail.requiredWpm;
  const sloppy = detail.accuracy != null && detail.requiredAccuracy != null && detail.accuracy < detail.requiredAccuracy;
  return (
    <>
      <Facts
        items={[
          ...(detail.wpm != null
            ? [{ label: "Speed", value: `${Math.round(detail.wpm)} WPM`, note: detail.requiredWpm != null ? `The job asks for ${detail.requiredWpm}` : null, tone: slow ? "var(--amber-fg)" : "var(--ink)" }]
            : []),
          ...(detail.accuracy != null
            ? [{ label: "Accuracy", value: `${Math.round(detail.accuracy)}%`, note: detail.requiredAccuracy != null ? `The job asks for ${detail.requiredAccuracy}%` : null, tone: sloppy ? "var(--amber-fg)" : "var(--ink)" }]
            : []),
          ...(detail.score != null ? [{ label: "Combined score", value: String(Math.round(detail.score)) }] : []),
          ...(detail.seconds != null ? [{ label: "Time", value: `${detail.seconds} s` }] : []),
        ]}
      />
      <Section title="What they typed">
        {detail.passage || detail.typed ? (
          <div className="flex flex-col gap-3">
            {detail.passage && (
              <div>
                <span className="mb-1 block text-[11px]" style={{ color: "var(--ink-3)" }}>The passage</span>
                <p className="rounded-[8px] px-3 py-2.5 text-[13px] leading-[1.6]" style={{ background: "var(--ground-2)", color: "var(--ink-2)" }}>
                  {detail.passage}
                </p>
              </div>
            )}
            {detail.typed && (
              <div>
                <span className="mb-1 block text-[11px]" style={{ color: "var(--ink-3)" }}>What they typed</span>
                <p className="whitespace-pre-wrap rounded-[8px] border px-3 py-2.5 text-[13px] leading-[1.6]" style={{ borderColor: "var(--line-soft)", background: "var(--surface)", color: "var(--ink)" }}>
                  {detail.typed}
                </p>
              </div>
            )}
          </div>
        ) : (
          <NotKept>The passage and what they typed were not kept for this attempt — only the numbers above.</NotKept>
        )}
      </Section>
    </>
  );
}

function ChatPracticeBody({ detail, candidate }: { detail: Extract<AssessmentDetail, { kind: "chat_simulation" }>; candidate: string }) {
  return (
    <>
      {detail.scenario && (
        <Section title={detail.customerName ? `The player · ${detail.customerName}` : "The situation"}>
          <p className="rounded-[10px] px-3.5 py-3 text-[13px] leading-[1.6]" style={{ background: "var(--ground-2)", color: "var(--ink-2)" }}>
            {detail.scenario}
          </p>
        </Section>
      )}
      {detail.scores.length > 0 && (
        <Section title="How it was graded">
          <Facts items={detail.scores.map((s) => ({ label: s.label, value: `${Math.round(s.value)} / 100` }))} />
        </Section>
      )}
      {detail.feedback && (
        <Section title="In a line">
          <Prose>{detail.feedback}</Prose>
        </Section>
      )}
      {detail.strengths.length > 0 && (
        <Section title="What went well">
          <Bullets items={detail.strengths} tone="jade" />
        </Section>
      )}
      {detail.improvements.length > 0 && (
        <Section title="What to improve">
          <Bullets items={detail.improvements} tone="amber" />
        </Section>
      )}
      <Section title={detail.messageCount != null ? `The conversation · ${detail.messageCount} messages` : "The conversation"}>
        {detail.transcript ? (
          <Transcript turns={detail.transcript} candidateName={candidate} otherName={detail.customerName ? `${detail.customerName} (player)` : "Player"} />
        ) : (
          <NotKept>The conversation itself was not kept for this attempt — only the grading above.</NotKept>
        )}
      </Section>
    </>
  );
}

function InterviewBody({
  detail,
  candidate,
  events,
}: {
  detail: Extract<AssessmentDetail, { kind: "chat_interview" }>;
  candidate: string;
  events: IntegrityEvent[];
}) {
  const declined = detail.recommendation != null && /\bno\b|not|reject|decline/i.test(detail.recommendation);
  return (
    <>
      <Facts
        items={[
          ...(detail.score != null ? [{ label: "Score", value: `${Math.round(detail.score)} / 100` }] : []),
          ...(detail.recommendation ? [{ label: "Recommendation", value: detail.recommendation, tone: declined ? "var(--amber-fg)" : "var(--jade)" }] : []),
          ...(detail.credibility ? [{ label: "Credibility", value: detail.credibility }] : []),
          ...(detail.questionCount != null || detail.duration
            ? [{ label: "Length", value: detail.duration ?? `${detail.questionCount} questions`, note: detail.duration && detail.questionCount != null ? `${detail.questionCount} questions` : null }]
            : []),
        ]}
      />
      {detail.summary && (
        <Section title="Summary">
          <Prose>{detail.summary}</Prose>
        </Section>
      )}
      {detail.strengths.length > 0 && (
        <Section title="Strengths">
          <Bullets items={detail.strengths} tone="jade" />
        </Section>
      )}
      {detail.concerns.length > 0 && (
        <Section title="Concerns">
          <Bullets items={detail.concerns} tone="amber" />
        </Section>
      )}
      {detail.inconsistencies.length > 0 && (
        <Section title="Where their answers did not add up">
          <ol className="flex flex-col gap-2">
            {detail.inconsistencies.map((x, i) => (
              <li key={i} className="rounded-[10px] border px-3.5 py-3 text-[13px] leading-[1.5]" style={{ borderColor: "var(--line-soft)", background: "var(--surface)" }}>
                {x.claim && (
                  <p style={{ color: "var(--ink)" }}>
                    <span className="font-semibold">They said: </span>
                    {x.claim}
                  </p>
                )}
                {x.evidence && (
                  <p className="mt-1" style={{ color: "var(--ink-2)" }}>
                    <span className="font-semibold">The evidence: </span>
                    {x.evidence}
                  </p>
                )}
                {x.assessment && (
                  <p className="mt-1" style={{ color: "var(--ink-3)" }}>
                    {x.assessment}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}
      <Section title={detail.messageCount != null ? `The conversation · ${detail.messageCount} messages` : "The conversation"}>
        {detail.transcript ? (
          <Transcript turns={detail.transcript} candidateName={candidate} otherName="Ava" events={events} />
        ) : (
          <NotKept>The conversation itself was not kept for this attempt — only the grading above.</NotKept>
        )}
      </Section>
    </>
  );
}

function VoiceBody({ detail, candidate }: { detail: Extract<AssessmentDetail, { kind: "voice_interview" }>; candidate: string }) {
  return (
    <>
      <Facts
        items={[
          ...(detail.score != null ? [{ label: "Score", value: `${Math.round(detail.score)} / 100` }] : []),
          ...(detail.minutes != null ? [{ label: "Length", value: `${detail.minutes} min` }] : []),
        ]}
      />
      {detail.recordingUrl && (
        <a
          href={detail.recordingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ck-btn ck-btn-outline mt-3 inline-flex !py-2 !text-[12.5px]"
        >
          Hear the recording
        </a>
      )}
      {detail.summary && (
        <Section title="Summary">
          <Prose>{detail.summary}</Prose>
        </Section>
      )}
      <Section title="The conversation">
        {detail.transcript ? (
          <Transcript turns={detail.transcript} candidateName={candidate} otherName="Ava" />
        ) : (
          <NotKept>No transcript was kept for this interview.</NotKept>
        )}
      </Section>
    </>
  );
}

function GenericBody({ detail, candidate }: { detail: Extract<AssessmentDetail, { kind: "generic" }>; candidate: string }) {
  return (
    <>
      <Facts items={detail.facts} />
      {detail.summary && (
        <Section title="Summary">
          <Prose>{detail.summary}</Prose>
        </Section>
      )}
      {detail.lists.map((l) => (
        <Section key={l.label} title={l.label}>
          <Bullets items={l.items} />
        </Section>
      ))}
      {detail.transcript && (
        <Section title="The conversation">
          <Transcript turns={detail.transcript} candidateName={candidate} otherName="Ava" />
        </Section>
      )}
      {detail.facts.length === 0 && !detail.summary && detail.lists.length === 0 && !detail.transcript && (
        <NotKept>This step is marked done, but nothing more about it is on the record.</NotKept>
      )}
    </>
  );
}

function IntegrityBody({ detail }: { detail: Extract<AssessmentDetail, { kind: "integrity" }> }) {
  return (
    <>
      <p className="text-[13px] leading-[1.55]" style={{ color: "var(--ink-2)" }}>
        Counted by their browser while each test was open. A switch away can be a notification or a second screen —
        worth asking about, not proof on its own.
      </p>
      {detail.groups.map((g) => (
        <Section
          key={g.key}
          title={g.title}
          aside={<span className="text-[11px] font-semibold" style={{ color: "var(--amber-fg)" }}>{g.tally.total} {g.tally.total === 1 ? "flag" : "flags"}</span>}
        >
          <p className="text-[13px]" style={{ color: "var(--ink-2)" }}>
            {integritySummary(g.tally)}.
          </p>
          {g.tally.events.length > 0 ? (
            <ul className="mt-1.5 flex flex-col gap-1">
              {g.tally.events.map((e, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 text-[12.5px]" style={{ color: "var(--ink-2)" }}>
                  <span>
                    {e.label}
                    {e.detail && e.detail !== e.label && <span style={{ color: "var(--ink-3)" }}> — {e.detail}</span>}
                  </span>
                  <span className="ck-num shrink-0 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
                    {when(e.at, "h:mm:ss a") ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>
              Only the counts were kept for this test, not the times.
            </p>
          )}
        </Section>
      ))}
    </>
  );
}

/* ── The sheet ─────────────────────────────────────────────────────────── */

export function AssessmentRecordSheet({ open, entry, candidateName, jobId, onClose, onOpenResume }: AssessmentRecordSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isOpen = open && !!entry;

  // Focus goes to the close button on open and back to the row that opened it
  // on close, so a keyboard user is never dropped at the top of the page.
  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 30);
    return () => {
      window.clearTimeout(t);
      opener?.focus?.({ preventScroll: true });
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      // Keep Tab inside the sheet while it is open.
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !entry) return null;

  const detail = entry.detail;
  const who = firstName(candidateName);
  const finished = when(entry.completedAt);
  const sub = [entry.verdict, entry.subline].filter(Boolean).join(" · ");

  let body: ReactNode = null;
  if (detail) {
    switch (detail.kind) {
      case "application":
        body = <ApplicationBody detail={detail} onOpenResume={onOpenResume} />;
        break;
      case "quiz":
        body = <QuizBody detail={detail} jobId={jobId} enabled={isOpen} />;
        break;
      case "typing_test":
        body = <TypingBody detail={detail} />;
        break;
      case "chat_simulation":
        body = <ChatPracticeBody detail={detail} candidate={who} />;
        break;
      case "chat_interview":
        body = <InterviewBody detail={detail} candidate={who} events={entry.integrity.events} />;
        break;
      case "voice_interview":
        body = <VoiceBody detail={detail} candidate={who} />;
        break;
      case "generic":
        body = <GenericBody detail={detail} candidate={who} />;
        break;
      case "integrity":
        body = <IntegrityBody detail={detail} />;
        break;
      default:
        body = null;
    }
  }
  // The interview places its flags inside the transcript; everywhere else they
  // get their own block at the end. The integrity sheet IS the flags.
  const flagsInline = detail?.kind === "chat_interview" && !!detail.transcript && entry.integrity.events.length > 0;
  const showIntegrity = entry.kind !== "integrity" && entry.integrity.total > 0 && !flagsInline;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end">
      {/* scrim — the panel behind stays in view on a wide screen */}
      <div
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--ink) 40%, transparent)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${entry.title} — ${candidateName}`}
        className="relative flex h-full w-full flex-col overflow-hidden md:w-[min(600px,100%)] md:rounded-l-[16px] md:border-l"
        style={{
          background: "var(--hf-surface)",
          borderColor: "var(--hf-border)",
          boxShadow: "var(--hf-shadow-raised)",
          animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both",
        }}
      >
        {/* the brass rule across the head of the letterhead */}
        <span aria-hidden className="absolute left-5 right-5 top-0 h-[2px] rounded-[1px]" style={{ background: "var(--brass-line)" }} />

        {/* header */}
        <div
          className="flex items-start gap-3 border-b px-4 pb-3.5 md:px-5"
          style={{ borderColor: "var(--line-soft)", paddingTop: "max(14px, env(safe-area-inset-top, 0px))" }}
        >
          <span
            aria-hidden
            className="mt-0.5 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
            style={
              entry.kind === "integrity"
                ? { background: "var(--amber-bg)", color: "var(--amber-fg)" }
                : { background: "var(--jade-soft)", color: "var(--jade-soft-fg)" }
            }
          >
            <EntryIcon entry={entry} className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[18px] font-semibold leading-[1.2]" style={{ color: "var(--ink)" }}>
              {entry.title}
            </div>
            <div className="mt-[3px] truncate text-[12px]" style={{ color: "var(--ink-3)" }}>
              {candidateName}
            </div>
            {/* The number, then the judgment and when — under the title, so a
                long step name never has to share its line with the figure. */}
            {(entry.headline || sub || finished) && (
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                {entry.headline && (
                  <span className="ck-num text-[24px] font-semibold leading-none" style={{ color: toneColor(entry.tone) }}>
                    {entry.headline}
                  </span>
                )}
                {(sub || finished) && (
                  <span className="text-[12px] leading-[1.4]">
                    {sub && (
                      <span
                        className="font-semibold"
                        style={{ color: entry.tone === "amber" && entry.verdict ? "var(--amber-fg)" : "var(--ink-2)" }}
                      >
                        {sub}
                      </span>
                    )}
                    {finished && (
                      <span style={{ color: "var(--ink-3)" }}>
                        {sub ? " · " : ""}finished {finished}
                      </span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ck-btn ck-btn-ghost -mr-1 !h-10 !w-10 shrink-0 !p-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* body */}
        <div
          className="ck-scroll flex-1 overflow-y-auto px-4 pt-5 md:px-5"
          style={{ background: "var(--ground-2)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
        >
          {body}
          {showIntegrity && <IntegrityBlock tally={entry.integrity} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default AssessmentRecordSheet;
