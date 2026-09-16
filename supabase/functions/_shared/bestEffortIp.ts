/**
 * Best-effort network-address capture for the document-signing edge
 * function's audit trail / completion certificate.
 *
 * NOT a verified, spoof-proof client IP — see docs/DOCUMENT-SIGNING.md's
 * revision log (item 2) for the full reasoning. X-Forwarded-For is not a
 * browser-forbidden header, so any caller of this (or any) public HTTPS
 * endpoint can set it to an arbitrary value via devtools/curl/a modified
 * client — trusting the first hop verbatim (the original design, and the
 * pattern `_shared/rateLimit.ts`'s `callerId()` already uses for its own,
 * explicitly best-effort, non-authorization purpose) is exactly as
 * spoofable as accepting a client-supplied body field would be.
 *
 * This session could not independently verify what, if anything, Supabase's
 * Edge Runtime guarantees about appending (rather than passing through
 * untouched) a caller's X-Forwarded-For header, so rather than assert a
 * platform guarantee this code can't prove, it takes the LAST hop — the
 * position a reverse proxy chain conventionally appends to, not the
 * position the client itself writes into first — as a marginally more
 * trustworthy signal than the first hop, while still treating the result as
 * best-effort. Every surface that displays this value (completionCertificate.ts,
 * AuditCertificate.tsx, certificatePDF.ts) labels it "self-reported" rather
 * than presenting it as independently verified — see those files' "IP
 * Address (self-reported)" labels.
 */
export function bestEffortIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const hops = fwd.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
}
