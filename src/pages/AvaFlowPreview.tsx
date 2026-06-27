/**
 * AvaFlowPreview — animated, clickable PROTOTYPE of the create-job (Ava) flow.
 *
 * Route: /ava-preview (full-screen, outside AppLayout, no auth).
 *
 * Pure visual/motion prototype: canned data + setTimeout only, NO backend /
 * OpenAI calls. It lets the founder SEE the flow, design, and motion before real
 * logic is wired. Reuses the real Deep Jade tokens, Fraunces/Inter fonts, and the
 * actual <AvaOrb> component.
 *
 * The follow-up questions, Ava's reasoning, the rigor recommendation, and the
 * generated plan all ADAPT to the role typed in the brief via a small rule-based
 * "playbook" engine (try: Café Manager · Cleaner · Frontend Developer · Office
 * Administrator) — so the founder can step through different roles and see Ava
 * ask different things and build a different plan.
 *
 * Employer-facing copy ("Ava", AI framing) is fine here. The generated PLAN that
 * a candidate would see (job post, phase titles, candidate descriptions) uses NO
 * AI/Ava language — per CLAUDE.md Rule 3. Rationales are employer-side Ava notes.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Check,
  Sparkles,
  Mic,
  FileText,
  ListChecks,
  Trophy,
  ClipboardList,
  MessageSquare,
  MapPin,
  Briefcase,
  DollarSign,
  CalendarClock,
  Copy,
  QrCode,
  Share2,
  Pencil,
  ShieldCheck,
  Timer,
  Keyboard,
  Code2,
  Camera,
  Clock,
  X,
  Plus,
  GripVertical,
} from "lucide-react";
import { AvaOrb } from "@/components/ava/AvaOrb";
import { HeroBackground } from "@/components/ava/HeroBackground";
import { CountUp } from "@/cockpit/components/CountUp";

const DISPLAY = "'Fraunces', Georgia, serif";

const STEPS = ["Brief", "Follow-ups", "Rigor", "Ava builds", "Review plan", "Publish"] as const;

type RigorId = "easy" | "standard" | "high";
type Accent = "brass" | "jade" | "mint";

const ACCENT: Record<Accent, { tile: string; fg: string; line: string; edge: string }> = {
  brass: { tile: "hsl(var(--primary) / 0.14)", fg: "hsl(var(--ck-brass-bright))", line: "hsl(var(--primary))", edge: "hsl(var(--primary) / 0.3)" },
  jade: { tile: "hsl(var(--ck-jade) / 0.16)", fg: "hsl(var(--ck-jade))", line: "hsl(var(--ck-jade))", edge: "hsl(var(--ck-jade) / 0.3)" },
  mint: { tile: "hsl(var(--ck-mint) / 0.16)", fg: "hsl(var(--ck-mint))", line: "hsl(var(--ck-mint))", edge: "hsl(var(--ck-mint) / 0.3)" },
};

/* ────────────────────────────────────────────────────────────────────────────
 * Adaptive "playbook" engine — rule-based, keyed off the brief.
 * ──────────────────────────────────────────────────────────────────────────── */

type Family = "cash" | "cleaner" | "admin" | "developer" | "general";

interface FollowUp {
  id: string;
  question: string;
  chips: string[];
  def: number;
}

interface PhaseCard {
  id: string;
  kind: string;
  icon: LucideIcon;
  accent: Accent;
  title: string; // candidate-facing — NO AI language
  candidate: string; // candidate-facing — NO AI language
  rationale: string; // employer-facing Ava note — AI framing OK
  count: string;
  duration: string;
}

interface Playbook {
  label: string;
  followUps: (a: Record<string, number>) => FollowUp[];
  reasoning: string[];
  rigor: { recommended: RigorId; rationale: string };
  plan: (role: string) => PhaseCard[];
}

function detectFamily(brief: Record<string, string>): Family {
  const s = `${brief.role} ${brief.type} ${brief.work}`.toLowerCase();
  if (/clean|janitor|housekeep|custodi|maid|porter/.test(s)) return "cleaner";
  if (/develop|engineer|programmer|coder|software|frontend|front-end|back-?end|full-?stack|web dev|data scientist/.test(s))
    return "developer";
  if (/admin|secretar|reception|assistant|office|clerk|book-?keep|schedul|coordinat|data entry/.test(s)) return "admin";
  if (/manager|cashier|finance|account|teller|retail|server|barista|caf[eé]|waiter|waitress|host|sales|store|bank|restaurant|bartender/.test(s))
    return "cash";
  return "general";
}

