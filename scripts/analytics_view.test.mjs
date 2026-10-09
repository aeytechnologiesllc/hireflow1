#!/usr/bin/env node
/**
 * The Analytics page's numbers (docs/ANALYTICS.md):
 * src/cockpit/lib/analyticsView.ts, drawn by src/cockpit/pages/Analytics.tsx.
 *
 * The owner, 2026-10-08: "this is the worst analytics and the ugliest
 * analytics I've ever seen. I want to see some premiumness, nice animation,
 * number rolling." He approved a mock-up built from his own totals. These
 * checks pin where each number comes from, so the page cannot drift from the
 * Applicants list or start showing a guess:
 *  - how far they got is the list's own dots, and only ever narrows;
 *  - "waiting for you" is the list's Needs review; finished is the list's;
 *  - scores are final scores of finishers only, against the job's own bar;
 *  - each test's figure, with the job's bar where the job states one;
 *  - Ava's marks counted once per person, the figures taken out;
 *  - hours on the applicants' clock, days on the reader's;
 *  - Ava's time and the speed from attempts that really ended;
 *  - totals only: nothing personal is read or kept;
 *  - the page: one data source, the pinned error state, motion that can be
 *    switched off.
 *
 * Run with: node scripts/analytics_view.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Decoded, so a checkout whose path has a space in it works too.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = pathToFileURL(path.join(ROOT, "src", specifier.slice(2))).href;
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

const A = await import(pathToFileURL(path.join(ROOT, "src/cockpit/lib/analyticsView.ts")).href);

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
const show = (v) => JSON.stringify(v);
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
/** Source with its comments taken out: a pin must not pass on a comment. */
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── A small hiring week, shaped like the live one ─────────────────────── */
// Steps: the form, a skills check, a connection check, a chat practice, a
// written interview. The reader is in New York, the applicants in Manila.
const STEPS = [
  ["application", "application", "Application"],
  ["quiz", "quiz", "Skills check"],
  ["conn", "equipment_check", "Computer and connection"],
  ["chat", "chat_simulation", "Escalated chat practice"],
  ["iv", "chat_interview", "Written interview"],
];
/** `done` steps are done; the next is "now" (or "todo" when `away`). */
function dots(done, { below = [], skipped = [], away = false } = {}) {
  const out = STEPS.map(([stepId, stepType, title], i) => ({
    stepId, stepType, title,
    state: skipped.includes(i) ? "skipped" : below.includes(i) ? "below" : i < done ? "done" : i === done && !away ? "now" : "todo",
  }));
  out.push({ stepId: "decision", stepType: "decision", title: "Decision", state: "todo" });
  return out;
}
const at = (day, hourUtc, min = 0) => new Date(Date.UTC(2026, 9, day, hourUtc, min)).toISOString();
let seq = 0;
const rows = [];
const apps = [];
const sessions = [];
function person({ done, status = "reviewing", tab, score = null, kind = "none", advice = null, applied, opts, notes = {}, whyDown, took }) {
  seq += 1;
  const id = `app-${seq}`;
  const finished = done >= STEPS.length;
  rows.push({ id, jobId: "job", status, tab: tab ?? (finished ? (status === "rejected" ? "declined" : status === "interview" ? "interview" : "needs-review") : done === 0 ? "part-way" : "taking-tests"), dots: dots(done, opts), finished, score, scoreKind: kind, recommendedAction: advice, appliedAt: applied });
  apps.push({ id, ai_score: score, notes: JSON.stringify(notes), ai_scorecard: whyDown ? { whyDown } : null });
  if (took != null) sessions.push({ application_id: id, step_type: "chat_interview", status: "completed", started_at: applied, ended_at: new Date(Date.parse(applied) + took * 60_000).toISOString() });
  return id;
}
const typing = (wpm, reply) => ({ wpm, medianReplySeconds: reply, repliesTimed: 6, bar: { minWpm: 40, maxMedianReplySeconds: 90 } });
// Six finished (Tue 8 AM Manila = Mon 8 PM New York = Tue 00:00 UTC).
person({ done: 5, score: 78, kind: "final", advice: "review", applied: at(6, 0), took: 60, notes: { quizResult: { score: 100 }, chatSimulationResult: { score: 70, typing: typing(56, 80) }, chatInterviewResult: { evaluation: { score: 80 } } }, whyDown: ["Slow replies: median 80 s; the job asks for 90 s"] });
person({ done: 5, score: 64, kind: "final", advice: "review", applied: at(6, 0, 20), took: 100, status: "interview", notes: { quizResult: { score: 80 }, chatSimulationResult: { score: 60, typing: typing(44, 120) }, chatInterviewResult: { evaluation: { score: 62 } } }, whyDown: ["Little evidence of leading a team (1/5)", "Interview: little evidence of leading a team (2/5)", "Slow replies: median 120 s; the job asks for 90 s"] });
person({ done: 5, score: 55, kind: "final", advice: "review", applied: at(6, 1), took: 110, notes: { quizResult: { score: 80 }, chatSimulationResult: { score: 40, typing: typing(38, 150) }, chatInterviewResult: { evaluation: { score: 55 } } }, whyDown: ["Little evidence of leading a team (2/5)", "Escalated chat practice 40/100", "Slow replies: median 150 s; the job asks for 90 s"] });
person({ done: 5, score: 52, kind: "final", advice: "reject", applied: at(6, 1, 30), took: 130, notes: { quizResult: { score: 60 }, chatSimulationResult: { score: 35, typing: typing(41, 170) }, chatInterviewResult: { evaluation: { score: 50 } } }, whyDown: ["Little evidence of leading a team (1/5)", "Interview credibility is low", "Connection below the job's bar (latency)"] });
person({ done: 5, score: 41, kind: "final", advice: "reject", status: "rejected", applied: at(7, 5), took: 30 * 60, notes: { quizResult: { score: 60 }, chatSimulationResult: { score: 30 }, chatInterviewResult: { evaluation: { score: 30 } } }, whyDown: ["Interview credibility is low", "The job asks for “At least 2 years of customer or chat support experience”. The applicant has one."] });
person({ done: 5, score: 33, kind: "final", advice: "reject", status: "rejected", applied: at(7, 6), took: 45, opts: { below: [3] }, notes: { quizResult: { score: 40 } }, whyDown: [] });
// On the way: two in the chat, one past a step with no result on file, one still on the form, one declined early.
person({ done: 3, score: 60, kind: "so_far", applied: at(7, 0, 5), notes: { quizResult: { score: 100 } } });
person({ done: 3, applied: at(7, 0, 40), opts: { skipped: [2] }, notes: { quizResult: { score: 80 } } });
person({ done: 1, applied: at(8, 0, 10), opts: { away: true } });
person({ done: 0, status: "in_progress", applied: at(8, 3) });
person({ done: 2, status: "rejected", tab: "declined", applied: at(8, 14), whyDown: ["Not counted: they did not finish"] });
// Attempts that must not count: one still open, one superseded, one for somebody else's applicant.
sessions.push({ application_id: "app-7", step_type: "chat_simulation", status: "active", started_at: at(7, 1), ended_at: null });
sessions.push({ application_id: "app-1", step_type: "chat_simulation", status: "superseded", started_at: at(6, 0), ended_at: at(6, 9) });
sessions.push({ application_id: "someone-else", step_type: "chat_interview", status: "completed", started_at: at(6, 0), ended_at: at(6, 1) });
// A chat practice that really ran, and one left open for a day (capped).
sessions.push({ application_id: "app-1", step_type: "chat_simulation", status: "completed", started_at: at(6, 0), ended_at: at(6, 0, 15) });
sessions.push({ application_id: "app-2", step_type: "chat_simulation", status: "completed", started_at: at(6, 0), ended_at: at(7, 0) });
sessions.push({ application_id: "app-1", step_type: "quiz", status: "completed", started_at: at(6, 0), ended_at: at(6, 0, 5) });

