import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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

export function useImprovementBlueprint() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [blueprintData, setBlueprintData] = useState<ImprovementBlueprintData | null>(null);

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
  };
}
