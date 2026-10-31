import type { CSSProperties } from "react";

interface WordmarkProps {
  /** Height of the seal in px. The name scales with it. */
  size?: number;
  /** Hide the name and show the seal alone (collapsed rail, small screens). */
  markOnly?: boolean;
  className?: string;
}

/**
 * The seal's outline: real wax never sets perfectly round. The drawing is the
 * owner's choice of 2026-10-31 ("D, the green seal"), on a 64-unit box, the
 * same one scripts/make-app-icons.mjs draws every icon from.
 */
const SEAL_RIM =
  "M32 3.2c4.6.3 7 2.5 11.4 3.6 4 1.1 7.8 1.4 10.4 4.6 2.8 3.3 2.5 7.1 4 11.2 1.4 3.9 3.8 6.7 3.3 11-.5 4.3-3.3 6.8-4.8 10.7-1.6 4-1.6 7.9-4.7 10.7-3.1 2.8-7.1 2.6-11.2 4-3.9 1.3-6.7 3.4-11 3-4.3-.5-6.7-3.1-10.6-4.8-3.9-1.6-7.8-1.9-10.4-5-2.6-3.1-2.3-7-3.7-10.9-1.4-3.9-3.7-6.8-3.1-11.2.6-4.2 3.6-6.5 5.3-10.2 1.7-3.9 2-7.8 5.3-10.4 3.3-2.6 7.1-2.2 11-3.4C25.6 5.1 27.6 3 32 3.2Z";
/** The rising line pressed into the wax (the old logo's line, M4 18 L9 7 L14 15 L20 6). */
const SEAL_LINE = "M21.5 39.5 L27 26.5 L32.5 35.3 L42.5 23.5";
/** Below 40 px: the same line, larger and thicker, and no rings (the favicon's drawing), so it reads at bar size. */
const SEAL_LINE_SMALL = "M18.4 41.9 L25.5 25 L32.7 36.4 L45.7 21.1";

/**
 * HireFlow's mark: Ava's green wax seal with the rising line pressed into it
 * (the owner chose it on 2026-10-31: "D, the green seal"). The logo is the
 * moment the product is about: Ava sealing the applicants worth a call. The
 * same seal is the app icon (on a paper square), the favicon, the loader, the
 * start screen, the front page's bar, the share pictures and the blog
 * (BRANDING.md). Drawn in code so it stays crisp at any size; the colours are
 * the wax's own in both themes. Below 40 px (every bar: 26 to 34 px) it draws
 * the favicon's simpler seal, a larger, thicker line and no rings: the full
 * drawing's 3.8-unit line and rings blur into the wax there.
 */
export function SealMark({ size = 26, className, style }: { size?: number; className?: string; style?: CSSProperties }) {
  const small = size < 40;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={className}
      style={{ display: "block", flexShrink: 0, ...style }}
    >
      <path d={SEAL_RIM} fill="#0A4A35" />
      <circle cx="32" cy="32" r="26.5" fill="#13734F" />
      {small ? (
        <>
          <circle cx="32" cy="32" r="20.5" fill="#11694C" />
          <path d={SEAL_LINE_SMALL} transform="translate(1.4 1.8)" fill="none" stroke="#49C094" strokeOpacity=".75" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <path d={SEAL_LINE_SMALL} fill="none" stroke="#063A27" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="32" cy="32" r="19.5" fill="#11694C" />
          <circle cx="32.6" cy="32.9" r="19.5" fill="none" stroke="#3DB088" strokeOpacity=".5" strokeWidth="1.6" />
          <circle cx="31.4" cy="31.2" r="19.5" fill="none" stroke="#06331F" strokeOpacity=".55" strokeWidth="1.6" />
          <path d={SEAL_LINE} transform="translate(.8 1)" fill="none" stroke="#49C094" strokeOpacity=".5" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d={SEAL_LINE} fill="none" stroke="#063A27" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
          <ellipse cx="21" cy="17" rx="6" ry="3" fill="#7FE0B8" opacity=".25" transform="rotate(-35 21 17)" />
        </>
      )}
    </svg>
  );
}

/** HireFlow: the green seal, then the name. */
export function Wordmark({ size = 26, markOnly = false, className }: WordmarkProps) {
  return (
    <span className={`inline-flex items-center ${className ?? ""}`} style={{ gap: Math.round(size * 0.35) }}>
      <SealMark size={size} style={{ filter: "drop-shadow(-0.5px 1.5px 1.5px rgba(10, 40, 28, 0.28))" }} />
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