const NOW = Date.parse(at(8, 23));
const input = { rows, apps, sessions, passingScore: 60, now: NOW, viewerZone: "America/New_York", applicantZone: "Asia/Manila", traffic: [
  { day: "2026-10-03", careers_views: 0, job_views: 0, apply_views: 0 },
  { day: "2026-10-06", careers_views: 10, job_views: 1, apply_views: 40 },
  { day: "2026-10-07", careers_views: 4, job_views: 0, apply_views: 12 },
] };
const v = A.buildAnalyticsView(input);

console.log("\nHow far they got");
{
  check("everyone who started is the first step", v.started === 11 && v.funnel[0].label === "Started" && v.funnel[0].count === 11 && v.funnel[0].pct === 100);
  check("each step is named as the job names it, the form as 'Sent the form'", show(v.funnel.map((s) => s.label)) === show(["Started", "Sent the form", "Skills check", "Computer and connection", "Escalated chat practice", "Written interview"]), show(v.funnel.map((s) => s.label)));
  check("the counts are the list's own dots", show(v.funnel.map((s) => s.count)) === show([11, 10, 9, 8, 6, 6]), show(v.funnel.map((s) => s.count)));
  check("a step with no result that they went past counts as passed; a step merely skipped at the end does not", v.funnel[3].count === 8);
  check("'below the bar' on a step is still that step done", v.funnel[4].count === 6);
  check("each step says how many have not got past it yet, and the biggest drop is marked", show(v.funnel.map((s) => s.lost)) === show([0, 1, 1, 1, 2, 0]) && v.biggestDrop === 4, show({ lost: v.funnel.map((s) => s.lost), most: v.biggestDrop }));
  check("percentages are of everyone who started", show(v.funnel.map((s) => s.pct)) === show([100, 91, 82, 73, 55, 55]));
  const later = A.buildAnalyticsView({ ...input, rows: rows.map((r, i) => (i === 9 ? { ...r, dots: dots(0).map((d, k) => (k === 3 ? { ...d, state: "done" } : d)) } : r)) });
  check("a funnel only narrows: a later step never shows more people than the one before it", later.funnel.every((s, i) => i === 0 || s.count <= later.funnel[i - 1].count));
  check("the last step is the people who finished, which is the list's own 'finished'", v.finished === 6 && v.funnel[5].count === v.finished && v.finishedPct === 55);
  check("waiting for you is the list's Needs review, wherever they are", v.waiting === 3 && v.after.waiting === 3);
  check("what became of the finishers adds up to them", v.after.waiting + v.after.declined + v.after.forward === v.finished && v.after.declined === 2 && v.after.forward === 1, show(v.after));
}

