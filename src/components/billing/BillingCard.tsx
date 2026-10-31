/**
 * Settings → Billing, for the business owner (pricing v9; docs/BILLING.md):
 * the plan, when Unlimited renews or ends, "Go Unlimited", and "Manage
 * billing" (Stripe's own page: the card, invoices and receipts, cancelling).
 * The exempt platform account sees "Your account is exempt." While billing is
 * off the card is not drawn at all (billingCard answers null), and a teammate
 * or an applicant never sees it (Settings shows it to the owner only).
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBilling } from "@/hooks/useSubscription";
import { BILLING_CARD_WORDS as W, SETTINGS_RETURN_WORDS as R, billingCard, billingReturn } from "@/lib/billing";
import { openBillingPortal, startCheckout } from "@/lib/billingApi";

export function BillingCard() {
  const { billing, refetch } = useBilling();
  const card = billingCard(billing);
  const [params] = useSearchParams();
  const back = billingReturn(params.get("billing"));
  const [busy, setBusy] = useState<"unlimited" | "manage" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const refresh = useRef(refetch);
  refresh.current = refetch;

  // Back from Checkout for Unlimited: ask again until the webhook has turned it on.
  const waiting = back === "unlimited" && billing?.plan !== "unlimited";
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    let timer: number | undefined;
    const tick = () => {
      const elapsed = Date.now() - started;
      if (elapsed > 5 * 60_000) return;
      if (elapsed > 30_000) setSlow(true);
      void refresh.current();
      timer = window.setTimeout(tick, elapsed > 30_000 ? 10_000 : 2_000);
    };
    timer = window.setTimeout(tick, 1_500);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  if (!card) return null;

  const go = async (what: "unlimited" | "manage") => {
    setBusy(what);
    setProblem(null);
    const outcome = what === "unlimited" ? await startCheckout("unlimited") : await openBillingPortal();
    if (outcome.kind === "redirect") {
      window.location.assign(outcome.url);
      return;
    }
    setBusy(null);
    setProblem(outcome.message);
    if (outcome.kind === "publish") void refetch();
  };

  const returned =
    back === "unlimited" ? (billing?.plan === "unlimited" ? R.on : slow ? R.slow : R.waiting) : back === "cancelled" ? R.cancelled : null;

  return (
    <Card className="bg-card border-border" data-billing-card>
      <CardHeader>
        <CardTitle className="text-lg">{W.title}</CardTitle>
        <CardDescription>{W.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {returned && (
          <p role="status" aria-live="polite" className="text-sm" style={{ color: billing?.plan === "unlimited" ? "var(--good)" : "var(--ink-2)" }}>
            {returned}
          </p>
        )}
        {card.lines.map((line) => (
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
                {busy === "manage" ? W.opening : W.manage}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
