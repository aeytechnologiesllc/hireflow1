/**
 * Guided tips (the 2026-10-11 "Guided start" mock-up, approved by the owner):
 * how a new business learns HireFlow without a tour. Each tip shows once, at
 * the moment it matters, attached to the thing it explains, then it is gone
 * for good ("Got it", on every device). One at a time; never over a box
 * they're typing in; "No more tips" turns them all off and Settings brings
 * the unseen ones back. The first moment of the mock-up is the dashboard's
 * first steps (FirstStepsGuide), which is not a tip.
 *
 * Who sees them: businesses and team members whose account was made from the
 * day tips shipped. Never the platform's own account, never applicants.
 *
 * This file is the rules and the words only, with no React, so
 * scripts/guided_tips.test.mjs can check them. GuidedTips.tsx draws them.
 */

/** Accounts made from here on see tips; everyone before never does. */
export const TIPS_SINCE = "2026-10-11T08:00:00Z";
/** The row that means "No more tips". */
export const TIPS_OFF = "all_off";

export type TipKey = "jobs_share" | "applicants_first" | "applicant_rail" | "applicant_decide" | "messages_first" | "documents_first";

export interface Tip {
  key: TipKey;
  kicker: string;
  title: string;
  body: string;
  /** Where it attaches: the first selector that finds something on the page. */
  anchors: string[];
  /** "Next" instead of "Got it": another tip follows on the same page. */
  next?: boolean;
}

const JOBS_SHARE: Tip = {
  key: "jobs_share",
  kicker: "Your job is live",
  title: "Now send people to it",
  body: "Share link gives you the apply link and the full post to paste on OnlineJobs.ph. Whoever opens it applies right here, and you'll see them in Applicants.",
  anchors: ['[data-tip-anchor="share"]'],
};

const APPLICANTS_FIRST: Tip = {
  key: "applicants_first",
  kicker: "Your first applicant",
  title: "Applicants land here, best first",
  body: "Ava reads each one and scores them as they finish the steps. Open one to see everything they did.",
  anchors: ["[data-applicant-row]"],
};

const APPLICANT_RAIL: Tip = {
  key: "applicant_rail",
  kicker: "1 of 2 · Where they are",
  title: "Every step, as they finish it",
  body: "Each step lights up when they're done. Their answers, the timing and Ava's notes are further down the page.",
  // The wide rail, or the phone's "Where they are" card.
  anchors: [".ckp-journey", 'section[aria-labelledby="ck-journey-label"]'],
  next: true,
};

const APPLICANT_DECIDE: Tip = {
  key: "applicant_decide",
  kicker: "2 of 2 · Your move",
  title: "Nothing happens until you say",
  body: "Move them on, message them, or pass. Ava suggests; you decide.",
  // The decision card, or the phone's decision bar along the bottom.
  anchors: [".ckp-decide", '[data-tip-anchor="decide"]', "div.fixed.inset-x-0.z-30"],
};

const MESSAGES_FIRST: Tip = {
  key: "messages_first",
  kicker: "Messages",
  title: "Applicants write to you here",
  body: "They can't reply to emails, so every conversation stays in one place, and nobody sees your email address.",
  anchors: ["[data-thread-row]", '[data-tip-anchor="messages"]'],
};

function documentsFirst(canAskForPapers: boolean): Tip {
  return {
    key: "documents_first",
    kicker: "Documents",
    title: "Offer letters and papers, signed online",
    body: canAskForPapers
      ? "Send an offer, ask for an ID, or upload your own file to sign. ID papers delete themselves 24 hours after you open them."
      : "Send an offer, or upload your own file to sign. Everything sent and signed is kept here.",
    anchors: ["[data-offer-open]"],
  };
}

/** The tips a page can show, in the order they show. */
export function tipsForPage(pathname: string, opts: { canAskForPapers: boolean }): Tip[] {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/jobs") return [JOBS_SHARE];
  if (path === "/applicants") return [APPLICANTS_FIRST];
  if (/^\/applicants\/[^/]+$/.test(path)) return [APPLICANT_RAIL, APPLICANT_DECIDE];
  if (path === "/messages") return [MESSAGES_FIRST];
  if (path === "/documents") return [documentsFirst(opts.canAskForPapers)];
  return [];
}

/** Every tip there is (Settings, tests). */
export const ALL_TIP_KEYS: readonly TipKey[] = ["jobs_share", "applicants_first", "applicant_rail", "applicant_decide", "messages_first", "documents_first"];

/** Whether this person sees tips at all. */
export function tipsEligible(who: {
  createdAt: string | null | undefined;
  isPlatformAdmin: boolean;
  role: string | null | undefined;
  isTeamMember: boolean;
  /** The offline preview's switch (?__previewTips=1). */
  forced?: boolean;
}): boolean {
  if (who.isPlatformAdmin) return false;
  if (who.role !== "employer" && !who.isTeamMember) return false;
  if (who.forced) return true;
  const made = who.createdAt ? Date.parse(who.createdAt) : NaN;
  return Number.isFinite(made) && made >= Date.parse(TIPS_SINCE);
}

/** The tip to show next on this page, or none. */
export function nextTip(tips: Tip[], seen: ReadonlySet<string>): Tip | null {
  if (seen.has(TIPS_OFF)) return null;
  return tips.find((t) => !seen.has(t.key)) ?? null;
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Where the tip goes beside its anchor: below it when there is room, above
 * it otherwise; its arrow points at the anchor's middle; never past the
 * screen's edges.
 */
export function placeTip(
  anchor: Box,
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  { margin = 12, gap = 12, arrowInset = 22 } = {},
): { top: number; left: number; side: "below" | "above"; arrowX: number } {
  const below = anchor.top + anchor.height + gap;
  const roomBelow = viewport.height - below - margin;
  const roomAbove = anchor.top - gap - margin;
  const side: "below" | "above" = roomBelow >= tip.height || roomBelow >= roomAbove ? "below" : "above";
  const rawTop = side === "below" ? below : anchor.top - gap - tip.height;
  const top = Math.max(margin, Math.min(rawTop, viewport.height - margin - tip.height));
  const middle = anchor.left + anchor.width / 2;
  const rawLeft = middle - arrowInset;
  const left = Math.max(margin, Math.min(rawLeft, viewport.width - margin - tip.width));
  const arrowX = Math.max(arrowInset - 6, Math.min(middle - left, tip.width - arrowInset + 6));
  return { top: Math.round(top), left: Math.round(left), side, arrowX: Math.round(arrowX) };
}