const PLAYBOOKS: Record<Family, Playbook> = {
  cash: {
    label: "front-of-house / cash-handling",
    followUps: (a) => {
      const team = a["cash-team"] ?? 1;
      const teamLabel = ["", "your 2–4 person team", "your 5–10 person team", "a 10+ person team"][team] || "the team";
      return [
        { id: "cash-team", question: "Will this person manage a team?", chips: ["Solo for now", "2–4 staff", "5–10 staff", "10+ staff"], def: 1 },
        { id: "cash-money", question: "Do they handle cash, the till, or daily deposits?", chips: ["No money handling", "Light register use", "Full till + deposits"], def: 2 },
        {
          id: "cash-pressure",
          question: team >= 1 ? `Leading ${teamLabel}, how busy do shifts get?` : "How busy does a typical shift get?",
          chips: ["Calm & steady", "Steady with rushes", "High-volume, fast"],
          def: 2,
        },
      ];
    },
    reasoning: [
      "Reading the role and the day-to-day",
      "Weighing responsibility — cash, team, pressure",
      "Choosing the right screening steps",
      "Writing practical, on-the-floor scenarios",
      "Building the scorecard",
      "Preparing your shortlist criteria",
    ],
    rigor: {
      recommended: "high",
      rationale:
        "They'll handle the till and deposits, lead a team, and own open/close — a mishire here is expensive. A practical simulation plus a structured voice interview protects you.",
    },
    plan: (role) => [
      { id: "p0", kind: "Job post", icon: ClipboardList, accent: "brass", title: role, candidate: "Warm, clear listing: run daily operations, lead a small team, own the till and open/close. Friendly, no jargon.", rationale: "I led with the day-to-day and team size you gave me, so the right people self-select in.", count: "Ready to post", duration: "Public" },
      { id: "p1", kind: "Application", icon: FileText, accent: "jade", title: "A few quick questions", candidate: "Availability, years leading a team, comfort with cash, and why this place.", rationale: "Short enough that good people finish, sharp enough to filter.", count: "4 questions", duration: "~3 min" },
      { id: "p2", kind: "Quiz", icon: Timer, accent: "mint", title: "Short timed scenarios", candidate: "A till comes up short, a delivery's late before the rush, two staff call out.", rationale: "Timed, so I see judgment under a little pressure — like a real shift.", count: "12 items", duration: "10 min" },
      { id: "p3", kind: "Simulation", icon: MessageSquare, accent: "brass", title: "Handle a real moment", candidate: "Calm an upset regular, then reconcile the end-of-day till.", rationale: "A practical role-play graded on de-escalation and accuracy — your two biggest risks.", count: "2 scenarios", duration: "~6 min" },
      { id: "p4", kind: "Voice interview", icon: Mic, accent: "mint", title: "Answer a few questions out loud", candidate: "A short, friendly recording about leading a team and a tough day you turned around.", rationale: "The strongest signal — I score clarity, judgment and ownership, and it's the hardest to fake.", count: "8 questions", duration: "~8 min" },
      { id: "p5", kind: "Shortlist", icon: Trophy, accent: "brass", title: "Your ranked top picks", candidate: "", rationale: "I rank everyone and hand you the top 3 with my read. You just Advance or Pass.", count: "Top 3", duration: "Weighted" },
    ],
  },

  cleaner: {
    label: "cleaning / trust-based",
    followUps: (a) => {
      const access = a["cln-access"] ?? 2;
      return [
        { id: "cln-solo", question: "Will they mostly work on their own?", chips: ["Always solo", "Solo + occasional crew", "Part of a crew"], def: 0 },
        { id: "cln-access", question: "Will they have keys or access to private spaces?", chips: ["Public areas only", "Offices after hours", "Clients' homes / private"], def: 2 },
        {
          id: "cln-schedule",
          question: access >= 1 ? "Trust matters here — what hours is this?" : "What hours does this run?",
          chips: ["Daytime", "Evenings", "Early mornings", "Overnight"],
          def: 0,
        },
      ];
    },
    reasoning: [
      "Reading the role and the spaces involved",
      "Weighing trust, reliability & lone working",
      "Choosing a light-but-honest screen",
      "Writing real on-the-job scenarios",
      "Building the scorecard",
      "Preparing your shortlist criteria",
    ],
    rigor: {
      recommended: "standard",
      rationale:
        "This is a trust-and-reliability hire more than a technical one. A light screen plus a short voice interview confirms dependability — without scaring off good, busy applicants.",
    },
    plan: (role) => [
      { id: "p0", kind: "Job post", icon: ClipboardList, accent: "brass", title: role, candidate: "Clear, honest listing: the spaces, the hours, and what 'done right' looks like. No jargon.", rationale: "I kept it plain and specific so reliable people know exactly what they're signing up for.", count: "Ready to post", duration: "Public" },
      { id: "p1", kind: "Application", icon: FileText, accent: "jade", title: "A few quick questions", candidate: "Availability, reliable transport, past cleaning work, and references.", rationale: "Reliability is the whole game here — I check it first.", count: "4 questions", duration: "~2 min" },
      { id: "p2", kind: "Reliability check", icon: ShieldCheck, accent: "mint", title: "A short reliability check", candidate: "Quick scenarios: you're running late, a client changes the time, something's broken when you arrive.", rationale: "Dependability and honesty matter more than speed — these surface both.", count: "6 items", duration: "5 min" },
      { id: "p3", kind: "Walkthrough", icon: Camera, accent: "brass", title: "Show your standard", candidate: "Walk through how you'd deep-clean a space and what you'd flag to the owner.", rationale: "Lets me see attention to detail and care in private spaces — without a trial visit.", count: "1 scenario", duration: "~4 min" },
      { id: "p4", kind: "Voice interview", icon: Mic, accent: "mint", title: "Answer a few questions out loud", candidate: "A short recording about working unsupervised and handling a client's trust.", rationale: "Trust is hard to test on paper — voice shows me reliability and care.", count: "5 questions", duration: "~5 min" },
      { id: "p5", kind: "Shortlist", icon: Trophy, accent: "brass", title: "Your ranked top picks", candidate: "", rationale: "I rank for reliability and trust, then hand you the top few. You just Advance or Pass.", count: "Top 5", duration: "Weighted" },
    ],
  },

  admin: {
    label: "office / administrative",
    followUps: (a) => {
      const rec = a["adm-records"] ?? 2;
      return [
        { id: "adm-sched", question: "How much scheduling & calendar ownership?", chips: ["Light", "A few calendars", "Owns all scheduling"], def: 1 },
        { id: "adm-records", question: "Will they handle confidential records?", chips: ["No", "Some sensitive info", "Highly confidential"], def: 2 },
        {
          id: "adm-tools",
          question: rec >= 2 ? "Given the sensitive data, which tools will they live in?" : "Which tools will they live in?",
          chips: ["Email & docs", "Spreadsheets + CRM", "Full office suite + booking"],
          def: 1,
        },
      ];
    },
    reasoning: [
      "Reading the role and the day-to-day",
      "Weighing organization & confidentiality",
      "Choosing a focused, fair screen",
      "Writing real inbox & calendar scenarios",
      "Building the scorecard",
      "Preparing your shortlist criteria",
    ],
    rigor: {
      recommended: "standard",
      rationale:
        "They'll own scheduling and sensitive records. A focused screen on organization and discretion is enough — no need to over-test a support role.",
    },
    plan: (role) => [
      { id: "p0", kind: "Job post", icon: ClipboardList, accent: "brass", title: role, candidate: "Clear listing: the calendars, the tools, and the confidentiality this role carries.", rationale: "I emphasized organization and discretion so the right profile applies.", count: "Ready to post", duration: "Public" },
      { id: "p1", kind: "Application", icon: FileText, accent: "jade", title: "A few quick questions", candidate: "Tools you know, scheduling experience, and comfort with confidential info.", rationale: "Filters for the office-software fit and discretion this role needs.", count: "4 questions", duration: "~3 min" },
      { id: "p2", kind: "Skills check", icon: Keyboard, accent: "mint", title: "A short practical check", candidate: "Tidy a messy calendar, prioritize a busy inbox, and spot a confidentiality slip.", rationale: "Shows real organization and judgment — not just a tidy résumé.", count: "8 items", duration: "8 min" },
      { id: "p3", kind: "Simulation", icon: MessageSquare, accent: "brass", title: "Handle a real moment", candidate: "Draft a calm reply to a double-booked client and reschedule cleanly.", rationale: "Tone and accuracy under a little chaos — exactly the day-to-day.", count: "1 scenario", duration: "~5 min" },
      { id: "p4", kind: "Voice interview", icon: Mic, accent: "mint", title: "Answer a few questions out loud", candidate: "A short recording about juggling priorities and handling sensitive information.", rationale: "I score clarity and discretion — the traits that make or break this role.", count: "6 questions", duration: "~6 min" },
      { id: "p5", kind: "Shortlist", icon: Trophy, accent: "brass", title: "Your ranked top picks", candidate: "", rationale: "I rank for organization and discretion, then hand you the top few.", count: "Top 5", duration: "Weighted" },
    ],
  },

  developer: {
    label: "software / technical",
    followUps: (a) => {
      const remote = a["dev-setup"] ?? 2;
      return [
        { id: "dev-stack", question: "What's the core stack?", chips: ["Frontend", "Backend", "Full-stack", "Mobile"], def: 2 },
        { id: "dev-setup", question: "What's the work setup?", chips: ["On-site", "Hybrid", "Fully remote"], def: 2 },
        {
          id: "dev-test",
          question: remote === 2 ? "Remote role — open to a short practical code test?" : "Open to a short practical code test?",
          chips: ["Yes — take-home", "Yes — live pairing", "Portfolio only"],
          def: 0,
        },
      ];
    },
    reasoning: [
      "Reading the role and the stack",
      "Weighing skills, ways of working & remote setup",
      "Choosing a fair, practical screen",
      "Setting up a real code test, not trivia",
      "Building the scorecard",
      "Preparing your shortlist criteria",
    ],
    rigor: {
      recommended: "high",
      rationale:
        "Skill claims are easy to inflate. A short practical code test plus a structured voice interview gives you real signal before you spend live interview time.",
    },
    plan: (role) => [
      { id: "p0", kind: "Job post", icon: ClipboardList, accent: "brass", title: role, candidate: "Clear listing: the stack, the team, and how you work (remote-friendly).", rationale: "I led with the stack and setup you gave me so the right engineers apply.", count: "Ready to post", duration: "Public" },
      { id: "p1", kind: "Application", icon: FileText, accent: "jade", title: "A few quick questions", candidate: "Core stack, years of experience, work setup, and a link to past work.", rationale: "Quick filter on stack fit and ways of working.", count: "4 questions", duration: "~3 min" },
      { id: "p2", kind: "Code test", icon: Code2, accent: "mint", title: "A short practical task", candidate: "A small, real take-home: build one focused feature and explain a tradeoff.", rationale: "Real code beats buzzwords — this is the signal that actually predicts the job.", count: "1 task", duration: "~45 min" },
      { id: "p3", kind: "Technical scenarios", icon: ListChecks, accent: "brass", title: "Short technical scenarios", candidate: "Debug a failing snippet, pick a data structure, reason about an edge case.", rationale: "Sharp, timed checks of the fundamentals to back up the take-home.", count: "8 items", duration: "12 min" },
      { id: "p4", kind: "Voice interview", icon: Mic, accent: "mint", title: "Answer a few questions out loud", candidate: "A short recording walking through a project and a hard technical call you made.", rationale: "I score how they reason and communicate — the part a code test can't show.", count: "6 questions", duration: "~7 min" },
      { id: "p5", kind: "Shortlist", icon: Trophy, accent: "brass", title: "Your ranked top picks", candidate: "", rationale: "I weight the code test highest, then hand you the top few.", count: "Top 3", duration: "Weighted" },
    ],
  },

  general: {
    label: "this role",
    followUps: () => [
      { id: "gen-team", question: "Will this person manage a team?", chips: ["Solo for now", "2–4 staff", "5+ staff"], def: 0 },
      { id: "gen-cust", question: "Is the role customer-facing?", chips: ["Behind the scenes", "Some customer contact", "Front-line"], def: 1 },
      { id: "gen-pressure", question: "How busy does a typical shift get?", chips: ["Calm & steady", "Steady with rushes", "High-volume, fast"], def: 1 },
    ],
    reasoning: [
      "Reading the role and the day-to-day",
      "Weighing what this role really needs",
      "Choosing the right screening steps",
      "Writing practical, role-specific scenarios",
      "Building the scorecard",
      "Preparing your shortlist criteria",
    ],
    rigor: { recommended: "standard", rationale: "A balanced screen fits most roles — enough signal to rank well without over-testing good applicants." },
    plan: (role) => [
      { id: "p0", kind: "Job post", icon: ClipboardList, accent: "brass", title: role, candidate: "Clear, warm listing of the day-to-day and what great looks like.", rationale: "I kept it specific so the right people self-select in.", count: "Ready to post", duration: "Public" },
      { id: "p1", kind: "Application", icon: FileText, accent: "jade", title: "A few quick questions", candidate: "Availability, relevant experience, and why this role.", rationale: "A quick filter for fit.", count: "4 questions", duration: "~3 min" },
      { id: "p2", kind: "Quiz", icon: Timer, accent: "mint", title: "Short timed scenarios", candidate: "Real situations from a typical day on the job.", rationale: "Timed, so I see judgment under a little pressure.", count: "8 items", duration: "8 min" },
      { id: "p3", kind: "Simulation", icon: MessageSquare, accent: "brass", title: "Handle a real moment", candidate: "Walk through a common tricky situation for this role.", rationale: "A practical role-play graded on judgment.", count: "1 scenario", duration: "~5 min" },
      { id: "p4", kind: "Voice interview", icon: Mic, accent: "mint", title: "Answer a few questions out loud", candidate: "A short recording about your experience and approach.", rationale: "The strongest signal — clarity, judgment, ownership.", count: "6 questions", duration: "~6 min" },
      { id: "p5", kind: "Shortlist", icon: Trophy, accent: "brass", title: "Your ranked top picks", candidate: "", rationale: "I rank everyone and hand you the top few.", count: "Top 5", duration: "Weighted" },
    ],
  },
};

