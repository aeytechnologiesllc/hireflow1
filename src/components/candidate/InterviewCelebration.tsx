import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight } from "lucide-react";
import { GlyphCheckSeal } from "@/components/candidate/glyphs";
import { SELECTED_TITLE } from "@/lib/candidateInterview";

/**
 * Being chosen for an interview, as the applicant sees it
 * (docs/INTERVIEWS.md, "What the applicant sees").
 *
 * The owner, 2026-10-07, on the amber notice box this replaces: "this SaaS
 * dashboard yellow color ... It needs to be an actual applause. You have been
 * selected for an interview. Boom, boom, shabam."
 *
 *  - InterviewSurface: the lit surface the news sits on, with its seal and
 *    sparks. Used by the applications list and by the interview card.
 *  - ConfettiBurst: paper thrown once, in the brand's own colours.
 *  - InterviewSelectedMoment: the full-screen moment, shown once for each
 *    interview on each browser: when the news arrives live, or the first
 *    time they open the page after it did.
 *
 * Styles: src/styles/motion.css (.hf-invite, .hf-confetti, .hf-spark,
 * .hf-rise). All of it stands still for someone who asked for less motion.
 */

/* ── Remembering who has already been celebrated ───────────────────────── */

const seenKey = (interviewId: string) => `hf-interview-celebrated:${interviewId}`;
// For a browser that will not keep anything: remembered for this visit.
const seenThisVisit = new Set<string>();

export function hasCelebrated(interviewId: string | null | undefined): boolean {
  if (!interviewId) return true;
  if (seenThisVisit.has(interviewId)) return true;
  try {
    return window.localStorage.getItem(seenKey(interviewId)) === "1";
  } catch {
    return false;
  }
}

export function markCelebrated(interviewId: string | null | undefined): void {
  if (!interviewId) return;
  seenThisVisit.add(interviewId);
  try {
    window.localStorage.setItem(seenKey(interviewId), "1");
  } catch {
    // Private mode: remembered for this visit only.
  }
}

/* ── The surface ───────────────────────────────────────────────────────── */

/** The brass-ringed seal. `press` replays its arrival (a new key remounts it). */
export function InterviewSeal({ size = 52, press = true }: { size?: number; press?: boolean }) {
  return (
    <span className={`hf-invite-seal ${press ? "ck-seal-press" : ""}`} style={{ width: size, height: size }} aria-hidden>
      <GlyphCheckSeal size={Math.round(size * 0.54)} />
    </span>
  );
}

// Kept to the upper right, clear of the corner where a card's menu sits.
const SPARKS: Array<{ top: string; right: string; size: number; delay: string }> = [
  { top: "13%", right: "17%", size: 11, delay: "0s" },
  { top: "40%", right: "13%", size: 7, delay: "1.1s" },
  { top: "26%", right: "29%", size: 9, delay: "2s" },
  { top: "10%", right: "40%", size: 6, delay: "0.6s" },
];

/**
 * The lit surface. `tone`: "selected" and "confirmed" celebrate; "quiet" is
 * the same shape at rest (waiting on the team).
 */
export function InterviewSurface({
  tone,
  children,
  className = "",
  ...rest
}: {
  tone: "selected" | "confirmed" | "quiet";
  children: ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  return (
    <div className={`hf-invite ${className}`} data-tone={tone} {...rest}>
      {tone !== "quiet" &&
        SPARKS.map((spark, index) => (
          <i
            key={index}
            className="hf-spark"
            aria-hidden
            style={{ top: spark.top, right: spark.right, ["--s" as string]: `${spark.size}px`, ["--d" as string]: spark.delay } as CSSProperties}
          />
        ))}
      {children}
    </div>
  );
}

/* ── The paper ─────────────────────────────────────────────────────────── */

const PAPER = ["var(--jade)", "var(--brass)", "var(--brass-line)", "var(--jade-soft-fg)", "var(--ink)"];

interface Piece {
  style: CSSProperties;
}

/** A spread of pieces from one point: `from`/`to` are the angles they fly between, in degrees (0 = right, -90 = up). */
function popper(count: number, origin: { x: number; y: number }, from: number, to: number, reach: number, delay: number, seed: number): Piece[] {
  // A small repeatable generator, so a re-render does not reshuffle the paper mid-flight.
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const angle = ((from + (to - from) * next()) * Math.PI) / 180;
    const distance = reach * (0.45 + next() * 0.75);
    const wide = next() > 0.45;
    const w = wide ? 6 + next() * 6 : 4 + next() * 3;
    const h = wide ? 3 + next() * 3 : 9 + next() * 7;
    return {
      style: {
        ["--x" as string]: `${origin.x}%`,
        ["--y" as string]: `${origin.y}%`,
        ["--dx" as string]: `${Math.round(Math.cos(angle) * distance)}px`,
        ["--dy" as string]: `${Math.round(Math.sin(angle) * distance)}px`,
        ["--fall" as string]: `${Math.round(220 + next() * 380)}px`,
        ["--rot" as string]: `${Math.round((next() - 0.5) * 900)}deg`,
        ["--w" as string]: `${w.toFixed(1)}px`,
        ["--h" as string]: `${h.toFixed(1)}px`,
        ["--r" as string]: next() > 0.82 ? "999px" : "1.5px",
        ["--c" as string]: PAPER[Math.floor(next() * PAPER.length)],
        ["--dur" as string]: `${(1.9 + next() * 1.3).toFixed(2)}s`,
        ["--delay" as string]: `${(delay + next() * 0.16).toFixed(2)}s`,
      } as CSSProperties,
    };
  });
}

