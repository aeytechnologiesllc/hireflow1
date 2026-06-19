import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Lightbulb,
  Calendar,
  ArrowRight,
  ExternalLink,
  X,
  Mic,
  Trophy,
  Crown,
  XCircle,
  RefreshCw,
  Info,
  CheckCircle,
  Clock,
  Loader2,
  Download,
  Lock
} from "lucide-react";
import confetti from "canvas-confetti";
import { format } from "date-fns";
import AvaGlyph from "@/components/AvaGlyph";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CandidateRescheduleRequestDialog } from "@/components/CandidateRescheduleRequestDialog";
import { useImprovementBlueprint, BLUEPRINT_PRICE_FORMATTED } from "@/hooks/useImprovementBlueprint";
import { cn } from "@/lib/utils";

// Unified Rejected State Card with integrated blueprint section
function RejectedStateCard({ jobTitle, applicationId }: { jobTitle?: string; applicationId?: string }) {
  const { 
    downloadBlueprint, 
    isGenerating, 
    purchaseBlueprint, 
    isPurchasing,
    checkPurchaseStatus,
    isCheckingPurchase,
    hasPurchased,
    verifyPurchase
  } = useImprovementBlueprint();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const [hasVerified, setHasVerified] = useState(false);

  // Check purchase status on mount
  useEffect(() => {
    if (applicationId) {
      checkPurchaseStatus(applicationId);
    }
  }, [applicationId, checkPurchaseStatus]);

  // Handle Stripe redirect verification
  useEffect(() => {
    const blueprintSuccess = searchParams.get("blueprint_success");
    const sessionId = searchParams.get("session_id");
    
    if (blueprintSuccess === "true" && sessionId && applicationId && !hasVerified) {
      setHasVerified(true);
      
      verifyPurchase(sessionId, applicationId).then((success) => {
        if (success) {
          toast.success("Payment successful! You can now download your blueprint.");
          const newParams = new URLSearchParams(searchParams);
          newParams.delete("blueprint_success");
          newParams.delete("session_id");
          setSearchParams(newParams, { replace: true });
        } else {
          toast.error("There was an issue verifying your payment. Please contact support.");
        }
      });
    }

    if (searchParams.get("blueprint_cancelled") === "true") {
      toast.info("Checkout was cancelled.");
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("blueprint_cancelled");
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, applicationId, verifyPurchase, hasVerified, setSearchParams]);

  const handleDownload = () => {
    if (applicationId) downloadBlueprint(applicationId);
  };

  const handlePurchase = () => {
    if (applicationId) purchaseBlueprint(applicationId);
  };

  return (
    <Card className="bg-card border-border overflow-hidden">
      {/* Decorative top gradient */}
      <div className="h-2 bg-primary/50" />

      <CardContent className="p-8 text-center space-y-6">
        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.2 }}
          className="mx-auto w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center"
        >
          <Lightbulb className="h-10 w-10 text-primary" />
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-2"
        >
          <h2 className="text-2xl font-bold text-foreground">
            This Chapter Has Closed
          </h2>
          <p className="text-muted-foreground">
            But your story continues
          </p>
        </motion.div>

        {/* Message */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-muted-foreground leading-relaxed"
        >
          While the <span className="text-foreground font-medium">{jobTitle || "position"}</span> wasn't the right fit this time, 
          every interview is a stepping stone.
        </motion.p>

        {/* Blueprint Section - Integrated */}
        {applicationId && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="pt-4 border-t border-border space-y-4"
          >
            <div className="flex items-center justify-center gap-2 text-primary">
              <AvaGlyph className="h-4 w-4 fill-primary/30" />
              <span className="text-sm font-medium">Get Your Improvement Blueprint</span>
              <AvaGlyph className="h-4 w-4 fill-primary/30" />
            </div>
            
            <p className="text-sm text-muted-foreground">
              A personalized coaching guide with actionable steps to strengthen your next application.
            </p>

            {isCheckingPurchase ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : hasPurchased ? (
              <Button
                onClick={handleDownload}
                disabled={isGenerating}
                className={cn(
                  "gap-2",
                  "bg-primary",
                  "hover:bg-primary/90 transition-all duration-500",
                  "text-primary-foreground font-semibold border-0",
                  "shadow-lg shadow-primary/25"
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Blueprint...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Download Blueprint
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handlePurchase}
                disabled={isPurchasing}
                className={cn(
                  "gap-2",
                  "bg-primary",
                  "hover:bg-primary/90 transition-all duration-500",
                  "text-primary-foreground font-semibold border-0",
                  "shadow-lg shadow-primary/25"
                )}
              >
                {isPurchasing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting Checkout...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    <AvaGlyph className="h-4 w-4" />
                    Unlock for {BLUEPRINT_PRICE_FORMATTED}
                  </>
                )}
              </Button>
            )}
          </motion.div>
        )}

        {/* Motivational quote */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="pt-4 border-t border-border"
        >
          <p className="text-xs text-muted-foreground italic">
            "Success is not final, failure is not fatal: it is the courage to continue that counts."
          </p>
        </motion.div>
      </CardContent>
    </Card>
  );
}

