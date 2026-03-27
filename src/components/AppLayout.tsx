import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import AppSidebar from "./AppSidebar";
import AppHeader from "./AppHeader";
import { AuthLoadingScreen } from "@/components/animations/AuthLoadingScreen";

import OnboardingWizard from "./subscription/OnboardingWizard";
import CandidateOnboardingWizard from "./subscription/CandidateOnboardingWizard";
import TrialExpiredOverlay from "./subscription/TrialExpiredOverlay";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalNotificationToasts } from "@/components/GlobalNotificationToasts";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Card, CardContent } from "@/components/ui/card";
import { Shield } from "lucide-react";
import TeamOnboardingWizard from "@/components/team/TeamOnboardingWizard";

// Edge swipe detection constants
const EDGE_SWIPE_THRESHOLD = 30; // px from edge to start swipe
const SWIPE_MIN_DISTANCE = 80; // px to trigger open
const TEAM_ALLOWED_PATH_PREFIXES = [
  "/team-portal",
  "/jobs",
  "/applicants",
  "/interviews",
  "/messages",
  "/documents",
  "/profile",
  "/settings",
  "/notifications",
];

function isAllowedTeamPath(pathname: string) {
  return TEAM_ALLOWED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading, role, signOut, isTeamMember } = useAuth();
  const { subscription, teamAccess, isLoading: subLoading, error: subError, completeOnboarding, needsOnboarding: hookNeedsOnboarding, syncSubscription, refetch } = useSubscription();
  const isMobile = useIsMobile();
  usePushNotifications(); // Auto-registers device for push notifications in Natively
  const syncAttemptedRef = useRef(false);
  const globalSyncAttemptedRef = useRef(false);
  
  // Check if we need to sync subscription on mount (after checkout return)
  const [isSyncingSubscription, setIsSyncingSubscription] = useState(() => {
    const pendingSync = localStorage.getItem("pending_subscription_sync");
    if (!pendingSync) return false;
    const syncTimestamp = parseInt(pendingSync, 10);
    const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
    return syncTimestamp > thirtyMinutesAgo;
  });
  
  // Mobile sidebar is hidden by default, desktop is expanded
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return !isMobile;
    return window.innerWidth >= 768;
  });
  // Edge swipe state
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);

  // Update sidebar state when screen size changes
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  // Close sidebar after navigation on mobile
  const handleNavigate = useCallback(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  // Edge swipe to open sidebar on mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile || sidebarOpen) return;
    
    const touch = e.touches[0];
    // Only track if starting from left edge
    if (touch.clientX <= EDGE_SWIPE_THRESHOLD) {
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
    }
  }, [isMobile, sidebarOpen]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isMobile || sidebarOpen || touchStartX.current === null) return;
    
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = Math.abs(touch.clientY - (touchStartY.current || 0));
    
    // If horizontal swipe is dominant and exceeds threshold, open sidebar
    if (deltaX > SWIPE_MIN_DISTANCE && deltaX > deltaY * 2) {
      setSidebarOpen(true);
      touchStartX.current = null;
      touchStartY.current = null;
    }
  }, [isMobile, sidebarOpen]);

  const handleTouchEnd = useCallback(() => {
    touchStartX.current = null;
    touchStartY.current = null;
  }, []);

  // Global subscription=success handler (works from any route, not just Settings)
  useEffect(() => {
    if (!user || globalSyncAttemptedRef.current) return;
    const subscriptionParam = searchParams.get("subscription");
    if (subscriptionParam !== "success") return;
    
    globalSyncAttemptedRef.current = true;

    syncSubscription.mutateAsync()
      .then(async (result) => {
        // Clear query params
        setSearchParams((prev) => {
          prev.delete("subscription");
          prev.delete("session_id");
          return prev;
        });
        // Refetch immediately, then again after a short delay for consistency
        await refetch();
        setTimeout(() => refetch(), 500);
        if (result?.synced) {
          toast.success("Subscription activated! Welcome to HireFlow 🎉", { duration: 3000 });
          // Navigate to dashboard if currently on settings or blocked
          if (location.pathname === "/settings" || isExpiredCheck) {
            navigate("/dashboard", { replace: true });
          }
        }
      })
      .catch((error) => {
        console.error("[AppLayout] Global sync error:", error);
        setSearchParams((prev) => {
          prev.delete("subscription");
          prev.delete("session_id");
          return prev;
        });
      });
  }, [user, searchParams]);

  const isExpiredCheck = subscription?.status === 'expired' ||
                    (subscription?.status === 'trialing' && 
                     subscription?.trial_end && 
                     new Date(subscription.trial_end) < new Date());
  const hasRevokedTeamAccess = role === "team_member" && teamAccess.status === "revoked";
  const hasExpiredTeamAccess = isTeamMember && isExpiredCheck;
  const shouldRedirectTeamMember =
    isTeamMember &&
    !hasExpiredTeamAccess &&
    !hasRevokedTeamAccess &&
    !isAllowedTeamPath(location.pathname);

  // Handle auth errors from subscription - session likely expired
  useEffect(() => {
    if (subError) {
      const errorMessage = subError?.message || String(subError);
      if (errorMessage.includes("not authenticated") || errorMessage.includes("User not authenticated")) {
        signOut();
      }
    }
  }, [subError, signOut]);

  // Auto-sync subscription when pending flag exists (after checkout in new tab)
  useEffect(() => {
    if (!user || subLoading || syncAttemptedRef.current) return;
    
    const pendingSync = localStorage.getItem("pending_subscription_sync");
    if (!pendingSync) {
      setIsSyncingSubscription(false);
      return;
    }
    
    const syncTimestamp = parseInt(pendingSync, 10);
    const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);
    
    // Only sync if flag is recent (within 30 minutes)
    if (syncTimestamp > thirtyMinutesAgo) {
      syncAttemptedRef.current = true;
      setIsSyncingSubscription(true);
      syncSubscription.mutateAsync()
        .then((result) => {
          localStorage.removeItem("pending_subscription_sync");
          if (result?.synced) {
            toast.success("Subscription activated!");
            refetch();
          }
        })
        .catch((error) => {
          console.error("[AppLayout] Sync error:", error);
          localStorage.removeItem("pending_subscription_sync");
        })
        .finally(() => {
          setIsSyncingSubscription(false);
        });
    } else {
      // Flag is too old, clear it
      localStorage.removeItem("pending_subscription_sync");
      setIsSyncingSubscription(false);
    }
  }, [user, subLoading, syncSubscription, refetch]);

  useEffect(() => {
    if (!loading && !user) {
      const isCandidateRoute = location.pathname.startsWith("/candidate");

      if (location.pathname === "/apply") {
        navigate(`/candidate/apply${location.search}`, { replace: true });
        return;
      }

      if (location.pathname.startsWith("/job/")) {
        navigate(`/candidate${location.pathname}${location.search}`, { replace: true });
        return;
      }

      navigate(isCandidateRoute ? "/candidate/auth" : "/auth", { replace: true });
    } else if (!loading && user && (role as string) === 'developer' && !location.pathname.startsWith("/developer")) {
      // Redirect developers to their dashboard
      navigate("/developer", { replace: true });
    }
  }, [user, loading, role, navigate, location.pathname, location.search]);

  useEffect(() => {
    if (!loading && user && shouldRedirectTeamMember) {
      navigate("/team-portal", { replace: true });
    }
  }, [loading, user, shouldRedirectTeamMember, navigate]);

  const isCandidateRoute = location.pathname.startsWith("/candidate");
  const loadingVariant = isCandidateRoute ? "candidate" : "employer";
  const isGuestDraftSignal =
    !isCandidateRoute &&
    location.pathname === "/jobs/create" &&
    (searchParams.get("guestDraft") === "1" ||
      (typeof window !== "undefined" && Boolean(window.localStorage.getItem("guestJobData"))));
  const isGuestDraftHandoff =
    !isCandidateRoute &&
    location.pathname === "/jobs/create" &&
    typeof window !== "undefined" &&
    (isGuestDraftSignal || window.sessionStorage.getItem("guestDraftOnboardingBypass") === "1");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (isGuestDraftSignal) {
      window.sessionStorage.setItem("guestDraftOnboardingBypass", "1");
      return;
    }

    if (location.pathname !== "/jobs/create") {
      window.sessionStorage.removeItem("guestDraftOnboardingBypass");
    }
  }, [isGuestDraftSignal, location.pathname]);

  // Show loading while auth is loading
  if (loading) {
    return <AuthLoadingScreen variant={loadingVariant} />;
  }

  // Developers bypass all subscription checks - redirect immediately
  if (user && (role as string) === 'developer') {
    if (!location.pathname.startsWith("/developer")) {
      navigate("/developer", { replace: true });
    }
    return <AuthLoadingScreen variant={loadingVariant} />;
  }

  if (shouldRedirectTeamMember) {
    return <AuthLoadingScreen variant={loadingVariant} />;
  }

  // ═══════════════════════════════════════════════════════
  // CANDIDATES: 100% free access — bypass ALL subscription logic
  // ═══════════════════════════════════════════════════════
  if (user && role === 'candidate') {
    return <CandidateLayout
      user={user}
      isMobile={isMobile}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      handleToggleSidebar={handleToggleSidebar}
      handleNavigate={handleNavigate}
      handleTouchStart={handleTouchStart}
      handleTouchMove={handleTouchMove}
      handleTouchEnd={handleTouchEnd}
      mainContentRef={mainContentRef}
    />;
  }

  // ═══════════════════════════════════════════════════════
  // EMPLOYERS & TEAM: Subscription-gated access below
  // ═══════════════════════════════════════════════════════

  // Show loading while subscription is loading (non-developers only)
  if (subLoading) {
    return <AuthLoadingScreen variant={loadingVariant} />;
  }

  // If there's a subscription auth error while logged in, show loading and let the useEffect handle sign-out
  if (user && subError) {
    const errorMessage = subError?.message || String(subError);
    if (errorMessage.includes("not authenticated") || errorMessage.includes("User not authenticated")) {
      return <AuthLoadingScreen variant={loadingVariant} />;
    }
  }

  if (!user) {
    return <AuthLoadingScreen variant={loadingVariant} />;
  }

  // Show loading while syncing subscription after checkout
  if (isSyncingSubscription) {
    return <AuthLoadingScreen variant={loadingVariant} message="Activating your subscription..." />;
  }

  // Show onboarding wizard for employers only
  if (hookNeedsOnboarding && !isGuestDraftHandoff && role === "employer") {
    return <OnboardingWizard onComplete={() => {/* navigation handled inside wizard */}} />;
  }

  if (hasRevokedTeamAccess) {
    return (
      <TeamAccessRestricted
        title="Access Restricted"
        description="Your team access was removed by the account owner. Please contact your account administrator if you need access restored."
      />
    );
  }

  if (hasExpiredTeamAccess) {
    return (
      <TeamAccessRestricted
        title="Access Restricted"
        description="Your employer's subscription has expired. Please contact your account administrator to restore access."
      />
    );
  }

  // Show expired overlay for expired trials (employers only)
  if (isExpiredCheck && role === "employer") {
    return <TrialExpiredOverlay />;
  }

  if (user && isTeamMember) {
    return <TeamMemberLayout
      user={user}
      isMobile={isMobile}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      handleToggleSidebar={handleToggleSidebar}
      handleNavigate={handleNavigate}
      handleTouchStart={handleTouchStart}
      handleTouchMove={handleTouchMove}
      handleTouchEnd={handleTouchEnd}
      mainContentRef={mainContentRef}
    />;
  }

  return (
    <TooltipProvider>
      <div 
        className="h-[100dvh] bg-background relative overflow-x-hidden flex w-full"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Offline indicator */}
        <OfflineIndicator />
        
        {/* Global notification toasts listener */}
        <GlobalNotificationToasts />
        
        {/* Premium gradient orbs - hidden on mobile for WebView GPU savings */}
        <div className="hidden md:block absolute top-0 right-0 md:w-[600px] md:h-[600px] bg-primary/15 rounded-full md:blur-[150px] pointer-events-none" />
        <div className="hidden md:block absolute bottom-0 left-0 md:w-[500px] md:h-[500px] bg-accent/12 rounded-full md:blur-[150px] pointer-events-none" />
        
        {/* Mobile overlay backdrop — no blur on mobile for performance */}
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
          <AppHeader 
            onMenuClick={handleToggleSidebar}
            isMobile={isMobile}
          />
          <main className="flex-1 p-4 md:p-8 overflow-auto overflow-x-hidden w-full max-w-full">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function TeamMemberLayout({
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

      const [{ data: profileData }, jobsResult] = await Promise.all([
        supabase
          .from("profiles")
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
    await supabase
      .from("team_members")
      .update({ onboarding_completed: true })
      .eq("user_id", user.id)
      .eq("status", "active");

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

function TeamAccessRestricted({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
      <Card className="max-w-md w-full text-center">
        <CardContent className="p-8 space-y-4">
          <div className="p-4 rounded-full bg-destructive/10 w-fit mx-auto">
            <Shield className="h-10 w-10 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// CandidateLayout: Renders the full app layout for candidates
// with independent onboarding (no subscription dependency)
// ═══════════════════════════════════════════════════════
function CandidateLayout({
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
  const [candidateNeedsOnboarding, setCandidateNeedsOnboarding] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data && !data.onboarding_completed) {
          setCandidateNeedsOnboarding(true);
        }
        setOnboardingLoading(false);
      });
  }, [user.id]);

  const handleOnboardingComplete = async () => {
    await supabase
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("user_id", user.id);
    setCandidateNeedsOnboarding(false);
  };

  if (onboardingLoading) {
    return <AuthLoadingScreen variant="candidate" />;
  }

  if (candidateNeedsOnboarding) {
    return <CandidateOnboardingWizard onComplete={handleOnboardingComplete} />;
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
