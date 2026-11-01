#!/usr/bin/env node
/**
 * The job builder shows that what the business types is used
 * (src/lib/builderHints.ts, src/pages/AvaCreateJob.tsx). The owner, after a
 * walkthrough on 2026-11-01: "you can't tell if you're just typing it to be
 * typing it, or it's actually going to take all this information when
 * creating a job ... hints that everything you're saying we're gonna take
 * that when creating a job or skill test."
 *
 * Holds: every question Ava asks a chat or email agent's business has its
 * line and short words for every chip; each line says only what the plan
 * really reads (proved on the built-in plan: the kind of business changes the
 * skills check and the practice, the channel the practice and not the skills
 * check, the internet answer the computer check's bars, and the writer-only
 * answers change nothing the built-in plan builds, while the writer is sent
 * every one of them); the "Ava is building from" tags; the review's "From
 * your answers:" names only what shaped that step, and the post's follow-up
 * answers only on a plan the writer wrote; the step rail's "Follow-ups" count
 * (the question showing, then the answers, never the taps); and the page
 * wires all of it.
 *
 * Run with: node scripts/builder_hints.test.mjs
 */
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const bundle = await build({
  stdin: {
    contents:
      'export * from "./src/lib/builderHints.ts";\n' +
      'export { PLAYBOOKS, REMOTE_FOLLOWUPS, CHAT_AGENT_KIND, JOB_KIND_ID, briefFromForm, chipAnswersToBriefAnswers, withRemoteFollowUps } from "./src/lib/avaEngine/playbook.ts";\n' +
      'export { generateTemplateFlow } from "./src/lib/avaEngine/templateGenerator.ts";\n',
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  alias: { "@": path.join(ROOT, "src") },
  logLevel: "silent",
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

// --- every question and every chip has its words ----------------------------------------
const ROLE = "Patient chat agent";
const WORK = "Answer patients who write to us by chat and email.";
const defsFor = (workMode, picks = {}) =>
  M.withRemoteFollowUps(M.PLAYBOOKS.customer_service.followUps(picks, { roleTitle: ROLE, whatTheyDo: WORK, businessName: "Bright Smile Dental" }), workMode);
const asked = defsFor("remote");
{
  const ids = asked.map((d) => d.id);
  check("the remote builder asks eight questions, the on-site six", ids.length === 8 && defsFor("onsite").length === 6, ids.join());
  check("every question asked has a line saying what it shapes", ids.every((id) => !!M.questionShapes(id)), ids.filter((id) => !M.questionShapes(id)).join());
  check("…and no line is kept for a question no longer asked", M.HINTED_QUESTIONS.every((id) => ids.includes(id)), M.HINTED_QUESTIONS.filter((id) => !ids.includes(id)).join());
  const missing = asked.flatMap((d) => d.chips.filter((c) => !M.ANSWER_TAGS[d.id]?.[c]).map((c) => `${d.id}: ${c}`));
  check("every chip has its own short words (none shown raw)", missing.length === 0, missing.join(" | "));
  check("the short words are short", Object.values(M.ANSWER_TAGS).every((m) => Object.values(m).every((w) => w.length <= 24)));
  check("an answer from an older draft shows as it is", M.answerTag("cs-channel", "Phone") === "Phone" && M.answerTag("no-such", "x") === null);
}

// --- each line says only what the plan reads (the built-in plan, no AI) ---------------------
const briefWith = (answers, opts = {}) =>
  M.briefFromForm({
    role: ROLE,
    location: opts.location ?? "Remote, United States",
    type: opts.type ?? "Full-time · Remote",
    typeChosen: false,
    atOffice: false,
    pay: "$18 an hour",
    start: "Within a few weeks",
    work: WORK,
    openings: 1,
    benefits: [],
    followUps: M.chipAnswersToBriefAnswers([M.CHAT_AGENT_KIND, ...asked], { [M.JOB_KIND_ID]: 0, ...answers }),
  });
const chipIndex = (id, label) => asked.find((d) => d.id === id).chips.indexOf(label);
const planFor = (answers, opts) => M.generateTemplateFlow({ brief: briefWith(answers, opts), rigor: "standard" }).flow;
const phase = (flow, kind) => flow.phases.find((p) => p.kind === kind);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
{
  const base = { "cs-industry": chipIndex("cs-industry", "Dental office"), "cs-channel": chipIndex("cs-channel", "Chat and email") };
  const dental = planFor(base);
  const store = planFor({ ...base, "cs-industry": chipIndex("cs-industry", "Online store") });
  check("the kind of business shapes the skills check", !same(phase(dental, "quiz").config.items, phase(store, "quiz").config.items));
  check("…and the chat practice", !same(phase(dental, "simulation").config.scenarios, phase(store, "simulation").config.scenarios));
  check("…as its line says", /skills check/.test(M.questionShapes("cs-industry")) && /practice/.test(M.questionShapes("cs-industry")));

  const email = planFor({ ...base, "cs-channel": chipIndex("cs-channel", "Email") });
  check("the channel shapes the practice (chat or email)", phase(dental, "simulation").config.channel === "chat" && phase(email, "simulation").config.channel === "email");
  check("…and not the skills check", same(phase(dental, "quiz").config.items, phase(email, "quiz").config.items));
  check("…as its line says, in the practice's own name", M.questionShapes("cs-channel") === "Shapes the chat practice and the job post" && M.questionShapes("cs-channel", { channel: "Email" }) === "Shapes the email practice and the job post" && M.questionShapes("cs-industry", { channel: "Email" }) === "Shapes the skills check and the email practice");

  const basic = planFor({ ...base, "remote-internet": chipIndex("remote-internet", "Basic broadband is fine") });
  const wired = planFor({ ...base, "remote-internet": chipIndex("remote-internet", "Fast wired connection required") });
  check("the internet answer sets the computer check's bars", phase(basic, "equipment_check").config.minDownloadMbps < phase(wired, "equipment_check").config.minDownloadMbps);
  check("…as its line says", M.questionShapes("remote-internet") === "Shapes the computer check");
  // Under each answer, what it gets them in practice (the owner, 2026-11-01: "say we will test their connection ... so
  // they know what each answer will get them"): the very bars the built-in plan saves for that answer, nothing more.
  for (const chip of M.REMOTE_FOLLOWUPS.find((f) => f.id === "remote-internet").chips) {
    const cfg = phase(planFor({ ...base, "remote-internet": chipIndex("remote-internet", chip) }), "equipment_check").config;
    const line = M.internetAnswerLine(chip);
    const want = `At least ${cfg.minDownloadMbps} Mbps down and ${cfg.minUploadMbps} up, ping ${cfg.maxLatencyMs} ms or less.`;
    check(`${JSON.stringify(chip)}'s line states the check's own bars: ${line}`, line.startsWith(want), `${line} / ${want}`);
  }
  check("the wired answer says the check measures speed, not the cable (it cannot see one)", /It measures speed, not the cable\.$/.test(M.internetAnswerLine("Fast wired connection required")) && !/cable/.test(M.internetAnswerLine("Basic broadband is fine")));
  check("the line over them says what the check is, and that it declines nobody (docs/EQUIPMENT-CHECK.md rules 1-3)", /our own speed test on the computer they'll work from/.test(M.INTERNET_CHECK_LINE) && /never an automatic no/.test(M.INTERNET_CHECK_LINE));
  const pageSrc = read("src/pages/AvaCreateJob.tsx");
  check("the page shows both on the internet question", /fu\.id === "remote-internet" \? internetAnswerLine\(chip\) : null/.test(pageSrc) && /\{INTERNET_CHECK_LINE\}/.test(pageSrc));

  // The answers only the writer reads: the built-in plan builds exactly the same thing whatever they are.
  const writerOnly = ["cs-load", "cs-hours", "cs-sensitive", "cs-tools", "remote-equipment"];
  const strip = (flow) => JSON.stringify(flow.phases.map(({ id, kind, title, candidateDescription, config, countLabel }) => ({ id, kind, title, candidateDescription, config, countLabel }))) + JSON.stringify(flow.jobPost);
  for (const id of writerOnly) {
    const other = planFor({ ...base, [id]: asked.find((d) => d.id === id).chips.length - 1 });
    const first = planFor({ ...base, [id]: 0 });
    check(`${id}: the built-in plan does not read it (so the review names it only on the writer's plan)`, strip(other) === strip(first));
    check(`${id}: its line names only what the writer writes (the post, the interview)`, /^Shapes the (job post|interview)( and the (job post|interview))?$/.test(M.questionShapes(id)), M.questionShapes(id));
  }
  // …and the writer is sent every answer, by question and answer, in its prompt.
  const fg = read("src/lib/avaEngine/flowGenerator.ts");
  const gf = read("supabase/functions/generate-flow/index.ts");
  check("the writer is sent the whole brief, answers included", /body: JSON\.stringify\(\{\s*brief: req\.brief,/.test(fg));
  check("generate-flow puts every answer in its prompt", /brief\.followUps\.map\(\(f: \{ question: string; answer: string \}\) => `\$\{f\.question\}: \$\{f\.answer\}`\)/.test(gf) && /Owner follow-up answers:/.test(gf));
  check("…and writes the post, the application and the interview from them", /jobPost: title, summary/.test(gf) && /short application questions/.test(gf) && /written interview questions/.test(gf));
  // (2026-11-01: the build reads the very follow-ups the questions show, the memo, with the business's own words in:
  // src/lib/ownAnswers.ts withOwnWords, scripts/business_kind.test.mjs.)
  const page = read("src/pages/AvaCreateJob.tsx");
  check("the page sends the answers it shows (the same follow-ups, with the kind of job)", /const followUps = useMemo\(\(\) => \{\s*const ask = \(a: Record<string, number>\) => withRemoteFollowUps\(playbook\.followUps\(a,/.test(page) && /followUps: briefAnswers\(followUps\),/.test(page) && /withOwnWords\(chipAnswersToBriefAnswers\(\[CHAT_AGENT_KIND, \.\.\.defs\]/.test(page));
}

// --- "Ava is building from" -----------------------------------------------------------------
{
  const given = [
    { questionId: "cs-channel", answer: "Chat and email" },
    { questionId: "cs-industry", answer: "Dental office" },
    { questionId: "cs-sensitive", answer: "Health details" },
  ];
  const known = M.knownSoFar({ role: ROLE, location: "Remote, United States", pay: "$18 an hour", workMode: "remote", countryCode: "US", answers: given });
  check("the strip: title, place, pay as the post shows it, then each answer", same(known, ["Patient chat agent", "Remote, United States", "USD 18 an hour", "Chat and email", "Dental office", "Health details"]), known.join(" · "));
  check("nothing typed, nothing shown", M.knownSoFar({ role: "", location: "", pay: "", workMode: "remote", answers: [] }).length === 0);
  check("a place: remote anywhere", M.placeTag("Remote (worldwide)", "remote") === "Remote, anywhere");
  check("a place: a country typed for a remote job", M.placeTag("United States", "remote") === "Remote, United States");
  check("a place: an office", M.placeTag("Austin, TX", "onsite") === "In person: Austin, TX");
  check("a place: partly at home", M.placeTag("Hybrid, Makati", "hybrid") === "Hybrid, Makati" && M.placeTag("Makati", "hybrid") === "Hybrid: Makati");
  check("pay with no amount shows as typed", M.payTag("Competitive", { remote: true }) === "Competitive");
  check("a long title is cut", M.roleTag("x".repeat(80)).length === 40 && M.roleTag("x".repeat(80)).endsWith("…"));
  const defs = asked;
  const at = (where, picks = {}) => M.answersGiven(defs, picks, where).map((a) => a.questionId);
  check("on the brief: no answers yet", at({ step: 0, questionIndex: 0 }).length === 0);
  check("…but one tapped before coming back stays", same(at({ step: 0, questionIndex: 0 }, { "cs-hours": 1 }), ["cs-hours"]));
  check("on question 3: the first three, the showing one as picked", same(at({ step: 1, questionIndex: 2 }), ["cs-channel", "cs-industry", "cs-load"]));
  check("…and its tag follows a tap", M.answersGiven(defs, { "cs-load": 2 }, { step: 1, questionIndex: 2 }).find((a) => a.questionId === "cs-load").answer === "Four or more");
  check("from How strict on: every answer", at({ step: 2, questionIndex: 0 }).length === defs.length && at({ step: 4, questionIndex: 0 }).length === defs.length);
}

// --- "From your answers:" on the plan's steps --------------------------------------------------
{
  const answers = M.answersGiven(asked, { "cs-industry": chipIndex("cs-industry", "Dental office"), "cs-channel": chipIndex("cs-channel", "Chat and email"), "cs-hours": chipIndex("cs-hours", "Evenings or nights"), "cs-sensitive": chipIndex("cs-sensitive", "Health details") }, { step: 4, questionIndex: 0 });
  const remote = { role: ROLE, location: "Remote, United States", pay: "$18 an hour", workMode: "remote", countryCode: "US", answers };
  const onsite = { ...remote, location: "Austin, TX", workMode: "onsite" };
  const from = (step, a, writtenByAva = false) => M.fromYourAnswers(step, a, { writtenByAva });
  check("skills check: the kind of business only (the pack's questions)", same(from("quiz", remote), ["Dental office"]));
  check("chat practice: the business, the channel, and a remote job's place (typing timed)", same(from("simulation", remote), ["Dental office", "Chat and email", "Remote, United States"]));
  check("…on site, no place (typing is not timed there)", same(from("simulation", onsite), ["Dental office", "Chat and email"]));
  check("computer check: the place and the internet answer", same(from("equipment_check", remote), ["Remote, United States", "Reliable internet"]));
  check("job post the writer wrote: the business, the channel, the hours", same(from("job-post", remote, true), ["Dental office", "Chat and email", "Evenings or nights"]));
  check("built-in job post: only the title, the place and the pay (it reads no follow-up)", same(from("job-post", remote, false), ["Patient chat agent", "Remote, United States", "USD 18 an hour"]));
  check("interview the writer wrote: the load and the private details", same(from("voice_interview", remote, true), ["Two or three at once", "Health details"]));
  check("built-in interview, and the application: nothing claimed", from("voice_interview", remote, false).length === 0 && from("application", remote, true).length === 0);
  check("at most three on a line", ["quiz", "simulation", "equipment_check", "voice_interview", "job-post"].every((s) => from(s, remote, true).length <= 3));
}

// --- the rail's "Follow-ups" count -----------------------------------------------------------------
// It counted taps: question 5 read "1 of 8", and all eight answered "4 of 8" (the walkthrough of 2026-11-01).
{
  const r = (where, picks = {}) => M.followUpsReceipt(asked, picks, where);
  check("on question 5: \"5 of 8\", however few were tapped", r({ step: 1, questionIndex: 4, furthest: 4 }, { "cs-channel": 2 }) === "5 of 8");
  check("on question 1: \"1 of 8\"", r({ step: 1, questionIndex: 0, furthest: null }) === "1 of 8");
  check("past them after all eight shown, four tapped: \"8 of 8\"", r({ step: 2, questionIndex: 7, furthest: 7 }, { "cs-channel": 2, "cs-industry": 1, "cs-hours": 1, "cs-sensitive": 2 }) === "8 of 8");
  check("…on the build and the review too", r({ step: 3, questionIndex: 7, furthest: 7 }) === "8 of 8" && r({ step: 4, questionIndex: 7, furthest: 7 }) === "8 of 8");
  check("a draft opened past the questions answered them all", r({ step: 4, questionIndex: 0, furthest: null }) === "8 of 8");
  check("fewer only for questions really not reached (shown up to 5, one tapped after)", r({ step: 2, questionIndex: 0, furthest: 4 }, { "remote-equipment": 1 }) === "6 of 8");
  check("on the brief before any question: nothing", r({ step: 0, questionIndex: 0, furthest: null }) === null);
  check("…back on the brief after three: \"3 of 8\"", r({ step: 0, questionIndex: 0, furthest: 2 }) === "3 of 8");
  check("no questions, no line", M.followUpsReceipt([], {}, { step: 1, questionIndex: 0, furthest: null }) === null);
  check("an index past the end reads the last", r({ step: 1, questionIndex: 12, furthest: 12 }) === "8 of 8");
}

// --- how long applicants spend (the run-through of 2026-10-31) -----------------------------------------
{
  check("a step's minutes are read from its own time line", M.minutesIn("~8 min") === 8 && M.minutesIn("8 min") === 8 && M.minutesIn("Public") === null && M.minutesIn("—") === null && M.minutesIn(null) === null);
  check("the total adds them up and skips a line with none", M.applicantMinutes(["~3 min", "8 min", "~1 min", "Public"]) === 12 && M.applicantMinutes(["—"]) === null);
  check("the review's line: the steps and the minutes", M.applicantTimeLine(5, 26) === "5 steps for applicants, about 26 minutes in all." && M.applicantTimeLine(1, null) === "1 step for applicants." && M.applicantTimeLine(0, 9) === null);
  const plans = Object.fromEntries(["easy", "standard", "high"].map((rigor) => [rigor, M.generateTemplateFlow({ brief: briefWith({}), rigor }).flow]));
  const words = Object.fromEntries(Object.entries(plans).map(([k, f]) => [k, M.rigorPlanWords(f.phases)]));
  const formQs = (f) => f.phases.find((p) => p.kind === "application").config.questions.length;
  const interviewQs = (f) => f.phases.find((p) => p.kind === "voice_interview").config.questions.length;
  check("each How strict card names the plan's own form and interview questions", Object.entries(plans).every(([k, f]) => words[k].line.startsWith(`${formQs(f)} form questions and a`) && words[k].line.includes(`${interviewQs(f)}-question written interview`)), JSON.stringify(words));
  check("…the steps every choice keeps", Object.values(words).every((w) => / with the skills check and the chat practice\.$/.test(w.line)));
  check("…and the minutes, the plan's own added up, more for a stricter screen", Object.entries(plans).every(([k, f]) => words[k].minutes === M.applicantMinutes(f.phases.map((p) => p.durationLabel))) && words.easy.minutes < words.standard.minutes && words.standard.minutes < words.high.minutes, JSON.stringify(words));
  check("an email agent's plan says the email practice", / and the email practice\.$/.test(M.rigorPlanWords(M.generateTemplateFlow({ brief: briefWith({ "cs-channel": chipIndex("cs-channel", "Email") }), rigor: "standard" }).flow.phases).line));
}

// --- the page wires it ---------------------------------------------------------------------------
{
  const page = read("src/pages/AvaCreateJob.tsx");
  const shared = read("src/components/ava/createFlow/shared.tsx");
  check("the brief says Ava writes the post and the tests from it", /\{BRIEF_USES_LINE\}/.test(page) && M.BRIEF_USES_LINE === "Ava writes your job post and your tests from these answers.");
  check("each question shows its line", /questionShapes\(fu\.id, \{ channel: channelPicked \}\)/.test(page) && /data-question-shapes/.test(page));
  check("the strip is on the brief, the questions and How strict", (page.match(/<BuildingFrom tags=\{knownTags\}/g) ?? []).length === 3 && /answersGiven\(followUps, chipAnswers, \{ step, questionIndex: fuIndex \}\)/.test(page));
  check("the review passes what shaped each step, the writer's plan known by its stamp", /fromAnswers=\{fromYourAnswers\(/.test(page) && /writtenByAva: flow\?\.generatedBy\?\.provider === "openai"/.test(page));
  check("the rail's Follow-ups count is the question showing, then the answers (never the taps)", /"Follow-ups": followUpsReceipt\(followUps, chipAnswers, \{ step, questionIndex: fuIndex, furthest: furthestQuestion \}\)/.test(page) && /if \(step === 1\) setFurthestQuestion\(\(f\) => Math\.max\(f \?\? -1, fuIndex\)\)/.test(page) && !/Object\.keys\(chipAnswers\)\.length\} of/.test(page));
  check("the card shows it as \"From your answers:\"", /fromAnswers && fromAnswers\.length > 0 &&/.test(shared) && /\{FROM_YOUR_ANSWERS\}/.test(shared) && M.FROM_YOUR_ANSWERS === "From your answers:");
  check("the How strict cards and the review read the plan's own time lines", /rigorPlanWords\(generateTemplateFlow\(\{ brief, rigor: o\.id \}\)\.flow\.phases\)/.test(page) && /applicantTimeLine\(screeningCardCount, applicantMinutes\(/.test(page) && /data-review-time/.test(page) && /data-rigor-minutes/.test(page));
  check("no new colour: the strip uses the fields' own surface and hairline", /background: "hsl\(var\(--ck-surface-2\)\)", border: "1px solid hsl\(var\(--border\)\)"/.test(page) && !/brass/i.test(page.slice(page.indexOf("function BuildingFrom"), page.indexOf("export default function AvaCreateJob"))));
}

console.log(`\nbuilder hints: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
