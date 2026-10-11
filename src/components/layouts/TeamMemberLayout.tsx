import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthLoadingScreen } from "@/components/animations/AuthLoadingScreen";
import TeamOnboardingWizard from "@/components/team/TeamOnboardingWizard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { GlobalNotificationToasts } from "@/components/GlobalNotificationToasts";
import { EmployerLiveSync } from "@/cockpit/hooks/useEmployerLiveSync";
import { GuidedTips } from "@/cockpit/tips/GuidedTips";
import AppSidebar from "@/components/AppSidebar";
import AppHeader from "@/components/AppHeader";

/**
 * A team member's frame, split out of AppLayout.tsx (2026-10-11, the
 * performance check) so a business owner's first download carries none of
 * it (its welcome wizard, the older sidebar). AppLayout loads it only for this person.
 */
export default function TeamMemberLayout({
  user,
  isMobile,
  sidebarOpen,
  setSidebarOpen,
  handleToggleSidebar,
  handleNavigate,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  mainContentRef,
}: {
  user: { id: string };
  isMobile: boolean;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  handleToggleSidebar: () => void;
  handleNavigate: () => void;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: () => void;
  mainContentRef: React.RefObject<HTMLDivElement>;
}) {
  const [teamOnboardingLoading, setTeamOnboardingLoading] = useState(true);
  const [teamNeedsOnboarding, setTeamNeedsOnboarding] = useState(false);
  const [teamContext, setTeamContext] = useState<{
    companyName: string;
    memberName: string;
    department: string | null;
    permissionLabel: string;
    assignedJobTitles: string[];
    canCreateJobs: boolean;
    canMessageCandidates: boolean;
    canManagePipeline: boolean;
    canScheduleInterviews: boolean;
    canSendDocuments: boolean;
  } | null>(null);

  useEffect(() => {
    let isCancelled = false;

    void (async () => {
      const { data: membership, error: membershipError } = await supabase
        .from("team_members")
        .select("name, department, employer_id, permission_level, assigned_job_ids, can_create_jobs, can_message_candidates, can_manage_pipeline, can_schedule_interviews, can_send_documents, onboarding_completed")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (membershipError || !membership || isCancelled) {
        setTeamOnboardingLoading(false);
        return;
      }

      const permissionLabel =
        membership.permission_level === "full_admin"
          ? "Full Admin"
          : membership.permission_level === "limited"
            ? "Team Member"
            : "View Only";

      let companyName = "Your organization";
      const assignedJobIds = Array.isArray(membership.assigned_job_ids) ? membership.assigned_job_ids : [];
      let assignedJobTitles: string[] = [];

      // The business's public name: a team member may not read the owner's
      // profile (RLS), so profiles always came back empty here.
      const [{ data: profileData }, jobsResult] = await Promise.all([
        supabase
          .from("employer_public_branding")
          .select("company_name")
          .eq("user_id", membership.employer_id)
          .maybeSingle(),
        assignedJobIds.length > 0
          ? supabase.from("jobs").select("title").in("id", assignedJobIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (isCancelled) {
        return;
      }

      if (profileData?.company_name) {
        companyName = profileData.company_name;
      }

      if (jobsResult.data && Array.isArray(jobsResult.data)) {
        assignedJobTitles = jobsResult.data.map((job) => job.title).filter(Boolean);
      }

      setTeamContext({
        companyName,
        memberName: membership.name || "Team member",
        department: membership.department,
        permissionLabel,
        assignedJobTitles,
        canCreateJobs: membership.can_create_jobs ?? false,
        canMessageCandidates: membership.can_message_candidates ?? false,
        canManagePipeline: membership.can_manage_pipeline ?? false,
        canScheduleInterviews: membership.can_schedule_interviews ?? false,
        canSendDocuments: membership.can_send_documents ?? false,
      });
      setTeamNeedsOnboarding(!membership.onboarding_completed);
      setTeamOnboardingLoading(false);
    })();

    return () => {
      isCancelled = true;
    };
  }, [user.id]);

  const handleTeamOnboardingComplete = async () => {
    // Only the owner may update team_members, so the member marks their own
    // welcome done through the database (it used to come back every sign-in).
    const { error } = await supabase.rpc("mark_team_welcome_done" as never);
    if (error) console.warn("[team] could not save the welcome as done", error.message);
    setTeamNeedsOnboarding(false);
  };

  if (teamOnboardingLoading) {
    return <AuthLoadingScreen variant="employer" />;
  }

  if (teamNeedsOnboarding && teamContext) {
    return <TeamOnboardingWizard {...teamContext} onComplete={handleTeamOnboardingComplete} />;
  }

  return (
    <TooltipProvider>
      <div
        className="h-[100dvh] bg-background relative overflow-x-hidden flex w-full"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <OfflineIndicator />
        <GlobalNotificationToasts />
        {/* Same live applicant sync as the owner shell. */}
        <EmployerLiveSync />
        <GuidedTips />
        <div className="hidden md:block absolute top-0 right-0 md:w-[600px] md:h-[600px] bg-primary/15 rounded-full md:blur-[150px] pointer-events-none" />
        <div className="hidden md:block absolute bottom-0 left-0 md:w-[500px] md:h-[500px] bg-accent/12 rounded-full md:blur-[150px] pointer-events-none" />

        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-40 transition-opacity duration-300"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <AppSidebar
          isOpen={sidebarOpen}
          isMobile={isMobile}
          onToggle={handleToggleSidebar}
          onNavigate={handleNavigate}
        />
        <div
          ref={mainContentRef}
          className="flex-1 flex flex-col min-w-0 w-full max-w-full relative z-10"
        >
          <AppHeader onMenuClick={handleToggleSidebar} isMobile={isMobile} />
          <main className="flex-1 p-4 md:p-8 overflow-auto overflow-x-hidden w-full max-w-full">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
