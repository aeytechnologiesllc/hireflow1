import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AuthLoadingScreen } from "@/components/animations/AuthLoadingScreen";
import CandidateOnboardingWizard from "@/components/candidate/CandidateOnboardingWizard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { GlobalNotificationToasts } from "@/components/GlobalNotificationToasts";
import AppSidebar from "@/components/AppSidebar";
import AppHeader from "@/components/AppHeader";

/**
 * An applicant's frame, split out of AppLayout.tsx (2026-10-11, the
 * performance check) so a business owner's first download carries none of
 * it (its welcome wizard and confetti, the older sidebar). AppLayout loads it only for this person.
 */
export default function CandidateLayout({
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
