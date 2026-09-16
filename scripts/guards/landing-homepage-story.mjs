/**
 * 2026-09-16 homepage rebuild ("While You Slept" → the full 7-step story).
 *
 * The owner's decision was specific: the homepage must tell a CLEAR,
 * STEP-BY-STEP story of how HireFlow actually operates — brief Ava, she
 * publishes the job (Google finds it automatically), applicants apply
 * overnight, they go through the steps the employer chose, the employer
 * gets a ranked shortlist by morning, taps Interview and picks a time, then
 * sends the offer and both sign in HireFlow. The previous page only showed
 * the middle of that story (applying → screened → sealed shortlist); steps
 * 1, 2, 6 and 7 did not exist anywhere on the page as real product moments.
 * This guard keeps that regression from coming back quietly — e.g. someone
 * reverting the "how it works" section to its old 3-step icon-card summary,
 * or dropping the interview/offer beats when trimming the page for length.
 *
 * It also pins the fix for the concrete bug that shipped alongside the
 * rebuild: `.twocol` (the two-card layout `#how` and `#hire` both use) is a
 * CSS grid with plain `1fr` columns, which have an implicit `min-width:auto`
 * — a single unbroken run of text inside one card (the step-1 typed line)
 * was enough to blow the grid track past the viewport at 390–820px widths,
 * pushing every card in that row off-screen. `minmax(0,1fr)` is the
 * standard fix (the same guard the original `.steps` grid already used
 * one section up); losing it silently reopens the same class of bug for any
 * future long line of text in either card.
 */

export default [
  {
    id: "landing-tells-the-full-seven-step-story",
    why:
      "public/landing.html must keep real product moments for all 7 steps of how HireFlow " +
      "works (brief Ava → she publishes it → applies overnight → screened → morning shortlist " +
      "→ interview → offer/sign), not just the night-shift/morning-read middle of the story.",
    run: async ({ read }) => {
      const html = (await read("public/landing.html")) ?? "";
      const missing = [];
      const need = [
        ['id="how" (steps 1–2 section)', /id="how"/],
        ['id="hire" (steps 6–7 section)', /id="hire"/],
        ["step 1 — tell Ava the brief", /Tell Ava what you need/],
        ["step 2 — published, Google finds it automatically", /Google indexes it automatically/],
        ["step 5 label on the morning read", /Step 5\s*&middot;\s*The morning read|Step 5 · The morning read/],
        ["step 6 — tap Interview", />You tap Interview</],
        ["step 7 — send the offer, sign in HireFlow", />You send the offer</],
        ["offer step confirms both parties actually sign", /both signed in HireFlow/],
        ["beacon.js include (visit counting)", /beacon\.js/],
      ];
      for (const [label, re] of need) {
        if (!re.test(html)) missing.push(`public/landing.html no longer contains: ${label}`);
      }
      return missing.length ? { ok: false, detail: missing } : { ok: true };
    },
  },
  {
    id: "landing-twocol-grid-cannot-overflow-narrow-widths",
    why:
      "public/landing.html's .twocol grid (used by the steps 1–2 and steps 6–7 cards) must use " +
      "minmax(0,1fr) columns. Plain 1fr columns default to min-width:auto, so one unbroken run " +
      "of text in a card silently forces the whole grid — and every card sharing its row — past " +
      "the viewport at phone/tablet widths (390–820px), pushing content off-screen. This shipped " +
      "and was caught by eye, not by any check; minmax(0,1fr) is the fix, matching the guard the " +
      "page's older .steps grid already carried.",
    run: async ({ read }) => {
      const html = (await read("public/landing.html")) ?? "";
      const m = html.match(/\.twocol\{[^}]*grid-template-columns:\s*([^;]+);/);
      if (!m) return { ok: false, detail: ["public/landing.html: .twocol rule not found"] };
      const cols = m[1];
      if (!/minmax\(\s*0\s*,/.test(cols)) {
        return {
          ok: false,
          detail: [`public/landing.html: .twocol grid-template-columns lost its minmax(0,1fr) guard (now "${cols.trim()}")`],
        };
      }
      return { ok: true };
    },
  },
];
