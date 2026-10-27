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
 *
 * It can name a business instead of a job (the nineteenth Phase 5 review,
 * finding 3): a business that asked people for money and then deleted its
 * job took their applications with it, and every Report button with them.
 * A business target sends report_employer's p_employer (the chat's contact,
 * or a business from report_choices) and the job while it is still there;
 * the database takes it only for a business the reporter has a recorded
 * contact or a message thread with, and keeps one open report per business
 * when there is no job.
 */

/** What a report is about: a job (its page, an application), or a business with or without its job. */
export interface ReportTarget {
  key: string;
  label: string;
  jobId?: string | null;
  employerId?: string | null;
}

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
  if (/report_job_unknown|report_business_unknown/.test(message)) return "We could not find that job or business to report. Please use Contact us instead.";
  if (/not_signed_in/.test(message)) return "Please sign in again, then send it.";
  return "The report did not go through. Please try again.";
}

export function ReportJobDialog({
  open,
  onClose,
  jobs = [],
  defaultJobId,
  targets: givenTargets,
  about = "job",
}: {
  open: boolean;
  onClose: () => void;
  /** The jobs this report can be about (one on a job page, a business's open roles on its careers page). */
  jobs?: ReadonlyArray<{ id: string; title: string }>;
  defaultJobId?: string | null;
  /** Or what it can be about, a business among them (a chat, the screens of an application that is gone). */
  targets?: ReadonlyArray<ReportTarget>;
  /** The heading's word: "Report this job" or "Report this business". */
  about?: "job" | "business";
}) {
  const { user } = useAuth();
  const location = useLocation();
  const targets: ReadonlyArray<ReportTarget> = givenTargets ?? jobs.map((j) => ({ key: j.id, label: j.title, jobId: j.id }));
  const [jobId, setJobId] = useState<string>(defaultJobId ?? targets[0]?.key ?? "");
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  // Fresh each time it opens, and only then: the page behind it redraws on
  // live updates (with a new `jobs` list each time), which must not wipe what
  // they are typing or bring the form back after "Thank you".
  useEffect(() => {
    if (open) {
      setJobId(defaultJobId ?? targets[0]?.key ?? "");
      setReason("");
      setDetails("");
      setState("idle");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const send = async () => {
    const target = targets.find((t) => t.key === jobId);
    if (!reason || !target || state === "sending") return;
    setState("sending");
    setError(null);
    // A job's report sends the three arguments it always has; a business's
    // adds p_employer (and its job, while there is one).
    const args = target.employerId
      ? { p_job_id: target.jobId ?? null, p_reason: reason, p_details: details.trim() || null, p_employer: target.employerId }
      : { p_job_id: target.jobId ?? null, p_reason: reason, p_details: details.trim() || null };
    const { error: rpcError } = await supabase.rpc("report_employer" as never, args as never);
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
          <DialogTitle>{state === "sent" ? "Thank you" : about === "business" ? "Report this business" : "Report this job"}</DialogTitle>
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
            {targets.length > 1 && (
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">{about === "business" ? "Which business?" : "Which job?"}</span>
                <select
                  id="report-job"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-base sm:text-sm"
                  value={jobId}
                  onChange={(e) => setJobId(e.target.value)}
                >
                  {targets.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
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
