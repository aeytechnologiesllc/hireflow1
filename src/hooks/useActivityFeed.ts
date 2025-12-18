import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  const queryClient = useQueryClient();

  const { data: activities, isLoading } = useQuery({
    queryKey: ["activity-feed", user?.id, limit],
    queryFn: async () => {
      if (!user) return [];

      // Fetch recent applications
      const { data: applications } = await supabase
        .from("applications")
        .select(`
          id,
          status,
          created_at,
          updated_at,
          jobs!inner(title, employer_id),
          profiles:candidate_id(full_name, email)
        `)
        .eq("jobs.employer_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(limit);

      // Fetch recent interviews
      const { data: interviews } = await supabase
        .from("interviews")
        .select(`
          id,
          status,
          scheduled_at,
          created_at,
          applications!inner(
            id,
            candidate_id,
            jobs!inner(title, employer_id),
            profiles:candidate_id(full_name, email)
          )
        `)
        .eq("applications.jobs.employer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      // Fetch recent documents
      const { data: documents } = await supabase
        .from("documents")
        .select(`
          id,
          name,
          status,
          created_at,
          signed_at,
          applications!inner(
            id,
            jobs!inner(title, employer_id),
            profiles:candidate_id(full_name, email)
          )
        `)
        .eq("applications.jobs.employer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      const activityItems: ActivityItem[] = [];

      // Process applications
      applications?.forEach((app: any) => {
        const candidateName = app.profiles?.full_name || app.profiles?.email || "Unknown";
        const jobTitle = app.jobs?.title || "Unknown Position";

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
        } else if (app.status === "pending" && new Date(app.created_at).getTime() === new Date(app.updated_at).getTime()) {
          activityItems.push({
            id: `app-${app.id}`,
            type: "application",
            title: "New Application",
            description: `${candidateName} applied for ${jobTitle}`,
            timestamp: app.created_at,
            link: `/applicants/${app.id}`,
            metadata: { candidateName, jobTitle, status: app.status },
          });
        } else if (app.status !== "pending") {
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
      interviews?.forEach((interview: any) => {
        const app = interview.applications;
        const candidateName = app?.profiles?.full_name || app?.profiles?.email || "Unknown";
        const jobTitle = app?.jobs?.title || "Unknown Position";

        activityItems.push({
          id: `interview-${interview.id}`,
          type: "interview",
          title: interview.status === "completed" ? "Interview Completed" : "Interview Scheduled",
          description: `${interview.status === "completed" ? "Completed" : "Scheduled"} interview with ${candidateName} for ${jobTitle}`,
          timestamp: interview.created_at,
          link: `/applicants/${app?.id}`,
          metadata: { candidateName, jobTitle },
        });
      });

      // Process documents
      documents?.forEach((doc: any) => {
        const app = doc.applications;
        const candidateName = app?.profiles?.full_name || app?.profiles?.email || "Unknown";
        const jobTitle = app?.jobs?.title || "Unknown Position";

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
    enabled: !!user,
    staleTime: 30000,
  });

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("activity-feed-updates")
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
  }, [user, queryClient]);

  return { activities: activities || [], isLoading };
}
