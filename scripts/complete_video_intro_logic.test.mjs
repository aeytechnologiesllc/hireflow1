#!/usr/bin/env node
/**
 * Local test runner for
 * supabase/functions/complete-video-intro/logic.ts — plain assertions, no
 * framework, same style as scripts/trusted_results_logic.test.mjs. Runs
 * directly against the REAL server file (no copy).
 *
 * Proves complete-video-intro's server-side "grading" (video intro has none
 * — it's completion-based, see logic.ts's own header comment) produces the
 * EXACT same notes.videoIntroResult / notes[stepId] shapes
 * VideoIntroPhase.tsx used to build in the browser before this conversion
 * (its own `updatedNotes` object, formerly at :368-389), for realistic
 * inputs — both the current "video_intro" step type and the legacy
 * "video_message" alias, a step id that isn't found in workflow_steps at
 * all (the page's own fallback), fractional-second and multi-minute
 * durations, and the videoUrl path-plausibility check that stands in for
 * "is this really this candidate's own recording for this application/step"
 * before the edge function ever asks storage whether the object exists.
 *
 * Run with: node scripts/complete_video_intro_logic.test.mjs
 */
import {
  buildVideoIntroLegacyStepEntry,
  buildVideoIntroResult,
  formatVideoIntroPhaseAnalysis,
  isPlausibleVideoObjectPath,
  isValidDuration,
  resolveVideoStepType,
} from "../supabase/functions/complete-video-intro/logic.ts";

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

/**
 * Reproduces VideoIntroPhase.tsx's OWN former shapes verbatim (the exact
 * object literals its handleSubmit used to build, before this conversion),
 * so this test compares against an independent re-statement of the client
 * logic rather than against complete-video-intro's own output trivially
 * agreeing with itself.
 */
function clientVideoIntroResult({ duration, videoUrl }) {
  return {
    duration,
    completed: true,
    passed: true,
    score: null,
    videoUrl,
    uploadMethod: "recorded",
  };
}

function clientLegacyStepEntry({ stepType, duration, recordedAt, videoUrl }) {
  return {
    type: stepType,
    duration,
    recordedAt,
    completed: true,
    passed: true,
    score: null,
    videoUrl,
    uploadMethod: "recorded",
  };
}

console.log("\nresolveVideoStepType:\n");

check(
  "finds the real step type by id",
  resolveVideoStepType([{ id: "wf-1", type: "typing_test" }, { id: "wf-2", type: "video_message" }], "wf-2") ===
    "video_message"
);
check(
  "falls back to 'video_intro' when the step id isn't found — matches VideoIntroPhase.tsx:368's own fallback",
  resolveVideoStepType([{ id: "wf-1", type: "typing_test" }], "wf-missing") === "video_intro"
);
check(
  "falls back to 'video_intro' for an empty/missing workflow_steps array",
  resolveVideoStepType(undefined, "wf-1") === "video_intro" && resolveVideoStepType([], "wf-1") === "video_intro"
);

console.log("\nbuildVideoIntroResult / buildVideoIntroLegacyStepEntry match the client's own former shapes:\n");

const realisticCases = [
  { duration: 45, videoUrl: "cand-uuid/app-uuid-wf-video-1700000000000.webm", stepType: "video_intro" },
  { duration: 3, videoUrl: "cand-uuid/app-uuid-wf-video-1700000000123.mp4", stepType: "video_message" },
  { duration: 0, videoUrl: "cand-uuid/app-uuid-wf-video-1700000000456.webm", stepType: "video_intro" },
  { duration: 118.7, videoUrl: "cand-uuid/app-uuid-wf-video-1700000000789.mp4", stepType: "video_message" },
];

for (const c of realisticCases) {
  const recordedAt = "2026-09-16T00:00:00.000Z";

  const serverResult = buildVideoIntroResult({ duration: c.duration, videoUrl: c.videoUrl });
  const expectedResult = clientVideoIntroResult({ duration: c.duration, videoUrl: c.videoUrl });
  check(
    `videoIntroResult matches the client's own shape for duration=${c.duration}, type=${c.stepType}`,
    JSON.stringify(serverResult) === JSON.stringify(expectedResult),
    `got ${JSON.stringify(serverResult)}`
  );

  const serverLegacy = buildVideoIntroLegacyStepEntry({
    duration: c.duration,
    videoUrl: c.videoUrl,
    stepType: c.stepType,
    recordedAt,
  });
  const expectedLegacy = clientLegacyStepEntry({
    duration: c.duration,
    videoUrl: c.videoUrl,
    stepType: c.stepType,
    recordedAt,
  });
  check(
    `notes[stepId] legacy entry matches the client's own shape for duration=${c.duration}, type=${c.stepType}`,
    JSON.stringify(serverLegacy) === JSON.stringify(expectedLegacy),
    `got ${JSON.stringify(serverLegacy)}`
  );
}

