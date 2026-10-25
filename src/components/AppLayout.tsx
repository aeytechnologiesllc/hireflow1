import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useIsMobile } from "@/hooks/use-mobile";

import CockpitShell from "@/cockpit/Shell";
import { AuthLoadingScreen } from "@/components/animations/AuthLoadingScreen";

import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalNotificationToasts } from "@/components/GlobalNotificationToasts";
import { EmployerLiveSync } from "@/cockpit/hooks/useEmployerLiveSync";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useWebPushSync } from "@/hooks/useWebPush";
import { Card, CardContent } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { lazyWithReload } from "@/lib/lazyWithReload";

// Each person's frame is fetched only for them (2026-10-11, the performance
// check): the owner's cockpit is here; a team member's and an applicant's
// frames, with their welcome wizards, the confetti and the older sidebar,
// are their own files. The one-time tips too: only a new business sees them.
const TeamMemberLayout = lazyWithReload(() => import("@/components/layouts/TeamMemberLayout"));
const CandidateLayout = lazyWithReload(() => import("@/components/layouts/CandidateLayout"));
const GuidedTips = lazyWithReload(() => import("@/cockpit/tips/GuidedTips").then((m) => ({ default: m.GuidedTips })));
// The first-time "turn on notifications" card (the hiring side only).
const PushPrompt = lazyWithReload(() => import("@/cockpit/push/PushPrompt").then((m) => ({ default: m.PushPrompt })));

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
  // Help: a team member writes to HireFlow for their business (the "account
  // paused" alert links here too).
  "/help",
];

