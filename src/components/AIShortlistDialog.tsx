import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Sparkles, 
  Trophy, 
  Eye, 
  Calendar, 
  CheckCircle, 
  AlertCircle, 
  XCircle,
  TrendingUp,
  Users,
  Loader2
} from "lucide-react";
import type { ShortlistResult, RankedCandidate } from "@/hooks/useAIShortlist";
import { format } from "date-fns";

interface AIShortlistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortlist: ShortlistResult | null;
  isLoading: boolean;
  onScheduleInterview?: (candidateName: string, applicationId?: string) => void;
}

const recommendationConfig = {
  strong_yes: { 
    label: "Strong Yes", 
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    icon: CheckCircle 
  },
  yes: { 
    label: "Yes", 
    color: "bg-primary/20 text-primary border-primary/30",
    icon: CheckCircle 
  },
  maybe: { 
    label: "Maybe", 
    color: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    icon: AlertCircle 
  },
  no: { 
    label: "Pass", 
    color: "bg-destructive/20 text-destructive border-destructive/30",
    icon: XCircle 
  },
};

const rankColors = [
  "from-amber-400 to-yellow-500", // Gold for #1
  "from-slate-300 to-slate-400",  // Silver for #2
  "from-amber-600 to-amber-700",  // Bronze for #3
];

