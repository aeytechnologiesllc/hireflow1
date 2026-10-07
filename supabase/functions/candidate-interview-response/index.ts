import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.2";
import {
  cleanNote,
  cleanSuggestedTimes,
  clockForTeam,
  noTimeAgreedYet,
  sayTimeForTeam,
  suggestionToStore,
  teamNoticeFor,
} from "../_shared/interviewAnswer.ts";

/**
 * An applicant's answer about an interview with the hiring team: confirm the
 * time that was set, pick one of the times offered, swap to another offered
 * time, or suggest times of their own (docs/INTERVIEWS.md, "What the
 * applicant sees"). The applicant's browser may only read the interviews
 * table; every answer is written here, after checking it is theirs.
 *
 * What the team is told states the time on the team's own clock when the
 * wizard recorded it (employer_windows[].zone), otherwise on the applicant's
 * clock and says so. Never a bare time: until 2026-10-07 it was the server's
 * clock (UTC) with no zone, four hours off for the owner.
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
  proposedTimes: { datetime: string }[];
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

type RequestPayload = ConfirmPayload | ReschedulePayload | PickSlotPayload | RepickSlotPayload;

interface EmployerWindow {
  start: string;
  durationMinutes?: number;
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
        applications(
          id,
          candidate_id,
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

    // Get candidate name
    const { data: candidateProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", user.id)
      .single();

    const candidateName = candidateProfile?.full_name || candidateProfile?.email || "Candidate";

    let updateData: {
      candidate_response?: string;
      proposed_times?: { datetime: string; fromOffer?: true }[] | null;
      candidate_note?: string | null;
      scheduled_at?: string;
      duration_minutes?: number;
    } = {};
    let notificationTitle = "";
    let notificationMessage = "";
    // Where the team's bell opens: the applicant, or the Interviews page when there is something to answer.
    let notificationLink = `/applicants/${application.id}`;
    // The times the applicant suggested, as kept (reschedule_requested only).
    let suggested: { datetime: string }[] = [];
    let suggestedNote: string | null = null;

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
    } else if (payload.action === "reschedule_requested") {
      suggested = cleanSuggestedTimes(payload.proposedTimes, Date.now());
      if (suggested.length === 0) {
        return new Response(JSON.stringify({ error: "no_times" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      suggestedNote = cleanNote(payload.candidateNote);
      // No time agreed yet (they are answering an offer): marked, so the
      // team's answer never treats the placeholder as an "original time".
      const fromOffer = noTimeAgreedYet(interview.candidate_response, interview.proposed_times);
      updateData = {
        candidate_response: "reschedule_requested",
        proposed_times: suggestionToStore(suggested, fromOffer),
        candidate_note: suggestedNote,
      };
      const notice = teamNoticeFor(fromOffer ? "countered" : "suggested", who, { count: suggested.length });
      notificationTitle = notice.title;
      notificationMessage = notice.message;
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
              data: {
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
