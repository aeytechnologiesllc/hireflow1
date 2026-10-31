/**
 * A tint for an initials circle (2026-10-30): one of the four
 * gem stops, picked from the initials so a person keeps the same one on the
 * list and on their profile. They were all the same grey disc.
 *
 * Pure, no imports.
 */
export function initialsTint(initials: string): { background: string; color: string; borderColor: string } {
  const stop = ([...initials].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 4) + 1;
  return {
    background: `color-mix(in srgb, var(--gem-${stop}) 26%, var(--surface))`,
    // --initials-share (cockpit.css): 45% by Day, 55% at Night, so the
    // letters read 4.5:1 on their tint in both (theme_contrast.test.mjs).
    color: `color-mix(in srgb, var(--gem-${stop}) var(--initials-share, 55%), var(--ink))`,
    borderColor: `color-mix(in srgb, var(--gem-${stop}) 35%, var(--line))`,
  };
}
