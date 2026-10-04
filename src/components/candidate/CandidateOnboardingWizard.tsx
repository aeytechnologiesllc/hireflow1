import { useState } from "react";
import { motion } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import confetti from "canvas-confetti";
import { GlyphJourney, GlyphLetter, GlyphClock, GlyphCheckSeal, type GlyphProps } from "@/components/candidate/glyphs";

interface CandidateOnboardingWizardProps {
  onComplete: () => void;
}

/** What this place does for them — three lines, each led by a brand glyph. */
const WHAT_YOU_GET: Array<{
  Glyph: (props: GlyphProps) => JSX.Element;
  title: string;
  body: string;
}> = [
  {
    Glyph: GlyphLetter,
    title: "Everything in one place",
    body: "Every application you send stays right here — no more digging through email for updates.",
  },
  {
    Glyph: GlyphClock,
    title: "See exactly where you stand",
    body: "Each stage updates the moment it changes, so you're never left guessing.",
  },
  {
    Glyph: GlyphCheckSeal,
    title: "Sign when the time comes",
    body: "Offers and paperwork are handled securely, right from your phone.",
  },
];

/**
 * The gate every signed-in candidate meets once, before anything else in the
 * app. It collects nothing, so it is one letterhead moment rather than a
 * tour: a welcome in their own voice, three lines on what this place does
 * for them, and a single way in.
 */
export default function CandidateOnboardingWizard({ onComplete }: CandidateOnboardingWizardProps) {
  const [completing, setCompleting] = useState(false);
  const isMobile = useIsMobile();

  const handleComplete = () => {
    if (completing) return;
    setCompleting(true);
    const colors = ["#0F6B4F", "#3FCE97", "#C9A45E", "#DCEDE3"];
    confetti({ particleCount: 70, spread: 65, origin: { y: 0.55, x: 0.3 }, colors });
    setTimeout(() => confetti({ particleCount: 70, spread: 65, origin: { y: 0.55, x: 0.7 }, colors }), 140);
    setTimeout(() => confetti({ particleCount: 90, spread: 100, origin: { y: 0.45 }, colors }), 280);
    setTimeout(() => { onComplete(); }, 1200);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col overflow-y-auto ${isMobile ? "" : "items-center justify-center"}`}
      style={{ background: "var(--ground)" }}
    >
      {/* quiet ambient glow, on-brand */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
        <div
          className="absolute -right-24 -top-24 h-[320px] w-[320px] rounded-full blur-[110px]"
          style={{ background: "var(--jade-soft)", opacity: 0.4 }}
        />
        <div
          className="absolute -left-20 bottom-0 h-[260px] w-[260px] rounded-full blur-[100px]"
          style={{ background: "var(--amber-bg)", opacity: 0.35 }}
        />
      </div>

      <div
        className={`relative z-10 mx-auto flex w-full max-w-md flex-col px-4 ${isMobile ? "flex-1" : "py-10"}`}
        style={
          isMobile
            ? { paddingTop: "max(1.25rem, var(--safe-top))", paddingBottom: "max(1.25rem, var(--safe-bottom))" }
            : undefined
        }
      >
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.2, 0.7, 0.3, 1] }}
          className={`ck-card relative flex w-full flex-col overflow-hidden ${isMobile ? "flex-1" : ""}`}
        >
          {/* the brass rule across the head of the letterhead */}
          <span
            aria-hidden="true"
            className="absolute left-7 right-7 top-0 h-[3px] rounded-full"
            style={{ background: "var(--brass-line)" }}
          />

          <div className="flex flex-1 flex-col px-6 pb-6 pt-8 sm:px-8 sm:pb-8">
            {/* mark */}
            <div
              className="mx-auto flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full"
              style={{ background: "var(--jade-soft)" }}
            >
              <GlyphJourney size={28} style={{ color: "var(--jade-soft-fg)" }} />
            </div>

            {/* heading moment */}
            <div className="mt-5 flex-shrink-0 space-y-2 text-center">
              <h1 className="font-display text-[30px] leading-[1.15] sm:text-4xl" style={{ color: "var(--ink)" }}>
                You&rsquo;re in.
              </h1>
              <p className="mx-auto max-w-[32ch] text-[15.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                Every application you send lives here.
              </p>
            </div>

            <div className="my-6 h-px w-full flex-shrink-0" style={{ background: "var(--line)" }} />

            {/* what this place does — glyph-led, not a features grid */}
            <div className="flex flex-1 flex-col justify-center">
              {WHAT_YOU_GET.map(({ Glyph, title, body }, i) => (
                <div
                  key={title}
                  className={`ck-reveal flex items-start gap-3.5 py-4 ${i === 0 ? "" : "border-t"}`}
                  style={{ borderColor: "var(--line-soft)", ["--ck-i" as string]: i }}
                >
                  <div
                    className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ background: "var(--ground-2)" }}
                  >
                    <Glyph size={18} style={{ color: "var(--brass)" }} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
                      {title}
                    </h3>
                    <p className="mt-0.5 text-[13.5px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
                      {body}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* quiet reassurance footer + the one way in */}
            <div className="flex-shrink-0 space-y-4 pt-6">
              <p className="text-center text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                Only what you choose to submit is ever shared with an employer.
              </p>
              <Button onClick={handleComplete} disabled={completing} size="lg" className="group w-full py-6 text-base">
                <span className="flex items-center justify-center gap-2">
                  Let&rsquo;s go
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
