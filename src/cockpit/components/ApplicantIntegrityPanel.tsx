import { useId } from "react";
import { ChevronRight, ShieldAlert, ShieldCheck } from "lucide-react";
import type { AssessmentEntry, AssessmentRecord } from "../lib/assessmentRecord";
import { PanelLabel } from "./ProfileSection";

/**
 * "Integrity" on the desktop profile (docs/APPLICANT-PROFILE.md): the count
 * and the plain-words detail, both the record's own (its "Integrity checks"
 * entry: "3 flags", "in 2 tests", "Left the window 3 times (1m 12s away) ·
 * paste attempt ×1"), and a link to every flag with its time, the same sheet
 * the phone's row opens. Nothing flagged says so; nothing taken says nothing.
 */
export function ApplicantIntegrityPanel({ record, onOpen }: { record: AssessmentRecord | null; onOpen: (entry: AssessmentEntry) => void }) {
  const id = useId();
  const entry = record?.entries.find((e) => e.kind === "integrity") ?? null;
  const anyTaken = record?.entries.some((e) => e.status === "done" && e.kind !== "application" && e.kind !== "resume") ?? false;
  if (!entry && !anyTaken) return null;
  const detail = entry ? [entry.headline, entry.verdict].filter(Boolean).join(" ") : null;
  return (
    <section aria-labelledby={id}>
      <PanelLabel id={id}>Integrity</PanelLabel>
      {entry ? (
        <div className="flex items-start gap-2.5 text-[13px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
          <ShieldAlert aria-hidden className="mt-[2px] h-4 w-4 shrink-0" style={{ color: "var(--amber-fg)" }} strokeWidth={2} />
          <div className="min-w-0">
            <p>
              <span className="font-semibold" style={{ color: "var(--amber-fg)" }}>
                {detail}
              </span>
              {entry.subline ? `: ${entry.subline.charAt(0).toLowerCase()}${entry.subline.slice(1)}.` : "."}
            </p>
            {entry.openable && (
              <button
                type="button"
                className="mt-1 inline-flex items-center gap-0.5 text-[12.5px] font-medium hover:underline"
                style={{ color: "var(--jade-soft-fg)" }}
                onClick={() => onOpen(entry)}
              >
                Every flag, with its time
                <ChevronRight aria-hidden className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <p className="flex items-start gap-2.5 text-[13px] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
          <ShieldCheck aria-hidden className="mt-[2px] h-4 w-4 shrink-0" style={{ color: "var(--jade)" }} strokeWidth={2} />
          <span>No flags on any test so far.</span>
        </p>
      )}
    </section>
  );
}

export default ApplicantIntegrityPanel;
