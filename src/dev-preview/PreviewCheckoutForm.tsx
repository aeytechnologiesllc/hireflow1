/**
 * Dev-preview-only. A stand-in for Stripe's embedded payment form
 * (src/components/billing/StripeCheckoutForm.tsx), which the offline preview
 * cannot load: Stripe.js comes from js.stripe.com. It is drawn to look like
 * Stripe's form is laid out (the amount, the email, the card, Pay), says
 * plainly that it is a stand-in, and "pays" with no card: the preview's
 * webhook (previewBilling.ts) then records the payment a few seconds later.
 * Never in a built app (src/dev-preview/ is dev only).
 */
import { useState } from "react";

export function makePreviewCheckoutForm(onPaid: (clientSecret: string) => void) {
  return function PreviewCheckoutForm({ clientSecret, onComplete }: { clientSecret: string; onComplete: () => void }) {
    const [paying, setPaying] = useState(false);
    // cs_test_preview_<kind>_<cents>_secret_…
    const [, , , kind, cents] = clientSecret.split("_");
    const amount = `$${(Number(cents) / 100).toFixed(2)}`;
    const field = "w-full rounded-md border border-[#e0e0e0] bg-white px-3 py-2.5 text-[14px] text-[#30313d]";
    return (
      <div className="rounded-xl bg-white p-5 text-[#30313d]" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }} data-preview-checkout>
        <p className="mb-4 rounded-md bg-[#fff8e1] px-3 py-2 text-[12px] text-[#6b5900]">
          Preview stand-in for Stripe&rsquo;s payment form (Stripe.js cannot load offline). The real form is Stripe&rsquo;s own, in its frame.
        </p>
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md text-[13px] font-bold text-white" style={{ background: "#0C2A21" }}>
            H
          </span>
          <div>
            <div className="text-[14px] text-[#6d6e78]">Pay HireFlow</div>
            <div className="text-[28px] font-semibold leading-tight">
              {amount}
              {kind === "unlimited" && <span className="ml-1 text-[14px] font-normal text-[#6d6e78]">per month</span>}
            </div>
          </div>
        </div>
        <label className="mb-1 block text-[13px] text-[#6d6e78]">Email</label>
        <div className={`${field} mb-4 text-[#6d6e78]`}>owner@cafe.example</div>
        <label className="mb-1 block text-[13px] text-[#6d6e78]">Card information</label>
        <div className={`${field} rounded-b-none`}>4242 4242 4242 4242</div>
        <div className="mb-4 grid grid-cols-2">
          <div className={`${field} rounded-none rounded-bl-md border-t-0`}>12 / 34</div>
          <div className={`${field} rounded-none rounded-br-md border-l-0 border-t-0`}>123</div>
        </div>
        <label className="mb-1 block text-[13px] text-[#6d6e78]">Cardholder name</label>
        <div className={`${field} mb-5`}>Pat Lee</div>
        <button
          type="button"
          disabled={paying}
          className="w-full rounded-md py-3 text-[15px] font-semibold text-white disabled:opacity-70"
          style={{ background: "#0C6B50" }}
          onClick={() => {
            setPaying(true);
            onPaid(clientSecret);
            window.setTimeout(onComplete, 700);
          }}
        >
          {paying ? "Processing…" : kind === "unlimited" ? "Subscribe" : "Pay"}
        </button>
        <p className="mt-3 text-center text-[12px] text-[#6d6e78]">Powered by Stripe</p>
      </div>
    );
  };
}
