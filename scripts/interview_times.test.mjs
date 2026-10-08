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
  check("the applicant's card already opens a link that is not the built-in room", /const ownLink = !hasBuiltInRoom && interview\.meeting_link \? interview\.meeting_link : null;/.test(await read("src/components/CandidateInterviewConfirmationCard.tsx")));
  check("…and so does the staff Interviews page", /s\.meetingProvider !== "daily" && s\.meetingLink/.test(interviews));
  check("a first conversation is half an hour unless changed", wizard.includes('const DEFAULT_DURATION = "30";') && !/setDuration\("(15|60)"\)/.test(wizard));

  const doc = await read("docs/INTERVIEWS.md");
  check("docs/INTERVIEWS.md explains the rule and names this test", doc.includes("scripts/interview_times.test.mjs") && doc.includes("src/lib/interviewTimes.ts") && /never a bare time/i.test(doc));
}

console.log("\nTwo clocks on the wheel, and a suggestion from the job\n");
{
  // The owner, 2026-10-07, picking a time for someone twelve hours ahead:
  // "can you also make it so I can see the Philippine time as well next to
  // it ... since my job is posted in the Philippines ... And kind of also
  // show me a suggestion always in there, what would be good based on the
  // job. So like, you know, if they're used to it or not. Because it's got to
  // be good for me too."
  const S = await import(pathToFileURL(path.join(ROOT, "src/lib/interviewSuggestion.ts")).href);
  const POST =
    "This is a full-time job: 40 hours a week, 5 days a week, on one fixed shift: 3:00 AM to 11:00 AM Philippine time (3:00 PM to 11:00 PM US Eastern; 2:00 PM to 10:00 PM US Central).";
  const shift = S.shiftFromJobText(POST);
  check("the job post's shift is read, on the clock it is written for", show(shift) === show({ zone: "Asia/Manila", startMinutes: 180, endMinutes: 660 }), show(shift));
  check("the first clock in the post is the one (it leads with its applicants' own)", S.shiftFromJobText("Shift: 3:00 PM to 11:00 PM US Eastern (3:00 AM to 11:00 AM Philippine time)").zone === "America/New_York");
  check("short forms are read too", show(S.shiftFromJobText("Hours are 9am - 5pm EST, Monday to Friday.")) === show({ zone: "America/New_York", startMinutes: 540, endMinutes: 1020 }));
  check("an overnight shift ends before it starts", show(S.shiftFromJobText("You work 10:00 PM to 6:00 AM Philippine time.")) === show({ zone: "Asia/Manila", startMinutes: 1320, endMinutes: 360 }));
  check("hours with no clock named are not a shift we can place", S.shiftFromJobText("Open 9:00 AM to 5:00 PM daily.") === null && S.shiftFromJobText("Reply within 2 to 4 minutes, Eastern players first.") === null);
  check("nothing, or not text: no shift", S.shiftFromJobText("") === null && S.shiftFromJobText(null) === null && S.shiftFromJobText(7) === null && S.shiftFromJobText("13:00 PM to 99:00 AM Philippine time") === null);

  check("a job posted for one country is on that country's clock", S.zoneFromJob({ countryCode: "ph" }) === "Asia/Manila" && S.zoneFromJob({ countryCode: "IN", text: POST }) === "Asia/Kolkata");
  check("a remote job says it through the clock its post writes the shift on", S.zoneFromJob({ countryCode: null, text: POST }) === "Asia/Manila");
  check("a country with several clocks does not decide it", S.zoneFromJob({ countryCode: "US", text: POST }) === "Asia/Manila" && S.zoneFromJob({ countryCode: "US", text: "Remote." }) === null);
  check("a job that does not say: nothing is guessed", S.zoneFromJob({ countryCode: null, text: "Remote (worldwide)." }) === null && S.zoneFromJob(null) === null && S.zoneFromJob({}) === null);

  // Moments, so this passes on any machine's clock.
  const at = (iso) => new Date(iso);
  check("the minute of the day on their clock", S.minutesOfDayIn(at("2026-10-08T19:00:00Z"), "Asia/Manila") === 180 && S.minutesOfDayIn(at("2026-10-08T19:00:00Z"), "America/New_York") === 900 && Number.isNaN(S.minutesOfDayIn(at("2026-10-08T19:00:00Z"), "Mars/Olympus")));
  check("3:00 PM Eastern is 3:00 AM in Manila: inside the shift", S.insideShift(at("2026-10-08T19:00:00Z"), 30, shift) === true);
  check("half an hour before the shift is not", S.insideShift(at("2026-10-08T18:30:00Z"), 30, shift) === false);
  check("an interview has to END inside the shift", S.insideShift(at("2026-10-09T02:30:00Z"), 30, shift) === true && S.insideShift(at("2026-10-09T02:30:00Z"), 45, shift) === false && S.insideShift(at("2026-10-09T03:00:00Z"), 30, shift) === false);
  const night = { zone: "Asia/Manila", startMinutes: 1320, endMinutes: 360 };
  check("an overnight shift is one stretch across midnight", S.insideShift(at("2026-10-08T15:00:00Z"), 30, night) && S.insideShift(at("2026-10-08T16:30:00Z"), 30, night) && S.insideShift(at("2026-10-08T21:30:00Z"), 30, night) && !S.insideShift(at("2026-10-08T22:00:00Z"), 30, night) && !S.insideShift(at("2026-10-08T13:30:00Z"), 30, night));

  const fit = (iso, withShift = null) => S.slotFit(at(iso), 30, "Asia/Manila", withShift);
  check("with no shift it goes by their own clock: evening is good", fit("2026-10-08T13:00:00Z") === "good" && fit("2026-10-08T13:30:00Z") === "good");
  check("…10:00 PM is late, 2:00 AM is night, 6:30 AM is early, 7:00 AM is good again", fit("2026-10-08T14:00:00Z") === "late" && fit("2026-10-08T18:00:00Z") === "night" && fit("2026-10-08T22:30:00Z") === "early" && fit("2026-10-08T23:00:00Z") === "good");
  check("inside the job's shift wins over 'night': those are the hours they would work", fit("2026-10-08T19:00:00Z") === "night" && fit("2026-10-08T19:00:00Z", shift) === "shift");

  // The start times on offer are on THIS machine's clock, like the screen's.
  // So the shift and the applicant are put on this machine's clock too, and
  // the answer is the same wherever the test runs.
  const HERE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const DAY = new Date(2026, 9, 8);
  const SLOTS = ["09:00", "09:30", "10:00", "14:30", "15:00", "15:30", "19:30", "20:00"];
  const afternoons = { zone: HERE, startMinutes: 15 * 60, endMinutes: 23 * 60 };
  const byShift = S.suggestTimes(DAY, SLOTS, 30, HERE, afternoons);
  check("with a shift, the suggestion is the times inside it", byShift.kind === "shift" && byShift.slots.join() === "15:00,15:30,19:30,20:00" && show(byShift.spans) === show([{ from: "15:00", to: "20:00" }]), show(byShift));
  const said = S.suggestionWords(byShift, DAY, HERE, "Ana");
  check("…said on both clocks, with why", said.headline === "3:00 PM to 8:00 PM" && said.why === "That is 3:00 PM to 8:00 PM for Ana, inside this job's shift: you see them at the hours they would work.", show(said));
  const mornings = { zone: HERE, startMinutes: 6 * 60, endMinutes: 8 * 60 };
  const byWaking = S.suggestTimes(DAY, SLOTS, 30, HERE, mornings);
  check("a shift none of the day's times fall in: their waking hours instead", byWaking.kind === "waking" && byWaking.slots.length === SLOTS.length && byWaking.spans.length === 1);
  check("…said as waking hours for both", S.suggestionWords(byWaking, DAY, HERE, "Ana").why === "That is 9:00 AM to 8:00 PM for Ana: waking hours for you both.");
  const split = S.suggestTimes(DAY, ["09:00", "09:30", "10:00", "10:30"], 60, HERE, { zone: HERE, startMinutes: 9 * 60, endMinutes: 10 * 60 + 30 });
  check("times that are not next to each other on the list are separate stretches, joined by 'or'", show(S.suggestTimes(DAY, ["09:00", "12:00", "12:30", "20:00"], 30, HERE, { zone: HERE, startMinutes: 9 * 60, endMinutes: 9 * 60 + 30 }).spans) === show([{ from: "09:00", to: "09:00" }]) && split.slots.join() === "09:00,09:30");
  check("one time alone is said as one time", S.suggestionWords(S.suggestTimes(DAY, ["09:00", "12:00"], 30, HERE, { zone: HERE, startMinutes: 540, endMinutes: 570 }), DAY, HERE, "Ana").headline === "9:00 AM");
  const nothing = S.suggestTimes(DAY, SLOTS, 30, null, afternoons);
  check("their clock not known: nothing is suggested, and nothing is said", nothing.kind === "none" && nothing.slots.length === 0 && show(S.suggestionWords(nothing, DAY, null, "Ana")) === show({ headline: "", why: "" }));
  check("no time left on the day: nothing is suggested", S.suggestTimes(DAY, [], 30, HERE, afternoons).kind === "none");
  check("no name: still a sentence", S.suggestionWords(byShift, DAY, HERE, "").why.includes("for them, inside this job's shift"));
  check("no dash as punctuation, no leaked value, no odd space", [said, S.suggestionWords(byWaking, DAY, HERE, "Ana")].every((w) => !/[\u2013\u2014\u00a0\u202f]|undefined|null|NaN|Invalid/.test(`${w.headline} ${w.why}`)));
  check("a clock time as people say it", S.sayClock("15:00") === "3:00 PM" && S.sayClock("00:30") === "12:30 AM" && S.sayClock("12:00") === "12:00 PM" && S.sayClock("nope") === "");

  const wizard = await read("src/components/InterviewSchedulingWizard.tsx");
  const hints = await read("src/hooks/useJobInterviewHints.ts");
  check("the job's hints come through one plain lookup, the application's own job", /\.select\("jobs\(location_country_code, description, requirements, responsibilities\)"\)/.test(hints) && !/profiles/.test(hints));
  check("…which never throws: a failed lookup only means nothing is suggested", /if \(error \|\| !data\) return NOTHING;/.test(hints) && /\} catch \{\s*return NOTHING;\s*\}/.test(hints));
  check("the clock shown is the applicant's own, else the job's", /const shownZone = applicantZone \?\? jobHints\?\.zone \?\? null;/.test(wizard));
  check("…for the screen only: their email still goes by their own clock, never a guessed one", /const theirZone = applicantZone \?\? \(await fetchApplicantTimeZone\(applicationId\)\);/.test(wizard) && !/applicantEmailTime\([^)]*shownZone/.test(wizard) && !/theirZone = [^;]*jobHints/.test(wizard));
  check("…and the screen says so when the clock comes from the job post", /own time zone is not on file\. This job is posted on \{zonePlace\(shownZone\)\} time/.test(wizard) && /Their email\s+gives the time on your clock and names your time zone\./.test(wizard));
  check("every time on the wheel carries theirs beside it", /const theirs = showTheirClock \? theirTime\(combineDayAndTime\(viewDay, slot\.value\)\) : null;/.test(wizard) && /data-their-time/.test(wizard) && /data-testid="wheel-clocks"/.test(wizard));
  check("the suggestion is read from the one place, for the day in view", /suggestTimes\(viewDay, daySlots\.map\(\(slot\) => slot\.value\), durationMinutes, shownZone, jobHints\?\.shift \?\? null\)/.test(wizard) && /data-testid=\{showSuggestion \? "time-suggestion" : undefined\}/.test(wizard));
  check("the wheel starts on the first suggested time, until the owner moves it himself", /if \(wheelMovedByHand\.current\) return;\s*const top = Math\.max\(0, firstSuggestedIndex\) \* WHEEL_ROW_HEIGHT;/.test(wizard) && /onPointerDown=\{markWheelMoved\}/.test(wizard));
  // On a phone every button has a 44px floor; a row taller than the wheel
  // counts on put the lit row and the button a row apart, further down.
  check("a wheel row is exactly the height the wheel counts on, on a phone too", /height: WHEEL_ROW_HEIGHT,[\s\S]{0,700}minHeight: WHEEL_ROW_HEIGHT,\s*scrollSnapAlign: "center",/.test(wizard));
  check("coming back to the step, the wheel is put where it was", /if \(currentStep === 0 && wheelRef\.current\) wheelRef\.current\.scrollTop = wheelScrollTop;/.test(wizard));
  check("Cancel and Back are a soft pill, not the stock outline (a black slab at night)", /className="hf-pill hf-pill--tonal"\s*onClick=\{currentStep === 0 \? \(\) => onOpenChange\(false\) : handleBack\}/.test(wizard));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
