/**
 * GemRail — THE Gemline rail. One renderer, every caller.
 *
 * The visual existed three times before this: the landing hero's hand-written
 * copy in public/landing.html, the cockpit's JourneyStrip on Applicants, and
 * (briefly, and wrongly) a stripped third version behind the create-job flow
 * that drew bare numbers instead of gems. This is the single presentational
 * component all the React callers now share — same `ck-rail-*` rules in
 * cockpit.css, same jade → mint → teal → gold spectrum from lib/gemRail.ts,
 * same traveler, same walk.
 *
 * It is deliberately dumb: it knows nothing about candidates, jobs or steps. A
 * caller computes what each gem means — its glyph, its receipt, whether it is
 * the sealed decision — and hands the list over. JourneyStrip keeps every bit
 * of its candidate logic; it just stopped drawing its own rail.
 *
 * The walk. `current` is the truth. `visualIndex` is the animated read of it:
 * on mount it starts at the first gem and races forward, lighting each gem in
 * sequence as the traveler passes, so the rail plays the journey rather than
 * snapping to the end. Motion is skipped entirely under prefers-reduced-motion.
 *
 * Geometry is measured, never guessed — flex decides where the gems land, so
 * the track, its fill and the chip are positioned off real node centres.
 *
 * cockpit.css is imported globally in main.tsx, so this works on any page.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Check, type LucideIcon } from "lucide-react";
import AvaSeal from "@/components/ava/AvaSeal";
import { gemPosition } from "@/cockpit/lib/gemRail";
import { cn } from "@/lib/utils";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export interface GemRailNode {
  id: string;
  label: string;
  /** The glyph struck into the gem. Ignored when `decision` is set. */
  icon?: LucideIcon;
  /** The line under the gem — a score, a duration, an outcome. Only ever what's on file. */
  receipt?: string | null;
  /** Renders the receipt as the brass pill, the way a verdict reads. */
  sealed?: boolean;
  /** The last gem: Ava's seal instead of a glyph. */
  decision?: boolean;
  /** Degrees of tilt on the seal — a passed candidate's sits slightly off-square. */
  sealTilt?: number;
  /** Overrides the spectrum for this gem (the decision gem reads brass, not gold). */
  color?: string;
  /** Hover / keyboard tooltip. Also becomes the node's accessible name. */
  tooltip?: string;
}

export interface GemRailProps {
  nodes: GemRailNode[];
  /** Index of the gem the traveller is really on. */
  current: number;
  /** Short label riding the track — initials of whoever is making the journey. */
  traveler?: string;
  /** A line under the rail saying where things stand. */
  summary?: string;
  ariaLabel?: string;
  /** Makes each gem keyboard-reachable, so its tooltip can be read without a mouse. */
  focusable?: boolean;
  className?: string;
}

