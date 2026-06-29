import { useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useSubscription } from "@/hooks/useSubscription";
import { useEmployerJobs } from "@/hooks/useJobs";
import { useEmployerApplications, useApplicationStats, useUpdateApplication } from "@/hooks/useApplications";
import { useActivityFeed } from "@/hooks/useActivityFeed";
import { useInterviews } from "@/hooks/useInterviews";
import { useDocuments } from "@/hooks/useDocuments";
import { useConversations, useMessages, useSendMessage, useMarkAsRead } from "@/hooks/useMessages";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useTeamInvitations } from "@/hooks/useTeam";
import { useAdvancedAnalytics } from "@/hooks/useAdvancedAnalytics";
import {
  buildAccountFromProfile,
  buildDashboardHero,
  buildDashboardKpis,
  buildPipeline,
  mapActivityFeed,
  mapCandidate,
  mapChatMessages,
  mapConversation,
  mapDocumentRow,
  mapInterviewItem,
  mapJobRow,
  mapTeamInvite,
  mapTeamMember,
  candidateSignalFromApp,
} from "../lib/mappers";
import {
  fetchShowcaseAccount,
  fetchShowcaseJobs,
  fetchShowcaseCandidates,
  fetchShowcaseDashboard,
  updateShowcaseDecision,
  fetchShowcaseConversations,
  fetchShowcaseThread,
  fetchShowcaseDocuments,
  fetchShowcaseInterviews,
  fetchShowcaseAnalytics,
  fetchShowcaseTeam,
  buildShowcasePipeline,
} from "../data/showcaseSource";
import { useSchemaMode } from "@/hooks/useSchemaMode";

export { useSchemaMode };

export function useCockpitAccount() {
  const { data: mode } = useSchemaMode();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { getTrialTimeRemaining } = useSubscription();
  const trial = getTrialTimeRemaining();

  const showcaseQ = useQuery({
    queryKey: ["showcase-account"],
    queryFn: fetchShowcaseAccount,
    enabled: mode === "showcase",
  });

  const account = useMemo(() => {
    if (mode === "showcase" && showcaseQ.data) return showcaseQ.data;
    return buildAccountFromProfile(profile, trial?.expired ? 0 : trial?.days ?? null);
  }, [mode, showcaseQ.data, profile, trial]);

  return { account, profile, isLoading: profileLoading || showcaseQ.isLoading };
}

export function useCockpitJobsData() {
  const { data: mode } = useSchemaMode();
  const { data: jobs = [], isLoading: jobsLoading } = useEmployerJobs();
  const { data: applications = [], isLoading: appsLoading } = useEmployerApplications();

  const showcaseQ = useQuery({
    queryKey: ["showcase-jobs"],
    queryFn: fetchShowcaseJobs,
    enabled: mode === "showcase",
  });

  const rows = useMemo(() => {
    if (mode === "showcase") return showcaseQ.data ?? [];
    return jobs.map((j) => mapJobRow(j, applications));
  }, [mode, showcaseQ.data, jobs, applications]);

  return {
    jobs: rows,
    rawJobs: jobs,
    applications,
    isLoading: mode === "showcase" ? showcaseQ.isLoading : jobsLoading || appsLoading,
  };
}

export function useCockpitCandidates() {
  const { data: mode } = useSchemaMode();
  const { data: applications = [], isLoading: hfLoading } = useEmployerApplications();

  const showcaseQ = useQuery({
    queryKey: ["showcase-candidates"],
    queryFn: fetchShowcaseCandidates,
    enabled: mode === "showcase",
  });

  const candidates = useMemo(() => {
    if (mode === "showcase") return showcaseQ.data?.candidates ?? [];
    return applications.map(mapCandidate);
  }, [mode, showcaseQ.data, applications]);

  const pipeline = useMemo(() => {
    if (mode === "showcase" && showcaseQ.data) return buildShowcasePipeline(showcaseQ.data.candidates);
    return buildPipeline(applications);
  }, [mode, showcaseQ.data, applications]);

  const signals = useMemo(() => {
    const map: Record<string, { score: number; active: boolean }> = {};
    if (mode === "showcase") {
      candidates.forEach((c) => {
        map[c.avatar] = { score: c.overall, active: false };
      });
      return map;
    }
    applications.forEach((app) => {
      map[app.candidate_id] = candidateSignalFromApp(app);
    });
    return map;
  }, [mode, candidates, applications]);

  const showcaseApps = showcaseQ.data?.applications ?? [];

  return {
    candidates,
    applications: mode === "showcase" ? showcaseApps : applications,
    pipeline,
    signals,
    isLoading: mode === "showcase" ? showcaseQ.isLoading : hfLoading,
  };
}

