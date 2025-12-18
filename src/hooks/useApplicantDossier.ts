import { useState } from "react";
import { generateApplicantDossier } from "@/utils/generateApplicantDossier";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

type ApplicationData = Tables<"applications"> & {
  jobs: Tables<"jobs"> | null;
  profiles: Tables<"profiles"> | null;
};

export function useApplicantDossier() {
  const [isGenerating, setIsGenerating] = useState(false);

  const downloadDossier = async (application: ApplicationData | null) => {
    if (!application) {
      toast.error("Application data not available");
      return;
    }

    if (!application.profiles) {
      toast.error("Candidate profile not available");
      return;
    }

    setIsGenerating(true);
    try {
      const candidateProfile = {
        full_name: application.profiles.full_name,
        email: application.profiles.email,
        phone: application.profiles.phone,
        location: application.profiles.location,
        linkedin_url: application.profiles.linkedin_url,
      };

      generateApplicantDossier(application, candidateProfile);
      toast.success("Applicant dossier downloaded!");
    } catch (error) {
      console.error("Error generating dossier:", error);
      toast.error("Failed to generate applicant dossier");
    } finally {
      setIsGenerating(false);
    }
  };

  return { downloadDossier, isGenerating };
}
