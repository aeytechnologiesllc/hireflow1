import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PremiumOrb } from "@/components/animations/PremiumOrb";
import { Button } from "@/components/ui/button";
import { staggerContainer, staggerItem } from "@/lib/animations";

interface SubscriptionSuccessModalProps {
  planType: string;
  onClose: () => void;
}

const benefits = [
  "Unlimited job postings",
  "Advanced applicant filtering",
  "Team collaboration tools",
  "Interview scheduling",
  "Priority support",
];

// Emerald rising sparkles — subtle, fewer particles
const EmeraldSparkles = ({ count = 18 }: { count?: number }) => {
  const sparkles = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 2,
        duration: 2.5 + Math.random() * 2,
        size: 2 + Math.random() * 4,
        opacity: 0.35 + Math.random() * 0.45,
      })),
    [count]
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
      {sparkles.map((s) => (
        <motion.div
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            bottom: "-5%",
            width: s.size,
            height: s.size,
            background: `radial-gradient(circle, rgba(16,185,129,${s.opacity}) 0%, rgba(20,184,166,0) 70%)`,
          }}
          animate={{
            y: [0, -420],
            opacity: [0, s.opacity, s.opacity, 0],
            scale: [0, 1, 1, 0.4],
          }}
          transition={{
            duration: s.duration,
            delay: 0.6 + s.delay,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
};

export default function SubscriptionSuccessModal({
  planType,
  onClose,
}: SubscriptionSuccessModalProps) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(true);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const planLabel =
    planType === "business"
      ? "Business"
      : planType === "growth"
        ? "Growth"
        : planType.charAt(0).toUpperCase() + planType.slice(1);

  // Auto-dismiss after 8s; reset on interaction
  const resetTimer = useCallback(() => {
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    autoDismissRef.current = setTimeout(() => {
      setVisible(false);
      onClose();
    }, 8000);
  }, [onClose]);

  useEffect(() => {
    resetTimer();
    return () => {
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    };
  }, [resetTimer]);

  const handleInteraction = () => resetTimer();

  const handlePrimaryCTA = () => {
    setVisible(false);
    onClose();
    navigate("/jobs");
  };

  const handleSecondaryLink = () => {
    setVisible(false);
    onClose();
    navigate("/settings?tab=subscription");
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          onMouseMove={handleInteraction}
          onClick={handleInteraction}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal card */}
          <motion.div
            className="relative w-full max-w-md rounded-2xl border border-emerald-500/20 bg-gray-900/95 p-8 shadow-[0_0_60px_-15px_rgba(16,185,129,0.25)] overflow-hidden"
            initial={{ scale: 0.85, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          >
            {/* Sparkles */}
            <EmeraldSparkles />

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center text-center">
              {/* Orb */}
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 14,
                  delay: 0.15,
                }}
                className="mb-6"
              >
                <PremiumOrb mode="success" size={100} showIcon />
              </motion.div>

              {/* Headline */}
              <motion.h2
                className="text-2xl font-bold text-white mb-2"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.4 }}
              >
                🎉 Welcome to the {planLabel} Plan!
              </motion.h2>

              {/* Subtext */}
              <motion.p
                className="text-muted-foreground mb-6"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.4 }}
              >
                Your hiring engine is now fully unlocked.
              </motion.p>

              {/* Benefits */}
              <motion.ul
                className="w-full space-y-2.5 mb-8 text-left"
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {benefits.map((b) => (
                  <motion.li
                    key={b}
                    variants={staggerItem}
                    className="flex items-center gap-3 text-sm text-gray-200"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                      <Check className="h-3 w-3 text-emerald-400" />
                    </span>
                    {b}
                  </motion.li>
                ))}
              </motion.ul>

              {/* Primary CTA */}
              <motion.div
                className="w-full"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9, duration: 0.4 }}
              >
                <Button
                  onClick={handlePrimaryCTA}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-[0_0_20px_-4px_rgba(16,185,129,0.5)] transition-all duration-300 hover:shadow-[0_0_28px_-4px_rgba(16,185,129,0.65)]"
                  size="lg"
                >
                  Start Posting Jobs →
                </Button>
              </motion.div>

              {/* Secondary link */}
              <motion.button
                onClick={handleSecondaryLink}
                className="mt-3 text-sm text-muted-foreground hover:text-emerald-400 transition-colors"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1 }}
              >
                View Plan Details
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
