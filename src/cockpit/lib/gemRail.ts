/**
 * gemRail.ts — the curated jade → mint → teal → gold spectrum shared by every
 * gem-rail rendering in the cockpit: the single-candidate JourneyStrip on the
 * Applicants panel (`ck-rail-*`), and the aggregate "Pipeline at a glance"
 * miniature on the Dashboard (`ck-mini-rail-*`). One interpolation, used by
 * both, so a step at the same relative position always reads the same color
 * regardless of which screen is drawing it.
 *
 * The actual hex values live once, as `--gem-*` tokens in cockpit.css (themed
 * via `.dark`) — this module only ever picks *where* a node sits on that
 * spectrum and which neighboring stop's ink it should read against.
 * `color-mix()` does the blending live in the browser, so a gem's fill stays
 * correct across a theme flip with no re-render required.
 */

const GEM_STOPS = ["jade", "mint", "teal", "gold"] as const;

const GEM_INK: Record<(typeof GEM_STOPS)[number], string> = {
  jade: "var(--gem-ink-jade)",
  mint: "var(--gem-ink-mint)",
  teal: "var(--gem-ink-teal)",
  gold: "var(--gem-ink-gold)",
};

/** Where step `index` of `total` sits on the spectrum: a fill blended between
 *  its two neighboring stops, and the ink (deep ink or ivory) of whichever
 *  stop it sits closer to — picked for contrast, not for looks. */
export function gemPosition(index: number, total: number): { color: string; ink: string } {
  const segCount = GEM_STOPS.length - 1;
  const t = total > 1 ? index / (total - 1) : 0;
  const scaled = Math.min(segCount, Math.max(0, t * segCount));
  const seg = Math.min(segCount - 1, Math.floor(scaled));
  const local = scaled - seg;
  const a = GEM_STOPS[seg];
  const b = GEM_STOPS[seg + 1];
  return {
    color: `color-mix(in srgb, var(--gem-${b}) ${(local * 100).toFixed(1)}%, var(--gem-${a}))`,
    ink: GEM_INK[local < 0.5 ? a : b],
  };
}
