interface WordmarkProps {
  /** Height of the mark tile in px. The name scales with it. */
  size?: number;
  /** Hide the name and show the tile alone (collapsed rail, small screens). */
  markOnly?: boolean;
  className?: string;
}

/** The mark's own colours: the app icon's (scripts/make-app-icons.mjs), in both themes. */
const MARK_TILE = "#0C2A21";
const MARK_LINE = "#3FCE97";

/**
 * HireFlow — a jade rising line on a deep green tile, then the name. One logo
 * everywhere (the app icon, the favicon, the front page, the share pictures,
 * the blog; docs/LAUNCH-PLAN.md, Phase 3, task 1); green again since
 * 2026-10-30 (the owner: "I thought we'd keep it in the green"), after five
 * days as a brass line on an ink tile.
 *
 * The line is the product: applications come in flat and Ava lifts the ones
 * worth your time. Drawn in code so it stays crisp at any size. The tile keeps
 * the icon's colours in both themes; at night a jade hairline keeps it from
 * melting into the dark ground.
 */
export function Wordmark({ size = 26, markOnly = false, className }: WordmarkProps) {
  const glyph = Math.round(size * 0.58);
  return (
    <span className={`inline-flex items-center ${className ?? ""}`} style={{ gap: Math.round(size * 0.35) }}>
      <span
        className="inline-flex shrink-0 items-center justify-center"
        style={{
          width: size,
          height: size,
          borderRadius: "var(--r-ctl, 8px)",
          background: MARK_TILE,
          boxShadow: "var(--shadow-sm), inset 0 0 0 1px rgba(63, 206, 151, 0.22)",
        }}
      >
        <svg
          width={glyph}
          height={glyph}
          viewBox="0 0 24 24"
          fill="none"
          stroke={MARK_LINE}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 18 L9 7 L14 15 L20 6" />
        </svg>
      </span>
      {!markOnly && (
        <span
          className="font-display"
          style={{
            fontSize: Math.round(size * 0.69),
            fontWeight: 600,
            letterSpacing: "-0.01em",
            lineHeight: 1.15,
            color: "var(--hf-text)",
          }}
        >
          HireFlow
        </span>
      )}
    </span>
  );
}

export default Wordmark;
