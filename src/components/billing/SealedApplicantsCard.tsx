import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import JobUnlockDialog from "./JobUnlockDialog";
import type { JobBillingStatus } from "@/hooks/useJobBilling";

interface SealedApplicantsCardProps {
  jobId: string;
  jobTitle: string;
  billing: JobBillingStatus;
}

/** A few sealed envelopes never sit perfectly square — same idea as the wax seals above them. */
const TILTS = [-5, 3, -2];

/**
 * The sealed-envelope summary card appended to the end of a locked job's
 * applicant list, in place of individual cards for the applicants beyond
 * the allowance. Deliberately ONE card, not N fake rows: nothing about
 * those specific people is shown or implied until the employer unlocks —
 * only the count.
 */
export default function SealedApplicantsCard({ jobId, jobTitle, billing }: SealedApplicantsCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!billing.billingEnabled || billing.sealedCount <= 0) return null;

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 flex flex-col items-center text-center gap-3">
      <div className="flex -space-x-3">
        {TILTS.map((tilt, i) => (
          <div
            key={i}
            className="flex h-10 w-10 items-center justify-center rounded-md border shadow-sm"
            style={{ background: "var(--surface)", borderColor: "var(--brass-line)", transform: `rotate(${tilt}deg)`, zIndex: TILTS.length - i }}
          >
            <Mail className="h-4 w-4" style={{ color: "var(--brass)" }} />
          </div>
        ))}
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">{billing.sealedCount} more waiting</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          They applied and their work is safe — unlock this job to open them.
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="bg-transparent"
        style={{ borderColor: "var(--brass-line)", color: "var(--brass)" }}
        onClick={() => setDialogOpen(true)}
      >
        {billing.hasActiveUnlock ? "Buy pack — $25" : "Unlock — $49"}
      </Button>

      <JobUnlockDialog open={dialogOpen} onOpenChange={setDialogOpen} jobId={jobId} jobTitle={jobTitle} billing={billing} />
    </div>
  );
}
