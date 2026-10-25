/**
 * safeLink.ts — the one place a stored link becomes something a person can
 * click.
 *
 * Links in this app are written by other people: an applicant can create a
 * notification for the business they applied to (and a business for its
 * applicants), an applicant types their own LinkedIn and portfolio address,
 * a business pastes its own meeting link, a message carries an attachment
 * path. React Router's <Link to> renders an absolute URL as a plain <a>, and
 * React 18 does not block `javascript:` in href, so a stored
 * `javascript:...` link would run in the HireFlow page (with the viewer's
 * session in localStorage) the moment they clicked it. Found by the
 * 2026-10-24 audit (docs/LAUNCH-PLAN.md, Phase 1).
 *
 * Two shapes, and nothing else:
 *   - inAppPath: a path on this site ("/applicants/x"). Never "//host"
 *     (protocol-relative), never "/\host" (browsers read the backslash as a
 *     slash), no whitespace or control characters, at most 500 characters.
 *     The same rule as supabase/functions/_shared/pushLink.ts and the
 *     database's public.safe_in_app_path()
 *     (supabase/migrations/20261025010000_safe_links.sql).
 *   - externalHref: an http(s) address. A bare domain someone typed
 *     ("www.linkedin.com/in/x") gets https:// in front; any other scheme
 *     (javascript:, data:, vbscript:, file:) is refused. Signed storage URLs
 *     and blob: previews made by this page are http(s)/blob and pass.
 *
 * Plain functions, no imports, so scripts/safe_links.test.mjs can load this
 * file in Node and prove the TS and SQL rules agree.
 */

const MAX_LINK_LENGTH = 500;

function hasSpaceOrControl(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** A path on this site a stored link may open, or null. */
export function inAppPath(link: unknown): string | null {
  if (typeof link !== "string") return null;
  const path = link.trim();
  if (!path || path.length > MAX_LINK_LENGTH) return null;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  if (hasSpaceOrControl(path)) return null;
  return path;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+(?:[/?#:]|$)/i;

/**
 * An address that is safe to put in href / window.open, or null.
 * `allowBlob` is for previews this page made itself (URL.createObjectURL).
 */
export function externalHref(url: unknown, options: { allowBlob?: boolean } = {}): string | null {
  if (typeof url !== "string") return null;
  const value = url.trim();
  if (!value || value.length > 2048) return null;
  if (hasSpaceOrControl(value)) return null;
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? value : null;
    } catch {
      return null;
    }
  }
  if (options.allowBlob && /^blob:https?:\/\//i.test(value)) return value;
  if (SCHEME.test(value)) return null;
  if (value.startsWith("//")) return null;
  if (BARE_DOMAIN.test(value)) return `https://${value}`;
  return null;
}

/** Open an external address in a new tab, only when it is safe. Returns whether it opened. */
export function openExternal(url: unknown, options: { allowBlob?: boolean } = {}): boolean {
  const href = externalHref(url, options);
  if (!href) return false;
  window.open(href, "_blank", "noopener,noreferrer");
  return true;
}