function isAllowedTeamPath(pathname: string) {
  return TEAM_ALLOWED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

// Routes under this shared AppLayout tree that are genuinely candidate-facing
// (the candidate's own application flow, or role-aware shared pages). Every
// other route here (/dashboard, /jobs, /applicants, /interviews, /messages,
// /documents, /more, /team, /team-portal, /analytics, ...) is an employer
// cockpit page that reads employer-scoped data — a pure candidate hitting one
// of those just sees the employer UI with empty states, so send them home.
const CANDIDATE_ALLOWED_PATH_PREFIXES = [
  "/apply",
  "/job",
  "/applications",
  // /messages renders the same shared page for both roles — the candidate's
  // sidebar links here and their unread badge depends on it being reachable.
  "/messages",
  // The candidate's own document hub — everything an employer has sent them
  // to sign or asked them to upload. /documents (the employer cockpit page)
  // is NOT here on purpose; see the legacy-link redirect below.
  "/my-documents",
  "/notifications",
  "/settings",
  "/profile",
  // Contact us: an applicant's own thread with the company (the Help page at
  // its own address; /help is staff-only on the staff host, src/lib/hosts.ts).
  "/contact",
];

function isAllowedCandidatePath(pathname: string) {
  return CANDIDATE_ALLOWED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, loading, role, signOut, isTeamMember } = useAuth();
  const { teamAccess, isLoading: subLoading, error: subError, completeOnboarding, needsOnboarding: hookNeedsOnboarding } = useSubscription();
  // A new business lands on the Dashboard's first steps (the 2026-10-11
  // mock-ups, #2), not a separate welcome screen: the flag that showed that
  // screen is simply marked done, once.
  const onboardingMarked = useRef(false);
  useEffect(() => {
    if (!hookNeedsOnboarding || role !== "employer" || onboardingMarked.current) return;
    onboardingMarked.current = true;
    completeOnboarding.mutate();
  }, [hookNeedsOnboarding, role, completeOnboarding]);
  const isMobile = useIsMobile();
  usePushNotifications(); // Auto-registers device for push notifications in Natively
  useWebPushSync(); // Puts this browser's notification subscription back at sign-in (phone Home Screen, Android, desktop)
  
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

  const hasRevokedTeamAccess = role === "team_member" && teamAccess.status === "revoked";
  const shouldRedirectTeamMember =
    isTeamMember &&
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

      // /applications/* is the candidate's own flow — a signed-out candidate
      // following an emailed step link used to be sent to the EMPLOYER door.
      // Send them to their own sign-in and carry the destination, in the
      // same-origin `?redirect=` form CandidateAuth already checks and honours.
      if (location.pathname === "/applications" || location.pathname.startsWith("/applications/")) {
        const destination = encodeURIComponent(`${location.pathname}${location.search}`);
        navigate(`/candidate/auth?redirect=${destination}`, { replace: true });
        return;
      }

      if (isCandidateRoute) {
        navigate("/candidate/auth", { replace: true });
        return;
      }
      // Anything else: sign in, then come back to it (an emailed or pushed
      // link to a chat used to lose the chat here). My documents, and a chat
      // opened from an applicant's bell (?employer=), are the applicant's;
      // every other private page is the hiring side's.
      const here = `${location.pathname}${location.search}`;
      const back = here && here !== "/" && here !== "/dashboard" ? `?redirect=${encodeURIComponent(here)}` : "";
      const applicantPage =
        location.pathname.startsWith("/my-documents") ||
        (location.pathname === "/messages" && new URLSearchParams(location.search).has("employer"));
      navigate(applicantPage ? `/candidate/auth${back}` : `/auth${back}`, { replace: true });
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

  // A pure candidate (no employer/team_member role — `role` already resolves
  // multi-role users to their highest-priority role, so `role === "candidate"`
  // means no employer/team_member row exists for them) who lands on an
  // employer cockpit route — a stale bookmark, a typed URL — should be sent
  // back to their own portal instead of shown the employer UI with empty
  // states. Only fires once the role has actually resolved, so employers see
  // no extra flicker while auth is still loading.
  const shouldRedirectCandidate =
    role === "candidate" && !isAllowedCandidatePath(location.pathname);

  useEffect(() => {
    if (!loading && user && shouldRedirectCandidate) {
      // /documents is the employer cockpit page and doesn't work for a
      // candidate — but it's also the link every document-request/offer
      // notification and email stored before /my-documents existed (and
      // still what a candidate's own sidebar pointed at). Send those here
      // instead of the generic /applications fallback so a stale link still
      // lands somewhere that actually shows the request.
      const destination =
        location.pathname === "/documents" || location.pathname.startsWith("/documents/")
          ? "/my-documents"
          : "/applications";
      navigate(destination, { replace: true });
    }
  }, [loading, user, shouldRedirectCandidate, location.pathname, navigate]);

  // Candidate-facing routes aren't all under /candidate — the application flow
  // lives at /applications/*, the public job page at /job/:id, and the code
  // entry at /apply — so the loading-screen variant has to check all of them,
  // or a candidate waiting on auth/subscription state sees employer copy
  // ("Preparing your dashboard...").
  //
  // /job/:id is the one a STRANGER opens from a shared link, so it is the worst
  // possible place to show them an employer dashboard message. It was missing
  // from this list, along with /apply, which is the same screen as
  // /candidate/apply mounted inside the layout.
  const CANDIDATE_ROUTE_PREFIXES = ["/candidate", "/applications", "/job/", "/apply", "/my-documents"] as const;
  const isCandidateRoute = CANDIDATE_ROUTE_PREFIXES.some((prefix) =>
    location.pathname.startsWith(prefix)
  );
  const loadingVariant = isCandidateRoute ? "candidate" : "employer";
  const isGuestDraftSignal =
    !isCandidateRoute &&
    location.pathname === "/jobs/create" &&
    (searchParams.get("guestDraft") === "1" ||
      (typeof window !== "undefined" && Boolean(window.localStorage.getItem("guestJobData"))));

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

  if (shouldRedirectCandidate) {
    return <AuthLoadingScreen variant={loadingVariant} />;
  }

  // ═══════════════════════════════════════════════════════
  // CANDIDATES: 100% free access — bypass ALL subscription logic
  // ═══════════════════════════════════════════════════════
  if (user && role === 'candidate') {
    return <Suspense fallback={<AuthLoadingScreen variant="candidate" />}><CandidateLayout
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
    /></Suspense>;
  }

  // ═══════════════════════════════════════════════════════
  // EMPLOYERS & TEAM: account-gated access below
  // ═══════════════════════════════════════════════════════

  // A team member waits for the account state (it says whether their access
  // still stands). An owner does not: nothing on their screen needs it to
  // draw, and waiting meant the whole shell was swapped for the loading
  // screen while get-subscription ran (about 1.5 s on a phone), then built
  // again from nothing, every time the app opened (the performance check,
  // 2026-10-11).
  if (subLoading && (isTeamMember || role === "team_member")) {
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


  if (hasRevokedTeamAccess) {
    return (
      <TeamAccessRestricted
        title="Access Restricted"
        description="Your team access was removed by the account owner. Please contact your account administrator if you need access restored."
        onSignOut={() => void signOut()}
      />
    );
  }

  if (user && isTeamMember) {
    return <Suspense fallback={<AuthLoadingScreen variant="employer" />}><TeamMemberLayout
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
    /></Suspense>;
  }

  return (
    <TooltipProvider>
      {/* Offline indicator */}
      <OfflineIndicator />
      {/* Global notification toasts listener */}
      <GlobalNotificationToasts />
      {/* Keeps Applicants, the selected panel, Dashboard and the full profile
          live as applicants act — mounted once per shell, never inside the
          sidebar or tab bar (they mount twice). */}
      <EmployerLiveSync />
      {/* One-time tips for a new business (src/cockpit/tips), fetched on their own. */}
      <Suspense fallback={null}>
        <GuidedTips />
      </Suspense>
      {/* The first-time "turn on notifications" card; Settings is the other way in. */}
      <Suspense fallback={null}>
        <PushPrompt />
      </Suspense>
      {/* Owner cockpit shell (desktop sidebar + mobile bottom tabs) */}
      <CockpitShell>
        {/* The frame draws at once; a page still arriving fills in beside it
            (it used to be a full-screen loader until each page's code came). */}
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </CockpitShell>
    </TooltipProvider>
  );
}

function TeamAccessRestricted({
  title,
  description,
  onSignOut,
}: {
  title: string;
  description: string;
  /** A way out: sign out (and in with another account). */
  onSignOut: () => void;
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
          <button type="button" className="ck-btn ck-btn-outline mx-auto" onClick={onSignOut} data-team-restricted-signout>
            Sign out
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
