import type { ComponentType } from "react";
import { GemRail, type GemRailNode } from "@/components/rail/GemRail";
import { DECISION_STAGE_ID } from "@/lib/candidateJourney";
import { EntryIcon } from "./AssessmentRecordList";
import { advanceTargetLabel } from "../hooks/useCockpitData";
import { getInitials } from "../lib/mappers";
import {
  decisionWord,
  dotReceipt,
  dotStateWords,
  journeyLine,
  railIndex,
  softHyphenate,
  type JourneyDot,
  type JourneyLineContext,
} from "../lib/applicantProfile";

/**
 * Where they are in the job's process, on the full profile — the shared
 * <GemRail>, with every gem decided by the applicant's RECORD (see
 * journeyDots in ../lib/applicantProfile.ts), the same rule as the list's
 * dots: done (jade), done below the job's bar (brass), on it now (ring),
 * skipped (dashed: a step they went past with no result on file, such as one
 * the job gained after they passed it — it says "Skipped", never "Completed"),
 * not reached (empty). Never by position.
 *
 * Each gem wears its step's own mark (EntryIcon, the record list's map, so the
 * row and the gem are one mark) and the record's own receipt under it
 * ("38 WPM · under 45"), only ever what is on file.
 */

type Glyph = ComponentType<{ className?: string; size?: string | number; strokeWidth?: string | number }>;

/** One stable glyph component per step type, so a gem's mark is not
 *  remounted on every render. */
const GLYPHS = new Map<string, Glyph>();
function glyphFor(stepType: string): Glyph {
  let glyph = GLYPHS.get(stepType);
  if (!glyph) {
    const StepGlyph: Glyph = ({ className }) => <EntryIcon entry={{ stepType }} className={className} />;
    StepGlyph.displayName = `StepGlyph(${stepType})`;
    GLYPHS.set(stepType, StepGlyph);
    glyph = StepGlyph;
  }
  return glyph;
}

/** The gem's fill for its state. --ground is the ink on both: deep on Night's
 *  light jade and brass, ivory on Day's dark ones. */
function paint(dot: JourneyDot): Pick<GemRailNode, "color" | "ink"> {
  if (dot.id === DECISION_STAGE_ID) return { color: "var(--brass)" };
  if (dot.state === "below") return { color: "var(--brass)", ink: "var(--ground)" };
  if (dot.state === "done" || dot.state === "now") return { color: "var(--jade)", ink: "var(--ground)" };
  return {};
}

export function ApplicantJourneyRail({
  dots,
  status,
  name,
  liveStepId,
  line,
}: {
  dots: JourneyDot[];
  /** applications.status: what the Decision gem says. */
  status: string | null | undefined;
  /** Whose journey: their initials ride the track. */
  name: string;
  /** The step they touched last, when two are open (a retake beside the next test). */
  liveStepId?: string | null;
  /** What the summary line reads beyond the dots (the record's live attempt,
   *  the attempts, Ava's suggestion): with it, the line under the rail is the
   *  list row's own, word for word. */
  line?: JourneyLineContext;
}) {
  if (dots.length === 0) return null;
  const outcome = decisionWord(status);
  const advanceLabel = advanceTargetLabel(status ?? undefined);

  const nodes: GemRailNode[] = dots.map((dot) => {
    const isDecision = dot.id === DECISION_STAGE_ID;
    const receipt = isDecision
      ? outcome ??
        (dot.state === "now"
          ? status === "offered"
            ? "Hire, or take back the offer"
            : advanceLabel
              ? `Pass, or move to ${advanceLabel}`
              : "Pass, or move forward"
          : null)
      : dotReceipt(dot);
    return {
      id: dot.id,
      // Soft hyphens: on a phone a gem's column is about 42px wide.
      label: softHyphenate(dot.title),
      icon: isDecision ? undefined : glyphFor(dot.type),
      receipt: receipt ? softHyphenate(receipt) : receipt,
      // The pill is the seal's own stamp, reserved for a decision a human made.
      sealed: isDecision && !!outcome,
      decision: isDecision,
      sealTilt: isDecision && status === "rejected" ? -4 : 0,
      state: dot.state === "done" ? "done" : dot.state === "below" ? "below" : dot.state === "now" ? (dot.left ? "left" : "now") : dot.state === "skipped" ? "skipped" : "upcoming",
      ...paint(dot),
      tooltip: [
        dot.title,
        isDecision ? (outcome ? null : dot.state === "now" ? "Your call" : "Not reached") : dotStateWords(dot),
        receipt,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });

  return (
    <GemRail
      nodes={nodes}
      current={railIndex(dots, liveStepId)}
      traveler={getInitials(name)}
      summary={journeyLine(dots, status, line) ?? undefined}
      ariaLabel="Where they are in the job's process"
      focusable
    />
  );
}

export default ApplicantJourneyRail;
