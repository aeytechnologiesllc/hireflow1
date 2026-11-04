/**
 * hireflownow.com/ is the front page, but someone signed in to the hiring
 * side goes straight to their dashboard (the owner, 2026-11-04: "if you're
 * logged in and you go to HireFlowNow.com, it should take you straight to
 * the dashboard, not the landing page"). The front page is served before the
 * app starts (middleware.js), and the session lives in the app's own storage,
 * so the app leaves a small mark on the whole domain that the middleware can
 * read: only which host they are signed in on ("staff" or "main"), never a
 * token, an id or a name. Signing out takes it away; it lasts 30 days
 * otherwise, and an expired session behind it only means the staff host's
 * sign-in page instead of the front page.
 *
 * Import-free, so scripts/landing_page.test.mjs can read SIGNED_IN_MARK.
 */
export const SIGNED_IN_MARK = "hf_team";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** The domain the mark is shared on: the main host and every sub-host, or
 *  none (this host only) for localhost, an address, or a preview host. */
function sharedDomain(hostname: string): string {
  const main = hostname.replace(/^(staff|www)\./, "");
  if (!main.includes(".") || /^[\d.]+$/.test(main) || /(^|\.)(localhost|vercel\.app)$/.test(main)) return "";
  return `.${main}`;
}

export function markSignedIn(where: "staff" | "main" | null): void {
  try {
    const domain = sharedDomain(window.location.hostname);
    const attrs = `; Path=/${domain ? `; Domain=${domain}` : ""}; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    document.cookie = where ? `${SIGNED_IN_MARK}=${where}; Max-Age=${THIRTY_DAYS}${attrs}` : `${SIGNED_IN_MARK}=; Max-Age=0${attrs}`;
  } catch {
    // No mark: the front page shows as before.
  }
}
