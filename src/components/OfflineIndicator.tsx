import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
    };

    const handleOffline = () => {
      setIsOffline(true);
      setShowReconnected(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // A plain CSS slide-in that plays once (tailwindcss-animate), not the
  // animation library: this banner is on every staff page, and it alone put
  // that library (about 36 KB compressed) in every owner's first download
  // (the performance check, 2026-10-11).
  if (isOffline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] bg-destructive text-destructive-foreground py-2 px-4 flex items-center justify-center gap-2 text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top-full duration-300">
        <WifiOff className="h-4 w-4" />
        <span>You're offline. Some features may be unavailable.</span>
      </div>
    );
  }
  if (showReconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] bg-primary text-primary-foreground py-2 px-4 flex items-center justify-center gap-2 text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top-full duration-300">
        <span>Back online!</span>
      </div>
    );
  }
  return null;
}