export function useCockpitDashboard() {
  const { account } = useCockpitAccount();
  const { data: mode } = useSchemaMode();
  const { data: jobs = [], isLoading: jobsLoading } = useEmployerJobs();
  const { data: applications = [], isLoading: appsLoading } = useEmployerApplications();
  const { data: stats } = useApplicationStats();
  const { data: activities = [], isLoading: activityLoading } = useActivityFeed(8);

  const showcaseQ = useQuery({
    queryKey: ["showcase-dashboard"],
    queryFn: fetchShowcaseDashboard,
    enabled: mode === "showcase",
  });

  const dashboard = useMemo(() => {
    if (mode === "showcase" && showcaseQ.data) {
      const { pipeline: _p, ...dash } = showcaseQ.data;
      return dash;
    }
    const hero = buildDashboardHero(applications);
    const kpis = buildDashboardKpis(jobs, applications);
    const activity = mapActivityFeed(activities);
    return { hero, kpis, activity };
  }, [mode, showcaseQ.data, applications, jobs, activities]);

  const pipeline = useMemo(() => {
    if (mode === "showcase" && showcaseQ.data) return showcaseQ.data.pipeline;
    return buildPipeline(applications);
  }, [mode, showcaseQ.data, applications]);

  return {
    account,
    dashboard,
    pipeline,
    stats,
    isLoading: mode === "showcase" ? showcaseQ.isLoading : jobsLoading || appsLoading || activityLoading,
  };
}

export function useCockpitCandidate(id: string | undefined) {
  const { candidates, applications, isLoading } = useCockpitCandidates();
  const candidate = useMemo(
    () => candidates.find((c) => c.id === id) ?? candidates[0] ?? null,
    [candidates, id],
  );
  const application = useMemo(
    () => applications.find((a) => a.id === id) ?? applications[0] ?? null,
    [applications, id],
  );
  return { candidate, application, isLoading };
}

export function useCockpitActions() {
  const { data: mode } = useSchemaMode();
  const updateApplication = useUpdateApplication();
  const queryClient = useQueryClient();

  const advance = useCallback(
    async (applicationId: string, currentStatus?: string) => {
      if (mode === "showcase") {
        try {
          await updateShowcaseDecision(applicationId, "offer");
          toast.success("Candidate advanced");
          queryClient.invalidateQueries({ queryKey: ["showcase-candidates"] });
          queryClient.invalidateQueries({ queryKey: ["showcase-dashboard"] });
        } catch (err) {
          console.error(err);
          toast.error("Could not advance candidate");
        }
        return;
      }

      const nextStatus =
        currentStatus === "pending" || currentStatus === "in_progress"
          ? "reviewing"
          : currentStatus === "reviewing"
            ? "interview"
            : currentStatus === "interview"
              ? "offered"
              : "reviewing";

      try {
        await updateApplication.mutateAsync({ id: applicationId, status: nextStatus });
        toast.success("Candidate advanced");
        queryClient.invalidateQueries({ queryKey: ["applications"] });
        queryClient.invalidateQueries({ queryKey: ["activity-feed"] });
      } catch (err) {
        console.error(err);
        toast.error("Could not advance candidate");
      }
    },
    [updateApplication, queryClient, mode],
  );

  const pass = useCallback(
    async (applicationId: string) => {
      if (mode === "showcase") {
        try {
          await updateShowcaseDecision(applicationId, "passed");
          toast.success("Candidate passed");
          queryClient.invalidateQueries({ queryKey: ["showcase-candidates"] });
        } catch (err) {
          console.error(err);
          toast.error("Could not update candidate");
        }
        return;
      }

      try {
        await updateApplication.mutateAsync({ id: applicationId, status: "rejected" });
        toast.success("Candidate passed");
        queryClient.invalidateQueries({ queryKey: ["applications"] });
      } catch (err) {
        console.error(err);
        toast.error("Could not update candidate");
      }
    },
    [updateApplication, queryClient, mode],
  );

  return { advance, pass, isUpdating: updateApplication.isPending };
}

