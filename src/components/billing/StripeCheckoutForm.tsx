/**
 * Stripe's payment form, inside HireFlow (Embedded Checkout; 2026-11-01).
 *
 * The card details are typed into Stripe's own form, in Stripe's frame
 * (js.stripe.com / checkout.stripe.com): they never touch HireFlow's page or
 * server. billing-checkout makes the Checkout Session (ui_mode embedded_page,
 * cards only, the business's own customer) and hands back only its client
 * secret; Stripe tells the page when the payment is complete (onComplete),
 * and billing-webhook does the rest, exactly as with Stripe's hosted page.
 *
 * Stripe.js is loaded only when a payment form is opened (the pure loader,
 * from js.stripe.com, as Stripe requires), never on page load. The dev
 * preview, which runs offline, draws its own stand-in form instead
 * (setCheckoutStandIn in src/lib/billingApi.ts).
 */
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { checkoutStandIn, stripePublishableKey } from "@/lib/billingApi";

type Loaded = {
  Provider: ComponentType<{ stripe: Promise<unknown>; options: { clientSecret: string; onComplete: () => void }; children?: ReactNode }>;
  Checkout: ComponentType<{ className?: string; id?: string }>;
  stripe: Promise<unknown>;
};

// One Stripe.js per page, made the first time a form is opened.
let stripeOnce: { key: string; promise: Promise<unknown> } | null = null;

async function loadStripeForm(key: string): Promise<Loaded> {
  const [pure, react] = await Promise.all([import("@stripe/stripe-js/pure"), import("@stripe/react-stripe-js")]);
  if (!stripeOnce || stripeOnce.key !== key) stripeOnce = { key, promise: pure.loadStripe(key) };
  return {
    Provider: react.EmbeddedCheckoutProvider as unknown as Loaded["Provider"],
    Checkout: react.EmbeddedCheckout as unknown as Loaded["Checkout"],
    stripe: stripeOnce.promise,
  };
}

export const CHECKOUT_FORM_WORDS = {
  loading: "Opening the secure payment form…",
  failed: "Stripe's payment form couldn't load. Check your connection, then try again.",
} as const;

export function StripeCheckoutForm({ clientSecret, onComplete }: { clientSecret: string; onComplete: () => void }) {
  const complete = useRef(onComplete);
  complete.current = onComplete;
  const standIn = checkoutStandIn();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (standIn?.Form) return;
    const key = stripePublishableKey();
    if (!key) {
      setFailed(true);
      return;
    }
    let alive = true;
    loadStripeForm(key)
      .then((next) => {
        if (!alive) return;
        setLoaded(next);
        next.stripe.then((stripe) => alive && !stripe && setFailed(true)).catch(() => alive && setFailed(true));
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [standIn]);

  // Stripe's provider takes its options once; onComplete reads the latest callback.
  const options = useMemo(() => ({ clientSecret, onComplete: () => complete.current() }), [clientSecret]);

  if (standIn?.Form) return <standIn.Form clientSecret={clientSecret} onComplete={() => complete.current()} />;

  if (failed) {
    return (
      <p role="alert" className="rounded-xl px-4 py-3 text-[13px]" style={{ color: "var(--hf-danger)", background: "var(--surface-2)" }}>
        {CHECKOUT_FORM_WORDS.failed}
      </p>
    );
  }
  if (!loaded) {
    return (
      <div className="flex min-h-[220px] items-center justify-center gap-2 text-[13px]" style={{ color: "var(--ink-3)" }} role="status">
        <Loader2 className="h-4 w-4 animate-spin" />
        {CHECKOUT_FORM_WORDS.loading}
      </div>
    );
  }
  const { Provider, Checkout } = loaded;
  return (
    <div data-stripe-checkout className="overflow-hidden rounded-xl">
      <Provider stripe={loaded.stripe} options={options}>
        <Checkout />
      </Provider>
    </div>
  );
}
