import type { CSSProperties } from "react";

interface AvaGlyphProps {
  className?: string;
  style?: CSSProperties;
}

// The Ava mark — a monochrome orbit glyph (ring + core + satellite) in currentColor.
// This is the ONLY "Ava / AI is doing this" signifier in the app. HARD RULE: never use
// a generic sparkle / star / wand / bot / brain icon anywhere (they cheapen the brand).
export default function AvaGlyph({ className, style }: AvaGlyphProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style} aria-hidden="true">
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.6" opacity="0.85" />
      <circle cx="12" cy="12" r="2.15" fill="currentColor" />
      <circle cx="19" cy="12" r="1.55" fill="currentColor" />
    </svg>
  );
}
