import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useJobBilling } from "@/hooks/useJobBilling";
import JobUnlockDialog from "./JobUnlockDialog";

interface JobLockBannerProps {
  jobId: string;
  jobTitle: string;
}

/**
 * Shown above a single job's applicant list once it's past its free/paid
 * allowance. Renders nothing at all — not even while loading — unless
 * billing is actually on AND this specific job is actually locked: the free
 * tier stays open until the owner flips billing_enabled, and this banner is
 * the one place that would show a price as due, so it checks the flag
 * itself rather than trusting a caller to gate it.
 */
export default function JobLockBanner({ jobId, jobTitle }: JobLockBannerProps) {
  const { data: billing } = useJobBilling(jobId);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!billing || !billing.billingEnabled || !billing.isLocked) return null;

  return (
    <div
      className="rounded-xl border p-4 mb-4 flex items-center justify-between gap-4 flex-wrap"
      style={{ borderColor: "var(--brass-line)", background: "var(--hf-gold-soft)" }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--surface)" }}>
          <Lock className="h-4 w-4" style={{ color: "var(--brass)" }} />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">This job is locked</p>
          <p className="text-sm text-muted-foreground">
            {billing.sealedCount} more waiting — applicants keep arriving, nothing is lost.
          </p>
        </div>
      </div>
      {/* Brass is reserved for things that cost money, and those are
          outlined, never filled — same rule the cockpit's own .ck-btn-paid
          follows (src/cockpit/cockpit.css). */}
      <Button
        size="sm"
        variant="outline"
        className="bg-transparent shrink-0"
        style={{ borderColor: "var(--brass-line)", color: "var(--brass)" }}
        onClick={() => setDialogOpen(true)}
      >
        {billing.hasActiveUnlock ? "Buy pack — $25" : "Unlock — $49"}
      </Button>

      <JobUnlockDialog open={dialogOpen} onOpenChange={setDialogOpen} jobId={jobId} jobTitle={jobTitle} billing={billing} />
    </div>
  );
}
