import { useMemo } from "react";
import { toast } from "sonner";
import { useWebPush } from "@/hooks/useWebPush";
import type { GuideNotificationStatus } from "../../lib/firstHireStage";
import type { GuideNotifications } from "./types";

/**
 * Where the guide's "Know when they apply" step gets its answer: the phone
 * notifications switch (src/hooks/useWebPush.ts, the same one as the
 * first-time card and Settings). While it is still checking, the step is
 * left out rather than flickering in.
 *
 * In the offline preview (`?__previewNotifications=off|on|needs-home-screen|blocked|unsupported`)
 * it answers with that status instead, so every version of the step can be
 * looked at.
 */
const PREVIEW_STATUSES: readonly GuideNotificationStatus[] = ["on", "off", "needs-home-screen", "blocked", "unsupported"];

export function useGuideNotifications(): GuideNotifications | undefined {
  const push = useWebPush();
  const preview = useMemo(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return null;
    const asked = new URLSearchParams(window.location.search).get("__previewNotifications");
    return PREVIEW_STATUSES.find((s) => s === asked) ?? null;
  }, []);

  return useMemo(() => {
    if (preview) return { status: preview, onTurnOn: () => toast.message("Preview: this turns phone alerts on.") };
    if (push.status === "checking") return undefined;
    return {
      status: push.status,
      // Straight from the tap: the phone only shows its permission box inside one.
      onTurnOn: () => {
        void push.turnOn().then((result) => {
          if (result.ok) toast.success("Notifications are on");
          // "denied": the phone's own box said no; the step then says how to change it.
          else if (result.reason !== "denied") toast.error("Couldn't turn notifications on. Please try again.");
        });
      },
    };
  }, [preview, push]);
}
