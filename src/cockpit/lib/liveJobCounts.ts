/**
 * What one live job's card on the Dashboard counts (components/LiveJobDashboard.tsx),
 * from the Applicants list's rows of that job, so each number and the list it
 * opens always agree. Pure: scripts/live_job_dashboard.test.mjs runs it in Node.
 */
import type { ApplicantListRow } from "./applicantList";

/** What one live job's card counts, from the list's rows of that job. */
export interface LiveJobCounts {
  applied: number;
  appliedToday: number;
  finished: number;
  seventyUp: number;
  waiting: number;
  takingNow: number;
  onFormNow: number;
}

export function liveJobCounts(rows: ReadonlyArray<Pick<ApplicantListRow, "appliedAt" | "finished" | "score" | "tab" | "liveNow" | "onForm" | "decided">>, now: number): LiveJobCounts {
  const today = new Date(now).toDateString();
  return {
    applied: rows.length,
    appliedToday: rows.filter((r) => r.appliedAt && new Date(r.appliedAt).toDateString() === today).length,
    finished: rows.filter((r) => r.finished).length,
    seventyUp: rows.filter((r) => r.finished && (r.score ?? 0) >= 70).length,
    waiting: rows.filter((r) => r.tab === "needs-review").length,
    takingNow: rows.filter((r) => r.liveNow && !r.onForm && !r.decided).length,
    onFormNow: rows.filter((r) => r.liveNow && r.onForm).length,
  };
}

