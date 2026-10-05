import { useEffect, useId, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSchemaMode } from "@/hooks/useSchemaMode";

export interface ActivityItem {
  id: string;
  type: "application" | "interview" | "document" | "status_change" | "hired" | "rejected";
  title: string;
  description: string;
  timestamp: string;
  link?: string;
  metadata?: {
    candidateName?: string;
    jobTitle?: string;
    status?: string;
  };
}

export function useActivityFeed(limit: number = 20) {
  const { user } = useAuth();
  const { data: mode } = useSchemaMode();
  const queryClient = useQueryClient();

  const { data: activities, isLoading } = useQuery({
    queryKey: ["activity-feed", user?.id, limit],
    queryFn: async () => {
      if (!user) return [];

      const { data: teamMember } = await supabase
        .from("team_members")
        .select("employer_id, assigned_job_ids")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      const effectiveEmployerId = teamMember?.employer_id || user.id;
      const assignedJobIds = Array.isArray(teamMember?.assigned_job_ids)
        ? (teamMember.assigned_job_ids as string[])
        : null;

      let jobsQuery = supabase
        .from("jobs")
        .select("id, title")
        .eq("employer_id", effectiveEmployerId);

      if (assignedJobIds && assignedJobIds.length > 0) {
        jobsQuery = jobsQuery.in("id", assignedJobIds);
      }

      const { data: jobs, error: jobsError } = await jobsQuery;

      if (jobsError) throw jobsError;
      if (!jobs || jobs.length === 0) return [];

      const jobIds = jobs.map((job) => job.id);
      const jobMap = new Map(jobs.map((job) => [job.id, job]));

      const { data: applications, error: applicationsError } = await supabase
        .from("applications")
        .select("id, status, created_at, updated_at, candidate_id, job_id")
        .in("job_id", jobIds)
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (applicationsError) throw applicationsError;

      const applicationIds = applications?.map((app) => app.id) || [];
      const candidateIds = [
        ...new Set((applications || []).map((app) => app.candidate_id).filter(Boolean)),
      ];

      const [{ data: interviews, error: interviewsError }, { data: documents, error: documentsError }, { data: profiles, error: profilesError }] =
        await Promise.all([
          applicationIds.length > 0
            ? supabase
                .from("interviews")
                .select("id, status, scheduled_at, created_at, application_id")
                .in("application_id", applicationIds)
                .order("created_at", { ascending: false })
                .limit(limit)
            : Promise.resolve({ data: [], error: null }),
          applicationIds.length > 0
            ? supabase
                .from("documents")
                .select("id, name, status, created_at, signed_at, application_id")
                .in("application_id", applicationIds)
                .order("created_at", { ascending: false })
                .limit(limit)
            : Promise.resolve({ data: [], error: null }),
          candidateIds.length > 0
            ? supabase
                .from("profiles")
                .select("user_id, full_name, email")
                .in("user_id", candidateIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

      if (interviewsError) throw interviewsError;
      if (documentsError) throw documentsError;
      if (profilesError) throw profilesError;

      const applicationMap = new Map((applications || []).map((app) => [app.id, app]));
      const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));

      const nameFor = (_applicationId: string, profile?: { full_name?: string | null; email?: string | null } | null) =>
        profile?.full_name || profile?.email || "Unknown";

      const activityItems: ActivityItem[] = [];

      // Process applications
      applications?.forEach((app) => {
        const profile = profileMap.get(app.candidate_id);
        const job = jobMap.get(app.job_id);
        const candidateName = nameFor(app.id, profile);
        const jobTitle = job?.title || "Unknown Position";

        if (app.status === "hired") {
          activityItems.push({
            id: `hired-${app.id}`,
            type: "hired",
            title: "Candidate Hired",
            description: `${candidateName} was hired for ${jobTitle}`,
            timestamp: app.updated_at,
            link: `/applicants/${app.id}`,
            metadata: { candidateName, jobTitle, status: app.status },
          });
        } else if (app.status === "rejected") {
          activityItems.push({
            id: `rejected-${app.id}`,
            type: "rejected",
            title: "Application Rejected",
            description: `${candidateName}'s application for ${jobTitle} was rejected`,
            timestamp: app.updated_at,
            link: `/applicants/${app.id}`,
            metadata: { candidateName, jobTitle, status: app.status },
          });
        } else if (app.status === "pending") {
          activityItems.push({
            id: `app-${app.id}`,
            type: "application",
            title: "New Application",
            description: `${candidateName} applied for ${jobTitle}`,
            timestamp: app.created_at,
            link: `/applicants/${app.id}`,
            metadata: { candidateName, jobTitle, status: app.status },
          });
        } else {
          // Every other status ("reviewing" | "interview" | "offered" |
          // "in_progress") falls here — "hired"/"rejected"/"pending" are all
          // handled above, so status is provably never "pending" by this
          // point (that's what TS's own "no overlap" check was catching).
          activityItems.push({
            id: `status-${app.id}-${app.updated_at}`,
            type: "status_change",
            title: "Status Updated",
            description: `${candidateName}'s status changed to ${app.status}`,
            timestamp: app.updated_at,
            link: `/applicants/${app.id}`,
            metadata: { candidateName, jobTitle, status: app.status },
          });
        }
      });

      // Process interviews
      interviews?.forEach((interview) => {
        const app = applicationMap.get(interview.application_id);
        const profile = app ? profileMap.get(app.candidate_id) : null;
        const job = app ? jobMap.get(app.job_id) : null;
        const candidateName = app ? nameFor(app.id, profile) : profile?.full_name || profile?.email || "Unknown";
        const jobTitle = job?.title || "Unknown Position";

        activityItems.push({
          id: `interview-${interview.id}`,
          type: "interview",
          title: interview.status === "completed" ? "Interview Completed" : "Interview Scheduled",
          description: `${interview.status === "completed" ? "Completed" : "Scheduled"} interview with ${candidateName} for ${jobTitle}`,
          timestamp: interview.created_at,
          link: app ? `/applicants/${app.id}` : undefined,
          metadata: { candidateName, jobTitle },
        });
      });

      // Process documents
      documents?.forEach((doc) => {
        const app = applicationMap.get(doc.application_id);
        const profile = app ? profileMap.get(app.candidate_id) : null;
        const job = app ? jobMap.get(app.job_id) : null;
        const candidateName = app ? nameFor(app.id, profile) : profile?.full_name || profile?.email || "Unknown";
        const jobTitle = job?.title || "Unknown Position";

        if (doc.status === "signed" && doc.signed_at) {
          activityItems.push({
            id: `doc-signed-${doc.id}`,
            type: "document",
            title: "Document Signed",
            description: `${candidateName} signed ${doc.name}`,
            timestamp: doc.signed_at,
            link: `/documents`,
            metadata: { candidateName, jobTitle },
          });
        } else {
          activityItems.push({
            id: `doc-${doc.id}`,
            type: "document",
            title: "Document Sent",
            description: `${doc.name} sent to ${candidateName}`,
            timestamp: doc.created_at,
            link: `/documents`,
            metadata: { candidateName, jobTitle },
          });
        }
      });

      // Sort by timestamp descending
      activityItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return activityItems.slice(0, limit);
    },
    enabled: !!user && mode === "hireflow1",
    staleTime: 30000,
  });

  // Real-time subscription. Per-instance topic: only the cockpit Dashboard
  // calls this today, but it is an ordinary hook (ActivityFeed.tsx and
  // useCockpitDashboard call it too, unmounted), and a repeated topic hands
  // every caller the SAME channel — the second `.on()` then fails the join.
  // Applications changes also reach this feed through useEmployerLiveSync;
  // this channel still covers interviews and documents.
  // Keyed on the id string, not the user object, so a token refresh (a new
  // user object) does not re-run this on the same topic.
  const instanceId = useId();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`activity-feed-${userId}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applications" },
        () => queryClient.invalidateQueries({ queryKey: ["activity-feed"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "interviews" },
        () => queryClient.invalidateQueries({ queryKey: ["activity-feed"] })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents" },
        () => queryClient.invalidateQueries({ queryKey: ["activity-feed"] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, instanceId, queryClient]);

  return { activities: activities || [], isLoading };
}
