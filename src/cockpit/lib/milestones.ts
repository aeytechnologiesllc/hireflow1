/**
 * milestones.ts — "Where they are" on the applicants list, as four
 * milestones: Applied → Tested → Interview → Hired (2026-10-25;
 * docs/LAUNCH-PLAN.md, Phase 3, task 8; the owner chose Option C on
 * 2026-10-24: "Milestone looks a lot better").
 *
 * The list drew one dot per journey step (eleven on the owner's own job), in
 * five states, with the step's name only in a tooltip. Now the rail has four
 * stops with their names under them (the one they are at stressed: "Offer"
 * for an offer, "Declined" when stopped), and the row's own line under the
 * rail says the step in words ("Skills check · step 2 of 7 · live"), so a
 * phone shows it without a hover. `detail` is that state in short words, for
 * tests and any caller with no line of its own.
 *
 * Every application state lands on a milestone (docs/APPLICANTS-LIST.md has
 * the table): filling in the form → Applied; taking the tests (or waiting
 * for a computer, or gone part-way) → Tested, not lit yet; every test done
 * and waiting on the team → Tested, lit; interview → Interview; offered →
 * Hired, not lit ("Offer made"); hired → Hired, lit; declined → the last test
 * milestone the row shows they reached, marked stopped (the row keeps no
 * record of an interview or offer before a decline).
 *
 * Pure, no imports: scripts/applicant_milestones.test.mjs loads it in Node.
 */

export const MILESTONE_LABELS = ["Applied", "Tested", "Interview", "Hired"] as const;

export interface MilestoneInput {
  /** applications.status: pending, reviewing, in_progress, interview, offered, hired, rejected. */
  status: string | null | undefined;
  /** Still filling in the application form. */
  onForm: boolean;
  /** Every journey step done or skipped. */
  finished: boolean;
  /** The test steps (application form and Decision left out), in order, by state. */
  testStates: ReadonlyArray<"done" | "below" | "now" | "skipped" | "todo">;
  /** The record's live state on the step they are on, when there is one. */
  liveState?: string | null;
}

export interface MilestoneView {
  /** 0..3: the milestone they are at. */
  at: number;
  /** How many milestones are behind them or reached (drawn solid), 0..4. */
  lit: number;
  /** The small words under the milestone they are at. */
  detail: string;
  /** "won": hired (the one brass moment); "stopped": declined; else "moving". */
  tone: "moving" | "stopped" | "won";
}

function testsDone(states: MilestoneInput["testStates"]): number {
  return states.filter((s) => s === "done" || s === "below" || s === "skipped").length;
}

/** Where an applicant is, as one of the four milestones. Never blank. */
export function milestonesFor(input: MilestoneInput): MilestoneView {
  const total = input.testStates.length;
  const done = testsDone(input.testStates);
  const tested = input.finished || (total > 0 && done >= total);
  switch (input.status) {
    case "hired":
      return { at: 3, lit: 4, detail: "Hired", tone: "won" };
    case "offered":
      return { at: 3, lit: 3, detail: "Offer made", tone: "moving" };
    case "interview":
      return { at: 2, lit: 2, detail: "Interview", tone: "moving" };
    case "rejected": {
      // Stopped wherever they were: the milestones behind them stay lit.
      if (input.onForm) return { at: 0, lit: 0, detail: "Declined", tone: "stopped" };
      if (total > 0 && tested) return { at: 1, lit: 2, detail: "Declined", tone: "stopped" };
      if (total > 0 && done > 0) return { at: 1, lit: 1, detail: "Declined", tone: "stopped" };
      return { at: 0, lit: 1, detail: "Declined", tone: "stopped" };
    }
    default:
      break;
  }
  if (input.onForm) return { at: 0, lit: 0, detail: "Filling in the form", tone: "moving" };
  if (total === 0) return { at: 0, lit: 1, detail: input.finished ? "Applied · waiting on you" : "Applied", tone: "moving" };
  if (tested) return { at: 1, lit: 2, detail: "Tested · waiting on you", tone: "moving" };
  if (input.liveState === "waiting") return { at: 1, lit: 1, detail: `Waiting for a computer · ${done} of ${total}`, tone: "moving" };
  if (input.liveState === "left") return { at: 1, lit: 1, detail: `Left part-way · ${done} of ${total}`, tone: "moving" };
  return { at: 1, lit: 1, detail: `Testing · ${done} of ${total}`, tone: "moving" };
}
