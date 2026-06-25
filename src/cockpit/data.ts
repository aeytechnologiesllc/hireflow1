/**
 * Cockpit demo data — mirrors the approved Deep Jade "Owner Cockpit" mockups
 * (Maria's Café). Drives the rebuilt employer surfaces so the implemented app
 * matches the mockups exactly. Swap to live Supabase wiring post-design-lock.
 */

export const account = {
  name: "Maria's Café",
  initials: "MC",
  trialDaysLeft: 14,
  trialEnds: "June 2",
};

export type StageKey = "application" | "quiz" | "voice" | "shortlist" | "hired";

export interface PipelineNode {
  key: StageKey;
  label: string;
  count: number;
  pct: string;
  tone: "green" | "bottleneck" | "muted";
  dropOff?: number;
}

export const pipeline: PipelineNode[] = [
  { key: "application", label: "Application", count: 42, pct: "100%", tone: "green", dropOff: 11 },
  { key: "quiz", label: "Quiz", count: 31, pct: "73%", tone: "green", dropOff: 13 },
  { key: "voice", label: "Voice", count: 18, pct: "43%", tone: "bottleneck", dropOff: 11 },
  { key: "shortlist", label: "Shortlist", count: 7, pct: "17%", tone: "muted", dropOff: 3 },
  { key: "hired", label: "Hired", count: 4, pct: "10%", tone: "muted" },
];

export const dashboard = {
  hero: {
    headline: "Ava has 7 strong candidates ready for review",
    sub: "I screened 42 applicants and found 7 who look like a great fit for Maria's Café.",
  },
  kpis: [
    { label: "Active jobs", value: 3, icon: "briefcase" as const },
    { label: "Total applicants", value: 42, icon: "users" as const },
    { label: "Under review", value: 11, icon: "clock" as const },
    { label: "Hired", value: 4, icon: "check" as const },
  ],
  activity: [
    { id: 1, avatar: "nina", icon: "mic" as const, name: "Nina Patel", action: "completed voice interview", time: "18m ago" },
    { id: 2, avatar: "marco", icon: "star" as const, name: "Marco Ruiz", action: "scored 91 on the quiz", time: "1h ago" },
    { id: 3, avatar: "elise", icon: "sparkle" as const, name: "Ava", action: "advanced Elise Chen to shortlist", time: "2h ago", em: "Elise Chen" },
    { id: 4, avatar: null, icon: "userplus" as const, name: "New applicant", action: "for Barista", time: "3h ago" },
  ],
};

export interface Avatar {
  key: string;
  url: string;
  initials: string;
}

export const avatars: Record<string, Avatar> = {
  nina: { key: "nina", url: "https://i.pravatar.cc/160?img=47", initials: "NP" },
  marco: { key: "marco", url: "https://i.pravatar.cc/160?img=12", initials: "MR" },
  elise: { key: "elise", url: "https://i.pravatar.cc/160?img=44", initials: "EC" },
  omar: { key: "omar", url: "https://i.pravatar.cc/160?img=13", initials: "OH" },
  priya: { key: "priya", url: "https://i.pravatar.cc/160?img=45", initials: "PS" },
  andre: { key: "andre", url: "https://i.pravatar.cc/160?img=15", initials: "AB" },
  maria: { key: "maria", url: "https://i.pravatar.cc/160?img=48", initials: "MS" },
  luis: { key: "luis", url: "https://i.pravatar.cc/160?img=11", initials: "LO" },
  jenna: { key: "jenna", url: "https://i.pravatar.cc/160?img=49", initials: "JL" },
  tom: { key: "tom", url: "https://i.pravatar.cc/160?img=33", initials: "TP" },
};

/**
 * Per-candidate match score (0–100) + recently-active flag that drive the
 * CandidateMark living signal (score ring + breathing pulse). Keyed by the
 * avatar/candidate key so any candidate surface can resolve it cheaply.
 */
export interface CandidateSignalInfo {
  score: number;
  active: boolean;
}
export const candidateSignals: Record<string, CandidateSignalInfo> = {
  nina: { score: 94, active: true },
  marco: { score: 91, active: true },
  elise: { score: 88, active: false },
  omar: { score: 82, active: false },
  priya: { score: 0, active: false },
  andre: { score: 76, active: false },
};

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

