/**
 * GemRail — THE Gemline rail. One renderer, every caller.
 *
 * The visual existed three times before this: the landing hero's hand-written
 * copy in public/landing.html, the cockpit's applicant journey rail, and
 * (briefly, and wrongly) a stripped third version behind the create-job flow
 * that drew bare numbers instead of gems. This is the single presentational
 * component all the React callers now share — same `ck-rail-*` rules in
 * cockpit.css, same jade → mint → teal → gold spectrum from lib/gemRail.ts,
 * same traveler.
 *
 * It is deliberately dumb: it knows nothing about candidates, jobs or steps. A
 * caller computes what each gem means — its glyph, its receipt, whether it is
 * the sealed decision — and hands the list over. A caller that knows each
 * gem's state from a record (the full profile's ApplicantJourneyRail) passes
 * it as `state`, and the gem shows that instead of its position.
 *
 * Two ways of moving (`motion`):
 *
 *  - "walk", the default (the create-job flow, the careers page). `current`
 *    is the truth; `visualIndex` is the animated read of it: on mount it
 *    starts at the first gem and races forward, lighting each gem in sequence
 *    as the traveler passes, so the rail plays the journey rather than
 *    snapping to the end.
 *
 *  - "calm" (the applicant profile, docs/APPLICANT-PROFILE.md "How the journey
 *    rail moves"). The gems ALWAYS show the record. Opening a profile plays
 *    one glide over them (the line draws to where they are, each gem inks as
 *    the line reaches it, the traveler rides its end), then the rail holds
 *    still: no flowing colours, no pulsing ring. A later step is one more
 *    glide. `entrance="none"` skips the opening (flipping through applicants
 *    with the pager). The opening is CSS, started by one attribute and removed
 *    when it has played, so nothing can be left half-walked.
 *
 * Motion is skipped entirely under prefers-reduced-motion.
 *
 * Geometry is measured, never guessed — flex decides where the gems land, so
 * the track, its fill and the chip are positioned off real node centres.
 *
 * cockpit.css is imported globally in main.tsx, so this works on any page.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import AvaSeal from "@/components/ava/AvaSeal";
import { OPENING_HOLD_MS, gemPosition, glideMs, glideTimeAt } from "@/cockpit/lib/gemRail";
import { cn } from "@/lib/utils";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** How long the arrival ring takes to fade once the glide has landed (cockpit.css, ck-rail-arrive). */
const ARRIVAL_TAIL_MS = 900;

export interface GemRailNode {
  id: string;
  label: string;
  /** The glyph struck into the gem. Ignored when `decision` is set.
   *  Any icon component — lucide for utility chrome, the brand glyph kits for
   *  anything carrying identity. */
  icon?: ComponentType<{ className?: string; size?: string | number; strokeWidth?: string | number }>;
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
  /** Overrides the glyph ink that goes with `color`. */
  ink?: string;
  /** What this gem IS, when the caller knows it from a record rather than
   *  from where the traveller stands. Without it a gem behind the traveller
   *  is cleared and one ahead of it is not — right for a form's steps, wrong
   *  for an applicant, where a step the job gained after they passed it was
   *  never taken (`skipped`), and a retake can sit behind a finished step.
   *  - done / below: cleared, with the check (below: the caller's colour says so)
   *  - now: the traveller's gem, with its halo
   *  - left: theirs, but they have gone from it: a quiet ring, no halo
   *  - skipped: hollow, dashed
   *  - upcoming: hollow */
  state?: "done" | "below" | "now" | "left" | "skipped" | "upcoming";
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
  /** How the rail moves (see the note at the top of this file). */
  motion?: "walk" | "calm";
  /** Calm only. "draw" plays the opening once when the rail mounts; "none"
   *  shows it in place. */
  entrance?: "draw" | "none";
}

