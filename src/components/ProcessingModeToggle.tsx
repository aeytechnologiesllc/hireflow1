import { useState } from "react";
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
import { toast } from "sonner";
import confetti from "canvas-confetti";

interface ProcessingModeToggleProps {
  jobId: string;
  jobTitle: string;
  currentMode: "auto" | "manual";
  disabled?: boolean;
}

export function ProcessingModeToggle({ 
  jobId, 
  jobTitle, 
  currentMode, 
  disabled 
}: ProcessingModeToggleProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [pendingMode, setPendingMode] = useState<"auto" | "manual" | null>(null);
  const updateJob = useUpdateJob();

  const handleBadgeClick = (e: React.MouseEvent) => {
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

      if (pendingMode === "auto") {
        // Celebration for autopilot
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#a855f7', '#d946ef', '#ec4899'],
        });
        toast.success(`🚀 Autopilot engaged! Ava will handle screening for "${jobTitle}"`);
      } else {
        toast.success(`🎛️ Manual mode active. You're in control of "${jobTitle}"`);
      }
    } catch (error) {
      toast.error("Failed to update processing mode");
    }
    
    setPendingMode(null);
  };

  const handleCancel = () => {
    setShowDialog(false);
    setPendingMode(null);
  };

  return (
    <>
      {/* Clickable Badge */}
      <motion.button
        onClick={handleBadgeClick}
        disabled={disabled || updateJob.isPending}
        className={cn(
          "px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 transition-all",
          "hover:scale-105 active:scale-95 cursor-pointer",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          currentMode === "auto" 
            ? "bg-purple-500/20 text-purple-400 hover:bg-purple-500/30" 
            : "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30"
        )}
        whileHover={{ scale: disabled ? 1 : 1.05 }}
        whileTap={{ scale: disabled ? 1 : 0.95 }}
        title="Click to switch processing mode"
      >
        {updateJob.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : currentMode === "auto" ? (
          <Zap className="h-3 w-3" />
        ) : (
          <Hand className="h-3 w-3" />
        )}
        {currentMode === "auto" ? "Autopilot" : "Manual"}
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
    </>
  );
}
