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

export const HIRING_LINK_SOURCES = ["careers_page", "job_page", "application_done", "flyer", "open_jobs"] as const;
export type HiringLinkSource = (typeof HIRING_LINK_SOURCES)[number];

export const HIRING_LINK_WORDS = "Hiring? Post a job free";

/**
 * The mark a "Post a job free" link carries (hiring_link=1), so the front
 * page's counter (public/beacon.js) can tell this click, a new way in, from a
 * visitor moving on inside the site with the tags they brought. It is not a
 * tag: carry-source.js never carries it on, beacon.js takes it off the
 * address once it has counted it, and no sign-up keeps it. The counter used
 * to key on utm_medium=hiring_link, which carry-source.js puts on every later
 * link (one click read as four campaign visits) and which a visitor's own
 * channel replaces (a Share Kit or Facebook visitor's click never counted:
 * the sixth growth review).
 */
export const HIRING_LINK_MARK = "hiring_link";

export function hiringLink(source: HiringLinkSource): string {
  const url = new URL("https://hireflownow.com/");
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", "hiring_link");
  url.searchParams.set(HIRING_LINK_MARK, "1");
  return url.toString();
}

/** A tag as the page counter (public/beacon.js) and the carrier
 *  (public/carry-source.js) tidy it: lower case, anything else a dash. */
function tidyTag(value: string | null | undefined): string | null {
  const t = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return t || null;
}

/** A referring address that is HireFlow's front page itself (any tags). */
function fromFrontPage(referrer: string | null | undefined): boolean {
  if (!referrer) return false;
  try {
    const from = new URL(referrer);
    return /^(www\.)?hireflownow\.com$/.test(from.hostname.toLowerCase()) && from.pathname === "/";
  } catch {
    return false;
  }
}

/** The bare host of a referring address that is not HireFlow's own, or null. */
function outsideHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    return host && !/(^|\.)hireflownow\.com$/.test(host) && /^[a-z0-9._-]{1,60}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/**
 * A link on one of the app's own public pages (Open jobs, a job's page, a
 * business's careers page) that carries the visitor's channel on, the way
 * public/carry-source.js does on the static pages (the app's page shell has
 * no carry-source.js):
 *   - campaign tags in the page's address (tidied as the counter does) replace
 *     the link's own, which stays as the campaign when they bring none;
 *   - with none, the site that sent them (a carried `ref`, or the page's own
 *     referrer) is the source, as `utm_medium=referral`, and the link's own
 *     source is kept as the campaign, so "job_page" still shows (the third
 *     and fourth growth reviews: Open jobs' "Post a job free" recorded a
 *     Quora visitor as open_jobs, and job pages' links overwrote the
 *     visitor's channel).
 */
export function withVisitorTags(base: string, here: string, referrer?: string | null): string {
  let carried: URLSearchParams;
  let url: URL;
  try {
    carried = new URL(here, "https://hireflownow.com").searchParams;
    url = new URL(base, "https://hireflownow.com");
  } catch {
    return base;
  }
  const tags = (["utm_source", "utm_medium", "utm_campaign"] as const).map((key) => [key, tidyTag(carried.get(key))] as const).filter(([, v]) => v);
  const carriedRef = tidyTag(carried.get("ref"));
  const ref = carriedRef && !carriedRef.includes("hireflownow.com") ? carriedRef : outsideHost(referrer);
  // A hiring link's mark goes last, and only on a visitor's first one: tags
  // that already name a hiring link mean they came in through one and it was
  // counted then, so a second "Post a job free" (Open jobs' after a job
  // page's) is the same visit moving on (the sixth growth review: a hiring
  // link counts once, the first time).
  // Nor on a page opened from the front page: the visitor was counted there,
  // so "Post a job free" from Open jobs after it is the same visit going back
  // (the seventh growth review: one YouTube visitor read as youtube 2, and one
  // with a campaign tag, whose tags never name a hiring link, as one visit per
  // click). Only the front page itself: a visitor who came to Open jobs from a
  // guide, or a job opened in a new tab, was not counted there (the eighth
  // growth review).
  const throughHiringLink = tags.some(([key, v]) => (key === "utm_medium" ? v === "hiring_link" : (HIRING_LINK_SOURCES as readonly string[]).includes(v as string)));
  const hadMark = url.searchParams.has(HIRING_LINK_MARK);
  const backFromFrontPage = hadMark && fromFrontPage(referrer);
  const marked = url.searchParams.get(HIRING_LINK_MARK) === "1" && !throughHiringLink && !backFromFrontPage;
  url.searchParams.delete(HIRING_LINK_MARK);
  // Going back that way it is no way in, so it takes back only the visitor's
  // own channel, never the link's own source as a campaign: the sign-up must
  // not credit "open_jobs" with a click nobody counted (the eighth growth
  // review: "Business · open_jobs" with no open_jobs visit anywhere).
  if (backFromFrontPage) {
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) url.searchParams.delete(key);
    if (tags.length > 0) {
      for (const [key, v] of tags) url.searchParams.set(key, v as string);
    } else if (ref) {
      url.searchParams.set("utm_source", ref);
      url.searchParams.set("utm_medium", "referral");
      url.searchParams.set("ref", ref);
    }
    return base.startsWith("/") ? `${url.pathname}${url.search}` : url.toString();
  }
  if (tags.length > 0) {
    const own = url.searchParams.get("utm_source");
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) url.searchParams.delete(key);
    for (const [key, v] of tags) url.searchParams.set(key, v as string);
    // Tags with no campaign keep the link's own source as the campaign, so a
    // business that found HireFlow through another's shared job still shows
    // as "job_page" (the fifth growth review: it read as plain "facebook",
    // the same row as the owner's own posts).
    if (own && !url.searchParams.get("utm_campaign")) url.searchParams.set("utm_campaign", own);
  } else if (ref) {
    const own = url.searchParams.get("utm_source");
    if (own) {
      if (!url.searchParams.get("utm_campaign")) url.searchParams.set("utm_campaign", own);
      url.searchParams.set("utm_source", ref);
      url.searchParams.set("utm_medium", "referral");
    }
    url.searchParams.set("ref", ref);
  } else if (marked || !hadMark) {
    return base;
  }
  if (marked) url.searchParams.set(HIRING_LINK_MARK, "1");
  return base.startsWith("/") ? `${url.pathname}${url.search}` : url.toString();
}