export const jobs: JobRow[] = [
  { id: "barista", title: "Barista", icon: "coffee", location: "San Francisco, CA", pay: "$17 – $20 / hr", status: "live", applicants: 24, dateLabel: "Posted", date: "Jun 12, 2025", stats: { voice: 10, shortlist: 6, interview: 4, hired: 2 } },
  { id: "shift-lead", title: "Shift Lead", icon: "star", location: "San Francisco, CA", pay: "$20 – $24 / hr", status: "live", applicants: 11, dateLabel: "Posted", date: "Jun 10, 2025", stats: { voice: 5, shortlist: 3, interview: 2, hired: 1 } },
  { id: "cashier", title: "Cashier", icon: "register", location: "San Francisco, CA", pay: "$16 – $18 / hr", status: "draft", applicants: 0, dateLabel: "Last edited", date: "Jun 8, 2025", stats: { voice: 0, shortlist: 0, interview: 0, hired: 0 } },
  { id: "server", title: "Server", icon: "tray", location: "San Francisco, CA", pay: "$18 – $22 / hr + tips", status: "live", applicants: 7, dateLabel: "Posted", date: "Jun 8, 2025", stats: { voice: 3, shortlist: 2, interview: 1, hired: 1 } },
  { id: "prep-cook", title: "Prep Cook", icon: "chef", location: "San Francisco, CA", pay: "$17 – $19 / hr", status: "closed", applicants: 18, dateLabel: "Closed", date: "Jun 1, 2025", stats: { voice: 7, shortlist: 6, interview: 3, hired: 2 } },
];

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
  risk: { level: "Low" | "Medium" | "High"; note: string };
  source: string;
}

export const candidates: Candidate[] = [
  {
    id: "nina", avatar: "nina", name: "Nina Patel", appliedAgo: "Applied 2 days ago", appliedDate: "May 28, 2025",
    role: "Barista", stage: "Shortlist", quiz: 96, voice: 94, overall: 94,
    read: "Confident, friendly, and clear communicator. Strong customer instincts and a calm, solutions-focused approach.",
    readFull: "Confident, friendly, and clear communicator. Strong customer instincts and a calm, solutions-focused approach.",
    strengths: ["Warm and engaging presence", "Clear, confident communication", "Strong customer focus", "Product knowledge and passion"],
    risk: { level: "Low", note: "No major concerns detected." },
    source: "Website",
  },
  {
    id: "marco", avatar: "marco", name: "Marco Ruiz", appliedAgo: "Applied 3 days ago", appliedDate: "May 27, 2025",
    role: "Barista", stage: "Voice", quiz: 89, voice: 91, overall: 91,
    read: "Warm and engaging tone with great product knowledge. Composed under pressure.",
    readFull: "Warm and engaging tone with great product knowledge. Composed under pressure and prioritizes well during the rush.",
    strengths: ["Calm rush-hour prioritization", "Great product knowledge", "Engaging tone", "Team-first mindset"],
    risk: { level: "Low", note: "No major concerns detected." },
    source: "Instagram",
  },
  {
    id: "elise", avatar: "elise", name: "Elise Chen", appliedAgo: "Applied 5 days ago", appliedDate: "May 25, 2025",
    role: "Barista", stage: "Shortlist", quiz: 93, voice: 88, overall: 88,
    read: "Thoughtful, articulate, and customer-first mindset. Great attention to detail.",
    readFull: "Thoughtful, articulate, and customer-first mindset. Great attention to detail; needs a brief on closing duties.",
    strengths: ["Customer-first mindset", "Articulate communicator", "Detail oriented", "Reliable and punctual"],
    risk: { level: "Low", note: "Follow up on closing-duty experience." },
    source: "Referral",
  },
  {
    id: "omar", avatar: "omar", name: "Omar Hassan", appliedAgo: "Applied 5 days ago", appliedDate: "May 25, 2025",
    role: "Barista", stage: "Quiz", quiz: 82, voice: null, overall: 82,
    read: "Solid foundational knowledge and clear responses. Good potential with coaching.",
    readFull: "Solid foundational knowledge and clear responses. Good potential with a little coaching on espresso craft.",
    strengths: ["Strong fundamentals", "Clear responses", "Eager to learn", "Positive attitude"],
    risk: { level: "Low", note: "Limited specialty-coffee experience." },
    source: "Indeed",
  },
  {
    id: "priya", avatar: "priya", name: "Priya Shah", appliedAgo: "Applied 6 days ago", appliedDate: "May 24, 2025",
    role: "Barista", stage: "Application", quiz: null, voice: null, overall: 0,
    read: "Looking for a growth-oriented environment and hands-on customer work.",
    readFull: "Looking for a growth-oriented environment and hands-on customer work. Awaiting quiz completion.",
    strengths: ["Customer-facing experience", "Growth mindset", "Flexible availability", "Friendly demeanor"],
    risk: { level: "Low", note: "Has not completed the quiz yet." },
    source: "Walk-in QR",
  },
];

