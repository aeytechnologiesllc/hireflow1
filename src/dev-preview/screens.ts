/**
 * Dev-preview-only. The curated list the `/__preview` picker renders — every
 * screen the task requires, pointed at the specific fixture row it needs.
 * Deliberately has no import of ./fixtures (the actual data) so the picker
 * page itself stays tiny; the target screen's own page pulls fixtures.ts in,
 * inside the iframe, via install.ts.
 */
import {
  APP_CHAT_INTERVIEW_ID,
  APP_CHAT_SIM_ID,
  APP_HIRED_ID,
  APP_NOT_YET_ID,
  APP_OFFERED_ID,
  APP_PORTFOLIO_ID,
  APP_QUIZ_ID,
  APP_REJECTED_ID,
  APP_SALES_ID,
  APP_TYPING_ID,
  APP_VIDEO_ID,
  APP_VOICE_ID,
  CANDIDATE_USER_ID,
  STEP_CHAT_INTERVIEW,
  STEP_CHAT_SIM,
  STEP_PORTFOLIO,
  STEP_SALES,
  STEP_TYPING,
  STEP_VIDEO,
  STEP_VOICE,
} from "./ids";
import type { PreviewRole } from "./install";

export interface PreviewScreen {
  id: string;
  group: string;
  label: string;
  role: PreviewRole;
  /** Real app path + query, exactly as a signed-in user would see it. */
  path: string;
}

export const PREVIEW_SCREENS: PreviewScreen[] = [
  // ---------------------------------------------------------- employer cockpit
  { id: "dashboard", group: "Employer cockpit", label: "Dashboard", role: "employer", path: "/dashboard" },
  { id: "jobs", group: "Employer cockpit", label: "Jobs", role: "employer", path: "/jobs" },
  { id: "applicants", group: "Employer cockpit", label: "Applicants — list", role: "employer", path: "/applicants" },
  { id: "applicant-detail", group: "Employer cockpit", label: "Applicant detail", role: "employer", path: `/applicants/${APP_VOICE_ID}` },
  { id: "interviews", group: "Employer cockpit", label: "Interviews", role: "employer", path: "/interviews" },
  { id: "messages", group: "Employer cockpit", label: "Messages", role: "employer", path: `/messages?candidate=${CANDIDATE_USER_ID}` },
  { id: "documents", group: "Employer cockpit", label: "Documents — all states (pending/signed/declined)", role: "employer", path: "/documents" },
  { id: "team", group: "Employer cockpit", label: "Team", role: "employer", path: "/team" },
  { id: "analytics", group: "Employer cockpit", label: "Analytics", role: "employer", path: "/analytics" },
  { id: "settings", group: "Employer cockpit", label: "Settings", role: "employer", path: "/settings" },

  // -------------------------------------------------------------- candidate side
  { id: "cand-applications", group: "Candidate", label: "Applications — list", role: "candidate", path: "/applications" },
  { id: "cand-app-detail", group: "Candidate", label: "Application detail", role: "candidate", path: `/applications/${APP_VOICE_ID}` },
  { id: "cand-app-rejected", group: "Candidate", label: "Application detail — rejected + coaching card", role: "rejected_candidate", path: `/applications/${APP_REJECTED_ID}` },
  { id: "cand-my-documents", group: "Candidate", label: "My documents", role: "candidate", path: "/my-documents" },
  { id: "cand-gate-not-yet", group: "Candidate", label: 'Phase gate — "not quite time yet"', role: "candidate", path: `/applications/${APP_NOT_YET_ID}/typing-test/${STEP_TYPING}` },

  // ------------------------------------------------------- candidate phase pages
  { id: "phase-application", group: "Candidate phase pages", label: "Application form", role: "candidate", path: `/applications/${APP_NOT_YET_ID}/application/application` },
  { id: "phase-quiz", group: "Candidate phase pages", label: "Quiz", role: "candidate", path: `/applications/${APP_QUIZ_ID}/quiz/quiz` },
  { id: "phase-typing", group: "Candidate phase pages", label: "Typing test", role: "candidate", path: `/applications/${APP_TYPING_ID}/typing-test/${STEP_TYPING}` },
  { id: "phase-video", group: "Candidate phase pages", label: "Video intro", role: "candidate", path: `/applications/${APP_VIDEO_ID}/video-intro/${STEP_VIDEO}` },
  { id: "phase-chat-sim", group: "Candidate phase pages", label: "Chat simulation", role: "candidate", path: `/applications/${APP_CHAT_SIM_ID}/chat-simulation/${STEP_CHAT_SIM}` },
  { id: "phase-chat-interview", group: "Candidate phase pages", label: "Chat interview", role: "candidate", path: `/applications/${APP_CHAT_INTERVIEW_ID}/chat-interview/${STEP_CHAT_INTERVIEW}` },
  { id: "phase-sales", group: "Candidate phase pages", label: "Sales simulation", role: "candidate", path: `/applications/${APP_SALES_ID}/sales-simulation/${STEP_SALES}` },
  { id: "phase-voice", group: "Candidate phase pages", label: "Voice interview", role: "candidate", path: `/applications/${APP_VOICE_ID}/voice-interview/${STEP_VOICE}` },
  { id: "phase-portfolio", group: "Candidate phase pages", label: "Portfolio upload", role: "candidate", path: `/applications/${APP_PORTFOLIO_ID}/portfolio/${STEP_PORTFOLIO}` },

  // ------------------------------------------------------------------ create job
  { id: "create-job-typed", group: "Create job", label: "Typed", role: "employer", path: "/jobs/create?__previewInputMode=form&__previewStep=0" },
  { id: "create-job-voice-readback", group: "Create job", label: "Voice readback (follow-up questions)", role: "employer", path: "/jobs/create?__previewInputMode=voice&__previewStep=1" },

  // -------------------------------------------------------------- extra states
  { id: "cand-app-offered", group: "Extra states", label: "Application detail — offered", role: "candidate", path: `/applications/${APP_OFFERED_ID}` },
  { id: "cand-app-hired", group: "Extra states", label: "Application detail — hired", role: "candidate", path: `/applications/${APP_HIRED_ID}` },
];

export const PREVIEW_SCREEN_GROUPS = [...new Set(PREVIEW_SCREENS.map((s) => s.group))];
