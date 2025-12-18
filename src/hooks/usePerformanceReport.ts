import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generatePerformanceReport, PerformanceReportData } from "@/utils/generatePerformanceReport";
import { toast } from "sonner";

export function usePerformanceReport() {
  const [isGenerating, setIsGenerating] = useState(false);

  const downloadReport = async (applicationId: string) => {
    if (!applicationId) {
      toast.error("Application ID not available");
      return;
    }

    setIsGenerating(true);
    try {
      toast.info("Generating comprehensive AI analysis...", { duration: 5000 });

      const { data, error } = await supabase.functions.invoke('ai-generate-performance-report', {
        body: { applicationId }
      });

      if (error) {
        console.error("Error from edge function:", error);
        throw new Error(error.message || "Failed to generate report");
      }

      if (!data || data.error) {
        throw new Error(data?.error || "No report data received");
      }

      generatePerformanceReport(data as PerformanceReportData);
      toast.success("Performance report downloaded!");
    } catch (error: any) {
      console.error("Error generating report:", error);
      toast.error(error.message || "Failed to generate performance report");
    } finally {
      setIsGenerating(false);
    }
  };

  return { downloadReport, isGenerating };
}
