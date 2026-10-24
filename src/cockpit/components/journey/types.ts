import type { GuideNotificationStatus } from "../../lib/firstHireStage";

/**
 * What the guide is told about phone alerts. The guide never asks the browser
 * for anything itself: it draws the step from `status` and calls `onTurnOn`
 * when the person presses the button. Absent, or `unsupported`, the step is
 * not drawn at all (see useGuideNotifications.ts, where this is wired).
 */
export interface GuideNotifications {
  status: GuideNotificationStatus;
  onTurnOn: () => void;
}
