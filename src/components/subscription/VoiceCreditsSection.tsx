import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { usePricing } from "@/hooks/usePricing";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, Clock, AlertTriangle, Package } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export default function VoiceCreditsSection() {
  const { subscription, voiceCredits, purchaseVoiceCredits, showLowBalanceWarning } = useSubscription();
  const pricing = usePricing();
  const [loading, setLoading] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const queryClient = useQueryClient();

  // Realtime subscription for voice credits updates
  useEffect(() => {
    const channel = supabase
      .channel('voice-credits-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'voice_credits',
        },
        (payload) => {
          console.log('Voice credits updated:', payload);
          queryClient.invalidateQueries({ queryKey: ['subscription'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Verify voice credits purchase on return from Stripe
  useEffect(() => {
    const verifyPurchase = async () => {
      const params = new URLSearchParams(window.location.search);
      const voiceCreditsParam = params.get('voice_credits');
      const sessionId = params.get('session_id');
      
      if (voiceCreditsParam === 'success' && sessionId && !verifying) {
        setVerifying(true);
        
        try {
          const { data, error } = await supabase.functions.invoke('verify-voice-credits-purchase', {
            body: { sessionId }
          });
          
          if (error) {
            console.error('Error verifying purchase:', error);
            toast.error('Failed to verify purchase. Please contact support if credits are missing.');
            // Retry after 2 seconds in case of timing issue
            setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: ['subscription'] });
            }, 2000);
          } else if (data?.already_granted) {
            toast.success('Voice credits already added!');
          } else if (data?.success) {
            toast.success(`${data.minutes_added} voice minutes added!`);
          }
          
          // Refresh subscription data
          queryClient.invalidateQueries({ queryKey: ['subscription'] });
          
        } catch (err) {
          console.error('Verification error:', err);
          toast.error('Error verifying purchase');
          // Retry after 2 seconds
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['subscription'] });
          }, 2000);
        } finally {
          setVerifying(false);
          // Clean URL
          window.history.replaceState({}, '', '/settings?tab=subscription');
        }
      }
    };
    
    verifyPurchase();
  }, [queryClient, verifying]);

  const hasVoicePlan = ['business', 'enterprise'].includes(subscription?.plan_type || '') && subscription?.status === 'active';
  const isTrialing = subscription?.status === 'trialing';
  
  // Show for Business/Enterprise users and trial users (who have voice credits)
  if (!hasVoicePlan && !isTrialing) return null;
  
  // Don't show if no voice credits available and not on a voice plan
  if (voiceCredits.totalMinutesAvailable <= 0 && !hasVoicePlan) return null;

  const handlePurchase = async (packSize: 'small' | 'medium' | 'large') => {
    setLoading(packSize);
    try {
      const result = await purchaseVoiceCredits.mutateAsync({ packSize });
      if (result?.url) {
        // Open in same tab so verification runs properly on return
        window.location.href = result.url;
      }
    } catch (err) {
      toast.error('Failed to start checkout');
    } finally {
      setLoading(null);
    }
  };

  const formatMinutes = (minutes: number) => {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const mins = Math.round(minutes % 60);
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    return `${Math.round(minutes)}m`;
  };

  return (
    <div className="p-6 rounded-xl border border-purple-500/30 bg-gradient-to-b from-purple-500/5 to-transparent">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20 border border-purple-500/30">
            <Mic className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Voice Minutes</h3>
            <p className="text-sm text-muted-foreground">AVA Voice Assistant & Interviews</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-purple-400">
            {formatMinutes(voiceCredits.totalMinutesAvailable)}
          </div>
          <p className="text-xs text-muted-foreground">available</p>
        </div>
      </div>

      {/* Low balance warning */}
      {showLowBalanceWarning() && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2"
        >
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-200">
            Low balance! Purchase more minutes to avoid service interruption.
          </p>
        </motion.div>
      )}

      {/* Credits breakdown - only show for Business/Enterprise users */}
      {hasVoicePlan && voiceCredits.credits.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Active Credit Packs</p>
          {voiceCredits.credits.map((credit) => (
            <div key={credit.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm">
              <div className="flex items-center gap-2">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-foreground">
                  {credit.source === 'subscription' ? 'Monthly' : credit.pack_size?.charAt(0).toUpperCase() + credit.pack_size?.slice(1)} Pack
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-purple-400 font-medium">{formatMinutes(credit.minutes_remaining)}</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Exp {format(new Date(credit.expires_at), "MMM d")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Purchase options - only show for Business/Enterprise users */}
      {hasVoicePlan && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Buy More Minutes</p>
          <div className="grid grid-cols-3 gap-2">
            {(['small', 'medium', 'large'] as const).map((size) => {
              const pack = pricing.voiceCredits[size];
              return (
                <Button
                  key={size}
                  variant="outline"
                  className="flex-col h-auto py-3 border-purple-500/30 hover:bg-purple-500/10 hover:border-purple-500/50"
                  onClick={() => handlePurchase(size)}
                  disabled={loading !== null}
                >
                  {loading === size ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <span className="text-lg font-bold text-purple-400">{pack.minutes}</span>
                      <span className="text-xs text-muted-foreground">minutes</span>
                      <span className="text-sm font-medium text-foreground mt-1">{pack.priceFormatted}</span>
                    </>
                  )}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-center text-muted-foreground mt-2">
            All voice minutes reset at the end of each billing cycle
          </p>
        </div>
      )}

      {/* Trial user message */}
      {isTrialing && (
        <div className="text-center space-y-1">
          <p className="text-sm text-foreground">15 voice minutes included with your trial</p>
          <p className="text-xs text-muted-foreground">
            Upgrade to Business for 30 voice minutes/month + ability to purchase more
          </p>
        </div>
      )}
    </div>
  );
}
