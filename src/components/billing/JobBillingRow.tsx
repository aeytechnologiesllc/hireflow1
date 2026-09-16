import { useState } from "react";
import { Lock, Unlock, Megaphone, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useJobBilling } from "@/hooks/useJobBilling";
import JobUnlockDialog from "./JobUnlockDialog";
import AvaBoostDialog from "./AvaBoostDialog";

interface JobBillingRowProps {
  jobId: string;
  jobTitle: string;
  boostEnabled: boolean;
}

export default function JobBillingRow({ jobId, jobTitle, boostEnabled }: JobBillingRowProps) {
  const { data: billing, isLoading } = useJobBilling(jobId);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);

  if (isLoading || !billing) {
    return (
      <div className="p-4 rounded-lg bg-muted/30 border border-border flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {jobTitle}
      </div>
    );
  }

  const statusBadge = billing.isLocked ? (
    <Badge className="gap-1" style={{ background: "var(--hf-gold-soft)", color: "var(--brass)", borderColor: "var(--brass-line)" }}>
      <Lock className="h-3 w-3" /> Locked
    </Badge>
  ) : billing.hasActiveUnlock ? (
    <Badge className="gap-1" style={{ background: "var(--jade-soft)", color: "var(--jade-soft-fg)" }}>
      <Unlock className="h-3 w-3" /> Unlocked
    </Badge>
  ) : (
    <Badge variant="secondary">Free tier</Badge>
  );

  return (
    <div className="p-4 rounded-lg bg-muted/30 border border-border flex items-center justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-foreground truncate">{jobTitle}</p>
          {statusBadge}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {billing.applicantCount} applicant{billing.applicantCount === 1 ? "" : "s"} · {billing.processedAllowance} processed included
          {billing.sealedCount > 0 ? ` · ${billing.sealedCount} sealed` : ""}
          {billing.hasActiveUnlock ? ` · voice: ${billing.voice.used}/${billing.voice.included} used` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {(billing.isLocked || !billing.hasActiveUnlock) && (
          <Button
            size="sm"
            variant="outline"
            className="bg-transparent"
            style={{ borderColor: "var(--brass-line)", color: "var(--brass)" }}
            onClick={() => setUnlockOpen(true)}
          >
            {billing.hasActiveUnlock ? "Buy pack — $25" : "Unlock — $49"}
          </Button>
        )}
        {boostEnabled && (
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setBoostOpen(true)}>
            <Megaphone className="h-3.5 w-3.5" /> Boost
          </Button>
        )}
      </div>

      <JobUnlockDialog open={unlockOpen} onOpenChange={setUnlockOpen} jobId={jobId} jobTitle={jobTitle} billing={billing} />
      {boostEnabled && <AvaBoostDialog open={boostOpen} onOpenChange={setBoostOpen} jobId={jobId} jobTitle={jobTitle} />}
    </div>
  );
}
