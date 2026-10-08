import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import {
  agreedTimeEmails,
  availabilityToStore,
  bookingSearchSpan,
  cleanAvailability,
  cleanNote,
  cleanSuggestedTimes,
  clockForTeam,
  knownZone,
  noTimeAgreedYet,
  sayTimeForTeam,
  suggestionToStore,
  takenWindowStarts,
  teamNoticeFor,
  teamZoneOf,
  type AgreedChange,
} from "../_shared/interviewAnswer.ts";
import { applicantEmailTime, applicantTimeZone, clockGapWords } from "../_shared/interviewTimes.ts";

/**
 * An applicant's answer about an interview with the hiring team: confirm the
 * time that was set, pick one of the times offered, swap to another offered
 * time, or say they cannot make it and write when they are free
 * (docs/INTERVIEWS.md, "What the applicant sees"). The applicant's browser
 * may only read the interviews table; every answer is written here, after
 * checking it is theirs.
 *
 * "I can't make it" carries their availability in words, not times: the
 * owner sets the new time himself (2026-10-07: "don't let them just select
 * times. Let them write a message ... and then I get to schedule it"). A
 * list of times is still read from a page left open since before that.
 *
 * What the team is told states the time on the team's own clock when the
 * wizard recorded it (employer_windows[].zone), otherwise on the applicant's
 * clock and says so. Never a bare time: until 2026-10-07 it was the server's
 * clock (UTC) with no zone, four hours off for the owner.
 *
 * One time, one applicant: an offered time that another applicant of the
 * same team has already booked is refused ("slot_taken"), and "open_slots"
 * tells the page which ones those are so it never shows them. Before
 * 2026-10-07 nothing checked, and the same times offered to several people
 * could be booked by more than one of them.
 *
 * When a time becomes agreed (a pick, a swap, a confirm) both sides are also
 * emailed: the applicant their confirmation, on their own clock, and the
 * team a notice on theirs. The emails never hold up or fail the answer.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** The applicant's own time zone, as their browser names it. Only ever used to word a time. */
interface WithZone {
  timeZone?: string;
}

interface ConfirmPayload extends WithZone {
  action: "confirm";
  interviewId: string;
}

interface ReschedulePayload extends WithZone {
  action: "reschedule_requested";
  interviewId: string;
  /** When they are free, in their own words. What the page sends now. */
  availability?: string;
  /** Times of their own: only from a page left open since before 2026-10-07. */
  proposedTimes?: { datetime: string }[];
  candidateNote?: string;
}

interface PickSlotPayload extends WithZone {
  action: "pick_slot";
  interviewId: string;
  slotStart: string;
}

interface RepickSlotPayload extends WithZone {
  action: "repick_slot";
  interviewId: string;
  slotStart: string;
}

/** Asks only: which of the offered times are no longer free? Writes nothing. */
interface OpenSlotsPayload extends WithZone {
  action: "open_slots";
  interviewId: string;
}

type RequestPayload = ConfirmPayload | ReschedulePayload | PickSlotPayload | RepickSlotPayload | OpenSlotsPayload;

interface EmployerWindow {
  start: string;
  durationMinutes?: number;
}

/**
 * The offered times that another applicant of the same hiring team has
 * already booked. Two plain look-ups (the interviews near those times, then
 * whose jobs they belong to). Never throws: when it cannot look, it reports
 * nothing as taken, so a database hiccup never blocks an applicant from
 * booking (it only means the check is skipped that once).
 */
// deno-lint-ignore no-explicit-any
async function takenStartsFor(admin: any, interviewId: string, employerId: string | undefined, windows: unknown): Promise<string[]> {
  try {
    const span = bookingSearchSpan(windows);
    if (!span || !employerId) return [];
    const { data: near, error } = await admin
      .from("interviews")
      .select("id, application_id, scheduled_at, duration_minutes")
      .eq("status", "scheduled")
      .eq("candidate_response", "confirmed")
      .neq("id", interviewId)
      .gte("scheduled_at", span.from)
      .lte("scheduled_at", span.to)
      .limit(200);
    if (error || !Array.isArray(near) || near.length === 0) return [];
    const applicationIds = [...new Set(near.map((row: { application_id: string }) => row.application_id))];
    const { data: owners, error: ownersError } = await admin
      .from("applications")
      .select("id, jobs(employer_id)")
      .in("id", applicationIds);
    if (ownersError || !Array.isArray(owners)) return [];
    const sameTeam = new Set(
      owners
        .filter((row: { jobs: unknown }) => {
          const job = (Array.isArray(row.jobs) ? row.jobs[0] : row.jobs) as { employer_id?: string } | null;
          return job?.employer_id === employerId;
        })
        .map((row: { id: string }) => row.id),
    );
    return takenWindowStarts(
      windows,
      near.filter((row: { application_id: string }) => sameTeam.has(row.application_id)),
    );
  } catch (lookupError) {
    console.error("Could not look up booked times:", lookupError);
    return [];
  }
}

