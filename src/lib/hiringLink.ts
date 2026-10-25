/**
 * hiringLink.ts — "Hiring? Post a job free": the small links back to HireFlow
 * on pages other businesses' applicants see (2026-10-25; docs/LAUNCH-PLAN.md,
 * Phase 3, task 6).
 *
 * They go to the front page (which says what HireFlow is and carries the
 * campaign tags on to sign-up: public/carry-source.js), tagged with the page
 * they came from, so Admin → Growth shows which of these brings businesses.
 *
 * No imports: scripts/hiring_links.test.mjs loads it in Node.
 */

export type HiringLinkSource = "careers_page" | "job_page" | "application_done" | "flyer" | "open_jobs";

export const HIRING_LINK_WORDS = "Hiring? Post a job free";

export function hiringLink(source: HiringLinkSource): string {
  const url = new URL("https://hireflownow.com/");
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", "hiring_link");
  return url.toString();
}

/**
 * A link on one of the app's own public pages (Open jobs) that carries the
 * visitor's own campaign tags on, or the site they came from (`ref`), the way
 * public/carry-source.js does on the static pages: the app's page shell has
 * no carry-source.js, so Open jobs' "Post a job free" and logo replaced a
 * YouTube visitor's tags with its own (the third growth review). The tags are
 * read from `here` (the page's address) and must already be plain.
 */
export function withVisitorTags(base: string, here: string): string {
  let carried: URLSearchParams;
  let url: URL;
  try {
    carried = new URL(here, "https://hireflownow.com").searchParams;
    url = new URL(base, "https://hireflownow.com");
  } catch {
    return base;
  }
  const plain = (v: string | null) => (v && /^[a-z0-9._-]{1,60}$/.test(v) ? v : null);
  const tags = (["utm_source", "utm_medium", "utm_campaign"] as const).map((key) => [key, plain(carried.get(key))] as const).filter(([, v]) => v);
  const ref = plain(carried.get("ref"));
  if (tags.length > 0) {
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) url.searchParams.delete(key);
    for (const [key, v] of tags) url.searchParams.set(key, v as string);
  } else if (ref && !ref.includes("hireflownow.com")) {
    url.searchParams.set("ref", ref);
  } else {
    return base;
  }
  return base.startsWith("/") ? `${url.pathname}${url.search}` : url.toString();
}
