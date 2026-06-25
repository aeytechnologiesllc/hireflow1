/**
 * Standard AvaOrb sizes — the ONLY orb dimensions that should be used app-wide.
 *
 * Founder rules (CLAUDE.md): no tiny orbs (in-UI orbs ≥ ~24px) and the
 * dotted-mesh wave must stay visible. Don't invent one-off sizes — pick the
 * closest token below.
 *
 *  - sm  (40px) : small in-UI accents — list/empty-state marks, inline avatars.
 *  - md (112px) : the standard LOADER size — route fallbacks, "preparing…" screens.
 *  - lg (208px) : large / hero — full-screen moments where the orb is the star.
 *
 * Pair with the right LOD: `mode` is implicit in <AvaOrb> (rich by default); for
 * small in-UI orbs prefer the compact look via fewer dots — AvaOrb already
 * auto-scales density by size, so `sm` reads crisp without extra props.
 */
export const ORB_SIZE = {
  sm: 40,
  md: 112,
  lg: 208,
} as const;

export type OrbSizeToken = keyof typeof ORB_SIZE;
