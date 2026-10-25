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
