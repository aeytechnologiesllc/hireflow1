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
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, Loader2, Lock } from "lucide-react";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
  const reduce = useReducedMotion();
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
    // About the form's own height, so the dialog does not jump when Stripe's form arrives.
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-[13px] sm:min-h-[640px]" style={{ color: PAY_INK_SOFT }} role="status">
        <Loader2 className="h-4 w-4 animate-spin" />
        {CHECKOUT_FORM_WORDS.loading}
      </div>
    );
  }
  const { Provider, Checkout } = loaded;
  return (
    <motion.div data-stripe-checkout initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduce ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}>
      <Provider stripe={loaded.stripe} options={options}>
        <Checkout />
      </Provider>
    </motion.div>
  );
}

/*
 * The payment dialog's own look while Stripe's form is in it (the owner's in-app payment, 2026-11-02: "you're
 * putting a container on above the Stripe checkout dialogue, and it's making it look weird", "a weird scroll on the
 * desktop", "no animation when the dialogue opens"). Stripe's form is white and cannot take HireFlow's paper, so the
 * dialog is white around it, the form edge to edge with no box of its own, and 1,000 px wide on a computer: there
 * Stripe lays it out in two columns, 687 px tall (measured on the live account, without Link), so it fits a laptop
 * screen. Below that, one column (797 px). The size and colour change between the dialog's steps runs smoothly.
 */
export const PAY_DIALOG_CLASS = "max-w-[1000px] !max-h-[96dvh] !gap-0 !p-0";
export const PAY_DIALOG_STYLE = { background: "#FFFFFF", color: "#1D3329" } as const;
export const DIALOG_STEP_EASE = "transition-[max-width,background-color] duration-300 ease-out";
/** A dialog that opens on Stripe's form takes focus itself, never "Choose another way" with a ring around it. */
export function focusDialogItself(e: Event) {
  e.preventDefault();
  (e.currentTarget as HTMLElement | null)?.focus();
}
const PAY_INK_SOFT = "#4B5D53";

/** Stripe's form with the dialog's slim top line: what is paid for, that the card goes to Stripe, and a way back. */
export function StripePayPanel({
  title,
  secure,
  clientSecret,
  onComplete,
  back,
}: {
  title: string;
  secure: string;
  clientSecret: string;
  onComplete: () => void;
  back?: { label: string; onBack: () => void };
}) {
  return (
    <div className="flex min-w-0 flex-col" data-stripe-pay-panel>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 pr-14 sm:px-6 sm:pr-14" style={{ borderColor: "#E7E9E4" }}>
        {back && (
          <button type="button" className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[12.5px] font-medium transition-colors hover:bg-black/5" style={{ color: PAY_INK_SOFT }} onClick={back.onBack}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {back.label}
          </button>
        )}
        <div className="min-w-0">
          <DialogTitle className="!font-sans !text-[15px] !leading-tight" style={{ color: "#1D3329" }}>
            {title}
          </DialogTitle>
          <DialogDescription className="mt-0.5 flex items-center gap-1.5 text-[12px] leading-snug" style={{ color: PAY_INK_SOFT }}>
            <Lock className="h-3 w-3 shrink-0" aria-hidden />
            {secure}
          </DialogDescription>
        </div>
      </div>
      <StripeCheckoutForm clientSecret={clientSecret} onComplete={onComplete} />
    </div>
  );
}
