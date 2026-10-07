#!/usr/bin/env node
/**
 * What an applicant sees of an interview with the hiring team
 * (docs/INTERVIEWS.md, "What the applicant sees"): src/lib/candidateInterview.ts,
 * the applications list, the application page, the pop-up, the "suggest other
 * times" dialog, and the invitation email that starts it all.
 *
 * The owner tested it as an applicant on 2026-10-07 and found three things:
 *  - "Enter Job Code" was still in the applicant's menu ("there's no such
 *    thing as enter job code anymore");
 *  - after he offered times, the applicant's list still read as the test to
 *    take, with a small chip ("make it very clear when the interview is
 *    scheduled ... make sure the proposed times go in, they get to pick it or
 *    counter");
 *  - and, found in the logs behind his test, the invitation email was never
 *    sent: the wizard's lookup asked the database for a join it does not
 *    have, got a 400, and skipped the email without a word.
 *
 * These checks prove:
 *  - the four stages are read the same everywhere, from the row itself;
 *  - an offered time is never presented as the appointment;
 *  - the list card carries the interview's own block and button;
 *  - the page puts the interview first, with pick, confirm, and a way to
 *    suggest other times from every stage;
 *  - the invitation's lookup is one the database can answer, and a failure
 *    is said out loud;
 *  - the job-code box is out of the applicant's menu.
 *
 * Run with: node scripts/candidate_interview.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

// Decoded, so a checkout whose path has a space in it works too.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const C = await import(pathToFileURL(path.join(ROOT, "src/lib/candidateInterview.ts")).href);
const T = await import(pathToFileURL(path.join(ROOT, "src/lib/interviewTimes.ts")).href);
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");

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

const NOW = new Date("2026-10-07T20:00:00Z");
const MANILA = "Asia/Manila";
const W1 = { start: "2026-10-08T13:00:00.000Z", durationMinutes: 30, zone: "America/New_York" };
const W2 = { start: "2026-10-09T13:00:00.000Z", durationMinutes: 30, zone: "America/New_York" };
const PAST = { start: "2026-10-06T13:00:00.000Z", durationMinutes: 30 };
const row = (over = {}) => ({ status: "scheduled", candidate_response: "awaiting_pick", scheduled_at: W1.start, duration_minutes: 30, interview_type: "video", employer_windows: [W1, W2], ...over });
const words = (interview, company = "Zulu Support Team") => C.candidateInterviewWords(interview, { company, now: NOW, timeZone: MANILA });

console.log("\nThe offered times");
{
  check("read as stored", JSON.stringify(C.offeredWindows([W1, W2])) === JSON.stringify([{ start: W1.start, durationMinutes: 30 }, { start: W2.start, durationMinutes: 30 }]));
  check("a missing length is half an hour", C.offeredWindows([{ start: W1.start }])[0].durationMinutes === 30);
  check("anything malformed is left out", C.offeredWindows([null, 4, {}, { start: 5 }, { start: "not a date" }, W1]).length === 1);
  check("not a list: no times", C.offeredWindows(null).length === 0 && C.offeredWindows("x").length === 0 && C.offeredWindows({ start: W1.start }).length === 0);
  check("only the ones that have not passed are open", C.openWindows(C.offeredWindows([PAST, W1, W2]), NOW).length === 2);
  check("a time at this very moment has passed", C.openWindows([{ start: NOW.toISOString(), durationMinutes: 30 }], NOW).length === 0);
}

console.log("\nThe four stages");
{
  const stage = (over) => C.candidateInterviewStage(row(over), NOW);
  check("times offered, none chosen: pick", stage({}) === "pick");
  check("one time set, not answered: confirm", stage({ candidate_response: "pending", employer_windows: null }) === "confirm" && stage({ candidate_response: null, employer_windows: null }) === "confirm");
  check("they suggested times: waiting", stage({ candidate_response: "reschedule_requested" }) === "waiting");
  check("agreed: confirmed", stage({ candidate_response: "confirmed" }) === "confirmed");
  check("no interview: nothing", C.candidateInterviewStage(null, NOW) === null && C.candidateInterviewStage(undefined, NOW) === null);
  check("cancelled or done: nothing", stage({ status: "cancelled" }) === null && stage({ status: "completed" }) === null);
  check("a confirmed time that has passed: nothing to join", stage({ candidate_response: "confirmed", scheduled_at: PAST.start }) === null);
  check("a time to confirm that has passed: nothing to confirm", stage({ candidate_response: "pending", scheduled_at: PAST.start }) === null);
  // The placeholder on an offer is the earliest offered time. It passing must
  // not hide the invitation: the applicant still has to answer.
  check("still choosing after the earliest offered time passed: still pick", stage({ scheduled_at: PAST.start }) === "pick");
  check("still waiting after it passed: still waiting", stage({ candidate_response: "reschedule_requested", scheduled_at: PAST.start }) === "waiting");
  check("a time with no date on it is not confirmed", stage({ candidate_response: "confirmed", scheduled_at: null }) === null);
}

console.log("\nThe words, on the applicant's own clock");
{
  check("a day and a time in words", C.interviewWhen(W1.start, MANILA) === "Thursday, October 8 at 9:00 PM", C.interviewWhen(W1.start, MANILA));
  check("the same instant on another clock", C.interviewWhen(W1.start, "America/New_York") === "Thursday, October 8 at 9:00 AM", C.interviewWhen(W1.start, "America/New_York"));
  check("midnight is the next day over there", C.interviewWhen("2026-10-08T16:00:00.000Z", MANILA) === "Friday, October 9 at 12:00 AM", C.interviewWhen("2026-10-08T16:00:00.000Z", MANILA));
  check("no narrow or no-break space in it", !/[\u00a0\u202f]/.test(C.interviewWhen(W1.start, MANILA)));
  check("not a date: nothing, not 'Invalid Date'", C.interviewWhen("nope") === "");
  check("how it happens", C.interviewKindWords("video") === "Video call" && C.interviewKindWords("phone") === "Phone call" && C.interviewKindWords("in_person") === "In person" && C.interviewKindWords(null) === "Video call");

  const pick = words(row());
  check("pick: invited, by whom, how many, and what to do", pick.stage === "pick" && pick.theirMove && pick.title === "You're invited to an interview" && pick.body === "Zulu Support Team offered 2 times. Pick the one that works for you." && pick.action === "Pick your time" && pick.chip === "Pick your time", JSON.stringify(pick));
  const one = words(row({ employer_windows: [W1] }));
  check("one offered time: take it or suggest another", one.body === "Zulu Support Team offered one time. Take it, or suggest another.", one.body);
  const gone = words(row({ employer_windows: [PAST] }));
  check("offered times all passed: tell them what works", gone.stage === "pick" && gone.theirMove && gone.body === "The times Zulu Support Team offered have passed. Tell them what works for you." && gone.action === "Suggest times", JSON.stringify(gone));
  check("an offer counts only the times still open", words(row({ employer_windows: [PAST, W1, W2] })).body.includes("offered 2 times"));
  // The row's own scheduled_at is only a placeholder while they choose.
  check("an offered time is never said as the appointment", !/October|9:00|AM|PM/.test(`${pick.title} ${pick.body} ${pick.action} ${pick.chip}`), pick.body);

  const confirm = words(row({ candidate_response: "pending", employer_windows: null }));
  check("confirm: the time, and both ways out", confirm.stage === "confirm" && confirm.theirMove && confirm.body === "Zulu Support Team set it for Thursday, October 8 at 9:00 PM. Confirm it, or ask for another time." && confirm.action === "Confirm or change", JSON.stringify(confirm));
  const waiting = words(row({ candidate_response: "reschedule_requested" }));
  check("waiting: not their move, and it says so", waiting.stage === "waiting" && !waiting.theirMove && waiting.body === "Zulu Support Team has your times and will reply. Nothing to do for now." && !/October/.test(waiting.body), JSON.stringify(waiting));
  const confirmed = words(row({ candidate_response: "confirmed", scheduled_at: W2.start }));
  check("confirmed: the time and where the link is", confirmed.stage === "confirmed" && !confirmed.theirMove && confirmed.title === "Your interview is confirmed" && confirmed.body.startsWith("Friday, October 9 at 9:00 PM.") && confirmed.chip === "Interview confirmed", JSON.stringify(confirmed));
  check("no company name on file: 'The hiring team', never 'null'", words(row(), null).body === "The hiring team offered 2 times. Pick the one that works for you." && words(row({ candidate_response: "reschedule_requested" }), "  ").body === "The hiring team has your times and will reply. Nothing to do for now." && words(row({ employer_windows: [PAST] }), null).body === "The times the hiring team offered have passed. Tell them what works for you.");
  check("nothing live: no words", words(null) === null && words(row({ status: "cancelled" })) === null);
  for (const w of [pick, one, gone, confirm, waiting, confirmed]) {
    if (/null|undefined|NaN|Invalid/.test(JSON.stringify(w))) check(`no leaked value in ${w.stage}`, false, JSON.stringify(w));
  }
  check("no dash used as punctuation in any of it", [pick, one, gone, confirm, waiting, confirmed].every((w) => !/[\u2013\u2014]/.test(JSON.stringify(w))));
}

console.log("\nThe applications list");
{
  const list = await read("src/pages/Applications.tsx");
  const hook = await read("src/hooks/useApplications.ts");
  check("the list asks for the offered times with each interview", /\.select\("id, application_id, scheduled_at, status, candidate_response, meeting_link, duration_minutes, interview_type, proposed_times, candidate_note, employer_windows"\)/.test(hook) && /employer_windows: interview\.employer_windows,/.test(hook));
  check("one reading for the card", /const interviewWords = isFinal \? null : candidateInterviewWords\(application\.latestInterview, \{ company: companyName, now: new Date\(\) \}\);/.test(list));
  check("the interview has its own block, before the step", /\{interviewWords && <InterviewCallout words=\{interviewWords\} onOpen=\{openInterview\} \/>\}\s*<JourneyProgress/.test(list));
  check("its button opens the application at the interview", /navigate\(`\/applications\/\$\{application\.id\}#interview`\);/.test(list));
  check("one solid button per card: the step's steps back when the interview is theirs to answer", /interviewWords\?\.theirMove\s*\? "inline-flex min-h-\[44px\] items-center justify-center gap-2 rounded-\[10px\] border /.test(list));
  check("a live interview always opens the row", /const isLocked =\s*\(displayState\.isPendingReview \|\| displayState\.isWaitingPhase\) && !candidateHasSomethingToDo && !interviewWords;/.test(list));
  check("the chip is the interview's own", /const chip: ChipTone \| null = interviewWords\s*\?/.test(list));
  check("a decided application shows no interview block", /const interviewWords = isFinal \? null :/.test(list));
  check("no leftover lines about a job code", !/job code/i.test(list.replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")) && !/new code from the employer/.test(list));
}

console.log("\nThe application page and the card");
{
  const page = await read("src/pages/CandidateApplicationDetail.tsx");
  const card = await read("src/components/CandidateInterviewConfirmationCard.tsx");
  const first = page.indexOf("<CandidateInterviewConfirmationCard");
  const panel = page.indexOf("The one panel: who you applied to");
  check("the interview comes before the step panel", first > 0 && panel > 0 && first < panel);
  check("…once only", page.split("<CandidateInterviewConfirmationCard").length === 2);
  check("the page lands on it when the link says so", /window\.location\.hash !== "#interview"/.test(page) && /document\.getElementById\("interview"\)\?\.scrollIntoView/.test(page) && /id="interview"/.test(card));
  check("the card reads the stage from the one place", /const stage = candidateInterviewStage\(/.test(card) && /if \(!stage\) return null;/.test(card));
  check("pick: the open times, each one a button", /stage === "pick" && \(/.test(card) && /slotGrid\("pick_slot", futureWindows\)/.test(card) && /data-interview-slot=\{w\.start\}/.test(card));
  check("pick: 'None of these work?' with a way to suggest others", /"None of these work\?"/.test(card) && /Suggest other times/.test(card) && /data-interview-suggest/.test(card));
  check("pick with every time passed: still a way to answer", /The times \{teamLower\} offered have passed\. Tell them what works for you\./.test(card));
  check("confirm: the time in words, confirm, or ask for another", /stage === "confirm" && \(/.test(card) && /Confirm this time/.test(card) && /Ask for another time/.test(card));
  check("waiting: the offered times stay pickable", /stage === "waiting" && \(/.test(card) && /Changed your mind\?/.test(card));
  check("confirmed: join, calendar, and a way to change it for any interview", /stage === "confirmed" && \(/.test(card) && /Add to calendar/.test(card) && /data-interview-change/.test(card) && /canFreeRepick \? setShowRepickSheet\(true\) : setSuggestOpen\(true\)/.test(card));
  check("the link to join is not handed out early", /href=\{canJoin \? ownLink : undefined\}/.test(card) && /const canJoin = stage === "confirmed" && minutesToStart <= JOIN_WINDOW_MINUTES;/.test(card));
  check("every time says whose clock it is on", /Times are on your own clock \(\{zone\}\)\./.test(card));
  check("no 'current time' is claimed while none is agreed", /currentScheduledAt=\{stage === "pick" \|\| stage === "waiting" \? null : effectiveScheduledAt\}/.test(card));
  check("an answer refreshes the list too", /queryKey: \["applications", "candidate"\]/.test(card));

  const dialog = await read("src/components/CandidateRescheduleRequestDialog.tsx");
  check("the dialog words both cases", /currentScheduledAt \? "Ask for another time" : "Suggest times that work for you"/.test(dialog) && /currentScheduledAt: string \| null;/.test(dialog));
  check("times in it read as people say them", /function clockLabel\(time: string\): string/.test(dialog) && /\{clockLabel\(time\)\}/.test(dialog));
  check("it still asks for at least two", /validTimes\.length < 2/.test(dialog));

  const popup = await read("src/components/CandidateStatusScreen.tsx");
  check("the pop-up shows no date and no link for an offer", /interviewDetails && localCandidateResponse !== "awaiting_pick" && <InterviewDetailsCard/.test(popup));
  check("…and sends them to the times instead of 'Confirm interview'", /localCandidateResponse === "awaiting_pick" \? \(\s*<div className="space-y-3" data-status-interview="pick">/.test(popup) && /See the times/.test(popup));
  check("the page tells the pop-up whether a time is set or only offered", /candidateResponse=\{candidateInterview\?\.candidate_response \?\? interviewDetails\?\.candidateResponse\}/.test(page) && /candidateResponse: data\.candidate_response,/.test(page));
}

console.log("\nThe invitation email");
{
  const wizard = await read("src/components/InterviewSchedulingWizard.tsx");
  check("the lookup asks only for what the database can join", /\.select\("candidate_id, jobs\(title\)"\)/.test(wizard));
  check("no select anywhere in it reaches through profiles", !/\.select\([^)]*profiles\s*[:!(]/.test(wizard));
  check("a failed lookup is a failed email, said out loud", /if \(appLookupError \|\| !appData\?\.candidate_id\) \{[\s\S]{0,200}setCandidateEmailStatus\("failed"\);/.test(wizard));
  check("the success screen words the email through the one helper", /inviteEmailWords\(candidateEmailStatus, \{ email: candidateEmail, firstName, exactTime: exactTimeMode \}\)/.test(wizard));
  check("each offered time records the clock it was picked on", /durationMinutes: parseInt\(duration\),\s*zone: teamZone,/.test(wizard));

  const who = { email: "a@example.com", firstName: "Maria", exactTime: false };
  check("sent, offering times", T.inviteEmailWords("sent", who) === "Email sent to a@example.com to pick a time");
  check("sent, one exact time", T.inviteEmailWords("sent", { ...who, exactTime: true }) === "Email sent to a@example.com with the date and time");
  check("sent with no address on screen: by name", T.inviteEmailWords("sent", { ...who, email: null }) === "Email sent to Maria to pick a time");
  const skipped = T.inviteEmailWords("skipped", who);
  const failedWords = T.inviteEmailWords("failed", who);
  const unknown = T.inviteEmailWords(null, who);
  check("skipped: no email went out, and what to do", /^No email went out: Maria has these emails turned off\./.test(skipped) && /Message them so they know to look\.$/.test(skipped), skipped);
  check("failed: it could not be sent, and what to do", /^The invitation email could not be sent\. Maria will see it when they open their application\./.test(failedWords), failedWords);
  check("nothing known is treated as not sent", unknown === failedWords);
  check("only 'sent' ever says an email was sent", [skipped, failedWords, unknown, T.inviteEmailWords(undefined, who)].every((w) => !/Email sent/.test(w)));
  check("no name: still a sentence", T.inviteEmailWords("failed", { email: null, firstName: "", exactTime: false }).includes("They will see it when they open their application."));

  // Nothing else in the app reaches the employer's profile through a join
  // the database does not have (profiles has no foreign keys).
  const { readdir } = await import("node:fs/promises");
  const offenders = [];
  async function walk(dir) {
    for (const entry of await readdir(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== "dev-preview") await walk(rel);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        const text = await read(rel);
        if (/\.select\(\s*["'`][^"'`]*\bprofiles\s*(:\w+)?\s*[!(]/.test(text)) offenders.push(rel);
      }
    }
  }
  await walk("src");
  check("no screen embeds profiles in a select (the database has no such join)", offenders.length === 0, offenders.join(", "));
}

console.log("\nThe applicant's menu");
{
  const sidebar = await read("src/components/AppSidebar.tsx");
  const block = /const candidateNavItems: NavItemProps\[\] = \[([\s\S]*?)\n\s*\];/.exec(sidebar)?.[1] ?? "";
  check("found the applicant's menu", block.length > 0);
  check("no job-code box in it", !/to:\s*"\/apply"/.test(block) && !/Job Code/i.test(block));
  check("Applications, Messages, Documents and Profile are", ["/applications", "/messages", "/my-documents", "/profile"].every((to) => block.includes(`to: "${to}"`)));
  const app = await read("src/App.tsx");
  check("an old link that carries a code still has somewhere to land", /<Route path="\/apply" element=\{<ApplyWithCode \/>\} \/>/.test(app));

  const doc = await read("docs/INTERVIEWS.md");
  check("docs/INTERVIEWS.md explains the applicant's side and names this test", doc.includes("## What the applicant sees") && doc.includes("scripts/candidate_interview.test.mjs"));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
