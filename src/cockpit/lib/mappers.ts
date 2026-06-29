import { format, formatDistanceToNow } from "date-fns";
import type { ApplicationWithCandidate } from "@/hooks/useApplications";
import type { JobWithApplicationCount } from "@/hooks/useJobs";
import type { InterviewWithDetails } from "@/hooks/useInterviews";
import type { DocumentWithApplication } from "@/hooks/useDocuments";
import type { Conversation, Message } from "@/hooks/useMessages";
import type { TeamMember } from "@/hooks/useTeamMembers";
import type { TeamInvitation } from "@/hooks/useTeam";
import type { ActivityItem } from "@/hooks/useActivityFeed";
import type { Profile } from "@/hooks/useProfile";
import type {
  Candidate,
  CandidateStage,
  JobRow,
  JobStatus,
  PipelineNode,
  StageKey,
  DocRow,
  DocStatus,
  InterviewItem,
  Conversation as CockpitConversation,
  ChatMessage,
  TeamMember as CockpitTeamMember,
} from "../data";

export function parseApplicationNotes(notes: string | null): Record<string, unknown> {
  if (!notes) return {};
  try {
    return JSON.parse(notes) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function getInitials(name: string | null | undefined, email?: string | null): string {
  if (name?.trim()) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("");
  }
  return email?.[0]?.toUpperCase() ?? "?";
}

function pickJobIcon(title: string): JobRow["icon"] {
  const t = title.toLowerCase();
  if (t.includes("barista") || t.includes("coffee")) return "coffee";
  if (t.includes("lead") || t.includes("manager")) return "star";
  if (t.includes("cashier") || t.includes("register")) return "register";
  if (t.includes("server") || t.includes("wait")) return "tray";
  if (t.includes("cook") || t.includes("chef") || t.includes("kitchen")) return "chef";
  return "coffee";
}

function mapJobStatus(status: string): JobStatus {
  if (status === "published") return "live";
  if (status === "draft") return "draft";
  return "closed";
}

function formatPay(job: JobWithApplicationCount): string {
  const min = job.salary_min;
  const max = job.salary_max;
  const currency = job.salary_currency?.toUpperCase() === "USD" || !job.salary_currency ? "$" : job.salary_currency;
  if (min != null && max != null) return `${currency}${min} – ${currency}${max} / hr`;
  if (min != null) return `From ${currency}${min}`;
  if (max != null) return `Up to ${currency}${max}`;
  return job.job_type ? job.job_type.replace(/_/g, " ") : "Competitive pay";
}

export function mapJobRow(job: JobWithApplicationCount, apps: ApplicationWithCandidate[]): JobRow {
  const jobApps = apps.filter((a) => a.job_id === job.id && a.status !== "rejected");
  const voice = jobApps.filter((a) => !!a.voice_interview_result).length;
  const shortlist = jobApps.filter((a) => ["reviewing", "interview", "offered"].includes(a.status)).length;
  const interview = jobApps.filter((a) => a.status === "interview").length;
  const hired = jobApps.filter((a) => a.status === "hired").length;
  const status = mapJobStatus(job.status);
  const dateLabel = status === "draft" ? "Last edited" : status === "closed" ? "Closed" : "Posted";
  const date = format(new Date(job.created_at), "MMM d, yyyy");

  return {
    id: job.id,
    title: job.title,
    icon: pickJobIcon(job.title),
    location: job.location ?? "Location TBD",
    pay: formatPay(job),
    status,
    applicants: job.application_count,
    roleCode: job.job_code ?? null,
    dateLabel,
    date,
    stats: { voice, shortlist, interview, hired },
  };
}

function extractQuizScore(app: ApplicationWithCandidate): number | null {
  const notes = parseApplicationNotes(app.notes);
  const quizResult = notes.quizResult as { score?: number } | undefined;
  if (typeof quizResult?.score === "number") return Math.round(quizResult.score);
  const quiz = notes.quiz as { score?: number } | undefined;
  if (typeof quiz?.score === "number") return Math.round(quiz.score);
  return null;
}

function extractVoiceScore(app: ApplicationWithCandidate): number | null {
  const result = app.voice_interview_result as { score?: number; overallScore?: number } | null;
  if (typeof result?.overallScore === "number") return Math.round(result.overallScore);
  if (typeof result?.score === "number") return Math.round(result.score);
  return null;
}

export function mapCandidateStage(app: ApplicationWithCandidate): CandidateStage {
  if (app.status === "hired") return "Hired";
  if (["reviewing", "interview", "offered"].includes(app.status)) return "Shortlist";
  const phase = (app.phase ?? "").toLowerCase();
  if (phase.includes("voice")) return "Voice";
  if (phase.includes("quiz") || extractQuizScore(app) != null) return "Quiz";
  return "Application";
}

function extractStrengths(app: ApplicationWithCandidate): string[] {
  const analysis = app.ai_analysis ?? "";
  const bullets = analysis
    .split(/[\n•\-]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && s.length < 80)
    .slice(0, 4);
  // No fabrication: if Ava hasn't produced real analysis, return none (UI shows "screening in progress").
  return bullets.length >= 2 ? bullets : [];
}

export function mapCandidate(app: ApplicationWithCandidate): Candidate {
  const profile = app.profiles;
  const job = app.jobs;
  const name = profile?.full_name?.trim() || profile?.email || "Applicant";
  const quiz = extractQuizScore(app);
  const voice = extractVoiceScore(app);
  const overall = app.ai_score != null ? Math.round(app.ai_score) : Math.max(quiz ?? 0, voice ?? 0);
  const analyzed = app.ai_score != null || quiz != null || voice != null;
  const read = (app.ai_analysis ?? app.phase_ai_analysis ?? "Screening in progress…").split("\n")[0].slice(0, 140);
  const readFull = app.ai_analysis ?? app.phase_ai_analysis ?? read;

  return {
    id: app.id,
    avatar: app.candidate_id,
    name,
    appliedAgo: `Applied ${formatDistanceToNow(new Date(app.created_at), { addSuffix: true })}`,
    appliedDate: format(new Date(app.created_at), "MMM d, yyyy"),
    role: job?.title ?? "Role",
    stage: mapCandidateStage(app),
    quiz,
    voice,
    overall,
    read,
    readFull,
    strengths: extractStrengths(app),
    risk: analyzed
      ? {
          level: overall >= 75 ? "Low" : overall >= 50 ? "Medium" : "High",
          note: "Based on completed screening signals.",
        }
      : { level: "Pending", note: "Ava is still screening this candidate." },
    source: "Application",
  };
}

export function buildPipeline(apps: ApplicationWithCandidate[]): PipelineNode[] {
  const active = apps.filter((a) => a.status !== "rejected");
  const total = Math.max(active.length, 1);

  const application = active.filter((a) => mapCandidateStage(a) === "Application").length;
  const quiz = active.filter((a) => mapCandidateStage(a) === "Quiz").length;
  const voice = active.filter((a) => mapCandidateStage(a) === "Voice").length;
  const shortlist = active.filter((a) => mapCandidateStage(a) === "Shortlist").length;
  const hired = active.filter((a) => a.status === "hired").length;

  const pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  const drop = (from: number, to: number) => (from > 0 ? Math.max(0, from - to) : 0);

  const nodes: PipelineNode[] = [
    { key: "application", label: "Application", count: application, pct: pct(application), tone: "green", dropOff: drop(application, quiz) },
    { key: "quiz", label: "Quiz", count: quiz, pct: pct(quiz), tone: "green", dropOff: drop(quiz, voice) },
    {
      key: "voice",
      label: "Voice",
      count: voice,
      pct: pct(voice),
      tone: voice > 0 && voice / total < 0.25 ? "bottleneck" : "green",
      dropOff: drop(voice, shortlist),
    },
    { key: "shortlist", label: "Shortlist", count: shortlist, pct: pct(shortlist), tone: "muted", dropOff: drop(shortlist, hired) },
    { key: "hired", label: "Hired", count: hired, pct: pct(hired), tone: "muted" },
  ];

  return nodes;
}

export function buildDashboardHero(apps: ApplicationWithCandidate[]) {
  const shortlist = apps.filter((a) => mapCandidateStage(a) === "Shortlist" && a.status !== "rejected");
  const active = apps.filter((a) => a.status !== "rejected");
  const count = shortlist.length;
  const company = count === 1 ? "1 strong candidate" : `${count} strong candidates`;
  return {
    headline: count > 0 ? `Ava has ${company} ready for review` : "Your pipeline is warming up",
    sub:
      count > 0
        ? `I screened ${active.length} applicants and found ${count} who look like a great fit.`
        : "Publish a role or share your apply link to start receiving applicants.",
  };
}

export function buildDashboardKpis(jobs: JobWithApplicationCount[], apps: ApplicationWithCandidate[]) {
  const activeJobs = jobs.filter((j) => j.status === "published").length;
  const totalApplicants = apps.filter((a) => a.status !== "rejected").length;
  const underReview = apps.filter((a) => ["reviewing", "interview", "offered", "in_progress"].includes(a.status)).length;
  const hired = apps.filter((a) => a.status === "hired").length;
  return [
    { label: "Active jobs", value: activeJobs, icon: "briefcase" as const },
    { label: "Total applicants", value: totalApplicants, icon: "users" as const },
    { label: "Under review", value: underReview, icon: "clock" as const },
    { label: "Hired", value: hired, icon: "check" as const },
  ];
}

type ActivityIcon = "mic" | "star" | "sparkle" | "userplus";

export function mapActivityFeed(items: ActivityItem[]): Array<{
  id: string;
  avatar: string | null;
  icon: ActivityIcon;
  name: string;
  action: string;
  time: string;
  em?: string;
}> {
  return items.slice(0, 6).map((item) => {
    let icon: ActivityIcon = "userplus";
    if (item.type === "interview") icon = "mic";
    else if (item.type === "hired") icon = "star";
    else if (item.type === "status_change") icon = "sparkle";

    return {
      id: item.id,
      avatar: item.metadata?.candidateName ? item.metadata.candidateName.toLowerCase().replace(/\s+/g, "-") : null,
      icon,
      name: item.metadata?.candidateName ?? item.title,
      action: item.description,
      time: formatDistanceToNow(new Date(item.timestamp), { addSuffix: true }),
      em: item.metadata?.candidateName,
    };
  });
}

export function mapInterviewItem(interview: InterviewWithDetails): InterviewItem {
  const profile = interview.applications?.profiles;
  const job = interview.applications?.jobs;
  const name = profile?.full_name ?? profile?.email ?? "Candidate";
  const time = format(new Date(interview.scheduled_at), "h:mm a");
  let kind: InterviewItem["kind"] = "scheduled";
  if (interview.status === "completed") kind = "voice-completed";
  else if (interview.interview_type === "in_person") kind = "in-person-confirmed";
  else if (interview.interview_type === "voice") kind = "voice-scheduled";

  return {
    id: interview.id,
    avatar: interview.applications?.candidate_id ?? interview.id,
    name,
    role: job?.title ?? "Role",
    time,
    kind,
  };
}

function mapDocStatus(status: string): DocStatus {
  if (status === "signed") return "Signed";
  if (status === "declined") return "Declined";
  if (status === "pending") return "Pending";
  return "Submitted";
}

export function mapDocumentRow(doc: DocumentWithApplication): DocRow {
  const profile = doc.applications?.profiles;
  const job = doc.applications?.jobs;
  const candidate = profile?.full_name ?? profile?.email ?? "Candidate";
  return {
    id: doc.id,
    title: doc.name ?? "Document",
    type: doc.document_type ?? "Request",
    candidate,
    avatar: doc.applications?.candidate_id ?? doc.id,
    role: job?.title ?? "Role",
    status: mapDocStatus(doc.status),
    statusNote: doc.status === "pending" ? "Awaiting signature" : doc.status,
    updated: formatDistanceToNow(new Date(doc.updated_at ?? doc.created_at), { addSuffix: true }),
    created: doc.created_at ? format(new Date(doc.created_at), "MMM d, yyyy") : null,
    expires: doc.expires_at ? format(new Date(doc.expires_at), "MMM d, yyyy") : null,
  };
}

export function mapConversation(conv: Conversation, apps: ApplicationWithCandidate[]): CockpitConversation {
  const profile = conv.contact_profile;
  const name = profile?.full_name ?? profile?.email ?? "Contact";
  const app = apps.find((a) => a.candidate_id === conv.contact_id);
  return {
    id: conv.contact_id,
    avatar: conv.contact_id,
    name,
    role: conv.job_title ?? app?.jobs?.title ?? "Applicant",
    time: conv.last_message
      ? formatDistanceToNow(new Date(conv.last_message.created_at), { addSuffix: true })
      : "",
    preview: conv.last_message?.content?.slice(0, 80) ?? "No messages yet",
    unread: conv.unread_count || undefined,
  };
}

export function mapChatMessages(messages: Message[], employerId: string): ChatMessage[] {
  return messages.map((m) => ({
    id: m.id,
    from: m.sender_id === employerId ? "me" : "them",
    text: m.content,
    time: format(new Date(m.created_at), "h:mm a"),
  }));
}

export function mapTeamMember(member: TeamMember, profile?: Profile | null): CockpitTeamMember {
  const permission =
    member.permission_level === "owner" || member.can_manage_pipeline
      ? "Full Admin"
      : member.can_message_candidates
        ? "Can message candidates"
        : member.can_send_documents
          ? "Documents only"
          : "Can view only";

  return {
    id: member.id,
    avatar: member.user_id,
    name: member.name ?? profile?.full_name ?? member.email,
    email: member.email,
    role: member.department ?? member.permission_level ?? "Member",
    permission,
    permissionTone: member.can_manage_pipeline ? "jade" : "muted",
  };
}

export function mapTeamInvite(invite: TeamInvitation) {
  return {
    id: invite.id,
    initials: getInitials(invite.invitee_name, invite.invitee_email),
    name: invite.invitee_name ?? invite.invitee_email,
    email: invite.invitee_email,
    role: invite.department ?? "Team member",
    invitedBy: "You",
    expires: format(new Date(invite.expires_at), "MMM d, yyyy"),
  };
}

export function isRecentlyActive(updatedAt: string): boolean {
  return Date.now() - new Date(updatedAt).getTime() < 48 * 60 * 60 * 1000;
}

export function candidateSignalFromApp(app: ApplicationWithCandidate) {
  const overall = app.ai_score != null ? Math.round(app.ai_score) : mapCandidate(app).overall;
  return { score: overall, active: isRecentlyActive(app.updated_at) };
}

export function buildAccountFromProfile(profile: Profile | null | undefined, trialDaysLeft?: number | null) {
  const name = profile?.company_name?.trim() || profile?.full_name?.trim() || "Your business";
  const initials = getInitials(name, profile?.email);
  return {
    name,
    initials,
    trialDaysLeft: trialDaysLeft ?? 14,
    trialEnds: trialDaysLeft != null ? `${trialDaysLeft} days` : "Trial",
  };
}
