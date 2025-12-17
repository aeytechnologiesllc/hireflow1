import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { generatePerformanceReport } from "@/utils/generatePerformanceReport";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type ApplicationData = Tables<"applications"> & {
  jobs: Tables<"jobs"> | null;
};

interface CandidateProfile {
  full_name: string | null;
  email: string;
}

export function usePerformanceReport() {
  const [isGenerating, setIsGenerating] = useState(false);

  const downloadReport = async (
    application: ApplicationData | null,
    candidateId?: string
  ) => {
    if (!application) {
      toast.error("Application data not available");
      return;
    }

    setIsGenerating(true);
    try {
      // Fetch candidate profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", candidateId || application.candidate_id)
        .single();

      if (!profile) {
        toast.error("Could not load candidate profile");
        return;
      }

      const candidateProfile: CandidateProfile = {
        full_name: profile.full_name,
        email: profile.email,
      };

      generatePerformanceReport(application as any, candidateProfile);
      toast.success("Performance report downloaded!");
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate performance report");
    } finally {
      setIsGenerating(false);
    }
  };

  return { downloadReport, isGenerating };
}
