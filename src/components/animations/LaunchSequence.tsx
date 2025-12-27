import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Rocket, Zap, CheckCircle2 } from "lucide-react";

interface LaunchSequenceProps {
  onComplete: () => void;
}

type Phase = "init" | "revRight" | "returnCenter1" | "revLeft" | "returnCenter2" | "thrust" | "launch" | "success";

const phaseMessages: Record<Phase, { title: string; subtitle: string }> = {
  init: {
    title: "Initializing Ava",
    subtitle: "Preparing your AI recruiter...",
  },
  revRight: {
    title: "Running Diagnostics",
    subtitle: "Testing flight systems...",
  },
  returnCenter1: {
    title: "",
    subtitle: "",
  },
  revLeft: {
    title: "Calibrating",
    subtitle: "Optimizing performance...",
  },
  returnCenter2: {
    title: "",
    subtitle: "",
  },
  thrust: {
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

  useEffect(() => {
    // Phase 1: Init with status updates (0-1.5s)
    const status1 = setTimeout(() => setStatusItems(["AI Core"]), 300);
    const status2 = setTimeout(() => setStatusItems(prev => [...prev, "Voice Engine"]), 600);
    const status3 = setTimeout(() => setStatusItems(prev => [...prev, "Analysis Module"]), 900);
    
    // Phase 2: Rev Right (1.5s - flies off right)
    const revRightTimer = setTimeout(() => setPhase("revRight"), 1500);
    
    // Phase 3: Return to Center (2.1s)
    const returnCenter1Timer = setTimeout(() => setPhase("returnCenter1"), 2100);
    
    // Phase 4: Rev Left (2.6s - flies off left)
    const revLeftTimer = setTimeout(() => setPhase("revLeft"), 2600);
    
    // Phase 5: Return to Center (3.2s)
    const returnCenter2Timer = setTimeout(() => setPhase("returnCenter2"), 3200);
    
    // Phase 6: Thrust buildup (3.7s)
    const thrustTimer = setTimeout(() => setPhase("thrust"), 3700);
    
    // Phase 7: Launch (4.5s)
    const launchTimer = setTimeout(() => setPhase("launch"), 4500);
    
    // Phase 8: Success (5.3s)
    const successTimer = setTimeout(() => setPhase("success"), 5300);
    
    // Auto-complete (after 7.5s)
    const completeTimer = setTimeout(onComplete, 7500);
    
    return () => {
      clearTimeout(status1);
      clearTimeout(status2);
      clearTimeout(status3);
      clearTimeout(revRightTimer);
      clearTimeout(returnCenter1Timer);
      clearTimeout(revLeftTimer);
      clearTimeout(returnCenter2Timer);
      clearTimeout(thrustTimer);
      clearTimeout(launchTimer);
      clearTimeout(successTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  // Get rocket animation based on phase
  const getRocketAnimation = () => {
    switch (phase) {
      case "init":
        return { x: 0, y: [0, -8, 0], rotate: 0, scale: 1 };
      case "revRight":
        return { x: 500, y: 0, rotate: 25, scale: 0.7 };
      case "returnCenter1":
        return { x: 0, y: 0, rotate: 0, scale: 1 };
      case "revLeft":
        return { x: -500, y: 0, rotate: -25, scale: 0.7 };
      case "returnCenter2":
        return { x: 0, y: 0, rotate: 0, scale: 1 };
      case "thrust":
        return { x: [-3, 3, -2, 2, -3, 3, 0], y: [0, -6, 0, -10, 0, -4, 0], rotate: 0, scale: 1 };
      case "launch":
        return { x: 0, y: -600, rotate: 0, scale: 0.3 };
      case "success":
        return { x: 0, y: -600, rotate: 0, scale: 0.3 };
      default:
        return { x: 0, y: 0, rotate: 0, scale: 1 };
    }
  };

  // Get rocket transition based on phase
  const getRocketTransition = () => {
    switch (phase) {
      case "init":
        return { duration: 1.5, repeat: Infinity, ease: "easeInOut" as const };
      case "revRight":
      case "revLeft":
        return { duration: 0.5, ease: [0.4, 0, 0.2, 1] as const };
      case "returnCenter1":
      case "returnCenter2":
        return { type: "spring" as const, damping: 12, stiffness: 120, duration: 0.5 };
      case "thrust":
        return { duration: 0.4, repeat: 2, ease: "easeInOut" as const };
      case "launch":
        return { duration: 0.8, ease: [0.4, 0, 0.2, 1] as const };
      default:
        return { duration: 0.5 };
    }
  };

  // Check if we should show horizontal trails
  const showHorizontalTrails = phase === "revRight" || phase === "revLeft";
  const showVerticalExhaust = phase === "thrust" || phase === "launch";
  const isFlying = phase === "revRight" || phase === "revLeft";

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center text-center justify-center overflow-hidden bg-background">
      {/* Background grid */}
      <div className="absolute inset-0 overflow-hidden">
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(to right, hsl(var(--primary)) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(var(--primary)) 1px, transparent 1px)
            `,
            backgroundSize: "60px 60px",
          }}
        />
        {/* Animated scan line */}
        <motion.div
          className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
          initial={{ top: "-10%" }}
          animate={{ top: "110%" }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
      </div>

      {/* Floating orbs */}
      <motion.div
        className="absolute top-[10%] right-[15%] w-[400px] h-[400px] rounded-full bg-primary/20 blur-[120px]"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.3, 0.2],
        }}
        transition={{ duration: 8, repeat: Infinity }}
      />
      <motion.div
        className="absolute bottom-[10%] left-[10%] w-[350px] h-[350px] rounded-full bg-accent/15 blur-[100px]"
        animate={{
          scale: [1.2, 1, 1.2],
          opacity: [0.15, 0.25, 0.15],
        }}
        transition={{ duration: 6, repeat: Infinity }}
      />
      <motion.div
        className="absolute top-[40%] left-[30%] w-[200px] h-[200px] rounded-full bg-cyan-500/10 blur-[80px]"
        animate={{
          x: [0, 100, 0],
          y: [0, -50, 0],
        }}
        transition={{ duration: 10, repeat: Infinity }}
      />
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
        {/* Background glow orb */}
        <motion.div
          className="absolute inset-0 -z-10 rounded-full blur-3xl"
          style={{
            width: 200,
            height: 200,
            left: -60,
            top: -60,
            background: "linear-gradient(135deg, hsl(var(--primary) / 0.3), hsl(180, 100%, 50%, 0.2))",
          }}
          animate={
            phase === "init" 
              ? { scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }
              : phase === "thrust"
              ? { scale: [1.2, 1.8, 1.4, 2], opacity: [0.5, 0.9, 0.7, 1] }
              : isFlying
              ? { scale: 0.5, opacity: 0.2 }
              : { scale: 1, opacity: 0.3 }
          }
          transition={{ 
            duration: phase === "init" ? 2 : 1.2,
            repeat: phase === "init" ? Infinity : 0,
          }}
        />

        {/* Expanding rings - visible during init and return phases */}
        {(phase === "init" || phase === "returnCenter1" || phase === "returnCenter2" || phase === "thrust") && (
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
                  scale: [1, 2, 2],
                  opacity: [0.5, 0.2, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.6,
                }}
              />
            ))}
          </>
        )}

        {/* Speed lines during horizontal flight */}
        <AnimatePresence>
          {isFlying && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 pointer-events-none"
            >
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute h-0.5 rounded-full bg-gradient-to-r from-primary/60 to-transparent"
                  style={{
                    width: 60 + Math.random() * 40,
                    top: -30 + i * 12,
                    left: phase === "revRight" ? -100 : 40,
                  }}
                  initial={{ opacity: 0, scaleX: 0 }}
                  animate={{ 
                    opacity: [0, 0.8, 0],
                    scaleX: [0, 1, 0.5],
                    x: phase === "revRight" ? [0, -80] : [0, 80]
                  }}
                  transition={{
                    duration: 0.3,
                    delay: i * 0.04,
                    repeat: Infinity,
                    repeatDelay: 0.1
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rocket */}
        <motion.div 
          className="relative"
          animate={getRocketAnimation()}
          transition={getRocketTransition()}
        >
          <motion.div
            className="relative w-20 h-20 rounded-full flex items-center justify-center z-10"
            style={{
              background: "linear-gradient(135deg, hsl(var(--primary)), hsl(180, 100%, 50%))",
              boxShadow: "0 0 60px hsl(var(--primary) / 0.5)",
            }}
            animate={
              phase === "thrust" 
                ? { scale: [1, 1.15, 1], boxShadow: ["0 0 60px hsl(var(--primary) / 0.5)", "0 0 100px hsl(var(--primary) / 0.8)", "0 0 60px hsl(var(--primary) / 0.5)"] }
                : isFlying
                ? { boxShadow: "0 0 80px hsl(var(--primary) / 0.7)" }
                : {}
            }
            transition={{ duration: 0.3, repeat: phase === "thrust" ? 4 : 0 }}
          >
            <Rocket className="h-10 w-10 text-white" />
          </motion.div>
          
          {/* Horizontal exhaust trails - during rev phases */}
          {showHorizontalTrails && (
            <div 
              className="absolute top-1/2 -translate-y-1/2 flex items-center"
              style={{
                left: phase === "revRight" ? -80 : "auto",
                right: phase === "revLeft" ? -80 : "auto",
              }}
            >
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: 12,
                    height: 12,
                    background: i % 3 === 0 
                      ? "linear-gradient(to bottom, hsl(var(--primary)), hsl(180, 100%, 50%))" 
                      : i % 3 === 1
                      ? "linear-gradient(to bottom, #f97316, #dc2626)" 
                      : "linear-gradient(to bottom, #fbbf24, #f97316)",
                  }}
                  initial={{ 
                    x: 0,
                    y: (Math.random() - 0.5) * 30,
                    opacity: 1, 
                    scale: 1 
                  }}
                  animate={{ 
                    x: phase === "revRight" ? -120 : 120,
                    opacity: [1, 0],
                    scale: [1, 0.2]
                  }}
                  transition={{
                    duration: 0.35,
                    repeat: Infinity,
                    delay: i * 0.03,
                    ease: "easeOut"
                  }}
                />
              ))}
            </div>
          )}

          {/* Vertical exhaust flames - during thrust and launch */}
          {showVerticalExhaust && (
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center">
              {[...Array(phase === "launch" ? 24 : 14)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: phase === "launch" ? 14 : 10,
                    height: phase === "launch" ? 14 : 10,
                    background: i % 3 === 0 
                      ? "linear-gradient(to bottom, hsl(var(--primary)), hsl(180, 100%, 50%))" 
                      : i % 3 === 1
                      ? "linear-gradient(to bottom, #f97316, #dc2626)" 
                      : "linear-gradient(to bottom, #fbbf24, #f97316)",
                  }}
                  initial={{ 
                    y: 0, 
                    x: (Math.random() - 0.5) * (phase === "launch" ? 50 : 25),
                    opacity: 1, 
                    scale: 1 
                  }}
                  animate={{ 
                    y: [0, phase === "launch" ? 180 : 100], 
                    opacity: [1, 0],
                    scale: [1, 0.2]
                  }}
                  transition={{
                    duration: phase === "launch" ? 0.25 : 0.45,
                    repeat: Infinity,
                    delay: i * 0.04,
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
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </motion.div>

        {/* Trail particles after launch */}
        <AnimatePresence>
          {phase === "launch" && (
            <motion.div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-3 h-3 rounded-full"
                  style={{
                    background: i % 2 === 0 
                      ? "linear-gradient(to bottom, hsl(var(--primary)), hsl(180, 100%, 50%))"
                      : "linear-gradient(to bottom, hsl(180, 100%, 60%), hsl(var(--primary)))",
                    x: (Math.random() - 0.5) * 40
                  }}
                  initial={{ y: 0, opacity: 1, scale: 1 }}
                  animate={{ 
                    y: 120 + i * 25, 
                    opacity: 0,
                    scale: 0.2
                  }}
                  transition={{ 
                    duration: 1.2,
                    delay: i * 0.06,
                    ease: "easeOut"
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Phase text */}
      <AnimatePresence mode="wait">
        {phase !== "launch" && phase !== "returnCenter1" && phase !== "returnCenter2" && (
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
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
                      transition={{ duration: 0.8, repeat: Infinity }}
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
                  ? "text-xl text-muted-foreground max-w-md" 
                  : "text-muted-foreground"
              }`}
            >
              {phaseMessages[phase].subtitle}
            </motion.p>

            {/* Success icon */}
            {phase === "success" && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, type: "spring" }}
                className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary"
              >
                <Zap className="h-4 w-4" />
                <span className="text-sm font-medium">Ready to find great talent</span>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default LaunchSequence;
