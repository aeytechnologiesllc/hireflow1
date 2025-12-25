import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Hand, Rocket, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpdateJob } from "@/hooks/useJobs";

interface ProcessingModeToggleProps {
  jobId: string;
  jobTitle: string;
  currentMode: "auto" | "manual";
  disabled?: boolean;
}

// Rocket Thrust Animation Overlay
function AutopilotEngagedOverlay({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-6">
        {/* Rocket with thrust */}
        <motion.div 
          className="relative"
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 0.3, repeat: 8, ease: "easeInOut" }}
        >
          {/* Rocket */}
          <motion.div
            className="relative z-10"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 0.5, repeat: 5 }}
          >
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center shadow-2xl">
              <Rocket className="h-10 w-10 text-white" />
            </div>
          </motion.div>
          
          {/* Exhaust flames */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center">
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full"
                style={{
                  background: i % 2 === 0 
                    ? "linear-gradient(to bottom, #f97316, #dc2626)" 
                    : "linear-gradient(to bottom, #fbbf24, #f97316)",
                }}
                initial={{ 
                  y: 0, 
                  x: (Math.random() - 0.5) * 20,
                  opacity: 1, 
                  scale: 1 
                }}
                animate={{ 
                  y: [0, 60 + Math.random() * 40], 
                  opacity: [1, 0],
                  scale: [1, 0.3]
                }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.08,
                  ease: "easeOut"
                }}
              />
            ))}
          </div>

          {/* Glow effect */}
          <motion.div
            className="absolute inset-0 -z-10 rounded-full bg-purple-500/50 blur-xl"
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 1, repeat: 3 }}
          />
        </motion.div>

        {/* Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <motion.h2 
            className="text-3xl font-bold tracking-wider text-white mb-2"
            animate={{ opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            AUTOPILOT ENGAGED
          </motion.h2>
          <p className="text-purple-300 text-lg">Ava is now in control</p>
        </motion.div>
      </div>
    </motion.div>
  );
}

// Manual Control Animation Overlay
function ManualControlOverlay({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-6">
        {/* Hand with grip animation */}
        <motion.div className="relative">
          <motion.div
            className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-2xl"
            animate={{ 
              scale: [1, 1.1, 1],
              rotate: [0, -5, 5, 0]
            }}
            transition={{ duration: 0.8, repeat: 3 }}
          >
            <Hand className="h-10 w-10 text-white" />
          </motion.div>
          
          {/* Control pulse rings */}
          {[...Array(3)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute inset-0 rounded-full border-2 border-orange-400/50"
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: [1, 2, 2.5], opacity: [0.6, 0.3, 0] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.4,
                ease: "easeOut"
              }}
            />
          ))}

          {/* Glow effect */}
          <motion.div
            className="absolute inset-0 -z-10 rounded-full bg-orange-500/50 blur-xl"
            animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 1, repeat: 3 }}
          />
        </motion.div>

        {/* Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <motion.h2 
            className="text-3xl font-bold tracking-wider text-white mb-2"
            animate={{ opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            YOU HAVE FULL CONTROL
          </motion.h2>
          <p className="text-orange-300 text-lg">Every decision is yours</p>
        </motion.div>
      </div>
    </motion.div>
  );
}

export function ProcessingModeToggle({ 
  jobId, 
  jobTitle, 
  currentMode, 
  disabled 
}: ProcessingModeToggleProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [pendingMode, setPendingMode] = useState<"auto" | "manual" | null>(null);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState<"auto" | "manual" | null>(null);
  const updateJob = useUpdateJob();

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    
    const newMode = currentMode === "auto" ? "manual" : "auto";
    setPendingMode(newMode);
    setShowDialog(true);
  };

  const handleConfirm = async () => {
    if (!pendingMode) return;

    try {
      await updateJob.mutateAsync({
        id: jobId,
        processing_mode: pendingMode,
      });

      setShowDialog(false);
      setShowSuccessOverlay(pendingMode);
    } catch (error) {
      // Error handling without toast - could add inline error state if needed
      console.error("Failed to update processing mode:", error);
    }
    
    setPendingMode(null);
  };

  const handleCancel = () => {
    setShowDialog(false);
    setPendingMode(null);
  };

  return (
    <>
      {/* Cockpit-Style Button */}
      <motion.button
        onClick={handleButtonClick}
        disabled={disabled || updateJob.isPending}
        className={cn(
          "px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all",
          "shadow-lg border",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          currentMode === "auto" 
            ? "bg-gradient-to-r from-orange-500 to-amber-600 text-white border-orange-400/50 hover:from-orange-400 hover:to-amber-500 shadow-orange-500/25" 
            : "bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white border-purple-400/50 hover:from-purple-400 hover:to-fuchsia-500 shadow-purple-500/25"
        )}
        whileHover={{ scale: disabled ? 1 : 1.02 }}
        whileTap={{ scale: disabled ? 1 : 0.98 }}
      >
        {updateJob.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : currentMode === "auto" ? (
          <>
            <Hand className="h-4 w-4" />
            <span>Take Control</span>
          </>
        ) : (
          <>
            <motion.div
              animate={{ y: [0, -2, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <Rocket className="h-4 w-4" />
            </motion.div>
            <span>Engage Autopilot</span>
          </>
        )}
      </motion.button>

      {/* Confirmation Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <AnimatePresence mode="wait">
            {pendingMode === "auto" ? (
              <motion.div
                key="autopilot"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <DialogHeader className="text-center pb-4">
                  <motion.div 
                    className="mx-auto mb-4 w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-600 flex items-center justify-center"
                    animate={{ 
                      y: [0, -8, 0],
                      scale: [1, 1.05, 1],
                    }}
                    transition={{ 
                      duration: 2, 
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  >
                    <Rocket className="h-8 w-8 text-white" />
                  </motion.div>
                  <DialogTitle className="text-xl">Engage Autopilot Mode?</DialogTitle>
                  <DialogDescription className="text-center mt-2">
                    Ava will automatically analyze applicants, score them, and advance qualified 
                    candidates through each phase. You'll still have full visibility and can 
                    override any decisions.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex gap-2 sm:justify-center mt-4">
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleConfirm}
                    disabled={updateJob.isPending}
                    className="bg-gradient-to-r from-purple-500 to-fuchsia-600 hover:from-purple-400 hover:to-fuchsia-500 text-white"
                  >
                    {updateJob.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Rocket className="h-4 w-4 mr-2" />
                    )}
                    Engage Autopilot
                  </Button>
                </DialogFooter>
              </motion.div>
            ) : (
              <motion.div
                key="manual"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <DialogHeader className="text-center pb-4">
                  <motion.div 
                    className="mx-auto mb-4 w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center"
                    animate={{ 
                      rotate: [0, -10, 10, 0],
                    }}
                    transition={{ 
                      duration: 2, 
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  >
                    <Hand className="h-8 w-8 text-white" />
                  </motion.div>
                  <DialogTitle className="text-xl">Switch to Manual Mode?</DialogTitle>
                  <DialogDescription className="text-center mt-2">
                    You'll review each applicant personally and decide when to advance them 
                    through phases. Ava will still provide scores and insights to help you decide.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex gap-2 sm:justify-center mt-4">
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleConfirm}
                    disabled={updateJob.isPending}
                    className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white"
                  >
                    {updateJob.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Hand className="h-4 w-4 mr-2" />
                    )}
                    Take Control
                  </Button>
                </DialogFooter>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>

      {/* Success Overlays */}
      <AnimatePresence>
        {showSuccessOverlay === "auto" && (
          <AutopilotEngagedOverlay onComplete={() => setShowSuccessOverlay(null)} />
        )}
        {showSuccessOverlay === "manual" && (
          <ManualControlOverlay onComplete={() => setShowSuccessOverlay(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
