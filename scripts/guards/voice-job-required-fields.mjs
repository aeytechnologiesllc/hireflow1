/**
 * Posting a job by talking to Ava must require the same critical fields the typed
 * create-job form does (role, location, pay, what they'll do) before it ever builds a
 * plan. Previously doCreate() in TalkToAva only checked for a title, and
 * AvaCreateJob's onComplete jumped straight to the build step — so an employer could
 * sit through the whole plan animation with location/pay missing and only find out
 * from a raw error message at Publish, with no field on the review screen to fix it.
 */
export default [
  {
    id: "voice-job-required-fields",
    why:
      "The voice path must block on the same required fields as the typed path " +
      "(computeMissingRequired) before building a plan, and offer inline fields to fix " +
      "whatever's missing — otherwise a job can reach Publish with no location or pay.",
    run: async ({ read }) => {
      const detail = [];

      const jobBrief = await read("src/lib/avaEngine/jobBrief.ts");
      if (jobBrief == null) {
        return { ok: false, detail: ["src/lib/avaEngine/jobBrief.ts is missing"] };
      }
      if (!/export function computeMissingRequired/.test(jobBrief)) {
        detail.push(
          "jobBrief.ts no longer exports computeMissingRequired — there is no single source of truth for which fields voice must collect before building",
        );
      }

      const talkToAva = await read("src/components/ava/createFlow/TalkToAva.tsx");
      if (talkToAva == null) {
        return { ok: false, detail: ["src/components/ava/createFlow/TalkToAva.tsx is missing"] };
      }
      if (!/computeMissingRequired/.test(talkToAva)) {
        detail.push(
          "TalkToAva.tsx no longer imports/uses computeMissingRequired — doCreate() can build a plan from a title-only brief again",
        );
      }

      // doCreate() must check the missing-required list before it ever sets creating=true.
      const doCreateIdx = talkToAva.indexOf("const doCreate = useCallback");
      const creatingIdx = talkToAva.indexOf("setCreating(true)");
      if (doCreateIdx === -1 || creatingIdx === -1 || creatingIdx < doCreateIdx) {
        detail.push("Could not locate doCreate()'s setCreating(true) call to check it's gated");
      } else {
        const doCreateBody = talkToAva.slice(doCreateIdx, creatingIdx);
        if (!/computeMissingRequired\(brief\)\.length\s*>\s*0/.test(doCreateBody)) {
          detail.push(
            "doCreate() in TalkToAva.tsx no longer checks computeMissingRequired(...).length > 0 before setCreating(true) — the plan-build step is reachable again with required fields missing",
          );
        }
      }

      if (!/MissingFieldsForm/.test(talkToAva)) {
        detail.push(
          "TalkToAva.tsx dropped the inline MissingFieldsForm — an employer with a missing required field has no on-screen way to fix it without leaving voice",
        );
      }

      const avaCreateJob = await read("src/pages/AvaCreateJob.tsx");
      if (avaCreateJob == null) {
        return { ok: false, detail: ["src/pages/AvaCreateJob.tsx is missing"] };
      }
      const onCompleteIdx = avaCreateJob.indexOf("onComplete={(payload)");
      const setStep3Idx = avaCreateJob.indexOf("setStep(3)");
      if (onCompleteIdx === -1 || setStep3Idx === -1 || setStep3Idx < onCompleteIdx) {
        detail.push("Could not locate TalkToAva's onComplete handler / its setStep(3) call in AvaCreateJob.tsx");
      } else {
        const onCompleteBody = avaCreateJob.slice(onCompleteIdx, setStep3Idx);
        const guardsLocation = /merged\.location\.trim\(\)/.test(onCompleteBody);
        const guardsPay = /merged\.pay\.trim\(\)/.test(onCompleteBody);
        const guardsWork = /merged\.work\.trim\(\)/.test(onCompleteBody);
        const bailsOut = /if\s*\(!\w+\)\s*return;/.test(onCompleteBody);
        if (!guardsLocation || !guardsPay || !guardsWork || !bailsOut) {
          detail.push(
            "AvaCreateJob.tsx's onComplete no longer re-checks location/pay/work (and bails out) before jumping to step 3 — a voice-built brief can reach the build pipeline incomplete again",
          );
        }
      }

      return { ok: detail.length === 0, detail };
    },
  },
];
