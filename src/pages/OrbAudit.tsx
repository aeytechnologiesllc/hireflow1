/**
 * OrbAudit — dev-only QA page. Renders EVERY AvaOrb instance used across the
 * real app at its exact size + props, grouped by role (hero / feature / accent),
 * on the Deep Jade background. Lets us visually verify each orb is premium and
 * properly proportioned without driving the real flows. Route: /orb-audit
 */
import { AvaOrb } from "@/components/ava/AvaOrb";

type Item = {
  label: string;
  size: number;
  reflection?: boolean;
  glow?: boolean;
  amp?: number;
  flow?: number;
  spin?: number;
};

// NOTE: browsers cap live WebGL contexts (~16) and each orb owns one, so this
// page only renders the FLOW-GATED orbs that are hard to reach via real pages
// (the create-job flow + onboarding). Cockpit/auth orbs are verified on their
// own routes (/dashboard, /analytics, /interviews, /messages, /more,
// /applicants, /auth), which each hold only 1–2 contexts.

// The create-job flow, in step order — must read consistent (no big→tiny jumps).
const HEROES: Item[] = [
  { label: "Brief · 240", size: 240, reflection: false },
  { label: "Follow-up · 248", size: 248, reflection: false, amp: 0.26, flow: 0.72 },
  { label: "Rigor · 224", size: 224, reflection: false, amp: 0.24, flow: 0.7 },
  { label: "Ava builds · 248", size: 248, amp: 0.34, flow: 0.95, spin: 0.12, reflection: false },
  { label: "Published · 168", size: 168, reflection: false, amp: 0.26, flow: 0.7 },
];

const FEATURE: Item[] = [
  { label: "Onboarding Welcome · 172", size: 172, reflection: false },
  { label: "Loader / sign-in (ORB_SIZE.md) · 240", size: 240, reflection: false, amp: 0.24, flow: 0.6 },
];

// Small accents that sit next to text (candidate "Ava's read", cards, lists).
const ACCENTS: Item[] = [
  { label: "Messages panel · 100", size: 100, reflection: false, amp: 0.22, flow: 0.5 },
  { label: "More card · 84", size: 84, reflection: false, amp: 0.22, flow: 0.5 },
  { label: "Ava's read · 72", size: 72, reflection: false, glow: false, amp: 0.22, flow: 0.5 },
  { label: "AvaCard compact · 56", size: 56, reflection: false, glow: false, amp: 0.22, flow: 0.5 },
  { label: "ORB_SIZE.sm · 40", size: 40, reflection: false, glow: false },
];

function Cell({ it }: { it: Item }) {
  return (
    <div
      className="flex flex-col items-center justify-end gap-3 rounded-2xl p-5"
      style={{ background: "hsl(152 30% 7% / 0.5)", border: "1px solid hsl(152 20% 16%)", minHeight: it.size + 110 }}
    >
      <div className="flex flex-1 items-center justify-center">
        <AvaOrb
          size={it.size}
          reflection={it.reflection}
          glow={it.glow}
          amp={it.amp}
          flow={it.flow}
          spin={it.spin}
        />
      </div>
      <div className="text-[12px] font-medium tracking-wide" style={{ color: "hsl(150 14% 64%)" }}>
        {it.label}
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: Item[] }) {
  return (
    <section className="mb-12">
      <h2
        className="mb-5 text-[11px] font-bold uppercase tracking-[0.22em]"
        style={{ color: "hsl(38 62% 66%)" }}
      >
        {title}
      </h2>
      <div className="flex flex-wrap items-end gap-5">
        {items.map((it) => (
          <Cell key={it.label} it={it} />
        ))}
      </div>
    </section>
  );
}

export default function OrbAudit() {
  return (
    <div
      className="min-h-[100dvh] px-8 py-10"
      style={{
        background:
          "radial-gradient(ellipse 90% 60% at 50% -10%, hsl(152 40% 14% / 0.5) 0%, transparent 60%), hsl(var(--background))",
        color: "hsl(var(--foreground))",
      }}
    >
      <h1 className="mb-2 text-3xl" style={{ fontFamily: "'Fraunces', serif", fontWeight: 500 }}>
        Ava Orb audit
      </h1>
      <p className="mb-10 text-sm" style={{ color: "hsl(150 12% 60%)" }}>
        Every orb used in the app, at its real size + props. Checking each reads premium and proportioned.
      </p>
      <Section title="Create-job flow (must stay consistent)" items={HEROES} />
      <Section title="Onboarding + loader" items={FEATURE} />
      <Section title="Small accents (next to text)" items={ACCENTS} />
    </div>
  );
}
