import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Hand, Rocket } from "lucide-react";

export type ProcessingModeOverlayState = "auto" | "manual" | null;

interface ProcessingModeStatusOverlayProps {
  mode: ProcessingModeOverlayState;
  onComplete: () => void;
}

const overlayCopy = {
  auto: {
    title: "AUTOPILOT ENGAGED",
    subtitle: "Ava is now in control",
    icon: Rocket,
    shell: "from-primary to-primary",
    glow: "from-primary/20 via-primary/10 to-transparent",
    ring: "border-primary/30",
  },
  manual: {
    title: "YOU HAVE FULL CONTROL",
    subtitle: "Every decision is yours",
    icon: Hand,
    shell: "from-warning to-warning",
    glow: "from-warning/20 via-warning/10 to-transparent",
    ring: "border-warning/30",
  },
} as const;

export function ProcessingModeStatusOverlay({ mode, onComplete }: ProcessingModeStatusOverlayProps) {
  useEffect(() => {
    if (!mode) return undefined;
    const timer = window.setTimeout(onComplete, 2200);
    return () => window.clearTimeout(timer);
  }, [mode, onComplete]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {mode && (() => {
        const copy = overlayCopy[mode];
        const Icon = copy.icon;

        return (
          <motion.div
            key={mode}
            className="fixed inset-0 z-[160] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.26, ease: "easeOut" }}
              className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-border/70 bg-card/95 px-8 py-10 text-center shadow-2xl"
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${copy.glow}`} />
              <div className="relative flex flex-col items-center gap-5">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  {[0, 1, 2].map((index) => (
                    <motion.div
                      key={index}
                      className={`absolute inset-0 rounded-full border ${copy.ring}`}
                      initial={{ scale: 0.92, opacity: 0.35 }}
                      animate={{ scale: [0.92, 1.25 + index * 0.08], opacity: [0.35, 0] }}
                      transition={{
                        duration: 1.5,
                        ease: "easeOut",
                        repeat: Infinity,
                        delay: index * 0.18,
                      }}
                    />
                  ))}
                  <motion.div
                    className={`relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${copy.shell} text-primary-foreground shadow-xl`}
                    animate={{ y: [0, -3, 0], scale: [1, 1.03, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Icon className="h-9 w-9" />
                  </motion.div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-bold tracking-[0.18em] text-foreground sm:text-3xl">
                    {copy.title}
                  </h2>
                  <p className="text-base text-muted-foreground sm:text-lg">
                    {copy.subtitle}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        );
      })()}
    </AnimatePresence>,
    document.body,
  );
}