function formatSignalLabel(signal: string) {
  return signal
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function CandidateCard({ 
  candidate, 
  onViewDetails, 
  onScheduleInterview 
}: { 
  candidate: RankedCandidate;
  onViewDetails: () => void;
  onScheduleInterview: () => void;
}) {
  const config = recommendationConfig[candidate.recommendation];
  const RankIcon = candidate.rank <= 3 ? Trophy : null;
  const needsMoreEvidence = candidate.scorecard?.decisionState === "needs_more_evidence";
  const pendingSignals = (candidate.scorecard?.pendingHighSignalPhases || []).map(formatSignalLabel);
  const scoreColor = needsMoreEvidence ? "text-amber-300" : "text-primary";
  const barColor = needsMoreEvidence ? "bg-amber-300" : "bg-primary";

  return (
    <Card className="bg-card/50 border-border hover:border-primary/30 transition-all">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Rank Badge */}
          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
            candidate.rank <= 3 
              ? `bg-gradient-to-br ${rankColors[candidate.rank - 1]} text-black` 
              : 'bg-muted text-muted-foreground'
          }`}>
            {candidate.rank <= 3 && RankIcon ? (
              <Trophy className="h-5 w-5" />
            ) : (
              candidate.rank
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-foreground truncate">
                  {candidate.candidateName}
                </h4>
                {candidate.rank === 1 && (
                  <Badge className="bg-gradient-to-r from-amber-400 to-yellow-500 text-black text-xs">
                    Top Pick
                  </Badge>
                )}
              </div>
              <Badge variant="outline" className={config.color}>
                {config.label}
              </Badge>
            </div>

            {/* AI Score */}
            {candidate.aiScore !== null && candidate.aiScore !== undefined && (
              <div className="flex items-center gap-2 mt-2">
                <Sparkles className={`h-3.5 w-3.5 ${scoreColor}`} />
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-20 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${barColor} rounded-full`}
                      style={{ width: `${candidate.aiScore}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${scoreColor}`}>
                    {needsMoreEvidence ? `Provisional ${candidate.aiScore}%` : `${candidate.aiScore}%`}
                  </span>
                </div>
                {candidate.scorecard?.confidence ? (
                  <Badge variant="outline" className="text-[10px]">
                    {needsMoreEvidence ? "Evidence confidence" : "Confidence"} {candidate.scorecard.confidence}%
                  </Badge>
                ) : null}
                {needsMoreEvidence && (
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-300">
                    Awaiting more evidence
                  </Badge>
                )}
              </div>
            )}

            {needsMoreEvidence && pendingSignals.length > 0 && (
              <p className="mt-2 text-xs text-amber-300/90">
                Pending signals: {pendingSignals.join(", ")}
              </p>
            )}

            {/* Key Differentiator */}
            <p className="text-sm text-primary mt-2 font-medium">
              "{candidate.keyDifferentiator}"
            </p>

            {/* Strengths & Concerns */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {candidate.strengths.slice(0, 2).map((strength, i) => (
                <Badge key={i} variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  {strength}
                </Badge>
              ))}
              {candidate.concerns.slice(0, 1).map((concern, i) => (
                <Badge key={i} variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/20">
                  {concern}
                </Badge>
              ))}
              {candidate.scorecard?.riskFlags.slice(0, 1).map((flag, i) => (
                <Badge key={`risk-${i}`} variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/20">
                  {flag}
                </Badge>
              ))}
            </div>

            {/* Actions */}
            <div className="mt-3 flex items-center gap-2">
              <Button 
                size="sm" 
                variant="outline" 
                className="h-7 text-xs"
                onClick={onViewDetails}
              >
                <Eye className="h-3 w-3 mr-1" />
                View Details
              </Button>
              {(candidate.recommendation === "strong_yes" || candidate.recommendation === "yes") && (
                <Button 
                  size="sm" 
                  className="h-7 text-xs bg-primary/20 text-primary hover:bg-primary/30"
                  onClick={onScheduleInterview}
                >
                  <Calendar className="h-3 w-3 mr-1" />
                  Schedule Interview
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AIShortlistDialog({
  open,
  onOpenChange,
  shortlist,
  isLoading,
  onScheduleInterview,
}: AIShortlistDialogProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl bg-background border-border">
          <div className="flex flex-col items-center justify-center py-16">
            <div className="relative">
              <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <Loader2 className="h-20 w-20 absolute -top-2 -left-2 text-primary animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mt-6">
              AVA is analyzing candidates...
            </h3>
            <p className="text-sm text-muted-foreground mt-2 text-center max-w-sm">
              Comparing qualifications, assessment scores, and performance data to create your shortlist
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!shortlist) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] bg-background border-border p-0">
        <DialogHeader className="p-6 pb-4 border-b border-border bg-gradient-to-r from-primary/10 to-accent/10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">
                AVA's Shortlist for {shortlist.jobTitle}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {shortlist.candidateCount} candidates analyzed • {format(new Date(shortlist.generatedAt), "MMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-180px)]">
          <div className="p-6 space-y-6">
            {/* Summary Statement */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-foreground leading-relaxed">
                    {shortlist.summaryStatement}
                  </p>
                </div>
              </CardContent>
            </Card>

            {shortlist.scorecardSummary && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Card className="bg-card/60 border-border">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Average score</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{shortlist.scorecardSummary.averageScore}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/60 border-border">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Top score</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{shortlist.scorecardSummary.highestScore}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/60 border-border">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Lowest score</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{shortlist.scorecardSummary.lowestScore}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/60 border-border">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">Strongest category</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {shortlist.scorecardSummary.strongestCategory.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Quick Decision */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card className="bg-emerald-500/10 border-emerald-500/20">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-medium text-emerald-400">Interview Now</span>
                  </div>
                  <div className="space-y-1">
                    {shortlist.quickDecision.interviewImmediately.length > 0 ? (
                      shortlist.quickDecision.interviewImmediately.map((name, i) => (
                        <p key={i} className="text-sm text-foreground truncate">{name}</p>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">None</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-amber-500/10 border-amber-500/20">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-amber-400" />
                    <span className="text-xs font-medium text-amber-400">Consider</span>
                  </div>
                  <div className="space-y-1">
                    {shortlist.quickDecision.considerWithReservations.length > 0 ? (
                      shortlist.quickDecision.considerWithReservations.map((name, i) => (
                        <p key={i} className="text-sm text-foreground truncate">{name}</p>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">None</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-destructive/10 border-destructive/20">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-xs font-medium text-destructive">Pass</span>
                  </div>
                  <div className="space-y-1">
                    {shortlist.quickDecision.pass.length > 0 ? (
                      shortlist.quickDecision.pass.map((name, i) => (
                        <p key={i} className="text-sm text-foreground truncate">{name}</p>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">None</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Ranked Candidates */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Ranked Candidates</h3>
              </div>
              <div className="space-y-3">
                {shortlist.rankedCandidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.rank}
                    candidate={candidate}
                    onViewDetails={() => {
                      if (candidate.applicationId) {
                        navigate(`/applicants/${candidate.applicationId}`);
                        onOpenChange(false);
                      }
                    }}
                    onScheduleInterview={() => {
                      if (onScheduleInterview) {
                        onScheduleInterview(candidate.candidateName, candidate.applicationId);
                      }
                    }}
                  />
                ))}
              </div>
            </div>

            <Separator />

            {/* Comparative Insights */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-5 w-5 text-accent" />
                <h3 className="font-semibold text-foreground">Comparative Insights</h3>
              </div>
              <ul className="space-y-2">
                {shortlist.comparativeInsights.map((insight, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-primary mt-1">•</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
