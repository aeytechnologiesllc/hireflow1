/** Shared UI atoms for Ava create-job flow (preview + real). */
import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Check,
  ArrowUp,
  ArrowDown,
  Pencil,
  X,
  Clock,
  Plus,
  GripVertical,
} from "lucide-react";
import { AvaGlyph } from "@/components/ava/AvaGlyph";

export const DISPLAY = "'Fraunces', Georgia, serif";

import { GemRail } from "@/components/rail/GemRail";
import {
  GlyphJobPost, GlyphScenarios, GlyphTyping, GlyphCallingCard, GlyphExchange,
  GlyphQuoted, GlyphMeasure, GlyphPlan, GlyphPublish, GlyphRosette, GlyphForme,
} from "@/components/ava/employerGlyphs";
// Reused rather than redrawn: GlyphLetter is already documented as "an
// application on its way", and GlyphSteps as ordered steps. Inventing a second
// mark for an object the kit already draws is how families drift apart.
import { GlyphLetter, GlyphSteps, GlyphCheckSeal } from "@/components/candidate/glyphs";
// One implementation, shared with the candidate journey. `import` then
// re-`export`: `export { x } from` would not bind it locally, and this file
// calls it itself below.
import { glyphForKind } from "@/components/glyphForKind";
export { glyphForKind };

/**
 * The mark for a phase kind, from the employer glyph kit. The flow used stock
 * lucide icons here (ClipboardList, FileText, Timer, Mic) — generic enough that
 * the owner read the whole screen as machine-made, and a violation of the kit's
 * own rule that a stock clipboard or camera may not carry identity.
 */

export const STEPS = ["Brief", "Follow-ups", "Rigor", "Ava builds", "Review plan", "Publish"] as const;

export type Accent = "brass" | "jade" | "mint";

export const ACCENT: Record<Accent, { tile: string; fg: string; line: string; edge: string }> = {
  brass: { tile: "hsl(var(--primary) / 0.14)", fg: "hsl(var(--ck-brass-bright))", line: "hsl(var(--primary))", edge: "hsl(var(--primary) / 0.3)" },
  jade: { tile: "hsl(var(--ck-jade) / 0.16)", fg: "hsl(var(--ck-jade))", line: "hsl(var(--ck-jade))", edge: "hsl(var(--ck-jade) / 0.3)" },
  mint: { tile: "hsl(var(--ck-mint) / 0.16)", fg: "hsl(var(--ck-mint))", line: "hsl(var(--ck-mint))", edge: "hsl(var(--ck-mint) / 0.3)" },
};

export const FOCUS_CSS = `
  .ava-flow input:focus, .ava-flow textarea:focus {
    border-color: hsl(var(--primary) / 0.6) !important;
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.16), 0 0 24px hsl(var(--primary) / 0.10) !important;
  }
`;

