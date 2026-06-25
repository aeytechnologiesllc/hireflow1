/**
 * Showcase schema adapter (roles / candidates / applications on yqklrkpptnhubsnijqze).
 * Used when the hireflow1 `jobs` table is absent — reads public demo data without
 * touching or migrating the showcase tables.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  Candidate,
  CandidateStage,
  JobRow,
  PipelineNode,
} from "../data";
import { getInitials } from "../lib/mappers";

const DEFAULT_EMPLOYER_ID = "emp_marias_cafe";

let schemaMode: "hireflow1" | "showcase" | null = null;

export async function detectSchemaMode(): Promise<"hireflow1" | "showcase"> {
  if (schemaMode) return schemaMode;
  const { error } = await supabase.from("jobs").select("id").limit(1);
  if (error && (error.message.includes("Could not find") || error.code === "PGRST205")) {
    schemaMode = "showcase";
  } else {
    schemaMode = "hireflow1";
  }
  return schemaMode;
}

function mapRoleStatus(status: string): JobRow["status"] {
  if (status === "draft") return "draft";
  if (status === "closed" || status === "filled") return "closed";
  return "live";
}

function mapShowcaseStage(stage: string): CandidateStage {
  if (stage === "quiz") return "Quiz";
  if (stage === "interview") return "Voice";
  if (stage === "shortlist") return "Shortlist";
  return "Application";
}

function scaleVoice(score: number | null): number | null {
  if (score == null) return null;
  return score <= 10 ? Math.round(score * 10) : Math.round(score);
}

export async function fetchShowcaseAccount() {
  const { data } = await supabase
    .from("employers")
    .select("name")
    .eq("id", DEFAULT_EMPLOYER_ID)
    .maybeSingle();
  const name = data?.name ?? "Maria's Café";
  return {
    name,
    initials: getInitials(name),
    trialDaysLeft: 14,
    trialEnds: "Trial",
  };
}

export async function fetchShowcaseJobs(): Promise<JobRow[]> {
  const { data: roles, error } = await supabase
    .from("roles")
    .select("*")
    .eq("employer_id", DEFAULT_EMPLOYER_ID)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return (roles ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    icon: "coffee" as const,
    location: r.location,
    pay: r.pay,
    status: mapRoleStatus(r.status),
    applicants: r.applicant_count ?? 0,
    dateLabel: r.status === "draft" ? "Last edited" : "Posted",
    date: "Recently",
    roleCode: (r as { role_code?: string | null }).role_code ?? null,
    stats: {
      voice: r.interview ?? 0,
      shortlist: r.shortlist ?? 0,
      interview: r.interview ?? 0,
      hired: 0,
    },
  }));
}

interface ShowcaseBundle {
  candidates: Candidate[];
  applications: Array<{
    id: string;
    candidate_id: string;
    role_id: string;
    stage: string;
    status: string;
    decision: string | null;
  }>;
}

export async function fetchShowcaseCandidates(): Promise<ShowcaseBundle> {
  const [{ data: apps, error: appErr }, { data: candidates, error: candErr }, { data: details }] =
    await Promise.all([
      supabase
        .from("applications")
        .select("id, candidate_id, role_id, stage, voice_score, quiz_score, note, decision")
        .order("sort_order", { ascending: true }),
      supabase.from("candidates").select("id, name, initials"),
      supabase.from("candidate_details").select("id, ava_read, voice_score, quiz_score, role_title"),
    ]);

  if (appErr) throw appErr;
  if (candErr) throw candErr;

  const { data: roles } = await supabase
    .from("roles")
    .select("id, title")
    .eq("employer_id", DEFAULT_EMPLOYER_ID);

  const candMap = new Map((candidates ?? []).map((c) => [c.id, c]));
  const roleMap = new Map((roles ?? []).map((r) => [r.id, r.title]));
  const detailMap = new Map((details ?? []).map((d) => [d.id, d]));

  const mapped: Candidate[] = (apps ?? []).map((app) => {
    const cand = candMap.get(app.candidate_id);
    const detail = detailMap.get(app.candidate_id);
    const name = cand?.name ?? "Candidate";
    const quiz = app.quiz_score ?? (detail?.quiz_score != null ? Number(detail.quiz_score) : null);
    const voice = scaleVoice(app.voice_score ?? detail?.voice_score ?? null);
    const overall = Math.max(quiz ?? 0, voice ?? 0);
    const read = detail?.ava_read ?? app.note ?? "Awaiting review.";

    return {
      id: app.id,
      avatar: app.candidate_id,
      name,
      appliedAgo: "Recently",
      appliedDate: "Recently",
      role: roleMap.get(app.role_id) ?? detail?.role_title ?? "Role",
      stage: mapShowcaseStage(app.stage),
      quiz,
      voice,
      overall,
      read: read.slice(0, 140),
      readFull: read,
      strengths: ["Strong communication", "Customer focus", "Reliable", "Team player"],
      risk: { level: "Low" as const, note: "No major concerns flagged." },
      source: "Application",
    };
  });

  return {
    candidates: mapped,
    applications: (apps ?? []).map((a) => ({
      id: a.id,
      candidate_id: a.candidate_id,
      role_id: a.role_id,
      stage: a.stage,
      status: a.decision === "passed" ? "rejected" : a.decision === "offer" ? "offered" : "reviewing",
      decision: a.decision,
    })),
  };
}

export function buildShowcasePipeline(candidates: Candidate[]): PipelineNode[] {
  const total = Math.max(candidates.length, 1);
  const count = (stage: CandidateStage) => candidates.filter((c) => c.stage === stage).length;
  const application = count("Application");
  const quiz = count("Quiz");
  const voice = count("Voice");
  const shortlist = count("Shortlist");
  const hired = count("Hired");
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  const drop = (from: number, to: number) => (from > 0 ? Math.max(0, from - to) : 0);

  return [
    { key: "application", label: "Application", count: application, pct: pct(application), tone: "green", dropOff: drop(application, quiz) },
    { key: "quiz", label: "Quiz", count: quiz, pct: pct(quiz), tone: "green", dropOff: drop(quiz, voice) },
    { key: "voice", label: "Voice", count: voice, pct: pct(voice), tone: voice > 0 && voice / total < 0.25 ? "bottleneck" : "green", dropOff: drop(voice, shortlist) },
    { key: "shortlist", label: "Shortlist", count: shortlist, pct: pct(shortlist), tone: "muted", dropOff: drop(shortlist, hired) },
    { key: "hired", label: "Hired", count: hired, pct: pct(hired), tone: "muted" },
  ];
}

export async function fetchShowcaseDashboard() {
  const { data: kpis } = await supabase.from("kpis").select("*").eq("id", 1).maybeSingle();
  const { data: activity } = await supabase
    .from("activity")
    .select("*")
    .order("sort_order", { ascending: true })
    .limit(6);

  const { candidates } = await fetchShowcaseCandidates();

  return {
    hero: {
      headline: `Ava has ${kpis?.shortlist_ready ?? candidates.filter((c) => c.stage === "Shortlist").length} strong candidates ready for review`,
      sub: `I screened ${kpis?.in_pipeline ?? candidates.length} applicants across your open roles.`,
    },
    kpis: [
      { label: "Active jobs", value: kpis?.open_roles ?? 0, icon: "briefcase" as const },
      { label: "Total applicants", value: kpis?.in_pipeline ?? candidates.length, icon: "users" as const },
      { label: "Under review", value: kpis?.shortlist_ready ?? 0, icon: "clock" as const },
      { label: "Hired", value: 0, icon: "check" as const },
    ],
    activity: (activity ?? []).map((a, i) => ({
      id: String(i),
      avatar: null,
      icon: (a.kind === "interview" ? "mic" : a.kind === "pass" ? "star" : "userplus") as "mic" | "star" | "userplus",
      name: a.text.split(" ")[0] ?? "Update",
      action: a.text,
      time: a.time,
    })),
    pipeline: buildShowcasePipeline(candidates),
  };
}

export async function updateShowcaseDecision(applicationId: string, decision: "offer" | "passed") {
  const { error } = await supabase
    .from("applications")
    .update({ decision })
    .eq("id", applicationId);
  if (error) throw error;
}

export async function fetchShowcaseConversations() {
  const { data: convs, error } = await supabase
    .from("conversations")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;

  return (convs ?? []).map((c) => ({
    id: c.candidate_id,
    avatar: c.candidate_id,
    name: c.name,
    role: c.role_title,
    time: c.time,
    preview: c.preview,
    unread: c.unread ? 1 : undefined,
    conversationId: c.id,
  }));
}

export async function fetchShowcaseThread(conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((m) => ({
    id: m.id,
    from: m.from_role === "employer" ? ("me" as const) : ("them" as const),
    text: m.text,
    time: m.time,
  }));
}

export async function fetchShowcaseDocuments() {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []).map((d) => ({
    id: d.id,
    title: d.name,
    type: d.section,
    candidate: d.candidate_name,
    avatar: d.initials.toLowerCase(),
    role: "Role",
    status: (d.status_kind === "done" ? "Signed" : d.status_kind === "action" ? "Pending" : "Submitted") as
      | "Pending"
      | "Submitted"
      | "Signed"
      | "Declined",
    statusNote: d.status,
    updated: d.date,
  }));

  const pending = rows.filter((r) => r.status === "Pending").length;
  const signed = rows.filter((r) => r.status === "Signed").length;

  return {
    kpis: [
      { label: "Pending", value: pending, icon: "clock" as const, tone: "brass" as const },
      { label: "Signed", value: signed, icon: "check" as const, tone: "jade" as const },
      { label: "Declined", value: 0, icon: "x" as const, tone: "muted" as const },
      { label: "Awaiting your signature", value: pending, icon: "edit" as const, tone: "brass" as const },
    ],
    tabs: ["All documents", "Pending", "Signed", "Requests"],
    rows,
    detailTimeline: [],
  };
}

export async function fetchShowcaseInterviews() {
  const { candidates } = await fetchShowcaseCandidates();
  const voiceStage = candidates.filter((c) => c.stage === "Voice" || c.stage === "Shortlist");
  const today = new Date();

  const upcoming = voiceStage.slice(0, 6).map((c, i) => ({
    id: c.id,
    avatar: c.avatar,
    name: c.name,
    role: c.role,
    time: i === 0 ? "Today · 2:00 PM" : `${i + 1}d`,
    kind: (c.stage === "Voice" ? "voice-scheduled" : "voice-completed") as
      | "voice-scheduled"
      | "voice-completed"
      | "in-person-confirmed"
      | "scheduled",
  }));

  const reads = voiceStage.slice(0, 3).map((c) => ({
    id: c.id,
    icon: (c.overall >= 80 ? "star" : "user") as "user" | "star",
    text: c.readFull.slice(0, 90) + (c.readFull.length > 90 ? "…" : ""),
  }));

  return {
    kpis: [
      { label: "Today", value: Math.min(1, upcoming.length), icon: "calendar" as const },
      { label: "Scheduled", value: candidates.filter((c) => c.stage === "Voice").length, icon: "calendar" as const },
      { label: "Completed", value: candidates.filter((c) => c.stage === "Shortlist").length, icon: "check" as const },
      { label: "Needs review", value: candidates.filter((c) => c.stage === "Shortlist").length, icon: "clock" as const },
    ],
    daysWithInterviews: upcoming.length ? [today.getDate(), today.getDate() + 2].filter((d) => d <= 30) : [],
    selectedDay: today.getDate(),
    upcoming,
    reads,
  };
}

export async function fetchShowcaseAnalytics() {
  const { candidates } = await fetchShowcaseCandidates();
  const pipeline = buildShowcasePipeline(candidates);
  const totalApps = candidates.length;
  const shortlist = candidates.filter((c) => c.stage === "Shortlist").length;
  const hireRate = totalApps > 0 ? Math.round((shortlist / totalApps) * 100) : 0;
  const scores = candidates.map((c) => c.overall).filter((s) => s > 0);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const trend = pipeline.map((p) => p.count);
  const bottleneck = pipeline.find((p) => p.tone === "bottleneck");

  return {
    kpis: [
      { label: "Time to hire", value: "4.2", unit: "days", delta: "demo dataset", trend: "down" as const, good: true, icon: "clock" as const },
      { label: "Hire rate", value: String(hireRate), unit: "%", delta: "shortlist / applicants", trend: "up" as const, good: true, icon: "userCheck" as const },
      { label: "Applicant quality", value: String(avgScore || "—"), unit: avgScore ? "" : "", delta: "avg screening score", trend: "up" as const, good: true, icon: "star" as const },
      { label: "Applications", value: String(totalApps), unit: "", delta: "in pipeline", trend: "up" as const, good: true, icon: "chat" as const },
    ],
    trend: trend.length ? trend : [12, 18, 15, 22, 19],
    trendLabels: ["Week 1", "Week 2", "Week 3", "Week 4", "Now"],
    sources: [
      { label: "Direct apply", value: Math.round(totalApps * 0.55), pct: "55%" },
      { label: "Job boards", value: Math.round(totalApps * 0.25), pct: "25%" },
      { label: "Referrals", value: Math.round(totalApps * 0.15), pct: "15%" },
      { label: "Other", value: Math.max(0, totalApps - Math.round(totalApps * 0.95)), pct: "5%" },
    ],
    quality: trend.length ? trend.map((v) => Math.min(95, 55 + v * 3)) : [62, 66, 70, 74, 78],
    insight: bottleneck
      ? `${bottleneck.label} is your largest drop-off — review voice-stage completion.`
      : totalApps === 0
        ? "Publish a role and share your apply code to start seeing funnel data."
        : "Your pipeline is moving steadily.",
    pipeline,
  };
}

export async function fetchShowcaseTeam(profile?: { name?: string | null; email?: string | null }) {
  const ownerName = profile?.name?.trim() || "You";
  const ownerEmail = profile?.email?.trim() || "owner@hireflow.dev";
  const initials = getInitials(ownerName);

  return {
    kpis: [
      { label: "Active members", value: 1, note: "People with access", icon: "users" as const, dot: "jade" as const },
      { label: "Pending invites", value: 0, note: "Invites awaiting response", icon: "mail" as const, dot: "brass" as const },
      { label: "View-only members", value: 0, note: "Can view but not edit", icon: "eye" as const, dot: "muted" as const },
    ],
    members: [
      {
        id: "owner",
        avatar: initials.toLowerCase().slice(0, 2),
        name: ownerName,
        email: ownerEmail,
        role: "Owner",
        permission: "Full admin",
        permissionTone: "jade" as const,
      },
    ],
    invites: [] as Array<{
      id: string;
      initials: string;
      name: string;
      email: string;
      invitedBy: string;
      role: string;
      expires: string;
    }>,
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
}

export async function updateShowcaseRole(
  roleId: string,
  updates: { title?: string; description?: string | null; location?: string | null; pay?: string | null; status?: string },
) {
  const { data, error } = await supabase.from("roles").update(updates).eq("id", roleId).select("*").single();
  if (error) throw error;
  return data;
}
