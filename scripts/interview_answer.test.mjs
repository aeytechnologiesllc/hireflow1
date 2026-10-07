#!/usr/bin/env node
/**
 * An applicant's answer about an interview, and the hiring team's answer back
 * (docs/INTERVIEWS.md, "When the applicant suggests other times"):
 * supabase/functions/_shared/interviewAnswer.ts, the
 * candidate-interview-response function, the Interviews page and
 * EmployerRescheduleReviewDialog.
 *
 * The owner asked on 2026-10-07 for the whole exchange to be sound ("make
 * sure the proposed times go in, they get to pick it or counter"). Reading it
 * end to end found:
 *  - the team's notice stated the picked time on the server's clock (UTC)
 *    with no zone: "1:00 PM" for the 9:00 AM the owner had offered;
 *  - whatever a browser sent as suggested times was stored as it came;
 *  - a suggestion made while still choosing among offered times was treated
 *    as a request to move an agreed time: the team was shown a placeholder
 *    as the "original time" and could "keep" it;
 *  - accepting one of the applicant's own times asked them to confirm it
 *    again.
 *
 * Run with: node scripts/interview_answer.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

// Decoded, so a checkout whose path has a space in it works too.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const A = await import(pathToFileURL(path.join(ROOT, "supabase/functions/_shared/interviewAnswer.ts")).href);
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

const NOW = Date.parse("2026-10-07T20:00:00Z");
const NINE_EASTERN = "2026-10-08T13:00:00.000Z"; // Thursday 9:00 AM in New York, 9:00 PM in Manila
const WINDOWS = [
  { start: NINE_EASTERN, durationMinutes: 30, zone: "America/New_York" },
  { start: "2026-10-09T13:00:00.000Z", durationMinutes: 30, zone: "America/New_York" },
];
const OLD_WINDOWS = WINDOWS.map(({ start, durationMinutes }) => ({ start, durationMinutes }));

console.log("\nWhose clock the team reads");
{
  check("a real zone is known", A.knownZone("Asia/Manila") === "Asia/Manila" && A.knownZone(" America/New_York ") === "America/New_York");
  check("anything else is not", [null, undefined, 5, "", "   ", "Mars/Olympus", "x".repeat(80), {}].every((v) => A.knownZone(v) === null));
  check("the team's zone is the one the wizard recorded on the offered times", A.teamZoneOf(WINDOWS) === "America/New_York");
  check("offered times made before it was recorded: none", A.teamZoneOf(OLD_WINDOWS) === null && A.teamZoneOf(null) === null && A.teamZoneOf("x") === null);
  check("a made-up zone on a window is not trusted", A.teamZoneOf([{ start: NINE_EASTERN, zone: "Nowhere/Else" }]) === null);
  check("the team's clock when it is on file", JSON.stringify(A.clockForTeam(WINDOWS, "Asia/Manila")) === JSON.stringify({ zone: "America/New_York", whose: "team" }));
  check("otherwise the applicant's, said so", JSON.stringify(A.clockForTeam(OLD_WINDOWS, "Asia/Manila")) === JSON.stringify({ zone: "Asia/Manila", whose: "applicant" }));
  check("neither: UTC, said so", JSON.stringify(A.clockForTeam(null, "nope")) === JSON.stringify({ zone: "UTC", whose: "utc" }));

  const team = A.sayTimeForTeam(NINE_EASTERN, A.clockForTeam(WINDOWS, "Asia/Manila"));
  check("the owner offered 9:00 AM and reads 9:00 AM", team === "Thursday, October 8 at 9:00 AM EDT", team);
  const theirs = A.sayTimeForTeam(NINE_EASTERN, A.clockForTeam(OLD_WINDOWS, "Asia/Manila"));
  check("on the applicant's clock it says whose it is", theirs === "Thursday, October 8 at 9:00 PM GMT+8 (their clock)", theirs);
  const utc = A.sayTimeForTeam(NINE_EASTERN, A.clockForTeam(null, null));
  check("on no known clock it names UTC", utc === "Thursday, October 8 at 1:00 PM UTC", utc);
  check("never a bare time", [team, theirs, utc].every((t) => /(EDT|EST|GMT[+-]\d+|UTC)/.test(t)));
  check("after the clocks change it follows", A.sayTimeForTeam("2026-11-05T14:00:00.000Z", { zone: "America/New_York", whose: "team" }) === "Thursday, November 5 at 9:00 AM EST");
  check("not a date: nothing", A.sayTimeForTeam("nope", { zone: "UTC", whose: "utc" }) === "");
  check("no narrow or no-break space in it", ![team, theirs, utc].some((t) => /[\u00a0\u202f]/.test(t)));
}

console.log("\nWhat an applicant may suggest");
{
  const ahead = (hours) => new Date(NOW + hours * 3600_000).toISOString();
  const clean = (raw) => A.cleanSuggestedTimes(raw, NOW);
  check("real times ahead are kept, soonest first", JSON.stringify(clean([{ datetime: ahead(50) }, { datetime: ahead(26) }])) === JSON.stringify([{ datetime: ahead(26) }, { datetime: ahead(50) }]));
  check("a time that has passed is dropped", clean([{ datetime: ahead(-1) }, { datetime: ahead(5) }]).length === 1);
  check("the same moment twice is once", clean([{ datetime: ahead(5) }, { datetime: ahead(5) }]).length === 1);
  check("the same moment written two ways is once", clean([{ datetime: "2026-10-09T01:00:00Z" }, { datetime: "2026-10-09T01:00:00.000+00:00" }]).length === 1);
  check("junk is dropped", clean([null, 4, "x", {}, { datetime: 5 }, { datetime: "not a date" }, { datetime: "x".repeat(60) }]).length === 0);
  check("not a list: nothing", clean(null).length === 0 && clean({ datetime: ahead(5) }).length === 0);
  check(`at most ${A.MAX_SUGGESTED_TIMES}`, clean(Array.from({ length: 30 }, (_, i) => ({ datetime: ahead(24 + i) }))).length === A.MAX_SUGGESTED_TIMES);
  check("only the moment is kept, nothing else a browser adds", JSON.stringify(clean([{ datetime: ahead(5), fromOffer: true, evil: "<script>" }])) === JSON.stringify([{ datetime: ahead(5) }]));

  check("a note is trimmed and kept", A.cleanNote("  Mornings are best.  ") === "Mornings are best.");
  check("line breaks and control characters become spaces", A.cleanNote("a\nb\tc\u0000d") === "a b c d");
  check("an empty note is no note", A.cleanNote("   ") === null && A.cleanNote("") === null && A.cleanNote(null) === null && A.cleanNote(5) === null);
  check(`a long note is cut to ${A.MAX_NOTE_LENGTH}`, A.cleanNote("x".repeat(2000)).length === A.MAX_NOTE_LENGTH);
}

console.log("\nWas a time ever agreed?");
{
  check("still choosing among offered times: no", A.noTimeAgreedYet("awaiting_pick", null) === true);
  check("a time set and waiting to be confirmed: yes", A.noTimeAgreedYet("pending", null) === false && A.noTimeAgreedYet(null, null) === false);
  check("confirmed: yes", A.noTimeAgreedYet("confirmed", null) === false);
  check("a suggestion made while choosing, still unanswered: no", A.noTimeAgreedYet("reschedule_requested", [{ datetime: "x", fromOffer: true }]) === true);
  check("a suggestion to move an agreed time: yes", A.noTimeAgreedYet("reschedule_requested", [{ datetime: "x" }]) === false && A.noTimeAgreedYet("reschedule_requested", null) === false);
  check("the mark is written only when none was agreed", JSON.stringify(A.suggestionToStore([{ datetime: "a" }], true)) === '[{"datetime":"a","fromOffer":true}]' && JSON.stringify(A.suggestionToStore([{ datetime: "a" }], false)) === '[{"datetime":"a"}]');
  // Suggesting a second time before the team answered keeps the mark.
  const again = A.suggestionToStore([{ datetime: "b" }], A.noTimeAgreedYet("reschedule_requested", A.suggestionToStore([{ datetime: "a" }], true)));
  check("suggesting again before an answer keeps it", again[0].fromOffer === true);
}

console.log("\nWhat the team's bell says");
{
  const who = { name: "Maria Santos", jobTitle: "Chat Support Team Leader" };
  const picked = A.teamNoticeFor("picked", who, { when: "Thursday, October 8 at 9:00 AM EDT" });
  check("picked: who, which job, and the time on a named clock", picked.title === "Interview time picked" && picked.message === "Maria Santos picked a time for their interview for Chat Support Team Leader: Thursday, October 8 at 9:00 AM EDT.", picked.message);
  const moved = A.teamNoticeFor("moved", who, { when: "Friday, October 9 at 9:00 AM EDT" });
  check("moved to another offered time", moved.title === "Interview moved" && moved.message.endsWith("to Friday, October 9 at 9:00 AM EDT."));
  const confirmed = A.teamNoticeFor("confirmed", who, { when: "Thursday, October 8 at 9:00 AM EDT" });
  check("confirmed, with the time", confirmed.message === "Maria Santos confirmed their interview for Chat Support Team Leader: Thursday, October 8 at 9:00 AM EDT.");
  check("confirmed with no time known: still a sentence", A.teamNoticeFor("confirmed", who).message === "Maria Santos confirmed their interview for Chat Support Team Leader.");
  const countered = A.teamNoticeFor("countered", who, { count: 2 });
  check("none of the offered times work: said as that, with where to answer", countered.title === "Other interview times suggested" && countered.message === "Maria Santos can't make the times you offered for Chat Support Team Leader and suggested 2 other times. Open Interviews to answer.", countered.message);
  const suggested = A.teamNoticeFor("suggested", who, { count: 1 });
  check("asking to move an agreed time: said as that", suggested.title === "Another interview time asked for" && suggested.message === "Maria Santos asked to move their interview for Chat Support Team Leader and suggested one other time. Open Interviews to answer.", suggested.message);
  check("no leaked values", [picked, moved, confirmed, countered, suggested].every((n) => !/undefined|null|NaN/.test(`${n.title} ${n.message}`)));
}

console.log("\nWhen a time becomes agreed: the two emails");
{
  check("a length in words", A.lengthWords(30) === "30 minutes" && A.lengthWords(60) === "1 hour" && A.lengthWords(90) === "1 hour 30 minutes" && A.lengthWords(120) === "2 hours");
  check("no length known: nothing, not '0 minutes'", [0, -5, null, undefined, "30", NaN, 99999].every((v) => A.lengthWords(v) === ""));

  const room = A.joinNoteFor({ meeting_provider: "daily", meeting_link: null, interview_type: "video" });
  const own = A.joinNoteFor({ meeting_provider: null, meeting_link: "https://meet.google.com/abc-defg-hij", interview_type: "video" });
  check("a video call on the team's own link: the Join button opens two hours before", own === "This is a video call. The Join button is on your application page and opens 2 hours before the start.", own);
  check("…in the built-in room: fifteen minutes before, when the room itself opens", room === "This is a video call. The Join button is on your application page and opens 15 minutes before the start.", room);
  const pageLib = await import(pathToFileURL(path.join(ROOT, "src/lib/candidateInterview.ts")).href);
  check("the email and the page give the same two numbers", A.EMAIL_JOIN_OPENS_MINUTES_LINK === pageLib.JOIN_OPENS_MINUTES_LINK && A.EMAIL_JOIN_OPENS_MINUTES_ROOM === pageLib.JOIN_OPENS_MINUTES_ROOM);
  check("the meeting link itself is never in the line", !/meet\.google|https?:/.test(own));
  check("a video call with nothing set up yet says the team will send it", A.joinNoteFor({ interview_type: "video" }) === "This is a video call. The hiring team will send you how to join." && A.joinNoteFor({}) === A.joinNoteFor({ interview_type: "video" }));
  check("a phone call and an in-person one say so", /^This is a phone call\./.test(A.joinNoteFor({ interview_type: "phone" })) && /^This is in person\./.test(A.joinNoteFor({ interview_type: "in-person" })) && /^This is in person\./.test(A.joinNoteFor({ interview_type: "in_person" })));

  const base = {
    change: "picked",
    candidateId: "cand-1",
    employerId: "emp-1",
    candidateName: "Maria Santos",
    jobTitle: "Chat Support Team Leader",
    companyName: " Zulu Support Team ",
    applicationId: "app-1",
    applicantTime: { date: "Thursday, October 8, 2026", time: "9:00 PM Philippine Standard Time" },
    teamWhen: "Thursday, October 8 at 9:00 AM EDT",
    minutes: 30,
    interview: { meeting_provider: null, meeting_link: "https://meet.google.com/abc-defg-hij", interview_type: "video" },
  };
  const both = A.agreedTimeEmails(base);
  check("two emails: the applicant's confirmation and the team's notice", both.length === 2 && both[0].type === "interview_confirmed" && both[1].type === "interview_time_picked");
  check("the confirmation goes to the applicant, with their own clock's date and time", both[0].recipient_user_id === "cand-1" && both[0].data.interview_date === "Thursday, October 8, 2026" && both[0].data.interview_time === "9:00 PM Philippine Standard Time");
  check("…the job, the length, how to join, who signs it, and which application to open", both[0].data.job_title === "Chat Support Team Leader" && both[0].data.interview_length === "30 minutes" && both[0].data.join_note === own && both[0].data.company_name === "Zulu Support Team" && both[0].data.application_id === "app-1");
  check("the notice goes to the job's owner, with the team's clock", both[1].recipient_user_id === "emp-1" && both[1].data.interview_when === "Thursday, October 8 at 9:00 AM EDT" && both[1].data.candidate_name === "Maria Santos" && both[1].data.interview_change === "picked");
  check("neither carries the meeting link", !/meet\.google/.test(JSON.stringify(both)));
  check("how it became agreed is passed on", A.agreedTimeEmails({ ...base, change: "moved" })[1].data.interview_change === "moved" && A.agreedTimeEmails({ ...base, change: "confirmed" })[1].data.interview_change === "confirmed");
  check("nobody to send to: that email is left out, the other still goes", A.agreedTimeEmails({ ...base, candidateId: null }).map((e) => e.type).join() === "interview_time_picked" && A.agreedTimeEmails({ ...base, employerId: undefined }).map((e) => e.type).join() === "interview_confirmed");
  check("no time in words: nothing is sent rather than an empty time", A.agreedTimeEmails({ ...base, applicantTime: { date: "", time: "" }, teamWhen: "" }).length === 0);
  check("unknown length or team name: left out, never 'undefined'", !/undefined|null/.test(JSON.stringify(A.agreedTimeEmails({ ...base, minutes: null, companyName: null, applicationId: null }))) && !("interview_length" in A.agreedTimeEmails({ ...base, minutes: null })[0].data));
  check("every value is text (the email function is sent only strings)", both.every((e) => Object.values(e.data).every((v) => typeof v === "string")));

  const page = await read("src/lib/interviewTimes.ts");
  const server = await read("supabase/functions/_shared/interviewTimes.ts");
  check("the function words the applicant's time with the very same code the pages use (identical, byte for byte)", page === server);
}

console.log("\nThe function");
{
  const fn = await read("supabase/functions/candidate-interview-response/index.ts");
  check("a pick or a swap marks the time as agreed", /agreed = \{ change: isAlreadyConfirmed \? "moved" : "picked", at: matchedWindow\.start, minutes: duration \};/.test(fn));
  check("a first confirm does too; confirming twice is not news", /if \(interview\.scheduled_at && interview\.candidate_response !== "confirmed"\) \{\s*agreed = \{ change: "confirmed",/.test(fn));
  check("a suggestion does not (the team is emailed about that separately)", !/reschedule_requested[\s\S]{0,900}agreed = /.test(fn.slice(fn.indexOf('payload.action === "reschedule_requested"'), fn.indexOf('payload.action === "pick_slot"'))));
  check("the emails go after the answer is saved, and after it has gone back", fn.indexOf("afterResponse((async () => {") > fn.indexOf('.from("interviews")\n      .update(updateData)') && /function afterResponse\(task: Promise<unknown>\): void \{[\s\S]{0,420}runtime\.waitUntil\(guarded\);/.test(fn));
  check("…and a failed email can never fail the answer", /const guarded = task\.catch\(\(error\) => \{/.test(fn) && /Promise\.allSettled\(\s*emails\.map\(\(body\) => supabaseAdmin\.functions\.invoke\("send-notification-email", \{ body \}\)\),/.test(fn));
  check("the applicant's clock: their browser's zone, else the one their connection check recorded", /const theirZone = knownZone\(payload\.timeZone\) \?\? applicantTimeZone\(application\?\.notes\);/.test(fn));
  check("…worded by the shared helper, falling back to the team's clock by name", /applicantEmailTime\(new Date\(settled\.at\), theirZone, teamZoneOf\(interview\.employer_windows\) \?\? "UTC"\)/.test(fn));
  check("who signs the applicant's email is looked up, not taken from the browser", /\.from\("profiles"\)\s*\.select\("company_name"\)\s*\.eq\("user_id", employerId\)/.test(fn));
  check("it words times through the helper, never the server's own clock", /sayTimeForTeam\(matchedWindow\.start, clock\)/.test(fn) && !/toLocaleString/.test(fn));
  check("the clock comes from the offered times, then the applicant's own zone", /const clock = clockForTeam\(interview\.employer_windows, payload\.timeZone\);/.test(fn));
  check("suggested times are cleaned before they are stored", /suggested = cleanSuggestedTimes\(payload\.proposedTimes, Date\.now\(\)\);/.test(fn) && /proposed_times: suggestionToStore\(suggested, fromOffer\),/.test(fn) && !/proposed_times: payload\.proposedTimes/.test(fn));
  check("no usable time: refused, nothing written", /if \(suggested\.length === 0\) \{\s*return new Response\(JSON\.stringify\(\{ error: "no_times" \}\), \{\s*status: 400/.test(fn));
  check("the note is cleaned too", /suggestedNote = cleanNote\(payload\.candidateNote\);/.test(fn) && /candidate_note: suggestedNote,/.test(fn));
  check("an offer cannot be 'confirmed': a time has to be picked", /if \(payload\.action === "confirm"\) \{[\s\S]{0,360}if \(noTimeAgreedYet\(interview\.candidate_response, interview\.proposed_times\)\) \{\s*return new Response\(JSON\.stringify\(\{ error: "pick_a_time_first" \}\)/.test(fn));
  check("it reads the suggestion already on the row", /employer_windows,\s*proposed_times,\s*status,/.test(fn));
  check("…and how the call happens, for the join line", /interview_type,\s*meeting_link,\s*meeting_provider,/.test(fn));
  check("a suggestion opens the Interviews page for the team", /notificationLink = "\/interviews";/.test(fn) && /link: notificationLink,/.test(fn));
  check("the email to the team lists the times through the helper", /suggested\.map\(\(t\) => sayTimeForTeam\(t\.datetime, clock\)\)\.join\("; "\)/.test(fn));
  check("only the applicant on the interview may answer", /if \(application\?\.candidate_id !== user\.id\) \{/.test(fn) && /status: 403/.test(fn));
  check("a cancelled interview cannot be answered", /if \(interview\.status !== "scheduled"\) \{/.test(fn));
  check("picking is still only among the offered times, and only ahead", /const matchedWindow = windows\.find\(\(w\) => w\?\.start === payload\.slotStart\);/.test(fn) && /if \(!\(matchedStartMs > Date\.now\(\)\)\) \{/.test(fn));
  check("what it logs is the action, not the applicant's words", /console\.log\("Received answer:", \{ action: payload\?\.action, interviewId: payload\?\.interviewId \}\);/.test(fn) && !/console\.log\("Received payload:", payload\)/.test(fn));

  const card = await read("src/components/CandidateInterviewConfirmationCard.tsx");
  const dialog = await read("src/components/CandidateRescheduleRequestDialog.tsx");
  const popup = await read("src/components/CandidateStatusScreen.tsx");
  check("every answer carries the applicant's own time zone", (card.match(/timeZone: getTimezoneName\(\)/g) ?? []).length === 2 && /timeZone: getTimezoneName\(\),/.test(dialog) && /timeZone: getTimezoneName\(\),/.test(popup));
}

console.log("\nThe team's answer");
{
  const review = await read("src/components/EmployerRescheduleReviewDialog.tsx");
  const page = await read("src/cockpit/pages/Interviews.tsx");
  check("the page knows a suggestion that answers an offer", /suggestedFromOffer: raw\.some\(\(t\) => \(t as \{ fromOffer\?: unknown \} \| null\)\?\.fromOffer === true\),/.test(page));
  check("…and which offered times are still open", /openOfferedTimes: \(windows as Array<\{ start\?: unknown \}>\)/.test(page) && /new Date\(start\)\.getTime\(\) > Date\.now\(\)/.test(page));
  check("the row says which it is", /"they can't make the times you offered and suggested others"/.test(page) && /s\.suggestedFromOffer \? "Suggested other times" : "Needs confirm"/.test(page));
  check("the dialog is told", /fromOffer=\{reviewing\.suggestedFromOffer\}\s*openOfferedTimes=\{reviewing\.openOfferedTimes\}/.test(page));

  check("one reading of 'no time is agreed yet' on the page", /function noTimeYet\(s: Pick<Session, "response" \| "suggestedFromOffer">\): boolean \{\s*return s\.response === "awaiting_pick" \|\| \(s\.response === "reschedule_requested" && s\.suggestedFromOffer\);/.test(page));
  check("a row with no agreed time shows no clock time as if it were set", /\{noTimeYet\(s\) \? \([\s\S]{0,700}No time yet[\s\S]{0,420}\{awaitingPick \? "They pick" : "Your call"\}/.test(page) && /data-interview-time="none"/.test(page));
  check("the brief does not say 'Set for' or 'ready for' a placeholder", /next\.at && !noTimeYet\(next\) \? \(isToday\(next\.at\)/.test(page) && /\{noTimeYet\(next\) \? \(\s*<Evidence icon=\{AlertCircle\} tone="var\(--amber-fg\)" label="No time yet:">/.test(page));
  check("answering an offer: no 'set now for' time is shown", /\{!fromOffer && \(\s*<Card className="bg-muted\/50">/.test(review));
  check("…and no 'keep': the other answer is back to the offered times", /\{fromOffer \? \(\s*<Button[\s\S]{0,220}onClick=\{handleBackToOffer\}/.test(review) && /onClick=\{handleKeepOriginal\}/.test(review));
  const back = /const handleBackToOffer = async \(\) => \{[\s\S]*?\n  \};\n/.exec(review)?.[0] ?? "";
  check("back to the offer puts them back to choosing", /candidate_response: "awaiting_pick",\s*proposed_times: null,\s*candidate_note: null,/.test(back));
  check("…never touching the time, and never 'pending'", !/scheduled_at:/.test(back) && !/"pending"/.test(back));
  check("…tells them, in the app and by the invitation email with the times still open", /from\("notifications"\)\.insert/.test(back) && /notifyInterviewPickTime\(candidateId, jobTitle, lines, undefined\)/.test(back) && /openOfferedTimes\.map\(\(start\) => applicantEmailTime\(parseISO\(start\), theirZone, localTimeZone\(\)\)\.line\)/.test(back));
  check("…and is not offered once the offered times have passed", /disabled=\{isSubmitting \|\| !canGoBackToOffer\}/.test(review) && /The times you offered have passed\. Accept one of theirs, or message/.test(review));

  const accept = /const handleAcceptTime = async \(\) => \{[\s\S]*?\n  \};\n/.exec(review)?.[0] ?? "";
  check("accepting one of their own times settles it: confirmed, not asked again", /scheduled_at: selectedTime,[\s\S]{0,220}candidate_response: "confirmed",/.test(accept) && !/"pending"/.test(accept));
  check("a first agreed time is emailed as scheduled, a moved one as rescheduled", /if \(fromOffer\) await notifyInterviewScheduled\(candidateId, jobTitle, written\.date, written\.time, undefined\);\s*else await notifyInterviewRescheduled\(candidateId, jobTitle, written\.date, written\.time\);/.test(accept));
  check("the applicant's bell on accept is the database's own (no second one)", !/from\("notifications"\)/.test(accept));
  const keep = /const handleKeepOriginal = async \(\) => \{[\s\S]*?\n  \};\n/.exec(review)?.[0] ?? "";
  check("keeping a set time asks them to confirm it", /candidate_response: "pending",/.test(keep));
  check("no select in it reaches through profiles", !/\.select\([^)]*profiles/.test(review));

  const doc = await read("docs/INTERVIEWS.md");
  check("docs/INTERVIEWS.md explains it and names this test", doc.includes("## When the applicant suggests other times") && doc.includes("scripts/interview_answer.test.mjs"));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
