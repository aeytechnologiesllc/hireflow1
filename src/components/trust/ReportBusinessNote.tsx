import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ReportJobDialog, type ReportTarget } from "./ReportJobDialog";

/**
 * "Report a business" on the screens an application that is gone leads to
 * ("We can't find that application", the step gate's "Application not
 * found"): the nineteenth Phase 5 review, finding 3. A business that asked
 * people to pay and then deleted its job took their applications with it,
 * and with them every Report button: the job page shows only a live job, and
 * the application page was gone. The decline's link, a card's link and the
 * emails' links all land here once it is.
 *
 * The businesses come from report_choices(): each one the account applied to
 * or heard from (the record of contact), or has a message thread with. One is
 * named as it was when they applied when an application of theirs to it is
 * still there; otherwise by when it was last in touch, never by its name
 * today (a business can rename itself to anything). Shown only to someone
 * signed in with at least one.
 */

interface ReportChoice {
  employer_id: string;
  company_name: string | null;
  job_id: string | null;
  job_title: string | null;
  last_heard_at: string | null;
}

function labelFor(choice: ReportChoice): string {
  const name = choice.company_name?.replace(/\s+/g, " ").trim();
  const title = choice.job_title?.replace(/\s+/g, " ").trim();
  if (name) return title ? `${name} · ${title}` : name;
  if (title) return title;
  const when = choice.last_heard_at ? new Date(choice.last_heard_at) : null;
  return when && Number.isFinite(when.getTime())
    ? `A business whose job is gone (last in touch ${format(when, "MMM d, yyyy")})`
    : "A business whose job is gone";
}

export function ReportBusinessNote() {
  const { user } = useAuth();
  const [targets, setTargets] = useState<ReportTarget[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.rpc("report_choices" as never);
      if (cancelled || error || !Array.isArray(data)) return;
      setTargets(
        (data as ReportChoice[]).map((c) => ({ key: c.employer_id, label: labelFor(c), jobId: c.job_id, employerId: c.employer_id })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || targets.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-left text-sm" data-report-business>
      <div className="flex gap-2.5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">
          <strong className="font-semibold text-foreground">Stay safe.</strong> A real job never asks you to pay. If a business did, you can still{" "}
          <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => setOpen(true)} data-report-business-open>
            report it
          </button>
          .
        </p>
      </div>
      <ReportJobDialog open={open} onClose={() => setOpen(false)} targets={targets} about="business" />
    </div>
  );
}
