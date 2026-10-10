#!/usr/bin/env node
/**
 * Interview reminders (docs/INTERVIEWS.md, "Reminders"): the rule for when
 * each is due (supabase/functions/_shared/interviewReminders.ts), the email
 * each one asks for, and how the sender and the schedule are wired.
 *
 * The owner, 2026-10-09, after his first week of interviews (one no-show,
 * nobody reminded on either side): an email to the applicant the day before
 * and an hour before. The database half (the "already sent" columns and who
 * may write them) is scripts/interview_reminders.pglite.test.mjs.
 *
 * Run with: node scripts/interview_reminders.test.mjs
 */
import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

// Decoded, so a checkout whose path has a space in it works too.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R = await import(pathToFileURL(path.join(ROOT, "supabase/functions/_shared/interviewReminders.ts")).href);
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

const NOW = new Date("2026-10-10T12:00:00Z");
const minutes = (m) => new Date(NOW.getTime() + m * 60_000).toISOString();
const booked = (startIn, extra = {}) => ({
  status: "scheduled",
  candidate_response: "confirmed",
  scheduled_at: minutes(startIn),
  updated_at: minutes(-24 * 60),
  reminder_day_sent_at: null,
  reminder_hour_sent_at: null,
  ...extra,
});
const due = (interview) => R.reminderDue(interview, NOW);

console.log("\nWhen each reminder is due");
check("the day before: 23 hours ahead", due(booked(23 * 60)) === "day");
check("…up to 24 hours ahead, and not a minute earlier", due(booked(24 * 60)) === "day" && due(booked(24 * 60 + 1)) === null);
check("…and no later than 22 hours ahead (a 'tomorrow' email at 21 hours is too late to be the day-before one)", due(booked(22 * 60 + 1)) === "day" && due(booked(22 * 60)) === null && due(booked(21 * 60)) === null);
check("an hour before: 45 minutes ahead", due(booked(45)) === "hour");
check("…from 60 minutes ahead", due(booked(60)) === "hour" && due(booked(61)) === null);
check("…and never as the call starts (10 minutes or less: none)", due(booked(11)) === "hour" && due(booked(10)) === null && due(booked(2)) === null);
check("between the two (5 hours ahead): nothing", due(booked(5 * 60)) === null);
check("a time already passed: nothing", due(booked(-5)) === null);

console.log("\nOnly once each, and only for an agreed time");
check("the day one already sent: not again", due(booked(23 * 60, { reminder_day_sent_at: minutes(-30) })) === null);
check("the hour one already sent: not again", due(booked(45, { reminder_hour_sent_at: minutes(-5) })) === null);
check("the day one sent does not stop the hour one", due(booked(45, { reminder_day_sent_at: minutes(-23 * 60) })) === "hour");
check("an offered time nobody booked: nothing", due(booked(45, { candidate_response: "pending" })) === null);
check("a time the applicant said they cannot make: nothing", due(booked(45, { candidate_response: "reschedule_requested" })) === null && due(booked(45, { candidate_response: "declined" })) === null);
check("a cancelled or finished interview: nothing", due(booked(45, { status: "cancelled" })) === null && due(booked(45, { status: "completed" })) === null);
check("no time, or a time that is not a time: nothing", due(booked(45, { scheduled_at: null })) === null && due(booked(45, { scheduled_at: "soon" })) === null);

console.log("\nNot straight after a booking");
check("booked 50 minutes ahead, 5 minutes ago: no reminder yet (they have just had 'confirmed')", due(booked(50, { updated_at: minutes(-5) })) === null);
check("…once it has been left alone for half an hour, it goes", due(booked(20, { updated_at: minutes(-30) })) === "hour");
check("the wait is 30 minutes", R.REMINDER_QUIET_MINUTES === 30);
check("the sender looks far enough ahead to find a day-before one", R.REMINDER_LOOKAHEAD_MINUTES > R.REMINDER_WINDOWS.day.to);

console.log("\nThe email it asks for");
const email = R.reminderEmail({
  kind: "hour",
  candidateId: "c-1",
  jobTitle: "Chat Support Agent",
  companyName: "  Zulu Support  ",
  applicationId: "a-1",
  applicantTime: { date: "Saturday, October 10", time: "9:00 AM Philippine time" },
  length: "30 minutes",
  joinNote: "This is a video call.",
  interviewKind: "video call",
});
check("an interview_reminder to the applicant", email?.type === "interview_reminder" && email.recipient_user_id === "c-1");
check("says which reminder it is", email?.data.reminder === "hour");
check("carries the time on the applicant's own clock", email?.data.interview_date === "Saturday, October 10" && email?.data.interview_time === "9:00 AM Philippine time");
check("…how long, how to join, the company trimmed, and their application", email?.data.interview_length === "30 minutes" && email?.data.join_note === "This is a video call." && email?.data.company_name === "Zulu Support" && email?.data.application_id === "a-1");
const bare = R.reminderEmail({ kind: "day", candidateId: "c-1", jobTitle: "J", companyName: null, applicationId: null, applicantTime: { date: "d", time: "t" }, length: "", joinNote: "", interviewKind: "" });
check("leaves out what it does not know, rather than sending it empty", bare && !("interview_length" in bare.data) && !("join_note" in bare.data) && !("company_name" in bare.data) && !("application_id" in bare.data));
check("nobody to send it to, or no time to say: no email", R.reminderEmail({ kind: "day", candidateId: null, jobTitle: "J", companyName: null, applicationId: null, applicantTime: { date: "d", time: "t" }, length: "", joinNote: "", interviewKind: "" }) === null && R.reminderEmail({ kind: "day", candidateId: "c", jobTitle: "J", companyName: null, applicationId: null, applicantTime: { date: "", time: "" }, length: "", joinNote: "", interviewKind: "" }) === null);
check("each reminder has its own 'sent' column", R.reminderColumn("day") === "reminder_day_sent_at" && R.reminderColumn("hour") === "reminder_hour_sent_at");

