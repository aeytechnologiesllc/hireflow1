import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateEventRequest {
  action: "create_event";
  accessToken: string;
  summary: string;
  description?: string;
  startTime: string;
  endTime: string;
  attendees?: string[];
  createMeetLink?: boolean;
}

interface TokenExchangeRequest {
  action: "exchange_token";
  code: string;
  redirectUri: string;
}

interface RefreshTokenRequest {
  action: "refresh_token";
  refreshToken: string;
}

type RequestBody = CreateEventRequest | TokenExchangeRequest | RefreshTokenRequest;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error("Google OAuth credentials not configured");
      return new Response(
        JSON.stringify({ error: "Google Calendar integration not configured. Please add your Google OAuth credentials." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: RequestBody = await req.json();

    // Exchange authorization code for tokens
    if (body.action === "exchange_token") {
      const { code, redirectUri } = body;
      
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });

      const tokens = await tokenResponse.json();
      
      if (!tokenResponse.ok) {
        console.error("Token exchange failed:", tokens);
        return new Response(
          JSON.stringify({ error: "Failed to exchange authorization code" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Token exchange successful");
      return new Response(JSON.stringify(tokens), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Refresh access token
    if (body.action === "refresh_token") {
      const { refreshToken } = body;
      
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      const tokens = await tokenResponse.json();
      
      if (!tokenResponse.ok) {
        console.error("Token refresh failed:", tokens);
        return new Response(
          JSON.stringify({ error: "Failed to refresh access token" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify(tokens), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create calendar event with optional Meet link
    if (body.action === "create_event") {
      const { accessToken, summary, description, startTime, endTime, attendees, createMeetLink } = body;

      const eventBody: any = {
        summary,
        description,
        start: {
          dateTime: startTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: endTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        attendees: attendees?.map(email => ({ email })),
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 24 * 60 },
            { method: "popup", minutes: 30 },
          ],
        },
      };

      // Add Google Meet conferencing if requested
      if (createMeetLink) {
        eventBody.conferenceData = {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        };
      }

      const calendarResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events${createMeetLink ? "?conferenceDataVersion=1" : ""}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(eventBody),
        }
      );

      const event = await calendarResponse.json();

      if (!calendarResponse.ok) {
        console.error("Calendar event creation failed:", event);
        return new Response(
          JSON.stringify({ error: event.error?.message || "Failed to create calendar event" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Calendar event created:", event.id);
      
      return new Response(
        JSON.stringify({
          eventId: event.id,
          htmlLink: event.htmlLink,
          meetLink: event.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri || null,
          hangoutLink: event.hangoutLink,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in google-calendar function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
