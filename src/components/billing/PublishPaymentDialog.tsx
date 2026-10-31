/**
 * PublishPaymentDialog — shown when the database refuses to put a job live
 * until it is paid for (pricing v9; jobs_publish_needs_pass, HINT
 * payment_required). That refusal never happens while billing is off, so
 * this never shows then. The job is already saved, not live (a draft the
 * page just saved, or a closed job whose 30 days ended); paying here sends the
 * business to Stripe Checkout and back to the job, which billing-webhook puts
 * live (docs/BILLING.md).
 *
 * The words are in src/lib/billing.ts. Money is brass and outlined
 * (.ck-btn-paid), never a plain button.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PUBLISH_PAYMENT_WORDS as W } from "@/lib/billing";
import { startCheckout } from "@/lib/billingApi";

export function PublishPaymentDialog({
  open,
  onOpenChange,
  jobId,
  jobTitle,
  onPublishInstead,
  onConfirmEmail,
  justSaved = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The job to pay for (already saved). */
  jobId: string | null;
  jobTitle?: string | null;
  /** No payment is needed after all (Unlimited came on meanwhile): publish as usual. Closes the dialog itself. */
  onPublishInstead?: () => void;
  /** The business must confirm its email first. Closes the dialog itself. */
  onConfirmEmail?: () => void;
  /** The page has just saved the job as a draft for this (a refused publish). */
  justSaved?: boolean;
}) {
  const [busy, setBusy] = useState<"job" | "unlimited" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBusy(null);
      setProblem(null);
    }
  }, [open]);

  const pay = async (kind: "job" | "unlimited") => {
    if (!jobId || busy) return;
    setBusy(kind);
    setProblem(null);
    const outcome = await startCheckout(kind, jobId);
    if (outcome.kind === "redirect") {
      window.location.assign(outcome.url);
      return;
    }
    setBusy(null);
    // The page that opened the dialog closes it in these two (it knows where to go next).
    if (outcome.kind === "publish") {
      toast(outcome.message);
      if (onPublishInstead) onPublishInstead();
      else onOpenChange(false);
      return;
    }
    if (outcome.kind === "email" && onConfirmEmail) {
      onConfirmEmail();
      return;
    }
    setProblem(outcome.message);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{W.title}</DialogTitle>
          <DialogDescription>{W.intro(jobTitle)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2" data-billing-options>
          <section className="ck-card-flat flex flex-col gap-2 p-4">
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
              {W.jobHeading}
            </h3>
            <p className="font-display text-[22px] leading-none" style={{ color: "var(--brass)", fontWeight: 600 }}>
              {W.jobPrice}
            </p>
            <p className="text-[13px] leading-snug" style={{ color: "var(--ink-2)" }}>
              {W.jobNote}
            </p>
            <button
              type="button"
              className="ck-btn ck-btn-paid mt-auto w-full !py-2.5 !text-[12.5px]"
              disabled={!jobId || busy !== null}
              onClick={() => void pay("job")}
            >
              {busy === "job" ? W.opening : W.jobButton}
            </button>
          </section>
          <section className="ck-card-flat flex flex-col gap-2 p-4">
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
              {W.unlimitedHeading}
            </h3>
            <p className="font-display text-[22px] leading-none" style={{ color: "var(--brass)", fontWeight: 600 }}>
              {W.unlimitedPrice}
            </p>
            <p className="text-[13px] leading-snug" style={{ color: "var(--ink-2)" }}>
              {W.unlimitedNote}
            </p>
            <button
              type="button"
              className="ck-btn ck-btn-paid mt-auto w-full !py-2.5 !text-[12.5px]"
              disabled={!jobId || busy !== null}
              onClick={() => void pay("unlimited")}
            >
              {busy === "unlimited" ? W.opening : W.unlimitedButton}
            </button>
          </section>
        </div>

        {problem && (
          <p role="alert" className="text-[13px]" style={{ color: "var(--hf-danger)" }}>
            {problem}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] leading-snug" style={{ color: "var(--ink-3)" }}>
            {justSaved ? W.saved : W.notSaved}
          </p>
          <button type="button" className="ck-btn ck-btn-ghost !px-3 !py-2 !text-[12.5px]" disabled={busy !== null} onClick={() => onOpenChange(false)}>
            {W.later}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