export interface InterviewItem {
  id: string;
  avatar: string;
  name: string;
  role: string;
  time: string;
  kind: "voice-scheduled" | "in-person-confirmed" | "voice-completed" | "scheduled";
}
export const interviews = {
  kpis: [
    { label: "Today", value: 3, icon: "calendar" as const },
    { label: "Scheduled", value: 8, icon: "calendar" as const },
    { label: "Completed", value: 12, icon: "check" as const },
    { label: "Needs review", value: 2, icon: "clock" as const },
  ],
  daysWithInterviews: [2, 3, 4, 5, 10, 11, 12, 13, 17, 18, 19, 20, 23, 24],
  selectedDay: 25,
  upcoming: [
    { id: "i1", avatar: "nina", name: "Nina Patel", role: "Barista", time: "10:30 AM", kind: "voice-scheduled" as const },
    { id: "i2", avatar: "marco", name: "Marco Ruiz", role: "Barista", time: "1:00 PM", kind: "in-person-confirmed" as const },
    { id: "i3", avatar: "elise", name: "Elise Chen", role: "Shift Lead", time: "3:15 PM", kind: "voice-completed" as const },
    { id: "i4", avatar: "andre", name: "Andre Brooks", role: "Cashier", time: "Tomorrow 9:00 AM", kind: "scheduled" as const },
  ] as InterviewItem[],
  reads: [
    { id: "r1", icon: "user" as const, text: "Marco shows calm rush-hour prioritization" },
    { id: "r2", icon: "star" as const, text: "Elise needs follow-up on closing duties" },
  ],
};

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
export const messages = {
  conversations: [
    { id: "nina", avatar: "nina", name: "Nina Patel", role: "Barista", time: "10m ago", preview: "Hi Maria, Thursday morning works for me.", unread: 1 },
    { id: "marco", avatar: "marco", name: "Marco Ruiz", role: "Barista", time: "25m ago", preview: "Thanks! Looking forward to it." },
    { id: "elise", avatar: "elise", name: "Elise Chen", role: "Barista", time: "1h ago", preview: "Sounds good, see you then." },
    { id: "omar", avatar: "omar", name: "Omar Hassan", role: "Barista", time: "2h ago", preview: "Will do, thanks!" },
    { id: "priya", avatar: "priya", name: "Priya Shah", role: "Barista", time: "3h ago", preview: "Perfect, thank you." },
  ] as Conversation[],
  thread: [
    { id: "m1", from: "them", text: "Hi Maria, Thursday morning works for me.", time: "10:02 AM" },
    { id: "m2", from: "me", text: "Great, I'll send the details now.", time: "10:04 AM" },
    { id: "m3", from: "them", text: "Thank you! Also, could you let me know what the next steps are?", time: "10:05 AM" },
    { id: "m4", from: "me", text: "Absolutely, I'll include the paid trial information in the details.", time: "10:06 AM" },
  ] as ChatMessage[],
  avaSuggestion: "confirm the 10:30 AM voice interview and mention paid trial next step.",
  quickReplies: ["Confirm interview", "Ask availability", "Send documents"],
};

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
}
export const documents = {
  kpis: [
    { label: "Pending", value: 5, icon: "clock" as const, tone: "brass" as const },
    { label: "Signed", value: 9, icon: "check" as const, tone: "jade" as const },
    { label: "Declined", value: 1, icon: "x" as const, tone: "muted" as const },
    { label: "Awaiting your signature", value: 2, icon: "edit" as const, tone: "brass" as const },
  ],
  tabs: ["All documents", "Pending", "Signed", "Requests"],
  rows: [
    { id: "d1", title: "Offer letter", type: "Offer", candidate: "Nina Patel", avatar: "nina", role: "Barista", status: "Pending", statusNote: "Candidate signature", updated: "10m ago" },
    { id: "d2", title: "W-4 request", type: "Request", candidate: "Marco Ruiz", avatar: "marco", role: "Barista", status: "Submitted", statusNote: "Awaiting review", updated: "25m ago" },
    { id: "d3", title: "Trial shift agreement", type: "Agreement", candidate: "Elise Chen", avatar: "elise", role: "Barista", status: "Signed", statusNote: "Completed", updated: "1h ago" },
    { id: "d4", title: "Direct deposit form", type: "Request", candidate: "Omar Hassan", avatar: "omar", role: "Barista", status: "Pending", statusNote: "Your signature", updated: "2h ago" },
    { id: "d5", title: "Cashier offer", type: "Offer", candidate: "Andre Brooks", avatar: "andre", role: "Cashier", status: "Declined", statusNote: "Declined by candidate", updated: "3h ago" },
  ] as DocRow[],
  detailTimeline: [
    { id: "t1", icon: "clock" as const, text: "Sent to candidate", time: "May 19, 2025 at 9:41 AM" },
    { id: "t2", icon: "eye" as const, text: "Viewed by candidate", time: "May 19, 2025 at 9:53 AM" },
    { id: "t3", icon: "pending" as const, text: "Pending candidate signature", time: "May 19, 2025 at 9:53 AM" },
  ],
};