check(
  "score is always null — video intro has no numeric grade, same as the client's own write",
  buildVideoIntroResult({ duration: 30, videoUrl: "x" }).score === null
);
check(
  "passed is always true once a result is built — completion-based, same as the client's own write",
  buildVideoIntroResult({ duration: 30, videoUrl: "x" }).passed === true
);

console.log("\nformatVideoIntroPhaseAnalysis matches VideoIntroPhase.tsx:399's own text exactly:\n");

check(
  "0:45 duration",
  formatVideoIntroPhaseAnalysis(45, "cand/app-step-1.webm") ===
    "Video intro: 0:45 duration. COMPLETED. Stored at: cand/app-step-1.webm"
);
check(
  "1:05 duration (seconds pad to two digits)",
  formatVideoIntroPhaseAnalysis(65, "x") === "Video intro: 1:05 duration. COMPLETED. Stored at: x"
);
check("0:00 duration", formatVideoIntroPhaseAnalysis(0, "x") === "Video intro: 0:00 duration. COMPLETED. Stored at: x");
check(
  "fractional seconds are floored, not rounded up past a whole minute",
  formatVideoIntroPhaseAnalysis(119.9, "x") === "Video intro: 1:59 duration. COMPLETED. Stored at: x"
);

console.log("\nisPlausibleVideoObjectPath — matches VideoIntroPhase.tsx:304's own filename convention:\n");

const uid = "11111111-1111-1111-1111-111111111111";
const appId = "22222222-2222-2222-2222-222222222222";
const stepId = "wf-video-step";

check(
  "accepts the real convention (webm)",
  isPlausibleVideoObjectPath(`${uid}/${appId}-${stepId}-1700000000000.webm`, {
    callerUserId: uid,
    applicationId: appId,
    stepId,
  })
);
check(
  "accepts the real convention (mp4, iOS Safari)",
  isPlausibleVideoObjectPath(`${uid}/${appId}-${stepId}-1700000000000.mp4`, {
    callerUserId: uid,
    applicationId: appId,
    stepId,
  })
);
check(
  "rejects a path under a DIFFERENT candidate's uid",
  !isPlausibleVideoObjectPath(`00000000-0000-0000-0000-000000000000/${appId}-${stepId}-1700000000000.webm`, {
    callerUserId: uid,
    applicationId: appId,
    stepId,
  })
);
check(
  "rejects a path for a DIFFERENT application id",
  !isPlausibleVideoObjectPath(`${uid}/other-app-${stepId}-1700000000000.webm`, {
    callerUserId: uid,
    applicationId: appId,
    stepId,
  })
);
check(
  "rejects a path for a DIFFERENT step id",
  !isPlausibleVideoObjectPath(`${uid}/${appId}-other-step-1700000000000.webm`, {
    callerUserId: uid,
    applicationId: appId,
    stepId,
  })
);
check(
  "rejects an unsupported extension",
  !isPlausibleVideoObjectPath(`${uid}/${appId}-${stepId}-1700000000000.mov`, {
    callerUserId: uid,
    applicationId: appId,
    stepId,
  })
);
check(
  "rejects a path missing the timestamp segment entirely",
  !isPlausibleVideoObjectPath(`${uid}/${appId}-${stepId}.webm`, { callerUserId: uid, applicationId: appId, stepId })
);
check("rejects a non-string path", !isPlausibleVideoObjectPath(undefined, { callerUserId: uid, applicationId: appId, stepId }));
check("rejects an empty string path", !isPlausibleVideoObjectPath("", { callerUserId: uid, applicationId: appId, stepId }));
check(
  "regex-special characters in ids are treated literally, not as regex syntax",
  !isPlausibleVideoObjectPath(`${uid}/${appId}X${stepId}-1700000000000.webm`, {
    callerUserId: uid,
    applicationId: `${appId}.`, // a literal dot would otherwise match "X" via regex "."
    stepId,
  })
);

console.log("\nisValidDuration:\n");

check("accepts 0", isValidDuration(0));
check("accepts a fractional positive number", isValidDuration(3.5));
check("accepts a large number", isValidDuration(3600));
check("rejects a negative number", !isValidDuration(-1));
check("rejects NaN", !isValidDuration(NaN));
check("rejects Infinity", !isValidDuration(Infinity));
check("rejects a numeric string", !isValidDuration("30"));
check("rejects undefined", !isValidDuration(undefined));
check("rejects null", !isValidDuration(null));

console.log(`\n${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
