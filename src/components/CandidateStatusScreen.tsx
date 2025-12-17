import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Lightbulb, 
  Calendar, 
  PartyPopper, 
  Download, 
  ArrowRight,
  Sparkles,
  ExternalLink,
  X
} from "lucide-react";
import confetti from "canvas-confetti";
import { format } from "date-fns";
import { usePerformanceReport } from "@/hooks/usePerformanceReport";
import type { Tables } from "@/integrations/supabase/types";

type ApplicationData = Tables<"applications"> & {
  jobs: Tables<"jobs"> | null;
};

interface InterviewDetails {
  scheduledAt?: string;
  meetingLink?: string;
  durationMinutes?: number;
}

interface CandidateStatusScreenProps {
  state: "rejected" | "interview_scheduled" | "hired" | null;
  jobTitle?: string;
  companyName?: string;
  interviewDetails?: InterviewDetails;
  onClose: () => void;
  onDownloadReport?: () => void;
  isGeneratingReport?: boolean;
  // New prop for direct application data (used in phase components)
  applicationData?: ApplicationData;
  candidateId?: string;
}

export function CandidateStatusScreen({
  state,
  jobTitle,
  companyName,
  interviewDetails,
  onClose,
  onDownloadReport,
  isGeneratingReport: externalIsGenerating = false,
  applicationData,
  candidateId,
}: CandidateStatusScreenProps) {
  const { downloadReport, isGenerating: hookIsGenerating } = usePerformanceReport();
  
  // Use hook's loading state if we're using applicationData, otherwise use external
  const isGeneratingReport = applicationData ? hookIsGenerating : externalIsGenerating;
  
  // Handle report download - use hook if applicationData provided, otherwise use callback
  const handleDownloadReport = () => {
    if (applicationData) {
      downloadReport(applicationData, candidateId);
    } else if (onDownloadReport) {
      onDownloadReport();
    }
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
    } else if (state === "hired" && showContent) {
      // Epic celebration for hired
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 7,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.6 },
          colors: ['#10B981', '#34D399', '#6EE7B7', '#FFD700', '#FCD34D'],
        });
        confetti({
          particleCount: 7,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.6 },
          colors: ['#10B981', '#34D399', '#6EE7B7', '#FFD700', '#FCD34D'],
        });

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
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-background/95 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", duration: 0.5 }}
          className="relative z-10 w-full max-w-lg"
        >
          {/* Close button */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute -top-2 -right-2 z-20 rounded-full bg-card border border-border"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>

          {/* Rejected State */}
          {state === "rejected" && (
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
                  every interview is a stepping stone. We've prepared a personalized report to help you grow.
                </motion.p>

                {/* Report Download CTA */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="pt-2"
                >
                  <Button
                    size="lg"
                    onClick={handleDownloadReport}
                    disabled={isGeneratingReport}
                    className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0"
                  >
                    {isGeneratingReport ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        >
                          <Download className="h-5 w-5" />
                        </motion.div>
                        Generating Report...
                      </>
                    ) : (
                      <>
                        <Download className="h-5 w-5" />
                        Get Your Performance Report
                      </>
                    )}
                  </Button>
                </motion.div>

                {/* Motivational quote */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="pt-4 border-t border-border"
                >
                  <p className="text-sm text-muted-foreground italic">
                    "Success is not final, failure is not fatal: it is the courage to continue that counts."
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    The best is yet to come. Keep going!
                  </p>
                </motion.div>
              </CardContent>
            </Card>
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

                {/* Encouragement */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-muted-foreground"
                >
                  Prepare, breathe, and show them what you've got!
                </motion.p>

                {/* Action button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                >
                  <Button onClick={onClose} className="gap-2">
                    View Details
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </motion.div>
              </CardContent>
            </Card>
          )}

          {/* Hired State */}
          {state === "hired" && (
            <Card className="bg-card border-border overflow-hidden relative">
              {/* Animated sparkles background */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[...Array(12)].map((_, i) => (
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
                    <Sparkles className="h-4 w-4 text-yellow-400/50" />
                  </motion.div>
                ))}
              </div>

              {/* Decorative top gradient */}
              <div className="h-2 bg-gradient-to-r from-emerald-500/50 via-yellow-500/50 to-emerald-500/50" />
              
              <CardContent className="p-8 text-center space-y-6 relative z-10">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", delay: 0.2, duration: 0.8 }}
                  className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500/30 to-yellow-500/30 flex items-center justify-center"
                >
                  <motion.div
                    animate={{ 
                      scale: [1, 1.1, 1],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <PartyPopper className="h-12 w-12 text-emerald-400" />
                  </motion.div>
                </motion.div>

                {/* Headline */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="space-y-2"
                >
                  <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 via-yellow-400 to-emerald-400 bg-clip-text text-transparent">
                    🎊 Welcome Aboard! 🎊
                  </h2>
                  <p className="text-xl text-foreground font-semibold">
                    Congratulations!
                  </p>
                </motion.div>

                {/* Message */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="space-y-2"
                >
                  <p className="text-lg text-muted-foreground">
                    You've been selected for
                  </p>
                  <p className="text-xl font-bold text-foreground">
                    {jobTitle || "the position"}
                  </p>
                  {companyName && (
                    <p className="text-muted-foreground">at {companyName}</p>
                  )}
                </motion.div>

                {/* Encouragement */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="text-muted-foreground leading-relaxed"
                >
                  Your new journey begins now. We can't wait to see what you'll accomplish!
                </motion.p>

                {/* Action button */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                >
                  <Button 
                    size="lg" 
                    onClick={onClose} 
                    className="gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
                  >
                    Continue
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