export interface TeamMember {
  id: string;
  avatar: string;
  name: string;
  email: string;
  role: string;
  permission: string;
  permissionTone: "jade" | "muted";
}
export const team = {
  kpis: [
    { label: "Active members", value: 4, note: "People with access", icon: "users" as const, dot: "jade" as const },
    { label: "Pending invites", value: 2, note: "Invites awaiting response", icon: "mail" as const, dot: "brass" as const },
    { label: "View-only members", value: 1, note: "Can view but not edit", icon: "eye" as const, dot: "muted" as const },
  ],
  members: [
    { id: "m1", avatar: "maria", name: "Maria Santos", email: "maria@mariascafe.com", role: "Owner", permission: "Full Admin", permissionTone: "jade" as const },
    { id: "m2", avatar: "luis", name: "Luis Ortega", email: "luis@mariascafe.com", role: "Manager", permission: "Can manage pipeline", permissionTone: "muted" as const },
    { id: "m3", avatar: "jenna", name: "Jenna Lee", email: "jenna@mariascafe.com", role: "Shift Lead", permission: "Can message candidates", permissionTone: "muted" as const },
    { id: "m4", avatar: "tom", name: "Tom Park", email: "tom@mariascafe.com", role: "Accountant", permission: "Documents only", permissionTone: "muted" as const },
  ] as TeamMember[],
  invites: [
    { id: "p1", initials: "SR", name: "Sofia Ramirez", email: "sofia@mariascafe.com", role: "Barista", invitedBy: "Maria Santos", expires: "May 24, 2025" },
    { id: "p2", initials: "BW", name: "Ben Walker", email: "ben@mariascafe.com", role: "Server", invitedBy: "Maria Santos", expires: "May 24, 2025" },
  ],
  permissionCols: [
    { title: "Owner", sub: "Full Admin" },
    { title: "Manager", sub: "Can manage\npipeline" },
    { title: "Shift Lead", sub: "Can message\ncandidates" },
    { title: "Accountant", sub: "Documents\nonly" },
    { title: "View-only", sub: "Can view\nonly" },
  ],
  permissionRows: [
    { label: "Create jobs", icon: "briefcase" as const, allow: [true, true, true, false, false] },
    { label: "Advance / pass candidates", icon: "sparkle" as const, allow: [true, true, false, false, false] },
    { label: "Schedule interviews", icon: "calendar" as const, allow: [true, true, true, false, false] },
    { label: "Send documents", icon: "doc" as const, allow: [true, true, true, true, false] },
    { label: "Manage team and settings", icon: "users" as const, allow: [true, false, false, false, false] },
  ],
};

export const analytics = {
  kpis: [
    { label: "Time to hire", value: "6.8", unit: "days", delta: "1.3 days vs last 30 days", trend: "down" as const, good: true, icon: "clock" as const },
    { label: "Hire rate", value: "10", unit: "%", delta: "2% vs last 30 days", trend: "up" as const, good: true, icon: "userCheck" as const },
    { label: "Applicant quality", value: "86", unit: "", delta: "6 pts vs last 30 days", trend: "up" as const, good: true, icon: "star" as const },
    { label: "Source response", value: "42", unit: "min", delta: "8 min vs last 30 days", trend: "down" as const, good: true, icon: "chat" as const },
  ],
  // application trend (relative heights, last 30 days)
  trend: [12, 18, 15, 22, 19, 26, 24, 31, 28, 36, 33, 41, 38, 46, 44, 52, 49, 58, 60],
  trendLabels: ["Apr 21", "Apr 28", "May 5", "May 12", "May 19"],
  sources: [
    { label: "Walk-in QR", value: 18, pct: "43%" },
    { label: "Instagram", value: 12, pct: "29%" },
    { label: "Indeed", value: 7, pct: "17%" },
    { label: "Referrals", value: 5, pct: "12%" },
  ],
  quality: [62, 66, 64, 70, 68, 73, 71, 76, 74, 79, 77, 82, 80, 84, 83, 85, 84, 86, 87],
  insight: "Voice stage is the largest drop-off; shorten prompts for Barista.",
};