const RIGOR_OPTIONS: { id: RigorId; label: string; blurb: string; steps: string }[] = [
  { id: "easy", label: "Easy", blurb: "Quick screen for high-volume, lower-stakes roles.", steps: "3 steps" },
  { id: "standard", label: "Standard", blurb: "Balanced screen for most roles.", steps: "4 steps" },
  { id: "high", label: "High", blurb: "Thorough screen for trust & responsibility.", steps: "5 steps" },
];

/* ────────────────────────────────────────────────────────────────────────────
 * Hooks + small atoms
 * ──────────────────────────────────────────────────────────────────────────── */

function useWide() {
  const get = () => typeof window !== "undefined" && window.innerWidth >= 640;
  const [wide, setWide] = useState(get);
  useEffect(() => {
    const on = () => setWide(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return wide;
}

const FOCUS_CSS = `
  .ava-prev input:focus, .ava-prev textarea:focus {
    border-color: hsl(var(--primary) / 0.6) !important;
    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.16), 0 0 24px hsl(var(--primary) / 0.10) !important;
  }
`;

function StepRail({ step }: { step: number }) {
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

function BriefField({
  icon: Icon,
  label,
  value,
  onChange,
  textarea,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
}) {
  const base = "w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all duration-300";
  const style = {
    background: "hsl(var(--ck-surface-2))",
    color: "hsl(var(--foreground))",
    border: "1px solid hsl(var(--border))",
    boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.02)",
  } as const;
  return (
    <label className="group block">
      <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--muted-foreground))" }}>
        <Icon className="h-3.5 w-3.5" style={{ color: "hsl(var(--ck-brass))" }} />
        {label}
      </span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={`${base} resize-none`} style={style} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={base} style={style} />
      )}
    </label>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Step 0 — Intro / brief
 * ──────────────────────────────────────────────────────────────────────────── */

function IntroStep({ brief, setBrief }: { brief: Record<string, string>; setBrief: (k: string, v: string) => void }) {
  const reduce = useReducedMotion();
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
      <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
        <motion.div initial={reduce ? false : { scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}>
          <AvaOrb size={240} reflection={false} />
        </motion.div>
        <motion.span
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ borderColor: "hsl(var(--primary) / 0.3)", color: "hsl(var(--ck-brass))" }}
        >
          <Sparkles className="h-3 w-3" /> Ava · Hiring assistant
        </motion.span>
        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.6 }}
          className="mt-4 text-3xl leading-[1.1] sm:text-4xl"
          style={{ fontFamily: DISPLAY, fontWeight: 500, color: "hsl(var(--foreground))" }}
        >
          Tell Ava what you're<br className="hidden sm:block" /> hiring for.
        </motion.h1>
        <motion.p
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="mt-3 max-w-sm text-sm leading-relaxed"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          A few details is all I need. I'll ask a couple of follow-ups, then build your whole hiring flow — and screen everyone for you.
        </motion.p>
      </div>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl p-5 sm:p-6"
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <BriefField icon={Briefcase} label="Role title" value={brief.role} onChange={(v) => setBrief("role", v)} />
          </div>
          <BriefField icon={MapPin} label="Location" value={brief.location} onChange={(v) => setBrief("location", v)} />
          <BriefField icon={Briefcase} label="Type" value={brief.type} onChange={(v) => setBrief("type", v)} />
          <BriefField icon={DollarSign} label="Pay" value={brief.pay} onChange={(v) => setBrief("pay", v)} />
          <BriefField icon={CalendarClock} label="Start" value={brief.start} onChange={(v) => setBrief("start", v)} />
          <div className="sm:col-span-2">
            <BriefField icon={FileText} label="What they'll do" value={brief.work} onChange={(v) => setBrief("work", v)} textarea />
          </div>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
          <Sparkles className="h-3 w-3" style={{ color: "hsl(var(--ck-brass))" }} />
          Tip: try a different role (Cleaner · Developer · Office Admin) to see Ava adapt the questions &amp; plan.
        </p>
      </motion.div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Step 1 — Adaptive follow-ups (bigger orb + premium selection)
 * ──────────────────────────────────────────────────────────────────────────── */