export function useCockpitInterviews() {
  const { data: mode } = useSchemaMode();
  const { data: interviews = [], isLoading: hfLoading } = useInterviews();

  const showcaseQ = useQuery({
    queryKey: ["showcase-interviews"],
    queryFn: fetchShowcaseInterviews,
    enabled: mode === "showcase",
  });

  const data = useMemo(() => {
    if (mode === "showcase" && showcaseQ.data) return showcaseQ.data;

    const today = new Date();
    const upcoming = interviews
      .filter((i) => i.status === "scheduled" && new Date(i.scheduled_at) >= today)
      .slice(0, 8)
      .map(mapInterviewItem);

    const todayCount = interviews.filter((i) => {
      const d = new Date(i.scheduled_at);
      return d.toDateString() === today.toDateString() && i.status === "scheduled";
    }).length;

    const scheduled = interviews.filter((i) => i.status === "scheduled").length;
    const completed = interviews.filter((i) => i.status === "completed").length;
    const needsReview = interviews.filter((i) => i.status === "completed").length;

    const daysWithInterviews = [
      ...new Set(interviews.map((i) => new Date(i.scheduled_at).getDate()).filter(Boolean)),
    ];

    return {
      kpis: [
        { label: "Today", value: todayCount, icon: "calendar" as const },
        { label: "Scheduled", value: scheduled, icon: "calendar" as const },
        { label: "Completed", value: completed, icon: "check" as const },
        { label: "Needs review", value: Math.min(needsReview, 9), icon: "clock" as const },
      ],
      daysWithInterviews,
      selectedDay: today.getDate(),
      upcoming,
      reads: [] as Array<{ id: string; icon: "user" | "star"; text: string }>,
    };
  }, [mode, showcaseQ.data, interviews]);

  return { interviews: data, isLoading: mode === "showcase" ? showcaseQ.isLoading : hfLoading };
}

export function useCockpitDocuments() {
  const { data: mode } = useSchemaMode();
  const { data: documents = [], isLoading: hfLoading } = useDocuments();

  const showcaseQ = useQuery({
    queryKey: ["showcase-documents"],
    queryFn: fetchShowcaseDocuments,
    enabled: mode === "showcase",
  });

  const data = useMemo(() => {
    if (mode === "showcase" && showcaseQ.data) return showcaseQ.data;
    const rows = documents.map(mapDocumentRow);
    const pending = rows.filter((r) => r.status === "Pending").length;
    const signed = rows.filter((r) => r.status === "Signed").length;
    const declined = rows.filter((r) => r.status === "Declined").length;

    return {
      kpis: [
        { label: "Pending", value: pending, icon: "clock" as const, tone: "brass" as const },
        { label: "Signed", value: signed, icon: "check" as const, tone: "jade" as const },
        { label: "Declined", value: declined, icon: "x" as const, tone: "muted" as const },
        { label: "Awaiting your signature", value: pending, icon: "edit" as const, tone: "brass" as const },
      ],
      tabs: ["All documents", "Pending", "Signed", "Requests"],
      rows,
      detailTimeline: [],
    };
  }, [mode, showcaseQ.data, documents]);

  return { documents: data, isLoading: mode === "showcase" ? showcaseQ.isLoading : hfLoading };
}

