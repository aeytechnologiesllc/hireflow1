import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ConfirmPayload {
  action: "confirm";
  interviewId: string;
}

interface ReschedulePayload {
  action: "reschedule_requested";
  interviewId: string;
  proposedTimes: { datetime: string }[];
  candidateNote?: string;
}

type RequestPayload = ConfirmPayload | ReschedulePayload;

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
    console.log("Received payload:", payload);

    // Create service client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the interview and verify ownership
    const { data: interview, error: fetchError } = await supabaseAdmin
      .from("interviews")
      .select(`
        id,
        application_id,
        scheduled_at,
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

    // Verify the user is the candidate for this interview
    const application = interview.applications as any;
    if (application?.candidate_id !== user.id) {
      console.error("Permission denied: user is not the candidate");
      return new Response(JSON.stringify({ error: "You are not authorized to modify this interview" }), {
        status: 403,
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

    let updateData: Record<string, any> = {};
    let notificationTitle = "";
    let notificationMessage = "";

    if (payload.action === "confirm") {
      updateData = {
        candidate_response: "confirmed",
      };
      notificationTitle = "Interview Confirmed";
      notificationMessage = `${candidateName} has confirmed their interview for ${jobTitle}.`;
    } else if (payload.action === "reschedule_requested") {
      updateData = {
        candidate_response: "reschedule_requested",
        proposed_times: payload.proposedTimes,
        candidate_note: payload.candidateNote || null,
      };
      notificationTitle = "Reschedule Requested";
      const timesCount = payload.proposedTimes?.length || 0;
      notificationMessage = `${candidateName} has requested to reschedule their interview for ${jobTitle} and proposed ${timesCount} alternative time(s).`;
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

    console.log("Interview updated:", updatedInterview);

    // Create notification for employer
    if (employerId) {
      const { error: notifError } = await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: employerId,
          type: "interview",
          title: notificationTitle,
          message: notificationMessage,
          link: `/applicants/${application.id}`,
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
          // Format proposed times for email
          const formattedTimes = payload.proposedTimes?.map(t => {
            const date = new Date(t.datetime);
            return date.toLocaleString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            });
          }).join(", ") || "Not specified";

          console.log("Sending reschedule email to employer:", employerId);
          
          const { error: emailError } = await supabaseAdmin.functions.invoke("send-notification-email", {
            body: {
              type: "reschedule_requested",
              recipient_user_id: employerId,
              data: {
                candidate_name: candidateName,
                job_title: jobTitle,
                proposed_times: formattedTimes,
                candidate_note: payload.candidateNote || undefined,
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
      proposedTimesCount: payload.action === "reschedule_requested" ? payload.proposedTimes?.length : 0,
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
