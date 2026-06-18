import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Rocket, CheckCircle2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface LaunchSequenceProps {
  onComplete: () => void;
}

type Phase = "init" | "glow" | "launch" | "success";

const phaseMessages: Record<Phase, { title: string; subtitle: string }> = {
  init: {
    title: "Initializing Ava",
    subtitle: "Preparing your AI recruiter...",
  },
  glow: {
    title: "All Systems Go",
    subtitle: "Ready for launch...",
  },
  launch: {
    title: "",
    subtitle: "",
  },
  success: {
    title: "Ava is Live",
    subtitle: "Your AI-powered hiring journey begins now",
  },
};

export function LaunchSequence({ onComplete }: LaunchSequenceProps) {
  const [phase, setPhase] = useState<Phase>("init");
  const [statusItems, setStatusItems] = useState<string[]>([]);
  const isMobile = useIsMobile();

  useEffect(() => {
    // Simple 3-phase sequence: init -> glow -> launch -> success
    const status1 = setTimeout(() => setStatusItems(["AI Core"]), 300);
    const status2 = setTimeout(() => setStatusItems(prev => [...prev, "Voice Engine"]), 600);
    const status3 = setTimeout(() => setStatusItems(prev => [...prev, "Analysis Module"]), 900);
    
    // Glow buildup phase (1.5s)
    const glowTimer = setTimeout(() => setPhase("glow"), 1500);
    
    // Launch phase (2.8s)
    const launchTimer = setTimeout(() => setPhase("launch"), 2800);
    
    // Success phase (3.8s)
    const successTimer = setTimeout(() => setPhase("success"), 3800);
    
    // Auto-complete (5.5s total)
    const completeTimer = setTimeout(onComplete, 5500);
    
    return () => {
      clearTimeout(status1);
      clearTimeout(status2);
      clearTimeout(status3);
      clearTimeout(glowTimer);
      clearTimeout(launchTimer);
      clearTimeout(successTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center text-center justify-center overflow-hidden bg-background">
      {/* Background grid */}
      <div className="absolute inset-0 overflow-hidden">
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(to right, var(--primary) 1px, transparent 1px),
              linear-gradient(to bottom, var(--primary) 1px, transparent 1px)
            `,
            backgroundSize: "60px 60px",
          }}
        />
        {/* Animated scan line */}
        {isMobile ? (
          <motion.div
            className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
            style={{ top: 0 }}
            initial={{ y: "-10vh" }}
            animate={{ y: "110vh" }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />
        ) : (
          <motion.div
            className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
            initial={{ top: "-10%" }}
            animate={{ top: "110%" }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />
        )}
      </div>

      {/* Floating orbs - background ambiance */}
      {isMobile ? (
        <>
          <div className="absolute top-[10%] right-[15%] w-[200px] h-[200px] rounded-full bg-primary/20 blur-[120px] opacity-[0.25]" style={{ willChange: 'transform', transform: 'translateZ(0)' }} />
          <div className="absolute bottom-[10%] left-[10%] w-[150px] h-[150px] rounded-full bg-accent/15 blur-[100px] opacity-[0.12]" style={{ willChange: 'transform', transform: 'translateZ(0)' }} />
        </>
      ) : (
        <>
          <motion.div
            className="absolute top-[10%] right-[15%] w-[400px] h-[400px] rounded-full bg-primary/20 blur-[120px]"
            animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.3, 0.2] }}
            transition={{ duration: 8, repeat: Infinity }}
          />
          <motion.div
            className="absolute bottom-[10%] left-[10%] w-[350px] h-[350px] rounded-full bg-accent/15 blur-[100px]"
            animate={{ scale: [1.2, 1, 1.2], opacity: [0.15, 0.25, 0.15] }}
            transition={{ duration: 6, repeat: Infinity }}
          />
        </>
      )}

      {/* Status indicators during init */}
      <AnimatePresence mode="wait">
        {phase === "init" && (
          <motion.div
            key="status-items"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-8 left-1/2 -translate-x-1/2 flex flex-col gap-2"
          >
            {statusItems.map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-2 text-sm text-primary"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{item}: Online</span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rocket Container */}
      <div className="relative mb-8">
        {/* Background glow orb - intensifies during glow phase */}
        <motion.div
          className="absolute -z-10 rounded-full blur-3xl"
          style={{
            width: 200,
            height: 200,
            left: -60,
            top: -60,
            background: "linear-gradient(135deg, color-mix(in oklab, var(--primary) 30%, transparent), hsl(180, 100%, 50%, 0.2))",
          }}
          animate={
            phase === "init" 
              ? { scale: [1, 1.1, 1], opacity: [0.3, 0.4, 0.3] }
              : phase === "glow"
              ? { scale: [1, 1.6, 1.8], opacity: [0.4, 0.8, 1] }
              : phase === "launch"
              ? { scale: 2, opacity: 0 }
              : { scale: 0, opacity: 0 }
          }
          transition={{ 
            duration: phase === "init" ? 2 : phase === "glow" ? 1.3 : 0.8,
            repeat: phase === "init" ? Infinity : 0,
            ease: "easeInOut"
          }}
        />

        {/* Expanding rings - visible during init and glow */}
        {(phase === "init" || phase === "glow") && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full border border-primary/30"
                style={{
                  width: 160,
                  height: 160,
                  left: -40,
                  top: -40,
                }}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{
                  scale: [1, phase === "glow" ? 2.5 : 2, phase === "glow" ? 2.5 : 2],
                  opacity: [phase === "glow" ? 0.7 : 0.5, 0.2, 0],
                }}
                transition={{
                  duration: phase === "glow" ? 1 : 2,
                  repeat: Infinity,
                  delay: i * 0.4,
                }}
              />
            ))}
          </>
        )}

        {/* Rocket */}
        <motion.div 
          className="relative"
          animate={
            phase === "init" 
              ? { y: [0, -6, 0] }
              : phase === "glow"
              ? { y: [0, -10, 0], scale: [1, 1.05, 1] }
              : phase === "launch"
              ? { y: -800, scale: 0.3, opacity: 0 }
              : { y: -800, scale: 0, opacity: 0 }
          }
          transition={
            phase === "init"
              ? { duration: 2, repeat: Infinity, ease: "easeInOut" }
              : phase === "glow"
              ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" }
              : phase === "launch"
              ? { duration: 1, ease: [0.4, 0, 0.2, 1] }
              : { duration: 0 }
          }
        >
          <motion.div
            className="relative w-20 h-20 rounded-full flex items-center justify-center z-10"
            style={{
              background: "linear-gradient(135deg, var(--primary), hsl(180, 100%, 50%))",
            }}
            animate={
              phase === "init"
                ? { boxShadow: ["0 0 40px color-mix(in oklab, var(--primary) 40%, transparent)", "0 0 60px color-mix(in oklab, var(--primary) 50%, transparent)", "0 0 40px color-mix(in oklab, var(--primary) 40%, transparent)"] }
                : phase === "glow"
                ? { boxShadow: ["0 0 60px color-mix(in oklab, var(--primary) 50%, transparent)", "0 0 120px color-mix(in oklab, var(--primary) 90%, transparent)", "0 0 60px color-mix(in oklab, var(--primary) 50%, transparent)"] }
                : { boxShadow: "0 0 150px color-mix(in oklab, var(--primary) 100%, transparent)" }
            }
            transition={{ 
              duration: phase === "init" ? 2 : phase === "glow" ? 0.4 : 0.3, 
              repeat: phase === "launch" || phase === "success" ? 0 : Infinity,
              ease: "easeInOut"
            }}
          >
            <Rocket className="h-10 w-10 text-white" />
          </motion.div>
          
          {/* Subtle exhaust during glow and launch */}
          {(phase === "glow" || phase === "launch") && (
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center">
              {[...Array(isMobile ? (phase === "launch" ? 4 : 2) : (phase === "launch" ? 8 : 4))].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: phase === "launch" ? 10 : 6,
                    height: phase === "launch" ? 10 : 6,
                    background: i % 2 === 0 
                      ? "linear-gradient(to bottom, var(--primary), hsl(180, 100%, 50%))" 
                      : "linear-gradient(to bottom, hsl(180, 100%, 60%), var(--primary))",
                  }}
                  initial={{ 
                    y: 0, 
                    x: (Math.random() - 0.5) * (phase === "launch" ? 30 : 15),
                    opacity: 0.8, 
                    scale: 1 
                  }}
                  animate={{ 
                    y: [0, phase === "launch" ? 120 : 50], 
                    opacity: [0.8, 0],
                    scale: [1, 0.3]
                  }}
                  transition={{
                    duration: phase === "launch" ? 0.4 : 0.6,
                    repeat: Infinity,
                    delay: i * 0.08,
                    ease: "easeOut"
                  }}
                />
              ))}
            </div>
          )}

          {/* Inner glow pulse during init */}
          {phase === "init" && (
            <motion.div
              className="absolute inset-2 rounded-full bg-white/20 blur-sm"
              animate={{ opacity: [0.2, 0.4, 0.2] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
        </motion.div>
      </div>

      {/* Phase text */}
      <AnimatePresence mode="wait">
        {phase !== "launch" && (
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-center"
          >
            <motion.h2 
              className={`font-bold mb-2 ${
                phase === "success" 
                  ? "text-4xl md:text-5xl text-foreground" 
                  : "text-2xl md:text-3xl text-foreground"
              }`}
            >
              {phase === "success" ? (
                <span className="text-gradient">{phaseMessages[phase].title}</span>
              ) : (
                <>
                  {phaseMessages[phase].title}
                  {phaseMessages[phase].title && (
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    >
                      ...
                    </motion.span>
                  )}
                </>
              )}
            </motion.h2>
            <motion.p 
              className={`${
                phase === "success" 
                  ? "text-lg md:text-xl text-muted-foreground" 
                  : "text-base text-muted-foreground"
              }`}
            >
              {phaseMessages[phase].subtitle}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success flash overlay */}
      <AnimatePresence>
        {phase === "success" && (
          <motion.div
            className="absolute inset-0 bg-primary/10 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 0] }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
