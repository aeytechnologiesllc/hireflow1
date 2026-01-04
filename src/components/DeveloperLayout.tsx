import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";

import DeveloperSidebar from "./DeveloperSidebar";
import { AuthLoadingScreen } from "@/components/animations/AuthLoadingScreen";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalNotificationToasts } from "@/components/GlobalNotificationToasts";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { Button } from "@/components/ui/button";
import { Menu, RefreshCw } from "lucide-react";
import { useDeveloperAnalytics } from "@/hooks/useDeveloperAnalytics";

// Edge swipe detection constants
const EDGE_SWIPE_THRESHOLD = 30;
const SWIPE_MIN_DISTANCE = 80;

export default function DeveloperLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, role } = useAuth();
  const isMobile = useIsMobile();
  const { refetch, isLoading: analyticsLoading } = useDeveloperAnalytics();
  
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return !isMobile;
    return window.innerWidth >= 768;
  });

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  const handleNavigate = useCallback(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile || sidebarOpen) return;
    const touch = e.touches[0];
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

  // Redirect non-developers
  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    } else if (!loading && user && role && (role as string) !== 'developer') {
      // Redirect non-developers back to their appropriate dashboard
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, role, navigate]);

  if (loading) {
    return <AuthLoadingScreen variant="employer" />;
  }

  if (!user) {
    return <AuthLoadingScreen variant="employer" />;
  }

  // Still loading role or not a developer
  if (!role || (role as string) !== 'developer') {
    return <AuthLoadingScreen variant="employer" />;
  }

  return (
    <TooltipProvider>
      <div 
        className="min-h-screen bg-background relative overflow-hidden overflow-x-hidden flex w-full"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <OfflineIndicator />
        <GlobalNotificationToasts />
        
        {/* Premium gradient orbs with developer theme */}
        <div className="absolute top-0 right-0 w-[200px] h-[200px] md:w-[600px] md:h-[600px] bg-orange-500/15 rounded-full blur-[100px] md:blur-[150px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[150px] h-[150px] md:w-[500px] md:h-[500px] bg-red-500/12 rounded-full blur-[100px] md:blur-[150px] pointer-events-none" />
        
        {/* Mobile overlay backdrop */}
        {isMobile && sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        <DeveloperSidebar 
          isOpen={sidebarOpen}
          isMobile={isMobile}
          onToggle={handleToggleSidebar}
          onNavigate={handleNavigate}
        />
        
        <div className="flex-1 flex flex-col min-w-0 w-full max-w-full relative z-10">
          {/* Developer Header */}
          <header className="sticky top-0 z-30 h-14 md:h-16 border-b border-border/50 bg-background/80 backdrop-blur-xl">
            <div className="h-full px-4 md:px-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isMobile && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleToggleSidebar}
                    className="h-9 w-9"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                )}
                <div>
                  <h1 className="text-lg font-semibold text-foreground">
                    Developer Dashboard
                  </h1>
                  <p className="text-xs text-muted-foreground hidden md:block">
                    Platform analytics & management
                  </p>
                </div>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={analyticsLoading}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${analyticsLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </header>
          
          <main className="flex-1 p-3 md:p-6 overflow-auto overflow-x-hidden w-full max-w-full">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
