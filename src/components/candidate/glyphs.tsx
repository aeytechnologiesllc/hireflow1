/**
 * Brand glyph kit — the candidate side's identity marks.
 *
 * Hand-drawn-feel, single-weight line icons in the HireFlow brand family:
 * the rising line (the same climbing path as the Wordmark, M4 18 L9 7 L14 15
 * L20 6), the wax seal's double ring, and letterhead motifs like a folded
 * letter. Every glyph shares one voice — currentColor stroke, round caps
 * and joins, a 24x24 grid, and a single small filled accent (a dot, a seal)
 * that echoes across the family.
 *
 * These are the ONLY icons allowed to carry a candidate screen's identity —
 * the focal mark on a journey header, an empty state, a milestone card.
 * Small utility chrome (a chevron, an eye, a close button) can still come
 * from lucide-react; a stock briefcase, clipboard, camera, sparkle, star,
 * wand, bot, or brain glyph may not.
 */
import type { CSSProperties, ReactNode } from "react";

export interface GlyphProps {
  /** Rendered size in px (square). */
  size?: number;
  /** Stroke weight — keep within the family's 1.8–2.2 range. */
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  /** Give it a label only where the glyph is the sole indication of meaning. */
  title?: string;
}

function GlyphBase({
  size = 24,
  strokeWidth = 2,
  className,
  style,
  title,
  children,
}: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      style={{ flexShrink: 0, ...style }}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/**
 * GlyphJourney — the brand's rising path, with a filled dot at the current
 * bend. Use it wherever a screen needs to say "here's where you are" —
 * journey headers, a phase's opening moment.
 */
export function GlyphJourney(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <path d="M4 18 L9 7 L14 15 L20 6" />
      <circle cx="14" cy="15" r="1.6" fill="currentColor" stroke="none" />
    </GlyphBase>
  );
}

/**
 * GlyphLetter — a folded letter carrying a tiny pressed seal: an
 * application or message on its way. Use for submissions, invites, notes.
 */
export function GlyphLetter(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <path d="M7 4 H14 L18 8 V20 H7 Z" />
      <path d="M14 4 V8 H18" />
      <circle cx="12" cy="14.5" r="1.7" fill="currentColor" stroke="none" />
    </GlyphBase>
  );
}

/**
 * GlyphVoice — a small brand waveform, five uneven bars. Deliberately not a
 * microphone. Use for anything spoken or recorded.
 */
export function GlyphVoice(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <line x1="4" y1="8" x2="4" y2="16" />
      <line x1="8" y1="5" x2="8" y2="19" />
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="16" y1="6" x2="16" y2="18" />
      <line x1="20" y1="9" x2="20" y2="15" />
    </GlyphBase>
  );
}

/**
 * GlyphCheckSeal — a check inside the seal's double ring. Use for
 * confirmed, submitted, or completed states.
 */
export function GlyphCheckSeal(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="6.6" />
      <path d="M8.7 12.4 L10.9 14.8 L15.6 9.4" />
    </GlyphBase>
  );
}

/**
 * GlyphClock — a minimal, brand-weight clock: no numerals, one filled
 * pivot at the center. Use for waiting, timing, and pacing moments.
 */
export function GlyphClock(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 12 L12 7" />
      <path d="M12 12 L16 9" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </GlyphBase>
  );
}

/**
 * GlyphSteps — three ascending dashes climbing along the brand's rising
 * line. Use beside "Step X of N" and other progress language.
 */
export function GlyphSteps(props: GlyphProps) {
  return (
    <GlyphBase {...props}>
      <path d="M4 19 L9 19" />
      <path d="M9.5 13 L14.5 13" />
      <path d="M15 7 L20 7" />
    </GlyphBase>
  );
}
