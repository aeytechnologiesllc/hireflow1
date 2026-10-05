import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertCircle, Check, CheckCircle2, Circle, ExternalLink, FileText, ImageIcon, RotateCcw, X, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  agoText,
  correctOptionsFor,
  durationText,
  formatCount,
  integritySummary,
  liveTone,
  quizKeyMap,
  timelineTags,
  timelineText,
  toneColor,
  withSessionEvents,
  type AnswerItem,
  type AssessmentDetail,
  type AssessmentEntry,
  type IntegrityEvent,
  type IntegrityTally,
  type LiveState,
  type QuizItem,
  type QuizKeyRow,
  type RecordTurn,
  type TimelineItem,
  type TypingWord,
  type UploadItem,
} from "../lib/assessmentRecord";
import {
  useApplicantFileUrl,
  useApplicationIntegrityEvents,
  useNow,
  useSessionEvents,
} from "../hooks/useAssessmentSessions";
import { EntryIcon, LiveDot } from "./AssessmentRecordList";

/**
 * The full record behind one row of "What they submitted": every answer,
 * every quiz pick against the right answer with the seconds spent on it, what
 * they typed against the passage, both chat conversations with their
 * grading, and every switch away, paste and screenshot attempt with its time
 * and how long they were gone.
 *
 * Two sources, one sheet. The notes on the application row (what the tests
 * have always written) come with the row. The server's own record of the
 * attempt (assessment_events: both sides of each chat, quiz views and picks
 * on the server's clock, typing snapshots, integrity events) is fetched only
 * while the sheet is open, and stays live: every event updates its attempt,
 * and useEmployerLiveSync refetches the events of the attempt that changed.
 * A test still being taken opens on what is there so far.
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
  /** The application, for its events and its files. */
  applicationId?: string | null;
  /** The job, for its answer key (owner and team only). */
  jobId: string | null;
  onClose: () => void;
  /** Opens the resume in the page's own viewer. */
  onOpenResume?: () => void;
  /** Open scrolled to this part (an integrity alert opens on the timeline). */
  focus?: "integrity" | null;
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

