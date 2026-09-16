import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { parseApplicationNotes } from "@/lib/applicationNotes";

export interface ImprovementBlueprintData {
  summary: {
    whatHappened: string;
    keyTakeaway: string;
  };
  whatWentWell: Array<{
    strength: string;
    evidence: string;
    howToUseItNextTime: string;
  }>;
  gapsForThisRole: Array<{
    area: string;
    requirement: string;
    whatWeObserved: string;
    whyItMatters: string;
    practiceSteps: Array<{ action: string; example: string }>;
  }>;
  presentingYourExperience: {
    observation: string;
    suggestion: string;
    example: string;
  };
  practicePlan: {
    thisWeek: string[];
    nextTwoWeeks: string[];
  };
  rolesToConsiderNext: Array<{ roleType: string; why: string }>;
  closing: {
    note: string;
    disclaimer: string;
  };
  metadata: {
    candidateName: string;
    jobTitle: string;
    overallScore: number;
    passingScore: number;
    generatedAt: string;
    applicationId: string;
    completedPhases: string[];
    dataDepth: "minimal" | "moderate" | "comprehensive";
    dataDepthMessage?: string;
  };
}

// Permanent cache key - blueprints are locked forever after first generation
const BLUEPRINT_CACHE_KEY = "improvement_blueprint";

// Blueprint price in cents — only charged once app_settings 'blueprint_paid'
// is true (see useBlueprintBilling below). While it's false the report is
// free/included, matching the free tier being open on purpose.
export const BLUEPRINT_PRICE_CENTS = 199;
export const BLUEPRINT_PRICE_FORMATTED = "$1.99";

/**
 * Reads the single server-side switch that decides whether the Improvement
 * Blueprint is a paid purchase or included free — app_settings key
 * 'blueprint_paid' (supabase/migrations/20260916160000_blueprint_entitlement_and_purchase_integrity.sql).
 * Public, read-only table; no auth required. Actual access is still
 * enforced server-side in ai-generate-performance-report regardless of what
 * this returns — this only drives what the UI offers/says.
 */
