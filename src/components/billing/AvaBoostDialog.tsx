import { useEffect, useState } from "react";
import { Megaphone, Loader2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useJobBillingActions } from "@/hooks/useJobBillingActions";

interface AvaBoostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobTitle: string;
}

const TIERS = [
  { cents: 7900, label: "$79" },
  { cents: 14900, label: "$149" },
  { cents: 29900, label: "$299" },
] as const;

const RADIUS_MILES = 15;

/**
 * HireFlow runs the ad — the employer connects nothing. Flat tiers, a
 * best-effort reach estimate (hidden when Meta can't produce one — never a
 * fabricated number), and copy that only ever describes reaching people
 * near the job, never a job board.
 */
export default function AvaBoostDialog({ open, onOpenChange, jobId, jobTitle }: AvaBoostDialogProps) {
  const { buyBoost, reachEstimate } = useJobBillingActions();
  const [tierCents, setTierCents] = useState<(typeof TIERS)[number]["cents"]>(TIERS[1].cents);
  const [loading, setLoading] = useState(false);
  const [reach, setReach] = useState<{ low: number; high: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setReach(null);
    reachEstimate
      .mutateAsync({ jobId, radiusMiles: RADIUS_MILES })
      .then((result) => {
        if (result.available && result.low != null && result.high != null) {
          setReach({ low: result.low, high: result.high });
        }
      })
      .catch(() => {
        // A missing estimate is never an error state for this dialog — just no number shown.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, jobId]);

  const handlePurchase = async () => {
    setLoading(true);
    try {
      const { url } = await buyBoost.mutateAsync({ jobId, tierCents, radiusMiles: RADIUS_MILES });
      if (url) {
        window.location.href = url;
      } else {
        toast({ variant: "warning", title: "Boost unavailable", description: "We couldn't start checkout right now. Please try again in a moment." });
        setLoading(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "We couldn't start Ava Boost checkout right now.";
      toast({ variant: "warning", title: "Unable to start Boost", description: message });
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "var(--hf-gold-soft)" }}>
              <Megaphone className="h-5 w-5" style={{ color: "var(--brass)" }} />
            </div>
            <span>Ava Boost — "{jobTitle}"</span>
          </DialogTitle>
          <DialogDescription className="pt-2">
            HireFlow runs Facebook &amp; Instagram ads for this job from our own ad account — you connect nothing.
            {reach ? (
              <span className="block mt-2 text-sm font-medium text-foreground">
                Reach about {reach.low.toLocaleString()}–{reach.high.toLocaleString()} people near you
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 mt-2">
          {TIERS.map((tier) => (
            <button
              key={tier.cents}
              type="button"
              onClick={() => setTierCents(tier.cents)}
              className="rounded-xl border p-3 text-center transition-all"
              style={
                tierCents === tier.cents
                  ? { borderColor: "var(--brass-line)", background: "var(--hf-gold-soft)" }
                  : { borderColor: "var(--line)", background: "var(--surface)" }
              }
            >
              <div className="text-lg font-bold text-foreground">{tier.label}</div>
            </button>
          ))}
        </div>

        <ul className="mt-3 space-y-1.5 text-sm">
          {[
            `~${RADIUS_MILES}mi around the job`,
            "Card authorized now, charged only once your ad is live",
            "Released automatically if it's not approved within 24h",
          ].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <Check className="h-3.5 w-3.5" style={{ color: "var(--brass)" }} />
              <span className="text-muted-foreground">{f}</span>
            </li>
          ))}
        </ul>

        {/* Brass is reserved for things that cost money, and those are
            outlined, never filled — same rule the cockpit's own
            .ck-btn-paid follows (src/cockpit/cockpit.css). */}
        <Button
          variant="outline"
          className="w-full gap-2 mt-2 bg-transparent"
          style={{ borderColor: "var(--brass-line)", color: "var(--brass)" }}
          onClick={handlePurchase}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : `Boost this job — ${TIERS.find((t) => t.cents === tierCents)?.label}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