console.log("\nHow good they are");
{
  check("only final scores of people who finished are drawn (a score 'so far' is not)", v.scores.of === 6 && v.scores.buckets.reduce((a, b) => a + b, 0) === 6);
  check("in tens, 0 to 9 up to 90 to 100", show(v.scores.buckets) === show([0, 0, 0, 1, 1, 2, 1, 1, 0, 0]), show(v.scores.buckets));
  check("the middle score, the average and the top", v.scores.median === 54 && v.scores.average === 54 && v.scores.top === 78, show(v.scores));
  check("the bar is the job's own pass mark", v.scores.bar === 60 && v.scores.atBar === 2);
  const none = A.buildAnalyticsView({ ...input, passingScore: null });
  const high = A.buildAnalyticsView({ ...input, passingScore: 70 });
  check("60 when the job has none; the job's when it has", none.scores.bar === 60 && high.scores.bar === 70 && high.scores.atBar === 1);
  check("Ava's advice on the finishers: a closer look, or decline", show(v.advice) === show({ look: 3, decline: 3 }));
  check("100 lands in the top bucket, not outside it", A.buildAnalyticsView({ ...input, rows: rows.map((r, i) => (i === 0 ? { ...r, score: 100 } : r)) }).scores.buckets[9] === 1);
}

