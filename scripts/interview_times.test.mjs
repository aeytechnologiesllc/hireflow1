#!/usr/bin/env node
/**
 * An interview's time, written for the person reading it (docs/INTERVIEWS.md):
 * src/lib/interviewTimes.ts and the four places that put a time into an email
 * to an applicant.
 *
 * What was wrong (found 2026-10-07, before the first invitation went out):
 * every interview email printed the hiring team's clock with no zone. The
 * owner is on US Eastern and the applicants are in the Philippines, exactly
 * twelve hours ahead: "8:00 PM" read as the applicant's evening and was their
 * morning. These checks prove:
 *  - a time for an applicant is on THEIR clock when their zone is on file
 *    (the connection check records it), and names the zone either way;
 *  - with no zone on file it is the team's clock, named: never a bare time;
 *  - the day moves with the clock (Thursday evening in New York is Friday
 *    morning in Manila), across daylight saving, and for half-hour zones;
 *  - the zone is read only from where the connection check writes it, and a
 *    zone the runtime does not know is treated as none;
 *  - the wiring: the scheduling wizard, both reschedule paths and the cancel
 *    path all write their email times through this one helper, and offering
 *    times can carry the owner's own meeting link instead of the built-in room.
 *
 * Run with: node scripts/interview_times.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

// Decoded, so a checkout whose path has a space in it works too.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const T = await import(pathToFileURL(path.join(ROOT, "src/lib/interviewTimes.ts")).href);

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

const NEW_YORK = "America/New_York";
const MANILA = "Asia/Manila";
// Thursday 8 October 2026, 8:00 PM in New York = Friday 9 October, 8:00 AM in Manila.
const THU_8PM_NY = new Date("2026-10-09T00:00:00Z");

console.log("\nThe case that started this: an owner on US Eastern, an applicant in Manila\n");
{
  const mail = T.applicantEmailTime(THU_8PM_NY, MANILA, NEW_YORK);
  check("the email says THEIR day: Friday, not Thursday", mail.date === "Friday, October 9, 2026", mail.date);
  check("…and THEIR time, with the zone named", mail.time === "8:00 AM Philippine Standard Time", mail.time);
  check("the line an invitation lists", mail.line === "Friday, October 9 · 8:00 AM Philippine Standard Time", mail.line);
  check("the line a cancellation quotes", mail.dateAndTime === "Friday, October 9, 2026 at 8:00 AM Philippine Standard Time", mail.dateAndTime);
  check("it knows it wrote their clock", mail.onApplicantClock === true);
  check("no bare time anywhere: every time string carries a zone name", [mail.time, mail.line, mail.dateAndTime].every((s) => /Standard Time|Daylight Time|time \(UTC/.test(s)), show(mail));
  check("the gap, in the owner's words", T.clockGapWords(THU_8PM_NY, MANILA, NEW_YORK) === "12 hours ahead of you");
  check("the short form beside the owner's own time", T.shortTimeIn(THU_8PM_NY, MANILA) === "Fri 8:00 AM", T.shortTimeIn(THU_8PM_NY, MANILA));
  check("…and the owner's own, for comparison", T.shortTimeIn(THU_8PM_NY, NEW_YORK) === "Thu 8:00 PM", T.shortTimeIn(THU_8PM_NY, NEW_YORK));
}

console.log("\nNo zone on file\n");
{
  const mail = T.applicantEmailTime(THU_8PM_NY, null, NEW_YORK);
  check("the team's clock is used", mail.date === "Thursday, October 8, 2026" && mail.onApplicantClock === false, show(mail));
  check("…and its zone is named, so the time cannot be read as local", mail.time === "8:00 PM Eastern Daylight Time", mail.time);
  const unknown = T.applicantEmailTime(THU_8PM_NY, "Mars/Olympus_Mons", NEW_YORK);
  check("a zone the runtime does not know counts as none", unknown.time === "8:00 PM Eastern Daylight Time" && unknown.onApplicantClock === false, show(unknown));
  const nothing = T.applicantEmailTime(THU_8PM_NY, null, "Not/AZone");
  check("with neither zone usable it falls back to UTC, still named", /Coordinated Universal Time$/.test(nothing.time), nothing.time);
}

console.log("\nDays, daylight saving, half hours\n");
{
  // 9:00 AM New York on Thursday is 9:00 PM the same Thursday in Manila.
  const morning = new Date("2026-10-08T13:00:00Z");
  check("a New York morning is the same day's evening in Manila", T.applicantEmailTime(morning, MANILA, NEW_YORK).line === "Thursday, October 8 · 9:00 PM Philippine Standard Time", T.applicantEmailTime(morning, MANILA, NEW_YORK).line);
  // After US clocks go back (1 Nov 2026) New York is UTC-5, and Manila is 13 hours ahead.
  const winter = new Date("2026-12-09T01:00:00Z"); // Tue 8 Dec, 8:00 PM New York
  check("in winter the gap is 13 hours", T.clockGapWords(winter, MANILA, NEW_YORK) === "13 hours ahead of you", T.clockGapWords(winter, MANILA, NEW_YORK));
  check("…and the same New York evening is 9:00 AM in Manila", T.applicantEmailTime(winter, MANILA, NEW_YORK).time === "9:00 AM Philippine Standard Time", T.applicantEmailTime(winter, MANILA, NEW_YORK).time);
  check("the team's own zone name follows the season", T.applicantEmailTime(winter, null, NEW_YORK).time === "8:00 PM Eastern Standard Time", T.applicantEmailTime(winter, null, NEW_YORK).time);
  check("a half-hour zone", T.clockGapWords(THU_8PM_NY, "Asia/Kolkata", NEW_YORK) === "9 hours 30 minutes ahead of you" && T.applicantEmailTime(THU_8PM_NY, "Asia/Kolkata", NEW_YORK).time === "5:30 AM India Standard Time", T.applicantEmailTime(THU_8PM_NY, "Asia/Kolkata", NEW_YORK).time);
  check("someone behind the owner", T.clockGapWords(THU_8PM_NY, "America/Los_Angeles", NEW_YORK) === "3 hours behind you");
  check("someone on the same clock", T.clockGapWords(THU_8PM_NY, "America/Toronto", NEW_YORK) === "on the same clock as you");
  check("one hour is singular", T.clockGapWords(THU_8PM_NY, "America/Chicago", NEW_YORK) === "1 hour behind you");
  check("midnight is 12:00 AM, on the next day", T.writeTime(new Date("2026-10-08T16:00:00Z"), MANILA).clock === "12:00 AM" && T.writeTime(new Date("2026-10-08T16:00:00Z"), MANILA).day === "Friday, October 9");
  check("noon is 12:00 PM", T.writeTime(new Date("2026-10-08T04:00:00Z"), MANILA).clock === "12:00 PM");
  check("offsets: Manila +480, New York -240 in summer and -300 in winter", T.zoneOffsetMinutes(THU_8PM_NY, MANILA) === 480 && T.zoneOffsetMinutes(THU_8PM_NY, NEW_YORK) === -240 && T.zoneOffsetMinutes(winter, NEW_YORK) === -300);
  check("a zone with no name of its own gets a place and an offset", T.zoneName(THU_8PM_NY, "Etc/GMT-8") === "GMT-8 time (UTC+8)", T.zoneName(THU_8PM_NY, "Etc/GMT-8"));
  check("a place name for the owner's note", T.zonePlace(MANILA) === "Manila" && T.zonePlace(NEW_YORK) === "New York");
  check("the clock string has plain spaces only (no narrow no-break space before AM/PM)", !/[\u00a0\u202f]/.test(T.applicantEmailTime(THU_8PM_NY, MANILA, NEW_YORK).line));
}

console.log("\nWhere the applicant's zone is read from\n");
{
  const notes = { equipmentCheckResult: { device: { timezone: MANILA, os: "Windows" } }, quizResult: { score: 80 } };
  check("the connection check's device record, from notes as an object", T.applicantTimeZone(notes) === MANILA);
  check("…and from notes as the stored text", T.applicantTimeZone(JSON.stringify(notes)) === MANILA);
  check("no connection check yet: none", T.applicantTimeZone({ quizResult: { score: 80 } }) === null);
  check("a zone the runtime does not know: none", T.applicantTimeZone({ equipmentCheckResult: { device: { timezone: "Nowhere/Zone" } } }) === null);
  check("not a string: none", T.applicantTimeZone({ equipmentCheckResult: { device: { timezone: 480 } } }) === null);
  check("a zone written anywhere else in the notes is not used", T.applicantTimeZone({ timezone: MANILA, device: { timezone: MANILA } }) === null);
  check("notes that are not JSON, empty or missing: none", T.applicantTimeZone("{oops") === null && T.applicantTimeZone("") === null && T.applicantTimeZone(null) === null && T.applicantTimeZone(undefined) === null);
  check("knownTimeZone trims, and refuses blanks and absurd lengths", T.knownTimeZone(" Asia/Manila ") === MANILA && T.knownTimeZone("") === null && T.knownTimeZone("x".repeat(80)) === null && T.knownTimeZone(null) === null);
}

console.log("\nWiring: every email time goes through the helper\n");
{
  const wizard = await read("src/components/InterviewSchedulingWizard.tsx");
  const reschedule = await read("src/components/RescheduleInterviewDialog.tsx");
  const review = await read("src/components/EmployerRescheduleReviewDialog.tsx");
  const interviews = await read("src/cockpit/pages/Interviews.tsx");
  const hook = await read("src/hooks/useApplicantTimeZone.ts");

  check("the wizard's invitation lists helper lines", /proposedTimes = sortedSelectedWindows\.map\(\s*\(w\) => applicantEmailTime\(combineDayAndTime\(w\.day, w\.time\), theirZone, teamZone\)\.line/.test(wizard));
  check("the wizard's exact-time email takes its date and time from the helper", /const written = applicantEmailTime\(scheduledAt, theirZone, teamZone\);\s*interviewDateLabel = written\.date;\s*interviewTimeLabel = written\.time;/.test(wizard));
  check("the wizard asks for the zone again if the lookup had not landed", /const theirZone = applicantZone \?\? \(await fetchApplicantTimeZone\(applicationId\)\);/.test(wizard));
  check("moving an interview writes through the helper", /applicantEmailTime\(scheduledAt, await fetchApplicantTimeZone\(applicationId\), localTimeZone\(\)\)/.test(reschedule) && /written\.date,\s*written\.time/.test(reschedule));
  check("answering a reschedule request writes through the helper, on both answers", (review.match(/applicantEmailTime\(parseISO\((selectedTime|scheduledAt)\), await fetchApplicantTimeZone\(applicationId\), localTimeZone\(\)\)/g) ?? []).length === 2);
  check("cancelling quotes the time they had through the helper", /applicantEmailTime\(target\.at, await fetchApplicantTimeZone\(target\.applicationId\), localTimeZone\(\)\)\.dateAndTime/.test(interviews));

  // No file that sends an interview email formats a date for it by hand any more.
  for (const [name, text] of [["the wizard", wizard], ["the reschedule dialog", reschedule], ["the reschedule review", review], ["the Interviews page", interviews]]) {
    const calls = text.match(/notifyInterview(?:Scheduled|PickTime|Cancelled|Rescheduled)\([\s\S]{0,260}?\);/g) ?? [];
    check(`${name}: no hand-formatted date inside an interview email call`, calls.length > 0 && calls.every((c) => !/\bformat\(|formatTimeToAMPM\(|toLocale/.test(c)), show(calls.map((c) => c.slice(0, 90))));
  }

  check("the zone lookup never throws (a failed lookup only means the team's clock is named)", /catch \{\s*return null;\s*\}/.test(hook) && /if \(error \|\| !data\) return null;/.test(hook));
  check("the owner sees whose clock is whose before choosing", wizard.includes('data-testid="their-clock-note"') && wizard.includes("it is the time their email states"));
  check("…and is told when the zone is not on file", wizard.includes("time zone is not on file"));

  console.log("\nWiring: offering times with the owner's own meeting link\n");
  check("offering times can carry a link of the owner's own", /meeting_link: ownLink \|\| null,/.test(wizard));
  check("…and then no built-in room is asked for", /meeting_provider: interviewType === "video" && !ownLink \? "daily" : null,/.test(wizard));
  check("the link has to be a real meeting link before Next", /if \(!exactTimeMode\) return !ownLinkMode \|\| isValidMeetingLink\(manualMeetingLink\);/.test(wizard));
  check("a link is only kept for a video interview", /let meetingLink = interviewType === "video" \? manualMeetingLink\.trim\(\) : "";/.test(wizard));
  check("the link is remembered on this browser only, and only if it is a meeting link", wizard.includes('const OWN_LINK_KEY = "interview_own_meeting_link";') && /if \(!remembered \|\| !isValidMeetingLink\(remembered\)\) return;/.test(wizard));
  check("the applicant's card already opens a link that is not the built-in room", /const hasLegacyLink = !hasDailyRoom && !!interview\.meeting_link;/.test(await read("src/components/CandidateInterviewConfirmationCard.tsx")));
  check("…and so does the staff Interviews page", /s\.meetingProvider !== "daily" && s\.meetingLink/.test(interviews));
  check("a first conversation is half an hour unless changed", wizard.includes('const DEFAULT_DURATION = "30";') && !/setDuration\("(15|60)"\)/.test(wizard));

  const doc = await read("docs/INTERVIEWS.md");
  check("docs/INTERVIEWS.md explains the rule and names this test", doc.includes("scripts/interview_times.test.mjs") && doc.includes("src/lib/interviewTimes.ts") && /never a bare time/i.test(doc));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
