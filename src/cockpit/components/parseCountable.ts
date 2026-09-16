/**
 * Parse a display value into an animatable spec. Returns null when the value
 * isn't purely numeric (e.g. it carries non-number characters) so callers can
 * fall back to rendering it verbatim.
 *
 * Split out of CountUp.tsx (react-refresh/only-export-components: that file
 * should export only the CountUp component) — this has no dependency on it.
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
