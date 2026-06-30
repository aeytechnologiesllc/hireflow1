import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSchemaMode } from "@/hooks/useSchemaMode";
import { subDays, format, startOfDay, differenceInDays } from "date-fns";

export interface ApplicationTrend {
  date: string;
  applications: number;
  hired: number;
  rejected: number;
}

export interface JobPerformance {
  id: string;
  title: string;
  applications: number;
  hired: number;
  rejected: number;
  avgScore: number | null;
  conversionRate: number;
}

export interface AIScoreDistribution {
  range: string;
  count: number;
}

export interface PhaseDistribution {
  phase: string;
  count: number;
}

export interface TimeToHireMetrics {
  avgDays: number;
  minDays: number;
  maxDays: number;
  medianDays: number;
}

export interface InterviewMetrics {
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
  conversionRate: number;
}

export interface DocumentMetrics {
  total: number;
  signed: number;
  pending: number;
  declined: number;
  signingRate: number;
  avgTimeToSign: number | null;
}

export function useAdvancedAnalytics() {
  const { user } = useAuth();
  const { data: mode } = useSchemaMode();

  return useQuery({
    queryKey: ["advanced-analytics", user?.id],
    queryFn: async () => {
      // Get all jobs for employer
      const { data: jobs, error: jobsError } = await supabase
        .from("jobs")
        .select("*")
        .eq("employer_id", user!.id);

      if (jobsError) throw jobsError;
      const jobIds = jobs?.map(j => j.id) || [];

      if (jobIds.length === 0) {
        return {
          applicationTrends: [],
          jobPerformance: [],
          aiScoreDistribution: [],
          phaseDistribution: [],
          timeToHire: null,
          interviewMetrics: null,
          documentMetrics: null,
          rejectionReasons: [],
          avgResponseTime: null,
          weeklyComparison: { thisWeek: 0, lastWeek: 0, change: 0 },
          topPerformingJobs: [],
          candidateQualityScore: 0,
        };
      }

      // Get all applications for employer's jobs
      const { data: applications, error: appsError } = await supabase
        .from("applications")
        .select("*")
        .in("job_id", jobIds);

      if (appsError) throw appsError;

      // Get interviews
      const applicationIds = applications?.map(a => a.id) || [];
      const { data: interviews, error: interviewsError } = await supabase
        .from("interviews")
        .select("*")
        .in("application_id", applicationIds);

      if (interviewsError) throw interviewsError;

      // Get documents
      const { data: documents, error: docsError } = await supabase
        .from("documents")
        .select("*")
        .in("application_id", applicationIds);

      if (docsError) throw docsError;

      // Calculate application trends (last 30 days)
      const now = new Date();
      const last30Days = Array.from({ length: 30 }, (_, i) => {
        const date = subDays(now, 29 - i);
        return format(date, "yyyy-MM-dd");
      });

      const applicationTrends: ApplicationTrend[] = last30Days.map(date => {
        const dayApps = applications?.filter(a => 
          format(new Date(a.created_at), "yyyy-MM-dd") === date
        ) || [];
        return {
          date: format(new Date(date), "MMM d"),
          applications: dayApps.length,
          hired: dayApps.filter(a => a.status === "hired").length,
          rejected: dayApps.filter(a => a.status === "rejected").length,
        };
      });

      // Job performance
      const jobPerformance: JobPerformance[] = jobs?.map(job => {
        const jobApps = applications?.filter(a => a.job_id === job.id) || [];
        const scores = jobApps.filter(a => a.ai_score !== null).map(a => Number(a.ai_score)).filter(n => !isNaN(n));
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        const hiredCount = jobApps.filter(a => a.status === "hired").length;
        
        return {
          id: job.id,
          title: job.title.length > 20 ? job.title.substring(0, 20) + "..." : job.title,
          applications: jobApps.length,
          hired: hiredCount,
          rejected: jobApps.filter(a => a.status === "rejected").length,
          avgScore,
          conversionRate: jobApps.length > 0 ? Math.round((hiredCount / jobApps.length) * 100) : 0,
        };
      }).sort((a, b) => b.applications - a.applications) || [];

      // AI Score Distribution
      const aiScoreDistribution: AIScoreDistribution[] = [
        { range: "0-20", count: 0 },
        { range: "21-40", count: 0 },
        { range: "41-60", count: 0 },
        { range: "61-80", count: 0 },
        { range: "81-100", count: 0 },
      ];

      applications?.forEach(app => {
        if (app.ai_score !== null) {
          const score = Number(app.ai_score);
          if (isNaN(score)) return;
          if (score <= 20) aiScoreDistribution[0].count++;
          else if (score <= 40) aiScoreDistribution[1].count++;
          else if (score <= 60) aiScoreDistribution[2].count++;
          else if (score <= 80) aiScoreDistribution[3].count++;
          else aiScoreDistribution[4].count++;
        }
      });

      // Phase distribution
      const phaseMap = new Map<string, number>();
      applications?.forEach(app => {
        const phase = app.phase || "application";
        phaseMap.set(phase, (phaseMap.get(phase) || 0) + 1);
      });
      const phaseDistribution: PhaseDistribution[] = Array.from(phaseMap.entries())
        .map(([phase, count]) => ({ phase: phase.replace(/_/g, " "), count }))
        .sort((a, b) => b.count - a.count);

      // Time to hire
      const hiredApps = applications?.filter(a => a.status === "hired") || [];
      let timeToHire: TimeToHireMetrics | null = null;
      if (hiredApps.length > 0) {
        const hireTimes = hiredApps.map(app => 
          differenceInDays(new Date(app.updated_at), new Date(app.created_at))
        ).filter(d => d >= 0);

        if (hireTimes.length > 0) {
          const sorted = [...hireTimes].sort((a, b) => a - b);
          timeToHire = {
            avgDays: Math.round(hireTimes.reduce((a, b) => a + b, 0) / hireTimes.length),
            minDays: Math.min(...hireTimes),
            maxDays: Math.max(...hireTimes),
            medianDays: sorted[Math.floor(sorted.length / 2)],
          };
        }
      }

      // Interview metrics
      const interviewMetrics: InterviewMetrics = {
        total: interviews?.length || 0,
        completed: interviews?.filter(i => i.status === "completed").length || 0,
        cancelled: interviews?.filter(i => i.status === "cancelled").length || 0,
        noShow: interviews?.filter(i => i.status === "no_show").length || 0,
        conversionRate: interviews && interviews.length > 0
          ? Math.round((interviews.filter(i => i.status === "completed").length / interviews.length) * 100)
          : 0,
      };

      // Document metrics
      const documentMetrics: DocumentMetrics = {
        total: documents?.length || 0,
        signed: documents?.filter(d => d.status === "signed").length || 0,
        pending: documents?.filter(d => d.status === "pending").length || 0,
        declined: documents?.filter(d => d.status === "declined").length || 0,
        signingRate: documents && documents.length > 0
          ? Math.round((documents.filter(d => d.status === "signed").length / documents.length) * 100)
          : 0,
        avgTimeToSign: null, // Could calculate from signed_at - created_at
      };

      // Weekly comparison
      const thisWeekStart = startOfDay(subDays(now, 7));
      const lastWeekStart = startOfDay(subDays(now, 14));
      const thisWeekApps = applications?.filter(a => 
        new Date(a.created_at) >= thisWeekStart
      ).length || 0;
      const lastWeekApps = applications?.filter(a => 
        new Date(a.created_at) >= lastWeekStart && new Date(a.created_at) < thisWeekStart
      ).length || 0;
      const weeklyChange = lastWeekApps > 0 
        ? Math.round(((thisWeekApps - lastWeekApps) / lastWeekApps) * 100)
        : thisWeekApps > 0 ? 100 : 0;

      // Candidate quality score (average AI score)
      const allScores = (applications?.filter(a => a.ai_score !== null).map(a => Number(a.ai_score)).filter(n => !isNaN(n))) || [];
      const candidateQualityScore = allScores.length > 0
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : 0;

      // Top performing jobs (by hire rate)
      const topPerformingJobs = jobPerformance
        .filter(j => j.applications >= 1)
        .sort((a, b) => b.conversionRate - a.conversionRate)
        .slice(0, 5);

      return {
        applicationTrends,
        jobPerformance,
        aiScoreDistribution,
        phaseDistribution,
        timeToHire,
        interviewMetrics,
        documentMetrics,
        weeklyComparison: { thisWeek: thisWeekApps, lastWeek: lastWeekApps, change: weeklyChange },
        topPerformingJobs,
        candidateQualityScore,
        totalApplications: applications?.length || 0,
        totalHired: hiredApps.length,
        totalRejected: applications?.filter(a => a.status === "rejected").length || 0,
        pendingReview: applications?.filter(a => a.status === "pending" || a.status === "reviewing").length || 0,
      };
    },
    enabled: !!user && mode === "hireflow1",
  });
}
