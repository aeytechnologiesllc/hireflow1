import { useCallback } from "react";
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
import { Loader2 } from "lucide-react";
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

  const handleComplete = useCallback(async () => {
    try {
      await syncSubscription.mutateAsync();
      await refetch();
    } catch (e) {
      console.error("Post-checkout sync error:", e);
    }
  }, [syncSubscription, refetch]);

  const handleOpenChange = async (open: boolean) => {
    if (!open) {
      await handleComplete();
      onClose();
    }
  };

  if (!clientSecret) return null;

  return (
    <Dialog open={!!clientSecret} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogTitle className="sr-only">Checkout</DialogTitle>
        <div className="min-h-[400px]">
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{ clientSecret }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}
