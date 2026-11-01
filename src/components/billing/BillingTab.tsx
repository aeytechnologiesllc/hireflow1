/**
 * Settings -> Billing (2026-11-01), the business owner's, while billing is on
 * and never for the exempt account (billingTabShown). The owner, after
 * paying: "if I go to my settings ... I don't get to see what package I'm on
 * ... It doesn't show any invoice history."
 *
 *   - Your plan (BillingCard): the plan, Go Unlimited, Manage card or cancel;
 *   - Live jobs: each live job with its days left as a ring (DaysRing);
 *   - Payment history: every payment from HireFlow's own records (the date,
 *     what it paid for, the amount actually charged, Stripe's receipt);
 *   - back from Stripe's hosted page (the fallback) for Unlimited: the
 *     confirmation, once; "No payment was taken" after a cancelled one.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEmployerJobs } from "@/hooks/useJobs";
import { useBilling } from "@/hooks/useSubscription";
import { BILLING_TAB_WORDS as T, SETTINGS_RETURN_WORDS as R, billingReturn, billingShown, paymentHistoryRows, planSummary } from "@/lib/billing";
import { externalHref } from "@/lib/safeLink";
import { BillingCard } from "./BillingCard";
import { DaysRing } from "./DaysRing";
import { PaymentConfirmationDialog } from "./PaymentConfirmation";

export function BillingTab() {
  const { billing } = useBilling();
  const { data: jobs } = useEmployerJobs();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const back = billingShown(billing) ? billingReturn(params.get("billing")) : null;
  const [since] = useState(() => Date.now());
  const historyRef = useRef<HTMLDivElement | null>(null);

  const live = useMemo(() => (jobs ?? []).filter((j) => j.status === "published").map((j) => ({ id: j.id, title: j.title })), [jobs]);
  const plan = planSummary(billing, live);
  const rows = paymentHistoryRows(billing);

  const clearReturn = () => {
    const next = new URLSearchParams(params);
    next.delete("billing");
    setParams(next, { replace: true });
  };
  const seeHistory = () => historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // "#payment-history" (the plan button's Payment history) scrolls to it once the page has it.
  useEffect(() => {
    if (window.location.hash === "#payment-history" && rows) {
      const timer = window.setTimeout(seeHistory, 120);
      return () => window.clearTimeout(timer);
    }
  }, [rows !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6" data-billing-tab>
      {back === "cancelled" && (
        <p role="status" className="ck-card-flat px-4 py-3 text-[13.5px]" style={{ color: "var(--ink-2)" }}>
          {R.cancelled}
        </p>
      )}

      <BillingCard onSeeHistory={seeHistory} />

      {plan && (
        <Card className="bg-card border-border" data-billing-live-jobs>
          <CardHeader>
            <CardTitle className="text-lg">{T.live}</CardTitle>
            <CardDescription>{plan.name === "Unlimited" ? T.liveUnlimited : T.liveNote}</CardDescription>
          </CardHeader>
          <CardContent>
            {plan.jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">{T.liveNone}</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
                {plan.jobs.map((job) => (
                  <li key={job.id} className="flex items-center gap-3 py-2.5" style={{ borderColor: "var(--line)" }} data-billing-job={job.id}>
                    {job.daysLeft !== null ? (
                      <DaysRing left={job.daysLeft} total={job.total} size={36} />
                    ) : (
                      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--action)" }} />
                      </span>
                    )}
                    <Link to={`/jobs/${job.id}`} className="min-w-0 flex-1 truncate text-[14px] font-medium hover:underline" style={{ color: "var(--ink)" }}>
                      {job.title}
                    </Link>
                    <span className="shrink-0 text-[13px]" style={{ color: job.daysLeft !== null && job.daysLeft <= 3 ? "var(--under)" : "var(--ink-3)" }}>
                      {job.line}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div ref={historyRef} id="payment-history" className="scroll-mt-6">
        <Card className="bg-card border-border" data-billing-history>
          <CardHeader>
            <CardTitle className="text-lg">{T.history}</CardTitle>
            <CardDescription>{T.historyNote}</CardDescription>
          </CardHeader>
          <CardContent>
            {rows === null ? (
              <p className="text-sm text-muted-foreground">{T.historyUnread}</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{billing?.freeJobAvailable ? T.historyEmptyFree : T.historyEmpty}</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
                {rows.map((row) => {
                  const receipt = externalHref(row.receiptUrl);
                  return (
                    <li key={row.key} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[110px_1fr_auto_auto]" style={{ borderColor: "var(--line)" }} data-billing-payment>
                      <span className="text-[13px] tabular-nums max-sm:col-span-2" style={{ color: "var(--ink-3)" }}>
                        {row.date}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium" style={{ color: "var(--ink)" }}>
                          {row.what}
                        </span>
                        {row.period && (
                          <span className="block text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                            {row.period}
                          </span>
                        )}
                      </span>
                      <span className="text-right text-[14px] font-semibold tabular-nums" style={{ color: row.refunded ? "var(--ink-3)" : "var(--ink)" }}>
                        {row.refunded ? (
                          <>
                            <s>{row.amount ?? ""}</s> <span className="ml-1 text-[12px] font-medium">{T.refunded}</span>
                          </>
                        ) : (
                          row.amount ?? ""
                        )}
                      </span>
                      <span className="text-right max-sm:col-span-2 max-sm:text-left">
                        {receipt ? (
                          <a
                            href={receipt}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[13px] font-medium underline-offset-2 hover:underline"
                            style={{ color: "var(--action-soft-fg)" }}
                          >
                            {T.receipt}
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          </a>
                        ) : (
                          <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                            {"—"}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Back from Stripe's hosted page for Unlimited (the fallback before the publishable key is set). */}
      <PaymentConfirmationDialog
        open={back === "unlimited"}
        onClose={clearReturn}
        what="unlimited"
        jobId={null}
        since={since}
        onSeeJobs={() => navigate("/jobs")}
        onSeeBilling={() => {
          clearReturn();
          seeHistory();
        }}
      />
    </div>
  );
}
