/**
 * Centralized Terminology System
 * Single source of truth for all user-facing labels across the application.
 * 
 * IMPORTANT: When updating labels, update them HERE and import from this file.
 * Do NOT create duplicate label definitions in components or pages.
 */

// ============================================
// APPLICATION STATUS LABELS
// ============================================

/**
 * Human-readable labels for application statuses
 * Used in: Applicants page, ApplicantDetailsDialog, badges, filters
 */
export const applicationStatusLabels: Record<string, string> = {
  in_progress: "In Progress",
  pending: "Submitted",
  reviewing: "Under Review",
  interview: "Interview Stage",
  offered: "Offer Extended",
  hired: "Hired",
  rejected: "Not Selected",
};

/**
 * Status badge colors (Tailwind classes)
 * Used in: All status badges across the app
 */
export const applicationStatusColors: Record<string, string> = {
  in_progress: "bg-orange-500/20 text-orange-500",
  pending: "bg-yellow-500/20 text-yellow-500",
  reviewing: "bg-blue-500/20 text-blue-500",
  interview: "bg-purple-500/20 text-purple-500",
  offered: "bg-primary/20 text-primary",
  hired: "bg-success/20 text-success",
  rejected: "bg-destructive/20 text-destructive",
};

// ============================================
// PHASE DISPLAY NAMES
// ============================================

/**
 * Human-readable names for workflow phase types
 * Used in: Phase indicators, progress displays, action buttons
 */
export const phaseDisplayNames: Record<string, string> = {
  application: "Application",
  quiz: "Assessment",
  typing_test: "Typing Test",
  video_intro: "Video Introduction",
  video_message: "Video Message",
  chat_simulation: "Chat Simulation",
  chat_interview: "Chat Interview",
  sales_simulation: "Sales Simulation",
  voice_interview: "Ava Interview", // Always "Ava Interview" - consistent branding
  portfolio_upload: "Portfolio",
  review: "Review",
  interview: "Interview",
  hired: "Hired",
};

/**
 * Phase action messages for candidates
 * Used in: CandidateApplicationDetail action buttons
 */
export const phaseActionMessages: Record<string, { buttonText: string; description: string }> = {
  application: { buttonText: "Complete Application", description: "Fill out your application form" },
  quiz: { buttonText: "Take Assessment", description: "Complete your skills assessment to continue" },
  typing_test: { buttonText: "Start Typing Test", description: "Ready to test your typing speed and accuracy" },
  video_intro: { buttonText: "Record Video", description: "Record a short video introducing yourself" },
  video_message: { buttonText: "Record Video", description: "Record a 60-second video about yourself" },
  chat_simulation: { buttonText: "Start Chat Simulation", description: "Demonstrate your customer support skills" },
  chat_interview: { buttonText: "Begin Interview", description: "Start your interview with Ava" },
  sales_simulation: { buttonText: "Start Sales Pitch", description: "Show off your sales skills" },
  portfolio_upload: { buttonText: "Upload Portfolio", description: "Share samples of your work" },
  voice_interview: { buttonText: "Start Ava Interview", description: "Have a voice conversation with Ava" },
};

// ============================================
// CANDIDATE PHASE STATUS LABELS
// ============================================

/**
 * Status labels for candidate-facing phase progress
 * Used in: CandidateApplicationDetail phase list
 */
export const candidatePhaseStatusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30" },
  in_progress: { label: "In Progress", color: "bg-blue-500/20 text-blue-500 border-blue-500/30" },
  completed: { label: "Completed", color: "bg-success/20 text-success border-success/30" },
  awaiting_action: { label: "Ready for You", color: "bg-primary/20 text-primary border-primary/30" },
  under_review: { label: "Under Review", color: "bg-yellow-500/20 text-yellow-500 border-yellow-500/30" },
  employer_reviewing: { label: "Under Review", color: "bg-amber-500/20 text-amber-500 border-amber-500/30" },
  rejected: { label: "Not Passed", color: "bg-destructive/20 text-destructive border-destructive/30" },
  skipped: { label: "Skipped", color: "bg-muted/50 text-muted-foreground border-muted/30" },
};

// ============================================
// INTERVIEW STATUS LABELS
// ============================================

/**
 * Human-readable labels for interview statuses
 * Used in: Interviews page, interview cards
 */
export const interviewStatusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
};

/**
 * Interview status badge colors
 */
export const interviewStatusColors: Record<string, string> = {
  scheduled: "bg-blue-500/20 text-blue-500",
  completed: "bg-success/20 text-success",
  cancelled: "bg-destructive/20 text-destructive",
  no_show: "bg-yellow-500/20 text-yellow-500",
};

// ============================================
// TEAM STATUS LABELS
// ============================================

/**
 * Human-readable labels for team invitation/member statuses
 * Used in: Team page, team member cards
 */
export const teamStatusLabels: Record<string, string> = {
  pending: "Pending",
  accepted: "Active",
  declined: "Declined",
  expired: "Expired",
  active: "Active",
  revoked: "Revoked",
};

/**
 * Team status badge colors
 */
export const teamStatusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-500",
  accepted: "bg-success/20 text-success",
  declined: "bg-destructive/20 text-destructive",
  expired: "bg-muted/50 text-muted-foreground",
  active: "bg-success/20 text-success",
  revoked: "bg-destructive/20 text-destructive",
};

// ============================================
// DOCUMENT STATUS LABELS
// ============================================

/**
 * Human-readable labels for document statuses
 * Used in: Documents page, document cards
 */
export const documentStatusLabels: Record<string, string> = {
  pending: "Pending Signature",
  signed: "Signed",
  declined: "Declined",
};

/**
 * Document status badge colors
 */
export const documentStatusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-500",
  signed: "bg-success/20 text-success",
  declined: "bg-destructive/20 text-destructive",
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get the display label for an application status
 */
export function getApplicationStatusLabel(status: string): string {
  return applicationStatusLabels[status] || status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

/**
 * Get the display name for a phase type
 */
export function getPhaseDisplayName(phaseType: string): string {
  return phaseDisplayNames[phaseType] || phaseType.charAt(0).toUpperCase() + phaseType.slice(1).replace(/_/g, " ");
}

/**
 * Get the display label for an interview status
 */
export function getInterviewStatusLabel(status: string): string {
  return interviewStatusLabels[status] || status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}
