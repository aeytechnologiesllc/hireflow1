/**
 * RETIRED — this endpoint is intentionally disabled (2026-09-16).
 *
 * It was a public, sign-in-free text-to-speech proxy for the old
 * /marketing-demo page, which now just redirects to "/". Nothing in the app
 * calls it. It had a per-IP call limit but no cap on text length, so the day
 * ELEVENLABS_API_KEY got set (it is unset today), anyone could have spent
 * roughly ten thousand characters of paid voice per call, sixty times an hour,
 * per IP address.
 *
 * Kept as a tombstone, same convention as check-email-exists and
 * stripe-checkout, so the deployed copy is replaced with a refusal rather than
 * left live. If a voice demo comes back, build it behind sign-in with a text
 * length cap.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({ error: "gone", message: "elevenlabs-tts has been retired." }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
