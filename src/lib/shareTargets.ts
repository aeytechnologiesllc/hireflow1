/**
 * shareTargets.ts — where a business can post its job (2026-10-25;
 * docs/LAUNCH-PLAN.md, Phase 2, task 6).
 *
 * The share step pointed every business at OnlineJobs.ph, the board the
 * owner hires on, in the owner's own voice ("where we hire our own chat
 * agents"). A clinic in Ohio does not hire there. HireFlow posts to no board
 * itself; this is the list of places to post, each opened in a new tab.
 *
 * The share links carry campaign tags (utm_source = the place, utm_medium =
 * "job_share"), so the job page's visit count (public/beacon.js →
 * page_view_daily) shows which place sent people. The link a person copies
 * by hand stays plain: it is pasted into chats and emails, where tags read
 * as noise.
 *
 * No imports: scripts/share_targets.test.mjs loads it in Node.
 */

export type ShareTargetId = "facebook" | "linkedin" | "indeed" | "onlinejobs";

export interface ShareTarget {
  id: ShareTargetId;
  label: string;
  /** One line under the button: what to do there. */
  hint: string;
  /** Said on the button itself where there is no room for the hint (a phone has no hover). */
  short?: string;
  href: string;
}

/** The job's link with this place's campaign tags (tags it already has are kept). */
export function taggedLink(link: string, source: ShareTargetId): string {
  try {
    const url = new URL(link);
    if (url.protocol !== "https:" && url.protocol !== "http:") return link;
    if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", source);
    if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "job_share");
    return url.toString();
  } catch {
    return link;
  }
}

export const INDEED_POST_URL = "https://employers.indeed.com/";
export const ONLINEJOBS_URL = "https://www.onlinejobs.ph/";

/** The places, in the order shown. */
export function shareTargets(link: string): ShareTarget[] {
  return [
    {
      id: "facebook",
      label: "Facebook",
      hint: "Share it on your page or in a local jobs group.",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(taggedLink(link, "facebook"))}`,
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      hint: "Share it from your profile or your company page.",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(taggedLink(link, "linkedin"))}`,
    },
    {
      id: "indeed",
      label: "Indeed",
      hint: "Post a job there and paste the full post.",
      href: INDEED_POST_URL,
    },
    {
      id: "onlinejobs",
      label: "OnlineJobs.ph",
      hint: "For hiring in the Philippines. Paste the full post.",
      short: "Philippines",
      href: ONLINEJOBS_URL,
    },
  ];
}
