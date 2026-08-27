import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Lightbulb,
  Calendar,
  ArrowRight,
  ExternalLink,
  X,
  XCircle,
  RefreshCw,
  CheckCircle,
  Clock,
  Loader2,
  Download,
  Lock,
} from "lucide-react";
import { format } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CandidateRescheduleRequestDialog } from "@/components/CandidateRescheduleRequestDialog";
import { AvaSeal } from "@/components/ava/AvaSeal";
import { useImprovementBlueprint, BLUEPRINT_PRICE_FORMATTED } from "@/hooks/useImprovementBlueprint";

/* ── Shared pieces ──────────────────────────────────────────────────────
   Every state is the same shell: a quiet icon mark, one Fraunces headline
   (the moment), one warm sentence, quiet supporting details, and a single
   jade primary action. No competing cards, no rainbow tones, no confetti —
   the seal-press payoff carries the celebration. */

type Mood = "jade" | "brass" | "amber" | "crit" | "neutral";

const moodBg: Record<Mood, string> = {
  jade: "var(--jade-soft)",
  brass: "var(--amber-bg)", // brass has no soft fill token; amber-bg reads as warm parchment, not alarm
  amber: "var(--amber-bg)",
  crit: "var(--crit-bg)",
  neutral: "var(--surface-2)",
};

const moodFg: Record<Mood, string> = {
  jade: "var(--jade-soft-fg)",
  brass: "var(--brass)",
  amber: "var(--amber-fg)",
  crit: "var(--crit)",
  neutral: "var(--ink-2)",
};

function StatusMark({ icon: Icon, mood }: { icon: typeof CheckCircle; mood: Mood }) {
  return (
    <div
      className="mx-auto flex h-14 w-14 items-center justify-center rounded-full"
      style={{ background: moodBg[mood] }}
    >
      <Icon className="h-6 w-6" style={{ color: moodFg[mood] }} />
    </div>
  );
}

/** The row-based "Date & time / Duration / Join" card, shared by the
 *  scheduled and rescheduled states so the new time always reads the same. */