export function GemRail({ nodes, current, traveler, summary, ariaLabel = "Progress", focusable, className }: GemRailProps) {
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const chipBodyRef = useRef<HTMLDivElement | null>(null);
  const dotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const mountedRef = useRef(false);
  const visualIndexRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const genRef = useRef(0);

  const target = Math.max(0, Math.min(current, nodes.length - 1));
  const [visualIndex, setVisualIndex] = useState(target);
  const [sealBeat, setSealBeat] = useState(0);

  const measure = () => {
    const zone = zoneRef.current;
    if (!zone) return;
    const zoneRect = zone.getBoundingClientRect();
    pointsRef.current = dotRefs.current.map((el) => {
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - zoneRect.left, y: r.top + r.height / 2 - zoneRect.top };
    });
    const pts = pointsRef.current;
    const track = trackRef.current;
    const fill = fillRef.current;
    if (track && fill && pts.length > 0) {
      const x0 = pts[0].x;
      const width = Math.max(0, pts[pts.length - 1].x - x0);
      for (const el of [track, fill]) {
        el.style.left = `${x0}px`;
        el.style.top = `${pts[0].y}px`;
        el.style.width = `${width}px`;
        el.style.marginTop = "-5px"; // half the 10px track height
        el.style.transformOrigin = "left center";
      }
    }
  };

  const applyVisual = (index: number, instant: boolean) => {
    const force = instant || reducedMotion();
    const pts = pointsRef.current;
    if (!pts.length) return;
    const i = Math.max(0, Math.min(index, pts.length - 1));
    const write = (el: HTMLElement, value: string) => {
      if (force) {
        const prev = el.style.transition;
        el.style.transition = "none";
        el.style.transform = value;
        void el.getBoundingClientRect(); // flush so the next frame animates again
        el.style.transition = prev;
      } else {
        el.style.transform = value;
      }
    };
    const chip = chipRef.current;
    if (chip && pts[i]) {
      const half = (chip.offsetWidth || 34) / 2;
      write(chip, `translate(${pts[i].x - half}px, ${pts[i].y - half}px)`);
    }
    const fill = fillRef.current;
    if (fill) write(fill, `scaleX(${nodes.length > 1 ? i / (nodes.length - 1) : 0})`);
  };

  // Measure, then walk from where the traveller was to where they really are —
  // one gem at a time, so gems light in sequence rather than all at once.
  useLayoutEffect(() => {
    measure();
    const isFirst = !mountedRef.current;
    const start = isFirst ? (reducedMotion() ? target : 0) : visualIndexRef.current;
    mountedRef.current = true;

    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
    const gen = ++genRef.current;

    const landDecision = () => {
      if (nodes[target]?.decision) setSealBeat((n) => n + 1);
    };

    if (reducedMotion() || target === start) {
      setVisualIndex(target);
      visualIndexRef.current = target;
      applyVisual(target, true);
      landDecision();
      return;
    }

    applyVisual(start, true); // rest at the starting gem before the glide

    const hops = Math.abs(target - start);
    const duration = Math.min(950, Math.max(520, 420 + hops * 140));
    const dir = target > start ? 1 : -1;

    // one lean across the whole glide, not per hop
    const body = chipBodyRef.current;
    if (body) {
      body.style.setProperty("--chip-tilt-duration", `${duration}ms`);
      body.classList.remove("is-moving");
      void body.offsetWidth;
      body.classList.add("is-moving");
      timersRef.current.push(
        window.setTimeout(() => {
          if (genRef.current !== gen) return;
          body.classList.remove("is-moving");
        }, duration + 60)
      );
    }

    for (let k = 1; k <= hops; k++) {
      const idx = start + dir * k;
      timersRef.current.push(
        window.setTimeout(() => {
          if (genRef.current !== gen) return;
          setVisualIndex(idx);
          visualIndexRef.current = idx;
          if (idx === target) landDecision();
        }, Math.round((k / hops) * duration))
      );
    }

    return () => timersRef.current.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, nodes.length]);

  // Each tick glides the chip and draws the fill via CSS transition.
  useEffect(() => {
    applyVisual(visualIndex, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualIndex]);

  // Re-measure on width changes without replaying the walk.
  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      measure();
      applyVisual(visualIndexRef.current, true);
    });
    ro.observe(zone);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  dotRefs.current = [];

  return (
    <div className={cn("ck-rail-outer", className)}>
      <div className="ck-rail-band" ref={zoneRef}>
        <div className="ck-rail-track" ref={trackRef} aria-hidden="true" />
        <div className="ck-rail-track-fill" ref={fillRef} aria-hidden="true" />

        <div className="ck-rail-nodes" role="list" aria-label={ariaLabel}>
          {nodes.map((node, i) => {
            const gem = gemPosition(i, nodes.length);
            // Gems light in step with the traveller, not all at once — but the
            // receipt is real truth, so it shows only once actually reached.
            const cleared = i < visualIndex;
            const isCurrent = i === visualIndex;
            const Icon = node.icon;
            const receipt = i <= visualIndex ? node.receipt : null;
            return (
              <div
                key={node.id}
                role="listitem"
                tabIndex={focusable ? 0 : undefined}
                aria-label={node.tooltip}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "ck-rail-node group",
                  cleared && "is-cleared",
                  isCurrent && "is-current",
                  node.decision && "is-decision"
                )}
                style={{ "--node-color": node.color ?? gem.color, "--node-ink": gem.ink } as CSSProperties}
              >
                <div className="ck-rail-dot" ref={(el) => { dotRefs.current[i] = el; }}>
                  {node.decision ? (
                    <span key={`seal-${sealBeat}`} className="ck-seal ck-seal-press">
                      <AvaSeal size={28} tilt={node.sealTilt ?? 0} />
                    </span>
                  ) : Icon ? (
                    <Icon className="ck-rail-glyph" strokeWidth={2} />
                  ) : (
                    <span className="text-[12px] font-bold">{i + 1}</span>
                  )}
                  {cleared && !node.decision && (
                    <span className="ck-rail-check">
                      <Check className="h-full w-full" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <span className="ck-rail-label">{node.label}</span>
                <span className={cn("ck-rail-receipt", receipt && "show", node.sealed && "is-sealed")}>
                  {receipt ?? ""}
                </span>

                {node.tooltip ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 z-10 w-max max-w-[190px] -translate-x-1/2 rounded-[7px] px-2.5 py-[7px] text-center text-[11px] leading-[1.4] opacity-0 shadow-[var(--hf-shadow-raised)] transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100"
                    style={{ background: "var(--ink)", color: "var(--ground)" }}
                  >
                    {node.tooltip}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        {traveler ? (
          <div className="ck-rail-chip" ref={chipRef} aria-hidden="true">
            <div className="ck-rail-chip-body" ref={chipBodyRef}>
              <span className="ck-rail-chip-core">{traveler}</span>
            </div>
          </div>
        ) : null}
      </div>

      {summary ? (
        <p className="mt-[7px] text-[11px]" style={{ color: "var(--ink-3)" }}>
          {summary}
        </p>
      ) : null}
    </div>
  );
}

export default GemRail;
