import { useId, useMemo } from "react";
import { avatars, candidateSignals } from "../data";

/**
 * Usage policy (founder):
 *  • "signal" — full living score ring + constellation. Applicants list +
 *    Candidate detail ONLY (score signal matters there).
 *  • "calm"   — constellation medallion, NO ring. Interviews, Documents rows,
 *    Dashboard activity, Messages list/thread (quiet person indicator).
 *  • "quiet"  — simplest constellation (fewer dots, no roaming highlight).
 *    Message bubbles — keep chat clean.
 */
type MarkVariant = "signal" | "calm" | "quiet";

interface CandidateMarkProps {
  /** Candidate key or name — seeds the unique constellation + resolves score/active. */
  who: string | null;
  /** Optional initials overlay (detail view). */
  initials?: string;
  /** Match/fit score 0–100. Overrides the resolved value when provided. */
  score?: number;
  /** Recently active → a brief one-time brighten on mount + slightly livelier breathing. */
  active?: boolean;
  size?: number;
  /** How loud the mark is. Defaults to the full "signal". */
  variant?: MarkVariant;
  /** List position → staggers the ring draw-on so a list comes to life in sequence. */
  index?: number;
  /** Show initials over the constellation (detail/hover only — off by default). */
  showInitials?: boolean;
  /** Detail view → a touch richer (more nodes). */
  rich?: boolean;
  className?: string;
}

/* ── deterministic seeded RNG ──────────────────────────────────────────── */
function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DOT_JADE = "hsl(152 46% 56%)";
const DOT_MINT = "hsl(156 62% 72%)";
const DOT_BRASS = "hsl(38 66% 66%)";

