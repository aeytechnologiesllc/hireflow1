import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { startOfDay, subDays, format } from "date-fns";

export interface UserStats {
  totalUsers: number;
  employers: number;
  candidates: number;
  teamMembers: number;
  developers: number;
  signupTrend: { date: string; count: number }[];
}

export interface SubscriptionStats {
  total: number;
  trialing: number;
  active: number;
  expired: number;
  canceled: number;
  byPlan: { plan: string; count: number }[];
}

export interface PlatformActivity {
  totalJobs: number;
  activeJobs: number;
  totalApplications: number;
  totalInterviews: number;
  totalDocuments: number;
  voiceMinutesUsed: number;
  topEmployers: { 
    id: string; 
    name: string; 
    email: string;
    jobCount: number; 
    applicationCount: number 
  }[];
  activityTrend: { date: string; jobs: number; applications: number }[];
}

export interface FeatureUsage {
  workflowStepUsage: { step: string; count: number }[];
  aiAnalysisCount: number;
  voiceInterviewCount: number;
  documentSigningRate: number;
  quizPhaseCount: number;
  typingTestCount: number;
  videoIntroCount: number;
  chatSimulationCount: number;
  portfolioUploadCount: number;
}

export function useDeveloperAnalytics() {
  const { user, role } = useAuth();
  const isDeveloper = (role as string) === 'developer';

  const userStatsQuery = useQuery({
    queryKey: ['developer-user-stats'],
    queryFn: async (): Promise<UserStats> => {
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, created_at, email');
      
      if (profilesError) throw profilesError;

      // Get role counts
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role');
      
      if (rolesError) throw rolesError;

      const roleCounts = {
        employer: 0,
        candidate: 0,
        team_member: 0,
        developer: 0,
      };

      roles?.forEach(r => {
        if (r.role in roleCounts) {
          roleCounts[r.role as keyof typeof roleCounts]++;
        }
      });

      // Calculate signup trend (last 30 days)
      const last30Days = Array.from({ length: 30 }, (_, i) => {
        const date = startOfDay(subDays(new Date(), 29 - i));
        return format(date, 'yyyy-MM-dd');
      });

      const signupCounts: Record<string, number> = {};
      last30Days.forEach(d => signupCounts[d] = 0);

      profiles?.forEach(p => {
        const date = format(new Date(p.created_at), 'yyyy-MM-dd');
        if (date in signupCounts) {
          signupCounts[date]++;
        }
      });

      return {
        totalUsers: profiles?.length || 0,
        employers: roleCounts.employer,
        candidates: roleCounts.candidate,
        teamMembers: roleCounts.team_member,
        developers: roleCounts.developer,
        signupTrend: last30Days.map(date => ({
          date,
          count: signupCounts[date] || 0,
        })),
      };
    },
    enabled: isDeveloper,
    staleTime: 60 * 1000,
  });

  const subscriptionStatsQuery = useQuery({
    queryKey: ['developer-subscription-stats'],
    queryFn: async (): Promise<SubscriptionStats> => {
      const { data: subscriptions, error } = await supabase
        .from('subscriptions')
        .select('status, plan_type');
      
      if (error) throw error;

      const statusCounts = {
        trialing: 0,
        active: 0,
        expired: 0,
        canceled: 0,
      };

      const planCounts: Record<string, number> = {};

      subscriptions?.forEach(s => {
        if (s.status in statusCounts) {
          statusCounts[s.status as keyof typeof statusCounts]++;
        }
        const plan = s.plan_type || 'free';
        planCounts[plan] = (planCounts[plan] || 0) + 1;
      });

      return {
        total: subscriptions?.length || 0,
        trialing: statusCounts.trialing,
        active: statusCounts.active,
        expired: statusCounts.expired,
        canceled: statusCounts.canceled,
        byPlan: Object.entries(planCounts).map(([plan, count]) => ({ plan, count })),
      };
    },
    enabled: isDeveloper,
    staleTime: 60 * 1000,
  });

  const platformActivityQuery = useQuery({
    queryKey: ['developer-platform-activity'],
    queryFn: async (): Promise<PlatformActivity> => {
      // Get jobs with employer info
      const { data: jobs, error: jobsError } = await supabase
        .from('jobs')
        .select('id, employer_id, status, created_at');
      
      if (jobsError) throw jobsError;

      // Get applications
      const { data: applications, error: appsError } = await supabase
        .from('applications')
        .select('id, job_id, created_at');
      
      if (appsError) throw appsError;

      // Get interviews
      const { data: interviews, error: intError } = await supabase
        .from('interviews')
        .select('id');
      
      if (intError) throw intError;

      // Get documents
      const { data: documents, error: docsError } = await supabase
        .from('documents')
        .select('id');
      
      if (docsError) throw docsError;

      // Get voice usage
      const { data: usage, error: usageError } = await supabase
        .from('subscription_usage')
        .select('voice_minutes_used');
      
      if (usageError) throw usageError;

      const totalVoiceMinutes = usage?.reduce((sum, u) => sum + (u.voice_minutes_used || 0), 0) || 0;

      // Get profiles for employer names
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, company_name');
      
      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]));

      // Calculate employer activity
      const employerJobs: Record<string, number> = {};
      const employerApps: Record<string, number> = {};
      const jobToEmployer: Record<string, string> = {};

      jobs?.forEach(j => {
        employerJobs[j.employer_id] = (employerJobs[j.employer_id] || 0) + 1;
        jobToEmployer[j.id] = j.employer_id;
      });

      applications?.forEach(a => {
        const employerId = jobToEmployer[a.job_id];
        if (employerId) {
          employerApps[employerId] = (employerApps[employerId] || 0) + 1;
        }
      });

      // Top 10 employers by job count
      const topEmployers = Object.entries(employerJobs)
        .map(([id, jobCount]) => {
          const profile = profileMap.get(id);
          return {
            id,
            name: profile?.company_name || profile?.full_name || 'Unknown',
            email: profile?.email || '',
            jobCount,
            applicationCount: employerApps[id] || 0,
          };
        })
        .sort((a, b) => b.jobCount - a.jobCount)
        .slice(0, 10);

      // Activity trend (last 30 days)
      const last30Days = Array.from({ length: 30 }, (_, i) => {
        const date = startOfDay(subDays(new Date(), 29 - i));
        return format(date, 'yyyy-MM-dd');
      });

      const jobsByDate: Record<string, number> = {};
      const appsByDate: Record<string, number> = {};
      last30Days.forEach(d => {
        jobsByDate[d] = 0;
        appsByDate[d] = 0;
      });

      jobs?.forEach(j => {
        const date = format(new Date(j.created_at), 'yyyy-MM-dd');
        if (date in jobsByDate) jobsByDate[date]++;
      });

      applications?.forEach(a => {
        const date = format(new Date(a.created_at), 'yyyy-MM-dd');
        if (date in appsByDate) appsByDate[date]++;
      });

      return {
        totalJobs: jobs?.length || 0,
        activeJobs: jobs?.filter(j => j.status === 'published').length || 0,
        totalApplications: applications?.length || 0,
        totalInterviews: interviews?.length || 0,
        totalDocuments: documents?.length || 0,
        voiceMinutesUsed: totalVoiceMinutes,
        topEmployers,
        activityTrend: last30Days.map(date => ({
          date,
          jobs: jobsByDate[date] || 0,
          applications: appsByDate[date] || 0,
        })),
      };
    },
    enabled: isDeveloper,
    staleTime: 60 * 1000,
  });

  const featureUsageQuery = useQuery({
    queryKey: ['developer-feature-usage'],
    queryFn: async (): Promise<FeatureUsage> => {
      // Get all jobs to analyze workflow steps
      const { data: jobs, error: jobsError } = await supabase
        .from('jobs')
        .select('workflow_steps');
      
      if (jobsError) throw jobsError;

      const stepCounts: Record<string, number> = {};

      jobs?.forEach(job => {
        const steps = job.workflow_steps as { type: string }[] | null;
        steps?.forEach(step => {
          stepCounts[step.type] = (stepCounts[step.type] || 0) + 1;
        });
      });

      // Get applications for feature-specific counts
      const { data: applications, error: appsError } = await supabase
        .from('applications')
        .select('ai_analysis, voice_interview_result, notes');
      
      if (appsError) throw appsError;

      const aiAnalysisCount = applications?.filter(a => a.ai_analysis).length || 0;
      const voiceInterviewCount = applications?.filter(a => a.voice_interview_result).length || 0;

      // Get document signing stats
      const { data: documents, error: docsError } = await supabase
        .from('documents')
        .select('status');
      
      if (docsError) throw docsError;

      const signedDocs = documents?.filter(d => d.status === 'signed').length || 0;
      const totalDocs = documents?.length || 1;
      const documentSigningRate = (signedDocs / totalDocs) * 100;

      return {
        workflowStepUsage: Object.entries(stepCounts)
          .map(([step, count]) => ({ step, count }))
          .sort((a, b) => b.count - a.count),
        aiAnalysisCount,
        voiceInterviewCount,
        documentSigningRate,
        quizPhaseCount: stepCounts['quiz'] || 0,
        typingTestCount: stepCounts['typing_test'] || 0,
        videoIntroCount: stepCounts['video_intro'] || 0,
        chatSimulationCount: stepCounts['chat_simulation'] || 0,
        portfolioUploadCount: stepCounts['portfolio_upload'] || 0,
      };
    },
    enabled: isDeveloper,
    staleTime: 60 * 1000,
  });

  return {
    userStats: userStatsQuery.data,
    subscriptionStats: subscriptionStatsQuery.data,
    platformActivity: platformActivityQuery.data,
    featureUsage: featureUsageQuery.data,
    isLoading: userStatsQuery.isLoading || subscriptionStatsQuery.isLoading || 
               platformActivityQuery.isLoading || featureUsageQuery.isLoading,
    error: userStatsQuery.error || subscriptionStatsQuery.error || 
           platformActivityQuery.error || featureUsageQuery.error,
    refetch: () => {
      userStatsQuery.refetch();
      subscriptionStatsQuery.refetch();
      platformActivityQuery.refetch();
      featureUsageQuery.refetch();
    },
  };
}
