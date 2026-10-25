/**
 * shortWays.ts — the short addresses a video can say (hireflownow.com/youtube)
 * and a business's guesses (/signup, /pricing), with where each goes (the
 * fourth and fifth growth reviews).
 *
 * vercel.json's "redirects" send these names, in any capitals, before the app
 * loads (each `source` is shortWaySource(name); scripts/page_prerender.test.mjs
 * checks the two lists match). A redirect's source matches case-sensitively,
 * so it spells each letter both ways: the exact names alone sent "/YouTube" to
 * the job page, which forwarded it from inside the app, and the front page then
 * dropped the tags as a move inside the site (the sixth growth review). The job
 * page still forwards a short way it is shown (shortWayIn), for anything that
 * reaches the app without the redirects. The names are reserved for jobs
 * (src/lib/jobSlug.ts HELD_BACK).
 */
export const SHORT_WAYS_IN: Readonly<Record<string, string>> = {
  "youtube": "/?utm_source=youtube&utm_medium=video",
  "yt": "/?utm_source=youtube&utm_medium=video",
  "tiktok": "/?utm_source=tiktok&utm_medium=video",
  "facebook": "/?utm_source=facebook&utm_medium=social",
  "fb": "/?utm_source=facebook&utm_medium=social",
  "instagram": "/?utm_source=instagram&utm_medium=social",
  "ig": "/?utm_source=instagram&utm_medium=social",
  "linkedin": "/?utm_source=linkedin&utm_medium=social",
  "signup": "https://staff.hireflownow.com/auth?mode=signup&utm_source=short_link&utm_medium=signup",
  "sign-up": "https://staff.hireflownow.com/auth?mode=signup&utm_source=short_link&utm_medium=signup",
  "start": "https://staff.hireflownow.com/auth?mode=signup&utm_source=short_link&utm_medium=start",
  "post-a-job": "https://staff.hireflownow.com/auth?mode=signup&utm_source=short_link&utm_medium=post-a-job",
  "hire": "https://staff.hireflownow.com/auth?mode=signup&utm_source=short_link&utm_medium=hire",
  "business": "https://staff.hireflownow.com/auth?mode=signup&utm_source=short_link&utm_medium=business",
  "employers": "https://staff.hireflownow.com/auth?mode=signup&utm_source=short_link&utm_medium=employers",
  "login": "https://staff.hireflownow.com/auth",
  "log-in": "https://staff.hireflownow.com/auth",
  "signin": "https://staff.hireflownow.com/auth",
  "pricing": "/",
  "demo": "/",
  "about": "/",
};

/** vercel.json's `source` for a short way: the name with each letter as a
 *  [yY] class ("/([yY][tT])"), so the redirect matches it in any capitals. */
export function shortWaySource(name: string): string {
  return `/(${[...name].map((c) => (/[a-z]/.test(c) ? `[${c}${c.toUpperCase()}]` : c)).join("")})`;
}

/** Where a short address goes, whatever its capitals, or null. */
export function shortWayIn(name: string | null | undefined): string | null {
  const key = String(name ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SHORT_WAYS_IN, key) ? SHORT_WAYS_IN[key] : null;
}
