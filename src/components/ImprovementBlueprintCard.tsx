import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Loader2, TrendingUp, Calendar, Target, Lightbulb, FileText } from "lucide-react";
import { AvaSeal } from "@/components/ava/AvaSeal";
import { useImprovementBlueprint } from "@/hooks/useImprovementBlueprint";
import { ImprovementBlueprintView } from "@/components/ImprovementBlueprintView";
import { cn } from "@/lib/utils";

interface ImprovementBlueprintCardProps {
  applicationId: string;
}

/** The candidate's coaching report after a "no" — always included, never
 *  sold (billing was removed 2026-10-04). */
export function ImprovementBlueprintCard({ applicationId }: ImprovementBlueprintCardProps) {
  const { viewBlueprint, downloadBlueprint, blueprintData, isGenerating } = useImprovementBlueprint();
  const [isOpen, setIsOpen] = useState(false);

  const handleView = async () => {
    const data = await viewBlueprint(applicationId);
    if (data) setIsOpen(true);
  };

  const handleDownload = () => {
    downloadBlueprint(applicationId);
  };

  // Once opened, show the full report inline instead of the promo card.
  if (isOpen && blueprintData) {
    return <ImprovementBlueprintView data={blueprintData} onDownloadPdf={handleDownload} isDownloading={isGenerating} />;
  }

  return (
    <Card className="group relative overflow-hidden border-brass/40 bg-gradient-to-br from-brass/5 via-background to-brass/10 hover:border-brass/60 transition-all duration-500 hover:shadow-lg hover:shadow-brass/10">
      <div className="absolute inset-0 bg-gradient-to-r from-brass/0 via-brass/10 to-brass/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      <div className="absolute top-3 right-3 opacity-30">
        <AvaSeal size={20} />
      </div>
      <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-brass/10 via-brass/5 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-brass/10 to-transparent rounded-full translate-y-1/2 -translate-x-1/2" />

      <CardContent className="p-6 relative">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 p-3 bg-gradient-to-br from-brass/20 to-brass/20 rounded-xl border border-brass/20 shadow-lg shadow-brass/10">
            <AvaSeal size={24} />
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold text-foreground">Your Improvement Blueprint</h3>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-success/10 text-success text-xs font-semibold border border-success/30">
                  Included
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1.5">
                A coaching-focused guide with actionable steps to strengthen your next application.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground group/item hover:text-foreground transition-colors">
                <div className="p-1 rounded-md bg-primary/10 group-hover/item:bg-primary/20 transition-colors">
                  <Lightbulb className="h-3.5 w-3.5 text-primary" />
                </div>
                <span>Honest feedback</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground group/item hover:text-foreground transition-colors">
                <div className="p-1 rounded-md bg-primary/10 group-hover/item:bg-primary/20 transition-colors">
                  <Target className="h-3.5 w-3.5 text-primary" />
                </div>
                <span>Strengths to leverage</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground group/item hover:text-foreground transition-colors">
                <div className="p-1 rounded-md bg-primary/10 group-hover/item:bg-primary/20 transition-colors">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                </div>
                <span>Practice steps that fit this job</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground group/item hover:text-foreground transition-colors">
                <div className="p-1 rounded-md bg-primary/10 group-hover/item:bg-primary/20 transition-colors">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                </div>
                <span>A practice plan</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleView}
                disabled={isGenerating}
                size="lg"
                className={cn(
                  "relative gap-2",
                  "bg-primary text-primary-foreground font-semibold border-0",
                  "hover:brightness-110 transition-all duration-300",
                  "hover:scale-[1.02] active:scale-[0.98]"
                )}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Preparing...
                  </>
                ) : (
                  <>
                    <FileText className="h-5 w-5" />
                    View your report
                  </>
                )}
              </Button>
              <Button
                onClick={handleDownload}
                disabled={isGenerating}
                size="lg"
                variant="outline"
                className="gap-2"
                style={{ borderColor: "var(--brass-line)", color: "var(--brass)" }}
              >
                <Download className="h-5 w-5" />
                PDF
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Included at no charge — read it anytime.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
