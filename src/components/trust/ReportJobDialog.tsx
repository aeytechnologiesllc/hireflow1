import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { withVisitorTags } from "@/lib/hiringLink";

/**
 * "Report this job" (docs/BUSINESS-TRUST.md). Opening HireFlow to other
 * businesses (2026-10-11), an applicant can tell HireFlow about a job that
 * asked for money, asked for documents that seem wrong, seems fake, or was
 * rude or unsafe. Sent through report_employer() (signed in only; one open
 * report per person per job; five a day). The business never sees who
 * reported it; HireFlow's admin is told.
 */

export const REPORT_REASONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "asked_for_money", label: "They asked me to pay" },
  { key: "suspicious_documents", label: "They asked for documents that seem wrong" },
  { key: "fake_job", label: "The job seems fake" },
  { key: "unsafe", label: "Rude or unsafe" },
  { key: "other", label: "Something else" },
];

/** What a refusal from report_employer() means, in words. */
export function reportErrorWords(message: string): string {
  if (/report_too_many/.test(message)) return "You have sent five reports today. Please try again tomorrow.";
  if (/report_own_job/.test(message)) return "This is your own job.";
  if (/not_signed_in/.test(message)) return "Please sign in again, then send it.";
  return "The report did not go through. Please try again.";
}

export function ReportJobDialog({
  open,
  onClose,
  jobs,
  defaultJobId,
}: {
  open: boolean;
  onClose: () => void;
  /** The jobs this report can be about (one on a job page, a business's open roles on its careers page). */
  jobs: ReadonlyArray<{ id: string; title: string }>;
  defaultJobId?: string | null;
}) {
  const { user } = useAuth();
  const location = useLocation();
  const [jobId, setJobId] = useState<string>(defaultJobId ?? jobs[0]?.id ?? "");
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  // Fresh each time it opens, and only then: the page behind it redraws on
  // live updates (with a new `jobs` list each time), which must not wipe what
  // they are typing or bring the form back after "Thank you".
  useEffect(() => {
    if (open) {
      setJobId(defaultJobId ?? jobs[0]?.id ?? "");
      setReason("");
      setDetails("");
      setState("idle");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = async () => {
    if (!reason || !jobId || state === "sending") return;
    setState("sending");
    setError(null);
    const { error: rpcError } = await supabase.rpc("report_employer" as never, { p_job_id: jobId, p_reason: reason, p_details: details.trim() || null } as never);
    if (rpcError) {
      setState("idle");
      setError(reportErrorWords(rpcError.message));
      return;
    }
    setState("sent");
  };

  // With the visitor's channel, as Apply carries it (the seventh growth review).
  const signIn = withVisitorTags(`/candidate/auth?redirect=${encodeURIComponent(location.pathname)}`, window.location.href, document.referrer);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{state === "sent" ? "Thank you" : "Report this job"}</DialogTitle>
          <DialogDescription>
            {state === "sent"
              ? "HireFlow will look at it. The business never sees who reported it."
              : "Tell HireFlow what happened. The business never sees who reported it."}
          </DialogDescription>
        </DialogHeader>

        {state === "sent" ? (
          <Button className="w-full" onClick={onClose}>
            Close
          </Button>
        ) : !user ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Please sign in first, so we can follow up if we need to.</p>
            <Button asChild className="w-full">
              <a href={signIn}>Sign in to report</a>
            </Button>
          </div>
        ) : (
          <div className="space-y-3" data-report-form>
            {jobs.length > 1 && (
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">Which job?</span>
                <select
                  id="report-job"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-base sm:text-sm"
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                >
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div role="radiogroup" aria-label="What happened" className="space-y-2">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.key}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${reason === r.key ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  <input type="radio" name="report-reason" value={r.key} checked={reason === r.key} onChange={() => setReason(r.key)} className="accent-[hsl(var(--primary))]" />
                  {r.label}
                </label>
              ))}
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">What happened (optional)</span>
              <textarea
                id="report-details"
                className="min-h-[80px] w-full rounded-md border border-border bg-background px-3 py-2 text-base sm:text-sm"
                maxLength={1000}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="They asked for 500 pesos for training."
              />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={() => void send()} disabled={!reason || state === "sending"}>
              {state === "sending" ? "Sending..." : "Send report"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