console.log("\n'Today' or 'tomorrow', on the applicant's own clock");
{
  const at = (iso) => new Date(iso);
  // 9:00 AM Saturday in Manila is 9:00 PM Friday in New York.
  const start = at("2026-10-10T01:00:00Z");
  const sent = at("2026-10-09T02:00:00Z"); // 23 hours ahead: 10:00 AM Friday in Manila, 10:00 PM Thursday in New York
  check("Manila: sent Friday morning for Saturday morning, 'tomorrow'", R.dayWord(start, sent, "Asia/Manila") === "tomorrow");
  check("…the same instant on New York's clock is also a day ahead (Thursday night for Friday night)", R.dayWord(start, sent, "America/New_York") === "tomorrow");
  // An 11:30 PM interview is reminded at about 12:30 AM the same day.
  const late = at("2026-10-10T15:30:00Z"); // 11:30 PM Saturday, Manila
  const earlyThatDay = at("2026-10-09T16:30:00Z"); // 12:30 AM Saturday, Manila
  check("an 11:30 PM interview reminded at 12:30 AM that day says 'today', never 'tomorrow'", R.dayWord(late, earlyThatDay, "Asia/Manila") === "today");
  check("…while on a clock where it is still the evening before, 'tomorrow'", R.dayWord(late, earlyThatDay, "America/New_York") === "tomorrow");
  check("two days away: neither word", R.dayWord(at("2026-10-12T01:00:00Z"), sent, "Asia/Manila") === null);
  check("across a daylight-saving change (New York, November 1), still 'tomorrow'", R.dayWord(at("2026-11-01T22:00:00Z"), at("2026-10-31T23:00:00Z"), "America/New_York") === "tomorrow");
  check("a zone that cannot be read: neither word", R.dayWord(start, sent, "Not/AZone") === null);
  const withWord = R.reminderEmail({ kind: "day", candidateId: "c", jobTitle: "J", companyName: null, applicationId: null, applicantTime: { date: "d", time: "t" }, length: "", joinNote: "", interviewKind: "", dayWord: "today" });
  check("the day-before email carries the word", withWord?.data.day_word === "today");
  const hourWithWord = R.reminderEmail({ kind: "hour", candidateId: "c", jobTitle: "J", companyName: null, applicationId: null, applicantTime: { date: "d", time: "t" }, length: "", joinNote: "", interviewKind: "", dayWord: "today" });
  check("…the hour-before one does not need it", hourWithWord && !("day_word" in hourWithWord.data));
}

