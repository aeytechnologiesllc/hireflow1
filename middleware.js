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
  return new Response(null, { headers: { "x-middleware-rewrite": new URL("/landing.html", url).toString() } });
}
