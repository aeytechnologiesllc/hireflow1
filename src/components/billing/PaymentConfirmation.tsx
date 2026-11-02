/**
 * The confirmation after paying (2026-11-01). The owner, after his $1 test
 * payment: "I made a payment, came back, there was no payment confirmation,
 * there was nothing like, okay, well, this is what you get for the month."
 *
 * What it says, from HireFlow's own records (never the list price: the $1
 * test shows $1.00): what was paid and when, what it bought ("“Chat agent” is
 * live until December 1, 2026. Unlimited applicants." / "Unlimited is on.
 * Every job stays live while it lasts. Renews …"), that a receipt is emailed
 * (and the receipt itself when Stripe has one), and two ways on: Share your
 * job, See billing.
 *
 * Until billing-webhook has recorded the payment it says so calmly and asks
 * again (every 2 seconds for half a minute, then every 10 seconds for five
 * minutes), as the note it replaces did. Shown in place when the payment
 * form inside HireFlow completes (PublishPaymentDialog, CheckoutDialog), and
 * as a dialog when Stripe's hosted page sends the business back
 * (BillingReturnNote, Settings). Words: src/lib/billing.ts.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Loader2, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useEmployerJobs } from "@/hooks/useJobs";
import { useBilling } from "@/hooks/useSubscription";
import {
  PAYMENT_CONFIRMATION_WORDS as W,
  billingTabShown,
  confirmationWords,
  paymentConfirmed,
  paymentSince,
} from "@/lib/billing";
import { externalHref } from "@/lib/safeLink";

export type ConfirmationActions = {
  /** Open the job's share kit (the job is live). */
  onShare?: () => void;
  /** Go to Settings -> Billing. */
  onSeeBilling?: () => void;
  /** Go to the jobs (Unlimited bought from Settings, no job named). */
  onSeeJobs?: () => void;
};

/** Asks again until the payment is recorded; then says what it was. */
export function usePaymentConfirmation({ what, jobId, since, active = true }: { what: "job" | "unlimited"; jobId: string | null; since: number; active?: boolean }) {
  const { billing, refetch } = useBilling();
  const jobsQ = useEmployerJobs();
  const confirmed = paymentConfirmed(billing, what, jobId);
  const payment = paymentSince(billing, what, jobId, since);
  const hasHistory = billingTabShown(billing) && billing.payments !== null;
  const job = jobId ? (jobsQ.data ?? []).find((j) => j.id === jobId) ?? null : null;
  const [confirmedAt, setConfirmedAt] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  const [recordWaitOver, setRecordWaitOver] = useState(false);

  useEffect(() => {
    if (confirmed && confirmedAt === null) setConfirmedAt(Date.now());
  }, [confirmed, confirmedAt]);

  // The job's own state, read again after the payment landed (the webhook puts it live in the same step).
  // (If the jobs cannot be read, the confirmation does not wait on them for good.)
  const jobFresh = !jobId || jobsQ.isError || slow || (confirmedAt !== null && jobsQ.dataUpdatedAt >= confirmedAt);
  // The owner's record of the amount comes with the same webhook; give it a few more asks, then show what is known.
  const waitingForRecord = confirmed && hasHistory && !payment && !recordWaitOver;
  const done = confirmed && jobFresh && !waitingForRecord;

  const refresh = useRef<() => void>(() => undefined);
  refresh.current = () => {
    void refetch();
    void jobsQ.refetch();
  };

  useEffect(() => {
    if (!active || done) return;
    const started = Date.now();
    let timer: number | undefined;
    const tick = () => {
      const elapsed = Date.now() - started;
      if (elapsed > 5 * 60_000) return;
      if (elapsed > 30_000) setSlow(true);
      refresh.current();
      timer = window.setTimeout(tick, elapsed > 30_000 ? 10_000 : 2_000);
    };
    timer = window.setTimeout(tick, 1_200);
    return () => window.clearTimeout(timer);
  }, [active, done]);

  useEffect(() => {
    if (!confirmed || payment || !hasHistory) return;
    const timer = window.setTimeout(() => setRecordWaitOver(true), 20_000);
    return () => window.clearTimeout(timer);
  }, [confirmed, payment, hasHistory]);

  return {
    billing,
    state: (done ? "confirmed" : slow ? "slow" : "waiting") as "confirmed" | "slow" | "waiting",
    payment,
    live: jobId ? (job ? job.status === "published" : null) : null,
    jobTitle: job?.title ?? null,
    endsAt: what === "unlimited" ? billing?.unlimited?.periodEnd ?? null : (jobId ? billing?.jobs[jobId]?.endsAt : null) ?? payment?.endsAt ?? null,
    cancelAtPeriodEnd: billing?.unlimited?.cancelAtPeriodEnd === true,
  };
}