console.log("\nThe email's words");
const send = await read("supabase/functions/send-notification-email/index.ts");
// To the next template (document_sent, an offer letter or a document to
// sign since 2026-10-10, so its key is no longer followed by "{").
const template = send.slice(send.indexOf("interview_reminder: (() => {"), send.indexOf("\n    document_sent:"));
check("the hour one says so, in the subject and the heading", /soon \? `Your interview starts in about an hour: \$\{data\.job_title\}`/.test(template) && /soon \? "Your interview starts in about an hour"/.test(template));
check("the day one says today or tomorrow as sent, and 'coming up' rather than a guess", /const when = data\.day_word === "today" \|\| data\.day_word === "tomorrow" \? data\.day_word : "coming up";/.test(template) && /`Reminder: your interview is \$\{when\}: \$\{data\.job_title\}`/.test(template) && /`Your interview is \$\{when\}`/.test(template) && !/is tomorrow/.test(template));
check("the sender works the word out on the same clock the time is written on", /const clock = knownTimeZone\(theirZone\) \?\? knownTimeZone\(teamZone\) \?\? "UTC";/.test(await read("supabase/functions/interview-reminders/index.ts")) && /dayWord: dayWord\(start, now, clock\)/.test(await read("supabase/functions/interview-reminders/index.ts")));
check("every value from the request is escaped", !/\$\{data\.(?!job_title\}`|application_id|reminder|interview_length \?|join_note \?)[a-z_]+\}/.test(template.replace(/esc\(data\.[a-z_]+\)/g, "")));
check("points to 'Can't make it?', never to a reply (the no-reply box under every applicant email points to Messages)", /choose "Can't make it\?"/.test(template) && !/reply/i.test(template) && /isCandidateEmail\(type, recipientRole\)/.test(send));
check("the button opens their own application", /"Open my application"/.test(template) && /`\/applications\/\$\{data\.application_id\}`/.test(template));
check("only the system may send it", /interview_reminder: \{ who: "service" \}/.test(await read("supabase/functions/_shared/notificationAccess.ts")));
check("an applicant who turned interview emails off is not sent it", /interview_reminder: "email_interview_reminders"/.test(send));

console.log("\nThe sender");
const fn = await read("supabase/functions/interview-reminders/index.ts");
check("refuses anyone without the secret, before reading any interview", fn.indexOf('json({ error: "unauthorized" }, 401)') > 0 && fn.lastIndexOf('json({ error: "unauthorized" }, 401)') < fn.indexOf('.from("interviews")'));
check("…a secret shorter than 32 characters counts as none, without asking the database", /given\.length < 32/.test(fn) && fn.indexOf("given.length < 32") < fn.indexOf("admin.rpc("));
check("…and the database says whether it matches (the secret lives only in Vault)", /admin\.rpc\("interview_reminders_secret_matches", \{ p_given: given \}\)/.test(fn) && /if \(secretError \|\| matches !== true\) return json\(\{ error: "unauthorized" \}, 401\);/.test(fn) && !/Deno\.env\.get\("INTERVIEW_REMINDERS_SECRET"\)/.test(fn));
check("claims a reminder before sending it: only where its sent-at is still empty", /\.update\(\{ \[column\]: now\.toISOString\(\) \}\)\.eq\("id", interview\.id\)\.is\(column, null\)/.test(fn));
check("gives the claim back when the email could not be sent", (fn.match(/await giveBack\(\);/g) ?? []).length === 2);
check("answers with counts only", /return json\(\{ ok: true, \.\.\.counts \}\);/.test(fn));
check("imports pinned", /esm\.sh\/@supabase\/supabase-js@2\.117\.2"/.test(fn));

console.log("\nNever a time that has passed: the screens");
{
  const T = await import(pathToFileURL(path.join(ROOT, "src/lib/interviewTimes.ts")).href);
  const now = new Date("2026-10-10T12:00:00Z");
  check("a time a minute ahead can be set", T.timeStillAhead(new Date("2026-10-10T12:01:00Z"), now));
  check("now, a minute ago, nothing, or not a time: cannot", !T.timeStillAhead(now, now) && !T.timeStillAhead("2026-10-10T11:59:00Z", now) && !T.timeStillAhead(null, now) && !T.timeStillAhead("soon", now));
  check("the database's refusal is recognised", T.isPassedTimeError({ message: "interview_time_passed: That time has already passed. Choose a later one." }) && !T.isPassedTimeError({ message: "permission denied" }) && !T.isPassedTimeError(null));
  for (const [name, file, count] of [
    ["the scheduling wizard", "src/components/InterviewSchedulingWizard.tsx", 1],
    ["changing a time", "src/components/RescheduleInterviewDialog.tsx", 1],
    ["accepting a time they suggested, or setting a new one", "src/components/EmployerRescheduleReviewDialog.tsx", 2],
  ]) {
    const text = await read(file);
    check(`${name}: checks before saving and says the passed time plainly when refused`, (text.match(/!timeStillAhead\(|!newStartAhead/g) ?? []).length >= count && (text.match(/isPassedTimeError\(error\) \? PASSED_TIME_WORDS/g) ?? []).length >= count);
  }
}

console.log("\nThe schedule");
const config = await read("supabase/config.toml");
check("the function takes no JWT (pg_net has none); its own secret guards it", /\[functions\.interview-reminders\][^[]*verify_jwt = false/.test(config));
const migrations = await readdir(path.join(ROOT, "supabase/migrations"));
const scheduleFile = migrations.find((n) => /_interview_reminders_schedule\.sql$/.test(n));
const schedule = scheduleFile ? await read(`supabase/migrations/${scheduleFile}`) : "";
check("every five minutes", /cron\.schedule\(\s*'interview-reminders',\s*'\*\/5 \* \* \* \*'/.test(schedule));
check("the secret is read from Vault when each look runs, never written in the file", /vault\.decrypted_secrets WHERE name = 'interview_reminders_secret'/.test(schedule) && !/x-reminders-secret', '[^']{8,}'/.test(schedule));
check("…made inside the database on the first run, 32 random bytes, and kept on a re-run", /IF NOT EXISTS \(SELECT 1 FROM vault\.secrets WHERE name = 'interview_reminders_secret'\)/.test(schedule) && /encode\(extensions\.gen_random_bytes\(32\), 'hex'\)/.test(schedule));
check("…and only the service role may ask whether a secret matches", /REVOKE ALL ON FUNCTION public\.interview_reminders_secret_matches\(text\) FROM anon, authenticated;/.test(schedule) && /GRANT EXECUTE ON FUNCTION public\.interview_reminders_secret_matches\(text\) TO service_role;/.test(schedule) && /length\(p_given\) >= 32/.test(schedule));
check("…to this project's own address", /https:\/\/yqklrkpptnhubsnijqze\.supabase\.co\/functions\/v1\/interview-reminders/.test(schedule));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