export function useBlueprintBilling() {
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", "blueprint_paid")
          .maybeSingle();
        if (!cancelled) {
          setBillingEnabled(!error && data?.value === true);
        }
      } catch {
        if (!cancelled) setBillingEnabled(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { billingEnabled, isLoadingBilling: isLoading };
}

export function useImprovementBlueprint() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isCheckingPurchase, setIsCheckingPurchase] = useState(false);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [blueprintData, setBlueprintData] = useState<ImprovementBlueprintData | null>(null);
  const { user } = useAuth();
  const { billingEnabled, isLoadingBilling } = useBlueprintBilling();

  // A candidate has access when they've actually purchased, OR billing is
  // off entirely (free tier) — mirrors canAccessPerformanceReport's
  // candidate path server-side. The server re-checks this independently on
  // every call; this is only for what the UI shows.
  const hasAccess = hasPurchased || !billingEnabled;

  // Check if user has purchased the blueprint for a given application
  const checkPurchaseStatus = useCallback(async (applicationId: string) => {
    if (!applicationId || !user) {
      setHasPurchased(false);
      return false;
    }

    setIsCheckingPurchase(true);
    try {
      const { data, error } = await supabase
        .from("blueprint_purchases")
        .select("id")
        .eq("application_id", applicationId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error checking purchase status:", error);
        setHasPurchased(false);
        return false;
      }

      const purchased = !!data;
      setHasPurchased(purchased);
      return purchased;
    } catch (error) {
      console.error("Error checking purchase:", error);
      setHasPurchased(false);
      return false;
    } finally {
      setIsCheckingPurchase(false);
    }
  }, [user]);

  // Verify purchase after Stripe redirect and record it
  const verifyPurchase = useCallback(async (sessionId: string, applicationId: string) => {
    if (!sessionId || !applicationId) return false;

    try {
      const { data, error } = await supabase.functions.invoke('verify-blueprint-purchase', {
        body: { sessionId, applicationId }
      });

      if (error) {
        console.error("Error verifying purchase:", error);
        return false;
      }

      if (data?.success) {
        setHasPurchased(true);
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error verifying purchase:", error);
      return false;
    }
  }, []);

  // Initiate purchase flow (only reachable when billing is on — the UI
  // hides this behind hasAccess, and purchase-blueprint itself refuses to
  // open checkout while app_settings 'blueprint_paid' is false)
  const purchaseBlueprint = async (applicationId: string) => {
    if (!applicationId) {
      toast.error("Application ID not available");
      return;
    }

    setIsPurchasing(true);
    try {
      const { data, error } = await supabase.functions.invoke('purchase-blueprint', {
        body: { applicationId }
      });

      if (error) {
        console.error("Error creating checkout:", error);
        toast.error("Failed to start checkout. Please try again.");
        return;
      }

      if (data?.url) {
        // Redirect to Stripe checkout
        window.location.href = data.url;
      } else {
        toast.error(data?.error || "Failed to create checkout session");
      }
    } catch (error: unknown) {
      console.error("Error purchasing blueprint:", error);
      const message = error instanceof Error ? error.message : "Failed to start checkout";
      toast.error(message);
    } finally {
      setIsPurchasing(false);
    }
  };

  // Fetch the cached blueprint from application notes, or generate it once
  // (permanently locked after that — see BLUEPRINT_CACHE_KEY). Shared by
  // both the in-app view and the PDF download so a candidate never gets two
  // different reports for the same application.
  const loadBlueprint = useCallback(async (applicationId: string): Promise<ImprovementBlueprintData | null> => {
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select("notes")
      .eq("id", applicationId)
      .single();

    if (fetchError) {
      console.error("Error fetching application:", fetchError);
      throw new Error("Failed to check for existing blueprint");
    }

    const notes = parseApplicationNotes(application?.notes as string | null);

    if (notes[BLUEPRINT_CACHE_KEY]) {
      return notes[BLUEPRINT_CACHE_KEY] as ImprovementBlueprintData;
    }

    const { data, error } = await supabase.functions.invoke('ai-generate-performance-report', {
      body: { applicationId }
    });

    if (error) {
      console.error("Error from edge function:", error);
      throw new Error(error.message || "Failed to generate blueprint");
    }

    if (!data || data.error) {
      throw new Error(data?.error || "No data received");
    }

    const generated = data as ImprovementBlueprintData;

    const updatedNotes = {
      ...notes,
      [BLUEPRINT_CACHE_KEY]: generated,
      improvement_blueprint_generated_at: new Date().toISOString(),
    };

    await supabase
      .from("applications")
      .update({ notes: JSON.stringify(updatedNotes) })
      .eq("id", applicationId);

    return generated;
  }, []);

  // Load the blueprint into state for an in-app view (no PDF, no download)
  const viewBlueprint = useCallback(async (applicationId: string) => {
    if (!applicationId) {
      toast.error("Application ID not available");
      return null;
    }
    setIsGenerating(true);
    try {
      toast.info("Preparing your report...", { duration: 3000 });
      const data = await loadBlueprint(applicationId);
      setBlueprintData(data);
      return data;
    } catch (error: unknown) {
      console.error("Error loading blueprint:", error);
      const message = error instanceof Error ? error.message : "Failed to load your report";
      toast.error(message);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [loadBlueprint]);

  const downloadBlueprint = async (applicationId: string) => {
    if (!applicationId) {
      toast.error("Application ID not available");
      return;
    }

    setIsGenerating(true);
    try {
      toast.info("Preparing your report...", { duration: 3000 });
      const blueprintDataForPdf = await loadBlueprint(applicationId);
      setBlueprintData(blueprintDataForPdf);

      // Generate PDF using server-side edge function
      toast.info("Generating your PDF...", { duration: 2000 });

      const { data: pdfResult, error: pdfError } = await supabase.functions.invoke('generate-blueprint-pdf', {
        body: { blueprintData: blueprintDataForPdf }
      });

      if (pdfError) {
        console.error("Error generating PDF:", pdfError);
        throw new Error(pdfError.message || "Failed to generate PDF");
      }

      if (!pdfResult?.pdf) {
        throw new Error("No PDF data received");
      }

      // Convert base64 to blob and download (server already extracted base64)
      const base64Data = pdfResult.pdf;
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = pdfResult.fileName || `Improvement_Blueprint.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Your Improvement Blueprint has been downloaded!");
    } catch (error: unknown) {
      console.error("Error generating blueprint:", error);
      const message = error instanceof Error ? error.message : "Failed to generate improvement blueprint";
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  return {
    downloadBlueprint,
    viewBlueprint,
    blueprintData,
    isGenerating,
    purchaseBlueprint,
    isPurchasing,
    checkPurchaseStatus,
    isCheckingPurchase,
    hasPurchased,
    hasAccess,
    billingEnabled,
    isLoadingBilling,
    verifyPurchase,
  };
}
