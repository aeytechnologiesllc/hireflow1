import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Hand, Info, Loader2, Rocket, ShieldAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUpdateJob } from "@/hooks/useJobs";
import {
  applyAutopilotCatchUp,
  getAutopilotImpactPreview,
  type AutopilotImpactApplicant,
  type AutopilotImpactPreview,
} from "@/utils/autopilotBatch";

interface ProcessingModeToggleProps {
  jobId: string;
  jobTitle: string;
  currentMode: "auto" | "manual";
  disabled?: boolean;
  onModeActivated?: (mode: "auto" | "manual") => void;
}

const actionMeta = {
  reject: {
    title: "Will reject now",
    description: "These applicants already hit a hard fail or are below threshold with enough evidence collected.",
    accent: "text-red-400",
    border: "border-red-500/20",
    bg: "bg-red-500/5",
    score: "text-red-300",
  },
  advance: {
    title: "Will advance now",
    description: "These applicants already meet the current evidence threshold and are ready for the next step.",
    accent: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/5",
    score: "text-emerald-300",
  },
  defer: {
    title: "Will continue gathering evidence",
    description: "Ava will move these applicants forward because later high-signal phases are still needed before a final decision.",
    accent: "text-amber-300",
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    score: "text-amber-200",
  },
  review: {
    title: "Needs employer setup",
    description: "These applicants cannot be fully auto-processed yet, usually because the next phase requires employer configuration.",
    accent: "text-sky-300",
    border: "border-sky-500/20",
    bg: "bg-sky-500/5",
    score: "text-sky-200",
  },
} as const;

