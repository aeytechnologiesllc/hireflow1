/**
 * shortWays.ts — the short addresses a video can say (hireflownow.com/youtube)
 * and a business's guesses (/signup, /pricing), with where each goes (the
 * fourth and fifth growth reviews).
 *
 * vercel.json's "redirects" send these exact names before the app loads
 * (scripts/page_prerender.test.mjs checks the two lists match); the job page
 * sends the same names in any capitals ("/YouTube", "/Signup"), which the
 * redirects do not match, instead of showing "This role isn't open". The
 * names are reserved for jobs (src/lib/jobSlug.ts HELD_BACK).
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

/** Where a short address goes, whatever its capitals, or null. */
export function shortWayIn(name: string | null | undefined): string | null {
  const key = String(name ?? "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SHORT_WAYS_IN, key) ? SHORT_WAYS_IN[key] : null;
}
