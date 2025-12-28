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
  Sparkles,
  ExternalLink,
  X,
  Mic,
  Trophy,
  Star,
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
      <div className="h-2 bg-gradient-to-r from-amber-500/50 via-orange-500/50 to-amber-500/50" />
      
      <CardContent className="p-8 text-center space-y-6">
        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.2 }}
          className="mx-auto w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center"
        >
          <Lightbulb className="h-10 w-10 text-amber-500" />
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
            <div className="flex items-center justify-center gap-2 text-amber-500">
              <Star className="h-4 w-4 fill-amber-500/30" />
              <span className="text-sm font-medium">Get Your Improvement Blueprint</span>
              <Star className="h-4 w-4 fill-amber-500/30" />
            </div>
            
            <p className="text-sm text-muted-foreground">
              A personalized coaching guide with actionable steps to strengthen your next application.
            </p>

            {isCheckingPurchase ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                <span className="text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : hasPurchased ? (
              <Button 
                onClick={handleDownload} 
                disabled={isGenerating}
                className={cn(
                  "gap-2",
                  "bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 bg-[length:200%_100%]",
                  "hover:bg-[position:100%_0] transition-all duration-500",
                  "text-white font-semibold border-0",
                  "shadow-lg shadow-amber-500/25"
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
                  "bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 bg-[length:200%_100%]",
                  "hover:bg-[position:100%_0] transition-all duration-500",
                  "text-white font-semibold border-0",
                  "shadow-lg shadow-amber-500/25"
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
                    <Sparkles className="h-4 w-4" />
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
      const { error } = await supabase.functions.invoke("candidate-interview-response", {
        body: {
          type: "confirm",
          interviewId,
        },
      });
      
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
        colors: ['#8B5CF6', '#A78BFA', '#C4B5FD', '#60A5FA', '#93C5FD'],
      });
    } else if (state === "ava_interview_unlocked" && showContent) {
      // Premium celebration with emerald/teal colors for Ava Interview
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#10B981', '#14B8A6', '#06B6D4', '#8B5CF6', '#A78BFA'],
      });
    } else if (state === "reconsidered" && showContent) {
      // Celebration for reconsideration - blue/cyan colors for fresh start
      confetti({
        particleCount: 120,
        spread: 75,
        origin: { y: 0.6 },
        colors: ['#3B82F6', '#60A5FA', '#93C5FD', '#06B6D4', '#22D3EE'],
      });
    } else if (state === "hired" && showContent) {
      // Epic 5-second multi-burst celebration with golden colors
      const duration = 5000;
      const end = Date.now() + duration;
      let lastCenterBurst = 0;

      const frame = () => {
        // Golden confetti from left
        confetti({
          particleCount: 5,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.6 },
          colors: ['#F59E0B', '#FBBF24', '#FCD34D', '#FDE68A', '#FFD700'],
          shapes: ['circle', 'square'],
          gravity: 0.8,
        });
        
        // Golden confetti from right
        confetti({
          particleCount: 5,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.6 },
          colors: ['#F59E0B', '#FBBF24', '#FCD34D', '#FDE68A', '#FFD700'],
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
            colors: ['#F59E0B', '#FBBF24', '#FCD34D', '#FFFFFF', '#FFD700'],
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
              <div className="h-2 bg-gradient-to-r from-purple-500/50 via-blue-500/50 to-purple-500/50" />
              
              <CardContent className="p-8 text-center space-y-6">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: [0, -10, 10, -10, 0] }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="mx-auto w-20 h-20 rounded-full bg-purple-500/20 flex items-center justify-center"
                >
                  <Calendar className="h-10 w-10 text-purple-500" />
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
                  <p className="text-purple-400">
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
                    <Card className="bg-purple-500/10 border-purple-500/30">
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
                            className="w-full mt-2 gap-2 border-purple-500/30 hover:bg-purple-500/10"
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
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-emerald-400 mb-2">
                        <CheckCircle className="h-5 w-5" />
                        <span className="font-medium">Interview Confirmed!</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        You're all set. We'll see you at the scheduled time.
                      </p>
                      {interviewDetails?.meetingLink && (
                        <Button
                          variant="outline"
                          className="w-full mt-3 gap-2 border-emerald-500/30 hover:bg-emerald-500/10"
                          onClick={() => window.open(interviewDetails.meetingLink, "_blank")}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Join Meeting
                        </Button>
                      )}
                    </div>
                  ) : localCandidateResponse === "reschedule_requested" ? (
                    // Reschedule requested - waiting for employer
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-amber-400 mb-2">
                        <Clock className="h-5 w-5" />
                        <span className="font-medium">Reschedule Requested</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        The employer is reviewing your proposed times. You'll be notified once they respond.
                      </p>
                    </div>
                  ) : interviewId && applicationId ? (
                    // Show action buttons
                    <div className="space-y-3">
                      <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4 text-left">
                        <div className="flex items-start gap-2 mb-2">
                          <Info className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                          <p className="text-sm font-medium text-foreground">Confirm Your Attendance</p>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Please confirm this time works for you, or request a different time if needed.
                        </p>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                          onClick={handleConfirmInterview}
                          disabled={isConfirming}
                          className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700"
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
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4 text-left">
                      <div className="flex items-start gap-2 mb-2">
                        <Info className="h-4 w-4 text-purple-400 mt-0.5 shrink-0" />
                        <p className="text-sm font-medium text-foreground">What's Next?</p>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Your interview details are on your application page. From there you can:
                      </p>
                      <ul className="text-sm text-muted-foreground mt-2 space-y-1 ml-4 list-disc">
                        <li>Confirm your attendance</li>
                        <li>Request a reschedule if needed</li>
                        <li>Join the meeting when it's time</li>
                      </ul>
                    </div>
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
                    <Sparkles className="h-4 w-4 text-emerald-400/50" />
                  </motion.div>
                ))}
              </div>

              {/* Decorative top gradient */}
              <div className="h-2 bg-gradient-to-r from-emerald-500/50 via-teal-500/50 to-cyan-500/50" />
              
              <CardContent className="p-8 text-center space-y-6 relative z-10">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="mx-auto w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center"
                >
                  <motion.div
                    animate={{ 
                      scale: [1, 1.1, 1],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <Mic className="h-10 w-10 text-emerald-400" />
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
                  <p className="text-emerald-400 font-semibold text-lg">
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
                  Ava, our AI interviewer, will conduct a voice interview to help showcase your skills.
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

                {/* Action button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <Button 
                    size="lg"
                    onClick={onClose} 
                    className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
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
              {/* Premium dark-to-gold gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-amber-950/20 to-slate-900" />
              
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
                      <Star className="h-4 w-4 text-amber-400/60" />
                    ) : i % 3 === 1 ? (
                      <Sparkles className="h-3 w-3 text-yellow-300/50" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-amber-400/40" />
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
                  <Card className="backdrop-blur-xl bg-slate-900/80 border-amber-500/30 shadow-2xl shadow-amber-500/20 overflow-hidden">
                    {/* Golden top border */}
                    <div className="h-1.5 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />
                    
                    <CardContent className="p-8 text-center space-y-6">
                      {/* Animated trophy icon */}
                      <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", duration: 1, delay: 0.3 }}
                        className="relative"
                      >
                        <div className="mx-auto w-28 h-28 rounded-full bg-gradient-to-br from-amber-400/30 to-yellow-600/30 flex items-center justify-center border-2 border-amber-500/50 shadow-lg shadow-amber-500/30">
                          <motion.div 
                            animate={{ 
                              scale: [1, 1.15, 1],
                              filter: ["brightness(1)", "brightness(1.4)", "brightness(1)"]
                            }} 
                            transition={{ duration: 2, repeat: Infinity }}
                          >
                            <Trophy className="h-14 w-14 text-amber-400" />
                          </motion.div>
                        </div>
                        
                        {/* Floating crown */}
                        <motion.div
                          initial={{ y: -10, opacity: 0 }}
                          animate={{ y: [-5, 5, -5], opacity: 1 }}
                          transition={{ y: { duration: 2, repeat: Infinity }, opacity: { delay: 0.5 } }}
                          className="absolute -top-4 left-1/2 -translate-x-1/2"
                        >
                          <Crown className="h-8 w-8 text-yellow-400 drop-shadow-lg" />
                        </motion.div>
                      </motion.div>

                      {/* Official badge */}
                      <motion.div
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.5 }}
                      >
                        <Badge className="bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-900 font-bold px-4 py-1.5 text-sm border-0 shadow-lg">
                          ✨ OFFICIAL TEAM MEMBER ✨
                        </Badge>
                      </motion.div>

                      {/* Headlines with staggered animation */}
                      <motion.h1 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="text-4xl font-extrabold bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 bg-clip-text text-transparent"
                      >
                        🏆 CONGRATULATIONS! 🏆
                      </motion.h1>
                      
                      <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7 }}
                        className="text-2xl font-bold text-white"
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
                        <p className="text-lg text-amber-200/80">as</p>
                        <p className="text-2xl font-bold text-amber-100">{jobTitle || "the position"}</p>
                        {companyName && (
                          <p className="text-amber-300/70">at {companyName}</p>
                        )}
                      </motion.div>

                      {/* Motivational message */}
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 1 }}
                        className="pt-4 space-y-3"
                      >
                        <p className="text-amber-100/90 leading-relaxed">
                          Your talent, dedication, and perseverance have earned you this incredible moment.
                        </p>
                        <p className="text-amber-200/70 text-sm italic">
                          "The beginning is always today." — Mary Shelley
                        </p>
                      </motion.div>

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
                          className="gap-2 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-slate-900 font-bold shadow-lg shadow-amber-500/30 px-8"
                        >
                          <Sparkles className="h-5 w-5" />
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
                    <Sparkles className="h-4 w-4 text-blue-400/50" />
                  </motion.div>
                ))}
              </div>

              {/* Decorative top gradient */}
              <div className="h-2 bg-gradient-to-r from-blue-500/50 via-cyan-500/50 to-blue-500/50" />
              
              <CardContent className="p-8 text-center space-y-6 relative z-10">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: [0, -10, 10, -10, 0] }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="mx-auto w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center"
                >
                  <motion.div
                    animate={{ 
                      scale: [1, 1.1, 1],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <Sparkles className="h-10 w-10 text-blue-400" />
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
                  <p className="text-blue-400 font-semibold text-lg">
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
                  className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4"
                >
                  <p className="text-sm text-muted-foreground">
                    This is your fresh start! Click below to restart your application and complete all the steps again. 
                    Good luck!
                  </p>
                </motion.div>

                {/* Action button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <Button 
                    size="lg"
                    onClick={onClose} 
                    className="gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600"
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
              <div className="h-2 bg-gradient-to-r from-amber-500/50 via-orange-500/50 to-amber-500/50" />
              
              <CardContent className="p-8 text-center space-y-6">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="mx-auto w-20 h-20 rounded-full bg-amber-500/20 flex items-center justify-center"
                >
                  <XCircle className="h-10 w-10 text-amber-500" />
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
                  <p className="text-amber-400">
                    The employer has cancelled your scheduled interview
                  </p>
                </motion.div>

                {/* What's Next Section */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-left"
                >
                  <p className="text-sm font-medium text-foreground mb-2">What's Next?</p>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2">
                      <span>•</span>
                      <span>Check your messages for more information from the employer</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span>•</span>
                      <span>The employer may reach out to reschedule or provide next steps</span>
                    </li>
                  </ul>
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
              {/* Decorative top gradient - blue/info */}
              <div className="h-2 bg-gradient-to-r from-blue-500/50 via-purple-500/50 to-blue-500/50" />
              
              <CardContent className="p-8 text-center space-y-6">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: [0, -10, 10, 0] }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="mx-auto w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center"
                >
                  <RefreshCw className="h-10 w-10 text-blue-500" />
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
                  <p className="text-blue-400">
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
                    <Card className="bg-blue-500/10 border-blue-500/30">
                      <CardContent className="p-4 space-y-3">
                        <p className="text-sm font-medium text-blue-400">📅 New Time:</p>
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
                  Please confirm your availability for the new time from your Interview card below.
                </motion.p>

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