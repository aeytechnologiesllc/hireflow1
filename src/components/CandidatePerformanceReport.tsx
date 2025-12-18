import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, FileText, Loader2, Sparkles, TrendingUp, Target, Award, Brain, MessageSquare } from "lucide-react";
import { usePerformanceReport } from "@/hooks/usePerformanceReport";

interface CandidatePerformanceReportProps {
  applicationId: string;
}

export function CandidatePerformanceReport({ applicationId }: CandidatePerformanceReportProps) {
  const { downloadReport, isGenerating } = usePerformanceReport();

  const handleDownloadReport = () => {
    downloadReport(applicationId);
  };

  return (
    <Card className="relative overflow-hidden border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-secondary/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />
      
      <CardContent className="relative p-6 space-y-4">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-primary/20 text-primary">
            <FileText className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              AI Performance Report
              <Sparkles className="h-4 w-4 text-primary" />
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Get comprehensive AI-powered insights from your application
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Brain className="h-4 w-4 text-primary" />
            <span>Personality profile</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Target className="h-4 w-4 text-primary" />
            <span>Skills breakdown</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4 text-success" />
            <span>Interview quotes</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-success" />
            <span>Growth roadmap</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Award className="h-4 w-4 text-warning" />
            <span>Real resources</span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          A 7-page comprehensive PDF with personalized AI analysis, interview feedback with direct quotes, 
          personality insights, and a curated growth roadmap with real resource links to help you improve.
        </p>

        <Button
          onClick={handleDownloadReport}
          disabled={isGenerating}
          className="w-full gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-semibold py-6"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Generating AI Analysis...
            </>
          ) : (
            <>
              <Download className="h-5 w-5" />
              Download Your Performance Report
            </>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          7-page PDF • AI-powered analysis • Real improvement resources
        </p>
      </CardContent>
    </Card>
  );
}