/** "42 s", "1m 12s". */
function secondsText(seconds: number): string {
  return seconds < 60 ? `${Math.round(seconds)} s` : durationText(seconds * 1000);
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

function Label({ children, color = "var(--ink-3)" }: { children: ReactNode; color?: string }) {
  return (
    <span className="block text-[10px] font-bold uppercase leading-[1.2] tracking-[0.1em]" style={{ color }}>
      {children}
    </span>
  );
}

function Section({
  title,
  children,
  aside,
  sectionRef,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  sectionRef?: React.Ref<HTMLElement>;
}) {
  return (
    <section ref={sectionRef} className="mt-6 scroll-mt-4 first:mt-0">
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

/** Where the attempt on screen stands (null for a finished test). */
const LiveStateContext = createContext<LiveState | null>(null);
const gone = (state: LiveState | null) => state === "left" || state === "away";

/** A test not sent yet: what this sheet shows is what is there so far. The
 *  words follow where they are — still at it, or gone from it. */
function LiveNote({ doing, left }: { doing: ReactNode; left: ReactNode }) {
  const state = useContext(LiveStateContext);
  return (
    <p
      className="mb-4 flex items-start gap-2 rounded-[10px] border px-3.5 py-2.5 text-[12.5px] leading-[1.5]"
      style={{ borderColor: "var(--line-soft)", background: "var(--surface)", color: "var(--ink-2)" }}
    >
      <LiveDot state={state} className="mt-[6px]" />
      <span>{gone(state) ? left : doing}</span>
    </p>
  );
}

/** A plain line above the record about WHICH attempt this is (a retake, an
 *  earlier attempt's flags) — same paper as LiveNote, with its own mark. */
function AttemptNote({ icon, tone = "var(--ink-3)", children }: { icon: ReactNode; tone?: string; children: ReactNode }) {
  return (
    <p
      className="mb-4 flex items-start gap-2 rounded-[10px] border px-3.5 py-2.5 text-[12.5px] leading-[1.5]"
      style={{ borderColor: "var(--line-soft)", background: "var(--surface)", color: "var(--ink-2)" }}
    >
      <span aria-hidden className="mt-[2px] shrink-0" style={{ color: tone }}>
        {icon}
      </span>
      <span>{children}</span>
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

function lowerFirstWord(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function Prose({ children }: { children: ReactNode }) {
  return (
    <p className="whitespace-pre-wrap text-[13.5px] leading-[1.6]" style={{ color: "var(--ink-2)" }}>
      {children}
    </p>
  );
}

/** The timeline's flags, as the transcript places them between turns — by
 *  the server's clock, which is the clock the turns carry. */
function inlineFlags(timeline: TimelineItem[] | null): IntegrityEvent[] {
  return (timeline ?? [])
    .filter((t) => t.flag)
    .map((t) => ({ type: t.kind, label: timelineText(t), at: t.serverAt ?? t.at, detail: null }));
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
  // Offsets count from the first turn: a flag never moves the conversation's
  // own clock. Only with no timed turn at all do the flags set it.
  const start = turns.map((t) => (t.at ? Date.parse(t.at) : NaN)).find((n) => Number.isFinite(n)) ?? null;
  const flagStart = events.map((e) => (e.at ? Date.parse(e.at) : NaN)).find((n) => Number.isFinite(n)) ?? null;
  const origin = start ?? flagStart;
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
            <li key={`f${i}`} className="flex items-center justify-center gap-1.5 text-center text-[11px] font-semibold" style={{ color: "var(--amber-fg)" }}>
              <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
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
              className="max-w-[88%] whitespace-pre-wrap break-words rounded-[12px] px-3.5 py-2.5 text-[13.5px] leading-[1.5]"
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

/** An older test's own list (kept in notes before the server kept events):
 *  each line with its time; a right-click or blocked shortcut is on it, but
 *  marked, never counted. */
function FlagList({ events }: { events: IntegrityEvent[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {events.map((e, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 text-[12.5px]" style={{ color: e.recordedOnly ? "var(--ink-3)" : "var(--ink-2)" }}>
          <span className="min-w-0">
            {e.label}
            {e.detail && e.detail !== e.label && <span style={{ color: "var(--ink-3)" }}> — {e.detail}</span>}
            {e.recordedOnly && <span className="text-[11.5px]"> · recorded only</span>}
          </span>
          <span className="ck-num shrink-0 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
            {when(e.at, "h:mm:ss a") ?? ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Every switch away, paste and marker of one attempt, in order, with its time. */
function Timeline({ items, neutral = false }: { items: TimelineItem[]; neutral?: boolean }) {
  return (
    <ol className="relative flex flex-col gap-1.5 pl-4">
      <span aria-hidden className="absolute bottom-1 left-[4px] top-1 w-px" style={{ background: "var(--line)" }} />
      {items.map((item, i) => {
        const marker = item.kind.startsWith("system:");
        const tags = timelineTags(item);
        // On the form nothing is a flag (leaving it is normal): same line, no amber.
        const flag = item.flag && !neutral;
        const color = flag ? "var(--amber-fg)" : "var(--ink-3)";
        return (
          <li key={i} className="relative flex items-baseline justify-between gap-3 text-[12.5px] leading-[1.45]">
            <span
              aria-hidden
              className="absolute -left-4 top-[6px] block h-[9px] w-[9px] rounded-full border-2"
              style={{
                borderColor: flag ? "var(--amber-fg)" : "var(--hair)",
                background: flag ? "var(--amber-fg)" : marker ? "var(--ground-2)" : "var(--ink-3)",
              }}
            />
            <span className="min-w-0" style={{ color: flag ? "var(--ink)" : "var(--ink-2)" }}>
              <span className={flag ? "font-semibold" : undefined}>{timelineText(item)}</span>
              {tags.length > 0 && (
                <span className="text-[11.5px]" style={{ color }}>
                  {" "}
                  · {tags.join(" · ")}
                </span>
              )}
            </span>
            {/* One clock for the whole sheet: the moment the page saw it,
                corrected to the server's clock its markers and turns use
                (a laptop running slow must not list a switch away before
                the test it happened in started). */}
            <span className="ck-num shrink-0 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
              {when(item.serverAt ?? item.at, "h:mm:ss a") ?? ""}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** One test's integrity: the tally in the owner's card words, then the
 *  timeline (once loaded), else whatever event list the notes kept. */
function IntegrityBlock({
  tally,
  timeline,
  loading,
  form,
  sectionRef,
}: {
  tally: IntegrityTally;
  timeline: TimelineItem[] | null;
  loading: boolean;
  form: boolean;
  sectionRef?: React.Ref<HTMLElement>;
}) {
  if (tally.total === 0 && !timeline?.length) return null;
  const summary = integritySummary(tally);
  // Only start / reload / sent markers: a clean run, said plainly.
  const clean = tally.total === 0 && !(timeline ?? []).some((i) => !i.kind.startsWith("system:"));
  return (
    <Section
      sectionRef={sectionRef}
      title={clean ? "Timeline" : form ? "While filling in the form" : "Integrity"}
      aside={
        tally.total > 0 ? (
          <span className="text-[11px] font-semibold" style={{ color: "var(--amber-fg)" }}>
            {tally.total} {tally.total === 1 ? "flag" : "flags"}
          </span>
        ) : undefined
      }
    >
      {summary && (
        <p className="mb-2 text-[13px]" style={{ color: "var(--ink-2)" }}>
          {summary}.
        </p>
      )}
      {clean && !form && (
        <p className="mb-2 text-[13px]" style={{ color: "var(--ink-2)" }}>
          Nothing flagged: no switches away, pastes or screenshot attempts were recorded.
        </p>
      )}
      {form && !clean && (
        <p className="mb-2 text-[12px] leading-[1.5]" style={{ color: "var(--ink-3)" }}>
          Leaving the form is normal (finding a resume, running a speed test), so none of this is ever sent to you as
          an alert.
        </p>
      )}
      {timeline && timeline.length > 0 ? (
        <Timeline
          items={
            form
              ? timeline.map((t) =>
                  t.kind === "system:started" ? { ...t, label: "Opened the form" } : t.kind === "system:submitted" ? { ...t, label: "Sent the form" } : t,
                )
              : timeline
          }
          neutral={form}
        />
      ) : tally.events.length > 0 ? (
        <FlagList events={tally.events} />
      ) : loading ? (
        <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
          Loading the timeline…
        </p>
      ) : tally.fromSession ? null : (
        <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
          Only the counts were kept for this test, not the times.
        </p>
      )}
    </Section>
  );
}

/* ── Files they attached ───────────────────────────────────────────────── */

const IMAGE_PATH = /\.(png|jpe?g|webp|gif)$/i;

function fileKind(path: string): string {
  const ext = path.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "Image";
  if (ext === "pdf") return "PDF";
  if (ext === "doc" || ext === "docx") return "Word document";
  return "File";
}

/**
 * One uploaded file, opened through applicant-file-url (short-lived links,
 * checked against the application on the server). An image — or a PDF's
 * first page, which the form turned into an image — shows inline.
 */
function FileAttachment({ applicationId, path, pages, label }: { applicationId: string | null; path: string; pages: string[]; label: string }) {
  const previewPath = IMAGE_PATH.test(path) ? path : pages[0] ?? null;
  const full = useApplicantFileUrl(applicationId, path, true);
  const preview = useApplicantFileUrl(applicationId, previewPath, !!previewPath && previewPath !== path);
  const freshPreview = previewPath === path ? full.data?.url : preview.data?.url;
  const failed = full.isError;
  // A link that expired or a file the browser cannot draw: say so, never a
  // broken-image box with alt text spilling out of it.
  const [broken, setBroken] = useState(false);
  // The links are re-minted every few minutes; a picture already drawn keeps
  // its first link (the browser has the image) instead of loading it again.
  const [drawn, setDrawn] = useState<string | null>(null);
  const previewUrl = drawn ?? freshPreview;
  useEffect(() => setBroken(false), [previewUrl]);

  return (
    <div className="mt-1.5">
      {previewPath && previewUrl && !broken && (
        <a href={full.data?.url ?? previewUrl} target="_blank" rel="noopener noreferrer" className="block w-fit max-w-full">
          <img
            src={previewUrl}
            alt={`${label} — what they uploaded`}
            loading="lazy"
            onLoad={() => setDrawn(previewUrl ?? null)}
            onError={() => {
              setDrawn(null);
              setBroken(true);
            }}
            className="block max-h-[260px] w-auto max-w-full rounded-[8px] border object-contain"
            style={{ borderColor: "var(--line-soft)", background: "var(--ground-2)" }}
          />
        </a>
      )}
      {previewPath && previewUrl && broken && (
        <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
          The preview didn&rsquo;t load. The file itself may still open below.
        </p>
      )}
      {previewPath && !previewUrl && !failed && (
        <div
          className="flex h-[120px] w-full max-w-[220px] items-center justify-center rounded-[8px] border text-[12px]"
          style={{ borderColor: "var(--line-soft)", background: "var(--ground-2)", color: "var(--ink-3)" }}
        >
          <ImageIcon className="mr-1.5 h-4 w-4" aria-hidden />
          Opening…
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {full.data?.url ? (
          <a
            href={full.data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ck-btn ck-btn-outline !py-1.5 !text-[12px]"
          >
            <FileText className="h-3.5 w-3.5" />
            Open the {fileKind(path).toLowerCase()}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : failed ? (
          <span className="flex flex-wrap items-center gap-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
            {fileKind(path)} attached, but it can&rsquo;t be opened just now.
            <button type="button" className="font-semibold hover:underline" style={{ color: "var(--brass)" }} onClick={() => void full.refetch()}>
              Try again
            </button>
          </span>
        ) : (
          <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
            {fileKind(path)} attached · opening…
          </span>
        )}
      </div>
    </div>
  );
}

/* ── One body per kind ─────────────────────────────────────────────────── */

function AnswerValue({ answer, draft, applicationId }: { answer: AnswerItem; draft: boolean; applicationId: string | null }) {
  if (answer.file) {
    return <FileAttachment applicationId={applicationId} path={answer.file.path} pages={answer.file.pages} label={answer.question} />;
  }
  if (answer.selected) {
    return (
      <ul className="mt-1.5 flex flex-col gap-1">
        {answer.selected.map((s) => (
          <li key={s} className="flex items-start gap-2 text-[13.5px] leading-[1.45]" style={{ color: "var(--ink)" }}>
            <Check className="mt-[3px] h-3.5 w-3.5 shrink-0" style={{ color: "var(--jade)" }} aria-hidden />
            {s}
          </li>
        ))}
      </ul>
    );
  }
  if (answer.answer.trim()) {
    return (
      <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-[1.5]" style={{ color: "var(--ink)" }}>
        {answer.answer}
      </p>
    );
  }
  return (
    <p className="mt-1 text-[13px] italic" style={{ color: "var(--ink-3)" }}>
      {draft ? "Not answered yet" : "Left blank"}
    </p>
  );
}

function ApplicationBody({
  detail,
  onOpenResume,
  applicationId,
  now,
}: {
  detail: Extract<AssessmentDetail, { kind: "application" }>;
  onOpenResume?: () => void;
  applicationId: string | null;
  now: number;
}) {
  const draft = detail.draft;
  const answeredIds = new Set(detail.answers.map((a) => a.id));
  // Files attached to a question the answers do not list (an older form).
  const loose: UploadItem[] = detail.uploads.filter((u) => !answeredIds.has(u.questionId));
  const saved = draft?.savedAt ? Date.parse(draft.savedAt) : NaN;
  return (
    <>
      {draft && (
        <LiveNote
          doing={
            <>
              Not sent yet. These are the answers saved as they type
              {draft.total != null && draft.total > 0 ? ` — ${draft.answered ?? 0} of ${draft.total} so far` : ""}
              {Number.isFinite(saved) ? `, last saved ${agoText(Math.max(0, now - saved))}` : ""}.
            </>
          }
          left={
            <>
              Not sent. They stopped here
              {draft.total != null && draft.total > 0 ? `, with ${draft.answered ?? 0} of ${draft.total} answered` : ""}
              {Number.isFinite(saved) ? `; last saved ${agoText(Math.max(0, now - saved))}` : ""}.
            </>
          }
        />
      )}
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
      <Section title={draft ? `Their answers so far · ${detail.answers.length}` : `Their answers · ${detail.answers.length}`}>
        {detail.answers.length === 0 ? (
          <NotKept>
            {draft ? "Nothing typed yet." : "They sent the form, but no answers are on the record for this application."}
          </NotKept>
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
                <AnswerValue answer={a} draft={!!draft} applicationId={applicationId} />
              </li>
            ))}
          </ol>
        )}
      </Section>
      {loose.length > 0 && (
        <Section title={`Files they attached · ${loose.length}`}>
          <ul className="flex flex-col gap-2">
            {loose.map((u) => (
              <li key={u.questionId} className="rounded-[10px] border px-3.5 py-3" style={{ borderColor: "var(--line-soft)", background: "var(--surface)" }}>
                <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                  {u.question}
                </p>
                <FileAttachment applicationId={applicationId} path={u.path} pages={u.pages} label={u.question} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {detail.coverLetter && (
        <Section title="Cover letter">
          <Prose>{detail.coverLetter}</Prose>
        </Section>
      )}
      {(!draft || detail.hasResume) && (
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
      )}
    </>
  );
}

function QuizQuestion({
  item,
  correct,
  keysReady,
  live,
}: {
  item: QuizItem;
  correct: { indexes: number[]; texts: string[] } | null;
  keysReady: boolean;
  live: boolean;
}) {
  const liveState = useContext(LiveStateContext);
  const verdict =
    item.type === "fit"
      ? { text: "About fit — no right answer", color: "var(--ink-3)" }
      : item.type === "text"
        ? { text: "Written answer", color: "var(--ink-3)" }
        : item.onScreen
          ? gone(liveState)
            ? { text: "Where they stopped", color: "var(--amber-fg)" }
            : { text: "On screen now", color: "var(--jade)" }
          : item.isCorrect === true
            ? { text: "Right", color: "var(--jade)" }
            : item.partial
              ? { text: "Half right", color: "var(--amber-fg)" }
              : item.isCorrect === false
                ? { text: "Wrong", color: "var(--crit)" }
                : null;
  // Right/Wrong is how the answer was marked when they took it; the green
  // ticks come from the answer key. If the job's key has changed since,
  // the two can disagree, and the sheet says so instead of contradicting itself.
  const pickJudgedNow =
    item.type === "multiple_choice" && keysReady && correct != null && item.picked.length === 1
      ? correct.indexes.includes(item.picked[0])
      : null;
  const keyChanged = pickJudgedNow != null && item.isCorrect != null && pickJudgedNow !== item.isCorrect;
  const time =
    item.seconds != null
      ? `${item.approximate ? "about " : ""}${secondsText(item.seconds)}${item.changes > 0 ? ` · changed ${item.changes}×` : ""}`
      : null;

  return (
    <li className="rounded-[10px] border px-3.5 py-3" style={{ borderColor: "var(--line-soft)", background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px]" style={{ color: "var(--ink-3)" }}>
          Question {item.index + 1}
          {item.category ? ` · ${item.category.replace(/_/g, " ")}` : ""}
          {time && (
            <span
              className="ck-num font-semibold"
              style={{ color: "var(--ink-2)" }}
              title={item.approximate ? "Timed from their previous answer, not from when the question appeared" : "Time on this question, by the server's clock"}
            >
              {" "}
              · {time}
            </span>
          )}
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
          {item.textAnswer ?? (live ? "No answer yet" : "Not answered")}
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
                    {picked ? (live ? "Their pick so far" : "Their pick") : "Right answer"}
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
      {item.options.length > 0 && item.picked.length === 0 && item.type !== "text" && !item.onScreen && (
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--ink-3)" }}>
          {item.pickedText.length > 0 ? `Their pick (no longer an option): ${item.pickedText.join("; ")}` : live ? "No pick yet" : "Not answered"}
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

function QuizBody({
  detail,
  jobId,
  enabled,
  loading,
}: {
  detail: Extract<AssessmentDetail, { kind: "quiz" }>;
  jobId: string | null;
  enabled: boolean;
  loading: boolean;
}) {
  // The right answers are never in notes (the candidate can read their own
  // notes). Owner and team read them through get_job_quiz_keys, only while
  // this sheet is open; anyone else is refused, and that reads as
  // "unavailable", never as a broken sheet. An attempt the server graded
  // carries its own right answers (correctTexts), which win.
  // Not while the quiz is still being answered: the key is shown once it is
  // sent. The query stays off, and keys another sheet already loaded for this
  // job (the cache is per job) are not used either.
  const sent = !detail.live;
  const keysQ = useQuery({
    queryKey: ["job-quiz-keys", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_job_quiz_keys", { p_job_id: jobId! });
      if (error) throw error;
      return (data ?? []) as QuizKeyRow[];
    },
    enabled: enabled && !!jobId && sent,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const keys = useMemo(() => quizKeyMap(keysQ.data, detail.keyStepId), [keysQ.data, detail.keyStepId]);
  const keysReady = sent && keysQ.isSuccess && keys.size > 0;
  const graded = sent && detail.items.some((i) => i.correctTexts != null);

  const keyNote = graded || !sent
    ? null
    : !jobId || keysQ.isError
      ? "Correct answers unavailable — showing what they picked and whether it was marked right."
      : keysQ.isLoading
        ? "Looking up the answer key…"
        : keysQ.isSuccess && keys.size === 0
          ? "No answer key is stored for this quiz — showing what they picked and whether it was marked right."
          : null;

  // Time per question, from the server's clock when it was recorded.
  const timed = detail.items.filter((i) => i.seconds != null);
  const totalSecs = timed.reduce((n, i) => n + (i.seconds ?? 0), 0);
  const slowest = timed.reduce<QuizItem | null>((a, b) => (!a || (b.seconds ?? 0) > (a.seconds ?? 0) ? b : a), null);
  const approximate = timed.some((i) => i.approximate);

  return (
    <>
      {detail.live && (
        <LiveNote
          doing="Still answering. Every question they have seen so far, with their pick and the time on it. The answer key and the score show once they send it."
          left="Never sent. Every question they saw before they left, with their pick and the time on it. The answer key shows only for a quiz they send."
        />
      )}
      <Facts
        items={[
          ...(detail.correct != null && detail.total != null
            ? [{ label: "Right", value: `${formatCount(detail.correct)} of ${formatCount(detail.total)}`, tone: detail.passed === false ? "var(--amber-fg)" : "var(--jade)" }]
            : []),
          ...(detail.score != null ? [{ label: "Score", value: `${Math.round(detail.score)}%`, note: detail.passed === true ? "Passed" : detail.passed === false ? "Did not pass" : null }] : []),
          ...(detail.live && detail.total != null
            ? [{ label: "Seen so far", value: `${detail.items.length} of ${detail.total}` }]
            : []),
          ...(timed.length > 0
            ? [{ label: "Time on it", value: `${approximate ? "about " : ""}${secondsText(totalSecs)}`, note: `${timed.length} ${timed.length === 1 ? "question" : "questions"} timed` }]
            : []),
          ...(slowest && slowest.seconds != null && timed.length > 1
            ? [{ label: "Longest on one", value: secondsText(slowest.seconds), note: `Question ${slowest.index + 1}` }]
            : []),
        ]}
      />
      <Section title={detail.live ? `So far · ${detail.items.length}` : `Every question · ${detail.items.length}`}>
        {keyNote && (
          <p className="mb-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
            {keyNote}
          </p>
        )}
        {detail.items.length === 0 ? (
          loading ? (
            <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
              Loading their answers…
            </p>
          ) : (
            <NotKept>
              {detail.live ? "No question on screen yet." : "Only the score was kept for this quiz, not the answers question by question."}
            </NotKept>
          )
        ) : (
          <ol className="flex flex-col gap-2">
            {detail.items.map((item) => {
              const correct = !sent
                ? null
                : item.correctTexts
                ? correctOptionsFor(item, { correct_answers: item.correctTexts })
                : keysReady
                  ? correctOptionsFor(item, keys.get(item.id))
                  : null;
              return <QuizQuestion key={item.id} item={item} keysReady={correct != null} correct={correct} live={detail.live} />;
            })}
          </ol>
        )}
      </Section>
    </>
  );
}

/** Words of a passage or of what they typed, mistakes marked. */
function Words({ words, side }: { words: TypingWord[]; side: "passage" | "typed" }) {
  return (
    <p
      className="rounded-[8px] border px-3 py-2.5 text-[13px] leading-[1.75]"
      // Both as boxes, so the two columns line up; the passage is the quieter one.
      style={{ background: side === "passage" ? "transparent" : "var(--surface)", borderColor: side === "passage" ? "var(--line)" : "var(--line-soft)", borderStyle: side === "passage" ? "dashed" : "solid" }}
    >
      {words.map((w, i) => {
        const style: React.CSSProperties =
          w.state === "ok"
            ? { color: side === "passage" ? "var(--ink-2)" : "var(--ink)" }
            : w.state === "missed"
              ? { color: "var(--ink-3)", opacity: 0.55 }
              : w.state === "extra"
                ? { color: "var(--crit)", textDecoration: "underline dotted" }
                : side === "typed"
                  ? { color: "var(--crit)", background: "var(--crit-bg)", borderRadius: 3, padding: "0 2px" }
                  : { color: "var(--amber-fg)", textDecoration: "underline", textDecorationColor: "var(--amber-fg)", textUnderlineOffset: 3 };
        return (
          <span key={i}>
            <span style={style} title={w.state === "wrong" && w.expected ? `The passage says "${w.expected}"` : w.state === "extra" ? "Past the end of the passage" : undefined}>
              {w.text}
            </span>{" "}
          </span>
        );
      })}
    </p>
  );
}

function TypingBody({ detail }: { detail: Extract<AssessmentDetail, { kind: "typing_test" }> }) {
  const slow = detail.wpm != null && detail.requiredWpm != null && detail.wpm < detail.requiredWpm;
  const sloppy = detail.accuracy != null && detail.requiredAccuracy != null && detail.accuracy < detail.requiredAccuracy;
  const missed = detail.words ? detail.words.passage.filter((w) => w.state === "missed").length : 0;
  return (
    <>
      {detail.live && (
        <LiveNote
          doing="Typing now. This is what they have typed so far; the numbers come when they send it."
          left="Never sent. This is what they had typed when they left."
        />
      )}
      <Facts
        items={[
          ...(detail.wpm != null
            ? [{ label: "Speed", value: `${Math.round(detail.wpm)} WPM`, note: detail.requiredWpm != null ? `The job asks for ${detail.requiredWpm}` : null, tone: slow ? "var(--amber-fg)" : "var(--ink)" }]
            : []),
          ...(detail.accuracy != null
            ? [{ label: "Accuracy", value: `${Math.round(detail.accuracy)}%`, note: detail.requiredAccuracy != null ? `The job asks for ${detail.requiredAccuracy}%` : null, tone: sloppy ? "var(--amber-fg)" : "var(--ink)" }]
            : []),
          ...(detail.score != null ? [{ label: "Combined score", value: String(Math.round(detail.score)) }] : []),
          ...(detail.seconds != null ? [{ label: "Time", value: secondsText(detail.seconds), note: detail.runs != null && detail.runs > 1 ? `${detail.runs} tries` : null }] : []),
        ]}
      />
      <Section
        title="What they typed"
        aside={
          detail.words ? (
            <span className="text-[11px] font-semibold" style={{ color: detail.words.wrong > 0 ? "var(--amber-fg)" : "var(--jade)" }}>
              {detail.words.wrong === 0 ? "No wrong words" : `${detail.words.wrong} wrong ${detail.words.wrong === 1 ? "word" : "words"}`}
              {missed > 0 ? ` · ${missed} not reached` : ""}
            </span>
          ) : undefined
        }
      >
        {detail.words ? (
          <>
            {/* Side by side from 768px; stacked on a phone. Word i of what they
                typed is checked against word i of the passage — the grader's
                own rule — so a red word is one the accuracy counted wrong. */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <span className="mb-1 block text-[11px]" style={{ color: "var(--ink-3)" }}>The passage</span>
                <Words words={detail.words.passage} side="passage" />
              </div>
              <div>
                <span className="mb-1 block text-[11px]" style={{ color: "var(--ink-3)" }}>{detail.live ? "Typed so far" : "What they typed"}</span>
                <Words words={detail.words.typed} side="typed" />
              </div>
            </div>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--ink-3)" }}>
              <span>
                <span className="rounded-[3px] px-[3px]" style={{ background: "var(--crit-bg)", color: "var(--crit)" }}>red</span> typed wrong
              </span>
              <span>
                <span style={{ textDecoration: "underline", textDecorationColor: "var(--amber-fg)", color: "var(--amber-fg)" }}>underlined</span> what the passage had there
              </span>
              <span style={{ opacity: 0.7 }}>faded: never reached</span>
            </p>
          </>
        ) : detail.passage || detail.typed ? (
          <div className="flex flex-col gap-3">
            {detail.passage && (
              <div>
                <span className="mb-1 block text-[11px]" style={{ color: "var(--ink-3)" }}>The passage</span>
                <p className="rounded-[8px] px-3 py-2.5 text-[13px] leading-[1.6]" style={{ background: "var(--ground-2)", color: "var(--ink-2)" }}>
                  {detail.passage}
                </p>
              </div>
            )}
            {detail.typed ? (
              <div>
                <span className="mb-1 block text-[11px]" style={{ color: "var(--ink-3)" }}>What they typed</span>
                <p className="whitespace-pre-wrap rounded-[8px] border px-3 py-2.5 text-[13px] leading-[1.6]" style={{ borderColor: "var(--line-soft)", background: "var(--surface)", color: "var(--ink)" }}>
                  {detail.typed}
                </p>
              </div>
            ) : (
              <NotKept>{detail.live ? "Nothing typed yet." : "What they typed was not kept for this attempt — only the numbers above."}</NotKept>
            )}
          </div>
        ) : (
          <NotKept>The passage and what they typed were not kept for this attempt — only the numbers above.</NotKept>
        )}
      </Section>
    </>
  );
}

function ChatPracticeBody({
  detail,
  candidate,
  flags,
  loading,
}: {
  detail: Extract<AssessmentDetail, { kind: "chat_simulation" }>;
  candidate: string;
  flags: IntegrityEvent[];
  loading: boolean;
}) {
  return (
    <>
      {detail.live && (
        <LiveNote
          doing="The practice chat is still going. This is the conversation so far."
          left="They left the practice chat before it ended. This is the whole conversation up to then."
        />
      )}
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
          <Transcript
            turns={detail.transcript}
            candidateName={candidate}
            otherName={detail.customerName ? `${detail.customerName} (player)` : "Player"}
            events={flags}
          />
        ) : loading ? (
          <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
            Loading the conversation…
          </p>
        ) : detail.live ? (
          <NotKept>No messages yet.</NotKept>
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
  loading,
}: {
  detail: Extract<AssessmentDetail, { kind: "chat_interview" }>;
  candidate: string;
  events: IntegrityEvent[];
  loading: boolean;
}) {
  const declined = detail.recommendation != null && /\bno\b|not|reject|decline/i.test(detail.recommendation);
  return (
    <>
      {detail.live && (
        <LiveNote
          doing="The interview is still going. This is the conversation so far."
          left="They left the interview before it ended. This is the whole conversation up to then."
        />
      )}
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
        ) : loading ? (
          <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
            Loading the conversation…
          </p>
        ) : detail.live ? (
          <NotKept>No messages yet.</NotKept>
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

function GenericBody({ detail, candidate, live }: { detail: Extract<AssessmentDetail, { kind: "generic" }>; candidate: string; live: boolean }) {
  return (
    <>
      {live && <LiveNote doing="Still being taken. What is on the record so far is below." left="Never finished. What is on the record is below." />}
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
      {!live && detail.facts.length === 0 && !detail.summary && detail.lists.length === 0 && !detail.transcript && (
        <NotKept>This step is marked done, but nothing more about it is on the record.</NotKept>
      )}
    </>
  );
}

function IntegrityBody({ detail, loading }: { detail: Extract<AssessmentDetail, { kind: "integrity" }>; loading: boolean }) {
  return (
    <>
      <p className="text-[13px] leading-[1.55]" style={{ color: "var(--ink-2)" }}>
        Recorded while each test was open. A switch away can be a notification or a second screen — worth asking
        about, not proof on its own. Switches under a second are on the timeline but never counted.
      </p>
      {detail.groups.map((g) => (
        <Section
          key={g.key}
          title={g.title}
          aside={<span className="text-[11px] font-semibold" style={{ color: "var(--amber-fg)" }}>{g.tally.total} {g.tally.total === 1 ? "flag" : "flags"}</span>}
        >
          <p className="mb-2 text-[13px]" style={{ color: "var(--ink-2)" }}>
            {integritySummary(g.tally)}.
          </p>
          {g.timeline && g.timeline.length > 0 ? (
            <Timeline items={g.timeline} />
          ) : g.tally.events.length > 0 ? (
            <FlagList events={g.tally.events} />
          ) : g.sessionId && loading ? (
            <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
              Loading the timeline…
            </p>
          ) : g.tally.fromSession ? null : (
            <p className="text-[12px]" style={{ color: "var(--ink-3)" }}>
              Only the counts were kept for this test, not the times.
            </p>
          )}
        </Section>
      ))}
    </>
  );
}

/* ── The sheet ─────────────────────────────────────────────────────────── */

export function AssessmentRecordSheet({
  open,
  entry,
  candidateName,
  applicationId = null,
  jobId,
  onClose,
  onOpenResume,
  focus = null,
}: AssessmentRecordSheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const integrityRef = useRef<HTMLElement>(null);
  const isOpen = open && !!entry;
  const now = useNow(30_000);

  // The server's record of the attempt, only while the sheet is open. The
  // "Integrity checks" row reads every test's integrity events at once.
  const combined = entry?.kind === "integrity";
  const eventsQ = useSessionEvents(entry?.session?.id ?? null, isOpen && !combined);
  const integrityQ = useApplicationIntegrityEvents(applicationId, isOpen && combined);
  const events = combined ? integrityQ.data : eventsQ.data;
  const loading = combined
    ? integrityQ.isLoading && integrityQ.fetchStatus !== "idle"
    : !!entry?.session && eventsQ.isLoading && eventsQ.fetchStatus !== "idle";
  const shown = useMemo(() => (entry ? withSessionEvents(entry, events) : null), [entry, events]);

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

  // Opened from an integrity alert: land on the timeline, once it is drawn.
  const timelineReady = !!shown?.timeline?.length || (shown?.integrity.total ?? 0) > 0;
  useEffect(() => {
    if (!isOpen || focus !== "integrity" || !timelineReady) return;
    const t = window.setTimeout(() => integrityRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 120);
    return () => window.clearTimeout(t);
  }, [isOpen, focus, timelineReady, loading]);

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

  if (!isOpen || !entry || !shown) return null;

  const detail = shown.detail;
  const who = firstName(candidateName);
  const finished = when(shown.completedAt);
  const sub = [shown.verdict, shown.subline].filter(Boolean).join(" · ");
  const inProgress = shown.status === "in_progress";
  const live = inProgress ? shown.session?.live ?? null : null;
  // Reopened and not started: the body is the earlier attempt's result.
  const retake = shown.retake === "open";
  const flags = inlineFlags(shown.timeline);
  // An older interview's own list, as flags in its transcript (never a
  // recorded-only right-click).
  const notesFlags = shown.integrity.events.filter((e) => !e.recordedOnly);

  let body: ReactNode = null;
  if (detail) {
    switch (detail.kind) {
      case "application":
        body = <ApplicationBody detail={detail} onOpenResume={onOpenResume} applicationId={applicationId} now={now} />;
        break;
      case "quiz":
        body = <QuizBody detail={detail} jobId={jobId} enabled={isOpen} loading={loading} />;
        break;
      case "typing_test":
        body = <TypingBody detail={detail} />;
        break;
      case "chat_simulation":
        body = <ChatPracticeBody detail={detail} candidate={who} flags={flags} loading={loading} />;
        break;
      case "chat_interview":
        body = (
          <InterviewBody
            detail={detail}
            candidate={who}
            events={flags.length > 0 ? flags : notesFlags}
            loading={loading}
          />
        );
        break;
      case "voice_interview":
        body = <VoiceBody detail={detail} candidate={who} />;
        break;
      case "generic":
        body = <GenericBody detail={detail} candidate={who} live={inProgress && !retake} />;
        break;
      case "integrity":
        body = <IntegrityBody detail={detail} loading={loading} />;
        break;
      default:
        body = null;
    }
  }
  // The timeline closes every test's sheet (the interview also places its
  // flags inside the transcript, where they happened). Without a timeline,
  // the notes' interview flags are already in its transcript, so they are not
  // listed twice. The integrity sheet IS the flags.
  const notesFlagsInline =
    detail?.kind === "chat_interview" && !!detail.transcript && !shown.timeline?.length && notesFlags.length > 0 && shown.integrity.total > 0;
  const showIntegrity = shown.kind !== "integrity" && !notesFlagsInline && (shown.integrity.total > 0 || !!shown.timeline?.length);
  const attempt = shown.session && shown.session.attempt > 1 ? `Attempt ${shown.session.attempt}` : null;
  // When staff handed the step back (assessment_step_reopens), and how often.
  const reopenedAt = shown.reopen?.at ? Date.parse(shown.reopen.at) : NaN;
  const handedBack = [
    Number.isFinite(reopenedAt) ? agoText(Math.max(0, now - reopenedAt)) : null,
    shown.reopen?.count != null && shown.reopen.count > 1 ? `(handed back ${shown.reopen.count} times)` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end">
      {/* scrim — the panel behind stays in view on a wide screen */}
      <div
        className="absolute inset-0"
        style={{
          // A blur, not a wash. --ink flips to near-white in Night, so a 40% ink
          // layer turned the page behind white (owner, 2026-10-05: "it should
          // become blur, not white"). --slab stays dark in both themes.
          background: "color-mix(in srgb, var(--slab) 22%, transparent)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${shown.title} — ${candidateName}`}
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
              shown.kind === "integrity"
                ? { background: "var(--amber-bg)", color: "var(--amber-fg)" }
                : inProgress
                  ? { background: "var(--ground-2)", color: "var(--ink-2)" }
                  : { background: "var(--jade-soft)", color: "var(--jade-soft-fg)" }
            }
          >
            <EntryIcon entry={shown} className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[18px] font-semibold leading-[1.2]" style={{ color: "var(--ink)" }}>
              {shown.title}
            </div>
            <div className="mt-[3px] truncate text-[12px]" style={{ color: "var(--ink-3)" }}>
              {candidateName}
              {attempt ? ` · ${attempt}` : ""}
            </div>
            {/* Where they are right now, for a test still being taken. */}
            {inProgress && (
              <div className="mt-2 flex items-start gap-1.5 text-[12.5px] font-semibold leading-[1.4]" style={{ color: live ? liveTone(live.state) : "var(--ink-2)" }}>
                {retake ? (
                  <RotateCcw aria-hidden className="mt-[2px] h-3.5 w-3.5 shrink-0" style={{ color: "var(--ink-3)" }} />
                ) : (
                  <LiveDot state={live?.state ?? null} className="mt-[5px]" />
                )}
                <span>{shown.statusLabel}</span>
              </div>
            )}
            {/* The number, then the judgment and when — under the title, so a
                long step name never has to share its line with the figure. */}
            {!inProgress && (shown.headline || sub || finished) && (
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                {shown.headline && (
                  <span className="ck-num text-[24px] font-semibold leading-none" style={{ color: toneColor(shown.tone) }}>
                    {shown.headline}
                  </span>
                )}
                {(sub || finished) && (
                  <span className="text-[12px] leading-[1.4]">
                    {sub && (
                      <span
                        className="font-semibold"
                        style={{ color: shown.tone === "amber" && shown.verdict ? "var(--amber-fg)" : "var(--ink-2)" }}
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
          {shown.retake === "open" && (
            <AttemptNote icon={<RotateCcw className="h-3.5 w-3.5" />}>
              Reopened for a retake{handedBack ? ` ${handedBack}` : ""}. This is {who}&rsquo;s earlier attempt
              {shown.headline ? <span className="ck-num font-semibold"> ({shown.headline})</span> : null}; the new one has not started yet.
            </AttemptNote>
          )}
          {shown.retake !== "open" && shown.reopen && inProgress && (
            <AttemptNote icon={<RotateCcw className="h-3.5 w-3.5" />}>
              Reopened for a retake{handedBack ? ` ${handedBack}` : ""}. The earlier result stays on file until this attempt is sent.
            </AttemptNote>
          )}
          {shown.kind !== "integrity" && shown.earlierIntegrity && shown.earlierIntegrity.length > 0 && (
            <AttemptNote icon={<AlertCircle className="h-3.5 w-3.5" />} tone="var(--amber-fg)">
              {shown.earlierIntegrity.map((e) => (
                <span key={e.sessionId} className="block">
                  <span className="font-semibold">Attempt {e.attempt}:</span> {lowerFirstWord(integritySummary(e.tally) ?? "")}.
                </span>
              ))}
              <span className="block" style={{ color: "var(--ink-3)" }}>
                Counted on its own, not in this attempt; its timeline is under Integrity checks.
              </span>
            </AttemptNote>
          )}
          <LiveStateContext.Provider value={retake ? null : inProgress ? live?.state ?? "doing" : null}>{body}</LiveStateContext.Provider>
          {showIntegrity && (
            <IntegrityBlock
              tally={shown.integrity}
              timeline={shown.timeline}
              loading={loading}
              form={shown.kind === "application"}
              sectionRef={integrityRef}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default AssessmentRecordSheet;
