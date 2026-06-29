import { type ReactElement } from "react";

interface AvatarProps {
  /** Person's name or a key into the avatars map. Drives initials + the deterministic accent. */
  who: string | null;
  size?: number;
  initials?: string;
  /** Optional real photo URL. If provided, it is shown instead of the generated mark. */
  photo?: string;
  className?: string;
}

/* ── deterministic helpers ─────────────────────────────────────────────── */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function deriveInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Controlled accent palette — mint, brass, jade (no other hues).
const ACCENTS = ["hsl(156 58% 70%)", "hsl(38 66% 66%)", "hsl(150 48% 54%)"];
// Muted jade medallion fills (subtle per-person variation, all near-black jade).
const FILLS: Array<[string, string]> = [
  ["hsl(156 24% 15%)", "hsl(156 28% 8%)"],
  ["hsl(158 22% 14%)", "hsl(158 26% 8%)"],
  ["hsl(152 24% 16%)", "hsl(154 28% 9%)"],
  ["hsl(160 20% 13%)", "hsl(160 26% 8%)"],
];

/**
 * Generated candidate identity mark: cream initials inside a Deep Jade
 * medallion with a tiny procedural mint/brass/jade accent. Deterministic per
 * name (each person feels unique), readable small and elegant large. Solid &
 * premium — never glassy, never a stock face or generic silhouette.
 */
export function CkAvatar({ who, size = 40, initials, photo, className }: AvatarProps) {
  const realPhoto = photo ?? undefined;
  const name = who ?? initials ?? "?";
  const label = initials ?? deriveInitials(name);

  const ring = "inset 0 0 0 1px hsl(150 16% 20% / 0.85)";

  if (realPhoto) {
    return (
      <img
        src={realPhoto}
        alt=""
        className={className}
        style={{ width: size, height: size, borderRadius: 999, objectFit: "cover", boxShadow: ring, flexShrink: 0 }}
      />
    );
  }

  const h = hash(name);
  const accent = ACCENTS[h % ACCENTS.length];
  const [f0, f1] = FILLS[(h >>> 3) % FILLS.length];
  const pattern = (h >>> 6) % 4;
  const angle = [18, 96, 210, 300][(h >>> 9) % 4];

  const cx = 50;
  const cy = 50;
  const r = 50;
  // Motif anchor: just inside the ring, toward the "top" before rotation.
  const px = cx;
  const py = cy - r * 0.62;

  let motif: ReactElement;
  if (pattern === 0) {
    // constellation — 3 dots with a faint connector
    motif = (
      <g>
        <path d={`M ${px - 13} ${py + 4} L ${px + 1} ${py - 4} L ${px + 14} ${py + 3}`}
          stroke={accent} strokeWidth={1} fill="none" opacity={0.35} />
        <circle cx={px - 13} cy={py + 4} r={3.4} fill={accent} />
        <circle cx={px + 1} cy={py - 4} r={2.6} fill={accent} opacity={0.92} />
        <circle cx={px + 14} cy={py + 3} r={3} fill={accent} />
      </g>
    );
  } else if (pattern === 1) {
    // brass/jade tick — a short arc segment hugging the ring
    motif = (
      <path d={`M ${cx - 15} ${cy - r * 0.86} A ${r * 0.86} ${r * 0.86} 0 0 1 ${cx + 15} ${cy - r * 0.86}`}
        stroke={accent} strokeWidth={3.4} strokeLinecap="round" fill="none" />
    );
  } else if (pattern === 2) {
    // subtle wave mark
    motif = (
      <path d={`M ${px - 15} ${py} Q ${px - 7} ${py - 7}, ${px} ${py} T ${px + 15} ${py}`}
        stroke={accent} strokeWidth={2.6} strokeLinecap="round" fill="none" opacity={0.95} />
    );
  } else {
    // radial grain — scattered tiny dots
    const dots = [
      [px - 12, py + 2, 2.2],
      [px - 4, py - 5, 1.6],
      [px + 3, py + 3, 2],
      [px + 11, py - 3, 1.7],
      [px + 7, py + 7, 1.3],
    ];
    motif = (
      <g>
        {dots.map(([x, y, rr], i) => (
          <circle key={i} cx={x} cy={y} r={rr} fill={accent} opacity={0.9} />
        ))}
      </g>
    );
  }

  const fontSize = Math.round(size * 0.36);

  return (
    <div
      className={className}
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
      aria-label={name}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          background: `radial-gradient(circle at 32% 26%, ${f0}, ${f1})`,
          boxShadow: ring,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            color: "hsl(150 30% 90%)",
            fontWeight: 600,
            fontSize,
            letterSpacing: "0.01em",
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          {label}
        </span>
      </div>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        aria-hidden
      >
        <g transform={`rotate(${angle} ${cx} ${cy})`}>{motif}</g>
      </svg>
    </div>
  );
}

export default CkAvatar;
