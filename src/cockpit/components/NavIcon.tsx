import type { AnimationEvent, CSSProperties, SyntheticEvent } from "react";
import { cn } from "@/lib/utils";

/**
 * The menu's icons, each with its own small motion (the owner, 2026-10-11,
 * approved from a moving mock-up: "I love everything"). They are the same
 * Lucide shapes the menu always drew (lucide-react 0.462: house, users,
 * briefcase, calendar-days, message-square, file-text, chart-column,
 * ellipsis), split into the parts that move:
 *
 *   Dashboard   the house lifts and its door opens
 *   Applicants  the two people shuffle apart and back, the front one nods
 *   Jobs        the briefcase swings from its handle, as if picked up
 *   Interviews  the rings hop and the days fill in
 *   Messages    the bubble pops and three dots type
 *   Documents   the corner folds and the lines write themselves
 *   Analytics   the bars grow from the baseline
 *   More        the three dots hop one after another
 *
 * Each plays ONCE when the row is pointed at, focused or tapped, then stops
 * (playNavIcon); nothing loops. The motion lives in cockpit.css
 * (.ck-navicon[data-play]); "reduce motion" keeps them still.
 */
export type NavIconName =
  | "dashboard"
  | "applicants"
  | "jobs"
  | "interviews"
  | "messages"
  | "documents"
  | "analytics"
  | "more";

const PARTS: Record<NavIconName, JSX.Element> = {
  dashboard: (
    <g className="ni-lift">
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path className="ni-door" d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
    </g>
  ),
  applicants: (
    <>
      <g className="ni-front">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle className="ni-head" cx="9" cy="7" r="4" />
      </g>
      <g className="ni-back">
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </g>
    </>
  ),
  jobs: (
    <g className="ni-swing">
      <path className="ni-handle" d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect width="20" height="14" x="2" y="6" rx="2" />
    </g>
  ),
  interviews: (
    <>
      <path className="ni-ring" d="M8 2v4" />
      <path className="ni-ring ni-ring-2" d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
      <path className="ni-day ni-day-1" d="M8 14h.01" />
      <path className="ni-day ni-day-2" d="M12 14h.01" />
      <path className="ni-day ni-day-3" d="M16 14h.01" />
      <path className="ni-day ni-day-4" d="M8 18h.01" />
      <path className="ni-day ni-day-5" d="M12 18h.01" />
      <path className="ni-day ni-day-6" d="M16 18h.01" />
    </>
  ),
  messages: (
    <>
      <path className="ni-bubble" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path className="ni-dot" d="M8 10h.01" />
      <path className="ni-dot ni-dot-2" d="M12 10h.01" />
      <path className="ni-dot ni-dot-3" d="M16 10h.01" />
    </>
  ),
  documents: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path className="ni-fold" d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path className="ni-line" d="M10 9H8" />
      <path className="ni-line ni-line-2" d="M16 13H8" />
      <path className="ni-line ni-line-3" d="M16 17H8" />
    </>
  ),
  analytics: (
    <>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path className="ni-bar ni-bar-3" d="M18 17V9" />
      <path className="ni-bar ni-bar-2" d="M13 17V5" />
      <path className="ni-bar" d="M8 17v-3" />
    </>
  ),
  more: (
    <>
      <circle className="ni-hop" cx="5" cy="12" r="1" />
      <circle className="ni-hop ni-hop-2" cx="12" cy="12" r="1" />
      <circle className="ni-hop ni-hop-3" cx="19" cy="12" r="1" />
    </>
  ),
};

export function NavIcon({ name, className, style }: { name: NavIconName; className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={cn("ck-navicon", className)}
      data-icon={name}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      onAnimationEnd={settle}
    >
      {PARTS[name]}
    </svg>
  );
}

/** Play the icon inside this row once, from its first frame (a second
 *  pointing starts it again; it never repeats on its own). */
export function playNavIcon(event: SyntheticEvent<HTMLElement>) {
  const icon = event.currentTarget.querySelector<SVGSVGElement>(".ck-navicon");
  if (!icon) return;
  icon.removeAttribute("data-play");
  // Read layout so the browser sees the motion end before it starts again.
  void icon.getBoundingClientRect();
  icon.setAttribute("data-play", "");
}

/** Every part has finished: let go, so the icon rests exactly as drawn. */
function settle(event: AnimationEvent<SVGSVGElement>) {
  const icon = event.currentTarget;
  const running = icon.getAnimations({ subtree: true }).some((a) => a.playState === "running");
  if (!running) icon.removeAttribute("data-play");
}
