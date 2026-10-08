/**
 * Cockpit shared types — the shape of every employer-surface row the app
 * renders. Real data flows in from Supabase via the `useCockpit*` hooks and is
 * mapped to these shapes in `lib/mappers.ts`. (The original demo dataset has
 * been removed; nothing fabricated is ever shown to a real employer.)
 */

export type StageKey = "application" | "quiz" | "voice" | "shortlist" | "hired";

export interface PipelineNode {
  key: StageKey;
  label: string;
  count: number;
  pct: string;
  tone: "green" | "bottleneck" | "muted";
  dropOff?: number;
  /**
   * When set, the funnel renders in single-candidate progress mode (used when an
   * employer selects one applicant): stages they've cleared show "done", their
   * current stage is highlighted amber ("current"), later stages are "upcoming".
   * Absent on the default aggregate funnel.
   */
  state?: "done" | "current" | "upcoming" | "passed";
}

export interface Avatar {
  key: string;
  url: string;
  initials: string;
}

/**
 * Per-candidate match score (0–100) + recently-active flag that drive the
 * CandidateMark living signal (score ring + breathing pulse).
 */
export interface CandidateSignalInfo {
  score: number;
  active: boolean;
}

export type JobStatus = "live" | "draft" | "closed";
export interface JobRow {
  id: string;
  title: string;
  icon: "coffee" | "star" | "register" | "tray" | "chef";
  location: string;
  pay: string;
  status: JobStatus;
  applicants: number;
  dateLabel: string;
  date: string;
  /** Public candidate-facing application code (showcase roles.role_code). */
  roleCode?: string | null;
  /** The short link name: hireflownow.com/<slug> (jobs.slug). What every
   *  share surface hands out when set (docs/SHORT-JOB-LINKS.md). */
  slug?: string | null;
  /** The job has steps done at a computer (docs/COMPUTER-ONLY-TESTS.md); the
   *  Share Kit says "on your computer" only then. */
  onComputer?: boolean;
  stats: { voice: number; shortlist: number; interview: number; hired: number };
  /**
   * Whether this LIVE job actually clears the real job-board gate
   * (api/job-feed.mjs's loadFeedJobs() — see src/cockpit/lib/listingEligibility.ts).
   * Absent for drafts/closed roles and for showcase rows, where it does not apply.
   */
  listings?: { boards: boolean; reason: string | null };
}

export type CandidateStage = "Application" | "Quiz" | "Voice" | "Shortlist" | "Hired" | "Rejected";
/** Ava's own recommendation for what to do next — independent of the numeric
 *  score, so a high score paired with a hard-reject reason (name mismatch,
 *  resume authenticity concern, a stated deal-breaker) still surfaces as
 *  "reject" rather than reading as a clean advance. */
export type RecommendedAction = "advance" | "review" | "reject";
export interface Candidate {
  id: string;
  avatar: string;
  name: string;
  /** Candidate's email — used for interview calendar invites. */
  email?: string | null;
  appliedAgo: string;
  appliedDate: string;
  role: string;
  stage: CandidateStage;
  quiz: number | null;
  voice: number | null;
  overall: number;
  /**
   * True once Ava has real screening signal on file — a score, a quiz result,
   * or a voice result. This is the single source of truth for "has this been
   * scored" vs. "not scored yet" and must never be derived from `overall > 0`:
   * a genuine finished score of 0 is a real result and has to read as one,
   * not fall back to looking unscored.
   */
  analyzed: boolean;
  read: string;
  readFull: string;
  strengths: string[];
  risk: { level: "Low" | "Medium" | "High" | "Pending"; note: string };
  /** Null until Ava has produced a scorecard. */
  recommendedAction: RecommendedAction | null;
  /** The engine's own words for why it would decline this candidate — shown
   *  to the employer verbatim. Null unless the scorecard actually flagged one. */
  hardRejectReason: string | null;
  /** Every other risk flag the engine raised (name mismatch, authenticity
   *  concerns, missing requirements…), for surfaces that want the full list. */
  riskFlags: string[];
  /** On an auto-mode job, Ava is still waiting on tests this person has yet to
   *  take, so the next move is theirs, not the employer's. Everyone takes every
   *  test now (owner, 2026-10-05), so this is most applicants mid-way. Optional:
   *  showcase data and manual-mode jobs never set it. */
  stillTesting?: boolean;
  /** Pressed Apply and is on the application form right now (status
   *  `in_progress`): nothing of theirs has been sent, so there is nothing for
   *  Ava to read yet. Shown as "Filling in the form", never as "Applied" or
   *  "still screening". Optional: showcase data never sets it. */
  fillingInForm?: boolean;
  source: string;
}

export interface InterviewItem {
  id: string;
  avatar: string;
  name: string;
  role: string;
  time: string;
  kind: "voice-scheduled" | "in-person-confirmed" | "voice-completed" | "scheduled";
}

export interface Conversation {
  id: string;
  avatar: string;
  name: string;
  role: string;
  time: string;
  preview: string;
  unread?: number;
  /** When the newest message in the chat was written, either way. */
  lastAt?: string | null;
  /** When the other person last wrote, or null when only this side has (lib/chatMarks.ts). */
  lastIncomingAt?: string | null;
  /** The applicant's application status as stored ("rejected", "interview"...), when the chat is with one. */
  status?: string | null;
}
export interface ChatMessage {
  id: string;
  from: "them" | "me";
  text: string;
  time: string;
}

export type DocStatus = "Pending" | "Submitted" | "Signed" | "Declined" | "Withdrawn" | "Voided";
export interface DocRow {
  id: string;
  title: string;
  type: string;
  candidate: string;
  avatar: string;
  role: string;
  status: DocStatus;
  statusNote: string;
  updated: string;
  /** Real document timestamps (absolute, formatted) — null when not set. */
  created?: string | null;
  expires?: string | null;
  /** Stored file URL (for opening/reviewing the document). */
  fileUrl?: string | null;
  /** Raw status for tab filtering. */
  rawStatus?: string | null;
  /** Whether the candidate has signed yet — decides Withdraw vs Void for a
   *  still-pending, not-yet-voided row (withdraw pre-signature, void
   *  post-signature/pre-countersign). */
  candidateSignedAt?: string | null;
  /** True once this document has been withdrawn or voided. */
  isVoided?: boolean;
}

export interface TeamMember {
  id: string;
  avatar: string;
  name: string;
  email: string;
  role: string;
  permission: string;
  permissionTone: "jade" | "muted";
}