function ImpactSection({
  action,
  applicants,
}: {
  action: keyof typeof actionMeta;
  applicants: AutopilotImpactApplicant[];
}) {
  if (applicants.length === 0) return null;

  const meta = actionMeta[action];

  return (
    <div className={cn("rounded-lg border p-4", meta.border, meta.bg)}>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h4 className={cn("font-medium", meta.accent)}>{meta.title}</h4>
          <Badge variant="outline" className="text-[11px]">
            {applicants.length}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{meta.description}</p>
      </div>

      <ScrollArea className="mt-3 max-h-[160px]">
        <div className="space-y-2">
          {applicants.map((applicant) => (
            <div
              key={applicant.applicationId}
              className="flex items-start justify-between gap-3 rounded-md bg-background/60 px-3 py-2"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="truncate text-sm font-medium text-foreground">{applicant.candidateName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {applicant.pendingHighSignalPhases?.length
                    ? `Pending: ${applicant.pendingHighSignalPhases.join(", ")}`
                    : applicant.rationale || applicant.currentPhaseId}
                </div>
              </div>
              {typeof applicant.score === "number" && (
                <div className={cn("shrink-0 text-sm font-semibold", meta.score)}>
                  {Math.round(applicant.score)}%
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export function ProcessingModeToggle({
  jobId,
  jobTitle,
  currentMode,
  disabled,
  onModeActivated,
}: ProcessingModeToggleProps) {
  const queryClient = useQueryClient();
  const updateJob = useUpdateJob();
  const [showDialog, setShowDialog] = useState(false);
  const [pendingMode, setPendingMode] = useState<"auto" | "manual" | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<AutopilotImpactPreview | null>(null);

  const groupedPreview = useMemo(() => {
    const applicants = preview?.applicants || [];
    return {
      reject: applicants.filter((applicant) => applicant.action === "reject"),
      advance: applicants.filter((applicant) => applicant.action === "advance"),
      defer: applicants.filter((applicant) => applicant.action === "defer"),
      review: applicants.filter((applicant) => applicant.action === "review"),
    };
  }, [preview]);

  const handleButtonClick = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (disabled) return;

    const nextMode = currentMode === "auto" ? "manual" : "auto";
    setPendingMode(nextMode);
    setPreview(null);

    if (nextMode === "auto") {
      setLoadingPreview(true);
      try {
        const previewResult = await getAutopilotImpactPreview(jobId);
        setPreview(previewResult);
      } catch (error) {
        console.error("Failed to load autopilot preview:", error);
        toast.error("Failed to load autopilot preview");
      } finally {
        setLoadingPreview(false);
      }
    }

    setShowDialog(true);
  };

  const handleCancel = () => {
    setShowDialog(false);
    setPendingMode(null);
    setPreview(null);
    setLoadingPreview(false);
  };

  const handleConfirm = async () => {
    if (!pendingMode) return;

    try {
      await updateJob.mutateAsync({
        id: jobId,
        processing_mode: pendingMode,
      });

      setShowDialog(false);
      onModeActivated?.(pendingMode);

      if (pendingMode === "auto") {
        let result: Awaited<ReturnType<typeof applyAutopilotCatchUp>> | null = null;
        try {
          result = await applyAutopilotCatchUp(jobId);
        } catch (error) {
          console.error("Autopilot catch-up failed after mode update:", error);
          toast.error("Autopilot turned on, but the catch-up pass failed.", {
            description: "Open the applicant list and refresh recommendations, then try engaging autopilot again if needed.",
            duration: 6000,
          });
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["applications"] }),
            queryClient.invalidateQueries({ queryKey: ["application"] }),
            queryClient.invalidateQueries({ queryKey: ["jobs"] }),
          ]);
          return;
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["applications"] }),
          queryClient.invalidateQueries({ queryKey: ["application"] }),
          queryClient.invalidateQueries({ queryKey: ["jobs"] }),
        ]);

        const summaryParts = [
          result.totals.reject ? `${result.totals.reject} rejected` : null,
          result.totals.advance ? `${result.totals.advance} advanced` : null,
          result.totals.defer ? `${result.totals.defer} gathering more evidence` : null,
          result.totals.review ? `${result.totals.review} need setup` : null,
        ].filter(Boolean);

        if (summaryParts.length > 0) {
          toast.success(`Autopilot catch-up complete: ${summaryParts.join(" • ")}`);
        } else if (result.totals.processed > 0) {
          toast.info("Autopilot reviewed waiting applicants with no immediate status changes.");
        } else {
          toast.info("Autopilot is on. No waiting applicants needed catch-up.");
        }

        if (result.totals.failed > 0) {
          toast.error(`Autopilot had trouble updating ${result.totals.failed} applicant${result.totals.failed > 1 ? "s" : ""}.`, {
            description: "Please reopen those applicant details and refresh the recommendation.",
            duration: 6000,
          });
        }
      } else {
        toast.success("Manual mode engaged. Ava will stop moving applicants automatically.");
      }
    } catch (error) {
      console.error("Failed to update processing mode:", error);
      toast.error("Failed to update processing mode");
    } finally {
      setPendingMode(null);
      setPreview(null);
      setLoadingPreview(false);
    }
  };

  return (
    <>
      <motion.button
        onClick={handleButtonClick}
        disabled={disabled}
        className={cn(
          "relative flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-300 disabled:opacity-50",
          currentMode === "auto"
            ? "border-purple-500/30 bg-purple-500/10 text-purple-100 hover:bg-purple-500/15"
            : "border-orange-500/30 bg-orange-500/10 text-orange-100 hover:bg-orange-500/15",
        )}
        whileHover={disabled ? {} : { scale: 1.02 }}
        whileTap={disabled ? {} : { scale: 0.98 }}
      >
        {currentMode === "auto" ? (
          <>
            <motion.div
              className="rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-600 p-1.5 text-white"
              animate={{ y: [0, -2, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <Rocket className="h-3.5 w-3.5" />
            </motion.div>
            <span>Take Control</span>
          </>
        ) : (
          <>
            <motion.div
              className="rounded-full bg-gradient-to-r from-orange-500 to-amber-600 p-1.5 text-white"
              animate={{ rotate: [0, -8, 8, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <Hand className="h-3.5 w-3.5" />
            </motion.div>
            <span>Engage Autopilot</span>
          </>
        )}
      </motion.button>

      <Dialog open={showDialog} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className={cn("sm:max-w-md", pendingMode === "auto" && "sm:max-w-2xl")} onClick={(event) => event.stopPropagation()}>
          <AnimatePresence mode="wait">
            {pendingMode === "auto" ? (
              <motion.div
                key="autopilot"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <DialogHeader className="pb-4 text-center">
                  <motion.div
                    className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white shadow-xl"
                    animate={{ y: [0, -6, 0], scale: [1, 1.03, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Rocket className="h-8 w-8" />
                  </motion.div>
                  <DialogTitle className="text-xl">Engage Autopilot Mode?</DialogTitle>
                  <DialogDescription className="mt-2 text-center">
                    Ava will pick up from the current applicant state, apply the same evidence-gated rule to everyone waiting,
                    and keep moving candidates only when enough evidence exists.
                  </DialogDescription>
                </DialogHeader>

                {loadingPreview ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Building autopilot impact preview...
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                        <div className="text-2xl font-semibold text-red-400">{preview?.totals.reject || 0}</div>
                        <div className="text-sm text-muted-foreground">Will reject now</div>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                        <div className="text-2xl font-semibold text-emerald-400">{preview?.totals.advance || 0}</div>
                        <div className="text-sm text-muted-foreground">Will advance now</div>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                        <div className="text-2xl font-semibold text-amber-300">{preview?.totals.defer || 0}</div>
                        <div className="text-sm text-muted-foreground">Will gather more evidence</div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-4">
                      <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>
                          Passing threshold for <span className="font-medium text-foreground">{jobTitle}</span>:{" "}
                          <span className="font-medium text-foreground">{preview?.passingScore ?? 60}%</span>
                        </p>
                        <p>
                          Applicants with explicit hard conflicts can be rejected now. Applicants with only early evidence will be moved
                          to the next high-signal phase instead of being failed too early.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <ImpactSection action="reject" applicants={groupedPreview.reject} />
                      <ImpactSection action="advance" applicants={groupedPreview.advance} />
                      <ImpactSection action="defer" applicants={groupedPreview.defer} />
                      <ImpactSection action="review" applicants={groupedPreview.review} />
                    </div>

                    {!preview?.totals.processed && (
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                        No waiting applicants are currently eligible for immediate autopilot catch-up.
                      </div>
                    )}
                  </div>
                )}

                <DialogFooter className="mt-6 flex gap-2 sm:justify-center">
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={updateJob.isPending || loadingPreview}
                    className="bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white hover:from-purple-400 hover:to-fuchsia-500"
                  >
                    {updateJob.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Rocket className="mr-2 h-4 w-4" />
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
                <DialogHeader className="pb-4 text-center">
                  <motion.div
                    className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-xl"
                    animate={{ rotate: [0, -10, 10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Hand className="h-8 w-8" />
                  </motion.div>
                  <DialogTitle className="text-xl">Switch to Manual Mode?</DialogTitle>
                  <DialogDescription className="mt-2 text-center">
                    You will make the next move for every applicant yourself. Ava will keep scoring and summarizing evidence,
                    but automatic reject and advance actions will stop.
                  </DialogDescription>
                </DialogHeader>

                <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-orange-300" />
                    <p className="text-sm text-muted-foreground">
                      Existing applicants will stay where they are. Nothing will be auto-rejected or auto-advanced after you take control.
                    </p>
                  </div>
                </div>

                <DialogFooter className="mt-6 flex gap-2 sm:justify-center">
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    disabled={updateJob.isPending}
                    className="bg-gradient-to-r from-orange-500 to-amber-600 text-white hover:from-orange-400 hover:to-amber-500"
                  >
                    {updateJob.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Hand className="mr-2 h-4 w-4" />
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