export function GemRail({
  nodes,
  current,
  traveler,
  summary,
  ariaLabel = "Progress",
  focusable,
  className,
  motion = "walk",
  entrance = "draw",
}: GemRailProps) {
  const calm = motion === "calm";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const zoneRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  /** Walk: the scaled fill. Calm: the box the drawn line is clipped to. */
  const fillRef = useRef<HTMLDivElement | null>(null);
  const chipRef = useRef<HTMLDivElement | null>(null);
  const chipBodyRef = useRef<HTMLDivElement | null>(null);
  const dotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const mountedRef = useRef(false);
  const visualIndexRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const genRef = useRef(0);
  // Calm only.
  const placedRef = useRef("");
  const openedRef = useRef(false);
  const openingTimerRef = useRef(0);
  const openingMsRef = useRef(0);
  const sealedRef = useRef<boolean | null>(null);

  const target = Math.max(0, Math.min(current, nodes.length - 1));
  const [visualIndex, setVisualIndex] = useState(target);
  const [sealBeat, setSealBeat] = useState(0);
  const [stampBeat, setStampBeat] = useState(0);

  /**
   * Reads where the gems are and lays the track on them. Returns whether any
   * gem MOVED since the last read: a result line that arrives under a gem
   * makes the band taller and wakes the resize observer, but moves nothing.
   * Until 2026-10-07 that re-applied the traveller's place with no transition,
   * which cancelled the glide in flight: the chip jumped to its next gem in
   * one frame (188px, measured on a profile) and stood there.
   */
  const measure = (): boolean => {
    const zone = zoneRef.current;
    if (!zone) return false;
    // The gem list is rebuilt on every render and refilled at commit; a
    // measure that lands in between (a re-measure after a render React has
    // not committed yet) would read an empty list and leave the traveller
    // with nowhere to stand. Keep the last good points instead.
    const els = dotRefs.current;
    if (els.length === 0 || els.some((el) => !el)) return false;
    const zoneRect = zone.getBoundingClientRect();
    const next = els.map((el) => {
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - zoneRect.left, y: r.top + r.height / 2 - zoneRect.top };
    });
    const prev = pointsRef.current;
    const moved =
      prev.length !== next.length || next.some((p, i) => Math.abs(p.x - prev[i].x) > 0.25 || Math.abs(p.y - prev[i].y) > 0.25);
    pointsRef.current = next;
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
    return moved;
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

  // ── calm ──────────────────────────────────────────────────────────────────

  /** The gem's own element (the dot's parent), where its timings are written. */
  const nodeAt = (i: number): HTMLElement | null => dotRefs.current[i]?.parentElement ?? null;

  /**
   * Writes where the traveller stands and how far the line is drawn, as
   * custom properties the stylesheet turns into transforms. Does nothing when
   * nothing moved (see `measure`), so a glide in flight is never cut short.
   */
  const place = (instant: boolean) => {
    measure();
    const root = rootRef.current;
    const pts = pointsRef.current;
    if (!root || pts.length === 0) return;
    const i = Math.max(0, Math.min(visualIndexRef.current, pts.length - 1));
    const half = (chipRef.current?.offsetWidth || 34) / 2;
    const span = pts[pts.length - 1].x - pts[0].x;
    const next = [
      `${(pts[i].x - half).toFixed(2)}px`,
      `${(pts[i].y - half).toFixed(2)}px`,
      `${(pts[0].x - half).toFixed(2)}px`,
      (span > 0 ? (pts[i].x - pts[0].x) / span : 0).toFixed(5),
    ];
    const key = next.join("|");
    if (key === placedRef.current) return;
    placedRef.current = key;
    const write = () => {
      root.style.setProperty("--rail-chip-x", next[0]);
      root.style.setProperty("--rail-chip-y", next[1]);
      root.style.setProperty("--rail-chip-x0", next[2]);
      root.style.setProperty("--rail-p", next[3]);
    };
    if (instant || reducedMotion()) {
      root.dataset.still = "";
      write();
      void root.getBoundingClientRect(); // land it before transitions are back
      delete root.dataset.still;
    } else {
      write();
    }
  };

  const endOpening = () => {
    window.clearTimeout(openingTimerRef.current);
    const root = rootRef.current;
    if (root) delete root.dataset.entrance;
    dotRefs.current.forEach((_, i) => {
      const node = nodeAt(i);
      if (node) delete node.dataset.arrive;
    });
  };

  /** The opening: one glide from the first gem to where they are. Each gem
   *  behind them is told when the line reaches it, then one attribute starts
   *  every part on the same frame. */
  const startOpening = () => {
    const root = rootRef.current;
    const pts = pointsRef.current;
    const at = visualIndexRef.current;
    if (!root || at <= 0 || !pts[at]) return;
    const span = pts[at].x - pts[0].x;
    const run = glideMs(span);
    root.style.setProperty("--rail-run", `${run}ms`);
    root.style.setProperty("--rail-hold", `${OPENING_HOLD_MS}ms`);
    for (let i = 0; i <= at; i += 1) {
      const covered = span > 0 ? (pts[i].x - pts[0].x) / span : 1;
      nodeAt(i)?.style.setProperty("--rail-at", `${Math.round(OPENING_HOLD_MS + run * glideTimeAt(covered))}ms`);
    }
    const arrival = nodeAt(at);
    if (arrival) arrival.dataset.arrive = "";
    root.dataset.entrance = "draw";
    openingMsRef.current = OPENING_HOLD_MS + run + ARRIVAL_TAIL_MS;
    openingTimerRef.current = window.setTimeout(endOpening, openingMsRef.current);
  };

  useLayoutEffect(() => {
    if (!calm) return;
    const root = rootRef.current;
    if (!root) return;
    const from = visualIndexRef.current;
    visualIndexRef.current = target;
    if (!openedRef.current) {
      openedRef.current = true;
      place(true);
      if (entrance === "draw" && !reducedMotion()) startOpening();
    } else if (root.dataset.entrance && from === target) {
      // The same placement again (React's development double run): the
      // opening is already playing. Only its clean-up timer was dropped.
      openingTimerRef.current = window.setTimeout(endOpening, openingMsRef.current);
    } else {
      // They moved a step while the page was open: one glide, and one ring
      // where they land. The timings are written before anything is measured,
      // so the styles that just changed pick them up.
      endOpening();
      const pts = pointsRef.current;
      const move = glideMs(pts[target] && pts[from] ? Math.abs(pts[target].x - pts[from].x) : 0);
      root.style.setProperty("--rail-move", `${move}ms`);
      dotRefs.current.forEach((_, i) => nodeAt(i)?.style.removeProperty("--rail-ring-at"));
      const arrival = target !== from && !reducedMotion() ? nodeAt(target) : null;
      if (arrival) {
        arrival.style.setProperty("--rail-ring-at", `${Math.round(move * 0.62)}ms`);
        arrival.style.setProperty("--rail-at", `${Math.round(move * 0.8)}ms`);
        arrival.dataset.arrive = "";
        openingTimerRef.current = window.setTimeout(endOpening, move + ARRIVAL_TAIL_MS);
      }
      place(false);
    }
    return () => window.clearTimeout(openingTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calm, target, nodes.length]);

  // The verdict lands while the page is open (the owner just decided): the
  // pill presses in once. Never on a profile opened already decided.
  const sealedNow = nodes.some((node) => node.sealed);
  useEffect(() => {
    if (!calm) return;
    if (sealedRef.current === false && sealedNow) setStampBeat((n) => n + 1);
    sealedRef.current = sealedNow;
  }, [calm, sealedNow]);

  // ── walk ──────────────────────────────────────────────────────────────────

  // Measure, then walk from where the traveller was to where they really are —
  // one gem at a time, so gems light in sequence rather than all at once.
  useLayoutEffect(() => {
    if (calm) return;
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
    // …and say so, in the state and the ref alike. The state starts at the
    // target, so without this a one-gem walk (0 → 1) set the state to the
    // value it already held, nothing re-applied the visual, and the first
    // re-measure put the traveller back on gem 0 for good.
    visualIndexRef.current = start;
    setVisualIndex(start);

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
  }, [calm, target, nodes.length]);

  // Each tick glides the chip and draws the fill via CSS transition.
  useEffect(() => {
    if (calm) return;
    applyVisual(visualIndex, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calm, visualIndex]);

  // Re-measure on width changes without replaying the walk, and only when a
  // gem actually moved (see `measure`).
  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (calm) place(true);
      else if (measure()) applyVisual(visualIndexRef.current, true);
    });
    ro.observe(zone);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calm]);

  dotRefs.current = [];

  // Calm: the gems show the record from the first frame, and the opening is
  // drawn over them. Walk: they follow the traveller.
  const shown = calm ? target : visualIndex;

  return (
    <div ref={rootRef} className={cn("ck-rail-outer", calm && "ck-rail-calm", className)}>
      <div className="ck-rail-band" ref={zoneRef}>
        <div className="ck-rail-track" ref={trackRef} aria-hidden="true" />
        {calm ? (
          // The line, already whole and in its own colours (jade at the start,
          // gold at the decision); what is drawn is how much of it shows.
          <div className="ck-rail-fill-clip" ref={fillRef} aria-hidden="true">
            <div className="ck-rail-fill">
              <div className="ck-rail-ink" />
            </div>
          </div>
        ) : (
          <div className="ck-rail-track-fill" ref={fillRef} aria-hidden="true" />
        )}

        <div className="ck-rail-nodes" role="list" aria-label={ariaLabel}>
          {nodes.map((node, i) => {
            const gem = gemPosition(i, nodes.length);
            // Gems light in step with the traveller, not all at once — but the
            // receipt is real truth, so it shows only once actually reached.
            // A gem with a `state` shows that state once the walk has passed
            // it (or arrived): never a check its record does not have.
            const stated = node.state != null;
            const reached = i <= shown || shown === target;
            const cleared = stated ? reached && (node.state === "done" || node.state === "below") : i < shown;
            const isCurrent = stated ? i === shown && node.state === "now" : i === shown;
            const dotStyle: CSSProperties | undefined = !stated || !reached
              ? undefined
              : node.state === "skipped"
                ? { borderStyle: "dashed", borderColor: "var(--ink-3)" }
                : node.state === "left"
                  ? { borderWidth: 2, borderColor: "var(--ink-3)" }
                  : undefined;
            const Icon = node.icon;
            const receipt = (stated ? reached : i <= shown) ? node.receipt : null;
            const stamped = calm && stampBeat > 0 && !!node.sealed;
            return (
              <div
                key={node.id}
                role="listitem"
                tabIndex={focusable ? 0 : undefined}
                aria-label={node.tooltip}
                aria-current={(stated ? i === target && reached : isCurrent) ? "step" : undefined}
                className={cn(
                  "ck-rail-node group",
                  cleared && "is-cleared",
                  isCurrent && "is-current",
                  node.decision && "is-decision"
                )}
                style={{ "--node-color": node.color ?? gem.color, "--node-ink": node.ink ?? gem.ink } as CSSProperties}
              >
                <div className="ck-rail-dot" style={dotStyle} ref={(el) => { dotRefs.current[i] = el; }}>
                  {node.decision ? (
                    // Walk: the seal stamps when the traveller lands on it.
                    // Calm: the traveller stands on the seal, so the verdict
                    // under it is what presses in (is-stamped below).
                    <span key={`seal-${sealBeat}`} className={calm ? "ck-seal" : "ck-seal ck-seal-press"}>
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
                <span
                  key={stamped ? `stamp-${stampBeat}` : "receipt"}
                  className={cn("ck-rail-receipt", receipt && "show", node.sealed && "is-sealed", stamped && "is-stamped")}
                >
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
