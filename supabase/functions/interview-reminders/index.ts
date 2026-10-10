// interview-reminders: emails an applicant the day before and an hour before
// their interview (docs/INTERVIEWS.md, "Reminders").
//
// Called every five minutes by the database's own scheduler (pg_cron, the
// `interview-reminders` job), never by a browser. It carries a secret only
// the scheduler and this function hold (INTERVIEW_REMINDERS_SECRET); without
// it the answer is 401 and nothing is read.
//
// Each look: find the booked interviews in the next day, decide which
// reminder each is due (_shared/interviewReminders.ts), and for each one
// CLAIM it first (set its sent-at only where it is still empty). Two looks
// that overlap cannot both claim the same reminder, so nobody is emailed
// twice. If the email then cannot be sent, the claim is given back, and the
// next look tries again while the reminder is still worth sending.
//
// The answer is counts only: no name, address or time leaves in it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import { REMINDER_LOOKAHEAD_MINUTES, dayWord, reminderColumn, reminderDue, reminderEmail, type ReminderKind } from "../_shared/interviewReminders.ts";
import { applicantEmailTime, applicantTimeZone, knownTimeZone } from "../_shared/interviewTimes.ts";
import { interviewKindPhrase, joinNoteFor, lengthWords, teamZoneOf } from "../_shared/interviewAnswer.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Compared in full, so the time it takes says nothing about where they differ. */
function sameSecret(given: string, held: string): boolean {
  if (!given || !held || given.length !== held.length) return false;
  let diff = 0;
  for (let i = 0; i < held.length; i += 1) diff |= given.charCodeAt(i) ^ held.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const held = Deno.env.get("INTERVIEW_REMINDERS_SECRET") ?? "";
  if (held.length < 32 || !sameSecret(req.headers.get("x-reminders-secret") ?? "", held)) return json({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const now = new Date();
  const until = new Date(now.getTime() + REMINDER_LOOKAHEAD_MINUTES * 60_000);

  const { data: interviews, error } = await admin
    .from("interviews")
    .select("id, application_id, status, candidate_response, scheduled_at, updated_at, duration_minutes, interview_type, meeting_provider, meeting_link, employer_windows, reminder_day_sent_at, reminder_hour_sent_at")
    .eq("status", "scheduled")
    .eq("candidate_response", "confirmed")
    .gt("scheduled_at", now.toISOString())
    .lte("scheduled_at", until.toISOString())
    .limit(200);
  if (error) {
    console.error("[interview-reminders] could not read interviews:", error.message);
    return json({ error: "read_failed" }, 500);
  }

  const counts = { looked: interviews?.length ?? 0, sent: 0, skipped: 0, failed: 0 };
  for (const interview of interviews ?? []) {
    const kind: ReminderKind | null = reminderDue(interview, now);
    if (!kind) continue;
    const column = reminderColumn(kind);

    // Claim it: only one look can turn an empty sent-at into a time.
    const { data: claimed, error: claimError } = await admin.from("interviews").update({ [column]: now.toISOString() }).eq("id", interview.id).is(column, null).eq("status", "scheduled").select("id");
    if (claimError || !claimed || claimed.length === 0) {
      counts.skipped += 1;
      continue;
    }
    const giveBack = async () => {
      await admin.from("interviews").update({ [column]: null }).eq("id", interview.id);
    };

    try {
      const { data: application } = await admin.from("applications").select("id, candidate_id, job_id, notes").eq("id", interview.application_id).maybeSingle();
      const { data: job } = application?.job_id ? await admin.from("jobs").select("title, employer_id").eq("id", application.job_id).maybeSingle() : { data: null };
      const { data: employer } = job?.employer_id ? await admin.from("profiles").select("company_name").eq("user_id", job.employer_id).maybeSingle() : { data: null };
      const start = new Date(String(interview.scheduled_at));
      const theirZone = applicantTimeZone(application?.notes);
      const teamZone = teamZoneOf(interview.employer_windows) ?? "UTC";
      const written = applicantEmailTime(start, theirZone, teamZone);
      // The same clock the time is written on: theirs when on file, else the team's.
      const clock = knownTimeZone(theirZone) ?? knownTimeZone(teamZone) ?? "UTC";
      const email = reminderEmail({
        kind,
        candidateId: application?.candidate_id as string | null | undefined,
        jobTitle: (job?.title as string | undefined) ?? "your application",
        companyName: employer?.company_name as string | null | undefined,
        applicationId: application?.id as string | null | undefined,
        applicantTime: { date: written.date, time: written.time },
        length: lengthWords(interview.duration_minutes),
        joinNote: joinNoteFor(interview),
        interviewKind: interviewKindPhrase(interview.interview_type),
        dayWord: dayWord(start, now, clock),
      });
      if (!email) {
        // Nobody to write to: leave it claimed, so it is not looked at again every five minutes.
        counts.skipped += 1;
        continue;
      }
      const { data: answer, error: sendError } = await admin.functions.invoke("send-notification-email", { body: email });
      const refused = !!sendError || (answer && typeof answer === "object" && "error" in (answer as Record<string, unknown>));
      if (refused) {
        await giveBack();
        counts.failed += 1;
        console.error(`[interview-reminders] ${kind} reminder not sent for interview ${interview.id}`);
      } else {
        counts.sent += 1;
        console.log(`[interview-reminders] ${kind} reminder asked for interview ${interview.id}`);
      }
    } catch (thrown) {
      await giveBack();
      counts.failed += 1;
      console.error(`[interview-reminders] ${kind} reminder failed for interview ${interview.id}:`, thrown instanceof Error ? thrown.message : "unknown");
    }
  }
  return json({ ok: true, ...counts });
});
