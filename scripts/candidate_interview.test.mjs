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
 * He then saw the first fix (an amber notice box above "Take Assessment")
 * and sent it back: "this SaaS dashboard yellow color ... It needs to be an
 * actual applause. You have been selected for an interview. Boom, boom,
 * shabam. Get rid of the skill test ... they should not even be seeing the
 * skill test or anything else because they have already been selected for
 * an interview. ... It all needs to happen in real time too."
 *
 * These checks prove:
 *  - the four stages are read the same everywhere, from the row itself;
 *  - an offered time is never presented as the appointment;
 *  - being selected is said as that, and celebrated once: a lit surface, a
 *    seal, paper in the brand's own colours; still for anyone who asked for
 *    less motion;
 *  - while an interview is live it is ALL the applicant sees of the
 *    application: no step, no test, on the list or on the page;
 *  - the list hears about interviews live, on one subscription that is not
 *    torn down by its own refetch;
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
const read_ = read;

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
  check("a confirmed interview long over: nothing to join", stage({ candidate_response: "confirmed", scheduled_at: PAST.start }) === null);
  // The way in must not vanish at the minute it starts: someone a minute late found no interview at all.
  const startedAgo = (minutes) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
  check("a confirmed interview that has just started is still live", stage({ candidate_response: "confirmed", scheduled_at: startedAgo(1) }) === "confirmed" && stage({ candidate_response: "confirmed", scheduled_at: startedAgo(25) }) === "confirmed");
  check("…and for an hour after its end, for anyone running late", stage({ candidate_response: "confirmed", scheduled_at: startedAgo(30 + 59) }) === "confirmed" && stage({ candidate_response: "confirmed", scheduled_at: startedAgo(30 + 61) }) === null);
  check("a longer interview is live for longer", stage({ candidate_response: "confirmed", duration_minutes: 60, scheduled_at: startedAgo(60 + 59) }) === "confirmed" && C.interviewLiveUntil({ scheduled_at: W1.start, duration_minutes: 45 }).toISOString() === "2026-10-08T14:45:00.000Z");
  check("a time to confirm that has passed: nothing to confirm", stage({ candidate_response: "pending", scheduled_at: PAST.start }) === null);
  // The placeholder on an offer is the earliest offered time. It passing must
  // not hide the invitation: the applicant still has to answer.
  check("still choosing after the earliest offered time passed: still pick", stage({ scheduled_at: PAST.start }) === "pick");
  check("still waiting after it passed: still waiting", stage({ candidate_response: "reschedule_requested", scheduled_at: PAST.start }) === "waiting");
  check("a time with no date on it is not confirmed", stage({ candidate_response: "confirmed", scheduled_at: null }) === null);
}