/** How long the paper is in the air, start to gone. */
export const CONFETTI_MS = 3900;

/**
 * Paper thrown once: a popper from each lower corner, then one from the
 * middle ("boom, boom, shabam"). It removes itself and calls `onDone`.
 */
export function ConfettiBurst({ onDone }: { onDone?: () => void }) {
  const pieces = useMemo(() => {
    const reach = typeof window === "undefined" ? 420 : Math.max(260, Math.min(window.innerWidth, window.innerHeight) * 0.62);
    return [
      ...popper(46, { x: 6, y: 86 }, -84, -28, reach, 0, 11),
      ...popper(46, { x: 94, y: 86 }, -152, -96, reach, 0.2, 29),
      ...popper(54, { x: 50, y: 34 }, -200, 20, reach * 0.72, 0.46, 47),
    ];
  }, []);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const timer = window.setTimeout(() => done.current?.(), CONFETTI_MS);
    return () => window.clearTimeout(timer);
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="hf-confetti" aria-hidden data-confetti={pieces.length}>
      {pieces.map((piece, index) => (
        <i key={index} style={piece.style} />
      ))}
    </div>,
    document.body,
  );
}

/* ── The moment ────────────────────────────────────────────────────────── */

/**
 * The full-screen moment: the seal presses in, the paper flies, and the one
 * thing to do next is the button. Closing it leaves them on the page they
 * were on, where the interview is waiting.
 */
export function InterviewSelectedMoment({
  open,
  companyName,
  jobTitle,
  detail,
  action,
  onAction,
  onClose,
}: {
  open: boolean;
  companyName?: string | null;
  jobTitle?: string | null;
  /** What is asked of them ("They offered 2 times. Pick the one that works for you."). */
  detail: string;
  /** The button ("Pick your time"). */
  action: string;
  onAction: () => void;
  onClose: () => void;
}) {
  const [paper, setPaper] = useState(true);
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    setPaper(true);
    const focus = window.setTimeout(() => primary.current?.focus({ preventScroll: true }), 60);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focus);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  const team = companyName?.trim() || "The hiring team";
  const rise = (ms: number) => ({ ["--rise" as string]: `${ms}ms` }) as CSSProperties;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto px-4 py-8" data-interview-moment>
      <div className="fixed inset-0 bg-background/90 backdrop-blur-sm" onClick={onClose} aria-hidden />
      {paper && <ConfettiBurst onDone={() => setPaper(false)} />}
      <InterviewSurface
        tone="selected"
        role="dialog"
        aria-modal="true"
        aria-labelledby="interview-moment-title"
        className="relative z-10 w-full max-w-lg px-6 py-9 text-center sm:px-10 sm:py-11"
      >
        <div className="flex justify-center">
          <InterviewSeal size={76} />
        </div>
        <p className="hf-rise mt-6 text-[12px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--brass)", ...rise(180) }}>
          Congratulations
        </p>
        <h2
          id="interview-moment-title"
          className="hf-rise font-display mt-2 text-balance text-[30px] font-semibold leading-[1.12] sm:text-[38px]"
          style={{ color: "var(--ink)", ...rise(260) }}
        >
          {SELECTED_TITLE}
        </h2>
        <p className="hf-rise mx-auto mt-3 max-w-sm text-[15px] leading-relaxed" style={{ color: "var(--ink-2)", ...rise(360) }}>
          {team} wants to meet you{jobTitle ? (
            <>
              {" "}
              for <span style={{ color: "var(--ink)" }}>{jobTitle}</span>
            </>
          ) : null}
          .
        </p>
        <p className="hf-rise mx-auto mt-4 max-w-sm text-[14px] leading-relaxed" style={{ color: "var(--ink-2)", ...rise(440) }}>
          {detail}
        </p>
        <div className="hf-rise mt-7 flex flex-col items-center gap-2.5" style={rise(540)}>
          <button
            ref={primary}
            type="button"
            onClick={onAction}
            data-testid="interview-moment-action"
            className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[12px] px-7 text-[16px] font-semibold transition-[filter,transform] hover:brightness-110 active:scale-[0.98] sm:w-auto"
            // Sizes inline: the phone stylesheet's button rule outranks any class.
            style={{ background: "var(--jade)", color: "var(--btn-fg)", minHeight: 52, fontSize: 16, paddingInline: 28 }}
          >
            {action}
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-3 text-[13px] font-medium underline-offset-4 hover:underline"
            style={{ color: "var(--ink-3)", fontSize: 13 }}
          >
            Not now
          </button>
        </div>
      </InterviewSurface>
    </div>,
    document.body,
  );
}
