import { useEffect, useState, useCallback } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useIsMobile } from "@/hooks/use-mobile";
import { Loader2 } from "lucide-react";
import AppSidebar from "./AppSidebar";
import AppHeader from "./AppHeader";
import OnboardingWizard from "./subscription/OnboardingWizard";
import TrialExpiredOverlay from "./subscription/TrialExpiredOverlay";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function AppLayout() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { subscription, isLoading: subLoading, completeOnboarding, needsOnboarding: hookNeedsOnboarding } = useSubscription();
  const isMobile = useIsMobile();
  
  // Auto-collapse on mobile/smaller screens
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isMobile);

  // Update collapsed state when screen size changes
  useEffect(() => {
    setSidebarCollapsed(isMobile);
  }, [isMobile]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  // Auto-collapse sidebar after navigation on mobile
  const handleNavigate = useCallback(() => {
    if (isMobile) {
      setSidebarCollapsed(true);
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
      <div className="min-h-screen bg-background relative overflow-hidden flex">
        {/* Premium gradient orbs */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/15 rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/12 rounded-full blur-[150px] pointer-events-none" />
        
        <AppSidebar 
          collapsed={sidebarCollapsed} 
          onToggle={handleToggleSidebar}
          onNavigate={handleNavigate}
        />
        <div className="flex-1 flex flex-col min-w-0 relative z-10">
          <AppHeader />
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}