import { useState } from "react";
import { Lock, PackagePlus, Loader2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useJobBillingActions } from "@/hooks/useJobBillingActions";
import type { JobBillingStatus } from "@/hooks/useJobBilling";

interface JobUnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobTitle: string;
  billing: JobBillingStatus;
}

/**
 * One dialog, two shapes, depending on where the job actually is:
 *   - no active unlock (never unlocked, or its 30-day window lapsed): the
 *     $49 unlock offer — 30 days, 25 processed applicants, 10 voice
 *     interviews included.
 *   - an active unlock that's simply run out of allowance: the $25
 *     applicant-pack upsell (+25 more).
 * Both redirect to a Stripe Checkout URL; nothing is charged until the
 * employer completes that.
 */
export default function JobUnlockDialog({ open, onOpenChange, jobId, jobTitle, billing }: JobUnlockDialogProps) {
  const { unlockJob, buyApplicantPack } = useJobBillingActions();
  const [loading, setLoading] = useState(false);

  const isPackUpsell = billing.hasActiveUnlock;

  const handleContinue = async () => {
    setLoading(true);
    try {
      const { url } = isPackUpsell
        ? await buyApplicantPack.mutateAsync(jobId)
        : await unlockJob.mutateAsync(jobId);
      if (url) {
        window.location.href = url;
      } else {
        toast({ variant: "warning", title: "Checkout unavailable", description: "We couldn't start checkout right now. Please try again in a moment." });
        setLoading(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "We couldn't start checkout right now.";
      toast({ variant: "warning", title: "Unable to open checkout", description: message });
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "var(--hf-gold-soft)" }}>
              {isPackUpsell ? (
                <PackagePlus className="h-5 w-5" style={{ color: "var(--brass)" }} />
              ) : (
                <Lock className="h-5 w-5" style={{ color: "var(--brass)" }} />
              )}
            </div>
            <span>{isPackUpsell ? "Add an applicant pack" : `Unlock "${jobTitle}"`}</span>
          </DialogTitle>
          <DialogDescription className="pt-2">
            {isPackUpsell
              ? `This job's 25 included applicants are used up. A pack adds 25 more, right away.`
              : `The first 3 applicants are free. Unlock this job to process the rest.`}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border p-4 mt-2" style={{ borderColor: "var(--brass-line)", background: "var(--hf-gold-soft)" }}>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold text-foreground">{isPackUpsell ? "$25" : "$49"}</span>
            <span className="text-sm text-muted-foreground">one time</span>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {(isPackUpsell
              ? ["+25 processed applicants", "Added to this job's current unlock"]
              : ["30 days active", "25 processed applicants included", "10 voice interviews included"]
            ).map((f) => (
              <li key={f} className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5" style={{ color: "var(--brass)" }} />
                <span className="text-muted-foreground">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground pt-1">
          Nobody's application is ever lost while a job is locked — sealed applicants stay right where they are and open the moment you unlock.
        </p>

        {/* Brass is reserved for things that cost money, and those are
            outlined, never filled — same rule the cockpit's own
            .ck-btn-paid follows (src/cockpit/cockpit.css). */}
        <Button
          variant="outline"
          className="w-full gap-2 mt-2 bg-transparent"
          style={{ borderColor: "var(--brass-line)", color: "var(--brass)" }}
          onClick={handleContinue}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isPackUpsell ? "Buy pack — $25" : "Unlock — $49"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
