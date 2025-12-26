import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ImprovementBlueprintData {
  honestReflection: {
    whatHappened: string;
    scoreContext: string;
    keyInsight: string;
  };
  strengthsToLeverage: {
    identified: Array<{
      strength: string;
      evidence: string;
      futureStrategy: string;
    }>;
    hiddenEdge: string;
  };
  improvementCoaching: Array<{
    area: string;
    whatWasObserved: string;
    whyThisMatters: string;
    improvementStrategy: {
      framework: string;
      practiceScript: string;
      dailyHabit: string;
    };
    resource: {
      name: string;
      url: string;
      whyHelpful: string;
    };
  }>;
  thirtyDayPlan: {
    week1: { focus: string; dailyActions: string[]; successMetric: string };
    week2: { focus: string; dailyActions: string[]; successMetric: string };
    week3: { focus: string; dailyActions: string[]; successMetric: string };
    week4: { focus: string; dailyActions: string[]; successMetric: string };
  };
  closingMessage: {
    personalNote: string;
    immediateActions: string[];
    finalThought: string;
  };
  metadata: {
    candidateName: string;
    candidateEmail: string;
    jobTitle: string;
    overallScore: number;
    generatedAt: string;
    applicationId: string;
  };
}

export function useImprovementBlueprint() {
  const [isGenerating, setIsGenerating] = useState(false);

  const downloadBlueprint = async (applicationId: string) => {
    if (!applicationId) {
      toast.error("Application ID not available");
      return;
    }

    setIsGenerating(true);
    try {
      toast.info("Creating your personalized improvement blueprint...", { duration: 5000 });

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

      // Generate PDF using @react-pdf/renderer - dynamic import to avoid SSR issues
      const { pdf } = await import("@react-pdf/renderer");
      const { ImprovementBlueprintPDF } = await import("@/components/documents/ImprovementBlueprintPDF");
      const React = await import("react");
      
      const blueprintData = data as ImprovementBlueprintData;
      const pdfDocument = React.createElement(ImprovementBlueprintPDF, { data: blueprintData });
      const blob = await pdf(pdfDocument as any).toBlob();
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = blueprintData.metadata?.candidateName?.replace(/[^a-zA-Z0-9]/g, '_') || 'candidate';
      link.download = `Improvement_Blueprint_${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success("Your Improvement Blueprint has been downloaded!");
    } catch (error: any) {
      console.error("Error generating blueprint:", error);
      toast.error(error.message || "Failed to generate improvement blueprint");
    } finally {
      setIsGenerating(false);
    }
  };

  return { downloadBlueprint, isGenerating };
}
