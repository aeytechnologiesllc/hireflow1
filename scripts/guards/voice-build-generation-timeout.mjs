/**
 * C3 repair: the "creating"/"building" screen could still spin forever even after the
 * onsite-location fix — TalkToAva.tsx's own stuck-timer is a ONE-SHOT effect keyed on
 * `creating` that compares `step` to its value when the build started. `handoff()` almost
 * always advances `step` to 3 well within that timer's window (its own 6s hard cap fires
 * first), which permanently satisfies the timer for that attempt — it is never re-armed.
 * But `creating` (and the visible "Building your hiring workflow…" text) stays true all
 * the way through AvaCreateJob.tsx's step===3 `runGeneration()` -> `generateJobFlow()`,
 * which called `fetch()` with no AbortController/timeout. A hung connection there (dropped
 * network, an edge function that never responds) left `generating` — and the spinner —
 * stuck forever with no retry/back option, the exact failure mode this fix was supposed to
 * eliminate, just triggered by a stall after handoff instead of before it.
 *
 * Fixed by bounding the generate-flow request itself (so a stall resolves like any other
 * generate-flow failure, via the existing template fallback) AND by giving the step===3
 * build screen its own stuck-timeout safety net with a friendly retry/back card — belt AND
 * suspenders, so a future regression anywhere in that chain still can't hang the employer.
 */
export default [
  {
    id: "voice-build-generation-timeout",
    why:
      "generateJobFlow's network call and the step===3 'building' screen must both be able " +
      "to time out on their own — otherwise a hung connection during flow generation (after " +
      "the voice handoff already succeeded) leaves the build spinner stuck forever with no " +
      "way out, same bug as before just moved one step later.",
    run: async ({ read }) => {
      const detail = [];

      const flowGenerator = await read("src/lib/avaEngine/flowGenerator.ts");
      if (flowGenerator == null) {
        return { ok: false, detail: ["src/lib/avaEngine/flowGenerator.ts is missing"] };
      }
      const fnIdx = flowGenerator.indexOf("async function callEdgeFunction");
      if (fnIdx === -1) {
        detail.push("flowGenerator.ts no longer has callEdgeFunction — cannot verify its timeout");
      } else {
        const fnBody = flowGenerator.slice(fnIdx, fnIdx + 1600);
        if (!/AbortController/.test(fnBody)) {
          detail.push(
            "callEdgeFunction's fetch() to generate-flow has no AbortController/timeout again — a hung connection will hang generateJobFlow (and the build screen) forever",
          );
        }
        if (!/signal:\s*controller\.signal/.test(fnBody)) {
          detail.push("callEdgeFunction's fetch() no longer passes the abort signal — the timeout wouldn't actually cancel the hung request");
        }
      }

      const avaCreateJob = await read("src/pages/AvaCreateJob.tsx");
      if (avaCreateJob == null) {
        return { ok: false, detail: ["src/pages/AvaCreateJob.tsx is missing"] };
      }
      if (!/const \[buildStuck, setBuildStuck\] = useState/.test(avaCreateJob)) {
        detail.push("AvaCreateJob.tsx dropped its buildStuck state — the step===3 build screen has no stuck-timeout safety net");
      }
      const stuckEffectIdx = avaCreateJob.indexOf("if (step !== 3 || !generating) return;");
      if (stuckEffectIdx === -1) {
        detail.push("AvaCreateJob.tsx no longer arms a timeout while step===3 is generating — a hung generate-flow call has no way to surface as stuck");
      } else if (!/window\.setTimeout\(\(\) => setBuildStuck\(true\)/.test(avaCreateJob.slice(stuckEffectIdx, stuckEffectIdx + 200))) {
        detail.push("AvaCreateJob.tsx's step===3 stuck-timeout effect no longer sets buildStuck(true) on expiry");
      }
      if (!/buildStuck \? \(\s*<BuildStuckNotice/.test(avaCreateJob)) {
        detail.push("AvaCreateJob.tsx no longer renders BuildStuckNotice for step===3 when buildStuck is true — a stalled build has no friendly retry/back UI");
      }

      const shared = await read("src/components/ava/createFlow/shared.tsx");
      if (shared == null) {
        return { ok: false, detail: ["src/components/ava/createFlow/shared.tsx is missing"] };
      }
      if (!/export function BuildStuckNotice/.test(shared)) {
        detail.push("shared.tsx dropped BuildStuckNotice");
      } else {
        const cardIdx = shared.indexOf("export function BuildStuckNotice");
        const cardBody = shared.slice(cardIdx, cardIdx + 900);
        if (!/onRetry/.test(cardBody) || !/onBack/.test(cardBody)) {
          detail.push("BuildStuckNotice no longer offers both a retry and a back path out of the stalled state");
        }
      }

      return { ok: detail.length === 0, detail };
    },
  },
];
