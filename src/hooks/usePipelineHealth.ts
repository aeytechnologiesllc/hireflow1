import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { differenceInDays, subDays } from "date-fns";

export interface PhaseMetrics {
  name: string;
  count: number;
  avgDays: number;
  conversionRate: number;
}

export interface PipelineHealthData {
  phases: PhaseMetrics[];
  overallEfficiency: number;
  totalApplicants: number;
  bottleneck: string | null;
  weekOverWeek: {
    applicants: number;
    hires: number;
    efficiency: number;
  };
}

export function usePipelineHealth() {
  const { user } = useAuth();

  const { data: applications, isLoading } = useQuery({
    queryKey: ["pipeline-health", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data } = await supabase
        .from("applications")
        .select(`
          id,
          status,
          phase,
          created_at,
          updated_at,
          jobs!inner(employer_id)
        `)
        .eq("jobs.employer_id", user.id);

      return data || [];
    },
    enabled: !!user,
  });

  const healthData = useMemo((): PipelineHealthData | null => {
    if (!applications || applications.length === 0) return null;

    const now = new Date();
    const weekAgo = subDays(now, 7);
    const twoWeeksAgo = subDays(now, 14);

    // Current week stats
    const currentWeekApps = applications.filter(
      (app) => new Date(app.created_at) >= weekAgo
    );
    const lastWeekApps = applications.filter(
      (app) => new Date(app.created_at) >= twoWeeksAgo && new Date(app.created_at) < weekAgo
    );

    // Status counts
    const statusCounts: Record<string, number> = {
      pending: 0,
      reviewing: 0,
      interview: 0,
      offered: 0,
      hired: 0,
      rejected: 0,
    };

    const statusDays: Record<string, number[]> = {
      pending: [],
      reviewing: [],
      interview: [],
      offered: [],
      hired: [],
    };

    applications.forEach((app) => {
      statusCounts[app.status] = (statusCounts[app.status] || 0) + 1;
      
      // Calculate days in pipeline
      const daysInPipeline = differenceInDays(new Date(app.updated_at), new Date(app.created_at));
      if (statusDays[app.status]) {
        statusDays[app.status].push(daysInPipeline);
      }
    });

    const totalActive = applications.filter((app) => app.status !== "rejected").length;

    // Calculate phase metrics
    const phases: PhaseMetrics[] = [
      {
        name: "Applied",
        count: statusCounts.pending,
        avgDays: statusDays.pending.length > 0 
          ? Math.round(statusDays.pending.reduce((a, b) => a + b, 0) / statusDays.pending.length)
          : 0,
        conversionRate: totalActive > 0 ? Math.round((statusCounts.reviewing + statusCounts.interview + statusCounts.offered + statusCounts.hired) / applications.length * 100) : 0,
      },
      {
        name: "Reviewing",
        count: statusCounts.reviewing,
        avgDays: statusDays.reviewing.length > 0
          ? Math.round(statusDays.reviewing.reduce((a, b) => a + b, 0) / statusDays.reviewing.length)
          : 0,
        conversionRate: (statusCounts.pending + statusCounts.reviewing) > 0
          ? Math.round((statusCounts.interview + statusCounts.offered + statusCounts.hired) / (statusCounts.pending + statusCounts.reviewing) * 100)
          : 0,
      },
      {
        name: "Interview",
        count: statusCounts.interview,
        avgDays: statusDays.interview.length > 0
          ? Math.round(statusDays.interview.reduce((a, b) => a + b, 0) / statusDays.interview.length)
          : 0,
        conversionRate: statusCounts.interview > 0
          ? Math.round((statusCounts.offered + statusCounts.hired) / statusCounts.interview * 100)
          : 0,
      },
      {
        name: "Offered",
        count: statusCounts.offered,
        avgDays: statusDays.offered.length > 0
          ? Math.round(statusDays.offered.reduce((a, b) => a + b, 0) / statusDays.offered.length)
          : 0,
        conversionRate: statusCounts.offered > 0
          ? Math.round(statusCounts.hired / statusCounts.offered * 100)
          : 0,
      },
      {
        name: "Hired",
        count: statusCounts.hired,
        avgDays: statusDays.hired.length > 0
          ? Math.round(statusDays.hired.reduce((a, b) => a + b, 0) / statusDays.hired.length)
          : 0,
        conversionRate: 100,
      },
    ];

    // Find bottleneck (lowest conversion rate excluding hired)
    const bottleneckPhase = phases
      .filter((p) => p.name !== "Hired" && p.count > 0)
      .sort((a, b) => a.conversionRate - b.conversionRate)[0];

    // Calculate overall efficiency (weighted average of conversions)
    const overallEfficiency = applications.length > 0
      ? Math.round((statusCounts.hired / applications.length) * 100 * 5) // 5x multiplier to get reasonable %
      : 0;

    // Week over week comparison
    const currentWeekHires = currentWeekApps.filter((app) => app.status === "hired").length;
    const lastWeekHires = lastWeekApps.filter((app) => app.status === "hired").length;

    return {
      phases,
      overallEfficiency: Math.min(overallEfficiency, 100),
      totalApplicants: applications.length,
      bottleneck: bottleneckPhase?.conversionRate < 50 ? bottleneckPhase.name : null,
      weekOverWeek: {
        applicants: currentWeekApps.length - lastWeekApps.length,
        hires: currentWeekHires - lastWeekHires,
        efficiency: 0, // Could calculate trend
      },
    };
  }, [applications]);

  return { healthData, isLoading };
}
