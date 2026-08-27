interface WordmarkProps {
  /** Height of the mark tile in px. The name scales with it. */
  size?: number;
  /** Hide the name and show the tile alone (collapsed rail, small screens). */
  markOnly?: boolean;
  className?: string;
}

/**
 * HireFlow — a rising line pressed into a jade tile, then the name.
 *
 * The line is the product: applications come in flat and Ava lifts the ones
 * worth your time. Drawn in code so it stays crisp at any size and follows the
 * theme. This is the mark from the design; the old Fraunces "Hireflow" with a
 * brass sprout is retired.
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
          background: "var(--slab)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <svg
          width={glyph}
          height={glyph}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--jade-bright)"
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
