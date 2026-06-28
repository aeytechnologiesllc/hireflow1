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
import { AvaOrb } from "@/components/ava/AvaOrb";
import { AvaGlyph } from "@/components/ava/AvaGlyph";

export const DISPLAY = "'Fraunces', Georgia, serif";

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

export function StepRail({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 sm:gap-2">
      {STEPS.map((label, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <div key={label} className="flex items-center gap-1.5 sm:gap-2">
            <div
              className="flex items-center gap-2 rounded-full px-2.5 py-1 transition-colors duration-500"
              style={{ background: active ? "hsl(var(--primary) / 0.14)" : "transparent" }}
            >
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold transition-colors duration-500"
                style={{
                  background: done ? "hsl(var(--ck-jade))" : active ? "hsl(var(--primary))" : "hsl(var(--muted))",
                  color: done || active ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                }}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className="hidden text-xs font-medium md:inline" style={{ color: active ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && <span className="h-px w-3 sm:w-5" style={{ background: "hsl(var(--border))" }} />}
          </div>
        );
      })}
    </div>
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
  const a = ACCENT[phase.accent];
  const Icon = phase.icon;
  const ctrlBtn = "grid h-7 w-7 place-items-center rounded-lg transition-colors disabled:opacity-25 disabled:cursor-not-allowed";
  const ctrlStyle = { background: "hsl(var(--ck-surface-2))", color: "hsl(var(--muted-foreground))", border: "1px solid hsl(var(--border))" } as const;

  return (
    <motion.div
      layout
      initial={reduce ? false : { opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : 0.06, duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
      className="flex gap-3 sm:gap-4"
    >
      <div className="flex flex-col items-center">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold"
          style={{ background: "hsl(var(--card))", border: `1.5px solid ${a.line}`, color: a.fg, fontFamily: DISPLAY }}
        >
          {index + 1}
        </span>
        {index < total - 1 && <span className="mt-1 w-px flex-1" style={{ background: "hsl(var(--border))" }} />}
      </div>
      <div
        className="group mb-3 flex-1 rounded-2xl p-4 transition-all duration-300 sm:p-5"
        style={{
          background: editing ? "hsl(var(--primary) / 0.06)" : "var(--gradient-card)",
          border: editing ? "1px solid hsl(var(--primary) / 0.45)" : "1px solid hsl(var(--border))",
          boxShadow: editing ? "0 0 30px hsl(var(--primary) / 0.1)" : "var(--shadow-md)",
        }}
      >
        {/* Header: icon paired with kind + title; controls pinned top-right */}
        <div className="flex items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: a.tile, color: a.fg, border: `1px solid ${a.edge}` }}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: a.fg }}>{phase.kind}</span>
            {editing ? (
              <input value={phase.title} onChange={(e) => onField("title", e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2 text-[17px] font-semibold outline-none" style={{ background: "hsl(var(--ck-surface-2))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))", fontFamily: DISPLAY }} />
            ) : (
              <h3 className="mt-0.5 text-[17px] font-semibold leading-snug" style={{ color: "hsl(var(--foreground))", fontFamily: DISPLAY }}>{phase.title}</h3>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)} className={ctrlBtn} style={ctrlStyle}><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label="Move down" disabled={index === total - 1} onClick={() => onMove(1)} className={ctrlBtn} style={ctrlStyle}><ArrowDown className="h-3.5 w-3.5" /></button>
            <button type="button" aria-label={editing ? "Done editing" : "Edit"} onClick={onEdit} className={ctrlBtn} style={editing ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", border: "1px solid hsl(var(--primary))" } : ctrlStyle}>
              {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            </button>
            <button type="button" aria-label="Remove" onClick={onRemove} className={ctrlBtn} style={ctrlStyle}><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        {/* What the candidate experiences */}
        {editing ? (
          phase.candidate && (
            <textarea value={phase.candidate} onChange={(e) => onField("candidate", e.target.value)} rows={2} className="mt-3 w-full resize-none rounded-lg px-3 py-2 text-sm outline-none" style={{ background: "hsl(var(--ck-surface-2))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }} />
          )
        ) : (
          phase.candidate && <p className="mt-3 text-sm leading-relaxed" style={{ color: "hsl(var(--foreground) / 0.85)" }}>{phase.candidate}</p>
        )}

        {/* Metrics — their own quiet line, not competing with the title */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-medium" style={{ background: "hsl(var(--ck-surface-2))", color: "hsl(var(--muted-foreground))" }}>{phase.count}</span>
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10.5px] font-medium" style={{ background: "hsl(var(--ck-surface-2))", color: "hsl(var(--muted-foreground))" }}>
            <Clock className="h-2.5 w-2.5" /> {phase.duration}
          </span>
        </div>

        {/* Ava's reasoning — elevated insight (legible, not buried metadata) */}
        <div className="mt-3 flex items-start gap-2.5 rounded-r-lg py-1.5 pl-3 pr-2" style={{ borderLeft: "2px solid hsl(var(--ck-brass) / 0.6)", background: "hsl(var(--ck-surface-2) / 0.55)" }}>
          <AvaGlyph size={14} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <span className="block text-[9.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "hsl(var(--ck-brass))" }}>Why this step</span>
            <span className="mt-0.5 block text-[13px] leading-relaxed" style={{ color: "hsl(var(--foreground) / 0.85)" }}>{phase.rationale}</span>
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
      <motion.div initial={reduce ? false : { scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.55, type: "spring", bounce: 0.2 }}>
        <AvaOrb size={248} amp={0.34} flow={0.95} spin={0.12} reflection={false} />
      </motion.div>
      <h2 className="mt-2 text-2xl sm:text-3xl" style={{ fontFamily: DISPLAY, fontWeight: 500, color: "hsl(var(--foreground))" }}>Building your hiring flow…</h2>
      <p className="mt-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
        {role} · <span style={{ color: "hsl(var(--ck-brass))" }}>{rigorLabel} rigor</span>
        {generating && <span className="ml-2 opacity-70">· designing with AI</span>}
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
