import { Fragment, useEffect, useRef, useState } from "react";
import { Check, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import AvaGlyph from "@/components/AvaGlyph";
import DemoParticles from "@/components/landing/DemoParticles";
import { prefersReducedMotion } from "@/lib/prefersReducedMotion";
import { getScrollParent } from "@/lib/scrollParent";

// Cinematic, ad-like demo. A moving-camera 3D particle field + a 7-beat story:
// HOOK (the scale) → CREATE (Ava drafts the job) → SCREEN (scores on dials) →
// SHORTLIST (ranked top 5) → REVIEW (you advance the finalist) → SCHEDULE (book the
// interview) → HIRE (offer accepted). Scenes cut with depth transitions; numbers
// count up; brass is reserved for the win.

const STEPS = ["Create", "Screen", "Shortlist", "Review", "Schedule", "Hire"];
// dwell per scene — each cuts ~0.5s after its animation finishes, so the loop stays brisk
const SCENE_MS = [1700, 2000, 2000, 1800, 2300, 2300, 2300];
const EASE = [0.22, 1, 0.36, 1] as const;
const POP = [0.34, 1.56, 0.64, 1] as const; // overshoot for tactile "snap" pops

// ---- count-up driver: eases a number from 0 → target after an optional delay ----
function useCountUp(target: number, duration = 1100, delay = 0) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) { setVal(target); return; } // no animation; show final value
    let raf = 0;
    let start = 0;
    const timer = window.setTimeout(() => {
      const step = (now: number) => {
        if (!start) start = now;
        const t = Math.min(1, (now - start) / duration);
        setVal(target * (1 - Math.pow(1 - t, 3)));
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => { window.clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [target, duration, delay]);
  return val;
}

function Avatar({ initials, className = "" }: { initials: string; className?: string }) {
  return (
    <span className={`flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-semibold shrink-0 bg-emerald-500/20 text-emerald-200 ${className}`}>
      {initials}
    </span>
  );
}

// ---- animated radial score dial (replaces the flat bars) -----------------------
function Dial({ value, size = 66, stroke = 5, delay = 0, grad = "dialGrad", glow = false }:
  { value: number; size?: number; stroke?: number; delay?: number; grad?: string; glow?: boolean }) {
  const v = useCountUp(value, 820, delay);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(v, 100) / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${grad})`} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={glow ? { filter: "drop-shadow(0 0 6px rgba(52,211,153,0.55))" } : undefined}
        />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center font-semibold text-white [font-variant-numeric:tabular-nums]"
        style={{ fontSize: size * 0.3 }}
      >
        {Math.round(v)}
      </div>
    </div>
  );
}

function SceneHook() {
  const n = useCountUp(214, 1000, 100);
  return (
    <div className="flex flex-col items-center justify-center text-center h-full">
      <motion.div
        initial={{ scale: 0.82, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: EASE }}
        className="font-serif text-white leading-none [font-variant-numeric:tabular-nums]"
        style={{ fontSize: "clamp(60px,18vw,118px)", textShadow: "0 0 60px rgba(52,211,153,0.35)" }}
      >
        {Math.round(n)}
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.5 }}
        className="mt-3 text-gray-200 text-base sm:text-lg">
        applicants — <span className="text-emerald-300">all screened by Ava</span>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
        className="mt-2 text-gray-400 text-sm">Your shortlist, ready in minutes.</motion.div>
    </div>
  );
}

function SceneCreate() {
  const title = "Senior Product Designer";
  const [len, setLen] = useState(0);
  const [chips, setChips] = useState(false);
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i++;
      setLen(i);
      if (i >= title.length) { clearInterval(id); setTimeout(() => setChips(true), 140); }
    }, 30);
    return () => clearInterval(id);
  }, []);
  const flow = ["Portfolio review", "Live AI interview", "Take-home task", "Culture fit"];
  return (
    <div className="px-5 sm:px-7 py-6">
      <div className="text-[12px] text-gray-400 mb-2">New role</div>
      <div className="rounded-xl border border-emerald-500/15 bg-[hsl(220,16%,8%)]/70 backdrop-blur-sm px-4 py-3.5">
        <div className="text-white font-medium text-[15px] min-h-[22px]">
          {title.slice(0, len)}
          {len < title.length && <span className="text-emerald-400 animate-pulse">|</span>}
        </div>
        <div className="mt-1 text-[12px] text-gray-400">Full-time · Remote</div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-[12.5px] text-emerald-300">
        <AvaGlyph className="h-3.5 w-3.5" /> Ava drafted your screening flow
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {flow.map((s, i) => (
          <span
            key={s}
            className="rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-200 text-[12px] px-3 py-1.5"
            style={{ opacity: chips ? 1 : 0, transform: chips ? "none" : "translateY(8px) scale(0.96)", transition: `all .45s cubic-bezier(.22,1,.36,1) ${i * 70}ms` }}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function SceneScreen() {
  return (
    <div className="px-5 sm:px-7 py-5">
      <div className="flex items-center gap-3.5">
        <Avatar initials="JD" className="w-11 h-11 text-sm" />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] text-white font-medium">Jordan Diaz</div>
          <div className="text-[12px] text-gray-400 flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/70 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Interview complete · scored by Ava
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Dial value={94} size={82} stroke={7} delay={150} glow />
          <span className="text-[11px] text-emerald-300">Strong match</span>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: "Skills", value: 96, delay: 280 },
          { label: "Experience", value: 90, delay: 400 },
          { label: "Communication", value: 92, delay: 520 },
        ].map((d) => (
          <div key={d.label} className="flex flex-col items-center gap-1.5">
            <Dial value={d.value} size={62} stroke={5} delay={d.delay} />
            <span className="text-[11px] text-gray-400 text-center leading-tight">{d.label}</span>
          </div>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.45, ease: EASE }}
        className="mt-5 rounded-xl border border-emerald-500/12 bg-white/[0.02] px-3.5 py-3"
      >
        <div className="text-[11px] text-gray-400 mb-1 flex items-center gap-1.5">
          <AvaGlyph className="h-3 w-3 text-emerald-400" /> Ava's read
        </div>
        <p className="text-[13px] leading-relaxed text-gray-300">
          Led 0→1 design at two startups. Reversed a launch on data, not ego — clear, evidence-driven judgment.
        </p>
      </motion.div>
    </div>
  );
}

const RANKED = [
  { rank: 1, initials: "JD", name: "Jordan Diaz", score: 94 },
  { rank: 2, initials: "AO", name: "Amara Okafor", score: 91 },
  { rank: 3, initials: "TM", name: "Theo Müller", score: 88 },
  { rank: 4, initials: "RP", name: "Riya Patel", score: 85 },
  { rank: 5, initials: "SK", name: "Sana Khan", score: 83 },
];

function CountScore({ value, delay }: { value: number; delay: number }) {
  const v = useCountUp(value, 650, delay);
  return <span className="text-sm font-semibold text-white [font-variant-numeric:tabular-nums]">{Math.round(v)}</span>;
}

function SceneShortlist() {
  return (
    <div className="px-5 sm:px-7 py-5">
      <div className="text-[12px] text-gray-400 mb-3">
        Ava ranked <span className="text-white font-medium">214</span> applicants · your top 5
      </div>
      <div className="space-y-2" style={{ perspective: 900 }}>
        {RANKED.map((c, i) => {
          const top = c.rank === 1;
          return (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, y: 18, rotateX: -14 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ delay: i * 0.08, duration: 0.45, ease: EASE }}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                top
                  ? "border-[#e6c184]/45 bg-[#e6c184]/[0.07] shadow-[0_0_34px_-12px_rgba(230,193,132,0.55)]"
                  : "border-emerald-500/15 bg-emerald-500/[0.04]"
              }`}
            >
              <span className={`w-4 text-center text-[12px] font-medium [font-variant-numeric:tabular-nums] ${top ? "text-[#e6c184]" : "text-emerald-300/80"}`}>{c.rank}</span>
              <Avatar initials={c.initials} className={top ? "bg-[#e6c184]/20 text-[#f0d9ad]" : ""} />
              <span className="flex-1 min-w-0 text-[13.5px] text-white font-medium truncate">{c.name}</span>
              <CountScore value={c.score} delay={i * 70 + 200} />
              <Check className={`h-4 w-4 shrink-0 ${top ? "text-[#e6c184]" : "text-emerald-400"}`} />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ===== Scene 5 — REVIEW: the human advances the finalist (brass payoff) =========
function SceneReview() {
  const [pressed, setPressed] = useState(false); // scale dip
  const [done, setDone] = useState(false); // brass confirm + card bloom
  useEffect(() => {
    const t1 = setTimeout(() => setPressed(true), 1150);
    const t2 = setTimeout(() => setDone(true), 1450);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const brief = [
    "Led 0→1 design at two startups — shipped, not just shaped.",
    "Reversed a launch on data, not ego.",
    "Communicates tradeoffs like a lead.",
  ];

  return (
    <div className="px-5 sm:px-7 py-5 h-full flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="flex items-center gap-3.5 rounded-xl border border-[#e6c184]/45 bg-[#e6c184]/[0.07] px-3.5 py-3"
        style={{ boxShadow: done ? "0 0 44px -8px rgba(230,193,132,0.6)" : "0 0 34px -12px rgba(230,193,132,0.45)", transition: "box-shadow .6s cubic-bezier(.22,1,.36,1)" }}
      >
        <Avatar initials="JD" className="w-11 h-11 text-sm bg-[#e6c184]/20 text-[#f0d9ad]" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[15px] text-white font-medium truncate">Jordan Diaz</span>
            <span className="rounded-full border border-[#e6c184]/45 bg-[#e6c184]/[0.07] text-[#e6c184] text-[10px] px-2 py-0.5 leading-none [font-variant-numeric:tabular-nums]">#1</span>
          </div>
          <div className="text-[12px] text-gray-400 truncate">Senior Product Designer · Final review</div>
        </div>
        <div className="flex flex-col items-end shrink-0">
          <span className="font-serif text-[#e6c184] leading-none text-[26px] [font-variant-numeric:tabular-nums]">94</span>
          <span className="text-[11px] text-[#e6c184]/80 mt-0.5">Strong match</span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5, ease: EASE }}
        className="mt-4 rounded-xl border border-emerald-500/12 bg-white/[0.02] px-3.5 py-3"
      >
        <div className="text-[11px] text-gray-400 mb-2 flex items-center gap-1.5">
          <AvaGlyph className="h-3 w-3 text-emerald-400" /> Ava's brief — why she stands out
        </div>
        <div className="space-y-1.5">
          {brief.map((line, i) => (
            <motion.div
              key={line}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.12, duration: 0.4, ease: EASE }}
              className="flex items-start gap-2 text-[13px] leading-snug text-gray-300"
            >
              <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-400" />
              <span>{line}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <div className="mt-auto pt-4">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.95, duration: 0.4 }}
          className="mb-2.5 flex items-center justify-center gap-1.5 text-[11.5px] text-gray-400"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/70 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          You decide — <span className="text-emerald-300">no auto-rejections</span>
        </motion.div>

        <motion.button
          type="button"
          tabIndex={-1}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, scale: pressed && !done ? 0.97 : 1 }}
          transition={{ opacity: { delay: 0.85, duration: 0.45, ease: EASE }, y: { delay: 0.85, duration: 0.45, ease: EASE }, scale: { duration: 0.18, ease: EASE } }}
          className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-semibold transition-colors duration-300 ${done ? "bg-[#e6c184]/[0.12] text-[#f0d9ad] border border-[#e6c184]/45 shadow-[0_0_34px_-10px_rgba(230,193,132,0.6)]" : "bg-emerald-500/10 text-emerald-200 border border-emerald-500/25"}`}
        >
          {done ? (<><Check className="h-4 w-4" /> Advanced to interview</>) : (<>Advance to interview <ArrowRight className="h-4 w-4" /></>)}
        </motion.button>
      </div>
    </div>
  );
}

// ===== Scene 6 — SCHEDULE: pick a slot, Ava books it ============================
function SceneSchedule() {
  const slots = [
    { day: "Tue", time: "11:00 AM" },
    { day: "Tue", time: "2:30 PM", picked: true },
    { day: "Tue", time: "4:00 PM" },
    { day: "Wed", time: "10:00 AM" },
    { day: "Wed", time: "1:00 PM" },
    { day: "Wed", time: "3:30 PM" },
  ];
  return (
    <div className="px-5 sm:px-7 py-5 flex flex-col h-full">
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="flex items-center gap-3"
      >
        <Avatar initials="JD" className="w-11 h-11 text-sm bg-[#e6c184]/20 text-[#f0d9ad]" />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] text-white font-medium">Jordan Diaz</div>
          <div className="text-[12px] text-gray-400">Final interview · 45 min · video</div>
        </div>
        <span className="inline-flex items-center rounded-full border border-[#e6c184]/45 bg-[#e6c184]/[0.07] px-2.5 py-1 text-[11px] text-[#e6c184] [font-variant-numeric:tabular-nums] shrink-0">#1 · 94</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28, duration: 0.4 }}
        className="mt-4 flex items-center gap-1.5 text-[12.5px] text-emerald-300"
      >
        <AvaGlyph className="h-3.5 w-3.5" /> Ava found times that work for both of you
      </motion.div>

      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {slots.map((s, i) => {
          const picked = !!s.picked;
          return (
            <motion.button
              key={s.day + s.time}
              type="button"
              tabIndex={-1}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={picked ? { opacity: 1, y: 0, scale: [0.96, 1, 1.06, 1] } : { opacity: 1, y: 0, scale: 1 }}
              transition={picked ? { duration: 0.9, delay: 0.42, ease: EASE, times: [0, 0.45, 0.78, 1] } : { duration: 0.45, delay: 0.42 + i * 0.05, ease: EASE }}
              className={`relative flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors duration-300 ${picked ? "border-[#e6c184]/45 bg-[#e6c184]/[0.07] shadow-[0_0_34px_-12px_rgba(230,193,132,0.55)]" : "border-emerald-500/15 bg-white/[0.02]"}`}
            >
              <span className={`text-[11px] leading-none ${picked ? "text-[#e6c184]/80" : "text-gray-400"}`}>{s.day}</span>
              <span className={`text-[13px] font-medium leading-none [font-variant-numeric:tabular-nums] ${picked ? "text-[#f0d9ad]" : "text-gray-300"}`}>{s.time}</span>
              {picked && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.98, duration: 0.4, ease: POP }}
                  className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-[#e6c184] shadow-[0_0_12px_rgba(230,193,132,0.6)]"
                >
                  <Check className="h-2.5 w-2.5 text-[hsl(220,16%,9%)]" strokeWidth={3} />
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.18, duration: 0.5, ease: EASE }}
        className="mt-auto flex items-center gap-3 rounded-xl border border-[#e6c184]/45 bg-[#e6c184]/[0.07] px-3.5 py-3 shadow-[0_0_34px_-12px_rgba(230,193,132,0.55)]"
      >
        <motion.span
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.32, duration: 0.4, ease: POP }}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-[#e6c184]/20 shrink-0"
        >
          <Check className="h-4 w-4 text-[#e6c184]" strokeWidth={3} />
        </motion.span>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-medium text-[#f0d9ad]">Interview booked · Tue 2:30 PM</div>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5, duration: 0.26 }}
            className="mt-0.5 text-[12px] text-gray-400 flex items-center gap-1.5"
          >
            <AvaGlyph className="h-3 w-3 text-[#e6c184]" /> Ava sent the invite &amp; prep to Jordan
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

// ===== Scene 7 — HIRE: the finale / payoff (214 → 1) ============================
function FunnelNumber({ target, delay, brass = false }: { target: number; delay: number; brass?: boolean }) {
  const n = useCountUp(target, 900, delay);
  return (
    <span
      className="font-serif leading-none [font-variant-numeric:tabular-nums]"
      style={{ fontSize: "clamp(40px,11vw,62px)", color: brass ? "#e6c184" : "rgba(255,255,255,0.92)", textShadow: brass ? "0 0 44px rgba(230,193,132,0.45)" : "0 0 44px rgba(52,211,153,0.28)" }}
    >
      {Math.round(n)}
    </span>
  );
}

function CountScoreBrass({ value, delay }: { value: number; delay: number }) {
  const v = useCountUp(value, 700, delay);
  return <span className="text-[#e6c184] [font-variant-numeric:tabular-nums]">{Math.round(v)}</span>;
}

function SceneHire() {
  const stages = [
    { label: "Offer sent", delay: 0.55, brass: false },
    { label: "Accepted", delay: 0.75, brass: false },
    { label: "Hired", delay: 0.95, brass: true },
  ];
  return (
    <div className="px-5 sm:px-7 py-5 h-full flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: EASE }}
        className="flex items-center gap-3.5 rounded-xl border border-[#e6c184]/45 bg-[#e6c184]/[0.07] shadow-[0_0_40px_-12px_rgba(230,193,132,0.55)] px-4 py-3.5"
      >
        <Avatar initials="JD" className="w-11 h-11 text-sm bg-[#e6c184]/20 text-[#f0d9ad]" />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] text-white font-medium">Jordan Diaz</div>
          <div className="text-[12px] text-[#e6c184]/90 flex items-center gap-1.5">
            <AvaGlyph className="h-3 w-3" /> Top match · 94
          </div>
        </div>
        <motion.span
          initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: [0.6, 1.1, 1] }}
          transition={{ delay: 0.7, duration: 0.45, ease: EASE, times: [0, 0.6, 1] }}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#e6c184]/55 bg-[#e6c184]/15 text-[#f0d9ad] text-[12px] font-semibold tracking-[0.08em] px-3 py-1.5 shrink-0 shadow-[0_0_24px_-6px_rgba(230,193,132,0.6)]"
        >
          <Check className="h-3.5 w-3.5 text-[#e6c184]" /> HIRED
        </motion.span>
      </motion.div>

      <div className="mt-4 flex items-center gap-2">
        {stages.map((s, i) => (
          <Fragment key={s.label}>
            {i > 0 && (
              <div className="relative h-px flex-1 bg-white/10 overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 to-teal-400"
                  initial={{ width: "0%" }} animate={{ width: "100%" }}
                  transition={{ delay: s.delay - 0.12, duration: 0.22, ease: EASE }}
                />
              </div>
            )}
            <motion.span
              initial={{ opacity: 0.35, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: s.delay, duration: 0.35, ease: EASE }}
              className={`inline-flex items-center gap-1.5 rounded-full border text-[11.5px] px-2.5 py-1 shrink-0 ${s.brass ? "border-[#e6c184]/45 bg-[#e6c184]/[0.10] text-[#f0d9ad]" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"}`}
            >
              <Check className={`h-3 w-3 ${s.brass ? "text-[#e6c184]" : "text-emerald-400"}`} />
              {s.label}
            </motion.span>
          </Fragment>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.85, duration: 0.5, ease: EASE }}
        className="mt-auto rounded-xl border border-[#e6c184]/20 bg-white/[0.02] px-4 py-4 flex items-center justify-center gap-3 sm:gap-4"
      >
        <FunnelNumber target={214} delay={1050} />
        <div className="flex flex-col items-center leading-tight">
          <motion.span
            initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.1, duration: 0.4, ease: EASE }}
            className="text-gray-400"
          >
            <ArrowRight className="h-6 w-6" />
          </motion.span>
          <span className="text-[10px] text-gray-400 mt-0.5 tracking-wide">214 → 1</span>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: [0.7, 1.08, 1] }}
          transition={{ delay: 1.2, duration: 0.5, ease: EASE, times: [0, 0.6, 1] }}
          className="flex items-baseline gap-2"
        >
          <FunnelNumber target={1} delay={1200} brass />
          <div className="flex flex-col leading-tight">
            <span className="text-[13px] text-[#e6c184]/90 font-medium">hire</span>
            <span className="text-[11px] text-gray-400">the right one</span>
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4, duration: 0.4, ease: EASE }}
        className="mt-3 text-center text-[13px] text-gray-300"
      >
        Hired in{" "}
        <span className="font-semibold"><CountScoreBrass value={6} delay={1500} /></span>
        <span className="text-[#e6c184] font-semibold"> days</span>
        <span className="text-gray-400"> · you made the call, Ava did the legwork.</span>
      </motion.div>
    </div>
  );
}

