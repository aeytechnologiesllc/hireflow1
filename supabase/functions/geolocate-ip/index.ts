/**
 * geolocate-ip — the caller's own approximate location (city/region/country),
 * used for pricing currency (usePricing) and document-signing context
 * (auditTrail, documentHash). Public: signing and pricing run signed-out too.
 *
 * Only ever looks up the IP the request came from. It used to take an `ip`
 * from the request body as well, which made it a free, unlimited lookup
 * service for any address on the internet (and let a caller put any location
 * they liked into their own signing context). It is also rate limited now,
 * since every call spends the upstream ip-api.com quota (45 per minute).
 */
import { callerId, guardPublicAiCall } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UNKNOWN = { city: "Unknown", region: "Unknown", country: "Unknown", countryCode: "XX" };

// IPv4 dotted quad or an IPv6 address (hex groups, colons, optional zone-free
// embedded IPv4). Anything else is never put into the upstream URL.
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:.]{2,45}$/i;

function json(body: unknown) {
  // Always 200 so a lookup problem never breaks pricing or signing.
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const limited = await guardPublicAiCall(req, "geolocate-ip", corsHeaders, 120, 3600);
  if (limited) return limited;

  const ip = callerId(req);
  if (!IPV4.test(ip) && !(ip.includes(":") && IPV6.test(ip))) {
    return json({ success: true, ip: "unknown", ...UNKNOWN });
  }

  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,city,regionName,country,countryCode`,
    );
    const data = await response.json();
    if (data.status !== "success") {
      return json({ success: true, ip, ...UNKNOWN });
    }
    return json({
      success: true,
      ip,
      city: data.city || "Unknown",
      region: data.regionName || "Unknown",
      country: data.country || "Unknown",
      countryCode: data.countryCode || "XX",
    });
  } catch (err) {
    console.error("geolocate-ip lookup failed:", err instanceof Error ? err.message : err);
    return json({ success: false, ip: "unknown", ...UNKNOWN });
  }
});
