/**
 * Vercel Routing Middleware: hireflownow.com/ is HireFlow's front page
 * (public/landing.html, docs/LANDING.md). Owner, 2026-10-09: "the landing is
 * on hireflownow.com".
 *
 * Why middleware and not a rewrite in vercel.json: Vercel serves a file that
 * exists before it applies rewrites, and "/" is the app's own index.html, so
 * a rewrite of "/" never runs (an earlier try in June 2026 fell back to an
 * iframe). Middleware runs before the file lookup. It only ever sees "/".
 *
 * staff.hireflownow.com/ is left alone: the app sends the hiring team on to
 * sign-in or their dashboard. Everything an applicant uses keeps its own
 * address and never reaches this: job pages and short links (/team-lead),
 * /careers, /candidate/auth, /applications.
 *
 * No dependency: @vercel/functions' rewrite() and next() are exactly these
 * two response headers.
 */
export const config = { matcher: "/" };

export default function middleware(request) {
  const url = new URL(request.url);
  if (url.hostname.startsWith("staff.")) {
    return new Response(null, { headers: { "x-middleware-next": "1" } });
  }
  // The phone app (the Natively wrapper, named in its user agent) opens on
  // the hiring team's door, never the front page (the owner, 2026-11-04:
  // "once I open it: sign in if not signed in, else the dashboard; do not
  // take me to the landing page"). staff.<host>/ does exactly that.
  if (/Natively\/(iOS|Android)/.test(request.headers.get("user-agent") || "")) {
    return Response.redirect(`https://staff.${url.hostname.replace(/^www\./, "")}/`, 302);
  }
  // Someone signed in to the hiring side goes straight to the dashboard, not
  // the front page (the owner, 2026-11-04). The app leaves the mark on the
  // whole domain (src/lib/signedInMark.ts): "staff" when they are signed in
  // on the staff host, "main" when on this one. "/?home" still shows the
  // front page.
  const signedIn = /(?:^|;\s*)hf_team=(staff|main)(?:;|$)/.exec(request.headers.get("cookie") || "");
  if (signedIn && !url.searchParams.has("home")) {
    return signedIn[1] === "staff"
      ? Response.redirect(`https://staff.${url.hostname.replace(/^www\./, "")}/`, 302)
      : Response.redirect(new URL("/dashboard", url).toString(), 302);
  }
  return new Response(null, { headers: { "x-middleware-rewrite": new URL("/landing.html", url).toString() } });
}
