import { useCallback, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";

const stripePromise = loadStripe(
  "pk_test_51SYwD8JoMc2msNl4N5h2xsl4PudL7EfI4IaTkYXkQ5xvRyJgL8Ysafhgi0Hyi3HXW2yHvWHXwoayQlkndkkchGY300VdwdmLq3"
);

interface EmbeddedCheckoutDialogProps {
  clientSecret: string | null;
  onClose: () => void;
}

export default function EmbeddedCheckoutDialog({
  clientSecret,
  onClose,
}: EmbeddedCheckoutDialogProps) {
  const { syncSubscription, refetch } = useSubscription();
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleComplete = useCallback(async () => {
    console.log("[EmbeddedCheckout] Payment complete, syncing subscription...");
    setIsSyncing(true);
    try {
      await syncSubscription.mutateAsync();
      await refetch();
      setPaymentComplete(true);
      console.log("[EmbeddedCheckout] Subscription synced successfully");
    } catch (e) {
      console.error("[EmbeddedCheckout] Post-checkout sync error:", e);
      // Still show success - the sync can be retried
      setPaymentComplete(true);
    } finally {
      setIsSyncing(false);
    }
  }, [syncSubscription, refetch]);

  const handleOpenChange = async (open: boolean) => {
    if (!open) {
      // Fallback sync on dialog close if payment wasn't already completed
      if (!paymentComplete) {
        try {
          await syncSubscription.mutateAsync();
          await refetch();
        } catch (e) {
          console.error("Fallback sync error:", e);
        }
      }
      setPaymentComplete(false);
      onClose();
    }
  };

  if (!clientSecret) return null;

  return (
    <Dialog open={!!clientSecret} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogTitle className="sr-only">Checkout</DialogTitle>
        <div className="min-h-[400px]">
          {paymentComplete ? (
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center gap-4">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
              <h3 className="text-xl font-semibold text-foreground">Payment Successful!</h3>
              <p className="text-muted-foreground">
                Your subscription has been activated. You now have full access to all features.
              </p>
              <Button onClick={() => handleOpenChange(false)} className="mt-4">
                Continue
              </Button>
            </div>
          ) : (
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={{ clientSecret, onComplete: handleComplete }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
          {isSyncing && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