/**
 * Runs `task` after the answer has been sent (EdgeRuntime.waitUntil keeps the
 * worker alive for it); where the runtime has no such thing it simply runs.
 * Never throws.
 */
function afterResponse(task: Promise<unknown>): void {
  const guarded = task.catch((error) => {
    console.error("Failed to email the agreed time:", error);
  });
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime && typeof runtime.waitUntil === "function") runtime.waitUntil(guarded);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get the auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create client with user's token to get user info
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: RequestPayload = await req.json();
    console.log("Received answer:", { action: payload?.action, interviewId: payload?.interviewId });

    // Create service client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the interview and verify ownership
    const { data: interview, error: fetchError } = await supabaseAdmin
      .from("interviews")
      .select(`
        id,
        application_id,
        scheduled_at,
        duration_minutes,
        candidate_response,
        employer_windows,
        proposed_times,
        status,
        interview_type,
        meeting_link,
        meeting_provider,
        applications(
          id,
          candidate_id,
          notes,
          jobs(id, employer_id, title)
        )
      `)
      .eq("id", payload.interviewId)
      .single();

    if (fetchError || !interview) {
      console.error("Interview fetch error:", fetchError);
      return new Response(JSON.stringify({ error: "Interview not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user is the candidate for this interview. Without a Database
    // generic on createClient(), postgrest-js's select-string parser can't
    // see that applications->interviews is one-to-one, so it infers
    // `applications` as an array — it's actually always a single row (each
    // interview has exactly one application_id). Cast to the real shape
    // instead of `any` so the rest of this function stays checked.
    const application = interview.applications as unknown as {
      id: string;
      candidate_id: string;
      /** Read only for the applicant's own time zone, when their browser did not send one. */
      notes: unknown;
      jobs: { id: string; employer_id: string; title: string } | null;
    } | null;
    if (application?.candidate_id !== user.id) {
      console.error("Permission denied: user is not the candidate");
      return new Response(JSON.stringify({ error: "You are not authorized to modify this interview" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A cancelled (or otherwise inactive) interview is never revivable by the candidate.
    if (interview.status !== "scheduled") {
      return new Response(JSON.stringify({ error: "interview_not_active" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const employerId = application?.jobs?.employer_id;
    const jobTitle = application?.jobs?.title || "Position";

    // Only asking which offered times are still free: answer, and write nothing.
    if (payload.action === "open_slots") {
      const taken = await takenStartsFor(supabaseAdmin, interview.id as string, employerId, interview.employer_windows);
      return new Response(JSON.stringify({ success: true, taken }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get candidate name
    const { data: candidateProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", user.id)
      .single();

    const candidateName = candidateProfile?.full_name || candidateProfile?.email || "Candidate";

    let updateData: {
      candidate_response?: string;
      proposed_times?: { datetime?: string; fromOffer?: true }[] | null;
      candidate_note?: string | null;
      scheduled_at?: string;
      duration_minutes?: number;
    } = {};
    let notificationTitle = "";
    let notificationMessage = "";
    // Where the team's bell opens: the applicant, or the Interviews page when there is something to answer.
    let notificationLink = `/applicants/${application.id}`;
    // The times the applicant suggested, as kept (reschedule_requested from an old page only).
    let suggested: { datetime: string }[] = [];
    let suggestedNote: string | null = null;
    // When they are free, in their own words (reschedule_requested), and how far their clock is from the team's.
    let availability: string | null = null;
    let clockGap = "";
    let cannotMakeWhen = "";
    // Set when this answer makes a time agreed: both sides are then emailed.
    let agreed: { change: AgreedChange; at: string; minutes: number | null } | null = null;

    // Whose clock the team reads a time on, and the words for it.
    const clock = clockForTeam(interview.employer_windows, payload.timeZone);
    const who = { name: candidateName, jobTitle };

    if (payload.action === "confirm") {
      // Offered times are not an appointment: there is nothing to confirm
      // until one is picked. (The row's scheduled_at is only a placeholder.)
      if (noTimeAgreedYet(interview.candidate_response, interview.proposed_times)) {
        return new Response(JSON.stringify({ error: "pick_a_time_first" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      updateData = {
        candidate_response: "confirmed",
      };
      const notice = teamNoticeFor("confirmed", who, {
        when: interview.scheduled_at ? sayTimeForTeam(interview.scheduled_at as string, clock) : undefined,
      });
      notificationTitle = notice.title;
      notificationMessage = notice.message;
      // Confirming twice is not news: only the first time is emailed.
      if (interview.scheduled_at && interview.candidate_response !== "confirmed") {
        agreed = { change: "confirmed", at: interview.scheduled_at as string, minutes: (interview.duration_minutes as number | null) ?? null };
      }
    } else if (payload.action === "reschedule_requested") {
      availability = cleanAvailability(payload.availability);
      suggested = availability ? [] : cleanSuggestedTimes(payload.proposedTimes, Date.now());
      if (!availability && suggested.length === 0) {
        return new Response(JSON.stringify({ error: "no_availability" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // No time agreed yet (they are answering an offer): marked, so the
      // team's answer never treats the placeholder as an "original time".
      const fromOffer = noTimeAgreedYet(interview.candidate_response, interview.proposed_times);
      if (availability) {
        // Their availability in words. No times are kept: the team sets one.
        updateData = {
          candidate_response: "reschedule_requested",
          proposed_times: availabilityToStore(fromOffer),
          candidate_note: availability,
        };
        // How far their clock is from the team's, so "9 to 2" is read right.
        const theirZone = knownZone(payload.timeZone) ?? applicantTimeZone(application?.notes);
        const teamZone = teamZoneOf(interview.employer_windows);
        if (theirZone && teamZone) clockGap = clockGapWords(new Date(), theirZone, teamZone).replace(/ you$/, " yours");
        // The one time on the table; several offered times are "the times you offered".
        const offeredCount = Array.isArray(interview.employer_windows) ? interview.employer_windows.length : 0;
        cannotMakeWhen = fromOffer && offeredCount > 1
          ? "the times you offered"
          : interview.scheduled_at ? sayTimeForTeam(interview.scheduled_at as string, clock) : "";
        const notice = teamNoticeFor("availability", who, { when: cannotMakeWhen, availability, clockGap });
        notificationTitle = notice.title;
        notificationMessage = notice.message;
      } else {
        suggestedNote = cleanNote(payload.candidateNote);
        updateData = {
          candidate_response: "reschedule_requested",
          proposed_times: suggestionToStore(suggested, fromOffer),
          candidate_note: suggestedNote,
        };
        const notice = teamNoticeFor(fromOffer ? "countered" : "suggested", who, { count: suggested.length });
        notificationTitle = notice.title;
        notificationMessage = notice.message;
      }
      notificationLink = "/interviews";
    } else if (payload.action === "pick_slot" || payload.action === "repick_slot") {
      const windows: EmployerWindow[] = Array.isArray(interview.employer_windows)
        ? (interview.employer_windows as EmployerWindow[])
        : [];

      const matchedWindow = windows.find((w) => w?.start === payload.slotStart);
      if (!matchedWindow) {
        return new Response(JSON.stringify({ error: "That time is no longer offered. Please choose one of the current windows." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Postgres re-serializes timestamptz with a "+00:00" suffix while
      // employer_windows keeps the original JS "...Z" strings — always
      // compare as epoch millis, never as raw strings.
      const matchedStartMs = new Date(matchedWindow.start).getTime();
      if (!(matchedStartMs > Date.now())) {
        return new Response(JSON.stringify({ error: "slot_in_past" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Guards depend on the interview's STATE, not which action name the
      // client sent — pick_slot and repick_slot are otherwise identical.
      const isAlreadyConfirmed = interview.candidate_response === "confirmed";
      const currentScheduledAtMs = interview.scheduled_at
        ? new Date(interview.scheduled_at as string).getTime()
        : NaN;
      const isSameSlot = isAlreadyConfirmed && matchedStartMs === currentScheduledAtMs;

      if (isSameSlot) {
        // Picking the slot the candidate is already confirmed on is a no-op
        // success — not a "moved their interview" event for the employer.
        return new Response(JSON.stringify({
          success: true,
          interview: {
            id: interview.id,
            application_id: interview.application_id,
            scheduled_at: interview.scheduled_at,
            duration_minutes: interview.duration_minutes,
            candidate_response: interview.candidate_response,
            employer_windows: interview.employer_windows,
            status: interview.status,
          },
          proposedTimesCount: 0,
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // One time, one applicant: first to book gets it. Answered 200 with
      // success false so the page can read why and which times are gone.
      const taken = await takenStartsFor(supabaseAdmin, interview.id as string, employerId, interview.employer_windows);
      if (taken.includes(matchedWindow.start)) {
        return new Response(JSON.stringify({ success: false, error: "slot_taken", taken }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (isAlreadyConfirmed) {
        // Moving off a confirmed slot to a genuinely different one: repick
        // rules apply regardless of which action name was sent.
        if (windows.length <= 1) {
          return new Response(JSON.stringify({ error: "No alternative times are available for this interview." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const twelveHoursMs = 12 * 60 * 60 * 1000;
        if (Date.now() >= currentScheduledAtMs - twelveHoursMs) {
          return new Response(JSON.stringify({ error: "It's too close to the scheduled time to move this interview. Please contact the employer directly." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      // else: first pick (candidate_response is "awaiting_pick" or similar) — no 12h rule.

      const duration = matchedWindow.durationMinutes || interview.duration_minutes || 60;
      updateData = {
        scheduled_at: payload.slotStart,
        duration_minutes: duration,
        candidate_response: "confirmed",
        proposed_times: null,
        candidate_note: null,
      };

      const notice = teamNoticeFor(isAlreadyConfirmed ? "moved" : "picked", who, {
        when: sayTimeForTeam(matchedWindow.start, clock),
      });
      notificationTitle = notice.title;
      notificationMessage = notice.message;
      agreed = { change: isAlreadyConfirmed ? "moved" : "picked", at: matchedWindow.start, minutes: duration };
    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update the interview
    const { data: updatedInterview, error: updateError } = await supabaseAdmin
      .from("interviews")
      .update(updateData)
      .eq("id", payload.interviewId)
      .select()
      .single();

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update interview" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Interview updated:", { id: updatedInterview?.id, candidate_response: updatedInterview?.candidate_response });

    // Create notification for employer
    if (employerId) {
      const { error: notifError } = await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: employerId,
          type: "interview",
          title: notificationTitle,
          message: notificationMessage,
          link: notificationLink,
          is_read: false,
        });

      if (notifError) {
        console.error("Notification insert error:", notifError);
        // Don't fail the request, just log
      } else {
        console.log("Notification created for employer:", employerId);
      }

      // Send email notification to employer when candidate requests reschedule
      if (payload.action === "reschedule_requested") {
        try {
          // The suggested times, on the team's clock (or the applicant's, said so).
          const formattedTimes = suggested.map((t) => sayTimeForTeam(t.datetime, clock)).join("; ") || "Not specified";

          console.log("Sending reschedule email to employer:", employerId);
          
          const { error: emailError } = await supabaseAdmin.functions.invoke("send-notification-email", {
            body: {
              type: "reschedule_requested",
              recipient_user_id: employerId,
              data: availability
                ? {
                    // Their availability in words: the team sets the new time.
                    candidate_name: candidateName,
                    job_title: jobTitle,
                    availability,
                    ...(cannotMakeWhen ? { cannot_make: cannotMakeWhen } : {}),
                    ...(clockGap ? { clock_gap: clockGap } : {}),
                  }
                : {
                    candidate_name: candidateName,
                    job_title: jobTitle,
                    proposed_times: formattedTimes,
                    candidate_note: suggestedNote || undefined,
                  },
            },
          });

          if (emailError) {
            console.error("Email notification error:", emailError);
          } else {
            console.log("Reschedule email sent to employer");
          }
        } catch (emailErr) {
          console.error("Failed to send reschedule email:", emailErr);
          // Don't fail the request for email errors
        }
      }
    }

    // A time is agreed: email both sides. The applicant reads it on their own
    // clock (their browser's zone, else the one their connection check
    // recorded, else the team's, named either way); the team on theirs.
    // Sent together AFTER the answer has gone back: the pick is already
    // saved, and a slow mail service must never make it look as if it failed.
    if (agreed) {
      const settled = agreed;
      afterResponse((async () => {
        let companyName: string | null = null;
        if (employerId) {
          const { data: employerProfile } = await supabaseAdmin
            .from("profiles")
            .select("company_name")
            .eq("user_id", employerId)
            .maybeSingle();
          companyName = (employerProfile?.company_name as string | null) ?? null;
        }
        const theirZone = knownZone(payload.timeZone) ?? applicantTimeZone(application?.notes);
        const written = applicantEmailTime(new Date(settled.at), theirZone, teamZoneOf(interview.employer_windows) ?? "UTC");
        const emails = agreedTimeEmails({
          change: settled.change,
          candidateId: application?.candidate_id,
          employerId,
          candidateName,
          jobTitle,
          companyName,
          applicationId: application?.id,
          applicantTime: { date: written.date, time: written.time },
          teamWhen: sayTimeForTeam(settled.at, clock),
          minutes: settled.minutes,
          interview,
        });
        const results = await Promise.allSettled(
          emails.map((body) => supabaseAdmin.functions.invoke("send-notification-email", { body })),
        );
        results.forEach((result, index) => {
          const failed = result.status === "rejected" || !!result.value?.error;
          console.log(`Agreed-time email ${emails[index].type}: ${failed ? "not sent" : "asked"}`);
        });
      })());
    }

    return new Response(JSON.stringify({
      success: true, 
      interview: updatedInterview,
      proposedTimesCount: payload.action === "reschedule_requested" ? suggested.length : 0,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
