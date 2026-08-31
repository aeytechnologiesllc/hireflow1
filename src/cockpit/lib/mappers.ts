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
import {
  buildCandidateJourney,
  positionFor,
  DECISION_STAGE_ID,
  type WorkflowStepLike,
} from "@/lib/candidateJourney";
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
  if (app.status === "rejected") return "Rejected";
  if (app.status === "hired") return "Hired";
  if (["reviewing", "interview", "offered"].includes(app.status)) return "Shortlist";
  const phase = (app.phase ?? "").toLowerCase();
  if (phase.includes("voice")) return "Voice";
  if (phase.includes("quiz") || extractQuizScore(app) != null) return "Quiz";
  return "Application";
}

/**
 * The shape of `applications.ai_scorecard` that matters to the cockpit — a
 * loose mirror of `AvaScorecard` in `supabase/functions/_shared/autopilot.ts`
 * (kept local rather than imported: that file lives in the Deno edge-function
 * runtime, this one in the Vite/browser build). The column is typed `Json` in
 * the generated Supabase types, so this is a defensive read, not a contract —
 * every field is optional and missing/malformed data degrades to "no
 * recommendation" rather than throwing.
 */
interface AiScorecard {
  recommendedAction?: "advance" | "review" | "reject" | null;
  hardRejectReason?: string | null;
  riskFlags?: string[] | null;
  /** Real, structured positive-signal bullets the judge produced (e.g.
   *  "Trained 5 junior techs (leadership/mentoring)") — never parsed out of
   *  free text, so it's the safest source for "Top strengths". */
  transferableEvidence?: string[] | null;
}

function extractScorecard(app: ApplicationWithCandidate): AiScorecard | null {
  const raw = (app as unknown as { ai_scorecard?: unknown }).ai_scorecard;
  if (!raw || typeof raw !== "object") return null;
  return raw as AiScorecard;
}

/** A line that's Ava's report scaffolding, not a sentence a human wrote to be
 *  read — a bare section header ("PHASE PERFORMANCE SUMMARY"), a bare label
 *  with nothing after it ("Phase Highlights:"), or a "Label: value"
 *  diagnostic pair ("Application: Completed", "Status: VALID_RESUME"). None
 *  of these belong in a list that's supposed to read as real strengths. */