function FollowUpStep({
  index,
  followUps,
  answers,
  pick,
  label,
}: {
  index: number;
  followUps: FollowUp[];
  answers: Record<string, number>;
  pick: (id: string, chip: number) => void;
  label: string;
}) {
  const reduce = useReducedMotion();
  const wide = useWide();
  const fu = followUps[index];
  const picked = answers[fu.id] ?? fu.def;

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
      <motion.div initial={reduce ? false : { scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
        <AvaOrb size={wide ? 248 : 208} reflection={false} amp={0.26} flow={0.72} />
      </motion.div>

      <div className="mt-1 flex flex-col items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "hsl(var(--ck-brass))" }}>
          Ava · Question {index + 1} of {followUps.length}
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
          style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--ck-mint))", border: "1px solid hsl(var(--primary) / 0.22)" }}
        >
          <Sparkles className="h-2.5 w-2.5" /> Tailored to a {label} role
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={fu.id}
          initial={reduce ? false : { opacity: 0, y: 24, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -24, filter: "blur(6px)" }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full"
        >
          <h2 className="mt-4 text-2xl sm:text-3xl" style={{ fontFamily: DISPLAY, fontWeight: 500, color: "hsl(var(--foreground))" }}>
            {fu.question}
          </h2>

          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            {fu.chips.map((chip, ci) => {
              const on = picked === ci;
              return (
                <motion.button
                  key={chip}
                  type="button"
                  onClick={() => pick(fu.id, ci)}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + ci * 0.06, duration: 0.4 }}
                  whileTap={reduce ? undefined : { scale: 0.96 }}
                  className="inline-flex items-center rounded-full px-4 py-2.5 text-sm transition-all duration-300"
                  style={
                    on
                      ? {
                          background:
                            "linear-gradient(180deg, hsl(38 56% 58% / 0.22) 0%, hsl(38 56% 50% / 0.10) 100%), hsl(var(--ck-surface-2))",
                          color: "hsl(var(--ck-brass-bright))",
                          border: "1px solid hsl(var(--primary) / 0.7)",
                          fontWeight: 600,
                          boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.08), 0 8px 20px -10px hsl(38 60% 28% / 0.7)",
                        }
                      : {
                          background: "hsl(var(--ck-surface-2))",
                          color: "hsl(var(--foreground))",
                          border: "1px solid hsl(var(--border))",
                          fontWeight: 500,
                        }
                  }
                >
                  {on && (
                    <span
                      className="mr-2 grid h-4 w-4 place-items-center rounded-full"
                      style={{ background: "linear-gradient(180deg, hsl(38 64% 71%), hsl(38 56% 56%))", color: "hsl(var(--primary-foreground))", boxShadow: "0 1px 3px hsl(38 60% 20% / 0.6)" }}
                    >
                      <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                    </span>
                  )}
                  {chip}
                </motion.button>
              );
            })}
          </div>

          <button type="button" className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-100" style={{ color: "hsl(var(--muted-foreground))", opacity: 0.75 }}>
            <Pencil className="h-3 w-3" /> Add detail
          </button>
        </motion.div>
      </AnimatePresence>

      <div className="mt-8 flex gap-1.5">
        {followUps.map((_, i) => (
          <span key={i} className="h-1 rounded-full transition-all duration-500" style={{ width: i === index ? 22 : 7, background: i <= index ? "hsl(var(--primary))" : "hsl(var(--border))" }} />
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Step 2 — Rigor (adaptive recommendation)
 * ──────────────────────────────────────────────────────────────────────────── */

function RigorStep({
  chosen,
  setChosen,
  recommended,
  rationale,
}: {
  chosen: RigorId;
  setChosen: (id: RigorId) => void;
  recommended: RigorId;
  rationale: string;
}) {
  const reduce = useReducedMotion();
  const recLabel = RIGOR_OPTIONS.find((o) => o.id === recommended)?.label ?? "Standard";
  return (
    <div className="mx-auto max-w-3xl text-center">
      <AvaOrb size={84} reflection={false} amp={0.24} flow={0.7} />
      <h2 className="mt-4 text-2xl sm:text-3xl" style={{ fontFamily: DISPLAY, fontWeight: 500, color: "hsl(var(--foreground))" }}>
        How thoroughly should I screen?
      </h2>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="mx-auto mt-5 flex max-w-xl items-start gap-3 rounded-2xl p-4 text-left"
        style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.3)" }}
      >
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full" style={{ background: "hsl(var(--primary) / 0.2)", color: "hsl(var(--ck-brass-bright))" }}>
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <p className="text-sm leading-relaxed" style={{ color: "hsl(var(--foreground))" }}>
          I'd screen this at <strong style={{ color: "hsl(var(--ck-brass-bright))" }}>{recLabel}</strong>. {rationale}
        </p>
      </motion.div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {RIGOR_OPTIONS.map((opt, i) => {
          const active = chosen === opt.id;
          const isRec = opt.id === recommended;
          return (
            <motion.button
              key={opt.id}
              type="button"
              onClick={() => setChosen(opt.id)}
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + i * 0.08, duration: 0.5 }}
              whileHover={reduce ? undefined : { y: -3 }}
              className="relative overflow-hidden rounded-2xl p-5 text-left transition-all duration-300"
              style={{
                background: active ? "hsl(var(--primary) / 0.1)" : "hsl(var(--card))",
                border: active ? "1px solid hsl(var(--primary) / 0.6)" : "1px solid hsl(var(--border))",
                boxShadow: active ? "0 0 30px hsl(var(--primary) / 0.12)" : "var(--shadow-md)",
              }}
            >
              {isRec && (
                <span className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: "hsl(var(--ck-jade))", color: "hsl(var(--primary-foreground))" }}>
                  Ava picks
                </span>
              )}
              <span className="text-lg font-bold" style={{ fontFamily: DISPLAY, color: active ? "hsl(var(--ck-brass-bright))" : "hsl(var(--foreground))" }}>
                {opt.label}
              </span>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                {opt.blurb}
              </p>
              <span className="mt-3 inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "hsl(var(--ck-surface-2))", color: "hsl(var(--foreground))" }}>
                {opt.steps}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Step 3 — Ava builds (hero)
 * ──────────────────────────────────────────────────────────────────────────── */

function BuildStep({ onDone, role, rigorLabel, reasoning }: { onDone: () => void; role: string; rigorLabel: string; reasoning: string[] }) {
  const reduce = useReducedMotion();
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (reduce) {
      setRevealed(reasoning.length);
      const t = setTimeout(onDone, 900);
      return () => clearTimeout(t);
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    let i = 0;
    const tick = () => {
      i += 1;
      setRevealed(i);
      if (i >= reasoning.length) {
        timers.push(setTimeout(onDone, 1100));
        return;
      }
      timers.push(setTimeout(tick, 1000));
    };
    timers.push(setTimeout(tick, 650));
    return () => timers.forEach(clearTimeout);
  }, [reduce, onDone, reasoning.length]);

  return (
    <div className="flex flex-col items-center text-center">
      <motion.div initial={reduce ? false : { scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1, type: "spring", bounce: 0.25 }}>
        <AvaOrb size={248} amp={0.34} flow={0.95} spin={0.12} reflection={false} />
      </motion.div>

      <h2 className="mt-2 text-2xl sm:text-3xl" style={{ fontFamily: DISPLAY, fontWeight: 500, color: "hsl(var(--foreground))" }}>
        Building your hiring flow…
      </h2>
      <p className="mt-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
        {role} · <span style={{ color: "hsl(var(--ck-brass))" }}>{rigorLabel} rigor</span>
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
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors duration-500"
              style={{ background: newest ? "hsl(var(--primary) / 0.1)" : "transparent", border: newest ? "1px solid hsl(var(--primary) / 0.28)" : "1px solid transparent" }}
            >
              {i < revealed - 1 ? (
                <Check className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--ck-jade))" }} />
              ) : newest ? (
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: "hsl(var(--primary))", boxShadow: "0 0 0 4px hsl(var(--primary) / 0.18)" }} />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ border: "1.5px solid hsl(var(--border))" }} />
              )}
              <span className="text-sm" style={{ color: newest ? "hsl(var(--foreground))" : shown ? "hsl(var(--foreground) / 0.7)" : "hsl(var(--muted-foreground))", fontWeight: newest ? 600 : 400 }}>
                {line}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Step 4 — Review plan (premium, editable)
 * ──────────────────────────────────────────────────────────────────────────── */