console.log("\nTest by test");
{
  const by = Object.fromEntries(v.tests.map((t) => [t.key, t]));
  check("each test the job has, under the job's name for it", show(v.tests.map((t) => t.label)) === show(["Skills check", "Typing in the chat", "Written interview", "Escalated chat practice", "Time to reply in the chat"]), show(v.tests.map((t) => t.label)));
  check("the skills check is an average percentage, over everyone who took it", by.skills.value === 75 && by.skills.unit === "% average" && by.skills.barAt === null, show(by.skills));
  check("typing is the middle speed, against the job's own bar", by.typing.value === 43 && by.typing.barWords === "The job asks for 40." && by.typing.note === "3 of 4 reached it." && by.typing.warn === false, show(by.typing));
  check("reply time is the middle, and slower than the job asks is a warning", by.reply.value === 135 && by.reply.barWords === "The job asks for 90 seconds." && by.reply.note === "Only 1 of 4 made it." && by.reply.warn === true, show(by.reply));
  check("the bar's tick sits where the bar is on the same scale as the fill", Math.round(by.typing.barAt) === 50 && Math.round(by.typing.fill) === 54 && by.reply.barAt === 37.5 && by.reply.fill > by.reply.barAt);
  check("the chat and the interview are averages, with how many reached the job's bar", by.chat.value === 47 && by.chat.note === "2 of 5 scored 60 or more." && by.interview.value === 55 && by.interview.note === "2 of 5 scored 60 or more.", show([by.chat, by.interview]));
  const bare = A.buildAnalyticsView({ ...input, apps: apps.map((a) => ({ ...a, notes: null })) });
  check("a job with no results on file has no meters, not empty ones", bare.tests.length === 0);
  check("notes that are not JSON are read as no results, not an error", A.buildAnalyticsView({ ...input, apps: apps.map((a) => ({ ...a, notes: "plain words" })) }).tests.length === 0);
}

console.log("\nWhat holds them back");
{
  check("the figures are taken out, so one mark on many people is one line", A.reasonLabel("Little evidence of leading a team (1/5)") === "Little evidence of leading a team" && A.reasonLabel("Little evidence of leading a team (3/5)") === "Little evidence of leading a team");
  check("the same mark seen in the interview is the same mark", A.reasonLabel("Interview: little evidence of leading a team (2/5)") === "Little evidence of leading a team");
  check("a test and its score is a low score on that test", A.reasonLabel("Escalated chat practice 40/100") === "Low score: escalated chat practice" && A.reasonLabel("Written interview 45/100") === "Low score: written interview");
  check("slow replies, whatever the seconds", A.reasonLabel("Slow replies: median 164 s; the job asks for 90 s") === "Slow replies in the chat");
  check("typing under the bar, whatever the speed", A.reasonLabel("Typed 31 WPM in the chat practice (bar 40)") === "Typing below the job's bar");
  check("the detail in brackets goes", A.reasonLabel("Connection below the job's bar (latency)") === "Connection below the job's bar");
  check("a requirement quoted from the post is one kind of mark", A.reasonLabel("The job asks for “At least 2 years of customer or chat support experience, including time leading”. The appl...") === "A requirement in the job post not met");
  check("a mark with no figures is kept as written", A.reasonLabel("Interview credibility is low") === "Interview credibility is low" && A.reasonLabel("Wants to mostly manage, not work the chat queue") === "Wants to mostly manage, not work the chat queue" && A.reasonLabel("missed the integrity question on the skills check") === "Missed the integrity question on the skills check");
  check("nothing is not a mark", A.reasonLabel("   ") === null);
  check("ranked by how many people carry each, one person counted once per mark", show(v.reasons.slice(0, 3)) === show([{ label: "Little evidence of leading a team", count: 3 }, { label: "Slow replies in the chat", count: 3 }, { label: "Interview credibility is low", count: 2 }]), show(v.reasons));
  check("only people who finished are counted", !v.reasons.some((r) => /Not counted/.test(r.label)) && v.reasonsOf === 6);
  check("at most seven are shown", A.buildAnalyticsView({ ...input, apps: apps.map((a, i) => (i === 0 ? { ...a, ai_scorecard: { whyDown: ["a mark one", "a mark two", "a mark three", "a mark four", "a mark five", "a mark six", "a mark seven", "a mark eight", "a mark nine"] } } : a)) }).reasons.length === 7);
  const line = A.reasonsLine(v);
  check("Ava's line names the most common one, out of everyone who finished", show(line) === show({ label: "little evidence of leading a team", count: 3, of: 6 }), show(line));
  check("with nobody marked there is no list and no line", A.buildAnalyticsView({ ...input, apps: apps.map((a) => ({ ...a, ai_scorecard: null })) }).reasons.length === 0 && A.reasonsLine(A.buildAnalyticsView({ ...input, apps: apps.map((a) => ({ ...a, ai_scorecard: null })) })) === null);
}

