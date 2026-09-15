/**
 * C3: voice job creation could freeze forever on "Ava is building your workflow…" for an
 * on-site (or hybrid) role where no city was ever said. computeMissingRequired's "Location
 * or remote" check treated ANY workMode — including the "onsite" default a local role gets
 * — as satisfying the location requirement (`!!b.location || !!b.workMode`), so doCreate()
 * in TalkToAva.tsx happily moved to the "creating" state with an empty location. Downstream,
 * AvaCreateJob.tsx's onComplete belt-and-suspenders check (`merged.location.trim()`) then
 * silently `return`ed without ever calling setStep(3) — and nothing in TalkToAva.tsx ever
 * cleared `creating`, so the spinner spun forever with no way out.
 *
 * Fixed by restricting the location/remote bar to real location text OR workMode === "remote"
 * (mapJobBriefToFormPayload only auto-fills "Remote" text for that mode, matching what
 * publishing actually needs), and by adding a timeout-based safety net in TalkToAva.tsx so
 * ANY stall in the build handoff — this one included — surfaces a friendly retry/back card
 * instead of hanging indefinitely.
 */
export default [
  {
    id: "voice-onsite-location-required",
    why:
      "computeMissingRequired's 'Location or remote' check must require real location text " +
      "for onsite/hybrid roles — accepting a bare workMode again lets an onsite role with no " +
      "city sail past the gate and into a build handoff that can never actually complete.",
    run: async ({ read }) => {
      const detail = [];

      const jobBrief = await read("src/lib/avaEngine/jobBrief.ts");
      if (jobBrief == null) {
        return { ok: false, detail: ["src/lib/avaEngine/jobBrief.ts is missing"] };
      }
      if (/has:\s*\(b\)\s*=>\s*!!b\.location\s*\|\|\s*!!b\.workMode/.test(jobBrief)) {
        detail.push(
          "jobBrief.ts's 'Location or remote' check still accepts ANY workMode (onsite/hybrid included) as satisfying the requirement — an onsite role with no city passes computeMissingRequired again, reopening the infinite-spinner bug",
        );
      }
      if (!/workMode\s*===\s*["']remote["']/.test(jobBrief)) {
        detail.push(
          "jobBrief.ts no longer gates the location/remote bar on workMode === 'remote' specifically — onsite/hybrid could satisfy it without any real location text",
        );
      }

      const talkToAva = await read("src/components/ava/createFlow/TalkToAva.tsx");
      if (talkToAva == null) {
        return { ok: false, detail: ["src/components/ava/createFlow/TalkToAva.tsx is missing"] };
      }
      // The "creating" (building) phase must have a timeout-based way out: if `step` never
      // advances past where it was when the build started, treat it as stuck rather than
      // spinning forever.
      const creatingEffectIdx = talkToAva.indexOf("if (!creating) return;\n    const stepAtStart");
      if (creatingEffectIdx === -1) {
        detail.push(
          "TalkToAva.tsx no longer has a timeout effect comparing `step` against its value when 'creating' started — the build spinner has no way to detect it's stuck",
        );
      }
      if (!/setBuildStuck\(true\)/.test(talkToAva) || !/window\.setTimeout/.test(talkToAva.slice(Math.max(creatingEffectIdx, 0)))) {
        detail.push("TalkToAva.tsx dropped the setBuildStuck(true) timeout fallback for a stalled build handoff");
      }
      if (!/function BuildStuckCard/.test(talkToAva)) {
        detail.push("TalkToAva.tsx dropped BuildStuckCard — a stalled build has no friendly retry/back UI");
      } else {
        const cardIdx = talkToAva.indexOf("function BuildStuckCard");
        const cardBody = talkToAva.slice(cardIdx, cardIdx + 1200);
        if (!/onRetry/.test(cardBody) || !/onReview/.test(cardBody)) {
          detail.push("BuildStuckCard no longer offers both a retry and a review/back path out of the stalled state");
        }
      }
      if (!/buildStuck \? "stuck"/.test(talkToAva)) {
        detail.push("TalkToAva.tsx's phase computation no longer prioritizes buildStuck — the stuck card may never actually render");
      }

      return { ok: detail.length === 0, detail };
    },
  },
];
