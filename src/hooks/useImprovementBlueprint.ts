import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generateImprovementBlueprint, ImprovementBlueprintData } from "@/utils/generateImprovementBlueprint";
import { toast } from "sonner";

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

      generateImprovementBlueprint(data as ImprovementBlueprintData);
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