export function PaymentConfirmation({
  what,
  jobId,
  jobTitle,
  since,
  active = true,
  onShare,
  onSeeBilling,
  onSeeJobs,
}: { what: "job" | "unlimited"; jobId: string | null; jobTitle?: string | null; since: number; active?: boolean } & ConfirmationActions) {
  const { role, isTeamMember } = useAuth();
  const owner = role === "employer" && !isTeamMember;
  const c = usePaymentConfirmation({ what, jobId, since, active });
  const words = confirmationWords({
    what,
    jobTitle: c.jobTitle ?? jobTitle ?? null,
    payment: c.payment,
    endsAt: c.endsAt,
    cancelAtPeriodEnd: c.cancelAtPeriodEnd,
    live: c.live,
    state: c.state,
  });
  const confirmed = c.state === "confirmed";
  const receipt = externalHref(c.payment?.receiptUrl ?? null);
  const canShare = confirmed && !!jobId && c.live === true && !!onShare;
  const canSeeJobs = confirmed && !jobId && !!onSeeJobs;
  const canSeeBilling = confirmed && owner && billingTabShown(c.billing) && !!onSeeBilling;
  // A live job: where its applicants will show up.
  const showsNext = confirmed && (what === "unlimited" || c.live === true);

  return (
    <div className="space-y-5" data-payment-confirmation={c.state} data-payment-what={what}>
      <div className="flex items-start gap-3.5 pr-8">
        <span
          aria-hidden
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={confirmed ? { background: "var(--action)", color: "var(--btn-fg)" } : { background: "var(--surface-2)", color: "var(--ink-3)" }}
        >
          {confirmed ? <Check className="h-5 w-5" strokeWidth={2.6} /> : <Loader2 className="h-5 w-5 animate-spin" />}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[22px] leading-tight" style={{ color: "var(--ink)", fontWeight: 600 }}>
            {words.heading}
          </h2>
          <p role="status" aria-live="polite" className="mt-1 text-[13.5px] leading-snug" style={{ color: "var(--ink-2)" }}>
            {words.lead}
          </p>
        </div>
      </div>

      {!confirmed && (
        <>
          <dl className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--line)", background: "var(--surface)" }}>
            <Row label={W.forWhat}>{words.forWhat}</Row>
          </dl>
          <p className="text-[12.5px] leading-snug" style={{ color: "var(--ink-3)" }}>
            {W.waitingNote}
          </p>
        </>
      )}

      {confirmed && (
        <dl className="divide-y overflow-hidden rounded-xl" style={{ border: "1px solid var(--line)", background: "var(--surface)", borderColor: "var(--line)" }}>
          {words.paid && (
            <Row label={W.paid}>
              {/* Money: brass, the amount actually charged. */}
              <span className="font-display text-[20px] leading-none tabular-nums" style={{ color: "var(--brass)", fontWeight: 600 }} data-paid-amount>
                {words.paid}
              </span>
              {words.paidOn && (
                <span className="ml-2 text-[13px]" style={{ color: "var(--ink-3)" }}>
                  {words.paidOn}
                </span>
              )}
            </Row>
          )}
          <Row label={W.forWhat}>{words.forWhat}</Row>
          {words.got && <Row label={W.got}>{words.got}</Row>}
          <Row label={W.receiptLabel}>
            {words.receipt}
            {receipt && (
              <>
                {" "}
                <a href={receipt} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap font-medium underline underline-offset-2" style={{ color: "var(--action-soft-fg)" }}>
                  {W.viewReceipt}
                </a>
              </>
            )}
          </Row>
        </dl>
      )}

      {showsNext && (
        <div className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: "var(--action-soft)", border: "1px solid color-mix(in srgb, var(--action) 22%, transparent)" }} data-payment-next>
          <Users className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--action-soft-fg)" }} aria-hidden />
          <div className="min-w-0 text-[13px] leading-snug" style={{ color: "var(--ink)" }}>
            <p className="font-semibold">{W.nextHeading}</p>
            <p className="mt-0.5" style={{ color: "var(--ink-2)" }}>
              {W.nextNote}
            </p>
            <Link to="/applicants" className="mt-1.5 inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline" style={{ color: "var(--action-soft-fg)" }}>
              {W.seeApplicants}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      )}

      {(canShare || canSeeJobs || canSeeBilling) && (
        <div className="flex flex-wrap gap-2">
          {canShare && (
            <button type="button" className="ck-btn ck-btn-primary !px-4 !py-2.5 !text-[13px] max-sm:flex-1" onClick={onShare}>
              {W.share}
            </button>
          )}
          {canSeeJobs && (
            <button type="button" className="ck-btn ck-btn-primary !px-4 !py-2.5 !text-[13px] max-sm:flex-1" onClick={onSeeJobs}>
              {W.seeJobs}
            </button>
          )}
          {canSeeBilling && (
            <button type="button" className="ck-btn ck-btn-outline !px-4 !py-2.5 !text-[13px] max-sm:flex-1" onClick={onSeeBilling}>
              {W.seeBilling}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[124px_1fr] gap-3 px-4 py-3 max-sm:grid-cols-1 max-sm:gap-1" style={{ borderColor: "var(--line)" }}>
      <dt className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--ink-3)" }}>
        {label}
      </dt>
      <dd className="text-[14px] leading-snug" style={{ color: "var(--ink)" }}>
        {children}
      </dd>
    </div>
  );
}

/** The confirmation as a dialog: back from Stripe's hosted page (the fallback), or anywhere a payment is shown once. */
export function PaymentConfirmationDialog({
  open,
  onClose,
  what,
  jobId,
  jobTitle,
  since,
  ...actions
}: { open: boolean; onClose: () => void; what: "job" | "unlimited"; jobId: string | null; jobTitle?: string | null; since: number } & ConfirmationActions) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-[560px] overflow-y-auto" data-payment-confirmation-dialog>
        {/* The visible heading is the confirmation's own; these name the dialog for screen readers. */}
        <DialogTitle className="sr-only">{what === "unlimited" ? "Unlimited" : "Your payment"}</DialogTitle>
        <DialogDescription className="sr-only">What you paid, and what it bought.</DialogDescription>
        <PaymentConfirmation what={what} jobId={jobId} jobTitle={jobTitle} since={since} active={open} {...actions} />
      </DialogContent>
    </Dialog>
  );
}
