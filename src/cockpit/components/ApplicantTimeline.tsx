import type { ReactNode } from "react";
import { format } from "date-fns";
import type { AssessmentRecord } from "../lib/assessmentRecord";
import { timelineMoments } from "../lib/applicantProfile";

/**
 * Where they have been, on the full profile. Only moments the record can
 * date: applied, then each test they finished at the time it finished, then
 * the decision (timelineMoments in ../lib/applicantProfile.ts).
 *
 * Two shapes of the same moments: a strip, left to right (the phone), and a
 * list down the desktop's right column, one moment a line with its result
 * beside it (docs/APPLICANT-PROFILE.md).
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

export function ApplicantTimeline({
  app,
  record,
  layout = "strip",
}: {
  app?: TimelineApp | null;
  record: AssessmentRecord | null;
  layout?: "strip" | "list";
}) {
  const moments = timelineMoments(app, record);
  const decisionTone = app?.status === "rejected" ? "var(--crit)" : "var(--jade-soft-fg)";

  if (layout === "list") {
    if (moments.length === 0) return null;
    return (
      <ol className="flex flex-col">
        {moments.map((m) => {
          const entry = m.kind === "step" ? record?.entries.find((e) => e.key === m.key) ?? null : null;
          // The result beside the step, the way the rail says it ("9/10 · passed").
          const result = entry?.receipt ?? null;
          const dot =
            m.kind === "decision"
              ? decisionTone
              : entry?.tone === "amber"
                ? "var(--brass)"
                : "var(--jade)";
          return (
            <li key={m.key} className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-start gap-2.5 py-[5px] text-[13px] leading-[1.45]">
              <span aria-hidden className="mt-[6px] block h-[9px] w-[9px] rounded-full" style={{ background: dot }} />
              <span className="min-w-0" style={{ color: m.kind === "decision" ? decisionTone : "var(--ink-2)", fontWeight: m.kind === "decision" ? 600 : 400 }}>
                {m.label}
                {result && (
                  // Its own colour, a plain space before it, and whole: when
                  // the line is too short it moves under the label as one
                  // piece, flush with the label's first letter (a margin
                  // there indented the wrapped line).
                  <>
                    {" "}
                    <span className="whitespace-nowrap" style={{ color: entry?.tone === "amber" ? "var(--amber-fg)" : "var(--ink-3)" }}>
                      {result}
                    </span>
                  </>
                )}
              </span>
              <span className="whitespace-nowrap pt-[1px] text-[12px] tabular-nums" style={{ color: "var(--ink-3)" }}>
                {when(m.at)}
              </span>
            </li>
          );
        })}
      </ol>
    );
  }

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
