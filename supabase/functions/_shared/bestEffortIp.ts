/**
 * The caller's network address, for the document-signing record and the
 * computer check.
 *
 * Since 2026-10-11 this is CF-Connecting-IP: Cloudflare, in front of every
 * edge function, sets it to the address the request really came from, and
 * refuses (error 1000) any request that tries to send its own, so a caller
 * cannot choose it. Proved live with a throwaway probe the same day: the
 * header carried the caller's address (99.74.0.227), while the last
 * X-Forwarded-For hop, which this used to take, was the hosting provider's
 * own proxy (3.2.52.20) on every request. X-Forwarded-For (any hop of which
 * a caller CAN write) is only the fallback when CF-Connecting-IP is missing.
 */
export function bestEffortIp(req: Request): string {
  // 2026-10-11, proved live with a throwaway probe: CF-Connecting-IP reaches
  // every edge function and is the caller's real address (Cloudflare sets
  // it, and refuses outright, error 1000, a request that tries to send its
  // own). The LAST X-Forwarded-For hop this used to prefer is the hosting
  // provider's own proxy (3.2.52.20 when the caller was 99.74.0.227), so
  // every signature and computer check had been recording that proxy, not
  // the person. X-Forwarded-For stays only as the fallback.
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
