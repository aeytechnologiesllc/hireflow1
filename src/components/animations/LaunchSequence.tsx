import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Rocket, Sparkles, Zap, CheckCircle2 } from "lucide-react";

interface LaunchSequenceProps {
  onComplete: () => void;
}

type Phase = "init" | "thrust" | "launch" | "success";

const phaseMessages = {
  init: {
    title: "Initializing Ava",
    subtitle: "Preparing your AI recruiter...",
  },
  thrust: {
    title: "Launching",
    subtitle: "Systems online...",
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
    // Phase 1: Init with status updates (0-2s)
    const status1 = setTimeout(() => setStatusItems(["AI Core"]), 400);
    const status2 = setTimeout(() => setStatusItems(prev => [...prev, "Voice Engine"]), 800);
    const status3 = setTimeout(() => setStatusItems(prev => [...prev, "Analysis Module"]), 1200);
    
    // Phase 2: Thrust buildup (2s-3.2s)
    const thrustTimer = setTimeout(() => setPhase("thrust"), 2000);
    
    // Phase 3: Launch (3.2s-4.2s)
    const launchTimer = setTimeout(() => setPhase("launch"), 3200);
    
    // Phase 4: Success (4.2s-6.5s)
    const successTimer = setTimeout(() => setPhase("success"), 4200);
    
    // Auto-complete (after 6.5s)
    const completeTimer = setTimeout(onComplete, 6500);
    
    return () => {
      clearTimeout(status1);
      clearTimeout(status2);
      clearTimeout(status3);
      clearTimeout(thrustTimer);
      clearTimeout(launchTimer);
      clearTimeout(successTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className="flex flex-col items-center text-center min-h-[400px] justify-center">
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
              : { scale: 0, opacity: 0 }
          }
          transition={{ 
            duration: phase === "init" ? 2 : 1.2,
            repeat: phase === "init" ? Infinity : 0,
          }}
        />

        {/* Expanding rings - visible during init and thrust */}
        {phase !== "launch" && phase !== "success" && (
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

        {/* Rocket */}
        <motion.div 
          className="relative"
          animate={
            phase === "init" 
              ? { y: [0, -8, 0] }
              : phase === "thrust" 
              ? { y: [0, -6, 0, -10, 0, -4, 0], x: [-3, 3, -2, 2, -3, 3, 0] }
              : phase === "launch"
              ? { y: -600, scale: 0.3 }
              : { y: -600 }
          }
          transition={
            phase === "init"
              ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
              : phase === "thrust"
              ? { duration: 0.4, repeat: 3, ease: "easeInOut" }
              : { duration: 1, ease: [0.4, 0, 0.2, 1] }
          }
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
                : {}
            }
            transition={{ duration: 0.3, repeat: phase === "thrust" ? 4 : 0 }}
          >
            <Rocket className="h-10 w-10 text-white" />
          </motion.div>
          
          {/* Exhaust flames - appear during thrust and launch */}
          {(phase === "thrust" || phase === "launch") && (
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

        {/* Sparkle burst on success */}
        <AnimatePresence>
          {phase === "success" && (
            <>
              {[...Array(16)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute left-1/2 top-1/2"
                  initial={{ scale: 0, opacity: 1 }}
                  animate={{ 
                    scale: [0, 1, 0.5],
                    opacity: [1, 1, 0],
                    x: Math.cos((i / 16) * Math.PI * 2) * 120 - 6,
                    y: Math.sin((i / 16) * Math.PI * 2) * 120 - 6,
                  }}
                  transition={{ 
                    duration: 1,
                    delay: i * 0.03,
                    ease: "easeOut"
                  }}
                >
                  <Sparkles className="h-4 w-4 text-primary" />
                </motion.div>
              ))}
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Phase text */}
      <AnimatePresence mode="wait">
        {phase !== "launch" && (
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
                  <motion.span
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  >
                    ...
                  </motion.span>
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