export function useWide() {
  const get = () => typeof window !== "undefined" && window.innerWidth >= 640;
  const [wide, setWide] = useState(get);
  useEffect(() => {
    const on = () => setWide(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return wide;
}

/**
 * StepRail — the create-job flow's progress rail.
 *
 * The same Gemline rail as the landing hero and the Applicants JourneyStrip,
 * through the one shared <GemRail>: same gems, same glyphs, same jade → mint →
 * teal → gold spectrum, same traveler chip, same walk. It replaced both a plain
 * pill stepper and the 248px orb that used to sit above it, so the progress
 * chrome the screen already needed is what carries the brand moment.
 *
 * The job being built is the traveller — it rides Brief → Publish exactly as a
 * candidate rides their own journey — and Publish is Ava's seal, the same mark
 * she signs everything else with.
 */
const STEP_GLYPHS = {
  "Brief": GlyphLetter,        // existing kit — the brief on its way to Ava
  "Follow-ups": GlyphExchange, // two facing arcs, one pressed dot between them
  "Rigor": GlyphMeasure,       // the level you set, on a printer's measure
  "Ava builds": GlyphSteps,    // existing kit — ordered steps climbing
  "Review plan": GlyphPlan,    // the whole run of steps, on the brand's path
  "Publish": GlyphPublish,     // fallback only — Publish renders the real seal
} as const;

export function StepRail({
  step,
  traveler,
  receipts,
}: {
  step: number;
  traveler?: string;
  /** The line under each gem — only ever what's actually decided so far. */
  receipts?: Partial<Record<(typeof STEPS)[number], string | null>>;
}) {
  return (
    <GemRail
      nodes={STEPS.map((label, i) => ({
        id: label,
        label,
        icon: STEP_GLYPHS[label],
        receipt: receipts?.[label] ?? null,
        decision: i === STEPS.length - 1,
        // "Live" is the verdict of this journey, so it gets the seal's own brass
        // pill — the same treatment Hired/Passed gets on a candidate's rail.
        sealed: label === "Publish",
      }))}
      current={step}
      traveler={traveler}
      ariaLabel="Where you are in building this job"
    />
  );
}

export interface ReviewPhaseCard {
  id: string;
  kind: string;
  icon: LucideIcon;
  accent: Accent;
  title: string;
  candidate: string;
  rationale: string;
  count: string;
  duration: string;
}

export function PhaseRow({
  phase,
  index,
  total,
  editing,
  onEdit,
  onRemove,
  onMove,
  onField,
}: {
  phase: ReviewPhaseCard;
  index: number;
  total: number;
  editing: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onField: (field: "title" | "candidate", value: string) => void;
}) {
  const reduce = useReducedMotion();
  const Icon = glyphForKind(phase.kind);
  // Chrome rests at low opacity so the eye lands on the title, not the buttons.
  const ctrlBtn =
    "grid h-7 w-7 place-items-center rounded-lg border-0 bg-transparent opacity-40 transition-opacity hover:opacity-100 focus-visible:opacity-100 disabled:opacity-15 disabled:cursor-not-allowed";
  const ctrlStyle = { color: "var(--hf-text-muted)" } as const;

  return (
    <motion.div
      layout
      initial={reduce ? false : { opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : 0.06, duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
      className="flex gap-3 sm:gap-4"
    >
      {/* The spine: one bare numeral. It used to be a coloured figure inside a
          differently-coloured ring, which put two accents on a step that has
          no accent to communicate. */}
      <div className="flex flex-col items-center">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center text-[19px] leading-none"
          style={{
            fontFamily: DISPLAY,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.02em",
            color: "var(--hf-green)",
          }}
        >
          {index + 1}
        </span>
        {index < total - 1 && <span className="mt-1 w-px flex-1" style={{ background: "var(--hf-border)" }} />}
      </div>

      {/* The sheet. Flat stock, one hairline, one brass rule at the head —
          letterhead, not a glass tile. The old card was a gradient that faded
          from 1.10:1 to 1.04:1 against the page as it descended, so it
          dissolved into the ground exactly where the reader needed an edge. */}
      <div
        className="group mb-3 flex-1 overflow-hidden rounded-xl transition-colors duration-200"
        style={{
          background: editing ? "var(--hf-surface-raised)" : "var(--hf-surface)",
          border: `1px solid ${editing ? "var(--hf-green-border)" : "var(--hf-border-strong)"}`,
          boxShadow: editing ? "inset 3px 0 0 var(--hf-green)" : "none",
        }}
      >
        <div className="h-[3px] w-full" style={{ background: "var(--hf-gold-border)" }} />
        <div className="p-4 sm:p-5">
          {/* Masthead: the mark sits inline with the kind, at text weight. The
              44px tinted tile that used to hold it was the largest block of
              colour on the card and said nothing the kind word didn't. */}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <span
                className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: "var(--hf-text-muted)" }}
              >
                <Icon size={14} strokeWidth={2} /> {phase.kind}
              </span>
              {editing ? (
                <input
                  value={phase.title}
                  onChange={(e) => onField("title", e.target.value)}
                  className="mt-1.5 w-full rounded-lg px-3 py-2 text-[21px] outline-none"
                  style={{ background: "var(--hf-surface-strong)", color: "var(--hf-text)", border: "1px solid var(--hf-border-strong)", fontFamily: DISPLAY, fontWeight: 500 }}
                />
              ) : (
                /* T1 — the only loud thing on the card. */
                <h3
                  className="mt-1 text-[21px] leading-[1.22]"
                  style={{ color: "var(--hf-text)", fontFamily: DISPLAY, fontWeight: 500, letterSpacing: "-0.015em" }}
                >
                  {phase.title}
                </h3>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)} className={ctrlBtn} style={ctrlStyle}><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label="Move down" disabled={index === total - 1} onClick={() => onMove(1)} className={ctrlBtn} style={ctrlStyle}><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" aria-label={editing ? "Done editing" : "Edit"} onClick={onEdit} className={ctrlBtn} style={editing ? { color: "var(--hf-green)", opacity: 1 } : ctrlStyle}>
                {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
              </button>
              <button type="button" aria-label="Remove" onClick={onRemove} className={ctrlBtn} style={ctrlStyle}><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          {/* T2 — what the candidate actually does. */}
          {editing ? (
            phase.candidate && (
              <textarea value={phase.candidate} onChange={(e) => onField("candidate", e.target.value)} rows={2} className="mt-3 w-full resize-none rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "var(--hf-surface-strong)", color: "var(--hf-text)", border: "1px solid var(--hf-border-strong)" }} />
            )
          ) : (
            phase.candidate && <p className="mt-2.5 text-[14px] leading-[1.55]" style={{ color: "var(--hf-text-soft)" }}>{phase.candidate}</p>
          )}

          {/* T3 — one plain metadata line. Two filled pills used to sit here
              brighter than the card that contained them. */}
          <p className="mt-2.5 text-[12px]" style={{ color: "var(--hf-text-muted)", fontVariantNumeric: "tabular-nums" }}>
            {phase.count}
            <span style={{ margin: "0 0.5em", opacity: 0.55 }}>·</span>
            {phase.duration}
          </p>

          {/* Ava's note — a brass rule in the margin, the way a hand annotates
              a page. No fill, no box, no synthetic oblique (Inter ships no
              italic axis here, so the old italic was a faked slant). */}
          <div className="mt-3.5 flex items-start gap-2.5 pl-3.5" style={{ borderLeft: "2px solid var(--hf-gold-border)" }}>
            <div className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--hf-gold)" }}>Why this step</span>
              <span className="mt-1 block text-[13.5px] leading-[1.5]" style={{ color: "var(--hf-text-soft)" }}>{phase.rationale}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function BuildStep({
  role,
  rigorLabel,
  reasoning,
  generating,
  onDone,
}: {
  role: string;
  rigorLabel: string;
  reasoning: string[];
  generating: boolean;
  onDone: () => void;
}) {
  const reduce = useReducedMotion();
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (reduce) {
      setRevealed(reasoning.length);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    let i = 0;
    const tick = () => {
      i += 1;
      setRevealed(i);
      if (i >= reasoning.length) return;
      timers.push(setTimeout(tick, 750));
    };
    timers.push(setTimeout(tick, 500));
    return () => timers.forEach(clearTimeout);
  }, [reduce, reasoning.length]);

  useEffect(() => {
    if (revealed >= reasoning.length && !generating) {
      const t = setTimeout(onDone, reduce ? 300 : 750);
      return () => clearTimeout(t);
    }
  }, [revealed, generating, onDone, reduce, reasoning.length]);

  return (
    <div className="flex flex-col items-center text-center">
      <h2 className="mt-2 text-2xl sm:text-3xl" style={{ fontFamily: DISPLAY, fontWeight: 500, color: "hsl(var(--foreground))" }}>Building your hiring flow…</h2>
      <p className="mt-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
        {role} · <span style={{ color: "hsl(var(--ck-brass))" }}>{rigorLabel} rigor</span>
        {generating && <span className="ml-2 opacity-70">· writing the questions</span>}
      </p>
      <div className="mt-7 w-full max-w-md space-y-1.5 text-left">
        {reasoning.map((line, i) => {
          const shown = i < revealed;
          const newest = i === revealed - 1;
          return (
            <motion.div
              key={line}
              initial={reduce ? false : { opacity: 0, x: -10 }}
              animate={shown ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
              transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors duration-500"
              style={{ background: newest ? "hsl(var(--primary) / 0.1)" : "transparent", border: newest ? "1px solid hsl(var(--primary) / 0.28)" : "1px solid transparent" }}
            >
              {i < revealed - 1 ? <Check className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--ck-jade))" }} /> : newest ? <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: "hsl(var(--primary))", boxShadow: "0 0 0 4px hsl(var(--primary) / 0.18)" }} /> : <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ border: "1.5px solid hsl(var(--border))" }} />}
              <span className="text-sm" style={{ color: newest ? "hsl(var(--foreground))" : shown ? "hsl(var(--foreground) / 0.7)" : "hsl(var(--muted-foreground))", fontWeight: newest ? 600 : 400 }}>{line}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