export function useCockpitMessages(contactId: string | null) {
  const { data: mode } = useSchemaMode();
  const { user } = useAuth();
  const { data: conversations = [], isLoading: convLoading } = useConversations();
  const { data: applications = [] } = useEmployerApplications();
  const { data: thread = [], isLoading: threadLoading } = useMessages(contactId);
  const sendMessage = useSendMessage();
  const markAsRead = useMarkAsRead();

  const showcaseConvsQ = useQuery({
    queryKey: ["showcase-conversations"],
    queryFn: fetchShowcaseConversations,
    enabled: mode === "showcase",
  });

  const showcaseConv = showcaseConvsQ.data?.find((c) => c.id === contactId);
  const showcaseThreadQ = useQuery({
    queryKey: ["showcase-thread", showcaseConv?.conversationId],
    queryFn: () => fetchShowcaseThread(showcaseConv!.conversationId),
    enabled: mode === "showcase" && !!showcaseConv?.conversationId,
  });

  const mappedConversations = useMemo(() => {
    if (mode === "showcase") return showcaseConvsQ.data ?? [];
    return conversations.map((c) => mapConversation(c, applications));
  }, [mode, showcaseConvsQ.data, conversations, applications]);

  const mappedThread = useMemo(() => {
    if (mode === "showcase") return showcaseThreadQ.data ?? [];
    return user ? mapChatMessages(thread, user.id) : [];
  }, [mode, showcaseThreadQ.data, thread, user]);

  const send = useCallback(
    async (text: string, receiverId: string, applicationId?: string) => {
      if (mode === "showcase") {
        toast.message("Messaging is read-only in the showcase dataset.");
        return;
      }
      await sendMessage.mutateAsync({ receiver_id: receiverId, content: text, application_id: applicationId });
    },
    [sendMessage, mode],
  );

  const markRead = useCallback(
    async (ids: string[]) => {
      if (mode === "showcase" || !ids.length) return;
      await markAsRead.mutateAsync(ids);
    },
    [markAsRead, mode],
  );

  return {
    conversations: mappedConversations,
    thread: mappedThread,
    rawThread: thread,
    send,
    markRead,
    isLoading:
      mode === "showcase"
        ? showcaseConvsQ.isLoading || showcaseThreadQ.isLoading
        : convLoading || threadLoading,
    isSending: sendMessage.isPending,
  };
}

export function useCockpitTeam() {
  const { data: mode } = useSchemaMode();
  const { data: profile } = useProfile();
  const { data: members = [], isLoading: membersLoading } = useTeamMembers();
  const { data: invites = [], isLoading: invitesLoading } = useTeamInvitations();

  const showcaseQ = useQuery({
    queryKey: ["showcase-team", profile?.full_name, profile?.email],
    queryFn: () =>
      fetchShowcaseTeam({
        name: profile?.full_name,
        email: profile?.email,
      }),
    enabled: mode === "showcase",
  });

  const team = useMemo(() => {
    if (mode === "showcase" && showcaseQ.data) return showcaseQ.data;

    const mappedMembers = members.filter((m) => m.status === "active").map((m) => mapTeamMember(m));
    const mappedInvites = invites.filter((i) => i.status === "pending").map(mapTeamInvite);
    const viewOnly = members.filter((m) => !m.can_manage_pipeline && m.status === "active").length;

    return {
      kpis: [
        { label: "Active members", value: mappedMembers.length, note: "People with access", icon: "users" as const, dot: "jade" as const },
        { label: "Pending invites", value: mappedInvites.length, note: "Invites awaiting response", icon: "mail" as const, dot: "brass" as const },
        { label: "View-only members", value: viewOnly, note: "Can view but not edit", icon: "eye" as const, dot: "muted" as const },
      ],
      members: mappedMembers,
      invites: mappedInvites,
      permissionCols: [
        { title: "Owner", sub: "Full Admin" },
        { title: "Manager", sub: "Can manage\npipeline" },
        { title: "Shift Lead", sub: "Can message\ncandidates" },
        { title: "Accountant", sub: "Documents\nonly" },
        { title: "View-only", sub: "Can view\nonly" },
      ],
      permissionRows: [
        { label: "Create jobs", icon: "briefcase" as const, allow: [true, true, true, false, false] },
        { label: "Advance / pass candidates", icon: "sparkle" as const, allow: [true, true, false, false, false] },
        { label: "Schedule interviews", icon: "calendar" as const, allow: [true, true, true, false, false] },
        { label: "Send documents", icon: "doc" as const, allow: [true, true, true, true, false] },
        { label: "Manage team and settings", icon: "users" as const, allow: [true, false, false, false, false] },
      ],
    };
  }, [mode, showcaseQ.data, members, invites]);

  return { team, isLoading: mode === "showcase" ? showcaseQ.isLoading : membersLoading || invitesLoading };
}

