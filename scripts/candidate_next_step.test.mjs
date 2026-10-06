#!/usr/bin/env node
/**
 * After a step, the candidate always sees the next step's button — never a
 * dead end — and a finished step reads as done.
 *
 * On 2026-10-05 the owner took the live Zulu chat-agent journey (Application,
 * Skills check, Typing speed and accuracy, Player chat practice, Written
 * interview, Decision) and landed on "<Step> Submitted · Back to Application"
 * after the form, the typing test, the chat practice and the interview; then
 * the overview offered "Up next · Begin Interview" for the interview he had
 * just finished. Three causes, each checked here:
 *
 *   1. Every step page judged "already submitted" on every render, so its own
 *      realtime refresh replaced the waiting / "Start next step" screen.
 *   2. The overview labelled steps by position, and the last step's phase
 *      never moves past it.
 *   3. The interview's auto-end path asked for scoring with no decision and
 *      no step id, and every page carried its own step-to-route map.
 *
 * Runs the real pure functions (src/lib/journeyProgress.ts,
 * src/utils/applicationNotes.ts; Node 24 strips the types) plus source checks
 * on the pages that must keep the fix.
 *
 * Run with: node scripts/candidate_next_step.test.mjs
 */
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { readFile } from "node:fs/promises";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = new URL(`../src/${specifier.slice(2)}`, import.meta.url).href;
      for (const suffix of [".ts", ".tsx", "/index.ts"]) {
        try {
          return nextResolve(base + suffix, context);
        } catch {
          // try the next spelling
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { buildCandidateJourney } = await import("../src/lib/candidateJourney.ts");
const {
  STEP_ROUTE_SEGMENTS,
  advanceAfterStep,
  advanceFromServerReply,
  opensSameScreen,
  serverReplyIsFinal,
  stepRoute,
  whereCandidateStands,
} = await import("../src/lib/journeyProgress.ts");
const { formatMultiSelectAnswer } = await import("../src/utils/applicationNotes.ts");

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const read = (rel) => readFile(new URL(`../${rel}`, import.meta.url), "utf8");

// The live job's shape (jobs 02f91311…): quiz on its own column, three steps.
const ZULU_STEPS = [
  { id: "step_typing", type: "typing_test", title: "Typing speed and accuracy" },
  { id: "step_chat", type: "chat_simulation", title: "Player chat practice" },
  { id: "step_interview", type: "chat_interview", title: "Written interview" },
];
const steps = buildCandidateJourney(ZULU_STEPS, { hasQuiz: true });
// [application, quiz, step_typing, step_chat, step_interview, decision]

const ANSWERS = [{ questionId: "q1", question: "Name", answer: "Test" }];
const app = (phase, status, notes = {}) => ({ phase, status, notes, voiceInterviewResult: null });

/* ------------------------------------------------ whereCandidateStands */
console.log("\nwhereCandidateStands — labelled from the data:\n");

{
  const s = whereCandidateStands(steps, app("application", "in_progress"));
  check("just pressed Apply Now → take the application", s.kind === "take" && s.step.id === "application");
}
{
  const s = whereCandidateStands(steps, app("application", "pending", { applicationAnswers: ANSWERS }));
  check(
    "form sent, skills check not open yet → waiting (never 'take the application' again)",
    s.kind === "waiting" && s.step.id === "application",
    JSON.stringify(s),
  );
}
{
  const s = whereCandidateStands(steps, app("quiz", "reviewing", { applicationAnswers: ANSWERS }));
  check("skills check open → take the skills check", s.kind === "take" && s.step.id === "quiz" && s.index === 1);
}
{
  const s = whereCandidateStands(
    steps,
    app("step_typing", "reviewing", { applicationAnswers: ANSWERS, typingTestResult: { wpm: 38 } }),
  );
  check("typing result on file, chat not open → waiting, not 'Up next'", s.kind === "waiting" && s.step.id === "step_typing");
}
{
  // The owner's row at 15:58: phase step_interview, status reviewing, the
  // auto-end interview result on file.
  const s = whereCandidateStands(
    steps,
    app("step_interview", "reviewing", {
      applicationAnswers: ANSWERS,
      typingTestResult: {},
      chatSimulationResult: {},
      chatInterviewResult: { messages: [], evaluation: { score: 25 } },
    }),
  );
  check(
    "written interview done, phase never moved → finished, Step 6 of 6 (not 'Begin Interview')",
    s.kind === "finished" && s.index === 5,
    JSON.stringify(s),
  );
}
{
  const s = whereCandidateStands(steps, app("decision", "reviewing", { chatInterviewResult: {} }));
  check("phase moved to the closing stage → finished", s.kind === "finished" && s.index === 5);
}
{
  const s = whereCandidateStands(steps, app("review", "reviewing", { chatInterviewResult: {} }));
  check("older rows that close on phase 'review' → finished", s.kind === "finished");
}
{
  const s = whereCandidateStands(steps, app("step_interview", "reviewing", { applicationAnswers: ANSWERS }));
  check("interview open, nothing sent → take the interview", s.kind === "take" && s.step.id === "step_interview");
}
{
  const s = whereCandidateStands(steps, app("step_typing", "pending", { typingTestResult: { wpm: 30 } }));
  check("a step handed back for a retake (pending + phase on it) → take it again", s.kind === "take" && s.step.id === "step_typing");
}
{
  const s = whereCandidateStands(steps, app("step_chat", "rejected", {}));
  check("rejected → closed", s.kind === "closed" && s.outcome === "rejected");
}
{
  const s = whereCandidateStands(steps, app("step_chat", "hired", {}));
  check("hired → closed", s.kind === "closed" && s.outcome === "hired");
}

/* ----------------------------------------------------- advanceAfterStep */
console.log("\nadvanceAfterStep — the waiting screen follows the row:\n");

check(
  "typing sent, phase still on it → keep waiting",
  advanceAfterStep(steps, "step_typing", { phase: "step_typing", status: "reviewing" }).kind === "pending",
);
{
  const o = advanceAfterStep(steps, "step_typing", { phase: "step_chat", status: "reviewing" });
  check("phase moved to chat practice → 'Start Player chat practice'", o.kind === "next" && o.step.id === "step_chat" && o.step.title === "Player chat practice");
}
check(
  "form sent, phase still 'application' / status pending → keep waiting",
  advanceAfterStep(steps, "application", { phase: "application", status: "pending" }).kind === "pending",
);
{
  const o = advanceAfterStep(steps, "application", { phase: "quiz", status: "reviewing" });
  check("form sent, skills check opened → next is the skills check", o.kind === "next" && o.step.id === "quiz" && o.step.title === "Skills check");
}
check(
  "interview sent, phase → decision → finished",
  advanceAfterStep(steps, "step_interview", { phase: "decision", status: "reviewing" }).kind === "finished",
);
check(
  "interview sent, older server writes phase 'review' → finished",
  advanceAfterStep(steps, "step_interview", { phase: "review", status: "reviewing" }).kind === "finished",
);
check(
  "Ava's 'recommend declining' keeps phase and sets reviewing → still waiting, never failed",
  advanceAfterStep(steps, "step_chat", { phase: "step_chat", status: "reviewing" }).kind === "pending",
);
check(
  "a server-confirmed rejection → closed",
  advanceAfterStep(steps, "step_chat", { phase: "step_chat", status: "rejected" }).kind === "closed",
);

/* ----------------------------------------------- advanceFromServerReply */
console.log("\nadvanceFromServerReply — only a reply naming a known step counts:\n");

{
  const o = advanceFromServerReply(steps, "step_typing", { decision: "advanced", nextPhaseId: "step_chat", score: null });
  check("advanced to step_chat (score null ignored) → next", o.kind === "next" && o.step.id === "step_chat");
}
{
  const o = advanceFromServerReply(steps, "application", { decision: "advanced", nextPhaseId: "quiz", nextPhaseTitle: "Quiz" });
  check("server title 'Quiz' is not used — the journey's 'Skills check' is", o.kind === "next" && o.step.title === "Skills check");
}
check(
  "advanced to 'decision' → finished",
  advanceFromServerReply(steps, "step_interview", { decision: "advanced", nextPhaseId: "decision" }).kind === "finished",
);
check(
  "advanced to an id this journey does not know → keep watching the row",
  advanceFromServerReply(steps, "step_typing", { decision: "advanced", nextPhaseId: "step_other" }).kind === "pending",
);
check(
  "recommend_decline → keep watching the row",
  advanceFromServerReply(steps, "step_typing", { decision: "recommend_decline", score: 40 }).kind === "pending",
);
check("no reply at all → keep watching the row", advanceFromServerReply(steps, "step_typing", null).kind === "pending");

/* ------------------------------------------------------------ stepRoute */
console.log("\nstepRoute — one map, and every segment has a route:\n");

check(
  "typing test route",
  stepRoute("app-1", { id: "step_typing", type: "typing_test" }) === "/applications/app-1/typing-test/step_typing",
);
check("synthetic quiz route", stepRoute("app-1", { id: "quiz", type: "quiz" }) === "/applications/app-1/quiz/quiz");
check(
  "synthetic application route",
  stepRoute("app-1", { id: "application", type: "application" }) === "/applications/app-1/application/application",
);
check("the closing Decision stage has no route", stepRoute("app-1", { id: "decision", type: "decision" }) === null);
check(
  "computer and connection check route (docs/EQUIPMENT-CHECK.md §3)",
  stepRoute("app-1", { id: "step_connection", type: "equipment_check" }) === "/applications/app-1/connection/step_connection",
);
{
  const appTsx = await read("src/App.tsx");
  const missing = [...new Set(Object.values(STEP_ROUTE_SEGMENTS))].filter(
    (segment) => !appTsx.includes(`path="/applications/:id/${segment}/:stepId"`),
  );
  check("every route segment is registered in App.tsx", missing.length === 0, missing.join(", "));
}

/* ------------------------------------------- how "Start <next step>" opens */
console.log("\nopensSameScreen — a same-page next step is loaded fresh:\n");

check("quiz → quiz opens the same page", opensSameScreen({ type: "quiz" }, { type: "quiz" }));
check("chat practice → chat practice opens the same page", opensSameScreen({ type: "chat_simulation" }, { type: "chat_simulation" }));
check("video intro → video message share one page", opensSameScreen({ type: "video_intro" }, { type: "video_message" }));
check("typing → chat practice are different pages", !opensSameScreen({ type: "typing_test" }, { type: "chat_simulation" }));
check("two connection checks open the same page", opensSameScreen({ type: "equipment_check" }, { type: "equipment_check" }));
check("connection check → typing are different pages", !opensSameScreen({ type: "equipment_check" }, { type: "typing_test" }));
check("the Decision stage has no page", !opensSameScreen({ type: "decision" }, { type: "decision" }));

/* ------------------------- the computer and connection check, first step */
console.log("\nwhereCandidateStands — with the connection check first (docs/EQUIPMENT-CHECK.md §2):\n");

{
  const withConnection = buildCandidateJourney(
    [{ id: "step_connection", type: "equipment_check", title: "" }, ...ZULU_STEPS],
    { hasQuiz: true },
  );
  check(
    "journey: application, quiz, connection, typing, chat, interview, decision",
    withConnection.map((s) => s.id).join(",") === "application,quiz,step_connection,step_typing,step_chat,step_interview,decision",
    withConnection.map((s) => s.id).join(","),
  );
  check("an untitled step falls back to 'Your computer and connection'", withConnection[2].title === "Your computer and connection", withConnection[2].title);
  const open = whereCandidateStands(withConnection, app("step_connection", "reviewing", { applicationAnswers: ANSWERS }));
  check("connection check open, nothing sent → take it (Step 3 of 7)", open.kind === "take" && open.step.id === "step_connection" && open.index === 2, JSON.stringify(open));
  const sent = whereCandidateStands(
    withConnection,
    app("step_connection", "reviewing", { applicationAnswers: ANSWERS, equipmentCheckResult: { downloadMbps: 28.4, meetsBars: true } }),
  );
  check("result on file, typing not open → waiting, never 'take' again", sent.kind === "waiting" && sent.step.id === "step_connection", JSON.stringify(sent));
  const legacyOnly = whereCandidateStands(
    withConnection,
    app("step_connection", "reviewing", { applicationAnswers: ANSWERS, step_connection: { type: "equipment_check" } }),
  );
  check("the legacy entry alone does not count — only equipmentCheckResult does", legacyOnly.kind === "take", JSON.stringify(legacyOnly));
  const moved = advanceAfterStep(withConnection, "step_connection", { phase: "step_typing", status: "reviewing" });
  check("sent, phase moved to typing → 'Start Typing speed and accuracy'", moved.kind === "next" && moved.step.id === "step_typing", JSON.stringify(moved));
}

/* --------------------------------------------- when the server is asked again */
console.log("\nserverReplyIsFinal — a failed or too-early request is asked again once:\n");

check("advanced → final", serverReplyIsFinal({ data: { decision: "advanced", nextPhaseId: "step_chat", score: null } }));
check("needs_employer_approval → final", serverReplyIsFinal({ data: { decision: "needs_employer_approval" } }));
check("stale (the row moved already) → final", serverReplyIsFinal({ data: { decision: "stale" } }));
check("rejected → final", serverReplyIsFinal({ data: { decision: "rejected" } }));
check("not_ready (result not visible yet) → ask again", !serverReplyIsFinal({ data: { decision: "not_ready", reason: "result_missing" } }));
check("a 500 → ask again", !serverReplyIsFinal({ data: null, error: { message: "Failed to advance application" } }));
check("no reply at all → ask again", !serverReplyIsFinal(null));
check("a decision this build does not know → ask again", !serverReplyIsFinal({ data: { decision: "later" } }));

/* --------------------------------------------------- multi-select answer */
console.log("\nformatMultiSelectAnswer — the shift question:\n");

const SHIFTS = [
  "Daytime, 8am to 4pm Eastern",
  "Evening, 4pm to midnight Eastern",
  "Overnight, midnight to 8am Eastern",
  "Weekends (Saturday and Sunday)",
];
{
  const r = formatMultiSelectAnswer(SHIFTS, ["Weekends (Saturday and Sunday)", "Daytime, 8am to 4pm Eastern"]);
  check(
    "kept in the job's option order, joined with '; ' (the options contain commas)",
    r.answer === "Daytime, 8am to 4pm Eastern; Weekends (Saturday and Sunday)" &&
      JSON.stringify(r.selected) === JSON.stringify(["Daytime, 8am to 4pm Eastern", "Weekends (Saturday and Sunday)"]),
    r.answer,
  );
}
{
  const r = formatMultiSelectAnswer(SHIFTS, []);
  check("nothing ticked → empty answer (a required question then blocks Continue)", r.answer === "" && r.selected.length === 0);
}
{
  const r = formatMultiSelectAnswer(SHIFTS, ["Any shift, including weekends", "Evening, 4pm to midnight Eastern"]);
  check("a value no longer among the options is dropped", r.answer === "Evening, 4pm to midnight Eastern");
}

/* --------------------------------------------------------- page sources */
console.log("\nStep pages keep the fix:\n");

const PHASE_PAGES = [
  "src/pages/ApplicationFormPhase.tsx",
  "src/pages/QuizPhase.tsx",
  "src/pages/TypingTestPhase.tsx",
  "src/pages/ChatSimulationPhase.tsx",
  "src/pages/ChatInterviewPhase.tsx",
  "src/pages/SalesSimulationPhase.tsx",
  "src/pages/VideoIntroPhase.tsx",
  "src/pages/PortfolioUploadPhase.tsx",
  // The computer and connection check (docs/EQUIPMENT-CHECK.md §3). Listed
  // the moment its route segment exists: a page that is missing is a FAIL
  // here, never a silent skip — that is how a page slips past every check.
  "src/pages/ConnectionCheckPhase.tsx",
];
for (const rel of PHASE_PAGES) {
  const name = rel.split("/").pop();
  let text;
  try {
    text = await read(rel);
  } catch {
    check(`${name}: exists (every segment in STEP_ROUTE_SEGMENTS has a page)`, false, rel);
    continue;
  }
  // "Already submitted" is decided at first load only.
  const guarded = [...text.matchAll(/<PhaseAlreadySubmitted/g)].every((m) => {
    const before = text.slice(Math.max(0, m.index - 600), m.index);
    return /if \(resultAtFirstLoad && /.test(before);
  });
  check(`${name}: PhaseAlreadySubmitted only behind resultAtFirstLoad`, guarded && /useResultAtFirstLoad\(isFetchedAfterMount/.test(text));
  check(`${name}: the send goes through useStepAdvance + StepAdvanceScreen`, /useStepAdvance\(/.test(text) && /<StepAdvanceScreen/.test(text));
  check(`${name}: no timed redirect to the overview`, !/setTimeout\(\(\) => navigate\(/.test(text));
  check(`${name}: no private step-to-route map`, !/phaseRoutes/.test(text));
}

{
  const sim = await read("src/pages/ChatSimulationPhase.tsx");
  check("ChatSimulationPhase no longer writes its result into its own cache", !/setQueryData\(/.test(sim));
}
{
  const interview = await read("src/pages/ChatInterviewPhase.tsx");
  check("ChatInterviewPhase: one submit call for both endings", (interview.match(/mode:\s*"submit"/g) ?? []).length === 1);
  check("ChatInterviewPhase: no undecided scoring call (plain triggerAvaAnalysis)", !/[^e]triggerAvaAnalysis\(/.test(interview));
  check(
    "ChatInterviewPhase: scoring asks for a decision relative to this step",
    /autopilotDecision:\s*true,\s*\n\s*currentPhaseId:\s*stepId/.test(interview),
  );
  check(
    "ChatInterviewPhase: the overview's cache is refreshed after the interview",
    /invalidateQueries\(\{ queryKey: \["candidate-application", id\] \}\)/.test(interview),
  );
}
{
  const overview = await read("src/pages/CandidateApplicationDetail.tsx");
  const query = overview.slice(overview.indexOf('queryKey: ["candidate-application", id]'), overview.indexOf('queryKey: ["candidate-application", id]') + 600);
  check(
    "overview reads fresh: staleTime 0, refetchOnMount always, refetchOnWindowFocus",
    /staleTime: 0/.test(query) && /refetchOnMount: "always"/.test(query) && /refetchOnWindowFocus: true/.test(query),
  );
  check("overview labels steps from data (whereCandidateStands / stepIsDone)", /whereCandidateStands\(/.test(overview) && /stepIsDone\(/.test(overview));
  check("overview's live topic is per-instance", /\.channel\(`application-\$\{id\}-\$\{liveInstanceId\}`\)/.test(overview));
}
{
  const form = await read("src/pages/ApplicationFormPhase.tsx");
  // The form's own helpers, run for real: an optionless choice question is
  // text everywhere, so what is drawn, checked and stored agree.
  const start = form.indexOf("const normalizeQuestionType");
  const end = form.indexOf("// Email validation regex");
  let answerTypeOf = null;
  if (start !== -1 && end > start && form.slice(start, end).includes("const answerTypeOf")) {
    // stripTypeScriptTypes is marked experimental in Node 24; keep its
    // one-line warning out of the test output.
    const emitWarning = process.emitWarning;
    process.emitWarning = () => {};
    const js = stripTypeScriptTypes(form.slice(start, end));
    process.emitWarning = emitWarning;
    ({ answerTypeOf } = new Function(`${js}; return { answerTypeOf };`)());
  }
  check("form: answerTypeOf exists next to normalizeQuestionType", typeof answerTypeOf === "function");
  if (answerTypeOf) {
    const opts = ["Daytime", "Weekends"];
    check("form: multi_select with options → multi_select", answerTypeOf({ type: "multi_select", options: opts }) === "multi_select");
    check("form: 'checkboxes' with options → multi_select", answerTypeOf({ type: "checkboxes", options: opts }) === "multi_select");
    check("form: multi_select with no options → text", answerTypeOf({ type: "multi_select" }) === "text");
    check("form: multi_select with an empty list → text", answerTypeOf({ type: "multi_select", options: [] }) === "text");
    check("form: select with no options → text", answerTypeOf({ type: "dropdown", options: [] }) === "text");
    check("form: select with options stays select", answerTypeOf({ type: "select", options: opts }) === "select");
    check("form: email stays email", answerTypeOf({ type: "email" }) === "email");
  }
  const validate = form.slice(form.indexOf("const validateForm"), form.indexOf("const validateForm") + 1500);
  check("form: Continue checks the effective type", /const type = answerTypeOf\(q\)/.test(validate) && /type === "multi_select"/.test(validate));
  check("form: storage records the effective type", /applicationAnswers = questions\.map\(q => \{\s*const type = answerTypeOf\(q\)/.test(form));
  check("form: the field is drawn from the effective type", /const questionType = answerTypeOf\(question\)/.test(form));
  check("form: no draw-only fallback for an optionless choice question", !/&& !hasSelectOptions\)/.test(form));
  check("form: multi_select is a supported type", /"multi_select",/.test(form) && /case "checkboxes":/.test(form));
  check("form: 'Pick every one that works'", /Pick every one that works/.test(form));
  check("form: no 'Start next step' that goes to the overview", !/handleEvaluationComplete/.test(form));
}

{
  const hook = await read("src/hooks/useStepAdvance.ts");
  check(
    "hook: in-app 'Start' only after this tab saw the move over realtime, never into the same page",
    /const nextNeedsFullLoad = !gateHasMove \|\| \(!!doneStep && !!nextStep && opensSameScreen\(doneStep, nextStep\)\)/.test(hook) &&
      /if \(outcome\.kind !== "pending"\) noteRealtimeMove\(\)/.test(hook),
  );
  check("hook: a move learned from the reply or a read never enables in-app navigation", !/resolvedVia === "read"/.test(hook));
  check(
    "hook: listens from the send, and keeps listening after 'passed' until realtime has the move",
    /const listening =\s*!!applicationId && !!stepId && \(view === "evaluating" \|\| \(view === "passed" && !gateHasMove\)\)/.test(hook),
  );
  check(
    "hook: asks the server once more, for this step, after a reply that is not final",
    /if \(!serverReplyIsFinal\(reply\)\) askAgain\(\)/.test(hook) &&
      /if \(retriedRef\.current \|\| !applicationId \|\| !stepId\) return;\s*retriedRef\.current = true;/.test(hook) &&
      /autopilotDecision: true,\s*currentPhaseId: stepId,/.test(hook),
  );
  check("hook: a different step on the same page starts clean", /if \(stepIdRef\.current === stepId\) return;\s*stepIdRef\.current = stepId;\s*cancel\(\);/.test(hook));
}
{
  const card = await read("src/components/candidate/NextStepCard.tsx");
  check("NextStepCard: 'Start <step>' always loads the page fresh", /onClick: \(\) => window\.location\.assign\(route\)/.test(card) && !/navigate\(route\)/.test(card));
  check(
    "NextStepCard: the waiting copy does not promise the step opens by itself",
    !/as soon as it's ready/.test(card) && /the hiring team will open it/.test(card),
  );
  const overview = await read("src/pages/CandidateApplicationDetail.tsx");
  check("overview: the same honest waiting copy", !/opens here as soon as it's ready/.test(overview) && /the hiring team will open it/.test(overview));
}

// Candidate copy never names the machinery.
for (const rel of ["src/components/EvaluationScreen.tsx", "src/components/candidate/NextStepCard.tsx"]) {
  const text = await read(rel);
  const strings = [
    ...text.matchAll(/"([^"\n]{12,})"/g),
    ...text.matchAll(/`([^`\n]{12,})`/g),
    ...text.matchAll(/>\s*([A-Z][^<>{}\n]{12,})\s*</g),
  ].map((m) => m[1]);
  const named = strings.filter((s) => /\b(ava|a\.?i\.?|artificial intelligence|bot|algorithm)\b/i.test(s));
  check(`${rel.split("/").pop()}: no candidate string names Ava or AI`, named.length === 0, named.join(" | "));
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
