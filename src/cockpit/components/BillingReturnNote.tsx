/**
 * Back from Stripe Checkout on the job page (?billing=paid | unlimited |
 * cancelled; pricing v9, docs/BILLING.md). billing-webhook puts the job live
 * once Stripe confirms the payment, usually within seconds: the page asks
 * again every 2 seconds for half a minute, then every 10 seconds for five
 * minutes, and says so calmly if it is slow. Never shown while billing is
 * off, or not known (billingShown): a link someone made up with ?billing=paid
 * says nothing then.
 */
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import { PAID_RETURN_WORDS as W, billingReturn, billingShown, type BillingState } from "@/lib/billing";

export function BillingReturnNote({ billing, live, onRefresh }: { billing: BillingState | null | undefined; live: boolean; onRefresh: () => void }) {
  const [params, setParams] = useSearchParams();
  const back = billingShown(billing) ? billingReturn(params.get("billing")) : null;
  const [slow, setSlow] = useState(false);
  const startedAt = useRef<number>(Date.now());
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  const waiting = (back === "paid" || back === "unlimited") && !live;

  useEffect(() => {
    if (!waiting) return;
    startedAt.current = Date.now();
    let timer: number | undefined;
    const tick = () => {
      const elapsed = Date.now() - startedAt.current;
      if (elapsed > 5 * 60_000) return;
      if (elapsed > 30_000) setSlow(true);
      refresh.current();
      timer = window.setTimeout(tick, elapsed > 30_000 ? 10_000 : 2_000);
    };
    timer = window.setTimeout(tick, 1_500);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  if (!back || back === "back") return null;

  const dismiss = () => {
    const next = new URLSearchParams(params);
    next.delete("billing");
    setParams(next, { replace: true });
  };

  const message =
    back === "cancelled" ? W.cancelled : live ? (back === "unlimited" ? W.liveUnlimited : W.live) : slow ? W.slow : W.waiting;
  const tone = back === "cancelled" ? "var(--ink-2)" : live ? "var(--good)" : "var(--ink-2)";

  return (
    <div
      role="status"
      aria-live="polite"
      data-billing-return={back}
      className="ck-card-flat ck-reveal flex items-start gap-3 px-4 py-3"
    >
      <p className="min-w-0 flex-1 text-[13.5px] leading-snug" style={{ color: tone }}>
        {message}
      </p>
      <button type="button" aria-label="Dismiss" className="shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100" onClick={dismiss}>
        <X className="h-4 w-4" style={{ color: "var(--ink-3)" }} />
      </button>
    </div>
  );
}