export function useCockpitAnalytics() {
  const { data: mode } = useSchemaMode();
  const { data, isLoading: hfLoading } = useAdvancedAnalytics();
  const { pipeline: hfPipeline } = useCockpitCandidates();

  const showcaseQ = useQuery({
    queryKey: ["showcase-analytics"],
    queryFn: fetchShowcaseAnalytics,
    enabled: mode === "showcase",
  });

  const analytics = useMemo(() => {
    if (mode === "showcase" && showcaseQ.data) {
      const { pipeline: _p, ...rest } = showcaseQ.data;
      return rest;
    }

    const pipeline = hfPipeline;
    const timeToHire = data?.timeToHire?.avgDays ?? null;
    const totalApps = data?.applicationTrends?.reduce((s, t) => s + t.applications, 0) ?? 0;
    const hired = data?.applicationTrends?.reduce((s, t) => s + t.hired, 0) ?? 0;
    const hireRate = totalApps > 0 ? Math.round((hired / totalApps) * 100) : 0;

    // Real average screening score — only meaningful once candidates are scored.
    const scored = data?.aiScoreDistribution?.reduce((s, b) => s + b.count, 0) ?? 0;
    const avgScore =
      scored > 0
        ? Math.round(
            (data!.aiScoreDistribution.reduce((s, b, i) => {
              const mid = [10, 30, 50, 70, 90][i] ?? 50;
              return s + mid * b.count;
            }, 0)) / scored,
          )
        : null;

    // Real daily application counts (last 30 days). Quality-over-time has no real
    // time series yet, so we leave it empty rather than fabricate one.
    const trend = data?.applicationTrends?.map((t) => t.applications) ?? [];
    const trendLabels = ["30d ago", "23d", "15d", "7d", "Now"];

    const bottleneck = pipeline.find((p) => p.tone === "bottleneck");

    // Honest source breakdown: every application today arrives through the HireFlow
    // apply link / code (incl. Google for Jobs → direct apply). No invented split.
    const sources = totalApps > 0 ? [{ label: "Direct apply", value: totalApps, pct: "100%" }] : [];

    return {
      kpis: [
        { label: "Time to hire", value: timeToHire != null ? timeToHire.toFixed(1) : "—", unit: timeToHire != null ? "days" : "", delta: "first hire onward", trend: "down" as const, good: true, icon: "clock" as const },
        { label: "Hire rate", value: String(hireRate), unit: "%", delta: "hired / applicants", trend: "up" as const, good: true, icon: "userCheck" as const },
        { label: "Applicant quality", value: avgScore != null ? String(avgScore) : "—", unit: "", delta: scored > 0 ? `${scored} scored` : "awaiting screening", trend: "up" as const, good: true, icon: "star" as const },
        { label: "Applications", value: String(totalApps), unit: "", delta: "last 30 days", trend: "up" as const, good: true, icon: "chat" as const },
      ],
      trend,
      trendLabels,
      sources,
      quality: [] as number[],
      insight:
        totalApps === 0
          ? "Publish a role and share your apply link to start seeing funnel data."
          : bottleneck
            ? `${bottleneck.label} stage is the largest drop-off — review your flow settings.`
            : "Your pipeline is moving steadily.",
    };
  }, [mode, showcaseQ.data, data, hfPipeline]);

  const pipeline = mode === "showcase" && showcaseQ.data ? showcaseQ.data.pipeline : hfPipeline;

  return { analytics, pipeline, isLoading: mode === "showcase" ? showcaseQ.isLoading : hfLoading };
}
