/**
 * Standard AvaOrb sizes — the ONLY orb dimensions that should be used app-wide.
 *
 * Founder rules (CLAUDE.md): no tiny orbs (in-UI orbs ≥ ~24px) and the
 * dotted-mesh wave must stay visible. Don't invent one-off sizes — pick the
 * closest token below.
 *
 *  - sm  (40px) : small in-UI accents — list/empty-state marks, inline avatars.
 *  - md (240px) : full-screen LOADER / hero — route fallbacks, "preparing…" and
 *                 post-sign-in screens where the orb is ALONE on screen and must
 *                 read as the star (was 144 — looked tiny in an empty viewport).
 *  - lg (280px) : max hero — the auth landing orb.
 *
 * Pair with the right LOD: `mode` is implicit in <AvaOrb> (rich by default); for
 * small in-UI orbs prefer the compact look via fewer dots — AvaOrb already
 * auto-scales density by size, so `sm` reads crisp without extra props.
 */
export const ORB_SIZE = {
  sm: 40,
  md: 240,
  lg: 280,
} as const;

export type OrbSizeToken = keyof typeof ORB_SIZE;
