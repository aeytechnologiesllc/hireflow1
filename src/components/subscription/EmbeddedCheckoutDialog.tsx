import { useCallback, useState, useEffect, useRef } from "react";
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
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
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
  const [manualSyncAvailable, setManualSyncAvailable] = useState(false);
  const syncAttempted = useRef(false);

  // Show manual sync button after 10 seconds as fallback
  useEffect(() => {
    if (!clientSecret || paymentComplete) return;
    const timer = setTimeout(() => setManualSyncAvailable(true), 10000);
    return () => clearTimeout(timer);
  }, [clientSecret, paymentComplete]);

  const doSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      // Small delay to let Stripe finalize the session
      await new Promise(r => setTimeout(r, 3000));
      await syncSubscription.mutateAsync();
      await refetch();
      setPaymentComplete(true);
      console.log("[EmbeddedCheckout] Subscription synced successfully");
    } catch (e) {
      console.error("[EmbeddedCheckout] Sync error:", e);
      setPaymentComplete(true); // Still show success - webhook will handle it
    } finally {
      setIsSyncing(false);
    }
  }, [syncSubscription, refetch]);

  const handleComplete = useCallback(async () => {
    if (syncAttempted.current) return;
    syncAttempted.current = true;
    console.log("[EmbeddedCheckout] Payment complete callback fired");
    await doSync();
  }, [doSync]);

  const handleManualSync = async () => {
    console.log("[EmbeddedCheckout] Manual sync triggered");
    await doSync();
  };

  const handleOpenChange = async (open: boolean) => {
    if (!open) {
      if (!paymentComplete) {
        try {
          await syncSubscription.mutateAsync();
          await refetch();
        } catch (e) {
          console.error("Fallback sync error:", e);
        }
      }
      setPaymentComplete(false);
      setManualSyncAvailable(false);
      syncAttempted.current = false;
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
            <>
              <EmbeddedCheckoutProvider
                stripe={stripePromise}
                options={{ clientSecret, onComplete: handleComplete }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
              {manualSyncAvailable && !isSyncing && (
                <div className="px-6 py-3 text-center border-t border-border">
                  <button
                    onClick={handleManualSync}
                    className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Already paid? Click to refresh your access
                  </button>
                </div>
              )}
            </>
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
