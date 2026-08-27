/**
 * AvaSeal — Ava's mark: a wax seal pressed onto the page.
 *
 * This replaces the orb. It is a BADGE, not a hero graphic: it belongs on a
 * person's avatar, beside a line Ava wrote, or at the head of her read —
 * roughly 20–32px. It is deliberately not offered at hero scale, because the
 * design has no hero graphic; there the type carries the page.
 *
 * Drawn in code so it stays crisp at any size and follows the theme (the seal
 * tokens invert between Day and Night). Real wax never sits perfectly straight,
 * so each one can take a slight tilt.
 */
import type { CSSProperties } from "react";

interface AvaSealProps {
  /** Rendered size in px. Keep it badge-scale. */
  size?: number;
  /** Degrees of tilt, the way a pressed seal sits slightly off-square. */
  tilt?: number;
  className?: string;
  style?: CSSProperties;
  /** Give it a label only where it is the sole indication that Ava did this. */
  title?: string;
}

export function AvaSeal({ size = 24, tilt = 0, className, style, title }: AvaSealProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      style={{
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
        filter: "drop-shadow(0 1px 2px var(--seal-shadow))",
        flexShrink: 0,
        ...style,
      }}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="50" cy="50" r="46" fill="var(--seal-disc)" />
      <circle cx="50" cy="50" r="31" fill="none" stroke="var(--seal-ring)" strokeWidth="6" />
      <text
        x="50"
        y="52"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Fraunces, Georgia, serif"
        fontSize="52"
        fontWeight="700"
        fill="var(--seal-ring)"
      >
        A
      </text>
    </svg>
  );
}

export default AvaSeal;
