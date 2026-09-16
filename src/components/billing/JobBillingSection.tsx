import { Loader2, Megaphone } from "lucide-react";
import { useEmployerJobs } from "@/hooks/useJobs";
import { useBillingFlags } from "@/hooks/useBillingFlags";
import JobBillingRow from "./JobBillingRow";

/**
 * Replaces the old Growth/Business plan-picker section of Settings ->
 * Subscription with an honest, per-job view of the owner's decided pricing:
 * posting is free, the first 3 applicants per job are free, a job unlocks
 * for $49 at #4, +$25 per pack of 25, and Ava Boost runs ads per job.
 *
 * While billing is off (the default right now), this shows early-access
 * copy and nothing that looks like a price due — it does not even fetch
 * per-job billing status, since there is nothing to show.
 */
export default function JobBillingSection() {
  const { data: flags, isLoading: flagsLoading } = useBillingFlags();
  const { data: jobs, isLoading: jobsLoading } = useEmployerJobs();

  if (flagsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!flags?.billingEnabled) {
    return (
      <div className="p-6 rounded-xl border border-border bg-card/50">
        <h3 className="text-lg font-semibold text-foreground">Billing</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-prose">
          HireFlow is free while we're in early access. Post jobs, process applicants and run interviews —
          nothing here has a price attached yet. We'll let you know before that changes.
        </p>
      </div>
    );
  }

  const relevantJobs = (jobs ?? []).filter((job) => job.status === "published" || job.status === "closed");

  return (
    <div className="p-6 rounded-xl border border-border bg-card/50">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Billing</h3>
          <p className="text-sm text-muted-foreground mt-1">
            No subscription — pay per job. Posting is free, the first 3 applicants are always free.
          </p>
        </div>
        {flags.boostEnabled && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Megaphone className="h-3.5 w-3.5" style={{ color: "var(--brass)" }} />
            Ava Boost is available per job below
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {jobsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : relevantJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Publish a job to see its billing here.</p>
        ) : (
          relevantJobs.map((job) => (
            <JobBillingRow key={job.id} jobId={job.id} jobTitle={job.title} boostEnabled={flags.boostEnabled} />
          ))
        )}
      </div>
    </div>
  );
}
