import type { JobStatus } from "../data";

const CHIP: Record<JobStatus, { label: string; bg: string; fg: string }> = {
  live: { label: "Live", bg: "var(--jade-soft)", fg: "var(--jade-soft-fg)" },
  draft: { label: "Draft", bg: "var(--amber-bg)", fg: "var(--amber-fg)" },
  closed: { label: "Closed", bg: "var(--surface-2)", fg: "var(--ink-2)" },
};

/** Live, Draft, Closed (or Filled: closed with a hire), beside a job's name. */
export function JobStatusChip({ status, filled }: { status: JobStatus; filled?: boolean }) {
  const chip = CHIP[status];
  return (
    <span
      className="ml-2 inline-block rounded-[5px] px-2 py-[3px] align-middle text-[10px] font-bold uppercase leading-none tracking-[0.06em]"
      style={{ background: chip.bg, color: chip.fg, position: "relative", top: -1 }}
    >
      {status === "closed" && filled ? "Filled" : chip.label}
    </span>
  );
}
