import type { ReactNode } from "react";
import { format } from "date-fns";
import type { AssessmentRecord } from "../lib/assessmentRecord";
import { timelineMoments } from "../lib/applicantProfile";

/**
 * Where they have been, left to right, on the full profile. Only moments the
 * record can date: applied, then each test they finished at the time it
 * finished, then the decision (timelineMoments in ../lib/applicantProfile.ts).
 */

/** The fields of the application row the timeline reads. */
export interface TimelineApp {
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const when = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : format(d, "EEE h:mm a");
};

function Strip({ steps }: { steps: ReactNode[] }) {
  if (steps.length === 0) return null;
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-2 rounded-[10px] px-[14px] py-[9px] text-[11px]"
      style={{ background: "var(--ground-2)", color: "var(--ink-2)" }}
    >
      {steps.map((step, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && (
            <span aria-hidden style={{ color: "var(--ink-3)" }}>
              →
            </span>
          )}
          {step}
        </span>
      ))}
    </div>
  );
}

export function ApplicantTimeline({ app, record }: { app?: TimelineApp | null; record: AssessmentRecord | null }) {
  const moments = timelineMoments(app, record);
  const decisionTone = app?.status === "rejected" ? "var(--crit)" : "var(--jade-soft-fg)";
  return (
    <Strip
      steps={moments.map((m) =>
        m.kind === "applied" ? (
          <b key={m.key} style={{ color: "var(--ink)" }}>
            {m.label} {when(m.at)}
          </b>
        ) : m.kind === "decision" ? (
          <span key={m.key} style={{ color: decisionTone, fontWeight: 600 }}>
            {m.label} {when(m.at)}
          </span>
        ) : (
          <span key={m.key}>
            {m.label} {when(m.at)}
          </span>
        ),
      )}
    />
  );
}

export default ApplicantTimeline;
