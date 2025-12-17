import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer
} from "recharts";
import { ShieldCheck, Shield, ShieldAlert, CheckCircle, AlertCircle, TrendingUp, Users } from "lucide-react";

interface CandidateComparison {
  id: string;
  name: string;
  avatar?: string;
  jobTitle?: string;
  result: any;
}

interface InterviewComparisonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: CandidateComparison[];
}

export function InterviewComparisonDialog({
  open,
  onOpenChange,
  candidates
}: InterviewComparisonDialogProps) {
  if (candidates.length === 0) return null;

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Prepare comparison data for radar chart overlay
  const comparisonCategories = ['Communication', 'Technical', 'Culture Fit', 'Problem Solving', 'Adaptability', 'Leadership'];
  
  const radarData = comparisonCategories.map(cat => {
    const dataPoint: any = { category: cat };
    candidates.forEach((c, i) => {
      const key = cat.toLowerCase().replace(' ', '_');
      dataPoint[`candidate${i}`] = c.result?.[`${key}_score`] || 0;
    });
    return dataPoint;
  });

  const colors = ['hsl(var(--primary))', 'hsl(142.1 76.2% 36.3%)', 'hsl(221.2 83.2% 53.3%)'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Compare Candidates ({candidates.length})
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[75vh]">
          <div className="space-y-6">
            {/* Candidate Cards Row */}
            <div className={`grid gap-4 ${candidates.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {candidates.map((candidate, idx) => (
                <Card key={candidate.id} className="relative">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-primary/20 text-primary">
                          {getInitials(candidate.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <CardTitle className="text-base">{candidate.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{candidate.jobTitle}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Overall Score */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-primary">
                          {candidate.result?.overall_score || "N/A"}
                        </p>
                        <p className="text-xs text-muted-foreground">/100</p>
                      </div>
                      <div className="space-y-1 text-right">
                        <Badge className={
                          candidate.result?.recommendation === "strong_hire" ? "bg-success" :
                          candidate.result?.recommendation === "hire" ? "bg-success/80" :
                          candidate.result?.recommendation === "maybe" ? "bg-warning" : "bg-destructive"
                        }>
                          {candidate.result?.recommendation?.replace("_", " ").toUpperCase() || "N/A"}
                        </Badge>
                        <div className="flex items-center gap-1 justify-end">
                          {candidate.result?.credibility_rating === "high" ? (
                            <ShieldCheck className="h-3 w-3 text-success" />
                          ) : candidate.result?.credibility_rating === "medium" ? (
                            <Shield className="h-3 w-3 text-warning" />
                          ) : (
                            <ShieldAlert className="h-3 w-3 text-destructive" />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {candidate.result?.credibility_rating || "N/A"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Score Bars */}
                    <div className="space-y-2">
                      {[
                        { label: "Communication", key: "communication_score" },
                        { label: "Technical", key: "technical_score" },
                        { label: "Culture Fit", key: "culture_fit_score" },
                      ].map((item) => (
                        <div key={item.key}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-muted-foreground">{item.label}</span>
                            <span>{candidate.result?.[item.key] || 0}</span>
                          </div>
                          <Progress value={candidate.result?.[item.key] || 0} className="h-1.5" />
                        </div>
                      ))}
                    </div>

                    {/* Top Strength & Concern */}
                    <div className="mt-4 pt-4 border-t border-border space-y-2">
                      {candidate.result?.strengths?.[0] && (
                        <div className="flex items-start gap-2 text-xs">
                          <CheckCircle className="h-3 w-3 text-success mt-0.5 shrink-0" />
                          <span className="text-muted-foreground line-clamp-2">
                            {candidate.result.strengths[0]}
                          </span>
                        </div>
                      )}
                      {candidate.result?.concerns?.[0] && (
                        <div className="flex items-start gap-2 text-xs">
                          <AlertCircle className="h-3 w-3 text-warning mt-0.5 shrink-0" />
                          <span className="text-muted-foreground line-clamp-2">
                            {candidate.result.concerns[0]}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Red Flags Count */}
                    {candidate.result?.inconsistencies?.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <Badge variant="destructive" className="text-xs">
                          <ShieldAlert className="h-3 w-3 mr-1" />
                          {candidate.result.inconsistencies.length} Red Flag{candidate.result.inconsistencies.length > 1 ? 's' : ''}
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Comparison Radar Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Skills Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis 
                        dataKey="category" 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} 
                      />
                      <PolarRadiusAxis 
                        domain={[0, 100]} 
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} 
                      />
                      {candidates.map((c, i) => (
                        <Radar 
                          key={c.id}
                          dataKey={`candidate${i}`}
                          name={c.name}
                          fill={colors[i]}
                          fillOpacity={0.2}
                          stroke={colors[i]}
                          strokeWidth={2}
                        />
                      ))}
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="flex justify-center gap-6 mt-4">
                  {candidates.map((c, i) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: colors[i] }}
                      />
                      <span className="text-sm">{c.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Detailed Comparison Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Detailed Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 font-medium text-muted-foreground">Metric</th>
                        {candidates.map(c => (
                          <th key={c.id} className="text-center py-2 px-3 font-medium">{c.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "Overall Score", key: "overall_score" },
                        { label: "Communication", key: "communication_score" },
                        { label: "Technical", key: "technical_score" },
                        { label: "Culture Fit", key: "culture_fit_score" },
                        { label: "Problem Solving", key: "problem_solving_score" },
                        { label: "Adaptability", key: "adaptability_score" },
                        { label: "Leadership", key: "leadership_potential_score" },
                      ].map((row) => {
                        const values = candidates.map(c => c.result?.[row.key] || 0);
                        const maxVal = Math.max(...values);
                        return (
                          <tr key={row.key} className="border-b border-border/50">
                            <td className="py-2 px-3 text-muted-foreground">{row.label}</td>
                            {candidates.map((c, i) => {
                              const val = c.result?.[row.key] || 0;
                              const isHighest = val === maxVal && val > 0;
                              return (
                                <td key={c.id} className={`text-center py-2 px-3 ${isHighest ? 'font-bold text-primary' : ''}`}>
                                  {val || "N/A"}
                                  {isHighest && val > 0 && <span className="ml-1 text-xs">★</span>}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
