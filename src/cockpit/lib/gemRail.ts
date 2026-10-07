/**
 * gemRail.ts — the curated jade → mint → teal → gold spectrum shared by every
 * gem-rail rendering in the cockpit: the single-candidate journey rail on the
 * applicant profile (ApplicantJourneyRail, `ck-rail-*`), and the aggregate "Pipeline at a glance"
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

// ============================================================================
// The calm rail's glide (GemRail motion="calm": the applicant profile)
// ============================================================================

/** The glide's easing: cubic-bezier(0.4, 0, 0.2, 1), the cockpit's own
 *  (ck-rise, ck-draw-x). Written in cockpit.css as the same four numbers. */
export const GLIDE_EASING = [0.4, 0, 0.2, 1] as const;

/** The rail rests this long before the opening starts, so the page's own
 *  turn (ck-page, 230 ms) has mostly landed before anything travels. */
export const OPENING_HOLD_MS = 140;

/**
 * How long one glide takes over `px` of track: longer for a longer run, so a
 * wide screen's rail is not crossed in a blur and a phone's is not slow.
 * 660 ms for one gem on a laptop, about 0.8 s for half the rail, never over 1.2 s.
 */
export function glideMs(px: number): number {
  const run = Number.isFinite(px) ? Math.max(0, px) : 0;
  return Math.round(Math.min(1200, Math.max(660, 600 + run * 0.4)));
}

/**
 * The share of the glide's time (0 to 1) at which the traveller has covered
 * `covered` (0 to 1) of the distance: the inverse of GLIDE_EASING, so each gem
 * can ink exactly as the line reaches it instead of on a clock of its own.
 * With y1 = 0 and y2 = 1 the curve's distance is s²(3 − 2s), which only rises,
 * so a bisection finds s; the time is the curve's x at that s.
 */
export function glideTimeAt(covered: number): number {
  if (!(covered > 0)) return 0;
  if (covered >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 26; i += 1) {
    const s = (lo + hi) / 2;
    if (s * s * (3 - 2 * s) < covered) lo = s;
    else hi = s;
  }
  const s = (lo + hi) / 2;
  const u = 1 - s;
  return 3 * u * u * s * GLIDE_EASING[0] + 3 * u * s * s * GLIDE_EASING[2] + s * s * s;
}
