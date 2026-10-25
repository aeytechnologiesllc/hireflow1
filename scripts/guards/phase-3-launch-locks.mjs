/**
 * Phase 3 of docs/LAUNCH-PLAN.md, locked (2026-10-25): the look.
 *
 *   - applicant-rail-is-four-milestones: "where they are" on the applicants
 *     list and the first-hire guide is Applied → Tested → Interview → Hired
 *     (the owner chose Option C), never one dot per step again.
 *   - one-logo-mark: the brass rising line on the ink tile, in the icons, the
 *     app's wordmark and the front page.
 *   - landing-single-cta-pinned: one button, "Post your first job free", in a
 *     bar pinned for the whole page, the opening and the end.
 *   - share-image-neutral-for-other-businesses: a job or careers link from any
 *     business shows the plain picture, never "remote"/"work from home".
 */

const MARK_TILE = "#14120E";
const MARK_LINE = "#E0B96A";

export default [
  {
    id: "one-logo-mark",
    why:
      "One logo everywhere (docs/LAUNCH-PLAN.md, Phase 3, task 1): the brass rising line on the ink tile. " +
      "scripts/make-app-icons.mjs draws every icon from it, Wordmark.tsx draws it in the app, and the front " +
      "page's bar carries the same drawing (the old ivory 'H' tile is gone).",
    run: async ({ read }) => {
      const detail = [];
      const icons = (await read("scripts/make-app-icons.mjs")) ?? "";
      if (!icons.includes(`const TILE = "${MARK_TILE}", LINE = "${MARK_LINE}";`)) detail.push("scripts/make-app-icons.mjs: the icon is not the brass line on the ink tile");
      const svg = (await read("public/favicon.svg")) ?? "";
      if (!svg.includes(`fill="${MARK_TILE}"`) || !svg.includes(`stroke="${MARK_LINE}"`)) detail.push("public/favicon.svg: not regenerated from the mark (run node scripts/make-app-icons.mjs)");
      const word = (await read("src/cockpit/components/Wordmark.tsx")) ?? "";
      if (!word.includes(`const MARK_TILE = "${MARK_TILE}";`) || !word.includes(`const MARK_LINE = "${MARK_LINE}";`)) detail.push("Wordmark.tsx: the in-app mark is not the icon's colours");
      const landing = (await read("public/landing.html")) ?? "";
      if (/<b>H<\/b>HireFlow/.test(landing) || !landing.includes(`stroke="${MARK_LINE}"`)) detail.push("public/landing.html: the bar does not carry the mark");
      for (const file of ["index.html", "public/landing.html", "public/site.webmanifest"]) {
        if (/\?v=6\b/.test((await read(file)) ?? "")) detail.push(`${file}: icon links still ?v=6 (bump when the icon changes)`);
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "landing-single-cta-pinned",
    why:
      "The front page has one button, 'Post your first job free' (to the sign-up tab), in a bar pinned for the " +
      "whole page, as the opening's main button and again at the end (docs/LAUNCH-PLAN.md, Phase 3, task 3).",
    run: async ({ read }) => {
      const detail = [];
      const page = (await read("public/landing.html")) ?? "";
      if (!/\.bar \{ position: fixed;/.test(page)) detail.push("the bar is not pinned (position: fixed)");
      const ctas = page.match(/href="https:\/\/staff\.hireflownow\.com\/auth\?mode=signup" id="(startFree|heroStart|endStart)"/g) ?? [];
      if (ctas.length !== 3) detail.push(`expected the one button in the bar, the opening and the end; found ${ctas.length}`);
      if (/Watch it again|Start hiring free/.test(page)) detail.push("an old second call to action is back");
      if (/sweepstake|casino|payout/i.test(page)) detail.push("sweepstakes/casino/payout wording is back on the front page");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "share-image-neutral-for-other-businesses",
    why:
      "A shared job or careers link from any business shows public/share/careers.jpg, a plain 'Now hiring. " +
      "Apply online.' picture made by scripts/make-share-images.mjs; only the owner's own business keeps " +
      "zulu-careers.jpg. It must never say remote or work from home for every business.",
    run: async ({ read }) => {
      const detail = [];
      const maker = (await read("scripts/make-share-images.mjs")) ?? "";
      const careersBlock = maker.slice(maker.indexOf("public/share/careers.jpg`"));
      if (!careersBlock || /remote|work from home/i.test(careersBlock.slice(0, 600))) detail.push("scripts/make-share-images.mjs: the careers picture says remote or work from home");
      const job = (await read("api/job-prerender.mjs")) ?? "";
      if (!/\$\{home \? "zulu-careers" : "careers"\}\.jpg/.test(job)) detail.push("api/job-prerender.mjs: a non-home business's job link must show careers.jpg");
      const shell = (await read("index.html")) ?? "";
      if (/remote jobs/i.test(shell)) detail.push("index.html: the shell's description says remote jobs for every business");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
  {
    id: "applicant-rail-is-four-milestones",
    why:
      "The applicants list drew one dot per journey step (eleven on the owner's job; the owner: " +
      "\"I don't like how these weird dots appear\"). It is four milestones, Applied → Tested → " +
      "Interview → Hired (src/cockpit/lib/milestones.ts, MilestoneRail in ApplicantRow.tsx), on the " +
      "table row, the phone card and the first-hire guide.",
    run: async ({ read }) => {
      const detail = [];
      const lib = (await read("src/cockpit/lib/milestones.ts")) ?? "";
      if (!/export const MILESTONE_LABELS = \["Applied", "Tested", "Interview", "Hired"\] as const;/.test(lib)) {
        detail.push("src/cockpit/lib/milestones.ts: the four milestones are not Applied, Tested, Interview, Hired");
      }
      const row = (await read("src/cockpit/components/ApplicantRow.tsx")) ?? "";
      const rails = (row.match(/<MilestoneRail view=\{row\.milestones\}/g) ?? []).length;
      if (rails < 2) detail.push("ApplicantRow.tsx: the table row and the phone card must both draw <MilestoneRail view={row.milestones} />");
      if (/export function JourneyDots\b|<JourneyDots\b/.test(row)) detail.push("ApplicantRow.tsx: the per-step dot rail is back");
      const guide = (await read("src/cockpit/components/journey/GuideStages.tsx")) ?? "";
      if (/<JourneyDots\b/.test(guide) || !/<MilestoneRail /.test(guide)) detail.push("GuideStages.tsx: the first-hire guide must draw the milestones");
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
