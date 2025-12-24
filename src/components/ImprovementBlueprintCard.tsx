import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Loader2, TrendingUp, Calendar, Target, Lightbulb } from "lucide-react";
import { useImprovementBlueprint } from "@/hooks/useImprovementBlueprint";

interface ImprovementBlueprintCardProps {
  applicationId: string;
}

export function ImprovementBlueprintCard({ applicationId }: ImprovementBlueprintCardProps) {
  const { downloadBlueprint, isGenerating } = useImprovementBlueprint();

  const handleDownload = () => {
    downloadBlueprint(applicationId);
  };

  return (
    <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/5 via-background to-primary/10">
      {/* Subtle decorative element */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      
      <CardContent className="p-6 relative">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex-shrink-0 p-3 bg-primary/10 rounded-xl">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>

          {/* Content */}
          <div className="flex-1 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                Your Personal Improvement Blueprint
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                A coaching-focused guide with actionable steps to strengthen your next application.
              </p>
            </div>

            {/* Feature highlights */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <span>Honest feedback</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Target className="h-4 w-4 text-emerald-500" />
                <span>Strengths to leverage</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span>Improvement strategies</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 text-violet-500" />
                <span>30-day action plan</span>
              </div>
            </div>

            {/* Download button */}
            <Button 
              onClick={handleDownload} 
              disabled={isGenerating}
              className="w-full sm:w-auto gap-2"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Your Blueprint...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download Blueprint (PDF)
                </>
              )}
            </Button>

            {/* Supportive footer text */}
            <p className="text-xs text-muted-foreground">
              This blueprint is designed to help you grow. Every application is a learning opportunity.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
