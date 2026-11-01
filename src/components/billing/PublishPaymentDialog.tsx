/**
 * PublishPaymentDialog — shown when the database refuses to put a job live
 * until it is paid for (pricing v9; jobs_publish_needs_pass, HINT
 * payment_required). That refusal never happens while billing is off, so
 * this never shows then. The job is already saved, not live (a draft the
 * page just saved, or a closed job whose 30 days ended).
 *
 * Three steps, in one dialog (2026-11-01):
 *   1. choose: $99 for this job, or Unlimited;
 *   2. pay: Stripe's own payment form, inside HireFlow (Embedded Checkout,
 *      StripeCheckoutForm): the card goes to Stripe, never to HireFlow. Without
 *      the publishable key the page goes to Stripe's hosted page instead and
 *      comes back to the job, as before;
 *   3. paid: the confirmation in place (PaymentConfirmation): what was paid,
 *      what it bought, the receipt, Share your job, See billing.
 * billing-webhook puts the job live, as before (docs/BILLING.md).
 *
 * After paying, every way out goes somewhere sensible: the page that opened
 * the dialog decides (onDone), or else the job page (Share your job opens its
 * share kit there), or Settings -> Billing. The editor's "saved, goes live
 * once it's paid for" is never said after a payment.
 *
 * The words are in src/lib/billing.ts. Money is brass and outlined
 * (.ck-btn-paid), never a plain button.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Lock } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CHECKOUT_DIALOG_WORDS as C, PUBLISH_PAYMENT_WORDS as W } from "@/lib/billing";
import { startCheckout } from "@/lib/billingApi";
import { PaymentConfirmation } from "./PaymentConfirmation";
import { StripeCheckoutForm } from "./StripeCheckoutForm";

export type PaidNext = "share" | "billing" | "close";

type Stage =
  | { step: "choose" }
  | { step: "pay"; what: "job" | "unlimited"; clientSecret: string }
  | { step: "paid"; what: "job" | "unlimited"; since: number };

export function PublishPaymentDialog({
  open,
  onOpenChange,
  jobId,
  jobTitle,
  onPublishInstead,
  onConfirmEmail,
  justSaved = false,
  onDone,
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
  /**
   * After paying: where to go next (Share your job, See billing, or closed).
   * The page closes the dialog itself. Without it the dialog goes to the job
   * page (?share=1 opens its share kit) or Settings -> Billing.
   */
  onDone?: (next: PaidNext) => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"job" | "unlimited" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ step: "choose" });

  useEffect(() => {
    if (!open) {
      setBusy(null);
      setProblem(null);
      setStage({ step: "choose" });
    }
  }, [open]);

  const finish = (next: PaidNext) => {
    if (onDone) {
      onDone(next);
      return;
    }
    if (next === "billing") navigate("/settings?tab=billing");
    else if (jobId) navigate(next === "share" ? `/jobs/${jobId}?share=1` : `/jobs/${jobId}`);
    else navigate("/jobs");
  };

  const pay = async (kind: "job" | "unlimited") => {
    if (!jobId || busy) return;
    setBusy(kind);
    setProblem(null);
    const outcome = await startCheckout(kind, jobId);
    if (outcome.kind === "embedded") {
      setBusy(null);
      setStage({ step: "pay", what: kind, clientSecret: outcome.clientSecret });
      return;
    }
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

  const paid = stage.step === "paid";
  const handleOpenChange = (next: boolean) => {
    if (next) return;
    if (busy) return;
    // Paid: never the page's "not paid yet" close (its toast and its way back).
    if (paid) finish("close");
    else onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={`max-h-[92dvh] overflow-y-auto ${stage.step === "choose" ? "max-w-[560px]" : "max-w-[620px]"}`} data-payment-step={stage.step}>
        {stage.step === "choose" && (
          <>
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
          </>
        )}

        {stage.step === "pay" && (
          <>
            <DialogHeader className="pr-6 text-left">
              <DialogTitle>{stage.what === "unlimited" ? C.unlimitedTitle : C.jobTitle(jobTitle)}</DialogTitle>
              <DialogDescription className="flex items-start gap-1.5">
                <Lock className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden />
                {C.secure}
              </DialogDescription>
            </DialogHeader>
            <StripeCheckoutForm clientSecret={stage.clientSecret} onComplete={() => setStage({ step: "paid", what: stage.what, since: Date.now() })} />
            <div>
              <button type="button" className="ck-btn ck-btn-ghost !px-2.5 !py-1.5 !text-[12.5px]" onClick={() => setStage({ step: "choose" })}>
                <ChevronLeft className="h-4 w-4" aria-hidden />
                {C.back}
              </button>
            </div>
          </>
        )}

        {stage.step === "paid" && (
          <>
            <DialogTitle className="sr-only">{C.paidTitle}</DialogTitle>
            <DialogDescription className="sr-only">{C.paidDescription}</DialogDescription>
            <PaymentConfirmation
              what={stage.what}
              jobId={jobId}
              jobTitle={jobTitle}
              since={stage.since}
              active={open}
              onShare={() => finish("share")}
              onSeeBilling={() => finish("billing")}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
