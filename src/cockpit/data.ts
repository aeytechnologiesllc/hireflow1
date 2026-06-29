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
  stats: { voice: number; shortlist: number; interview: number; hired: number };
}

export type CandidateStage = "Application" | "Quiz" | "Voice" | "Shortlist" | "Hired";
export interface Candidate {
  id: string;
  avatar: string;
  name: string;
  appliedAgo: string;
  appliedDate: string;
  role: string;
  stage: CandidateStage;
  quiz: number | null;
  voice: number | null;
  overall: number;
  read: string;
  readFull: string;
  strengths: string[];
  risk: { level: "Low" | "Medium" | "High" | "Pending"; note: string };
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
}
export interface ChatMessage {
  id: string;
  from: "them" | "me";
  text: string;
  time: string;
}

export type DocStatus = "Pending" | "Submitted" | "Signed" | "Declined";
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