function PhaseRow({
  phase,
  index,
  total,
  editing,
  onEdit,
  onRemove,
  onMove,
  onField,
}: {
  phase: PhaseCard;
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
      transition={{ delay: reduce ? 0 : 0.08 + index * 0.09, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex gap-3 sm:gap-4"
    >
      {/* numbered spine */}
      <div className="flex flex-col items-center">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold"
          style={{ background: "hsl(var(--card))", border: `1.5px solid ${a.line}`, color: a.fg, fontFamily: DISPLAY }}
        >
          {index + 1}
        </span>
        {index < total - 1 && <span className="mt-1 w-px flex-1" style={{ background: "hsl(var(--border))" }} />}
      </div>

      {/* card */}
      <div
        className="group mb-3 flex-1 rounded-2xl p-4 transition-all duration-300 sm:p-5"
        style={{
          background: editing ? "hsl(var(--primary) / 0.06)" : "var(--gradient-card)",
          border: editing ? "1px solid hsl(var(--primary) / 0.45)" : "1px solid hsl(var(--border))",
          boxShadow: editing ? "0 0 30px hsl(var(--primary) / 0.1)" : "var(--shadow-md)",
        }}
      >
        <div className="flex items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: a.tile, color: a.fg, border: `1px solid ${a.edge}` }}>
            <Icon className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: a.fg }}>
                {phase.kind}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "hsl(var(--ck-surface-2))", color: "hsl(var(--muted-foreground))" }}>
                {phase.count}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "hsl(var(--ck-surface-2))", color: "hsl(var(--muted-foreground))" }}>
                <Clock className="h-2.5 w-2.5" /> {phase.duration}
              </span>

              {/* controls — always visible so it's obvious it's editable */}
              <div className="ml-auto flex items-center gap-1">
                <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)} className={ctrlBtn} style={ctrlStyle}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" aria-label="Move down" disabled={index === total - 1} onClick={() => onMove(1)} className={ctrlBtn} style={ctrlStyle}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={editing ? "Done editing" : "Edit"}
                  onClick={onEdit}
                  className={ctrlBtn}
                  style={editing ? { background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", border: "1px solid hsl(var(--primary))" } : ctrlStyle}
                >
                  {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                </button>
                <button type="button" aria-label="Remove" onClick={onRemove} className={ctrlBtn} style={ctrlStyle}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {editing ? (
              <div className="mt-2 space-y-2">
                <input
                  value={phase.title}
                  onChange={(e) => onField("title", e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-base font-semibold outline-none"
                  style={{ background: "hsl(var(--ck-surface-2))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))", fontFamily: DISPLAY }}
                />
                {phase.candidate && (
                  <textarea
                    value={phase.candidate}
                    onChange={(e) => onField("candidate", e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: "hsl(var(--ck-surface-2))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}
                  />
                )}
              </div>
            ) : (
              <>
                <h3 className="mt-1 text-base font-semibold" style={{ color: "hsl(var(--foreground))", fontFamily: DISPLAY }}>
                  {phase.title}
                </h3>
                {phase.candidate && (
                  <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "hsl(var(--foreground) / 0.82)" }}>
                    {phase.candidate}
                  </p>
                )}
              </>
            )}

            <div className="mt-2.5 flex items-start gap-2 rounded-lg px-3 py-2" style={{ background: "hsl(var(--ck-surface-2))" }}>
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0" style={{ color: "hsl(var(--ck-brass))" }} />
              <span className="text-xs italic leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                {phase.rationale}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ReviewStep({
  phases,
  editingId,
  setEditingId,
  onMove,
  onRemove,
  onField,
  onAdd,
}: {
  phases: PhaseCard[];
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
  onField: (id: string, field: "title" | "candidate", value: string) => void;
  onAdd: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-center">
        <motion.span
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]"
          style={{ borderColor: "hsl(var(--ck-jade) / 0.4)", color: "hsl(var(--ck-mint))" }}
        >
          <Check className="h-3 w-3" /> Built in seconds
        </motion.span>
        <h2 className="mt-3 text-2xl sm:text-3xl" style={{ fontFamily: DISPLAY, fontWeight: 500, color: "hsl(var(--foreground))" }}>
          Here's your hiring plan.
        </h2>
        <p className="mt-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
          Each step is editable — reorder, tweak, or remove anything, then publish.
        </p>
      </div>

      <div className="mt-7">
        {phases.map((p, i) => (
          <PhaseRow
            key={p.id}
            phase={p}
            index={i}
            total={phases.length}
            editing={editingId === p.id}
            onEdit={() => setEditingId(editingId === p.id ? null : p.id)}
            onRemove={() => onRemove(p.id)}
            onMove={(dir) => onMove(p.id, dir)}
            onField={(field, value) => onField(p.id, field, value)}
          />
        ))}

        {/* add a phase — spine-aligned dashed affordance */}
        <div className="flex gap-3 sm:gap-4">
          <div className="flex w-8 justify-center">
            <span className="grid h-8 w-8 place-items-center rounded-full" style={{ border: "1.5px dashed hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
              <Plus className="h-3.5 w-3.5" />
            </span>
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-medium transition-colors hover:opacity-100"
            style={{ border: "1.5px dashed hsl(var(--border))", color: "hsl(var(--muted-foreground))", background: "transparent" }}
          >
            <GripVertical className="h-3.5 w-3.5" /> Add a screening step
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Step 5 — Publish (compact code, share-forward)
 * ──────────────────────────────────────────────────────────────────────────── */

function PublishStep({ count }: { count: number }) {
  const reduce = useReducedMotion();
  const code = "7F3K9Q";
  const link = "hireflow.app/a/7F3K9Q";
  return (
    <div className="mx-auto flex max-w-md flex-col items-center text-center">
      <motion.div initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.9, type: "spring", bounce: 0.4 }}>
        <AvaOrb size={168} reflection={false} amp={0.26} flow={0.7} />
      </motion.div>

      <motion.span
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]"
        style={{ background: "hsl(var(--ck-jade) / 0.16)", color: "hsl(var(--ck-mint))" }}
      >
        <Check className="h-3 w-3" /> Your role is live
      </motion.span>

      <motion.h2 initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-4 text-3xl sm:text-4xl" style={{ fontFamily: DISPLAY, fontWeight: 500, color: "hsl(var(--foreground))" }}>
        Share your role.
      </motion.h2>
      <motion.p initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-2 text-sm" style={{ color: "hsl(var(--muted-foreground))" }}>
        Post it anywhere. Everyone who applies gets screened automatically — your ranked shortlist builds itself.
      </motion.p>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="mt-6 w-full rounded-2xl p-5"
        style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "var(--shadow-lg)" }}
      >
        {/* prominent share link */}
        <span className="flex items-center gap-1.5 text-left text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "hsl(var(--muted-foreground))" }}>
          <Share2 className="h-3 w-3" style={{ color: "hsl(var(--ck-brass))" }} /> Apply link
        </span>
        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl px-3.5 py-3" style={{ background: "hsl(var(--ck-surface-2))", border: "1px solid hsl(var(--border))" }}>
          <span className="truncate text-base font-medium" style={{ color: "hsl(var(--foreground))" }}>
            {link}
          </span>
          <button type="button" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", boxShadow: "0 0 18px hsl(var(--primary) / 0.2)" }}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
        </div>

        {/* QR + compact code chip */}
        <div className="mt-3 flex items-center gap-3">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl" style={{ background: "hsl(var(--ck-surface-2))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}>
            <QrCode className="h-9 w-9" />
          </span>
          <div className="flex flex-1 flex-col items-start gap-1.5 text-left">
            <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>
              Scan to apply, or share the code:
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold tracking-wider" style={{ background: "hsl(var(--primary) / 0.12)", color: "hsl(var(--ck-brass-bright))", border: "1px solid hsl(var(--primary) / 0.3)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
              {code}
              <Copy className="h-3 w-3 opacity-70" />
            </span>
          </div>
        </div>

        {/* share targets */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { icon: Share2, label: "Share" },
            { icon: FileText, label: "Job post" },
            { icon: Trophy, label: "Shortlist" },
          ].map((b) => {
            const Icon = b.icon;
            return (
              <button key={b.label} type="button" className="flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs font-medium transition-colors" style={{ background: "hsl(var(--ck-surface-2))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }}>
                <Icon className="h-4 w-4" style={{ color: "hsl(var(--ck-brass))" }} />
                {b.label}
              </button>
            );
          })}
        </div>
      </motion.div>

      <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="mt-5 text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>
        <span style={{ fontFamily: DISPLAY }}>
          <CountUp value={count} /> screening steps ready · <CountUp value={0} /> applicants so far
        </span>
      </motion.div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Page shell
 * ──────────────────────────────────────────────────────────────────────────── */

export default function AvaFlowPreview() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [fuIndex, setFuIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [rigor, setRigor] = useState<RigorId>("high");
  const [rigorTouched, setRigorTouched] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [brief, setBriefState] = useState<Record<string, string>>({
    role: "Café Manager",
    location: "Maria's Café · Austin, TX",
    type: "Full-time · On-site",
    pay: "$24–28 / hr",
    start: "Within a few weeks",
    work: "Run daily operations, lead a small team, own the till and open/close.",
  });

  const family = useMemo(() => detectFamily(brief), [brief]);
  const playbook = PLAYBOOKS[family];
  const followUps = useMemo(() => playbook.followUps(answers), [playbook, answers]);

  const [phases, setPhases] = useState<PhaseCard[]>(() => playbook.plan(brief.role));

  const setBrief = (k: string, v: string) => setBriefState((b) => ({ ...b, [k]: v }));
  const pickChip = (id: string, chip: number) => setAnswers((a) => ({ ...a, [id]: chip }));

  // Regenerate the plan + recommended rigor when the role FAMILY changes.
  useEffect(() => {
    setPhases(playbook.plan(brief.role));
    setEditingId(null);
    if (!rigorTouched) setRigor(playbook.rigor.recommended);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family]);

  const advanceBuildRef = useRef(false);
  const canBack = step > 0;
  const isLast = step === STEPS.length - 1;
  const rigorLabel = RIGOR_OPTIONS.find((o) => o.id === rigor)?.label ?? "Standard";

  function handleNext() {
    if (step === 1 && fuIndex < followUps.length - 1) {
      setFuIndex((i) => i + 1);
      return;
    }
    if (step < STEPS.length - 1) setStep((s) => s + 1);
  }

  function handleBack() {
    if (step === 1 && fuIndex > 0) {
      setFuIndex((i) => i - 1);
      return;
    }
    if (step > 0) {
      if (step === 4) {
        setStep(2);
        setFuIndex(followUps.length - 1);
      } else {
        setStep((s) => s - 1);
      }
    }
  }

  useEffect(() => {
    if (step === 1) setFuIndex(0);
  }, [step]);

  const nextLabel = useMemo(() => {
    if (step === 0) return "Continue";
    if (step === 1) return fuIndex < followUps.length - 1 ? "Next question" : "Looks right";
    if (step === 2) return "Build my flow";
    if (step === 4) return "Publish role";
    return "Continue";
  }, [step, fuIndex, followUps.length]);

  // Review editing handlers
  const movePhase = (id: string, dir: -1 | 1) =>
    setPhases((arr) => {
      const i = arr.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return arr;
      const next = [...arr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const removePhase = (id: string) => {
    setPhases((arr) => arr.filter((p) => p.id !== id));
    if (editingId === id) setEditingId(null);
  };
  const updateField = (id: string, field: "title" | "candidate", value: string) =>
    setPhases((arr) => arr.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  const addPhase = () =>
    setPhases((arr) => [
      ...arr,
      { id: `custom-${Date.now()}`, kind: "Custom step", icon: Sparkles, accent: "brass", title: "New screening step", candidate: "Describe what candidates will do here.", rationale: "Add your own step — I'll fold it into the score.", count: "Custom", duration: "—" },
    ]);

  return (
    <div
      className="ava-prev scroll-perf relative flex min-h-[100dvh] flex-col overflow-x-hidden"
      style={{
        background: "radial-gradient(ellipse 90% 60% at 50% -10%, hsl(152 40% 14% / 0.5) 0%, transparent 60%), hsl(var(--background))",
        color: "hsl(var(--foreground))",
      }}
    >
      <style>{FOCUS_CSS}</style>

      {/* Brand hero ambient — same jade aurora + drifting constellation as the
          marketing landing hero. Replaces the old flat checkered grid. Sits
          behind all 6 flow states (content is z-10+). */}
      <HeroBackground />

      <header className="relative z-10 flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-100" style={{ color: "hsl(var(--muted-foreground))" }}>
          <ArrowLeft className="h-3.5 w-3.5" /> Exit
        </Link>
        <div className="hidden flex-1 sm:block">
          <StepRail step={step} />
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: "hsl(var(--ck-surface-2))", color: "hsl(var(--muted-foreground))", border: "1px solid hsl(var(--border))" }}
          title="This is a visual prototype — buttons are illustrative and nothing is saved."
        >
          <ShieldCheck className="h-3 w-3" style={{ color: "hsl(var(--ck-brass))" }} /> Preview — not wired
        </span>
      </header>

      <div className="relative z-10 px-4 pb-2 sm:hidden">
        <StepRail step={step} />
      </div>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
        <div className="w-full max-w-5xl">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: reduce ? 0 : 0.28, ease: [0.4, 0, 0.2, 1] }}>
              {step === 0 && <IntroStep brief={brief} setBrief={setBrief} />}
              {step === 1 && <FollowUpStep index={fuIndex} followUps={followUps} answers={answers} pick={pickChip} label={playbook.label} />}
              {step === 2 && <RigorStep chosen={rigor} setChosen={(id) => { setRigor(id); setRigorTouched(true); }} recommended={playbook.rigor.recommended} rationale={playbook.rigor.rationale} />}
              {step === 3 && (
                <BuildStep
                  role={brief.role}
                  rigorLabel={rigorLabel}
                  reasoning={playbook.reasoning}
                  onDone={() => {
                    if (advanceBuildRef.current) return;
                    advanceBuildRef.current = true;
                    setStep(4);
                  }}
                />
              )}
              {step === 4 && (
                <ReviewStep
                  phases={phases}
                  editingId={editingId}
                  setEditingId={setEditingId}
                  onMove={movePhase}
                  onRemove={removePhase}
                  onField={updateField}
                  onAdd={addPhase}
                />
              )}
              {step === 5 && <PublishStep count={phases.length} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {step !== 3 && (
        <footer className="relative z-10 flex items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
          <button
            type="button"
            onClick={handleBack}
            disabled={!canBack}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-30"
            style={{ background: "hsl(var(--secondary))", color: "hsl(var(--secondary-foreground))", border: "1px solid hsl(var(--border))" }}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          {isLast ? (
            <Link to="/" className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all" style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", boxShadow: "0 0 28px hsl(var(--primary) / 0.22)" }}>
              Done <Check className="h-4 w-4" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (step === 2) {
                  advanceBuildRef.current = false;
                  setStep(3);
                } else {
                  handleNext();
                }
              }}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all"
              style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", boxShadow: "0 0 28px hsl(var(--primary) / 0.22)" }}
            >
              {nextLabel}
              {step === 2 ? <Sparkles className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </button>
          )}
        </footer>
      )}
    </div>
  );
}
