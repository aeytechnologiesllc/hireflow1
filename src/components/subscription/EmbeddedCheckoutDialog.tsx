import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, RefreshCw } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import SubscriptionSuccessModal from "./SubscriptionSuccessModal";

const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
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

  const doSync = useCallback(async (attempt = 1): Promise<boolean> => {
    setIsSyncing(true);
    try {
      // Increasing delay per attempt to let Stripe finalize
      const delay = attempt === 1 ? 2000 : attempt === 2 ? 4000 : 6000;
      await new Promise(r => setTimeout(r, delay));
      const result = await syncSubscription.mutateAsync();
      await refetch();
      if (result?.synced) {
        setPaymentComplete(true);
        return true;
      }
      // Retry up to 3 times
      if (attempt < 3) {
        return doSync(attempt + 1);
      }
      // After retries exhausted, show success anyway - webhook will catch up
      setPaymentComplete(true);
      return false;
    } catch (e) {
      console.error("[EmbeddedCheckout] Sync error on attempt", attempt, e);
      if (attempt < 3) {
        return doSync(attempt + 1);
      }
      setPaymentComplete(true); // Fallback - webhook will handle it
      return false;
    } finally {
      if (attempt >= 3 || syncAttempted.current) {
        setIsSyncing(false);
      }
    }
  }, [syncSubscription, refetch]);

  const handleComplete = useCallback(async () => {
    if (syncAttempted.current) return;
    syncAttempted.current = true;
    await doSync();
  }, [doSync]);

  const handleManualSync = async () => {
    await doSync();
  };

  const checkoutOptions = useMemo(() => {
    return {
      clientSecret: clientSecret ?? "",
      onComplete: handleComplete,
    };
  }, [clientSecret, handleComplete]);

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
        <DialogDescription className="sr-only">
          Complete your HireFlow subscription securely with Stripe.
        </DialogDescription>
        <div className="min-h-[400px]">
          {paymentComplete ? (
            <SubscriptionSuccessModal
              planType="growth"
              onClose={() => handleOpenChange(false)}
            />
          ) : (
            <>
              <EmbeddedCheckoutProvider
                key={clientSecret}
                stripe={stripePromise}
                options={checkoutOptions}
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
