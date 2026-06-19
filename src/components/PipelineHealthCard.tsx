import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  Activity,
  ArrowRight,
  Users,
  CheckCircle2
} from "lucide-react";
import { usePipelineHealth, type PhaseMetrics } from "@/hooks/usePipelineHealth";
import { cn } from "@/lib/utils";

function PhaseIndicator({ phase, isLast }: { phase: PhaseMetrics; isLast: boolean }) {
  const getHealthColor = (avgDays: number) => {
    if (avgDays <= 3) return "bg-primary";
    if (avgDays <= 7) return "bg-warning";
    return "bg-destructive";
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-col items-center min-w-[80px]">
        <div className={cn(
          "h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold",
          phase.count > 0 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
        )}>
          {phase.count}
        </div>
        <span className="text-xs text-muted-foreground mt-1">{phase.name}</span>
        {phase.avgDays > 0 && (
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full mt-1",
            phase.avgDays <= 3 ? "bg-primary/10 text-primary" :
            phase.avgDays <= 7 ? "bg-warning/10 text-warning" :
            "bg-destructive/10 text-destructive"
          )}>
            ~{phase.avgDays}d avg
          </span>
        )}
      </div>
      {!isLast && (
        <div className="flex items-center gap-1">
          <Progress 
            value={phase.conversionRate} 
            className="w-12 h-1.5"
          />
          <span className="text-[10px] text-muted-foreground w-8">{phase.conversionRate}%</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

interface PipelineHealthCardProps {
  className?: string;
}

export default function PipelineHealthCard({ className }: PipelineHealthCardProps) {
  const { healthData, isLoading } = usePipelineHealth();

  if (isLoading) {
    return (
      <Card className={cn("bg-card border-border", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Pipeline Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!healthData || healthData.totalApplicants === 0) {
    return (
      <Card className={cn("bg-card border-border", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Pipeline Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Activity className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">No pipeline data yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Pipeline health will show once you have applicants
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("bg-card border-border", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Pipeline Health
          </CardTitle>
          <div className="flex items-center gap-2">
            {healthData.bottleneck && (
              <Badge variant="outline" className="text-warning border-warning/30 gap-1">
                <AlertTriangle className="h-3 w-3" />
                Bottleneck: {healthData.bottleneck}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Efficiency Score */}
        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30">
          <div className="relative h-16 w-16">
            <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-muted"
              />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray={`${healthData.overallEfficiency} 100`}
                className="text-primary"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-foreground">{healthData.overallEfficiency}%</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Hire Rate</p>
            <p className="text-xs text-muted-foreground">
              {healthData.phases.find(p => p.name === "Hired")?.count || 0} hires from {healthData.totalApplicants} applicants
            </p>
          </div>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <div className="text-center">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-foreground">{healthData.totalApplicants}</span>
              </div>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="text-center">
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="font-medium text-foreground">
                  {healthData.phases.find(p => p.name === "Hired")?.count || 0}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Hired</p>
            </div>
            {healthData.weekOverWeek.applicants !== 0 && (
              <div className="text-center">
                <div className="flex items-center gap-1">
                  {healthData.weekOverWeek.applicants > 0 ? (
                    <TrendingUp className="h-4 w-4 text-primary" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-destructive" />
                  )}
                  <span className={cn(
                    "font-medium",
                    healthData.weekOverWeek.applicants > 0 ? "text-primary" : "text-destructive"
                  )}>
                    {healthData.weekOverWeek.applicants > 0 ? "+" : ""}{healthData.weekOverWeek.applicants}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">This week</p>
              </div>
            )}
          </div>
        </div>

        {/* Pipeline Funnel */}
        <div>
          <p className="text-xs text-muted-foreground mb-3">Pipeline Stages</p>
          <div className="flex items-start justify-between overflow-x-auto pb-2">
            {healthData.phases.map((phase, index) => (
              <PhaseIndicator 
                key={phase.name} 
                phase={phase} 
                isLast={index === healthData.phases.length - 1}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
