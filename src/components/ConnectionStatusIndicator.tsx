import { useState, useEffect } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ConnectionStatusIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-border/50 bg-background/50">
            <AnimatePresence mode="wait">
              {isOnline ? (
                <motion.div
                  key="online"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="relative flex items-center"
                >
                  <Wifi className="h-3.5 w-3.5 text-green-500" />
                  <motion.div
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-green-500"
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [1, 0.7, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="offline"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                >
                  <WifiOff className="h-3.5 w-3.5 text-destructive" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {isOnline ? (
            <span className="text-green-500">Connection stable</span>
          ) : (
            <span className="text-destructive">No internet connection</span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
