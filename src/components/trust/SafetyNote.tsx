import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { ReportJobDialog } from "./ReportJobDialog";

/**
 * The short "Stay safe" note at the bottom of a job page and on an
 * applicant's application page, with "report it" (docs/BUSINESS-TRUST.md;
 * the 2026-10-11 mock-ups, #5). Other businesses can post on HireFlow since
 * 2026-10-11; a scam's first move is to ask for money, a bank PIN or a
 * password, so the applicant is told plainly that a real job never does.
 * A report needs an account (report_employer), so a visitor who isn't
 * signed in is sent to sign in and brought back to this page.
 */
export function SafetyNote({ job, signedIn = true }: { job: { id: string; title: string } | null; signedIn?: boolean }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const back = `${location.pathname}${location.search}`;
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm" data-safety-note>
      <div className="flex gap-2.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">
          <strong className="font-semibold text-foreground">Stay safe.</strong> A real job never asks you to pay, and never asks for your bank PIN or password. If one
          does,{" "}
          {!job ? (
            "report it"
          ) : signedIn ? (
            <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => setOpen(true)} data-report-open>
              report it
            </button>
          ) : (
            <Link to={`/candidate/auth?redirect=${encodeURIComponent(back)}`} className="font-medium text-foreground underline underline-offset-2" data-report-signin>
              report it
            </Link>
          )}
          .
        </p>
      </div>
      {job && signedIn && <ReportJobDialog open={open} onClose={() => setOpen(false)} jobs={[job]} defaultJobId={job.id} />}
    </div>
  );
}
