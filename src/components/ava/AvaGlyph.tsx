/**
 * AvaGlyph — the small, static "Ava" mark: a miniature of the orb (jade→brass core inside a
 * faint dotted ring). Use this ANYWHERE a label needs an Ava/AI icon. Never use sparkles, stars,
 * wands, bot, or brain icons for Ava — this glyph is the mark.
 */
import type { CSSProperties } from "react";

interface AvaGlyphProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

// A single shared gradient def is fine: duplicate identical <defs> resolve to the same paint.
const GRAD_ID = "ava-glyph-core";

export function AvaGlyph({ size = 14, className, style }: AvaGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <defs>
        <radialGradient id={GRAD_ID} cx="38%" cy="32%" r="78%">
          <stop offset="0%" stopColor="var(--hf-gold)" />
          <stop offset="40%" stopColor="hsl(var(--ck-jade))" />
          <stop offset="100%" stopColor="var(--hf-green-soft)" />
        </radialGradient>
      </defs>
      {/* dotted halo — echoes the orb's dotted mesh */}
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="hsl(var(--ck-brass) / 0.55)" strokeWidth="1" strokeDasharray="1 2.3" />
      {/* core */}
      <circle cx="12" cy="12" r="8.4" fill={`url(#${GRAD_ID})`} />
      {/* specular highlight */}
      <circle cx="9.2" cy="9" r="2.1" fill="color-mix(in srgb, var(--hf-gold) 50%, transparent)" />
    </svg>
  );
}

export default AvaGlyph;