const CAPTIONS = [
  "Every applicant, screened — automatically.",
  "Describe the role. Ava builds the screening.",
  "Ava scores each interview — with a reason for every number.",
  "A ranked shortlist — your top 5.",
  "You make the call — Ava just made it easy. No auto-rejections.",
  "Pick a time — Ava sends the invite & prep to Jordan.",
  "Offer accepted — 214 applicants to one hire, in 6 days.",
];

function SceneByIndex({ i }: { i: number }) {
  if (i === 0) return <SceneHook />;
  if (i === 1) return <SceneCreate />;
  if (i === 2) return <SceneScreen />;
  if (i === 3) return <SceneShortlist />;
  if (i === 4) return <SceneReview />;
  if (i === 5) return <SceneSchedule />;
  return <SceneHire />;
}

const SCENE_COUNT = 7;

export default function AvaDemo() {
  const [scene, setScene] = useState(0);
  // per-scene remount counter — bumping a scene's key replays its count-ups/typing
  const [keys, setKeys] = useState(() => Array(SCENE_COUNT).fill(0));
  const [playing, setPlaying] = useState(true); // false while the demo is scrolled out of view
  const ref = useRef<HTMLDivElement>(null);

  // pause the auto-advance when the demo isn't on screen (saves CPU/GPU; not running unseen)
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const root = getScrollParent(el);
    const io = new IntersectionObserver((e) => setPlaying(e[0].isIntersecting), { root, threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    // reduced-motion: freeze on the current beat; offscreen: pause. Both setters stay pure.
    if (prefersReducedMotion() || !playing) return;
    const next = (scene + 1) % SCENE_COUNT;
    const t = setTimeout(() => {
      setScene(next);
      setKeys((k) => { const n = [...k]; n[next] += 1; return n; });
    }, SCENE_MS[scene]);
    return () => clearTimeout(t);
  }, [scene, playing]);

  const stepIndex = scene - 1; // hook = -1 (no active step)

  return (
    <div className="relative">
      {/* shared SVG gradient defs for the dials */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id="dialGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#2dd4bf" />
          </linearGradient>
        </defs>
      </svg>

      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className="pointer-events-none absolute -inset-6 bg-emerald-500/[0.08] blur-3xl rounded-[32px]"
      />

      <div ref={ref} className="relative rounded-2xl bg-[hsl(220,16%,9%)] border border-[hsl(220,15%,16%)] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.9)] overflow-hidden">
        {/* live moving-camera 3D backdrop */}
        <DemoParticles scene={scene} className="absolute inset-0" style={{ opacity: 0.66 }} />
        {/* readability scrim — keeps text crisp on top while the field stays lively */}
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,16%,9%)]/45 via-[hsl(220,16%,9%)]/55 to-[hsl(220,16%,9%)]/90" />
        {/* soft vignette — frames the content and calms the edges (premium, intentional) */}
        <div className="absolute inset-0 bg-[radial-gradient(125%_95%_at_50%_50%,transparent_48%,rgba(10,13,16,0.5)_100%)]" />

        <div className="relative z-10">
          {/* chrome */}
          <div className="flex items-center gap-2 px-5 h-11 border-b border-[hsl(220,15%,14%)]">
            <span className="w-2.5 h-2.5 rounded-full bg-white/15" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
            <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
            <span className="ml-3 text-[13px] text-gray-400 truncate">HireFlow · Ava</span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-emerald-300 shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/70 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Ava working
            </span>
          </div>

          {/* stepper */}
          <div className="flex items-center gap-1 px-3 pt-3.5 sm:gap-2 sm:px-5">
            {STEPS.map((label, i) => (
              <div key={label} className="flex-1 min-w-0">
                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                    initial={false}
                    animate={{ width: i <= stepIndex ? "100%" : "0%" }}
                    transition={{ duration: 0.5, ease: EASE }}
                  />
                </div>
                <div className={`mt-1.5 text-[9px] sm:text-[10px] truncate transition-colors duration-500 ${i === stepIndex ? "text-white" : "text-gray-400"}`}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* scene stage — all scenes mounted; the active one cuts in from depth while
              the others blur back. Deterministic (no AnimatePresence unmount races).
              Decorative auto-playing showcase → aria-hidden (the captions below carry the message). */}
          <div className="relative" style={{ height: 372 }} aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => {
              const active = scene === i;
              return (
                <motion.div
                  key={i}
                  className="absolute inset-0"
                  initial={false}
                  animate={{
                    opacity: active ? 1 : 0,
                    scale: active ? 1 : scene > i ? 1.05 : 0.93,
                    filter: active ? "blur(0px)" : "blur(9px)",
                    y: active ? 0 : scene > i ? -22 : 22,
                  }}
                  transition={{ duration: 0.6, ease: EASE }}
                  style={{ pointerEvents: active ? "auto" : "none" }}
                >
                  <SceneByIndex key={keys[i]} i={i} />
                </motion.div>
              );
            })}
          </div>

          {/* caption */}
          <div className="px-5 py-3.5 border-t border-[hsl(220,15%,14%)] bg-emerald-500/[0.03] text-[12.5px] text-gray-300 flex items-center gap-2">
            <AvaGlyph className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <motion.span key={scene} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
              {CAPTIONS[scene]}
            </motion.span>
            {scene === 3 && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                className="ml-auto inline-flex items-center gap-1 text-emerald-300 shrink-0">
                Review <ArrowRight className="h-3.5 w-3.5" />
              </motion.span>
            )}
            {scene === 6 && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                className="ml-auto inline-flex items-center gap-1 text-[#e6c184] shrink-0">
                Hired <Check className="h-3.5 w-3.5" />
              </motion.span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
