import type { CSSProperties, ReactNode } from "react";

// Custom HireFlow feature icon set. One visual language: 1.7px rounded strokes in
// currentColor + filled "node" dots that echo Ava's dotted-mesh orb. Bespoke, not stock.
interface IconProps {
  className?: string;
  style?: CSSProperties;
}

function Svg({ className, style, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["hf-icon", className].filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// Ava-Powered Screening — an evaluated candidate (orb + check) with an AI spark.
export function IconScreening(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.4" />
      <path d="M8.4 11.2l1.9 1.9 3.7-3.8" />
      <circle cx="18.8" cy="5.2" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="21" cy="8.7" r="0.8" fill="currentColor" stroke="none" />
    </Svg>
  );
}

// Instant Job Setup — a document generated in a flash.
export function IconInstant(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.3 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.7z" />
      <path d="M13.3 3v5.7H19" />
      <path d="M12.4 10.6l-2.5 3.7h2.4l-0.9 3 3.1-4.1h-2.3z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

// Custom Workflows — connected nodes branching into a flow.
export function IconWorkflows(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="7.7" y1="7.4" x2="10.3" y2="10.6" />
      <line x1="7.7" y1="16.6" x2="10.3" y2="13.4" />
      <line x1="14.4" y1="12" x2="17.4" y2="12" />
      <circle cx="6" cy="6" r="2.1" />
      <circle cx="6" cy="18" r="2.1" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="19.6" cy="12" r="2.1" />
    </Svg>
  );
}

// Smart Tracking — a pipeline of candidate rows, each with a status node.
export function IconTracking(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="7" r="1.3" fill="currentColor" stroke="none" />
      <line x1="9" y1="7" x2="20" y2="7" />
      <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <circle cx="5" cy="17" r="1.3" fill="currentColor" stroke="none" />
      <line x1="9" y1="17" x2="15.5" y2="17" />
    </Svg>
  );
}

// Deep Insights — a rising trend with data nodes, peak emphasized.
export function IconInsights(props: IconProps) {
  return (
    <Svg {...props}>
      <polyline points="4 16.5 9 12 13 14 20 6" />
      <circle cx="4" cy="16.5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="13" cy="14" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="20" cy="6" r="1.8" fill="currentColor" stroke="none" />
    </Svg>
  );
}

// Save 70% Time — a clock with motion lines (speed).
export function IconTime(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="14" cy="13" r="6.3" />
      <path d="M14 9.6V13l2.4 1.5" />
      <circle cx="14" cy="13" r="1" fill="currentColor" stroke="none" />
      <line x1="2.5" y1="8.6" x2="6" y2="8.6" />
      <line x1="4" y1="12" x2="6.8" y2="12" />
    </Svg>
  );
}