console.log("\nThe way in");
{
  const at = (iso) => new Date(iso);
  const link = { scheduled_at: W1.start, duration_minutes: 30, meeting_provider: null, meeting_link: "https://meet.google.com/abc-defg-hij" };
  const room = { scheduled_at: W1.start, duration_minutes: 30, meeting_provider: "daily", meeting_link: null };
  const early = C.joinPlan(link, at("2026-10-08T10:59:00Z"));
  check("a link of the team's own opens two hours before the start", early.how === "link" && early.opensAt.toISOString() === "2026-10-08T11:00:00.000Z" && early.leadWords === "2 hours" && early.open === false);
  check("…open from then", C.joinPlan(link, at("2026-10-08T11:00:00Z")).open === true && C.joinPlan(link, at("2026-10-08T12:59:00Z")).open === true);
  check("…through the interview and the hour after it, then shut", C.joinPlan(link, at("2026-10-08T13:20:00Z")).open === true && C.joinPlan(link, at("2026-10-08T14:29:00Z")).open === true && C.joinPlan(link, at("2026-10-08T14:30:00Z")).open === false);
  const roomEarly = C.joinPlan(room, at("2026-10-08T12:44:00Z"));
  check("the built-in room opens fifteen minutes before, when the room itself does", roomEarly.how === "room" && roomEarly.leadWords === "15 minutes" && roomEarly.open === false && C.joinPlan(room, at("2026-10-08T12:45:00Z")).open === true);
  check("the room counts before a link when both are there", C.joinPlan({ ...link, meeting_provider: "daily" }, NOW).how === "room");
  check("nothing to open: a phone call, in person, or not set up", C.joinPlan({ scheduled_at: W1.start }, NOW).how === "none" && C.joinPlan({ scheduled_at: W1.start, meeting_link: "   " }, NOW).open === false && C.joinPlan(null, NOW).how === "none");
  check("no time on it: never open", C.joinPlan({ meeting_link: "https://x.example", scheduled_at: null }, NOW).open === false);
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
  check("pick: selected, by whom, how many, and what to do", pick.stage === "pick" && pick.theirMove && pick.title === "You've been selected for an interview" && pick.body === "Zulu Support Team offered 2 times. Pick the one that works for you." && pick.action === "Pick your time" && pick.chip === "Pick your time", JSON.stringify(pick));
  check("being selected is one sentence, said the same everywhere", C.SELECTED_TITLE === "You've been selected for an interview");
  check("…and it is a moment to celebrate: 'Congratulations'", pick.selected === true && pick.eyebrow === "Congratulations");
  check("the same ask without the team's name, for where it was just said", pick.ask === "They offered 2 times. Pick the one that works for you.");
  const one = words(row({ employer_windows: [W1] }));
  // One time is the rule since 2026-10-07 ("I wanna just give them one time for
  // the interview, not two"): it is said outright, with the two ways to answer.
  check("one offered time: the time itself, book it or say when they are free", one.body === "Zulu Support Team would like to meet you on Thursday, October 8 at 9:00 PM. Book it, or tell them when you are free." && one.ask === "They would like to meet you on Thursday, October 8 at 9:00 PM. Book it, or tell them when you are free." && one.action === "See your time" && one.chip === "Book your time" && one.selected === true, JSON.stringify(one));
  check("the one way to answer 'I can't make it' is said the same everywhere", C.TELL_AVAILABILITY === "Tell them when you're free");
  const gone = words(row({ employer_windows: [PAST] }));
  check("the offered time passed: tell them when they are free", gone.stage === "pick" && gone.theirMove && gone.body === "The time Zulu Support Team offered has passed. Tell them when you are free." && gone.action === C.TELL_AVAILABILITY, JSON.stringify(gone));
  check("…several, from before the rule, said in the plural", words(row({ employer_windows: [PAST, { ...PAST, start: new Date(new Date(PAST.start).getTime() - 3600_000).toISOString() }] })).body === "The times Zulu Support Team offered have passed. Tell them when you are free.");
  check("nowhere are they asked to suggest times of their own", ![pick, one, gone].some((w) => /suggest/i.test(JSON.stringify(w))));
  check("an offer counts only the times still open", words(row({ employer_windows: [PAST, W1, W2] })).body.includes("offered 2 times"));
  // The row's own scheduled_at is only a placeholder while they choose.
  check("an offered time is never said as the appointment", !/October|9:00|AM|PM/.test(`${pick.title} ${pick.body} ${pick.action} ${pick.chip}`), pick.body);

  const confirm = words(row({ candidate_response: "pending", employer_windows: null }));
  check("a time to confirm is being selected too", confirm.selected === true && confirm.title === C.SELECTED_TITLE && confirm.ask === "They set it for Thursday, October 8 at 9:00 PM. Confirm it, or tell them when you are free.");
  check("confirm: the time, and both ways out", confirm.stage === "confirm" && confirm.theirMove && confirm.body === "Zulu Support Team set it for Thursday, October 8 at 9:00 PM. Confirm it, or tell them when you are free." && confirm.action === "Confirm or change", JSON.stringify(confirm));
  const waiting = words(row({ candidate_response: "reschedule_requested" }));
  check("waiting and confirmed are not the celebration", waiting.selected === false && words(row({ candidate_response: "confirmed", scheduled_at: W2.start })).selected === false && waiting.eyebrow === "Your interview");
  check("waiting: not their move, and it says so", waiting.stage === "waiting" && !waiting.theirMove && waiting.body === "Zulu Support Team has your message and will set a new time. Nothing to do for now." && !/October/.test(waiting.body), JSON.stringify(waiting));
  const confirmed = words(row({ candidate_response: "confirmed", scheduled_at: W2.start }));
  check("confirmed: the time and where the link is", confirmed.stage === "confirmed" && !confirmed.theirMove && confirmed.title === "Your interview is confirmed" && confirmed.body.startsWith("Friday, October 9 at 9:00 PM.") && confirmed.chip === "Interview confirmed", JSON.stringify(confirmed));
  check("no company name on file: 'The hiring team', never 'null'", words(row(), null).body === "The hiring team offered 2 times. Pick the one that works for you." && words(row({ candidate_response: "reschedule_requested" }), "  ").body === "The hiring team has your message and will set a new time. Nothing to do for now." && words(row({ employer_windows: [PAST] }), null).body === "The time the hiring team offered has passed. Tell them when you are free." && words(row({ employer_windows: [W1] }), null).body.startsWith("The hiring team would like to meet you on "));
  check("nothing live: no words", words(null) === null && words(row({ status: "cancelled" })) === null);
  check("a live interview is known as one, from the same reading", C.hasLiveInterview(row(), NOW) && C.hasLiveInterview(row({ candidate_response: "confirmed" }), NOW) && !C.hasLiveInterview(null, NOW) && !C.hasLiveInterview(row({ status: "cancelled" }), NOW) && !C.hasLiveInterview(row({ candidate_response: "confirmed", scheduled_at: PAST.start }), NOW));
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
  check("one reading for the card and for the page's moment, and none once an application is decided", /function liveInterviewWords\(application: ApplicationWithJob, companyName\?: string \| null\): CandidateInterviewWords \| null \{\s*if \(application\.status === "rejected" \|\| application\.status === "hired" \|\| application\.status === "offered"\) return null;/.test(list) && /const interviewWords = liveInterviewWords\(application, companyName\);/.test(list));
  check("a live interview takes the whole card", /if \(interviewWords\) \{\s*return \(\s*<InterviewHero/.test(list));
  const hero = /function InterviewHero\(\{[\s\S]*?\n\}\n/.exec(list)?.[0] ?? "";
  check("…with no step and no test on it", hero.length > 400 && !/JourneyProgress|application-action|Take Assessment|actionLabel|Step \{/.test(hero));
  check("…said as a celebration, on the lit surface, with the seal", /<InterviewSurface\s+tone=\{tone\}/.test(hero) && /<InterviewSeal size=\{58\} press=\{words\.selected\} \/>/.test(hero) && /\{words\.eyebrow\}/.test(hero) && /\{words\.title\}/.test(hero));
  check("…never the amber notice box again", !/amber-bg|amber-fg/.test(hero));
  check("its button opens the application at the interview", /navigate\(`\/applications\/\$\{application\.id\}#interview`\);/.test(list));
  check("the whole card opens it for a tap; the button inside is the control", /className="ck-reveal cursor-pointer p-5 sm:p-7"\s+onClick=\{onOpen\}/.test(hero) && /data-testid="interview-open"/.test(hero) && !/role="button"/.test(hero.replace(/\/\/.*$/gm, "")));
  check("its button is a pill, solid jade when it is theirs to do (never a dark slab)", /className=\{`hf-pill \$\{words\.theirMove \? "hf-pill--jade" : "hf-pill--tonal"\} hf-pill--lg w-full shrink-0 sm:w-auto`\}/.test(hero));
  check("the withdraw menu is still on it", /<div className="-mr-2 -mt-2 shrink-0">\{menu\}<\/div>/.test(hero) && /const menu = \(/.test(list));
  check("a live interview always opens the row", /const isLocked =\s*\(displayState\.isPendingReview \|\| displayState\.isWaitingPhase\) && !candidateHasSomethingToDo && !interviewWords;/.test(list));
  check("someone selected is never forwarded to a test on arrival", /stepWaitingOnComputer\(applications\?\.filter\(\(app\) => !liveInterviewWords\(app\)\)\)/.test(list));

  // Live.
  check("the list hears about interviews as well as applications", /\.on\("postgres_changes", \{ event: "\*", schema: "public", table: "interviews" \}, refresh\)/.test(list) && /\{ event: "\*", schema: "public", table: "applications", filter: `candidate_id=eq\.\$\{userId\}` \}/.test(list));
  check("on one subscription for the life of the page (its own refetch never tears it down)", /\}, \[userId, isEmployer, queryClient, liveId\]\);/.test(list) && /\.channel\(`candidate-applications-\$\{userId\}-\$\{liveId\}`\)/.test(list) && !/\}, \[user, isEmployer, refetch, applications, employerNames\]\);/.test(list));
  check("what happened while the line was down is caught up on connecting", /\.subscribe\(\(status\) => \{\s*if \(status === "SUBSCRIBED"\) refresh\(\);/.test(list));

  // The moment.
  check("the moment shows for someone just selected, once for each interview", /if \(words\?\.selected && interviewId && !hasCelebrated\(interviewId\)\) return \{ application, words, company, interviewId \};/.test(list) && /if \(selectedMoment\) markCelebrated\(selectedMoment\.interviewId\);/.test(list));
  check("its button goes to the interview", /<InterviewSelectedMoment\s+open=\{!!selectedMoment\}/.test(list) && /if \(id\) navigate\(`\/applications\/\$\{id\}#interview`\);/.test(list));
  check("no leftover lines about a job code", !/job code/i.test(list.replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")) && !/new code from the employer/.test(list));
}

console.log("\nThe application page and the card");
{
  const page = await read("src/pages/CandidateApplicationDetail.tsx");
  const card = await read("src/components/CandidateInterviewConfirmationCard.tsx");
  const first = page.indexOf("<CandidateInterviewConfirmationCard");
  const panel = page.indexOf("The one panel: who you applied to");
  check("the interview comes before the step panel", first > 0 && panel > 0 && first < panel);
  check("while an interview is live the page shows no step to take", /\) : interviewLive \? null : phases\.length > 0 \? \(/.test(page));
  check("…and no list of steps", /\{!interviewLive && \(\s*<div className="ck-reveal" style=\{\{ \["--ck-i" as string\]: 2 \}\} data-steps-list>/.test(page));
  check("…read from the one place, and not for a decided application", /isRejected \|\| isHired \|\| applicationStatus === "offered"\s*\? null\s*: candidateInterviewWords\(candidateInterview, \{ company: employerBranding, now: new Date\(\) \}\);/.test(page) && /const interviewLive = !!interviewWords;/.test(page));
  check("the page celebrates too, once, and the old pop-up is no longer raised for an interview", /<InterviewSelectedMoment\s+open=\{!!celebrateId\}/.test(page) && /interviewWords\?\.selected && candidateInterview && !hasCelebrated\(candidateInterview\.id\)/.test(page) && !/setStatusScreen\("interview_scheduled"\)/.test(page));
  check("the card sits on the lit surface, with the seal and the same sentence", /<InterviewSurface id="interview" tone="selected"/.test(card) && /<InterviewSeal size=\{54\} press=\{press\} \/>/.test(card) && (card.match(/SELECTED_TITLE/g) ?? []).length >= 4 && !/amber-bg|amber-fg/.test(card));
  check("…once only", page.split("<CandidateInterviewConfirmationCard").length === 2);
  check("the page lands on it when the link says so", /window\.location\.hash !== "#interview"/.test(page) && /document\.getElementById\("interview"\)\?\.scrollIntoView/.test(page) && /id="interview"/.test(card));
  check("the card reads the stage from the one place", /const stage = candidateInterviewStage\(/.test(card) && /if \(!stage\) return null;/.test(card));
  check("pick: the open time, a small ticket with its own button", /stage === "pick" && \(/.test(card) && /slotList\("pick_slot", futureWindows\)/.test(card) && /data-interview-slot=\{w\.start\}/.test(card) && /aria-label=\{`\$\{word\} \$\{interviewWhen\(w\.start\)\}`\}/.test(card));
  check("one time is booked, not chosen among: its button says 'Book this time'", /slots\.length === 1 && action === "pick_slot" \? "Book this time" : "Choose"/.test(card) && /`\$\{team\} would like to meet you at this time\. Book it, or tell them when you are free\.`/.test(card));
  check("a new time set after they could not make one is said as that", /const reoffered = useMemo\(/.test(card) && /again\?: unknown \} \| null\)\?\.again === true/.test(card) && /reoffered \? "A new time" : "Congratulations"/.test(card) && /`\$\{team\} set a new time for you\. Book it, or tell them when you are free\.`/.test(card));
  // "As soon as I clicked on the time, it just went ahead and did it."
  check("one tap never books: it only asks", /const ask = \(\) => \{\s*if \(!busy && action\) setAsking\(\{ window: w, action \}\);\s*\};/.test(card) && !/onClick=\{\(\) => handlePickSlot\(w, action\)\}/.test(card));
  check("'Book this time?' shows the time as its ticket, on their clock, and says the team is told", /"Book this time\?"/.test(card) && /data-interview-ask-when aria-label=\{interviewWhen\(asking\.window\.start\)\}>\s*\{miniTicket\(asking\.window, null\)\}/.test(card) && /minutes · your time \(\{zone\}\)/.test(card) && /is told right away\./.test(card));
  check("only 'Yes, book it' books; 'Go back' does nothing", /data-interview-ask-yes[\s\S]{0,220}if \(chosen\) void handlePickSlot\(chosen\.window, chosen\.action\);/.test(card) && /<AlertDialogCancel className="hf-pill hf-pill--tonal" data-interview-ask-back>\s*Go back\s*<\/AlertDialogCancel>/.test(card) && (card.match(/handlePickSlot\(/g) ?? []).length === 1);
  check("moving a booked time asks too", /"Move your interview to this time\?"/.test(card) && /"Yes, move it"/.test(card));
  check("pick: 'Can't make it?' with the one way to answer, and no way to suggest times", /"Can't make it\?"/.test(card) && /\{TELL_AVAILABILITY\}/.test(card) && /data-interview-suggest/.test(card) && !/Suggest other times|Suggest times/.test(card));
  check("pick with the time passed or taken: still a way to answer", /`The time \$\{teamLower\} offered has passed\. Tell them when you are free\.`/.test(card) && /`The time \$\{teamLower\} offered has just been taken\. Tell them when you are free\.`/.test(card));
  check("confirm: the ticket, confirm, or say they can't make it", /stage === "confirm" &&\s*ticket\(\s*"selected",/.test(card) && /Confirm this time/.test(card) && /Can&apos;t make it\s*<\/button>/.test(card) && !/Ask for another time/.test(card));
  check("waiting: what they wrote is shown back, and the offered time stays bookable", /stage === "waiting" && \(/.test(card) && /data-interview-availability-sent/.test(card) && /You wrote/.test(card) && /Can make it after all\?/.test(card) && /has your message and will set a new time\./.test(card));
  check("confirmed: the ticket, with join, calendar, and a way to change it for any interview", /stage === "confirmed" &&\s*ticket\(\s*"confirmed",/.test(card) && /Add to calendar/.test(card) && /data-interview-change/.test(card) && /canFreeRepick \? setShowRepickSheet\(true\) : setSuggestOpen\(true\)/.test(card));
  check("the ticket says its date in words for a screen reader (the stub is three short labels)", /aria-label=\{label\}/.test(card) && /`Your interview is confirmed: \$\{interviewWhen\(effectiveScheduledAt\)\}`/.test(card) && /className=\{mini \? "hf-mini__stub" : "hf-ticket__stub"\} aria-hidden/.test(card));
  // "Maybe allow them to click on a button. The button will just say it will be available a couple hours before."
  check("the way in is read from the one place", /const join = joinPlan\(\{ \.\.\.interview, scheduled_at: effectiveScheduledAt, duration_minutes: effectiveDurationMinutes \}, now\);/.test(card) && /const canJoin = stage === "confirmed" && join\.open;/.test(card));
  check("the Join button always answers: before it opens it says when it will", /if \(!canJoin\) \{[\s\S]{0,260}toast\.message\(`Join opens \$\{join\.leadWords\} before your interview`/.test(card) && !/disabled=\{!canJoin\}/.test(card));
  check("…and shows when on its own face", /\{canJoin \? "Join interview now" : `Join opens \$\{opensShort\}`\}/.test(card) && /const opensShort = joinOpensWords\(join\.opensAt, now\);/.test(card));
  check("the link is opened only once the way in is open", /else if \(ownLink\) window\.open\(ownLink, "_blank", "noopener,noreferrer"\);/.test(card) && card.indexOf("if (!canJoin) {") < card.indexOf('window.open(ownLink, "_blank"') && !/href=\{ownLink\}/.test(card));
  check("their own pick is marked, so the page does not announce it back as 'rescheduled'", (card.match(/markOwnInterviewChange\(interview\.id\);/g) ?? []).length === 2 && /!isOwnInterviewChange\(newData\?\.id as string \| undefined\)/.test(page) && /oldData\?\.candidate_response !== "awaiting_pick"/.test(page));
  check("a cancelled interview is announced only when nothing took its place", /void refetchInterview\(\)\.then\(\(result\) => \{\s*if \(wasCancelled && !result\.data\) setStatusScreen\("interview_cancelled"\);/.test(page));
  check("every time says whose clock it is on", /<small>your time \(\{zone\}\)<\/small>/.test(card) && /Your time · \{zone\}/.test(card) && /minutes · your time \(\{zone\}\)/.test(card));
  check("the pop-up is told which time they are saying no to, and none while they wait", /stage === "waiting" \? null : stage === "pick" \? \(futureWindows\.length === 1 \? futureWindows\[0\]\.start : null\) : effectiveScheduledAt/.test(card));
  check("an answer refreshes the list too", /queryKey: \["applications", "candidate"\]/.test(card));

  const dialog = await read("src/components/CandidateRescheduleRequestDialog.tsx");
  // "Don't let them just select times. Let them write a message ... type out
  // your availability. Not like actual time, your availability."
  check("'can't make it' is a message, not a time picker", /currentScheduledAt \? "Can't make it\?" : "Tell them when you're free"/.test(dialog) && /currentScheduledAt: string \| null;/.test(dialog) && /<Textarea/.test(dialog) && !/Calendar|<Select|Popover|proposedTimes/.test(dialog));
  check("it asks for days, and from what time to what time", /Which days are you free, and from what time to what time\?/.test(dialog) && /Monday to Wednesday, 9:00 AM to 2:00 PM/.test(dialog) && /Your availability/.test(dialog));
  check("it sends their words and their own time zone, and nothing is sent empty", /action: "reschedule_requested",\s*interviewId,\s*availability: written,[\s\S]{0,160}timeZone: getTimezoneName\(\),/.test(dialog) && /const ready = written\.length >= MIN_LENGTH;/.test(dialog) && /disabled=\{isSubmitting \|\| !ready\}/.test(dialog) && /Write times on your own clock/.test(dialog));

  const popup = await read("src/components/CandidateStatusScreen.tsx");
  check("the pop-up shows no date and no link for an offer", /interviewDetails && localCandidateResponse !== "awaiting_pick" && <InterviewDetailsCard/.test(popup));
  check("…and sends them to the times instead of 'Confirm interview'", /localCandidateResponse === "awaiting_pick" \? \(\s*<div className="space-y-3" data-status-interview="pick">/.test(popup) && /See the times/.test(popup));
  check("the page tells the pop-up whether a time is set or only offered", /candidateResponse=\{candidateInterview\?\.candidate_response \?\? interviewDetails\?\.candidateResponse\}/.test(page) && /candidateResponse: data\.candidate_response,/.test(page));
}

console.log("\nThe look: the ticket, and no dark buttons");
{
  // The owner, from a photo of the card before this: "why are we still using
  // the ugly old design, black buttons ... especially these harsh black
  // buttons. I don't like them. Always choose modern." He then chose the
  // "Ticket" from three drawn options.
  const css = await read("src/styles/motion.css");
  const card = await read("src/components/CandidateInterviewConfirmationCard.tsx");
  const suggest = await read("src/components/CandidateRescheduleRequestDialog.tsx");
  const review = await read("src/components/EmployerRescheduleReviewDialog.tsx");
  const fx = await read("src/components/candidate/InterviewCelebration.tsx");
  for (const [name, text] of [["the interview card", card], ["the suggest-times pop-up", suggest], ["the team's answer pop-up", review], ["the celebration", fx]]) {
    check(`${name} uses none of the stock buttons (their outline is a black slab at night)`, !/from "@\/components\/ui\/button"/.test(text) && !/variant="outline"/.test(text));
  }
  const buttons = [...card.matchAll(/<button\b[^>]*?className=(?:"([^"]*)"|\{([^}]*)\})/g)].map((m) => m[1] ?? m[2]);
  check("every button on the card is a pill", buttons.length >= 7 && buttons.every((c) => /hf-pill/.test(c)), buttons.filter((c) => !/hf-pill/.test(c)).join(" | "));
  const pill = (kind) => new RegExp(`\\.hf-pill--${kind}\\.hf-pill--${kind}\\.hf-pill--${kind} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  check("four kinds: jade, tonal, mint, text", ["jade", "tonal", "mint", "text"].every((k) => pill(k).length > 0));
  check("none of them is filled with the page's dark ground or with black", ["jade", "tonal", "mint", "text"].every((k) => !/var\(--(background|ground|sidebar|surface)\)|#0|#1|black/.test(pill(k))), ["jade", "tonal", "mint", "text"].map(pill).join(" "));
  check("the soft ones are a tint of the text colour or of jade, so day and night both work", /color-mix\(in srgb, var\(--ink\) 7%, transparent\)/.test(pill("tonal")) && /var\(--jade-soft\)/.test(pill("mint")));
  check("they outrank the phone stylesheet's button rule (the class is tripled)", /\.hf-pill\.hf-pill\.hf-pill \{/.test(css));
  check("the keyboard ring is quiet, so 'Go back' does not look chosen", /\.hf-pill\.hf-pill\.hf-pill:focus-visible \{ outline: 1\.5px solid color-mix\(in srgb, var\(--ink\) 38%, transparent\)/.test(css));
  check("the ticket: a stub with the date, a dashed tear, two notches", /\.hf-ticket \{ display: grid; grid-template-columns: 208px minmax\(0, 1fr\); \}/.test(css) && /\.hf-ticket__stub::after \{[^}]*border-right: 2px dashed/.test(css) && /\.hf-ticket__notch \{[^}]*background: var\(--ground\);/.test(css));
  check("on a phone the stub lies across the top and the buttons are full width", /\.hf-ticket \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css) && /\.hf-acts > \.hf-pill \{ width: 100%; \}/.test(css) && /\.hf-ticket__notch \{ display: none; \}/.test(css));

  const z = "America/New_York";
  const now = new Date("2026-10-07T23:30:00Z");
  check("the stub's three labels", JSON.stringify(C.ticketDate("2026-10-11T13:00:00Z", z)) === '{"weekday":"SUN","day":"11","month":"OCT"}');
  check("…on the reader's own clock (midnight is the next day over there)", JSON.stringify(C.ticketDate("2026-10-11T16:30:00Z", "Asia/Manila")) === '{"weekday":"MON","day":"12","month":"OCT"}');
  check("not a date: no stub", C.ticketDate("nope") === null);
  check("the clock time alone, with a plain space", C.clockTime("2026-10-11T13:00:00Z", z) === "9:00 AM" && C.clockTime("nope") === "");
  check("Join opens: today", C.joinOpensWords(new Date("2026-10-08T01:00:00Z"), now, z) === "today at 9:00 PM");
  check("Join opens: tomorrow", C.joinOpensWords(new Date("2026-10-08T11:00:00Z"), now, z) === "tomorrow at 7:00 AM");
  check("Join opens: later this week, by its day", C.joinOpensWords(new Date("2026-10-11T11:00:00Z"), now, z) === "Sun at 7:00 AM");
  check("Join opens: further out, with the date", C.joinOpensWords(new Date("2026-10-18T11:00:00Z"), now, z) === "Sun, Oct 18 at 7:00 AM");
  check("nothing to open: no words", C.joinOpensWords(null, now, z) === "" && C.joinOpensWords(undefined, now) === "");
}

console.log("\nThe celebration");
{
  const fx = await read("src/components/candidate/InterviewCelebration.tsx");
  const css = await read("src/styles/motion.css");
  check("the moment says it in the one sentence, under 'Congratulations'", /\{SELECTED_TITLE\}/.test(fx) && />\s*Congratulations\s*</.test(fx));
  check("it is a dialog with one thing to do, and a way to leave it for later", /role="dialog"\s+aria-modal="true"/.test(fx) && /data-testid="interview-moment-action"/.test(fx) && /Not now/.test(fx) && /event\.key === "Escape"\) onClose\(\)/.test(fx));
  check("paper is thrown once and clears itself", /export const CONFETTI_MS = \d+;/.test(fx) && /window\.setTimeout\(\(\) => done\.current\?\.\(\), CONFETTI_MS\)/.test(fx) && /\{paper && <ConfettiBurst onDone=\{\(\) => setPaper\(false\)\} \/>\}/.test(fx));
  check("three throws: a popper from each lower corner, then one from the middle", (fx.match(/\.\.\.popper\(/g) ?? []).length === 3);
  const paper = /const PAPER = \[([^\]]+)\]/.exec(fx)?.[1] ?? "";
  check("only the brand's own colours", paper.length > 0 && paper.split(",").every((c) => /^\s*"var\(--(jade|brass|brass-line|jade-soft-fg|ink)\)"\s*$/.test(c)), paper);
  check("the paper touches nothing and is hidden from screen readers", /className="hf-confetti" aria-hidden/.test(fx) && /\.hf-confetti \{[^}]*pointer-events: none;/.test(css));
  check("once for each interview on a browser, and for the visit when it will not keep anything", /const seenKey = \(interviewId: string\) => `hf-interview-celebrated:\$\{interviewId\}`;/.test(fx) && /seenThisVisit\.add\(interviewId\);/.test(fx) && /if \(seenThisVisit\.has\(interviewId\)\) return true;/.test(fx));
  check("no interview id: nothing to celebrate", /if \(!interviewId\) return true;/.test(fx));
  check("the surface is jade and brass, with a quiet form for waiting", /\.hf-invite \{[\s\S]*?var\(--jade\)[\s\S]*?var\(--brass\)[\s\S]*?\}/.test(css) && /\.hf-invite\[data-tone="quiet"\]/.test(css) && !/\.hf-invite[^{]*\{[^}]*amber/.test(css));
  const calm = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  check("for someone who asked for less motion: no paper, still sparks, words in place", /@media \(prefers-reduced-motion: reduce\) \{\s*\.hf-confetti \{ display: none; \}\s*\.hf-spark \{ animation: none;[^}]*\}\s*\.hf-rise \{ animation: none; \}/.test(css) && /\.hf-dot--live \{ animation: none; \}/.test(calm));
}

console.log("\nThe invitation email");
{
  const wizard = await read("src/components/InterviewSchedulingWizard.tsx");
  check("the lookup asks only for what the database can join", /\.select\("candidate_id, jobs\(title\)"\)/.test(wizard));
  check("no select anywhere in it reaches through profiles", !/\.select\([^)]*profiles\s*[:!(]/.test(wizard));
  check("a failed lookup is a failed email, said out loud", /if \(appLookupError \|\| !appData\?\.candidate_id\) \{[\s\S]{0,200}setCandidateEmailStatus\("failed"\);/.test(wizard));
  check("the success screen words the email through the one helper", /inviteEmailWords\(candidateEmailStatus, \{ email: candidateEmail, firstName, exactTime: exactTimeMode \}\)/.test(wizard));
  check("setting up a new interview replaces an earlier live one, after the new one is safely made", /const earlierIds = \(earlierLive \?\? \[\]\)\.map\(\(row\) => row\.id\);/.test(wizard) && /\.update\(\{ status: "cancelled" \}\)\.in\("id", earlierIds\)/.test(wizard) && wizard.indexOf('.update({ status: "cancelled" }).in("id", earlierIds)') > wizard.lastIndexOf("await createInterview.mutateAsync({"));
  check("each offered time records the clock it was picked on", /durationMinutes: parseInt\(duration\),\s*zone: teamZone,/.test(wizard));

  const who = { email: "a@example.com", firstName: "Maria", exactTime: false };
  check("sent, offering a time", T.inviteEmailWords("sent", who) === "Email sent to a@example.com with the time to book");
  check("sent, one exact time", T.inviteEmailWords("sent", { ...who, exactTime: true }) === "Email sent to a@example.com with the date and time");
  check("sent with no address on screen: by name", T.inviteEmailWords("sent", { ...who, email: null }) === "Email sent to Maria with the time to book");
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

console.log("\nOne time from the team, and no times from the applicant");
{
  // The owner, 2026-10-07: "I wanna just give them one time for the
  // interview, not two, just one. And ... if they cannot make it on that
  // time, don't let them just select times. Let them write a message ...
  // And then I get to schedule it. Because I don't want them to pick two
  // times and then I can't do those two times. Then we have to do too much
  // back and forth."
  const wizard = await read("src/components/InterviewSchedulingWizard.tsx");
  check("the set-up screen takes one time, and only one", /const MIN_WINDOWS = 1;\s*const MAX_WINDOWS = 1;/.test(wizard));
  check("choosing another time replaces the one chosen (no 'remove one first')", /return \[\.\.\.prev\.slice\(0, MAX_WINDOWS - 1\), \{ day, time \}\];/.test(wizard) && !/remove one to add another/.test(wizard));
  check("it no longer nudges toward offering several", !/offering 2.3 times/.test(wizard) && !/Offer a few times/.test(wizard) && !/of \{MAX_WINDOWS\}/.test(wizard));
  check("its words are for one time", /title: "Offer a Time"/.test(wizard) && /The time you're offering/.test(wizard) && /"Send the Time"/.test(wizard) && (wizard.match(/>Time offered</g) ?? []).length === 2 && !/Times offered|Send Times/.test(wizard));
  check("it says what happens next: they book it, or write when they are free", /books it, or writes when they are free if they can&apos;t make it\. Then you set a new time\./.test(wizard) && /If they can't make it, they write when they are free and you set a new time\./.test(wizard));

  // The same time offered to two people: only one can have it.
  const K = await import(pathToFileURL(path.join(ROOT, "src/lib/interviewClash.ts")).href);
  const busy = [
    { id: "a", name: "Ana Reyes", start: "2026-10-08T13:00:00.000Z", minutes: 30, booked: false },
    { id: "b", name: "Ben Cruz", start: "2026-10-08T13:00:00.000Z", minutes: 30, booked: true },
    { id: "c", name: "Cy", start: "2026-10-09T13:00:00.000Z", minutes: 30, booked: false },
  ];
  const at = (iso) => new Date(iso);
  check("a time that runs into a booked interview: said, by first name", K.clashWords(K.clashAt(at("2026-10-08T13:00:00Z"), 30, busy)) === "You already have an interview with Ben at this time.");
  check("…a booked one is named before one that is only offered", K.clashAt(at("2026-10-08T13:15:00Z"), 30, busy)?.id === "b");
  check("a time only offered to someone else: said, and what happens", K.clashWords(K.clashAt(at("2026-10-09T13:00:00Z"), 30, busy)) === "You offered this time to Cy as well. Whoever books first gets it.");
  check("back to back is not a clash, and a free time says nothing", K.clashAt(at("2026-10-08T13:30:00Z"), 30, busy) === null && K.clashAt(at("2026-10-08T12:30:00Z"), 30, busy) === null && K.clashWords(null) === "");
  check("the interview being changed is not a clash with itself", K.clashAt(at("2026-10-09T13:00:00Z"), 30, busy, "c") === null);
  check("junk breaks nothing", K.clashAt(new Date("nope"), 30, busy) === null && K.clashAt(at("2026-10-08T13:00:00Z"), 30, [{ id: "x", name: "", start: "nope", minutes: null, booked: true }]) === null);
  check("the set-up screen says so before the time is sent", /const offeredClash = useMemo\(/.test(wizard) && /clashAt\(combineDayAndTime\(chosen\.day, chosen\.time\), durationMinutes, busy\)/.test(wizard) && /data-testid="offered-time-clash"/.test(wizard) && /row\.application_id !== applicationId/.test(wizard));

  // The team's side of "I can't make it".
  const review = await read("src/components/EmployerRescheduleReviewDialog.tsx");
  check("the team reads what they wrote, and whose clock it is on", /data-review-availability-text/.test(review) && /clockGapWords\(newStart \?\? new Date\(\), applicantZone, teamZone\)/.test(review) && /Those times are on their own clock/.test(review));
  check("the team sets one new time: a day and a clock time, any hour, theirs shown beside it", /data-review-new-day/.test(review) && /data-review-new-clock/.test(review) && /const HALF_HOURS = Array\.from\(\{ length: 48 \}/.test(review) && /\$\{theirs\} theirs/.test(review));
  check("it goes back to the applicant as a time to book, marked as a new one", /candidate_response: "awaiting_pick",\s*employer_windows: \[\{ start: startIso, durationMinutes: minutes, zone: teamZone, again: true \}\]/.test(review) && /proposed_times: null,\s*candidate_note: null,/.test(review));
  check("…never booked for them unseen", !/handleSetNewTime[\s\S]{0,1400}candidate_response: "confirmed"/.test(review));
  check("a time that has passed cannot be sent", /if \(!newStartAhead\) \{\s*toast\.error\("That time has already passed\. Choose a later one\."\);/.test(review) && /disabled=\{isSubmitting \|\| !newStart \|\| !newStartAhead\}/.test(review));
  check("they are emailed the new time on their own clock, as a new time", /notifyInterviewPickTime\(candidateId, jobTitle, \[line\], undefined, true, \{ interviewType, minutes \}\)/.test(review) && /applicantEmailTime\(newStart, theirZone, teamZone\)\.line/.test(review));
  check("the same time offered again still reaches their bell (the database's own fires only on a change)", /if \(sameTime\) \{\s*await supabase\.from\("notifications"\)\.insert\(/.test(review));
  check("a clash is said there too", /clashAt\(newStart, minutes, busy, interviewId\)/.test(review) && /data-review-new-clash/.test(review));
  check("no select in it reaches through profiles", !/\.select\([^)]*profiles\s*[:!(]/.test(review));

  const page = await read("src/cockpit/pages/Interviews.tsx");
  check("the Interviews page knows an availability answer from a list of times", /availabilityOnly: row\.candidate_response === "reschedule_requested" && !raw\.some\(\(t\) => !!t\?\.datetime\),/.test(page));
  check("…its button is 'Set a new time'", /\{s\.availabilityOnly \? "Set a new time" : "Review times"\}/.test(page) && /\{s\.availabilityOnly \? "Can't make it" :/.test(page));
  check("a single offered time is shown as offered, never as booked", /data-interview-time="offered"/.test(page) && /Offered &middot; \{format\(s\.at, "EEE d"\)\}/.test(page) && /\{s\.windowsOffered === 1 \? "Not booked yet" : "Awaiting pick"\}/.test(page));
  check("the dialog is told how long it runs and what else is on", /durationMinutes=\{reviewing\.minutes\}/.test(page) && /booked: s\.response === "confirmed"/.test(page));

  const mail = await read("src/utils/emailNotifications.ts");
  check("the invitation email can be marked as a new time", /\.\.\.\(again \? \{ again: "1" \} : \{\}\)/.test(mail));
}

console.log("\nThe set-up screen opens on a day with times left");
{
  // It used to open on today, always. Late in the evening every one of
  // today's times has passed: an empty wheel, and the owner (who sets
  // interviews up in the evening) had to find tomorrow himself.
  const D = await import(pathToFileURL(path.join(ROOT, "src/lib/interviewOfferDays.ts")).href);
  const SLOTS = ["09:00", "09:30", "12:00", "19:00", "19:30", "20:00"];
  const CUTOFF = { hour: 20, minute: 30 };
  // Built on this machine's own clock, like the screen, so any time zone passes.
  const day = (offset) => new Date(2026, 9, 7 + offset);
  const at = (hour, minute = 0) => new Date(2026, 9, 7, hour, minute);
  const days = [day(0), day(1), day(2)];
  const left = (now, minutes = 30, d = day(0)) => D.timesLeftOn(d, SLOTS, minutes, now, CUTOFF);
  const first = (now, minutes = 30) => D.firstDayWithTimes(days, SLOTS, minutes, now, CUTOFF);

  check("mid-morning: today's later times are left, the earlier ones are not", left(at(10)).join() === "12:00,19:00,19:30,20:00");
  check("…so it opens on today", first(at(10)) === 0);
  check("9:30 in the evening: nothing is left of today", left(at(21, 30)).length === 0);
  check("…so it opens on tomorrow", first(at(21, 30)) === 1);
  check("…and tomorrow has every time", left(at(21, 30), 30, day(1)).length === SLOTS.length);
  check("the last time of the day still counts until the minute it starts", left(at(20, 0)).join() === "20:00" && first(at(20, 0)) === 0 && left(at(20, 1)).length === 0 && first(at(20, 1)) === 1);
  check("a longer interview has to end by the day's cutoff", left(at(8), 60).join() === "09:00,09:30,12:00,19:00,19:30" && left(at(8), 90).join() === "09:00,09:30,12:00,19:00");
  check("…so an hour-long one at 7:45 PM opens on tomorrow, though a half-hour one still fits today", first(at(19, 45), 60) === 1 && first(at(19, 45), 30) === 0);
  check("just before midnight it is still tomorrow by the calendar, not the day after", first(at(23, 59)) === 1);
  check("no day has room (an interview longer than any day): the first day, as before", D.firstDayWithTimes(days, SLOTS, 24 * 60, at(10), CUTOFF) === 0 && D.firstDayWithTimes([], SLOTS, 30, at(10), CUTOFF) === 0);
  check("junk is dropped, never offered", D.timesLeftOn(day(1), ["nope", "", "25:99x", "09:00"], 30, at(10), CUTOFF).join() === "09:00");
  check("a clock time on a day is that moment on this machine's clock", D.atClock(day(1), "14:30").getTime() === new Date(2026, 9, 8, 14, 30).getTime());

  const wizard = await read("src/components/InterviewSchedulingWizard.tsx");
  check("the screen asks that one place which day to open on, each time it opens", /useEffect\(\(\) => \{\s*if \(!open\) return;\s*setViewDayIndex\(firstDayWithTimes\(dayOptions, SLOT_VALUES, durationMinutes, new Date\(\), DAY_CUTOFF\)\);[\s\S]{0,200}\}, \[open\]\);/.test(wizard));
  check("…and what is left of the day it shows", /new Set\(timesLeftOn\(viewDay, SLOT_VALUES, durationMinutes, new Date\(\), DAY_CUTOFF\)\)/.test(wizard));
  check("the same start times and cutoff are used for both", /const SLOT_VALUES = timeSlots\.map\(\(slot\) => slot\.value\);/.test(wizard) && /const DAY_CUTOFF = \{ hour: 20, minute: 30 \};/.test(wizard));
  // Booking a time outright had the same hole: every time of today could be chosen, passed or not.
  check("booking outright: a time that has passed is not offered, and Next waits for one that is ahead", /disabled=\{exactTimePassed\(slot\.value\)\}/.test(wizard) && /if \(exactTimeMode\) return !!\(selectedDate && selectedTime\) && !exactTimePassed\(selectedTime\);/.test(wizard) && /if \(selectedTime && exactTimePassed\(selectedTime\)\) setSelectedTime\(""\);/.test(wizard));
}

console.log("\nThe team's page for an applicant says where the interview stands");
{
  // The owner, minutes after inviting his first finalists: "I just set him
  // up for an interview, but it didn't change here. It still says set up
  // interview. Can you see if that one went through?" It had. The page read
  // no interview at all.
  const TS = await import(pathToFileURL(path.join(ROOT, "src/lib/teamInterviewStatus.ts")).href);
  const EAST = "America/New_York";
  const read = (interview, over = {}) => TS.teamInterviewStatus(interview, NOW, { firstName: "Ana", theirZone: MANILA, teamZone: EAST, ...over });
  const OFFER = { start: "2026-10-09T21:00:00.000Z", durationMinutes: 30, zone: EAST };
  const offered = read({ status: "scheduled", candidate_response: "awaiting_pick", scheduled_at: OFFER.start, duration_minutes: 30, employer_windows: [OFFER] });
  check("a time offered and not booked: said, on both clocks, and that it is not booked yet", offered.state === "offered" && offered.title === "Interview offered" && offered.detail === "Fri, Oct 9 at 5:00 PM (Sat 5:00 AM for Ana). Not booked yet: you are told when Ana books it." && offered.action === "change", JSON.stringify(offered));
  check("someone on the team's own clock: one time, not the same one twice", read({ status: "scheduled", candidate_response: "awaiting_pick", scheduled_at: OFFER.start, employer_windows: [OFFER] }, { theirZone: EAST }).detail === "Fri, Oct 9 at 5:00 PM. Not booked yet: you are told when Ana books it.");
  check("their clock not on file: the team's time alone", read({ status: "scheduled", candidate_response: "awaiting_pick", scheduled_at: OFFER.start, employer_windows: [OFFER] }, { theirZone: null }).detail.startsWith("Fri, Oct 9 at 5:00 PM. Not booked yet"));
  const passed = read({ status: "scheduled", candidate_response: "awaiting_pick", scheduled_at: PAST.start, employer_windows: [PAST] });
  check("the offered time went by unbooked: said, and the button sets one up again", passed.state === "passed" && passed.title === "The offered time passed" && passed.action === "set-up", JSON.stringify(passed));
  const several = read({ status: "scheduled", candidate_response: "awaiting_pick", scheduled_at: W1.start, employer_windows: [W1, W2] });
  check("an older offer of several times: how many are still open", several.state === "offered-several" && several.detail === "2 times are still open. Not picked yet.", JSON.stringify(several));
  const booked = read({ status: "scheduled", candidate_response: "confirmed", scheduled_at: OFFER.start, duration_minutes: 30, employer_windows: [OFFER] });
  check("booked: said as booked, with the time", booked.state === "booked" && booked.title === "Interview booked" && booked.detail === "Fri, Oct 9 at 5:00 PM (Sat 5:00 AM for Ana). Ana booked it." && booked.action === "change", JSON.stringify(booked));
  const justStarted = TS.teamInterviewStatus({ status: "scheduled", candidate_response: "confirmed", scheduled_at: new Date(NOW.getTime() - 20 * 60_000).toISOString(), duration_minutes: 30 }, NOW, { firstName: "Ana" });
  check("a booked interview is still there while it runs, and gone once it is well over", justStarted?.state === "booked" && TS.teamInterviewStatus({ status: "scheduled", candidate_response: "confirmed", scheduled_at: PAST.start, duration_minutes: 30 }, NOW, {}) === null);
  const toConfirm = read({ status: "scheduled", candidate_response: "pending", scheduled_at: OFFER.start });
  check("a time booked outright: waiting for them to confirm", toConfirm.state === "to-confirm" && toConfirm.detail === "Fri, Oct 9 at 5:00 PM (Sat 5:00 AM for Ana). Waiting for Ana to confirm.", JSON.stringify(toConfirm));
  const cant = read({ status: "scheduled", candidate_response: "reschedule_requested", scheduled_at: OFFER.start, employer_windows: [OFFER] });
  check("they can't make it: said, and the button sets a new time", cant.state === "cant-make" && cant.title === "Ana can't make it" && cant.detail === "Ana wrote when they are free. Set a new time and they are asked to book it." && cant.action === "set-new", JSON.stringify(cant));
  check("no interview, a cancelled one, a finished one: nothing is said", read(null) === null && read({ status: "cancelled", candidate_response: "confirmed", scheduled_at: OFFER.start }) === null && read({ status: "completed", candidate_response: "confirmed", scheduled_at: OFFER.start }) === null && read({ status: "scheduled", candidate_response: "pending", scheduled_at: PAST.start }) === null);
  const nameless = TS.teamInterviewStatus({ status: "scheduled", candidate_response: "reschedule_requested" }, NOW, {});
  check("no name: still sentences", nameless.title === "They can't make it" && nameless.detail.startsWith("They wrote when they are free."));
  check("no leaked value and no dash as punctuation in any of it", [offered, passed, several, booked, toConfirm, cant, nameless].every((r) => !/undefined|null|NaN|Invalid|[\u2013\u2014\u00a0\u202f]/.test(`${r.title} ${r.detail}`)));

  const page = await read_("src/cockpit/pages/CandidateDetail.tsx");
  const cardFile = await read_("src/cockpit/components/ApplicantDecisionCard.tsx");
  const hook = await read_("src/hooks/useLiveInterviewForApplication.ts");
  check("the page reads the applicant's live interview, and words it from the one place", /const liveInterview = useLiveInterviewForApplication\(id\)\.data \?\? null;/.test(page) && /teamInterviewStatus\(liveInterview, new Date\(\), \{ firstName: first, theirZone \}\)/.test(page));
  check("one plain look-up, no join, kept fresh with every other interview query", /\.from\("interviews"\)\s*\.select\("id, status, candidate_response, scheduled_at, duration_minutes, employer_windows, created_at"\)/.test(hook) && /queryKey: \["interviews", "application-live", applicationId\]/.test(hook) && /\.eq\("status", "scheduled"\)\s*\.order\("created_at", \{ ascending: false \}\)\s*\.limit\(1\)/.test(hook) && !/profiles/.test(hook));
  const sync = await read_("src/cockpit/hooks/useEmployerLiveSync.ts");
  check("…so it changes live when the applicant books, without a refresh", /LIVE_SYNC_INTERVIEW_KEYS: readonly QueryKey\[\] = \[\["interviews"\]\];/.test(sync));
  check("with an interview that stands the button changes its time, and nothing is filled", /text: "Change interview time", cardText: "Change the time"/.test(page) && /const nothingToPress = lead === setupAction && interviewStatus\?\.action === "change";\s*if \(!declineRecommended && !nothingToPress\) lead\.variant = "primary";/.test(page));
  check("after 'can't make it' the button is 'Set a new time', on the Interviews page", /text: "Set a new time", variant: "outline", onClick: \(\) => navigate\("\/interviews"\)/.test(page));
  check("the card says it above its buttons, in every layout that has a card, and the older layout says it too", /\{interview && !outcome && <InterviewStatus status=\{interview\} className="mb-3" \/>\}/.test(cardFile) && (page.match(/interview=\{interviewLine\}/g) ?? []).length === 2 && /\{interviewLine && \(\s*<div className="ck-card p-4">\s*<InterviewStatus status=\{interviewLine\} \/>/.test(page));
  check("not once a decision is made (offered, hired, declined)", /const interviewStatus = isOffered \|\| isTerminal \? null : interviewRead;/.test(page));
  const wizard = await read_("src/components/InterviewSchedulingWizard.tsx");
  check("a time that replaces a live interview is said to the applicant as a new time", /\.\.\.\(earlierIds\.length > 0 \? \{ again: true \} : \{\}\),/.test(wizard) && /undefined,\s*earlierIds\.length > 0,\s*\{ interviewType, minutes: parseInt\(duration\) \}\s*\);/.test(wizard));
}

console.log("\nWhat the interview is, said before anyone has to ask");
{
  // A finalist, the morning after booking (2026-10-08): "I previously
  // completed the chat practice and written interview ... Could you please
  // let me know what the upcoming 30-minute video interview will cover and
  // whether this is the final interview stage?" The owner: "we should
  // clarify ... chat interview has been done. Now you will have a video
  // interview with the hiring team ... this is the final stage."
  const about = (over, company = "Zulu Support Team") => C.interviewAboutWords({ duration_minutes: 30, interview_type: "video", ...over }, company);
  check("it says the final step, how long, what kind, with whom, and that it is not another test", about({}) === "This is the final step: a 30-minute video call with Zulu Support Team. It is a conversation, not another test.");
  check("a phone call and a meeting in person are said as what they are", about({ interview_type: "phone", duration_minutes: 45 }).includes("a 45-minute phone call") && about({ interview_type: "in-person" }).includes("a 30-minute meeting in person") && about({ interview_type: "in_person" }).includes("meeting in person"));
  check("no length on file: no stray number", about({ duration_minutes: null }) === "This is the final step: a video call with Zulu Support Team. It is a conversation, not another test." && about({ duration_minutes: 0 }).includes("a video call"));
  check("'an' before 8, 11 and 18", about({ duration_minutes: 18 }).includes("an 18-minute") && about({ duration_minutes: 8 }).includes("an 8-minute") && about({ duration_minutes: 80 }).includes("an 80-minute") && about({ duration_minutes: 15 }).includes("a 15-minute"));
  check("no company name on file: 'the hiring team'", about({}, null).includes("video call with the hiring team.") && about({}, "  ").includes("with the hiring team."));
  check("nothing known about it at all: still a sentence", C.interviewAboutWords(null, null) === "This is the final step: a video call with the hiring team. It is a conversation, not another test.");
  check("the phrase for a kind, inside a sentence", C.interviewKindPhrase("video") === "video call" && C.interviewKindPhrase("phone") === "phone call" && C.interviewKindPhrase("onsite") === "meeting in person" && C.interviewKindPhrase(null) === "video call");

  const invited = words(row({ employer_windows: [W1] }));
  const toConfirm = words(row({ candidate_response: "pending", employer_windows: null }));
  const booked = words(row({ candidate_response: "confirmed", scheduled_at: W2.start }));
  const waitingNow = words(row({ candidate_response: "reschedule_requested" }));
  check("everyone who is told they were selected is told what the interview is", [words(row()), invited, toConfirm, words(row({ employer_windows: [PAST] }))].every((w) => w.about === "This is the final step: a 30-minute video call with Zulu Support Team. It is a conversation, not another test."));
  check("…and so is someone with a booked time", booked.about.startsWith("This is the final step:"));
  check("…but not while they wait for a new time (nothing new to say)", waitingNow.about === "");

  const fx = await read("src/components/candidate/InterviewCelebration.tsx");
  const list = await read("src/pages/Applications.tsx");
  const detail = await read("src/pages/CandidateApplicationDetail.tsx");
  const card2 = await read("src/components/CandidateInterviewConfirmationCard.tsx");
  check("the full-screen moment says it, between who wants to meet them and what to do", /\{about && \(\s*<p[^>]*data-interview-about>\s*\{about\}/.test(fx) && fx.indexOf("data-interview-about") < fx.indexOf("{detail}") && /about=\{selectedMoment\?\.words\.about\}/.test(list) && /about=\{interviewWords\?\.about\}/.test(detail));
  check("the list's interview card says it", /\{words\.about && \(\s*<p[^>]*data-interview-about>\s*\{words\.about\}/.test(list));
  check("the interview card says it in every stage that has a time: offered, to confirm, booked", /const about = interviewAboutWords\(\{ \.\.\.interview, duration_minutes: effectiveDurationMinutes \}, employerName\);/.test(card2) && (card2.match(/\{aboutLine\("/g) ?? []).length === 3);

  // "From now on in the beginning": the screen after the last test.
  check("everyone who finishes the tests is told what a yes leads to", C.FINALIST_LINE === "Finalists are invited to one last step: a short interview with the hiring team, usually a video call.");
  const next = await read("src/components/candidate/NextStepCard.tsx");
  check("…on the 'You've finished every step' screen", /you'll get a yes or no by email\. \$\{FINALIST_LINE\}`/.test(next));
  check("…and on their application's own page", /`Everyone who finishes every step gets a yes or no by email\. \$\{FINALIST_LINE\}`/.test(detail));

  const mail = await read("src/utils/emailNotifications.ts");
  check("the invitation email is told the kind and the length, as fixed words", /\.\.\.\(about \? \{ interview_kind: interviewKindPhrase\(about\.interviewType\) \} : \{\}\),\s*\.\.\.\(length \? \{ interview_length: length \} : \{\}\),/.test(mail));
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
