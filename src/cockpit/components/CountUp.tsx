import { useEffect, useRef, useState } from "react";

/**
 * CountUp — eased number roll-up for KPIs / big numbers (Deep Jade cockpit).
 *
 * Performance-first: a single requestAnimationFrame loop per number, no layout
 * thrash. Fully gated behind `prefers-reduced-motion: reduce` → the final value
 * shows instantly with no movement. Tabular numerals keep digits from jittering
 * width as they roll.
 */
function prefersReduced() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// easeOutCubic — fast, premium settle (most of the motion happens early).
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

interface CountUpProps {
  /** Target value to count to. */
  value: number;
  /** Decimal places to preserve (e.g. 1 → "6.8"). Default 0. */
  decimals?: number;
  /** Roll duration in ms. Default 900 (≈0.9s — quick, not sluggish). */
  duration?: number;
  /** Stagger start delay in ms. Default 0. */
  delay?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function CountUp({
  value,
  decimals = 0,
  duration = 900,
  delay = 0,
  prefix = "",
  suffix = "",
  className,
}: CountUpProps) {
  const reduced = prefersReduced();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    let startTs: number | null = null;
    const from = 0;
    const tick = (now: number) => {
      if (startTs === null) startTs = now;
      const elapsed = now - startTs - delay;
      if (elapsed < 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, elapsed / duration);
      setDisplay(from + (value - from) * ease(t));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, delay, reduced]);

  const formatted = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

/**
 * Parse a display value into an animatable spec. Returns null when the value
 * isn't purely numeric (e.g. it carries non-number characters) so callers can
 * fall back to rendering it verbatim.
 */
export function parseCountable(
  value: unknown,
): { num: number; decimals: number; prefix: string; suffix: string } | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { num: value, decimals: 0, prefix: "", suffix: "" };
  }
  if (typeof value !== "string") return null;
  const m = value.match(/^([^\d.-]*)(-?\d+(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const num = Number(m[2]);
  if (!Number.isFinite(num)) return null;
  const decimals = m[2].includes(".") ? m[2].split(".")[1].length : 0;
  return { num, decimals, prefix: m[1] ?? "", suffix: m[3] ?? "" };
}

export default CountUp;