function NextStepCallout({
  title,
  summary,
  steps,
  tone = "blue",
}: {
  title: string;
  summary: string;
  steps: string[];
  tone?: "blue" | "emerald" | "amber" | "purple" | "gold";
}) {
  const toneStyles = {
    blue: {
      wrap: "bg-secondary border-border",
      icon: "text-muted-foreground",
    },
    emerald: {
      wrap: "bg-success/10 border-success/20",
      icon: "text-success",
    },
    amber: {
      wrap: "bg-warning/10 border-warning/20",
      icon: "text-warning",
    },
    purple: {
      wrap: "bg-primary/10 border-primary/20",
      icon: "text-primary",
    },
    gold: {
      wrap: "bg-primary/10 border-primary/20",
      icon: "text-primary",
    },
  }[tone];

  return (
    <div className={cn("rounded-lg border p-4 text-left", toneStyles.wrap)}>
      <div className="flex items-start gap-2 mb-2">
        <Info className={cn("h-4 w-4 mt-0.5 shrink-0", toneStyles.icon)} />
        <p className="text-sm font-medium text-foreground">{title}</p>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
      {steps.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {steps.map((step) => (
            <li key={step} className="flex items-start gap-2">
              <span className={cn("mt-1 h-1.5 w-1.5 rounded-full shrink-0", tone === "gold" ? "bg-primary" : "bg-current opacity-70")} />
              <span>{step}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface InterviewDetails {
  scheduledAt?: string;
  meetingLink?: string;
  durationMinutes?: number;
}

interface CandidateStatusScreenProps {
  state: "rejected" | "interview_scheduled" | "hired" | "ava_interview_unlocked" | "reconsidered" | "interview_cancelled" | "interview_rescheduled" | null;
  jobTitle?: string;
  companyName?: string;
  interviewDetails?: InterviewDetails;
  onClose: () => void;
  // New props for interview actions
  interviewId?: string;
  applicationId?: string;
  candidateResponse?: string | null;
  onInterviewConfirmed?: () => void;
  onRescheduleRequested?: () => void;
}

export function CandidateStatusScreen({
  state,
  jobTitle,
  companyName,
  interviewDetails,
  onClose,
  interviewId,
  applicationId,
  candidateResponse: initialCandidateResponse,
  onInterviewConfirmed,
  onRescheduleRequested,
}: CandidateStatusScreenProps) {
  const queryClient = useQueryClient();
  
  // Interview action states
  const [isConfirming, setIsConfirming] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [localCandidateResponse, setLocalCandidateResponse] = useState<string | null>(initialCandidateResponse || null);
  
  // Sync with prop changes
  useEffect(() => {
    setLocalCandidateResponse(initialCandidateResponse || null);
  }, [initialCandidateResponse]);
  
  // Handle interview confirmation
  const handleConfirmInterview = async () => {
    if (!interviewId || !applicationId) return;
    
    setIsConfirming(true);
    try {
      const { data, error } = await supabase.functions.invoke("candidate-interview-response", {
        body: {
          action: "confirm",
          interviewId,
        },
      });
      
      if (!data?.success) {
        throw new Error(data?.error || "Failed to confirm interview");
      }
      
      if (error) throw error;
      
      setLocalCandidateResponse("confirmed");
      toast.success("Interview confirmed!", {
        description: "You're all set. We'll see you at the scheduled time.",
      });
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["candidate-interview", applicationId] });
      
      onInterviewConfirmed?.();
    } catch (error: any) {
      console.error("Error confirming interview:", error);
      toast.error("Failed to confirm interview", {
        description: error.message || "Please try again.",
      });
    } finally {
      setIsConfirming(false);
    }
  };
  
  // Handle reschedule success
  const handleRescheduleSuccess = () => {
    setLocalCandidateResponse("reschedule_requested");
    setShowRescheduleDialog(false);
    queryClient.invalidateQueries({ queryKey: ["candidate-interview", applicationId] });
    onRescheduleRequested?.();
  };
  
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (state) {
      // Delay content animation slightly
      const timer = setTimeout(() => setShowContent(true), 100);
      return () => clearTimeout(timer);
    }
  }, [state]);

  // Trigger confetti for celebrations
  useEffect(() => {
    if (state === "interview_scheduled" && showContent) {
      // Single burst for interview
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#1aa06a', '#9fe7c9', '#eef6f1', '#0c1c14', '#070f0b'],
      });
    } else if (state === "ava_interview_unlocked" && showContent) {
      // Premium celebration with jade/brass colors for Ava Interview
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#9fe7c9', '#0c1c14', '#070f0b', '#1aa06a', '#eef6f1'],
      });
    } else if (state === "reconsidered" && showContent) {
      // Celebration for reconsideration - jade/brass colors for fresh start
      confetti({
        particleCount: 120,
        spread: 75,
        origin: { y: 0.6 },
        colors: ['#1aa06a', '#9fe7c9', '#eef6f1', '#0c1c14', '#070f0b'],
      });
    } else if (state === "hired" && showContent) {
      // Epic 5-second multi-burst celebration with golden colors
      const duration = 5000;
      const end = Date.now() + duration;
      let lastCenterBurst = 0;

      const frame = () => {
        // Brass confetti from left
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.6 },
          colors: ['#1aa06a', '#9fe7c9', '#eef6f1', '#0c1c14', '#070f0b'],
          shapes: ['circle', 'square'],
          gravity: 0.8,
        });

        // Brass confetti from right
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.6 },
          colors: ['#1aa06a', '#9fe7c9', '#eef6f1', '#0c1c14', '#070f0b'],
          shapes: ['circle', 'square'],
          gravity: 0.8,
        });
        
        // Center burst every 500ms
        const now = Date.now();
        if (now - lastCenterBurst > 500) {
          confetti({
            particleCount: 30,
            spread: 100,
            origin: { x: 0.5, y: 0.4 },
            colors: ['#1aa06a', '#9fe7c9', '#eef6f1', '#0c1c14', '#070f0b'],
          });
          lastCenterBurst = now;
        }

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    }
  }, [state, showContent]);

  if (!state) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-background/95 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", duration: 0.5 }}
          className="relative z-10 w-full max-w-lg px-4"
        >
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-0 right-6 z-20 rounded-full bg-card border border-border"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Rejected State - Single unified card */}
          {state === "rejected" && (
            <RejectedStateCard 
              jobTitle={jobTitle} 
              applicationId={applicationId} 
            />
          )}

          {/* Interview Scheduled State */}
          {state === "interview_scheduled" && (
            <Card className="bg-card border-border overflow-hidden">
              {/* Decorative top gradient */}
              <div className="h-2 bg-primary/50" />

              <CardContent className="p-8 text-center space-y-6">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: [0, -10, 10, -10, 0] }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="mx-auto w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center"
                >
                  <Calendar className="h-10 w-10 text-primary" />
                </motion.div>

                {/* Headline */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-2"
                >
                  <h2 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
                    <span>🎉</span> You're Invited to Interview!
                  </h2>
                  <p className="text-primary">
                    {companyName ? `${companyName} wants to meet you` : "Great news!"}
                  </p>
                </motion.div>

                {/* Interview Details Card */}
                {interviewDetails && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <Card className="bg-primary/10 border-primary/30">
                      <CardContent className="p-4 space-y-3">
                        {interviewDetails.scheduledAt && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Date & Time</span>
                            <span className="font-medium text-foreground">
                              {format(new Date(interviewDetails.scheduledAt), "EEEE, MMM d 'at' h:mm a")}
                            </span>
                          </div>
                        )}
                        {interviewDetails.durationMinutes && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Duration</span>
                            <span className="font-medium text-foreground">
                              {interviewDetails.durationMinutes} minutes
                            </span>
                          </div>
                        )}
                        {interviewDetails.meetingLink && (
                          <Button
                            variant="outline"
                            className="w-full mt-2 gap-2 border-primary/30 hover:bg-primary/10"
                            onClick={() => window.open(interviewDetails.meetingLink, "_blank")}
                          >
                            <ExternalLink className="h-4 w-4" />
                            Join Google Meet
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Action Buttons or Status Display */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="space-y-4"
                >
                  {/* Show different UI based on candidate response */}
                  {localCandidateResponse === "confirmed" ? (
                    // Already confirmed
                    <div className="bg-success/10 border border-success/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-success mb-2">
                        <CheckCircle className="h-5 w-5" />
                        <span className="font-medium">Interview Confirmed!</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        You're set. Just show up at the scheduled time and use the meeting link if one is provided.
                      </p>
                      {interviewDetails?.meetingLink && (
                        <Button
                          variant="outline"
                          className="w-full mt-3 gap-2 border-success/30 hover:bg-success/10"
                          onClick={() => window.open(interviewDetails.meetingLink, "_blank")}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Join Meeting
                        </Button>
                      )}
                    </div>
                  ) : localCandidateResponse === "reschedule_requested" ? (
                    // Reschedule requested - waiting for employer
                    <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-warning mb-2">
                        <Clock className="h-5 w-5" />
                        <span className="font-medium">Reschedule Requested</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        The employer has your new time options. You do not need to do anything else until they reply.
                      </p>
                    </div>
                  ) : interviewId && applicationId ? (
                    // Show action buttons
                    <div className="space-y-3">
                      <NextStepCallout
                        title="What happens next"
                        summary="The employer is ready to meet with you. Confirm this time if it works, or ask for a different slot if it does not."
                        steps={[
                          "Tap Confirm Interview if the time works for you.",
                          "Use Request Reschedule if you need a new time.",
                          "If there is a meeting link, join from this page at the scheduled time.",
                        ]}
                        tone="purple"
                      />
                      
                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                          onClick={handleConfirmInterview}
                          disabled={isConfirming}
                          className="flex-1 gap-2 bg-success hover:bg-success/90 text-success-foreground"
                        >
                          {isConfirming ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4" />
                          )}
                          Confirm Interview
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowRescheduleDialog(true)}
                          className="flex-1 gap-2"
                        >
                          <Calendar className="h-4 w-4" />
                          Request Reschedule
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Fallback: show old info section
                    <NextStepCallout
                      title="What happens next"
                      summary="Your interview details live on the application page. Open it when you are ready to confirm, reschedule, or join."
                      steps={[
                        "Confirm the time if it works for you.",
                        "Request a reschedule if you need a different slot.",
                        "Join the meeting when it is time.",
                      ]}
                      tone="purple"
                    />
                  )}
                </motion.div>

                {/* Close/Continue button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <Button onClick={onClose} variant="outline" className="gap-2">
                    {localCandidateResponse ? "Close" : "View Application"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </motion.div>
              </CardContent>
            </Card>
          )}
          
          {/* Reschedule Dialog */}
          {interviewId && applicationId && interviewDetails?.scheduledAt && (
            <CandidateRescheduleRequestDialog
              open={showRescheduleDialog}
              onOpenChange={setShowRescheduleDialog}
              interviewId={interviewId}
              applicationId={applicationId}
              currentScheduledAt={interviewDetails.scheduledAt}
              onSuccess={handleRescheduleSuccess}
            />
          )}

          {/* Ava Interview Unlocked State */}
          {state === "ava_interview_unlocked" && (
            <Card className="bg-card border-border overflow-hidden relative">
              {/* Animated sparkles background */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute"
                    initial={{ 
                      x: Math.random() * 100 + "%", 
                      y: Math.random() * 100 + "%",
                      opacity: 0,
                      scale: 0 
                    }}
                    animate={{ 
                      opacity: [0, 1, 0],
                      scale: [0, 1, 0],
                      rotate: [0, 180]
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: Math.random() * 2,
                      ease: "easeInOut"
                    }}
                  >
                    <AvaGlyph className="h-4 w-4 text-success/50" />
                  </motion.div>
                ))}
              </div>

              {/* Decorative top gradient */}
              <div className="h-2 bg-success/50" />

              <CardContent className="p-8 text-center space-y-6 relative z-10">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="mx-auto w-20 h-20 rounded-full bg-success/20 flex items-center justify-center"
                >
                  <motion.div
                    animate={{ 
                      scale: [1, 1.1, 1],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <Mic className="h-10 w-10 text-success" />
                  </motion.div>
                </motion.div>

                {/* Headline */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-2"
                >
                  <h2 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
                    🎉 Congratulations!
                  </h2>
                  <p className="text-success font-semibold text-lg">
                    You've Been Selected for an Ava Interview!
                  </p>
                </motion.div>

                {/* Message */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-muted-foreground leading-relaxed"
                >
                  The employer has reviewed your application and wants to learn more about you.
                  Your next step is a voice interview with Ava.
                </motion.p>

                {/* Job info */}
                {jobTitle && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-sm text-muted-foreground"
                  >
                    Position: <span className="text-foreground font-medium">{jobTitle}</span>
                  </motion.p>
                )}

                <NextStepCallout
                  title="What happens next"
                  summary="Nothing else is required right now. When you're ready, open your application and start the Ava interview."
                  steps={[
                    "Make sure you're in a quiet place before you begin.",
                    "Use the Start Ava Interview button from your application page.",
                    "Answer naturally and keep your responses clear and specific.",
                  ]}
                  tone="emerald"
                />

                {/* Action button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <Button
                    size="lg"
                    onClick={onClose}
                    className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    Start Ava Interview
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </motion.div>
              </CardContent>
            </Card>
          )}

          {/* Hired State - Premium Full-Screen Celebration */}
          {state === "hired" && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-50 overflow-hidden"
            >
              {/* Premium dark jade-to-brass gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-background via-primary/10 to-background" />
              
              {/* Animated floating particles - GPU accelerated */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {[...Array(20)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute will-change-transform"
                    style={{ 
                      left: `${Math.random() * 100}%`,
                      transform: 'translate3d(0, 0, 0)' // Force GPU layer
                    }}
                    initial={{ 
                      y: "110vh",
                      opacity: 0,
                    }}
                    animate={{ 
                      y: "-10vh",
                      opacity: [0, 0.8, 0.8, 0],
                    }}
                    transition={{
                      duration: 5 + Math.random() * 4,
                      repeat: Infinity,
                      delay: Math.random() * 4,
                      ease: "linear"
                    }}
                  >
                    {i % 3 === 0 ? (
                      <AvaGlyph className="h-4 w-4 text-primary/60" />
                    ) : i % 3 === 1 ? (
                      <AvaGlyph className="h-3 w-3 text-primary/50" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-primary/40" />
                    )}
                  </motion.div>
                ))}
              </div>

              {/* Main celebration content */}
              <div className="relative z-10 flex items-center justify-center min-h-screen p-6">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", duration: 0.8 }}
                  className="w-full max-w-lg"
                >
                  <Card className="backdrop-blur-xl bg-card/80 border-primary/30 shadow-2xl shadow-primary/20 overflow-hidden">
                    {/* Brass top border */}
                    <div className="h-1.5 bg-primary" />
                    
                    <CardContent className="p-8 text-center space-y-6">
                      {/* Animated trophy icon */}
                      <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", duration: 1, delay: 0.3 }}
                        className="relative"
                      >
                        <div className="mx-auto w-28 h-28 rounded-full bg-primary/30 flex items-center justify-center border-2 border-primary/50 shadow-lg shadow-primary/30">
                          <motion.div 
                            animate={{ 
                              scale: [1, 1.15, 1],
                              filter: ["brightness(1)", "brightness(1.4)", "brightness(1)"]
                            }} 
                            transition={{ duration: 2, repeat: Infinity }}
                          >
                            <Trophy className="h-14 w-14 text-primary" />
                          </motion.div>
                        </div>
                        
                        {/* Floating crown */}
                        <motion.div
                          initial={{ y: -10, opacity: 0 }}
                          animate={{ y: [-5, 5, -5], opacity: 1 }}
                          transition={{ y: { duration: 2, repeat: Infinity }, opacity: { delay: 0.5 } }}
                          className="absolute -top-4 left-1/2 -translate-x-1/2"
                        >
                          <Crown className="h-8 w-8 text-primary drop-shadow-lg" />
                        </motion.div>
                      </motion.div>

                      {/* Official badge */}
                      <motion.div
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.5 }}
                      >
                        <Badge className="bg-primary text-primary-foreground font-bold px-4 py-1.5 text-sm border-0 shadow-lg">
                          ✨ OFFICIAL TEAM MEMBER ✨
                        </Badge>
                      </motion.div>

                      {/* Headlines with staggered animation */}
                      <motion.h1 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="text-4xl font-extrabold text-primary"
                      >
                        🏆 CONGRATULATIONS! 🏆
                      </motion.h1>
                      
                      <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 }}
                        className="text-2xl font-bold text-foreground"
                      >
                        You're Officially Hired!
                      </motion.h2>

                      {/* Job & Company */}
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        className="space-y-1"
                      >
                        <p className="text-lg text-muted-foreground">as</p>
                        <p className="text-2xl font-bold text-primary">{jobTitle || "the position"}</p>
                        {companyName && (
                          <p className="text-muted-foreground">at {companyName}</p>
                        )}
                      </motion.div>

                      {/* Motivational message */}
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1 }}
                        className="pt-4 space-y-3"
                      >
                        <p className="text-foreground/90 leading-relaxed">
                          You have been hired. The employer should send onboarding details, start-date information, and any next forms soon.
                        </p>
                        <p className="text-muted-foreground text-sm italic">
                          "The beginning is always today." — Mary Shelley
                        </p>
                      </motion.div>

                      <NextStepCallout
                        title="What happens next"
                        summary="Your application is complete. The only thing left is onboarding from the employer."
                        steps={[
                          "Watch for a message with your start date or first-day instructions.",
                          "Check for any documents or forms you need to complete.",
                          "Reply quickly if the employer asks for anything else.",
                        ]}
                        tone="gold"
                      />

                      {/* CTA Button */}
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1.2 }}
                        className="pt-2"
                      >
                        <Button
                          size="lg"
                          onClick={onClose}
                          className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/30 px-8"
                        >
                          <AvaGlyph className="h-5 w-5" />
                          Start Your Journey
                          <ArrowRight className="h-5 w-5" />
                        </Button>
                      </motion.div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* Reconsidered State - Fresh Start Celebration */}
          {state === "reconsidered" && (
            <Card className="bg-card border-border overflow-hidden relative">
              {/* Animated sparkles background */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute"
                    initial={{ 
                      x: Math.random() * 100 + "%", 
                      y: Math.random() * 100 + "%",
                      opacity: 0,
                      scale: 0 
                    }}
                    animate={{ 
                      opacity: [0, 1, 0],
                      scale: [0, 1, 0],
                      rotate: [0, 180]
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: Math.random() * 2,
                      ease: "easeInOut"
                    }}
                  >
                    <AvaGlyph className="h-4 w-4 text-primary/50" />
                  </motion.div>
                ))}
              </div>

              {/* Decorative top gradient */}
              <div className="h-2 bg-primary/50" />

              <CardContent className="p-8 text-center space-y-6 relative z-10">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: [0, -10, 10, -10, 0] }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="mx-auto w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center"
                >
                  <motion.div
                    animate={{ 
                      scale: [1, 1.1, 1],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <AvaGlyph className="h-10 w-10 text-primary" />
                  </motion.div>
                </motion.div>

                {/* Headline */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-2"
                >
                  <h2 className="text-2xl font-bold text-foreground flex items-center justify-center gap-2">
                    🎉 Great News!
                  </h2>
                  <p className="text-primary font-semibold text-lg">
                    You're Being Reconsidered!
                  </p>
                </motion.div>

                {/* Message */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-muted-foreground leading-relaxed"
                >
                  The employer has decided to give you another chance for{" "}
                  <span className="text-foreground font-medium">{jobTitle || "this position"}</span>. 
                  Your application has been reset so you can start fresh from the beginning.
                </motion.p>

                {/* Instructions */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="bg-secondary border border-border rounded-lg p-4"
                >
                  <p className="text-sm text-muted-foreground">
                    Your application has been reopened, and you can start over from the beginning.
                  </p>
                </motion.div>

                <NextStepCallout
                  title="What happens next"
                  summary="You are being given another chance, so the application has been reset for you."
                  steps={[
                    "Open the application again from the job page.",
                    "Complete every step from the beginning.",
                    "Submit when you are ready.",
                  ]}
                  tone="blue"
                />

                {/* Action button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <Button
                    size="lg"
                    onClick={onClose}
                    className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    Restart Application
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </motion.div>

                {/* Motivational quote */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  className="pt-4 border-t border-border"
                >
                  <p className="text-sm text-muted-foreground italic">
                    "Every setback is a setup for a comeback."
                  </p>
                </motion.div>
              </CardContent>
            </Card>
          )}

          {/* Interview Cancelled State */}
          {state === "interview_cancelled" && (
            <Card className="bg-card border-border overflow-hidden">
              {/* Decorative top gradient - amber/warning */}
              <div className="h-2 bg-warning/50" />

              <CardContent className="p-8 text-center space-y-6">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="mx-auto w-20 h-20 rounded-full bg-warning/20 flex items-center justify-center"
                >
                  <XCircle className="h-10 w-10 text-warning" />
                </motion.div>

                {/* Headline */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-2"
                >
                  <h2 className="text-2xl font-bold text-foreground">
                    Interview Cancelled
                  </h2>
                  <p className="text-warning">
                    The employer has cancelled your scheduled interview
                  </p>
                </motion.div>

                {/* What's Next Section */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-left"
                >
                  <NextStepCallout
                    title="What happens next"
                    summary="The interview is off for now. You do not need to take any action unless the employer reaches out again."
                    steps={[
                      "Keep an eye on your messages for an update.",
                      "The employer may send a new interview time later.",
                      "You can close this screen for now.",
                    ]}
                    tone="amber"
                  />
                </motion.div>

                {/* Action button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <Button onClick={onClose} variant="outline" className="gap-2">
                    Got It
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </motion.div>
              </CardContent>
            </Card>
          )}

          {/* Interview Rescheduled State */}
          {state === "interview_rescheduled" && (
            <Card className="bg-card border-border overflow-hidden">
              {/* Decorative top gradient - brass/info */}
              <div className="h-2 bg-primary/50" />

              <CardContent className="p-8 text-center space-y-6">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: [0, -10, 10, 0] }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="mx-auto w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center"
                >
                  <RefreshCw className="h-10 w-10 text-primary" />
                </motion.div>

                {/* Headline */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="space-y-2"
                >
                  <h2 className="text-2xl font-bold text-foreground">
                    Interview Rescheduled
                  </h2>
                  <p className="text-primary">
                    The employer has changed your interview time
                  </p>
                </motion.div>

                {/* New Interview Details Card */}
                {interviewDetails && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <Card className="bg-primary/10 border-primary/30">
                      <CardContent className="p-4 space-y-3">
                        <p className="text-sm font-medium text-primary">📅 New Time:</p>
                        {interviewDetails.scheduledAt && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Date & Time</span>
                            <span className="font-medium text-foreground">
                              {format(new Date(interviewDetails.scheduledAt), "EEEE, MMM d 'at' h:mm a")}
                            </span>
                          </div>
                        )}
                        {interviewDetails.durationMinutes && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Duration</span>
                            <span className="font-medium text-foreground">
                              {interviewDetails.durationMinutes} minutes
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Guidance */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-muted-foreground text-sm"
                >
                  The interview time changed. Please review the new time below and confirm it from the interview card.
                </motion.p>

                <NextStepCallout
                  title="What happens next"
                  summary="Only the schedule changed. The interview is still active."
                  steps={[
                    "Review the new date and time.",
                    "Confirm the new slot if it works for you.",
                    "Request a reschedule if you cannot make it.",
                  ]}
                  tone="blue"
                />

                {/* Action button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <Button onClick={onClose} className="gap-2">
                    View Interview Details
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </motion.div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
