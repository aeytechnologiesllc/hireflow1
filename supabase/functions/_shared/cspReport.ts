/**
 * cspReport.ts — turns a browser's Content-Security-Policy violation report
 * into the shape client-errors already stores (client_error_events), so the
 * report-only rollout of the site's CSP (vercel.json; docs/LAUNCH-PLAN.md,
 * Phase 1, task 1) can be read with the same query as every crash.
 *
 * Two formats arrive:
 *   - `report-uri`: one JSON object, Content-Type application/csp-report,
 *     `{ "csp-report": { "document-uri", "effective-directive"|"violated-directive",
 *       "blocked-uri", "source-file", "line-number", "script-sample", "disposition" } }`
 *   - Reporting API (`report-to`): a JSON array, Content-Type
 *     application/reports+json, `[{ "type": "csp-violation", "url",
 *       "body": { "documentURL", "effectiveDirective", "blockedURL",
 *       "sourceFile", "lineNumber", "sample", "disposition" } }]`
 *
 * Every field is untrusted. Only the blocked address's host (or the CSP
 * keyword: inline, eval, data, blob) goes into the message, so reports with
 * the same cause group under one fingerprint, and no query string (which can
 * carry a token) is ever kept. Pure, no imports, so a Node test can load it.
 */

export interface CspClientError {
  message: string;
  stack: string | null;
  route: string;
}

const KEYWORDS = new Set(["inline", "eval", "data", "blob", "self", "wasm-eval", "trusted-types-policy", "trusted-types-sink"]);

function str(value: unknown, max = 300): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** "https://x.example/a?b" -> "x.example"; "inline" -> "inline"; "data:..." -> "data". */
export function blockedLabel(blocked: string): string {
  const value = blocked.trim();
  if (!value) return "unknown";
  if (KEYWORDS.has(value.toLowerCase())) return value.toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (scheme && !/^https?$|^wss?$/i.test(scheme[1])) return scheme[1].toLowerCase();
  try {
    return new URL(value).host || "unknown";
  } catch {
    return "unknown";
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

function fromFields(f: {
  document: string;
  directive: string;
  blocked: string;
  sourceFile: string;
  line: string;
  sample: string;
  disposition: string;
}): CspClientError | null {
  const directive = f.directive.split(/\s+/)[0] || "unknown";
  if (!f.document && !f.blocked && directive === "unknown") return null;
  const mode = f.disposition.toLowerCase() === "enforce" ? "blocked" : "would block";
  const message = `CSP ${mode}: ${directive} ${blockedLabel(f.blocked)}`;
  const source = f.sourceFile ? `${blockedLabel(f.sourceFile)}${pathOf(f.sourceFile)}${f.line ? `:${f.line}` : ""}` : "";
  const stackParts = [source, f.sample ? `sample: ${f.sample.slice(0, 80)}` : ""].filter(Boolean);
  return { message, stack: stackParts.length ? stackParts.join("\n") : null, route: pathOf(f.document) };
}

/** The reports in a request body (one or many), each as a client error. */
export function cspReportsToClientErrors(body: unknown): CspClientError[] {
  const out: CspClientError[] = [];
  if (body && typeof body === "object" && !Array.isArray(body) && "csp-report" in body) {
    const r = (body as Record<string, unknown>)["csp-report"] as Record<string, unknown> | undefined;
    if (r && typeof r === "object") {
      const one = fromFields({
        document: str(r["document-uri"], 2000),
        directive: str(r["effective-directive"]) || str(r["violated-directive"]),
        blocked: str(r["blocked-uri"], 2000),
        sourceFile: str(r["source-file"], 2000),
        line: str(String(r["line-number"] ?? "")),
        sample: str(r["script-sample"]),
        disposition: str(r["disposition"]),
      });
      if (one) out.push(one);
    }
    return out;
  }
  if (Array.isArray(body)) {
    for (const item of body.slice(0, 20)) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      if (rec.type !== "csp-violation") continue;
      const b = (rec.body ?? {}) as Record<string, unknown>;
      const one = fromFields({
        document: str(b.documentURL, 2000) || str(rec.url, 2000),
        directive: str(b.effectiveDirective),
        blocked: str(b.blockedURL, 2000),
        sourceFile: str(b.sourceFile, 2000),
        line: str(String(b.lineNumber ?? "")),
        sample: str(b.sample),
        disposition: str(b.disposition),
      });
      if (one) out.push(one);
    }
  }
  return out;
}

/** Is this request a CSP report rather than a crash report? */
export function isCspReportRequest(contentType: string | null, url: string): boolean {
  if (contentType && /application\/(csp-report|reports\+json)/i.test(contentType)) return true;
  try {
    return new URL(url).searchParams.get("kind") === "csp";
  } catch {
    return false;
  }
}
