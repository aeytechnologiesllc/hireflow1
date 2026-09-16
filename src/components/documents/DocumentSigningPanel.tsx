import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SignaturePad } from "./SignaturePad";
import { Loader2, PenTool, XCircle } from "lucide-react";

// Same wording as src/lib/auditTrail.ts's electronic_consent_confirmed
// audit entry — one consent statement, reused, not invented twice.
const CONSENT_STATEMENT =
  "I acknowledge that I am signing this document electronically and that my electronic signature has the same legal effect as a handwritten signature.";

const ERROR_MESSAGES: Record<string, string> = {
  already_signed: "Someone already signed this — refresh to see the latest.",
  not_pending: "This document is no longer pending — refresh to see its current state.",
  candidate_has_not_signed: "The candidate hasn't signed yet.",
  locked: "This document is locked and can no longer be changed.",
  expired: "This document has expired.",
  voided: "This document has been voided.",
  not_your_turn: "It isn't your turn to act on this document.",
  consent_required: "You must accept the electronic signature consent statement.",
  review_required: "You must confirm you reviewed the document before countersigning.",
  invalid_signature: "That signature isn't valid — try again.",
  invalid_reason: "Please give a reason between 3 and 500 characters.",
  role_mismatch: "You are not authorized to take this action on this document.",
  unauthorized: "Sign in to continue.",
};

interface DocumentSigningPanelProps {
  documentId: string;
  mode: "sign" | "countersign";
  onComplete: () => void;
}

export function DocumentSigningPanel({ documentId, mode, onComplete }: DocumentSigningPanelProps) {
  const { toast } = useToast();
  const [defaultName, setDefaultName] = useState("");
  const [typedValue, setTypedValue] = useState("");
  const [drawnValue, setDrawnValue] = useState<string | null>(null);
  const [tab, setTab] = useState<"typed" | "drawn">("typed");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeclineForm, setShowDeclineForm] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [isDeclining, setIsDeclining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
      if (!cancelled && data?.full_name) {
        setDefaultName(data.full_name);
        setTypedValue(data.full_name);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("document-signing", { body });
    if (error) {
      // supabase-js surfaces a non-2xx response as `error`, with the parsed
      // body available on error.context — fall back to a generic message
      // if that shape isn't there (network failure, etc).
      let code: string | undefined;
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx) {
          const body = await ctx.clone().json();
          code = body?.error;
        }
      } catch {
        // ignore — fall through to the generic message below
      }
      throw new Error(ERROR_MESSAGES[code ?? ""] ?? "Something went wrong. Please try again.");
    }
    if (data?.error) {
      throw new Error(ERROR_MESSAGES[data.error] ?? data.message ?? "Something went wrong. Please try again.");
    }
    return data;
  };

  const signatureValue = tab === "typed" ? typedValue.trim() : drawnValue;
  const hasSignature = tab === "typed" ? typedValue.trim().length >= 2 : !!drawnValue;
  const canSubmit = consentAccepted && hasSignature && (mode === "sign" || reviewConfirmed) && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit || !signatureValue) return;
    setIsSubmitting(true);
    try {
      await invoke({
        documentId,
        action: mode,
        signature: { method: tab, value: signatureValue, consentAccepted: true },
        ...(mode === "countersign" ? { reviewConfirmed: true } : {}),
      });
      toast({
        title: mode === "sign" ? "Document signed" : "Document countersigned",
        description:
          mode === "sign"
            ? "The employer has been notified to countersign."
            : "This document is now fully executed.",
      });
      onComplete();
    } catch (e) {
      toast({ title: "Couldn't sign", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = async () => {
    const reason = declineReason.trim();
    if (reason.length < 3) {
      toast({ title: "Reason required", description: "Please give a reason between 3 and 500 characters.", variant: "destructive" });
      return;
    }
    setIsDeclining(true);
    try {
      await invoke({ documentId, action: "decline", declineReason: reason });
      toast({ title: "Document declined", description: "The other party has been notified." });
      onComplete();
    } catch (e) {
      toast({ title: "Couldn't decline", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsDeclining(false);
    }
  };

  if (showDeclineForm) {
    return (
      <div className="border-t border-border p-6 bg-destructive/5 space-y-3">
        <p className="text-sm font-medium text-destructive">Decline this document</p>
        <Textarea
          value={declineReason}
          onChange={(e) => setDeclineReason(e.target.value)}
          placeholder="Let the other party know why (3-500 characters)"
          rows={3}
        />
        <div className="flex items-center gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setShowDeclineForm(false)} disabled={isDeclining}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDecline} disabled={isDeclining || declineReason.trim().length < 3}>
            {isDeclining ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <XCircle className="h-4 w-4 mr-2" />}
            Confirm decline
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border p-6 bg-primary/5 space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">
          {mode === "sign" ? "Your signature" : "Countersign this document"}
        </p>
        <p className="text-xs text-muted-foreground">
          {mode === "sign"
            ? "Review the document above, then sign below to send it to the employer."
            : "Review the document and the candidate's signature above, then countersign to finish."}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "typed" | "drawn")}>
        <TabsList>
          <TabsTrigger value="typed">Type</TabsTrigger>
          <TabsTrigger value="drawn">Draw</TabsTrigger>
        </TabsList>
        <TabsContent value="typed" className="pt-2">
          <Input
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            placeholder={defaultName || "Your full legal name"}
            maxLength={120}
          />
        </TabsContent>
        <TabsContent value="drawn" className="pt-2">
          <SignaturePad onChange={setDrawnValue} />
        </TabsContent>
      </Tabs>

      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <Checkbox checked={consentAccepted} onCheckedChange={(v) => setConsentAccepted(v === true)} className="mt-0.5" />
          <span className="text-muted-foreground">{CONSENT_STATEMENT}</span>
        </label>
        {mode === "countersign" && (
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox checked={reviewConfirmed} onCheckedChange={(v) => setReviewConfirmed(v === true)} className="mt-0.5" />
            <span className="text-muted-foreground">
              I've reviewed the document and the candidate's signature before countersigning.
            </span>
          </label>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" size="sm" onClick={() => setShowDeclineForm(true)} className="text-destructive hover:text-destructive">
          Decline
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenTool className="h-4 w-4" />}
          {mode === "sign" ? "Sign document" : "Countersign"}
        </Button>
      </div>
    </div>
  );
}
