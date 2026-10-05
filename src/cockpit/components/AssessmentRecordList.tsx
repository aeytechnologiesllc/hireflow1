import {
  AudioLines,
  ChevronRight,
  FileText,
  Keyboard,
  ListChecks,
  Mail,
  MessageCircle,
  ShieldAlert,
  Video,
  type LucideIcon,
} from "lucide-react";
import { toneColor, type AssessmentEntry } from "../lib/assessmentRecord";

/**
 * "What they submitted" — one row per test the job gives this applicant, in
 * the job's order (see ../lib/assessmentRecord.ts). A finished test is a
 * button that opens its full record in AssessmentRecordSheet; a test they have
 * not reached yet sits in the list, quiet and inert, so the owner can see the
 * whole road and where this person is on it.
 *
 * Built from the material of the tiles it replaces (EvidenceTiles: the 10px
 * label, the ck-num figure, the soft-shadowed surface, the ck-lift press), so
 * nothing about the panel's look changes except that every test is now there
 * and every finished one opens.
 */

const ICONS: Record<string, LucideIcon> = {
  application: Mail,
  resume: FileText,
  quiz: ListChecks,
  typing_test: Keyboard,
  chat_simulation: MessageCircle,
  chat_interview: MessageCircle,
  sales_simulation: MessageCircle,
  voice_interview: AudioLines,
  video_intro: Video,
  video_message: Video,
  portfolio_upload: FileText,
  integrity: ShieldAlert,
};

/** The step's glyph — the same one its gem wears on the journey rail. */
export function EntryIcon({ entry, className }: { entry: Pick<AssessmentEntry, "stepType">; className?: string }) {
  const Icon = ICONS[entry.stepType] ?? Mail;
  return <Icon className={className} strokeWidth={2.2} />;
}

/** The 10px all-caps rule the cockpit uses for every small label. */
function Label({ children, color = "var(--ink-3)" }: { children: React.ReactNode; color?: string }) {
  // Wraps rather than truncates: a job names its own steps, and "Typing speed
  // and accuracy" cut to "TYPING SPEED AND ACC…" beside its number hides it.
  return (
    <span className="block break-words text-[10px] font-bold uppercase leading-[1.25] tracking-[0.1em]" style={{ color }}>
      {children}
    </span>
  );
}

function RecordRow({ entry, onOpen }: { entry: AssessmentEntry; onOpen: (entry: AssessmentEntry) => void }) {
  const done = entry.status === "done";
  const live = entry.status === "in_progress";
  const flags = entry.kind === "integrity" ? 0 : entry.integrity.total;
  // The line under the label: the judgment, then the facts — or, for a test
  // not finished, simply where it stands.
  const line = done
    ? [entry.verdict, entry.subline].filter(Boolean).join(" · ") || entry.statusLabel
    : entry.statusLabel;

  const body = (
    <>
      <span
        aria-hidden
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full"
        style={
          done
            ? entry.kind === "integrity"
              ? { background: "var(--amber-bg)", color: "var(--amber-fg)" }
              : { background: "var(--jade-soft)", color: "var(--jade-soft-fg)" }
            : { background: "var(--ground-2)", color: "var(--ink-3)" }
        }
      >
        <EntryIcon entry={entry} className="h-[15px] w-[15px]" />
      </span>

      <span className="min-w-0 flex-1">
        <Label>{entry.title}</Label>
        <span
          className="mt-[3px] flex min-w-0 items-center gap-1.5 text-[11.5px] leading-[1.3]"
          style={{ color: done && entry.tone === "amber" && entry.verdict ? "var(--amber-fg)" : "var(--ink-3)" }}
        >
          {live && <span className="ck-dot ck-dot-live shrink-0" aria-hidden />}
          <span className="truncate">{line}</span>
        </span>
      </span>

      {done && (
        <span className="flex shrink-0 flex-col items-end">
          {entry.headline && (
            <span className="ck-num text-[17px] font-semibold leading-[1.1]" style={{ color: toneColor(entry.tone) }}>
              {entry.headline}
            </span>
          )}
          {flags > 0 && (
            <span className="mt-[3px] inline-flex items-center gap-1 text-[10.5px] font-semibold" style={{ color: "var(--amber-fg)" }}>
              <span aria-hidden className="block h-[6px] w-[6px] rounded-full" style={{ background: "var(--amber-fg)" }} />
              {flags} {flags === 1 ? "flag" : "flags"}
            </span>
          )}
        </span>
      )}

      {entry.openable && (
        <ChevronRight
          aria-hidden
          className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-[2px]"
          style={{ color: "var(--ink-3)" }}
        />
      )}
    </>
  );

  const shape = "flex min-h-[52px] w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left";

  if (!entry.openable) {
    return (
      <div
        className={shape}
        style={{
          borderColor: "var(--line-soft)",
          background: done || live ? "var(--surface)" : "transparent",
          borderStyle: done || live ? "solid" : "dashed",
        }}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      aria-label={`${entry.title}: ${[entry.headline, line].filter(Boolean).join(", ")}. Open what they submitted.`}
      className={`${shape} ck-lift group transition-transform duration-150 hover:border-[var(--hair)] active:scale-[0.98]`}
      style={{ borderColor: "var(--line-soft)", background: "var(--surface)", boxShadow: "var(--hf-shadow-soft)", cursor: "pointer" }}
    >
      {body}
    </button>
  );
}

export function AssessmentRecordList({
  entries,
  onOpen,
  layout = "stack",
  label = "What they submitted",
  className = "",
}: {
  entries: AssessmentEntry[];
  onOpen: (entry: AssessmentEntry) => void;
  /** "stack": one column (phones, the ≥1160px left rail). "grid": two
   *  columns from 640px, for the wider panel below the letterhead. */
  layout?: "stack" | "grid";
  /** The list's own heading; null when the card around it already has one. */
  label?: string | null;
  className?: string;
}) {
  if (entries.length === 0) return null;
  return (
    <section className={className} aria-label={label ?? "What they submitted"}>
      {label && (
        <div className="mb-2">
          <Label>{label}</Label>
        </div>
      )}
      <div className={layout === "grid" ? "grid grid-cols-1 gap-2 sm:grid-cols-2" : "flex flex-col gap-1.5"}>
        {entries.map((entry) => (
          <RecordRow key={entry.key} entry={entry} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

export default AssessmentRecordList;
