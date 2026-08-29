import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestPayload {
  interviewId: string;
}

const DAILY_API_BASE = "https://api.daily.co/v1";

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const DAILY_API_KEY = Deno.env.get("DAILY_API_KEY");

    if (!DAILY_API_KEY) {
      console.error("DAILY_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "video_not_configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    if (!payload?.interviewId) {
      return new Response(JSON.stringify({ error: "interviewId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client for privileged reads/writes
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: interview, error: fetchError } = await supabaseAdmin
      .from("interviews")
      .select(`
        id,
        application_id,
        scheduled_at,
        duration_minutes,
        status,
        candidate_response,
        meeting_provider,
        meeting_room_url,
        meeting_room_name,
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

    const application = interview.applications as any;
    const job = application?.jobs;
    const employerId = job?.employer_id;
    const isCandidate = application?.candidate_id === user.id;
    const isEmployer = employerId === user.id;

    let isTeamMember = false;
    if (!isCandidate && !isEmployer && employerId) {
      const { data: membership } = await supabaseAdmin
        .from("team_members")
        .select("id")
        .eq("employer_id", employerId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .eq("can_schedule_interviews", true)
        .maybeSingle();
      isTeamMember = !!membership;
    }

    if (!isCandidate && !isEmployer && !isTeamMember) {
      console.error("Permission denied: user is not the candidate, employer, or an authorized team member");
      return new Response(JSON.stringify({ error: "You are not authorized to join this interview" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (interview.status !== "scheduled" || interview.candidate_response !== "confirmed") {
      return new Response(JSON.stringify({ error: "This interview is not confirmed yet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const scheduledAt = new Date(interview.scheduled_at as string);
    const durationMinutes = interview.duration_minutes || 30;
    const nbfSeconds = Math.floor((scheduledAt.getTime() - 15 * 60 * 1000) / 1000);
    const expSeconds = Math.floor((scheduledAt.getTime() + durationMinutes * 60 * 1000 + 60 * 60 * 1000) / 1000);
    const roomName = `hf-${interview.id}`;

    const dailyHeaders = {
      Authorization: `Bearer ${DAILY_API_KEY}`,
      "Content-Type": "application/json",
    };

    // Idempotently ensure the room exists
    let roomUrl: string | null = null;
    const getRoomResponse = await fetch(`${DAILY_API_BASE}/rooms/${roomName}`, {
      method: "GET",
      headers: dailyHeaders,
    });

    if (getRoomResponse.ok) {
      const existingRoom = await getRoomResponse.json();
      roomUrl = existingRoom.url;
    } else if (getRoomResponse.status === 404) {
      const createRoomResponse = await fetch(`${DAILY_API_BASE}/rooms`, {
        method: "POST",
        headers: dailyHeaders,
        body: JSON.stringify({
          name: roomName,
          privacy: "private",
          properties: {
            nbf: nbfSeconds,
            exp: expSeconds,
            enable_screenshare: true,
            enable_chat: true,
            max_participants: 4,
            enable_knocking: false,
          },
        }),
      });

      if (!createRoomResponse.ok) {
        // Both participants often arrive at the same moment: each saw 404,
        // both POST, and the loser gets "room already exists". That is
        // success for our purposes — re-fetch the room the winner created.
        const errorBody = await createRoomResponse.text();
        const retryGet = await fetch(`${DAILY_API_BASE}/rooms/${roomName}`, {
          method: "GET",
          headers: dailyHeaders,
        });
        if (retryGet.ok) {
          const existingRoom = await retryGet.json();
          roomUrl = existingRoom.url;
        } else {
          console.error("Daily room creation failed:", createRoomResponse.status, errorBody);
          return new Response(JSON.stringify({ error: "Failed to create video room" }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        const createdRoom = await createRoomResponse.json();
        roomUrl = createdRoom.url;
      }
    } else {
      const errorBody = await getRoomResponse.text();
      console.error("Daily room lookup failed:", getRoomResponse.status, errorBody);
      return new Response(JSON.stringify({ error: "Failed to look up video room" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persist provider/room info only if it changed
    if (
      interview.meeting_provider !== "daily" ||
      interview.meeting_room_url !== roomUrl ||
      interview.meeting_room_name !== roomName
    ) {
      const { error: updateError } = await supabaseAdmin
        .from("interviews")
        .update({
          meeting_provider: "daily",
          meeting_room_url: roomUrl,
          meeting_room_name: roomName,
        })
        .eq("id", interview.id);

      if (updateError) {
        console.error("Failed to persist meeting room info:", updateError);
        // Not fatal — the room exists and we can still hand back a token.
      }
    }

    // Resolve a display name for the caller's meeting token
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, company_name")
      .eq("user_id", user.id)
      .single();

    const userName = isCandidate
      ? profile?.full_name || profile?.email || "Candidate"
      : profile?.full_name || profile?.company_name || profile?.email || "Interviewer";

    const tokenResponse = await fetch(`${DAILY_API_BASE}/meeting-tokens`, {
      method: "POST",
      headers: dailyHeaders,
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_name: userName,
          exp: expSeconds,
        },
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error("Daily meeting token creation failed:", tokenResponse.status, errorBody);
      return new Response(JSON.stringify({ error: "Failed to create meeting token" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenResult = await tokenResponse.json();

    return new Response(JSON.stringify({
      roomUrl,
      token: tokenResult.token,
      scheduledAt: interview.scheduled_at,
      durationMinutes,
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
