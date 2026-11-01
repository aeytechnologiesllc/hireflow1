/**
 * A job's days left as a ring that empties as the days pass (2026-11-01; the
 * owner pointed at a credits meter that drains: pricing is per job, so the
 * meter is days left, not applicants). The arc is the action jade; the last
 * three days turn copper (--under) so a job about to close is seen in time.
 * Never brass: days are not money.
 */
import { ringFraction } from "@/lib/billing";

export function DaysRing({
  left,
  total,
  size = 28,
  stroke = 3,
  showNumber = true,
  className,
}: {
  left: number;
  total: number;
  size?: number;
  stroke?: number;
  showNumber?: boolean;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fraction = ringFraction(left, total);
  const low = left <= 3;
  const label = left <= 1 ? "Last day" : `${left} of ${total} days left`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ""}`}
      style={{ width: size, height: size }}
      data-days-ring={left}
    >
      {/* Sized inline: a page's own "button svg" rule must not shrink the ring. */}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ width: size, height: size, maxWidth: "none" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={low ? "var(--under)" : "var(--action)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * fraction} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {showNumber && (
        <span
          className="absolute inset-0 flex items-center justify-center font-semibold tabular-nums"
          style={{ fontSize: Math.max(9, Math.round(size * 0.36)), color: low ? "var(--under)" : "var(--ink)" }}
        >
          {left}
        </span>
      )}
    </span>
  );
}