function looksLikeScaffolding(line: string): boolean {
  if (/^[A-Z0-9 ,/&'()-]+:?$/.test(line)) return true;
  if (/^[A-Za-z][A-Za-z /'()-]{1,40}:$/.test(line)) return true;
  if (/^[A-Za-z][A-Za-z /'()-]{1,40}:\s+\S/.test(line)) return true;
  return false;
}

/** A labeled value that just says "nothing here" ("None", "N/A", "None
 *  identified") — real absence, not a strength worth showing. */
const NO_VALUE = /^(none|n\/a|not applicable|not provided)\b/i;

/** Pulls just one labeled bulleted section out of Ava's structured resume
 *  report (e.g. the real "Key Strengths:" list under **OVERALL ASSESSMENT**)
 *  — never the whole document, which is mostly Label: Value diagnostics and
 *  section headers that have nothing to do with strengths. */
function extractLabeledBullets(raw: string, label: string): string[] {
  const m = raw.match(new RegExp(`^${label}\\s*:\\s*([\\s\\S]*?)(?=\\n[A-Za-z][A-Za-z /'()-]{1,40}:|\\n\\*\\*|\\n---|$)`, "im"));
  if (!m) return [];
  return m[1]
    .split(/\n+/)
    .map((l) => l.replace(/\*\*/g, "").replace(/^[\s–—•*-]+/, "").trim())
    .filter((l) => l.length >= 8 && l.length <= 160)
    .filter((l) => !NO_VALUE.test(l));
}

function dedupe(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * "Top strengths" — real, specific things worth telling the employer, never
 * Ava's report scaffolding. Three layers, each preferred over the next only
 * when it comes up empty:
 *  1. `ai_scorecard.transferableEvidence` — genuine structured JSON the judge
 *     produced, not parsed out of free text at all. The safest source.
 *  2. The report's own "Key Strengths:" bulleted section — a real labeled
 *     list, not the whole document.
 *  3. "Phase Highlights:" — same idea, one section over.
 * If none of those hold anything real, this returns no strengths at all
 * (the UI hides the card) rather than falling back to grabbing arbitrary
 * sentences — an empty section is honest; a header dressed up as a bullet
 * point is not.
 */
function extractStrengths(app: ApplicationWithCandidate, scorecard: AiScorecard | null): string[] {
  const structured = Array.isArray(scorecard?.transferableEvidence)
    ? scorecard!.transferableEvidence.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];
  if (structured.length > 0) return dedupe(structured, 4);

  const analysis = (app.ai_analysis ?? "").trim();
  if (!analysis) return [];

  const keyStrengths = extractLabeledBullets(analysis, "Key Strengths");
  if (keyStrengths.length > 0) return dedupe(keyStrengths, 4);

  const phaseHighlights = extractLabeledBullets(analysis, "Phase Highlights");
  if (phaseHighlights.length > 0) return dedupe(phaseHighlights, 4);

  // Not the structured resume-report template — a shorter, already-prose
  // analysis (a voice-interview summary, a phase blurb). Fall back to
  // sentence-splitting, but still refuse anything that reads as scaffolding.
  const parts = analysis
    .replace(/([.!?])\s+/g, "$1\n")
    .split(/[\n\n•]+/)
    .map((s) => s.replace(/\*\*/g, "").replace(/^[\s–—•*-]+/, "").trim())
    .filter((s) => s.length >= 15 && s.length <= 160)
    .filter((s) => !looksLikeScaffolding(s));
  const out = dedupe(parts, 4);
  // No fabrication: fewer than two real sentences reads as noise, not signal.
  return out.length >= 2 ? out : [];
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

  const scorecard = extractScorecard(app);
  const recommendedAction = scorecard?.recommendedAction ?? null;
  const hardRejectReason = scorecard?.hardRejectReason ?? null;
  const riskFlags = Array.isArray(scorecard?.riskFlags) ? scorecard!.riskFlags.filter((f): f is string => typeof f === "string") : [];

  return {
    id: app.id,
    avatar: app.candidate_id,
    name,
    email: profile?.email ?? null,
    appliedAgo: `Applied ${formatDistanceToNow(new Date(app.created_at), { addSuffix: true })}`,
    appliedDate: format(new Date(app.created_at), "MMM d, yyyy"),
    role: job?.title ?? "Role",
    stage: mapCandidateStage(app),
    quiz,
    voice,
    overall,
    analyzed,
    read,
    readFull,
    strengths: extractStrengths(app, scorecard),
    // The score alone decides Low/Medium/High, EXCEPT a hard-reject reason
    // always wins: a name mismatch or authenticity concern on a resume that
    // otherwise scored well must never read as "Low risk". The note carries
    // the engine's own words verbatim so the employer sees why, not just that.
    risk: analyzed
      ? {
          level: hardRejectReason ? "High" : overall >= 75 ? "Low" : overall >= 50 ? "Medium" : "High",
          note: hardRejectReason ?? "Based on completed screening signals.",
        }
      : { level: "Pending", note: "Ava is still screening this candidate." },
    recommendedAction,
    hardRejectReason,
    riskFlags,
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

/** The minimal shape `buildJourneyPipeline` needs off an application — a
 *  structural subset of `ApplicationWithCandidate` so it also accepts the
 *  showcase dataset's lighter rows without a hard dependency on the real type. */
export interface JourneyPipelineInput {
  status?: string | null;
  phase?: string | null;
  jobs?: { workflow_steps?: unknown; quiz_questions?: unknown } | null;
}

/** One column of "Pipeline at a glance" — a real phase from a real job's
 *  journey, and how many live applicants are on it right now. No percentage:
 *  a share of *current occupants* reads as a conversion rate it isn't, so
 *  this is deliberately count-only. `count === 0` is a real, keepable fact
 *  ("nobody's here yet") — callers must render it, not hide the column. */
export interface JourneyPipelineStage {
  key: string;
  label: string;
  count: number;
}

/**
 * "Pipeline at a glance" — the whole track a live applicant could ride, using
 * the exact same source of truth as the applicant journey strip: every real
 * phase comes from `buildCandidateJourney` off a job's own
 * `workflow_steps`/`quiz_questions` (see `src/lib/candidateJourney.ts`),
 * never a separate, hand-picked set of stage names like the legacy
 * `buildPipeline` above. Unlike that legacy funnel, this shows EVERY phase —
 * including ones nobody currently occupies — because an empty phase is real
 * information ("nobody's in the voice interview yet"), not noise to prune.
 *
 * Phases are seeded from the full journey of every distinct job shape a live
 * applicant belongs to (so a business running one job sees exactly that
 * job's real steps; a business running several differently-configured jobs
 * sees the union of them — still only real, configured phases, never
 * invented ones), then each live applicant's own real position increments
 * its column. Stages from different jobs merge into one column when they
 * resolve to the same displayed title (e.g. two jobs that both have a
 * "Voice interview" step), ordered by how early that step actually sits in
 * its own journey — so "Application" always leads and "Decision" always
 * trails. Rejected applicants are not part of a live pipeline; hired
 * applicants get their own trailing column since they've cleared every real
 * stage. Counts are real — never estimated, never padded, no bottleneck
 * guesswork layered on top.
 */
export function buildJourneyPipeline(apps: readonly JourneyPipelineInput[]): JourneyPipelineStage[] {
  const hired = apps.filter((a) => a.status === "hired");
  const live = apps.filter((a) => a.status !== "rejected" && a.status !== "hired");
  if (live.length + hired.length === 0) return [];

  const buckets = new Map<string, { label: string; count: number; order: number }>();
  const seenShapes = new Set<string>();

  const journeyOf = (app: JourneyPipelineInput) => {
    const workflowSteps = app.jobs?.workflow_steps as WorkflowStepLike[] | undefined;
    const quizQuestions = app.jobs?.quiz_questions as unknown[] | undefined;
    const hasQuiz = Array.isArray(quizQuestions) && quizQuestions.length > 0;
    return buildCandidateJourney(workflowSteps, { hasQuiz });
  };

  const seed = (steps: ReturnType<typeof journeyOf>) => {
    steps.forEach((step, i) => {
      const key = step.id === DECISION_STAGE_ID ? DECISION_STAGE_ID : step.title;
      const existing = buckets.get(key);
      if (existing) existing.order = Math.min(existing.order, i);
      else buckets.set(key, { label: step.title, count: 0, order: i });
    });
  };

  live.forEach((app) => {
    const steps = journeyOf(app);
    // Seed every real phase of this job's journey once per distinct shape —
    // including the ones nobody has reached yet — so the track shows the
    // whole ride, not just the stops that happen to have someone on them.
    const shape = steps.map((s) => s.title).join("|");
    if (!seenShapes.has(shape)) {
      seenShapes.add(shape);
      seed(steps);
    }

    const position = positionFor(steps, { phase: app.phase, status: app.status });
    const key = position.current.id === DECISION_STAGE_ID ? DECISION_STAGE_ID : position.current.title;
    const bucket = buckets.get(key);
    if (bucket) bucket.count += 1;
    else buckets.set(key, { label: position.current.title, count: 1, order: position.index });
  });

  const stages: JourneyPipelineStage[] = Array.from(buckets.values())
    .sort((a, b) => a.order - b.order)
    .map((stage) => ({
      key: stage.label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label: stage.label,
      count: stage.count,
    }));

  if (hired.length > 0) {
    stages.push({ key: "hired", label: "Hired", count: hired.length });
  }

  return stages;
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
    fileUrl: doc.file_url ?? null,
    rawStatus: doc.status ?? null,
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