console.log("\nWhen they apply");
{
  check("hours are on the applicants' clock when the job says where it is posted for", v.hours.theirs === true && v.hours.zone === "Asia/Manila" && v.hours.counts[8] === 5 && v.hours.counts[9] === 2 && v.hours.peakHour === 8 && v.hours.peakCount === 5, show(v.hours.counts));
  check("the reader's clock is said too: New York is twelve hours behind Manila", v.hours.readerShift === -12 && A.hourWords(8 + v.hours.readerShift) === "8:00 PM");
  check("the busiest two hours in a row", show(v.hours.rush) === show({ from: 8, count: 7 }), show(v.hours.rush));
  const own = A.buildAnalyticsView({ ...input, applicantZone: null });
  check("with no applicants' clock, the hours are the reader's own and no second clock is offered", own.hours.theirs === false && own.hours.zone === "America/New_York" && own.hours.readerShift === null && own.hours.peakHour === 20);
  check("same clock, no shift", A.buildAnalyticsView({ ...input, applicantZone: "America/New_York" }).hours.readerShift === null);
  check("days are on the reader's clock, oldest first, every day in between", show(v.days.map((d) => `${d.label} ${d.count}`)) === show(["Mon 4", "Tue 2", "Wed 4", "Thu 1"]), show(v.days));
  check("a zone the browser does not know is no chart, not a crash", A.buildAnalyticsView({ ...input, viewerZone: "Not/AZone", applicantZone: null }).days.length === 0);
  check("the first application's moment is kept for 'Since Monday'", v.firstAt === Date.parse(at(6, 0)));
  check("hours as people say them", A.hourWords(0) === "12:00 AM" && A.hourWords(12) === "12:00 PM" && A.hourWords(20) === "8:00 PM" && A.hourWords(26) === "2:00 AM" && A.hourWords(-4) === "8:00 PM");
}

console.log("\nWhat Ava did, and how fast it moves");
{
  check("read and scored, skills checks marked, replies sent", v.ava.scored === 7 && v.ava.skills === 8 && v.ava.replies === 3, show(v.ava));
  check("chat practices and interviews are attempts that really ended, of these applicants only", v.ava.chats === 2 && v.ava.interviews === 6, show(v.ava));
  check("her time is those attempts added up, one left open for a day capped at three hours", v.avaMinutes === 60 + 100 + 110 + 130 + 180 + 45 + 15 + 180, String(v.avaMinutes));
  check("the middle time from Apply to the last attempt that ended, over the finishers", v.speed.of === 6 && v.speed.medianMinutes === 120, show(v.speed));
  check("how many finished within a day, and inside two hours", v.speed.withinDay === 5 && v.speed.withinTwoHours === 3, show(v.speed));
  check("a time as days, hours and minutes", show(A.spanParts(102)) === show({ days: 0, hours: 1, minutes: 42 }) && show(A.spanParts(1500)) === show({ days: 1, hours: 1, minutes: 0 }) && show(A.spanParts(-5)) === show({ days: 0, hours: 0, minutes: 0 }));
  check("visits: the three doors, and the days from the first one anybody came", v.visits.careers === 14 && v.visits.job === 1 && v.visits.apply === 52 && show(v.visits.days.map((d) => `${d.label} ${d.count}`)) === show(["Tue 51", "Wed 16"]), show(v.visits));
  check("no visits at all is no visits card", A.buildAnalyticsView({ ...input, traffic: [] }).visits === null && A.buildAnalyticsView({ ...input, traffic: null }).visits === null);
}

console.log("\nNobody yet");
{
  const empty = A.buildAnalyticsView({ rows: [], apps: [], sessions: [], now: NOW, viewerZone: "America/New_York" });
  check("an empty job is zeros and empty lists, with nothing invented", empty.started === 0 && empty.finished === 0 && empty.finishedPct === 0 && empty.funnel.length === 1 && empty.days.length === 0 && empty.tests.length === 0 && empty.reasons.length === 0 && empty.hours.peakHour === null && empty.scores.median === null && empty.advice === null && empty.speed.medianMinutes === null && empty.biggestDrop === null);
  check("the middle of nothing is nothing", A.median([]) === null && A.median([3]) === 3 && A.median([1, 3]) === 2);
}

