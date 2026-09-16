/**
 * Turns a notification's `link` into the URL a push notification opens.
 *
 * Notification rows can be inserted by a counterparty (a candidate can notify
 * the employer of a job they applied to), so `link` is not trusted. A push
 * opens its `url` outside the app, in the browser or the native wrapper, so an
 * absolute link would be a one-tap phishing page wearing HireFlow's name. Only
 * same-site paths are allowed; anything else sends the push with no link.
 */
export const PUSH_LINK_ORIGIN = "https://hireflownow.com";
const MAX_LINK_LENGTH = 500;

export function pushUrlForLink(link: string | null | undefined, origin: string = PUSH_LINK_ORIGIN): string | null {
  if (typeof link !== "string") return null;
  const path = link.trim();
  if (!path || path.length > MAX_LINK_LENGTH) return null;
  // Must be a path on this site: "/x". Not "//evil.com" (protocol-relative),
  // not "/\evil.com" (browsers treat the backslash as a slash).
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  // No whitespace or control characters inside a URL path.
  for (const ch of path) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f) return null;
  }
  try {
    const url = new URL(path, origin);
    return url.origin === new URL(origin).origin ? url.toString() : null;
  } catch {
    return null;
  }
}
