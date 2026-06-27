import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { AvaOrb } from "@/components/ava/AvaOrb";
import { HeroBackground } from "@/components/ava/HeroBackground";
import { useSubscription } from "@/hooks/useSubscription";

const DISPLAY = "'Fraunces', serif";

// The "why" — three plain-language steps so a brand-new employer immediately
// understands what Ava does for them before they start.
const WHY = [
  {
    n: "01",
    t: "Brief Ava once",
    d: "Describe the role in a sentence. Ava designs the whole screening flow — questions, real-world scenarios, and a structured interview.",
  },
  {
    n: "02",
    t: "She screens every applicant",
    d: "Everyone is interviewed and scored on the same fair rubric — automatically, around the clock.",
  },
  {
    n: "03",
    t: "You just decide",
    d: "Ava hands you a ranked shortlist with the evidence behind every score. No inbox to dig through.",
  },
];

/**
 * EmployerWelcome — the first-run onboarding for a new employer. Premium, single
 * screen: the Ava orb, a clear value story, and one CTA into create-job. Replaces
 * the old generic multi-step OnboardingWizard.
 */
export default function EmployerWelcome() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { completeOnboarding } = useSubscription();
  const [busy, setBusy] = useState<null | "create" | "skip">(null);

  const go = async (where: "create" | "skip") => {
    if (busy) return;
    setBusy(where);
    try {
      await completeOnboarding.mutateAsync();
    } catch {
      /* non-blocking — proceed even if the flag write fails */
    }
    navigate(where === "create" ? "/jobs/create" : "/dashboard", { replace: true });
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-y-auto px-6 py-8">
      <HeroBackground />
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="relative z-10 my-auto flex w-full max-w-xl flex-col items-center text-center"
      >
        <AvaOrb size={172} reflection={false} />

        <span
          className="mt-6 text-[11px] font-bold uppercase tracking-[0.22em]"
          style={{ color: "hsl(var(--ck-brass))" }}
        >
          Welcome to HireFlow
        </span>
        <h1
          className="mt-3 text-4xl leading-[1.05] sm:text-5xl"
          style={{ fontFamily: DISPLAY, fontWeight: 500, color: "hsl(var(--foreground))" }}
        >
          Hiring, <span style={{ fontStyle: "italic", color: "hsl(var(--primary))" }}>handled</span>.
        </h1>
        <p
          className="mt-4 max-w-md text-[15px] leading-relaxed"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          Meet Ava — she runs your hiring end to end, so you only spend time on the people worth meeting.
        </p>

        <div className="mt-6 w-full space-y-3 text-left">
          {WHY.map((w) => (
            <div
              key={w.n}
              className="flex items-start gap-4 rounded-2xl px-4 py-3.5"
              style={{ background: "hsl(var(--card) / 0.55)", border: "1px solid hsl(var(--border))" }}
            >
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                style={{
                  background: "hsl(var(--primary) / 0.12)",
                  color: "hsl(var(--ck-brass))",
                  border: "1px solid hsl(var(--primary) / 0.25)",
                }}
              >
                {w.n}
              </span>
              <div>
                <div className="text-[15px] font-semibold" style={{ color: "hsl(var(--foreground))" }}>
                  {w.t}
                </div>
                <div className="mt-0.5 text-[13.5px] leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
                  {w.d}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex w-full flex-col items-center gap-3.5">
          <button
            onClick={() => go("create")}
            disabled={!!busy}
            className="ck-btn ck-btn-brass w-full max-w-xs justify-center !py-3.5 !text-[15px] disabled:opacity-60"
          >
            {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create your first role
          </button>
          <button
            onClick={() => go("skip")}
            disabled={!!busy}
            className="text-[13px] font-medium transition hover:opacity-80 disabled:opacity-60"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            {busy === "skip" ? "One sec…" : "Skip — take me to my dashboard"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
