/**
 * Rate limiting for public edge functions.
 *
 * Several functions must stay reachable without a login — accountless candidates
 * take chat/voice/simulation steps, and the guest job creator drafts a job before
 * anyone signs up. Every one of those calls spends real money at OpenAI or
 * ElevenLabs, so an open endpoint is an open invoice. This caps how often any one
 * caller can spend on our behalf.
 *
 * Fixed-window counting in Postgres (see migration `edge_function_rate_limiting`):
 * atomic, shared across every edge instance, and cheap — one round trip.
 *
 * FAILS OPEN on purpose. If the limiter itself is broken we would rather serve a
 * candidate mid-interview than block them; the limiter is cost protection, not an
 * authorization boundary.
 */

export type RateLimitResult = {
  allowed: boolean;
  hits: number;
  limit: number;
  retryAfter: number;
};

/** Best-effort caller identity: the real client IP behind Supabase's proxy. */
export function callerId(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
}

export async function checkRateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSecs: number,
): Promise<RateLimitResult> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    return { allowed: true, hits: 0, limit, retryAfter: 0 };
  }

  try {
    const res = await fetch(`${url}/rest/v1/rpc/check_rate_limit`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_bucket: bucket,
        p_identifier: identifier,
        p_limit: limit,
        p_window_secs: windowSecs,
      }),
    });
    if (!res.ok) return { allowed: true, hits: 0, limit, retryAfter: 0 };
    const data = await res.json();
    return {
      allowed: data?.allowed !== false,
      hits: Number(data?.hits ?? 0),
      limit,
      retryAfter: Number(data?.retryAfter ?? windowSecs),
    };
  } catch (_e) {
    return { allowed: true, hits: 0, limit, retryAfter: 0 };
  }
}

/**
 * Guard a public, money-spending endpoint.
 * Returns a ready-to-send 429 Response when the caller is over budget, else null.
 */
export async function guardPublicAiCall(
  req: Request,
  bucket: string,
  corsHeaders: Record<string, string>,
  limit = 20,
  windowSecs = 3600,
): Promise<Response | null> {
  const result = await checkRateLimit(bucket, callerId(req), limit, windowSecs);
  if (result.allowed) return null;

  console.warn(`[rate-limit] ${bucket} blocked ${callerId(req)} (${result.hits}/${limit})`);
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      message: "Too many requests. Please wait a moment and try again.",
      retryAfter: result.retryAfter,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfter),
      },
    },
  );
}
