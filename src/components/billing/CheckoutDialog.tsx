/**
 * Going Unlimited from Settings -> Billing, inside HireFlow (2026-11-01):
 * Stripe's own form in a dialog (StripeCheckoutForm), then the confirmation in
 * place (PaymentConfirmation: what was paid, "Unlimited is on ... Renews …",
 * the receipt). BillingCard opens it with the client secret billing-checkout
 * gave; without the publishable key BillingCard goes to Stripe's hosted page
 * instead, as before.
 */
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CHECKOUT_DIALOG_WORDS as C } from "@/lib/billing";
import { PaymentConfirmation, type ConfirmationActions } from "./PaymentConfirmation";
import { StripeCheckoutForm } from "./StripeCheckoutForm";

export function CheckoutDialog({
  clientSecret,
  onClose,
  ...actions
}: { clientSecret: string | null; onClose: () => void } & ConfirmationActions) {
  const [paidAt, setPaidAt] = useState<number | null>(null);
  const open = clientSecret !== null;
  useEffect(() => {
    if (!open) setPaidAt(null);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-[620px] overflow-y-auto" data-payment-step={paidAt ? "paid" : "pay"}>
        {clientSecret && paidAt === null && (
          <>
            <DialogHeader className="pr-6 text-left">
              <DialogTitle>{C.unlimitedTitle}</DialogTitle>
              <DialogDescription className="flex items-start gap-1.5">
                <Lock className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden />
                {C.secure}
              </DialogDescription>
            </DialogHeader>
            <StripeCheckoutForm clientSecret={clientSecret} onComplete={() => setPaidAt(Date.now())} />
          </>
        )}
        {paidAt !== null && (
          <>
            <DialogTitle className="sr-only">{C.paidTitle}</DialogTitle>
            <DialogDescription className="sr-only">{C.paidDescription}</DialogDescription>
            <PaymentConfirmation what="unlimited" jobId={null} since={paidAt} active={open} {...actions} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
