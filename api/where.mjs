/**
 * GET /api/where: the caller's own approximate place, as hireflownow.com's
 * host (Vercel) sees their connection: country, region, city, and the
 * address it saw. Free, with no outside lookup service.
 *
 * Used once, when someone signs a document (src/lib/signerContext.ts), so the
 * signing record can say roughly where it was signed from
 * (docs/DOCUMENT-SIGNING.md, "Signing record"). The signing function never
 * takes it on trust: it records whether this address matches the one it saw
 * itself (supabase/functions/_shared/signerContext.ts).
 *
 * Only ever about the caller. Never cached. Zero imports, like the other
 * files in api/.
 */
function header(req, name) {
  const v = req.headers && req.headers[name];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : "";
}

function decoded(value) {
  try {
    return decodeURIComponent(value || "");
  } catch {
    return value || "";
  }
}

export default function handler(req, res) {
  const forwarded = header(req, "x-forwarded-for").split(",")[0].trim();
  const body = {
    country: header(req, "x-vercel-ip-country").slice(0, 2) || null,
    region: decoded(header(req, "x-vercel-ip-country-region")).slice(0, 64) || null,
    city: decoded(header(req, "x-vercel-ip-city")).slice(0, 64) || null,
    ip: (header(req, "x-real-ip") || forwarded).slice(0, 45) || null,
  };
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, private");
  res.end(JSON.stringify(body));
}