function InterviewDetailsCard({
  details,
  label,
}: {
  details: { scheduledAt?: string; meetingLink?: string; durationMinutes?: number };
  label?: string;
}) {
  return (
    <Card className="border-border bg-secondary/40">
      <CardContent className="space-y-2.5 p-4">
        {label && (
          <p className="text-xs font-medium uppercase tracking-[0.06em]" style={{ color: "var(--ink-3)" }}>
            {label}
          </p>
        )}
        {details.scheduledAt && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Date &amp; time</span>
            <span className="font-display ck-num text-sm font-medium text-foreground">
              {format(new Date(details.scheduledAt), "EEEE, MMM d 'at' h:mm a")}
            </span>
          </div>
        )}
        {details.durationMinutes && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Duration</span>
            <span className="font-display ck-num text-sm font-medium text-foreground">
              {details.durationMinutes} minutes
            </span>
          </div>
        )}
        {details.meetingLink && (
          <Button
            variant="outline"
            className="mt-1 w-full gap-2"
            onClick={() => window.open(details.meetingLink, "_blank")}
          >
            <ExternalLink className="h-4 w-4" />
            Join meeting
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Rejected — with the optional, paid Improvement Blueprint upsell ───── */

function RejectedStateCard({ jobTitle, applicationId }: { jobTitle?: string; applicationId?: string }) {
  const {
    downloadBlueprint,
    isGenerating,
    purchaseBlueprint,
    isPurchasing,
    checkPurchaseStatus,
    isCheckingPurchase,
    hasPurchased,
    verifyPurchase,
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
      <CardContent className="space-y-6 p-8 text-center">
        <StatusMark icon={XCircle} mood="crit" />

        <div className="space-y-2">
          <h2 className="font-display ck-ink text-2xl text-foreground sm:text-3xl">Not a match this time</h2>
          <p className="text-sm text-muted-foreground">
            {jobTitle ? (
              <>
                The <span className="font-medium text-foreground">{jobTitle}</span> role wasn&apos;t the right fit
                — there&apos;s always the next one.
              </>
            ) : (
              "This one wasn't the right fit — there's always the next one."
            )}
          </p>
        </div>

        {/* Improvement Blueprint — a paid upsell, so it reads as brass (money), never the primary jade action */}
        {applicationId && (
          <div className="space-y-3 border-t border-border pt-6 text-left">
            <div className="flex items-start gap-3">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--brass)" }} />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Improvement Blueprint</p>
                <p className="text-sm text-muted-foreground">
                  A personalized coaching guide with concrete steps to strengthen your next application.
                </p>
              </div>
            </div>

            {isCheckingPurchase ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking…
              </div>
            ) : hasPurchased ? (
              <Button onClick={handleDownload} disabled={isGenerating} className="w-full gap-2">
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Preparing your blueprint…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Download blueprint
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handlePurchase}
                disabled={isPurchasing}
                variant="outline"
                className="w-full gap-2"
                style={{ borderColor: "var(--brass-line)", color: "var(--brass)" }}
              >
                {isPurchasing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting checkout…
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Unlock for {BLUEPRINT_PRICE_FORMATTED}
                  </>
                )}
              </Button>
            )}
          </div>
        )}
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
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.28, ease: [0.2, 0.7, 0.3, 1] }}
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

          {/* Rejected State */}
          {state === "rejected" && (
            <RejectedStateCard jobTitle={jobTitle} applicationId={applicationId} />
          )}

          {/* Interview Scheduled State */}
          {state === "interview_scheduled" && (
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="space-y-6 p-8 text-center">
                <StatusMark icon={Calendar} mood="jade" />

                <div className="space-y-2">
                  <h2 className="font-display ck-ink text-2xl text-foreground sm:text-3xl">
                    You&apos;re invited to interview
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {companyName ? `${companyName} wants to meet you.` : "The hiring team wants to meet you."}
                  </p>
                </div>

                {interviewDetails && <InterviewDetailsCard details={interviewDetails} />}

                {/* Show different UI based on candidate response */}
                {localCandidateResponse === "confirmed" ? (
                  <div className="rounded-lg p-4 text-left" style={{ background: "var(--jade-soft)" }}>
                    <div className="mb-1.5 flex items-center gap-2" style={{ color: "var(--jade-soft-fg)" }}>
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Interview confirmed</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      You&apos;re set — just show up at the scheduled time and use the meeting link above if one was
                      provided.
                    </p>
                  </div>
                ) : localCandidateResponse === "reschedule_requested" ? (
                  <div className="rounded-lg p-4 text-left" style={{ background: "var(--amber-bg)" }}>
                    <div className="mb-1.5 flex items-center gap-2" style={{ color: "var(--amber-fg)" }}>
                      <Clock className="h-4 w-4" />
                      <span className="text-sm font-medium">Reschedule requested</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      The employer has your new time options — you don&apos;t need to do anything else until they
                      reply.
                    </p>
                  </div>
                ) : interviewId && applicationId ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Confirm this time if it works, or ask for a different slot.
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button onClick={handleConfirmInterview} disabled={isConfirming} className="flex-1 gap-2">
                        {isConfirming ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4" />
                        )}
                        Confirm interview
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowRescheduleDialog(true)}
                        className="flex-1 gap-2"
                      >
                        <Calendar className="h-4 w-4" />
                        Request reschedule
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Open your application when you&apos;re ready to confirm, reschedule, or join.
                  </p>
                )}

                <Button onClick={onClose} variant="outline" className="gap-2">
                  {localCandidateResponse ? "Close" : "View application"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
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

          {/* Voice Interview Unlocked State */}
          {state === "ava_interview_unlocked" && (
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="space-y-6 p-8 text-center">
                <AvaSeal size={44} tilt={-3} className="ck-seal-press mx-auto" />

                <div className="space-y-2">
                  <h2 className="font-display ck-ink text-2xl text-foreground sm:text-3xl">
                    You&apos;re moving to a voice interview
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    The hiring team reviewed your application and wants to hear from you directly.
                    {jobTitle && (
                      <>
                        {" "}
                        Position: <span className="font-medium text-foreground">{jobTitle}</span>.
                      </>
                    )}
                  </p>
                </div>

                <p className="text-sm text-muted-foreground">
                  Find somewhere quiet, then start when you&apos;re ready — answer naturally, out loud.
                </p>

                <Button size="lg" onClick={onClose} className="gap-2">
                  Start voice interview
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Hired State */}
          {state === "hired" && (
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="space-y-6 p-8 text-center">
                <AvaSeal size={48} tilt={-3} className="ck-seal-press mx-auto" />

                <div className="space-y-2">
                  <h2 className="font-display ck-ink text-3xl text-foreground sm:text-4xl">You&apos;re hired</h2>
                  <p className="text-sm text-muted-foreground">
                    as <span className="font-medium text-foreground">{jobTitle || "the role"}</span>
                    {companyName && <> at {companyName}</>}
                  </p>
                </div>

                <p className="text-sm text-muted-foreground">
                  Congratulations — the employer will follow up with your start date and any next steps.
                </p>

                <Button size="lg" onClick={onClose} className="gap-2">
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Reconsidered State */}
          {state === "reconsidered" && (
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="space-y-6 p-8 text-center">
                <StatusMark icon={RefreshCw} mood="jade" />

                <div className="space-y-2">
                  <h2 className="font-display ck-ink text-2xl text-foreground sm:text-3xl">
                    You&apos;re back in the running
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    The employer is giving{" "}
                    <span className="font-medium text-foreground">{jobTitle || "this application"}</span> another
                    look. Your application has been reset, so you&apos;ll start again from the beginning.
                  </p>
                </div>

                <Button size="lg" onClick={onClose} className="gap-2">
                  Restart application
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Interview Cancelled State */}
          {state === "interview_cancelled" && (
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="space-y-6 p-8 text-center">
                <StatusMark icon={XCircle} mood="amber" />

                <div className="space-y-2">
                  <h2 className="font-display ck-ink text-2xl text-foreground sm:text-3xl">Interview cancelled</h2>
                  <p className="text-sm text-muted-foreground">
                    The employer cancelled your scheduled interview. You don&apos;t need to do anything — watch for
                    a new time if they reach out again.
                  </p>
                </div>

                <Button onClick={onClose} variant="outline" className="gap-2">
                  Got it
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Interview Rescheduled State */}
          {state === "interview_rescheduled" && (
            <Card className="bg-card border-border overflow-hidden">
              <CardContent className="space-y-6 p-8 text-center">
                <StatusMark icon={RefreshCw} mood="amber" />

                <div className="space-y-2">
                  <h2 className="font-display ck-ink text-2xl text-foreground sm:text-3xl">Interview rescheduled</h2>
                  <p className="text-sm text-muted-foreground">
                    The employer changed your interview time. Review it below and confirm from the interview card.
                  </p>
                </div>

                {interviewDetails && <InterviewDetailsCard details={interviewDetails} label="New time" />}

                <Button onClick={onClose} className="gap-2">
                  Review new time
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
