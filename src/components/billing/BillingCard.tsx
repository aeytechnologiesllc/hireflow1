/**
 * Settings -> Billing -> Your plan, for the business owner (pricing v9;
 * docs/BILLING.md): the plan, when Unlimited renews or ends, a failed
 * payment's warning, "Go Unlimited" (Stripe's form inside HireFlow, then the
 * confirmation in place: CheckoutDialog), and "Manage card or cancel"
 * (Stripe's own billing page: the card, invoices and receipts, cancelling).
 * While billing is off the card is not drawn at all (billingCard answers
 * null), and a teammate or an applicant never sees it (Settings shows the
 * Billing tab to the owner only, never to the exempt account).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBilling } from "@/hooks/useSubscription";
import { BILLING_CARD_WORDS as W, BILLING_TAB_WORDS as T, PRICE_JOB, PRICE_UNLIMITED, PASS_DAYS, billingCard } from "@/lib/billing";
import { openBillingPortal, startCheckout } from "@/lib/billingApi";
import { CheckoutDialog } from "./CheckoutDialog";

export function BillingCard({ onSeeHistory }: { onSeeHistory?: () => void }) {
  const { billing, refetch } = useBilling();
  const navigate = useNavigate();
  const card = billingCard(billing);
  const [busy, setBusy] = useState<"unlimited" | "manage" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  if (!card) return null;

  const go = async (what: "unlimited" | "manage") => {
    setBusy(what);
    setProblem(null);
    const outcome = what === "unlimited" ? await startCheckout("unlimited") : await openBillingPortal();
    if (outcome.kind === "embedded") {
      setBusy(null);
      setClientSecret(outcome.clientSecret);
      return;
    }
    if (outcome.kind === "redirect") {
      window.location.assign(outcome.url);
      return;
    }
    setBusy(null);
    setProblem(outcome.message);
    if (outcome.kind === "publish") void refetch();
  };

  const unlimited = billing?.plan === "unlimited";

  return (
    <Card className="bg-card border-border" data-billing-card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{T.plan}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-display text-[24px] leading-tight" style={{ color: "var(--ink)", fontWeight: 600 }} data-plan-name>
            {unlimited ? "Unlimited" : "Pay per job"}
          </span>
          {/* What it costs: money, brass. */}
          <span className="text-[14px] font-medium" style={{ color: "var(--brass)" }}>
            {unlimited ? PRICE_UNLIMITED : `${PRICE_JOB} a job, ${PASS_DAYS} days each`}
          </span>
        </div>
        {card.lines.slice(1).map((line) => (
          <p key={line} className="text-sm text-foreground">
            {line}
          </p>
        ))}
        {card.warning && (
          <p role="alert" className="text-sm" style={{ color: "var(--under)" }}>
            {card.warning}
          </p>
        )}
        {problem && (
          <p role="alert" className="text-sm" style={{ color: "var(--hf-danger)" }}>
            {problem}
          </p>
        )}
        {(card.canGoUnlimited || card.canManage) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {card.canGoUnlimited && (
              <button type="button" className="ck-btn ck-btn-paid !px-3.5 !py-2 !text-[12.5px]" disabled={busy !== null} onClick={() => void go("unlimited")}>
                {busy === "unlimited" ? W.opening : W.goUnlimited}
              </button>
            )}
            {card.canManage && (
              <button type="button" className="ck-btn ck-btn-outline !px-3.5 !py-2 !text-[12.5px]" disabled={busy !== null} onClick={() => void go("manage")}>
                {busy === "manage" ? W.opening : T.manage}
              </button>
            )}
          </div>
        )}
        {card.canManage && (
          <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            {T.manageNote}
          </p>
        )}
      </CardContent>
      <CheckoutDialog
        clientSecret={clientSecret}
        onClose={() => {
          setClientSecret(null);
          void refetch();
        }}
        onSeeJobs={() => {
          setClientSecret(null);
          navigate("/jobs");
        }}
        onSeeBilling={() => {
          setClientSecret(null);
          onSeeHistory?.();
        }}
      />
    </Card>
  );
}
