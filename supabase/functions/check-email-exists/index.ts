/**
 * RETIRED — this endpoint is intentionally disabled.
 *
 * It answered, without any authentication, whether a given email address had a
 * HireFlow account. That is an account-enumeration oracle: anyone could test a
 * list of addresses against us and learn which people are our users.
 *
 * Its only caller was the candidate password-reset flow, which used it to say
 * "no account found with this email" — the exact disclosure that makes reset
 * flows dangerous. That flow now returns the same neutral response either way
 * ("if that address has an account, a reset link is on its way"), so nothing
 * needs this function.
 *
 * Kept as a tombstone rather than deleted so an already-deployed copy is
 * replaced with a refusal instead of lingering live.
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
    JSON.stringify({
      error: "gone",
      message:
        "check-email-exists has been retired. Account existence is never disclosed.",
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
