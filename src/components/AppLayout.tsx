import { useEffect, useState, useCallback } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useIsMobile } from "@/hooks/use-mobile";
import { useProfile } from "@/hooks/useProfile";
import { Loader2 } from "lucide-react";
import AppSidebar from "./AppSidebar";
import AppHeader from "./AppHeader";
import AvaVoiceButton from "./AvaVoiceButton";
import OnboardingWizard from "./subscription/OnboardingWizard";
import TrialExpiredOverlay from "./subscription/TrialExpiredOverlay";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function AppLayout() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { subscription, isLoading: subLoading, completeOnboarding, needsOnboarding: hookNeedsOnboarding } = useSubscription();
  const profileQuery = useProfile();
  const isEmployer = profileQuery.data?.company_name;
  const isMobile = useIsMobile();
  
  // Mobile sidebar is hidden by default, desktop is expanded
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return !isMobile;
    return window.innerWidth >= 768;
  });

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

  const isExpired = subscription?.status === 'expired' ||
                    (subscription?.status === 'trialing' && 
                     subscription?.trial_end && 
                     new Date(subscription.trial_end) < new Date());

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  if (loading || subLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Show onboarding wizard for new trial users
  if (hookNeedsOnboarding) {
    return <OnboardingWizard onComplete={() => completeOnboarding.mutate()} />;
  }

  // Show expired overlay for expired trials
  if (isExpired) {
    return <TrialExpiredOverlay />;
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background relative overflow-hidden overflow-x-hidden flex w-full">
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
        <div className="flex-1 flex flex-col min-w-0 w-full max-w-full relative z-10">
          <AppHeader 
            onMenuClick={handleToggleSidebar}
            isMobile={isMobile}
          />
          <main className="flex-1 p-3 md:p-6 overflow-auto overflow-x-hidden w-full max-w-full">
            <Outlet />
          </main>
          
          {/* AVA Voice Button - Show for all employers (handles own access states) */}
          {isEmployer && <AvaVoiceButton />}
        </div>
      </div>
    </TooltipProvider>
  );
}