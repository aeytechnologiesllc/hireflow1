/**
 * Phase 3 of docs/LAUNCH-PLAN.md, locked (2026-10-25): the look.
 *
 *   - applicant-rail-is-four-milestones: "where they are" on the applicants
 *     list and the first-hire guide is Applied → Tested → Interview → Hired
 *     (the owner chose Option C), never one dot per step again.
 */

export default [
  {
    id: "applicant-rail-is-four-milestones",
    why:
      "The applicants list drew one dot per journey step (eleven on the owner's job; the owner: " +
      "\"I don't like how these weird dots appear\"). It is four milestones, Applied → Tested → " +
      "Interview → Hired (src/cockpit/lib/milestones.ts, MilestoneRail in ApplicantRow.tsx), on the " +
      "table row, the phone card and the first-hire guide.",
    run: async ({ read }) => {
      const detail = [];
      const lib = (await read("src/cockpit/lib/milestones.ts")) ?? "";
      if (!/export const MILESTONE_LABELS = \["Applied", "Tested", "Interview", "Hired"\] as const;/.test(lib)) {
        detail.push("src/cockpit/lib/milestones.ts: the four milestones are not Applied, Tested, Interview, Hired");
      }
      const row = (await read("src/cockpit/components/ApplicantRow.tsx")) ?? "";
      const rails = (row.match(/<MilestoneRail view=\{row\.milestones\}/g) ?? []).length;
      if (rails < 2) detail.push("ApplicantRow.tsx: the table row and the phone card must both draw <MilestoneRail view={row.milestones} />");
      if (/export function JourneyDots\b|<JourneyDots\b/.test(row)) detail.push("ApplicantRow.tsx: the per-step dot rail is back");
      const guide = (await read("src/cockpit/components/journey/GuideStages.tsx")) ?? "";
      if (/<JourneyDots\b/.test(guide) || !/<MilestoneRail /.test(guide)) detail.push("GuideStages.tsx: the first-hire guide must draw the milestones");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
