import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useIsMobile } from "@/hooks/use-mobile";

import AppSidebar from "./AppSidebar";
import AppHeader from "./AppHeader";
import { AuthLoadingScreen } from "@/components/animations/AuthLoadingScreen";

import OnboardingWizard from "./subscription/OnboardingWizard";
import CandidateOnboardingWizard from "./subscription/CandidateOnboardingWizard";
import TrialExpiredOverlay from "./subscription/TrialExpiredOverlay";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalNotificationToasts } from "@/components/GlobalNotificationToasts";
import { OfflineIndicator } from "@/components/OfflineIndicator";

// Edge swipe detection constants
const EDGE_SWIPE_THRESHOLD = 30; // px from edge to start swipe
const SWIPE_MIN_DISTANCE = 80; // px to trigger open

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, role, signOut } = useAuth();
  const { subscription, isLoading: subLoading, error: subError, completeOnboarding, needsOnboarding: hookNeedsOnboarding } = useSubscription();
  const isMobile = useIsMobile();
  
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

  const isExpired = subscription?.status === 'expired' ||
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

  // Show onboarding wizard for new users (role-specific)
  if (hookNeedsOnboarding) {
    if (role === 'candidate') {
      return <CandidateOnboardingWizard onComplete={() => completeOnboarding.mutate()} />;
    }
    return <OnboardingWizard onComplete={() => completeOnboarding.mutate()} />;
  }

  // Show expired overlay for expired trials
  if (isExpired) {
    return <TrialExpiredOverlay />;
  }

  return (
    <TooltipProvider>
      <div 
        className="min-h-screen bg-background relative overflow-hidden overflow-x-hidden flex w-full"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Offline indicator */}
        <OfflineIndicator />
        
        {/* Global notification toasts listener */}
        <GlobalNotificationToasts />
        
        {/* Premium gradient orbs - smaller on mobile */}
        <div className="absolute top-0 right-0 w-[200px] h-[200px] md:w-[600px] md:h-[600px] bg-primary/15 rounded-full blur-[100px] md:blur-[150px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[150px] h-[150px] md:w-[500px] md:h-[500px] bg-accent/12 rounded-full blur-[100px] md:blur-[150px] pointer-events-none" />
        
        {/* Mobile overlay backdrop */}
        {isMobile && sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300"
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
          <main className="flex-1 p-3 md:p-6 overflow-auto overflow-x-hidden w-full max-w-full">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}