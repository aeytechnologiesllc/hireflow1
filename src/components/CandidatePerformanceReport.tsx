import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, FileText, Loader2, Sparkles, TrendingUp, Target, Award } from "lucide-react";
import { generatePerformanceReport } from "@/utils/generatePerformanceReport";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

interface ApplicationData extends Tables<"applications"> {
  jobs: Tables<"jobs"> | null;
}

interface CandidatePerformanceReportProps {
  application: ApplicationData;
  candidateName: string | null;
  candidateEmail: string;
}

export function CandidatePerformanceReport({
  application,
  candidateName,
  candidateEmail,
}: CandidatePerformanceReportProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownloadReport = async () => {
    setIsGenerating(true);
    try {
      generatePerformanceReport(application, {
        full_name: candidateName,
        email: candidateEmail,
      });
      toast.success("Report downloaded successfully!");
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate report. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="relative overflow-hidden border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-secondary/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
      
      <CardContent className="relative p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-primary/20 text-primary">
            <FileText className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              Your Performance Report
              <Sparkles className="h-4 w-4 text-primary" />
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Get detailed insights from your application journey
            </p>
          </div>
        </div>

        {/* Features list */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="h-4 w-4 text-primary" />
            <span>Phase-by-phase breakdown</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-success" />
            <span>Strengths & growth areas</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Award className="h-4 w-4 text-warning" />
            <span>Personalized roadmap</span>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground">
          Download a comprehensive PDF report with detailed feedback on each assessment phase, 
          highlighting what you did well and specific areas where you can improve for future opportunities.
        </p>

        {/* Download button */}
        <Button
          onClick={handleDownloadReport}
          disabled={isGenerating}
          className="w-full gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-semibold py-6"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Generating Report...
            </>
          ) : (
            <>
              <Download className="h-5 w-5" />
              Download Your Performance Report
            </>
          )}
        </Button>

        {/* Note */}
        <p className="text-xs text-center text-muted-foreground">
          PDF format • Includes all completed phases • Ready to print or share
        </p>
      </CardContent>
    </Card>
  );
}
