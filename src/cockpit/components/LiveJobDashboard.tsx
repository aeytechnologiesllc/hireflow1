/**
 * LiveJobDashboard.tsx — the Dashboard once a live job has applicants.
 *
 * The owner, 2026-11-02, five hours into his second hiring run (81 applied,
 * 30 finished every test): the tiles "Applicants 237 all time, In progress
 * 173 ... that's not what they want to see. They want to see what's going on
 * ... who's the best", and the pipeline mixed his closed October job's steps
 * ("Escalated chat practice") into the live one's. So the page leads with the
 * live job itself: its own four numbers (each opening the list it counts),
 * its own steps, and its link; then the best so far (Dashboard.tsx's sealed
 * rows) and who is doing what right now, in the Applicants list's own words.
 *
 * Every number here is counted from the Applicants list's rows
 * (useApplicantList), so a number on this page and the list it opens always
 * agree.
 */
import { useCallback, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { applyLinkFor } from "./ShareJobCard";
import { LineText, Who } from "./ApplicantRow";
import type { ApplicantListRow } from "../lib/applicantList";
import type { LiveJobCounts } from "../lib/liveJobCounts";
export { liveJobCounts, type LiveJobCounts } from "../lib/liveJobCounts";
import type { JobRow } from "../data";

/** One of the card's four numbers: the count, its name, and where it leads. */
function Figure({ label, value, note, onClick, first = false }: { label: string; value: number; note?: string; onClick: () => void; first?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-w-0 flex-col items-start gap-0.5 px-4 py-2 text-left max-[640px]:px-3 ${first ? "" : "min-[641px]:border-l"}`}
      style={{ borderColor: "var(--line)" }}
    >
      <span className="text-[12px] font-medium" style={{ color: "var(--hf-text-muted)" }}>
        {label}
      </span>
      <span className="font-display ck-num transition-colors group-hover:text-[var(--action)]" style={{ fontSize: 30, lineHeight: 1.1, color: "var(--hf-text)", fontWeight: 600 }}>
        {value}
      </span>
      {note && (
        <span className="text-[11.5px]" style={{ color: "var(--hf-text-muted)" }}>
          {note}
        </span>
      )}
    </button>
  );
}

/**
 * The live job: what it is, that it is live, its four numbers, its own steps
 * (`steps`, Dashboard.tsx's mini rail of this job alone) and its link.
 */
export function LiveJobCard({
  job,
  counts,
  steps,
  onOpenList,
  index = 0,
}: {
  job: JobRow;
  counts: LiveJobCounts;
  steps: ReactNode;
  /** Opens Applicants on this job, with the list's own filter (?where=, ?score=, ?tab=). */
  onOpenList: (query: string) => void;
  index?: number;
}) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(applyLinkFor(job));
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy");
    }
  }, [job]);
  const job_ = `roleId=${encodeURIComponent(job.id)}`;
  const place = [job.location && job.location !== "Location TBD" ? job.location : null, job.pay || null].filter(Boolean).join(" · ");

  return (
    <section className="ck-card ck-reveal p-4 md:p-5" style={{ ["--ck-i" as string]: index }} aria-label={`${job.title}, live`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[12.5px] font-medium" style={{ color: "var(--good)" }}>
            <span className="ck-dot ck-dot-live" aria-hidden />
            Live · {job.dateLabel.toLowerCase()} {job.date}
          </p>
          <h2 className="font-display mt-1 text-[22px] leading-[1.2]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
            {job.title}
          </h2>
          {place && (
            <p className="mt-0.5 text-[13px]" style={{ color: "var(--hf-text-muted)" }}>
              {place}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button className="ck-btn ck-btn-outline !py-2 !text-[13px]" onClick={() => void copy()}>
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <button className="ck-btn ck-btn-primary !py-2 !text-[13px]" onClick={() => onOpenList(job_)}>
            Open applicants
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-y-2 rounded-[12px] py-2 min-[641px]:grid-cols-4" style={{ background: "var(--surface-2)" }}>
        <Figure first label="Applied" value={counts.applied} note={counts.appliedToday > 0 ? `${counts.appliedToday} today` : undefined} onClick={() => onOpenList(job_)} />
        <Figure label="Finished every test" value={counts.finished} onClick={() => onOpenList(`${job_}&where=finished`)} />
        <Figure label="Scored 70 or more" value={counts.seventyUp} note="of those finished" onClick={() => onOpenList(`${job_}&where=finished&score=70-up`)} />
        <Figure label="Waiting on you" value={counts.waiting} note="finished, not decided" onClick={() => onOpenList(`${job_}&tab=needs-review`)} />
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[12px] font-medium" style={{ color: "var(--hf-text-muted)" }}>
          Where everyone is, step by step
        </p>
        {steps}
      </div>
    </section>
  );
}

/**
 * Who is doing what, newest first: each person's own line from the
 * Applicants list ("Chat practice · step 4 of 6 · live", "Finished every
 * test · Ava suggests: interview") and when they last moved.
 */
export function HappeningNow({
  rows,
  counts,
  onOpen,
  onSeeAll,
  index = 0,
}: {
  rows: readonly ApplicantListRow[];
  counts: Pick<LiveJobCounts, "takingNow" | "onFormNow">;
  onOpen: (row: ApplicantListRow) => void;
  onSeeAll: () => void;
  index?: number;
}) {
  const latest = [...rows]
    .filter((r) => r.lastActiveAt)
    .sort((a, b) => Date.parse(b.lastActiveAt as string) - Date.parse(a.lastActiveAt as string))
    .slice(0, 6);
  return (
    <section className="ck-card ck-reveal flex min-w-0 flex-col p-4 md:p-5" style={{ ["--ck-i" as string]: index }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-display text-[16px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
          Happening now
        </h2>
        <button className="text-[12.5px] font-medium" style={{ color: "var(--action-soft-fg)" }} onClick={onSeeAll}>
          See everyone →
        </button>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]" style={{ color: "var(--hf-text-soft)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span className={`ck-dot ${counts.takingNow > 0 ? "ck-dot-live" : "ck-dot-draft"}`} aria-hidden />
          <span className="ck-num font-semibold" style={{ color: "var(--hf-text)" }}>{counts.takingNow}</span> taking tests
        </span>
        <span>
          <span className="ck-num font-semibold" style={{ color: "var(--hf-text)" }}>{counts.onFormNow}</span> on the form
        </span>
      </p>
      {latest.length > 0 ? (
        <ul className="mt-2">
          {latest.map((row, i) => (
            <li key={row.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
              <button type="button" onClick={() => onOpen(row)} className="flex w-full items-center gap-3 py-2.5 text-left">
                <Who row={row} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium" style={{ color: "var(--hf-text)" }}>
                    {row.name}
                  </span>
                  <LineText line={row.line} className="block truncate text-[12px] leading-[1.4]" style={{ color: "var(--hf-text-muted)" }} />
                </span>
                <span className="shrink-0 text-[11.5px]" style={{ color: row.liveNow ? "var(--good)" : "var(--hf-text-muted)" }}>
                  {row.activeWords}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[13px]" style={{ color: "var(--hf-text-soft)" }}>
          Nobody has started yet. The moment someone does, you'll see it here.
        </p>
      )}
    </section>
  );
}

/** Another live job, in one line: its name and the same four numbers, each opening its list. */
export function LiveJobLine({ job, counts, onOpenList, index = 0 }: { job: JobRow; counts: LiveJobCounts; onOpenList: (query: string) => void; index?: number }) {
  const job_ = `roleId=${encodeURIComponent(job.id)}`;
  const num = (value: number, label: string, query: string) => (
    <button type="button" onClick={() => onOpenList(query)} className="inline-flex items-baseline gap-1.5 whitespace-nowrap hover:opacity-80">
      <span className="ck-num font-semibold" style={{ color: "var(--hf-text)" }}>
        {value}
      </span>
      <span style={{ color: "var(--hf-text-muted)" }}>{label}</span>
    </button>
  );
  return (
    <div className="ck-card-flat ck-reveal flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-4 py-3" style={{ ["--ck-i" as string]: index }}>
      <button type="button" onClick={() => onOpenList(job_)} className="flex min-w-0 items-center gap-2 text-left">
        <span className="ck-dot ck-dot-live shrink-0" aria-hidden />
        <span className="truncate text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>
          {job.title}
        </span>
        <span className="shrink-0 text-[12.5px]" style={{ color: "var(--hf-text-muted)" }}>
          also live
        </span>
      </button>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
        {num(counts.applied, "applied", job_)}
        {num(counts.finished, "finished", `${job_}&where=finished`)}
        {num(counts.seventyUp, "scored 70+", `${job_}&where=finished&score=70-up`)}
        {num(counts.waiting, "waiting on you", `${job_}&tab=needs-review`)}
      </span>
    </div>
  );
}

/** The job's steps as a list, for a phone: each step's name and how many are on it now. */
export function StepList({ stages, className = "" }: { stages: ReadonlyArray<{ key: string; label: string; count: number }>; className?: string }) {
  return (
    <ul className={`grid grid-cols-2 gap-x-4 ${className}`}>
      {stages.map((stage) => (
        <li key={stage.key} className="flex items-baseline justify-between gap-2 py-1 text-[13px]" style={{ borderBottom: "1px solid var(--line)" }}>
          <span className="min-w-0 truncate" style={{ color: stage.count > 0 ? "var(--hf-text)" : "var(--hf-text-muted)" }}>
            {stage.label}
          </span>
          <span className="ck-num shrink-0 font-semibold" style={{ color: stage.count > 0 ? "var(--hf-text)" : "var(--hf-text-muted)" }}>
            {stage.count}
          </span>
        </li>
      ))}
    </ul>
  );
}
