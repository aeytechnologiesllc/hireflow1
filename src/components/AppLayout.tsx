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

// Edge swipe detection constants
const EDGE_SWIPE_THRESHOLD = 30; // px from edge to start swipe
const SWIPE_MIN_DISTANCE = 80; // px to trigger open

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading, role, signOut } = useAuth();
  const { subscription, isLoading: subLoading, error: subError, completeOnboarding, needsOnboarding: hookNeedsOnboarding, syncSubscription, refetch } = useSubscription();
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
    console.log("[AppLayout] Global subscription=success detected, syncing...");
    
    syncSubscription.mutateAsync()
      .then(async (result) => {
        console.log("[AppLayout] Global sync result:", result);
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
      console.log("[AppLayout] Pending subscription sync detected, syncing...");
      
      syncSubscription.mutateAsync()
        .then((result) => {
          localStorage.removeItem("pending_subscription_sync");
          if (result?.synced) {
            toast.success("Subscription activated!");
            refetch();
          } else {
            console.log("[AppLayout] Sync result:", result?.message);
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
      navigate(isCandidateRoute ? "/candidate/auth" : "/auth", { replace: true });
    } else if (!loading && user && (role as string) === 'developer' && !location.pathname.startsWith("/developer")) {
      // Redirect developers to their dashboard
      navigate("/developer", { replace: true });
    }
  }, [user, loading, role, navigate, location.pathname]);

  const isCandidateRoute = location.pathname.startsWith("/candidate");
  const loadingVariant = isCandidateRoute ? "candidate" : "employer";

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
  if (hookNeedsOnboarding) {
    return <OnboardingWizard onComplete={() => completeOnboarding.mutate()} />;
  }

  // Show expired overlay for expired trials (employers only)
  if (isExpiredCheck) {
    return <TrialExpiredOverlay />;
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