import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useApplicantDossier() {
  const [isGenerating, setIsGenerating] = useState(false);

  const downloadDossier = async (applicationId: string | null) => {
    if (!applicationId) {
      toast.error("Application ID not available");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-applicant-dossier', {
        body: { applicationId }
      });

      if (error) {
        console.error("Error generating dossier:", error);
        toast.error("Failed to generate applicant dossier");
        return;
      }

      if (!data?.pdfDataUri) {
        toast.error("Failed to generate PDF");
        return;
      }

      // Trigger download
      const link = document.createElement('a');
      link.href = data.pdfDataUri;
      link.download = data.fileName || 'applicant_dossier.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

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