console.log("\nTotals only, and the wiring");
{
  const lib = code(await read("src/cockpit/lib/analyticsView.ts"));
  const page = code(await read("src/cockpit/pages/Analytics.tsx"));
  const motion = code(await read("src/cockpit/components/analytics/AnalyticsMotion.tsx"));
  const css = await read("src/cockpit/analytics.css");
  const hook = code(await read("src/cockpit/hooks/useApplicantList.ts"));

  check("the numbers never read a name, an email, a phone or an answer", !/full_name|\.email|phone|applicationAnswers|profiles|cover_letter|transcript/i.test(lib));
  check("the view holds no applicant id either", !/"app-\d+"/.test(show(v)));
  check("notes are read through the safe parser", /parseApplicationNotes\(app\.notes\)/.test(lib) && !/JSON\.parse/.test(lib));
  check("the page counts from the Applicants list's own rows and download: no query of its own", /const list = useApplicantList\(\);/.test(page) && /rows: list\.rows\.filter\(\(r\) => r\.jobId === jobId\),\s*apps: list\.apps,\s*sessions: list\.sessions,/.test(page) && !/supabase/.test(page) && /apps: apps\.data \?\? NO_APPS,\s*sessions: sessions\.data \?\? NO_SESSIONS,/.test(hook));
  check("the job's own pass mark and where it is posted for are passed in", /passingScore: job\?\.passing_score \?\? null,/.test(page) && /applicantZone: job \? zoneFromJob\(\{ countryCode: job\.location_country_code, text \}\) : null,/.test(page));
  check("a failed load says so and offers a retry: never a page of zeros", /if \(analyticsFailed\) \{\s*return <CockpitErrorCard message="We couldn't load your analytics just now\." onRetry=\{refetchAnalytics\} \/>;/.test(page) && /const analyticsFailed = list\.isError;/.test(page));
  check("nobody applied yet keeps the visits card and the link to share", /if \(view\.started === 0\) \{/.test(page) && /<TrafficSection days=\{traffic\} applications=\{0\}/.test(page) && /<ShareJobCompact job=\{liveJob\} \/>/.test(page));
  check("'Review them' opens the list on Needs review", /navigate\("\/applicants\?tab=needs-review"\)/.test(page));
  check("a section with nothing to count is left out", /\{n >= 2 && \(/.test(page) && /\{scores\.of > 0 && \(/.test(page) && /\{view\.tests\.length > 0 && \(/.test(page) && /\{view\.reasons\.length > 0 && \(/.test(page) && /\{hours\.peakHour != null && \(/.test(page) && /\{tally\.length > 0 && \(/.test(page) && /\{view\.visits && \(/.test(page) && /\{middle && speed\.of > 0 && \(/.test(page));
  check("more than one job with applicants: the page asks which", /\{counted\.length > 1 && \(\s*<select className="an-pick" aria-label="Which job"/.test(page));
  check("a rolling number is read out as the plain number", /role="img" aria-label=\{text\}/.test(motion) && /aria-hidden/.test(motion));
  check("each section plays once, when it comes into view", /new IntersectionObserver\(/.test(motion) && /watch\.disconnect\(\);/.test(motion) && /typeof IntersectionObserver === "undefined"/.test(motion));
  check("without motion everything is in its final state", /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.an-reveal, \.an-reveal\.in \{ opacity: 1; transform: none; \}[\s\S]*\.an-reveal \.an-odo-col \{ transform: translateY\(calc\(var\(--to\) \* -1 \* var\(--row\)\)\); \}/.test(css));
  check("the default drawing is the final one: motion is only ever added by .an-reveal", /\.an-odo-col \{[^}]*transform: translateY\(calc\(var\(--to\) \* -1 \* var\(--row\)\)\); \}/.test(css) && /\.an-reveal \.an-odo-col \{ transform: translateY\(0\);/.test(css));
  check("both themes: every colour is one of the app's own tokens", !/#[0-9a-fA-F]{6}\b/.test(css.replace(/#072a1f/g, "")) );
  const doc = await read("docs/ANALYTICS.md");
  check("docs/ANALYTICS.md explains it and names this test", /scripts\/analytics_view\.test\.mjs/.test(doc) && /lib\/analyticsView\.ts/.test(doc));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
