/**
 * Back from Stripe's hosted Checkout page on the job page (?billing=paid |
 * unlimited | cancelled; pricing v9, docs/BILLING.md). Since 2026-11-01 the
 * business pays inside HireFlow (PublishPaymentDialog) and this is the
 * fallback's way back, used until the site has Stripe's publishable key, or
 * when a card needs a redirect.
 *
 * Paid: the confirmation, as a dialog, once (PaymentConfirmationDialog: what
 * was paid, what it bought, the receipt, Share your job, See billing).
 * billing-webhook puts the job live once Stripe confirms the payment, usually
 * within seconds; until then the confirmation says so calmly and asks again
 * (every 2 seconds for half a minute, then every 10 seconds for five
 * minutes). Closing it takes ?billing= off the address, so it shows once.
 * Cancelled: one quiet line. Never shown while billing is off, or not known
 * (billingShown): a link someone made up with ?billing=paid says nothing then.
 */
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { PAID_RETURN_WORDS as W, billingReturn, billingShown, type BillingState } from "@/lib/billing";
import { PaymentConfirmationDialog } from "@/components/billing/PaymentConfirmation";

export function BillingReturnNote({
  billing,
  onRefresh,
  jobId,
  jobTitle,
  onShare,
}: {
  billing: BillingState | null | undefined;
  /** Whether the job is live now (kept for the callers; the confirmation reads it itself). */
  live?: boolean;
  onRefresh: () => void;
  jobId?: string | null;
  jobTitle?: string | null;
  /** Open this job's share kit. */
  onShare?: () => void;
}) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const back = billingShown(billing) ? billingReturn(params.get("billing")) : null;
  const [since] = useState(() => Date.now());

  if (!back || back === "back") return null;

  const dismiss = () => {
    const next = new URLSearchParams(params);
    next.delete("billing");
    setParams(next, { replace: true });
    onRefresh();
  };

  if (back === "paid" || back === "unlimited") {
    return (
      <PaymentConfirmationDialog
        open
        onClose={dismiss}
        what={back === "paid" ? "job" : "unlimited"}
        jobId={jobId ?? null}
        jobTitle={jobTitle}
        since={since}
        onShare={
          onShare
            ? () => {
                dismiss();
                onShare();
              }
            : undefined
        }
        onSeeBilling={() => navigate("/settings?tab=billing")}
      />
    );
  }

  return (
    <div role="status" aria-live="polite" data-billing-return={back} className="ck-card-flat ck-reveal flex items-start gap-3 px-4 py-3">
      <p className="min-w-0 flex-1 text-[13.5px] leading-snug" style={{ color: "var(--ink-2)" }}>
        {W.cancelled}
      </p>
      <button type="button" aria-label="Dismiss" className="shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100" onClick={dismiss}>
        <X className="h-4 w-4" style={{ color: "var(--ink-3)" }} />
      </button>
    </div>
  );
}