interface Node {
  x: number;
  y: number;
  r: number;
  color: string;
  o: number;
  layer: 0 | 1 | 2;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/**
 * Score → ring colours. High = cool jade→mint; as the score eases down the
 * accent warms gently toward refined amber/brass. Never red, never harsh.
 */
function ringColors(score: number) {
  // warmth: ~0 at 90+, eases to 1 by ~20 — gentle, so the band shifts smoothly
  let w = (90 - score) / 70;
  w = Math.min(1, Math.max(0, w));
  w = w * w * (3 - 2 * w); // smoothstep
  const c0 = `hsl(${lerp(152, 38, w).toFixed(0)} ${lerp(46, 68, w).toFixed(0)}% ${lerp(50, 54, w).toFixed(0)}%)`;
  const c1 = `hsl(${lerp(156, 43, w).toFixed(0)} ${lerp(62, 72, w).toFixed(0)}% ${lerp(71, 62, w).toFixed(0)}%)`;
  const glow = `hsl(${lerp(154, 40, w).toFixed(0)} ${lerp(54, 66, w).toFixed(0)}% ${lerp(50, 55, w).toFixed(0)}% / 0.5)`;
  return { c0, c1, glow };
}

function buildMark(seed: string, level: 0 | 1 | 2, maxR: number) {
  const rng = mulberry32(hashStr(seed) || 1);
  const base = [6, 9, 13][level];
  const count = base + Math.floor(rng() * 4);
  const nodes: Node[] = [{ x: 50, y: 50, r: 2.0, color: DOT_MINT, o: 0.9, layer: 1 }];
  for (let i = 0; i < count; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = Math.sqrt(rng()) * maxR;
    const roll = rng();
    const color = roll > 0.88 ? DOT_BRASS : roll > 0.6 ? DOT_MINT : DOT_JADE;
    nodes.push({
      x: 50 + Math.cos(ang) * rad,
      y: 50 + Math.sin(ang) * rad,
      r: 1.0 + rng() * 1.6,
      color,
      o: 0.5 + rng() * 0.42,
      layer: Math.floor(rng() * 3) as 0 | 1 | 2,
    });
  }
  const links: Array<[number, number]> = [];
  for (let i = 1; i < nodes.length; i++) {
    let best = -1;
    let bestD = Infinity;
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const d = (nodes[i].x - nodes[j].x) ** 2 + (nodes[i].y - nodes[j].y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    }
    if (best >= 0 && bestD < 24 * 24 && i % 2 === 0) links.push([i, best]);
  }

  // seeded timing so a list shimmers organically (no unison)
  const breatheDur = (3.4 + rng() * 1.1).toFixed(2);
  const breathePhase = (rng() * 5).toFixed(2);
  const driftDur = [0, 1, 2].map(() => (7 + rng() * 5).toFixed(2));
  const driftPhase = [0, 1, 2].map(() => (rng() * 9).toFixed(2));
  const roamDur = (9 + rng() * 5).toFixed(2);
  const roamPhase = (rng() * 10).toFixed(2);
  const roamR = (7 + rng() * 5).toFixed(1);
  const sweepDur = (8 + rng() * 6).toFixed(2);
  const sweepPhase = (rng() * 12).toFixed(2);

  return { nodes, links, breatheDur, breathePhase, driftDur, driftPhase, roamDur, roamPhase, roamR, sweepDur, sweepPhase };
}

export function CandidateMark({
  who,
  initials: initialsProp,
  score,
  active,
  size = 40,
  variant = "signal",
  index = 0,
  showInitials,
  rich,
  className,
}: CandidateMarkProps) {
  const uid = useId().replace(/:/g, "");
  const seed = who ?? "candidate";
  const resolved = who ? candidateSignals[who] : undefined;
  const sc = Math.max(0, Math.min(100, score ?? resolved?.score ?? 0));
  const isActive = active ?? resolved?.active ?? false;
  const initials = initialsProp ?? ((who && avatars[who]?.initials) || "");

  const showRing = variant === "signal";
  const showRoam = variant !== "quiet";
  const level: 0 | 1 | 2 = variant === "quiet" ? 0 : rich ? 2 : 1;
  const maxR = showRing ? 29 : 34;

  const m = useMemo(() => buildMark(seed, level, maxR), [seed, level, maxR]);
  // state colour only drives the score ring; calm/quiet avatars stay neutral jade/mint
  const { c0, c1, glow } = ringColors(sc);
  const accent = showRing ? c1 : DOT_MINT;

  const R = 45;
  const SW = 6.5;
  const C = 2 * Math.PI * R;
  const dash = (sc / 100) * C;
  const seg = C * 0.09; // shimmer glint ~9% of the ring
  const bodyR = showRing ? R - SW / 2 - 1 : 46;
  const drawDelay = Math.min(index * 0.05, 0.55).toFixed(2);

  const byLayer = (l: number) => m.nodes.filter((n) => n.layer === l);

  return (
    <div
      className={className}
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
      aria-label={who ?? undefined}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: "block" }}>
        <defs>
          <linearGradient id={`grad-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c0} />
            <stop offset="100%" stopColor={c1} />
          </linearGradient>
          <radialGradient id={`body-${uid}`} cx="34%" cy="28%" r="80%">
            <stop offset="0%" stopColor="hsl(156 24% 13%)" />
            <stop offset="100%" stopColor="hsl(156 28% 7%)" />
          </radialGradient>
        </defs>

        {/* medallion body */}
        <circle cx="50" cy="50" r={bodyR} fill={`url(#body-${uid})`} />

        {/* living constellation — optional one-time intro brighten wraps the
            breathing group (separate elements so timings never collide) */}
        <g className={isActive ? "cm-intro" : undefined}>
          <g
            className={`cm-breathe${isActive ? " cm-breathe-active" : ""}`}
            style={{ animationDuration: `${m.breatheDur}s`, animationDelay: `-${m.breathePhase}s` }}
          >
            {[0, 1, 2].map((l) => (
              <g
                key={l}
                className={`cm-layer cm-drift-${["a", "b", "c"][l]}`}
                style={{ animationDuration: `${m.driftDur[l]}s`, animationDelay: `-${m.driftPhase[l]}s` }}
              >
                {byLayer(l).map((n, i) => {
                  const link = m.links.find(([a]) => a === m.nodes.indexOf(n));
                  return (
                    <g key={i}>
                      {link && (
                        <line
                          x1={n.x}
                          y1={n.y}
                          x2={m.nodes[link[1]].x}
                          y2={m.nodes[link[1]].y}
                          stroke={DOT_JADE}
                          strokeWidth={0.5}
                          opacity={0.18}
                        />
                      )}
                      <circle cx={n.x} cy={n.y} r={n.r} fill={n.color} opacity={n.o} />
                    </g>
                  );
                })}
              </g>
            ))}

            {/* roaming highlight — one brighter particle quietly orbiting */}
            {showRoam && (
              <circle
                className="cm-roam"
                cx="50"
                cy="50"
                r={rich ? 1.9 : 1.6}
                fill={accent}
                style={{
                  ["--roam-r" as string]: `${m.roamR}px`,
                  animationDuration: `${m.roamDur}s`,
                  animationDelay: `-${m.roamPhase}s`,
                }}
              />
            )}
          </g>
        </g>

        {/* score ring — signal variant only */}
        {showRing && (
          <>
            <circle cx="50" cy="50" r={R} fill="none" stroke="hsl(150 14% 20% / 0.8)" strokeWidth={SW} />
            {sc > 0 && (
              <circle
                className="cm-arc"
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={`url(#grad-${uid})`}
                strokeWidth={SW}
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C - dash}
                transform="rotate(-90 50 50)"
                style={{
                  ["--draw-from" as string]: `${C.toFixed(2)}`,
                  ["--draw-to" as string]: `${(C - dash).toFixed(2)}`,
                  animationDelay: `${drawDelay}s`,
                  filter: `drop-shadow(0 0 2px ${glow})`,
                }}
              />
            )}
            {/* ring shimmer — slow specular glint travelling around the ring */}
            {sc > 0 && (
              <circle
                className="cm-sweep"
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={c1}
                strokeWidth={SW * 0.7}
                strokeLinecap="round"
                strokeDasharray={`${seg} ${C - seg}`}
                opacity={0.5}
                style={{ animationDuration: `${m.sweepDur}s`, animationDelay: `-${m.sweepPhase}s` }}
              />
            )}
          </>
        )}

        {showInitials && initials && (
          <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fontSize="26" fontWeight="600" fill="hsl(150 30% 90%)">
            {initials}
          </text>
        )}
      </svg>
    </div>
  );
}

export default CandidateMark;
