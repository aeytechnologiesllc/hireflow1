/**
 * Dev-preview-only. Realistic, fully offline fixture rows for every table
 * the cockpit and candidate hooks read from (see the `.from("...")` survey
 * in docs/DEV-PREVIEW.md). One coherent scenario: "Maria's Café", an
 * employer with four jobs and one candidate (Jordan Alvarez) who has an
 * application parked at every stage of the Barista job's journey, so each
 * phase page's first screen — and the CandidateStepGate "not yet" state —
 * all have a real application to open.
 *
 * Column names mirror src/integrations/supabase/types.ts's `Row` shapes
 * exactly (checked by hand against the live schema) so the real mapper
 * functions in src/cockpit/lib/mappers.ts run unmodified over this data.
 */
import type { FixtureRow, FixtureTables } from "./fixtureClient";
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
  DOC_DECLINED_ID,
  DOC_PENDING_CANDIDATE_ID,
  DOC_PENDING_EMPLOYER_ID,
  DOC_SIGNED_ID,
  EMPLOYER_USER_ID,
  INTERVIEW_COMPLETED_ID,
  INTERVIEW_UPCOMING_ID,
  JOB_BARISTA_ID,
  JOB_CASHIER_DRAFT_ID,
  JOB_SERVER_ID,
  JOB_SHIFT_LEAD_CLOSED_ID,
  REJECTED_CANDIDATE_USER_ID,
  STEP_CHAT_INTERVIEW,
  STEP_CHAT_SIM,
  STEP_PORTFOLIO,
  STEP_SALES,
  STEP_TYPING,
  STEP_VIDEO,
  STEP_VOICE,
  TEAM_MEMBER_USER_ID,
} from "./ids";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * DAY).toISOString();
const daysFromNow = (n: number) => new Date(now + n * DAY).toISOString();

// ---------------------------------------------------------------- profiles

const employerProfile: FixtureRow = {
  id: EMPLOYER_USER_ID,
  user_id: EMPLOYER_USER_ID,
  email: "maria@mariascafe.example",
  full_name: "Maria Alvarado",
  company_name: "Maria's Café",
  company_logo: null,
  company_description: "A neighborhood café and bakery, three locations, open since 2014.",
  company_address: "412 Elm Street, Springfield",
  avatar_url: null,
  bio: null,
  phone: "555-0101",
  job_title: null,
  linkedin_url: null,
  location: "Springfield",
  portfolio_url: null,
  resume_url: null,
  skills: null,
  experience_years: null,
  onboarding_completed: true,
  email_notifications_enabled: true,
  email_new_applications: true,
  email_messages: true,
  email_interview_reminders: true,
  email_document_updates: true,
  email_phase_updates: true,
  email_voice_minutes: true,
  created_at: daysAgo(220),
  updated_at: daysAgo(1),
};

const teamMemberProfile: FixtureRow = {
  ...employerProfile,
  id: TEAM_MEMBER_USER_ID,
  user_id: TEAM_MEMBER_USER_ID,
  email: "diego@mariascafe.example",
  full_name: "Diego Ferreira",
  bio: "Shift lead, handles interviews for the Elm Street location.",
};

const candidateProfile: FixtureRow = {
  id: CANDIDATE_USER_ID,
  user_id: CANDIDATE_USER_ID,
  email: "jordan.alvarez@example.com",
  full_name: "Jordan Alvarez",
  avatar_url: null,
  bio: "Two years of coffee-shop experience, looking for full-time hours.",
  phone: "555-0199",
  job_title: "Barista",
  linkedin_url: null,
  location: "Springfield",
  portfolio_url: null,
  resume_url: "https://example.com/fixtures/jordan-alvarez-resume.pdf",
  skills: ["Espresso", "Customer service", "POS systems", "Food safety"],
  experience_years: 2,
  company_name: null,
  company_logo: null,
  company_description: null,
  company_address: null,
  onboarding_completed: true,
  email_notifications_enabled: true,
  email_new_applications: true,
  email_messages: true,
  email_interview_reminders: true,
  email_document_updates: true,
  email_phase_updates: true,
  email_voice_minutes: true,
  created_at: daysAgo(40),
  updated_at: daysAgo(1),
};

const rejectedCandidateProfile: FixtureRow = {
  ...candidateProfile,
  id: REJECTED_CANDIDATE_USER_ID,
  user_id: REJECTED_CANDIDATE_USER_ID,
  email: "sam.rivera@example.com",
  full_name: "Sam Rivera",
  job_title: "Server",
  skills: ["Customer service"],
  experience_years: 0,
};

// -------------------------------------------------------------------- jobs

const workflowSteps = [
  { id: STEP_TYPING, type: "typing_test", title: "Register speed check" },
  { id: STEP_VIDEO, type: "video_intro", title: "Say hello" },
  { id: STEP_CHAT_SIM, type: "chat_simulation", title: "Handle a rush-hour order" },
  { id: STEP_CHAT_INTERVIEW, type: "chat_interview", title: "Chat with the team" },
  { id: STEP_SALES, type: "sales_simulation", title: "Upsell a pastry" },
  { id: STEP_VOICE, type: "voice_interview", title: "Voice interview" },
  { id: STEP_PORTFOLIO, type: "portfolio_upload", title: "Show your latte art" },
];

const jobBarista: FixtureRow = {
  id: JOB_BARISTA_ID,
  employer_id: EMPLOYER_USER_ID,
  title: "Barista",
  description: "Pull shots, steam milk, and keep the morning rush moving at our Elm Street location.",
  requirements: "Prior café experience preferred, not required.",
  responsibilities: "Prepare drinks, operate the register, keep the bar clean and stocked.",
  location: "Springfield, IL",
  location_city: "Springfield",
  location_region: "IL",
  location_country: "United States",
  location_country_code: "US",
  locations: null,
  latitude: null,
  longitude: null,
  is_remote: false,
  job_type: "part_time",
  department: "Café",
  experience_level: "entry",
  salary_min: 15,
  salary_max: 18,
  salary_currency: "USD",
  salary_period: "hour",
  benefits: ["Free shift drinks", "Flexible schedule"],
  skills_required: ["Customer service", "Cash handling"],
  status: "published",
  job_code: "BARISTA-ELM",
  application_deadline: null,
  application_questions: [],
  quiz_questions: [
    { id: "q1", question: "What temperature should milk be steamed to for a latte?", options: ["120°F", "150°F", "180°F", "200°F"], correctIndex: 1 },
    { id: "q2", question: "A customer says their order is wrong. First step?", options: ["Argue", "Apologize and fix it", "Ignore them", "Call a manager immediately"], correctIndex: 1 },
  ],
  workflow_steps: workflowSteps,
  workflow_difficulty: "standard",
  required_wpm: 25,
  passing_score: 70,
  processing_mode: "automatic",
  exclude_from_feed: false,
  ai_bias_score: 92,
  ai_bias_feedback: null,
  created_at: daysAgo(60),
  updated_at: daysAgo(2),
};

const jobServer: FixtureRow = {
  ...jobBarista,
  id: JOB_SERVER_ID,
  title: "Server",
  description: "Take orders, run food, and keep tables turning during lunch and dinner service.",
  job_type: "full_time",
  salary_min: 14,
  salary_max: 16,
  job_code: "SERVER-ELM",
  workflow_steps: [
    { id: "wf-server-chatsim", type: "chat_simulation", title: "Handle a busy table" },
    { id: "wf-server-sales", type: "sales_simulation", title: "Recommend a special" },
  ],
  quiz_questions: [],
  created_at: daysAgo(50),
  updated_at: daysAgo(5),
};

const jobCashierDraft: FixtureRow = {
  ...jobBarista,
  id: JOB_CASHIER_DRAFT_ID,
  title: "Cashier",
  description: "Register and front-counter support for our weekend rush.",
  status: "draft",
  job_code: null,
  workflow_steps: [],
  quiz_questions: [],
  created_at: daysAgo(3),
  updated_at: daysAgo(1),
};

const jobShiftLeadClosed: FixtureRow = {
  ...jobBarista,
  id: JOB_SHIFT_LEAD_CLOSED_ID,
  title: "Shift Lead",
  description: "Opening/closing shift lead for the Elm Street location. Position filled.",
  status: "closed",
  job_code: "LEAD-ELM",
  salary_min: 18,
  salary_max: 22,
  created_at: daysAgo(120),
  updated_at: daysAgo(20),
};

const jobs = [jobBarista, jobServer, jobCashierDraft, jobShiftLeadClosed];
const jobsById = new Map(jobs.map((j) => [j.id as string, j]));

// ------------------------------------------------------------ applications

function makeApplication(overrides: FixtureRow): FixtureRow {
  const jobId = overrides.job_id as string;
  return {
    ai_analysis: null,
    ai_score: null,
    ai_scorecard: null,
    candidate_id: CANDIDATE_USER_ID,
    cover_letter: null,
    created_at: daysAgo(10),
    employer_notes: null,
    external_application_id: null,
    external_provider: null,
    notes: null,
    phase: null,
    phase_ai_analysis: null,
    rejected_by: null,
    rejected_by_type: null,
    resume_score: null,
    resume_url: candidateProfile.resume_url,
    source: "direct",
    status: "pending",
    updated_at: daysAgo(1),
    voice_interview_duration: null,
    voice_interview_language: null,
    voice_interview_language_rule: null,
    voice_interview_recording_url: null,
    voice_interview_result: null,
    voice_interview_transcript: null,
    voice_interview_video_enabled: false,
    ...overrides,
    // Pre-baked join — real hooks `.select("*, jobs(*)")` / `!inner(*)`
    // expect this nested object; the fixture query builder does not parse
    // select strings, so it must already be on the row.
    jobs: jobsById.get(jobId) ?? null,
  };
}

const appNotYet = makeApplication({
  id: APP_NOT_YET_ID,
  job_id: JOB_BARISTA_ID,
  phase: "application",
  status: "pending",
  created_at: daysAgo(1),
  ai_score: 78,
  resume_score: 78,
});

const appQuiz = makeApplication({
  id: APP_QUIZ_ID,
  job_id: JOB_BARISTA_ID,
  phase: "quiz",
  status: "reviewing",
  created_at: daysAgo(6),
  ai_score: 81,
  resume_score: 81,
});

const appTyping = makeApplication({
  id: APP_TYPING_ID,
  job_id: JOB_BARISTA_ID,
  phase: STEP_TYPING,
  status: "reviewing",
  created_at: daysAgo(7),
  ai_score: 74,
});

const appVideo = makeApplication({
  id: APP_VIDEO_ID,
  job_id: JOB_BARISTA_ID,
  phase: STEP_VIDEO,
  status: "reviewing",
  created_at: daysAgo(8),
  ai_score: 80,
});

const appChatSim = makeApplication({
  id: APP_CHAT_SIM_ID,
  job_id: JOB_BARISTA_ID,
  phase: STEP_CHAT_SIM,
  status: "reviewing",
  created_at: daysAgo(9),
  ai_score: 83,
});

const appChatInterview = makeApplication({
  id: APP_CHAT_INTERVIEW_ID,
  job_id: JOB_BARISTA_ID,
  phase: STEP_CHAT_INTERVIEW,
  status: "reviewing",
  created_at: daysAgo(11),
  ai_score: 86,
});

const appSales = makeApplication({
  id: APP_SALES_ID,
  job_id: JOB_BARISTA_ID,
  phase: STEP_SALES,
  status: "reviewing",
  created_at: daysAgo(12),
  ai_score: 88,
});

const appVoice = makeApplication({
  id: APP_VOICE_ID,
  job_id: JOB_BARISTA_ID,
  phase: STEP_VOICE,
  status: "interview",
  created_at: daysAgo(14),
  ai_score: 90,
});

const appPortfolio = makeApplication({
  id: APP_PORTFOLIO_ID,
  job_id: JOB_BARISTA_ID,
  phase: STEP_PORTFOLIO,
  status: "interview",
  created_at: daysAgo(15),
  ai_score: 91,
});

const appOffered = makeApplication({
  id: APP_OFFERED_ID,
  job_id: JOB_SERVER_ID,
  phase: "decision",
  status: "offered",
  created_at: daysAgo(18),
  ai_score: 89,
  employer_notes: "Great energy in the chat simulation — extending an offer.",
});

const appHired = makeApplication({
  id: APP_HIRED_ID,
  job_id: JOB_SHIFT_LEAD_CLOSED_ID,
  phase: "decision",
  status: "hired",
  created_at: daysAgo(45),
  ai_score: 94,
});

const appRejected = makeApplication({
  id: APP_REJECTED_ID,
  job_id: JOB_SERVER_ID,
  candidate_id: REJECTED_CANDIDATE_USER_ID,
  phase: STEP_SALES,
  status: "rejected",
  created_at: daysAgo(20),
  ai_score: 38,
  resume_score: 45,
  rejected_by: EMPLOYER_USER_ID,
  rejected_by_type: "user",
  employer_notes: "Not enough food-service experience for this role right now.",
  phase_ai_analysis:
    "Scored low on the upsell scenario — didn't mention any menu items or ask follow-up questions. " +
    "Worth practicing a few sample customer conversations before applying to serving roles again.",
});

const applications = [
  appNotYet,
  appQuiz,
  appTyping,
  appVideo,
  appChatSim,
  appChatInterview,
  appSales,
  appVoice,
  appPortfolio,
  appOffered,
  appHired,
  appRejected,
];

// -------------------------------------------------------------- interviews

const interviews: FixtureRow[] = [
  {
    id: INTERVIEW_UPCOMING_ID,
    application_id: APP_VOICE_ID,
    scheduled_at: daysFromNow(2),
    status: "scheduled",
    candidate_response: "accepted",
    meeting_link: null,
    meeting_provider: "daily",
    meeting_room_name: "preview-room",
    meeting_room_url: null,
    duration_minutes: 15,
    interview_type: "voice",
    proposed_times: null,
    candidate_note: null,
    ai_questions: null,
    ai_feedback: null,
    notes: null,
    created_at: daysAgo(3),
    updated_at: daysAgo(1),
  },
  {
    id: INTERVIEW_COMPLETED_ID,
    application_id: APP_OFFERED_ID,
    scheduled_at: daysAgo(5),
    status: "completed",
    candidate_response: "accepted",
    meeting_link: null,
    meeting_provider: "daily",
    meeting_room_name: "preview-room-2",
    meeting_room_url: null,
    duration_minutes: 20,
    interview_type: "voice",
    proposed_times: null,
    candidate_note: null,
    ai_questions: null,
    ai_feedback: "Confident, specific answers about handling a rush.",
    notes: null,
    created_at: daysAgo(8),
    updated_at: daysAgo(5),
  },
];

// -------------------------------------------------------------- documents

function makeDocument(overrides: FixtureRow): FixtureRow {
  const applicationId = overrides.application_id as string;
  const app = applications.find((a) => a.id === applicationId) ?? null;
  return {
    candidate_signature_data: null,
    candidate_signed_at: null,
    completion_certificate: null,
    created_at: daysAgo(4),
    decline_reason: null,
    declined_at: null,
    document_code: `DOC-${String(overrides.id).slice(0, 8).toUpperCase()}`,
    document_hash: null,
    document_type: "offer_letter",
    employer_signature_data: null,
    employer_signed_at: null,
    expires_at: null,
    file_url: "https://example.com/fixtures/offer-letter.pdf",
    final_pdf_hash: null,
    ip_address: null,
    is_locked: false,
    is_voided: false,
    locked_at: null,
    name: "Offer Letter",
    package_id: null,
    recipient_id: CANDIDATE_USER_ID,
    reminder_sent_at: null,
    sender_id: EMPLOYER_USER_ID,
    signature_data: null,
    signed_at: null,
    signing_order: "employer_first",
    status: "pending",
    user_agent: null,
    v1_hash: null,
    v2_hash: null,
    v3_hash: null,
    version_number: 1,
    viewed_at: null,
    voided_at: null,
    voided_reason: null,
    ...overrides,
    applications: app
      ? { id: app.id, candidate_id: app.candidate_id, jobs: app.jobs }
      : null,
  };
}

const documents: FixtureRow[] = [
  makeDocument({
    id: DOC_PENDING_EMPLOYER_ID,
    application_id: APP_OFFERED_ID,
    name: "Offer Letter — Server",
    document_type: "offer_letter",
    status: "pending",
    signing_order: "employer_first",
  }),
  makeDocument({
    id: DOC_PENDING_CANDIDATE_ID,
    application_id: APP_VOICE_ID,
    name: "Handbook Acknowledgment",
    document_type: "handbook_acknowledgment",
    status: "pending",
    signing_order: "employer_first",
    employer_signed_at: daysAgo(2),
    employer_signature_data: "Maria Alvarado",
  }),
  makeDocument({
    id: DOC_SIGNED_ID,
    application_id: APP_HIRED_ID,
    name: "Offer Letter — Shift Lead",
    document_type: "offer_letter",
    status: "signed",
    employer_signed_at: daysAgo(20),
    employer_signature_data: "Maria Alvarado",
    candidate_signed_at: daysAgo(19),
    candidate_signature_data: "Sam Rivera",
    signed_at: daysAgo(19),
    is_locked: true,
    locked_at: daysAgo(19),
  }),
  makeDocument({
    id: DOC_DECLINED_ID,
    application_id: APP_REJECTED_ID,
    name: "Offer Letter — Server",
    document_type: "offer_letter",
    status: "declined",
    employer_signed_at: daysAgo(18),
    employer_signature_data: "Maria Alvarado",
    declined_at: daysAgo(17),
    decline_reason: "Accepted a different offer.",
  }),
];

// ---------------------------------------------------------------- messages

const messages: FixtureRow[] = [
  {
    id: "60000000-0000-4000-8000-000000000001",
    application_id: APP_VOICE_ID,
    sender_id: CANDIDATE_USER_ID,
    receiver_id: EMPLOYER_USER_ID,
    content: "Hi! Just confirming I'll be there for the voice interview Thursday.",
    is_read: true,
    file_name: null,
    file_size: null,
    file_type: null,
    file_url: null,
    created_at: daysAgo(2),
  },
  {
    id: "60000000-0000-4000-8000-000000000002",
    application_id: APP_VOICE_ID,
    sender_id: EMPLOYER_USER_ID,
    receiver_id: CANDIDATE_USER_ID,
    content: "Sounds great, see you then!",
    is_read: true,
    file_name: null,
    file_size: null,
    file_type: null,
    file_url: null,
    created_at: daysAgo(2),
  },
  {
    id: "60000000-0000-4000-8000-000000000003",
    application_id: APP_OFFERED_ID,
    sender_id: EMPLOYER_USER_ID,
    receiver_id: REJECTED_CANDIDATE_USER_ID,
    content: "Thanks for your patience while we finish reviewing servers this week.",
    is_read: false,
    file_name: null,
    file_size: null,
    file_type: null,
    file_url: null,
    created_at: daysAgo(1),
  },
];

// ------------------------------------------------------------------- team

const teamMembers: FixtureRow[] = [
  {
    id: "70000000-0000-4000-8000-000000000001",
    user_id: TEAM_MEMBER_USER_ID,
    employer_id: EMPLOYER_USER_ID,
    email: teamMemberProfile.email,
    name: teamMemberProfile.full_name,
    status: "active",
    permission_level: "full",
    can_manage_pipeline: true,
    can_create_jobs: true,
    can_delete_jobs: false,
    can_message_candidates: true,
    can_schedule_interviews: true,
    can_send_documents: true,
    assigned_job_ids: null,
    department: "Café",
    invitation_id: null,
    joined_at: daysAgo(90),
    onboarding_completed: true,
    revoked_at: null,
    created_at: daysAgo(95),
    updated_at: daysAgo(90),
  },
];

const teamInvitations: FixtureRow[] = [
  {
    id: "70000000-0000-4000-8000-000000000002",
    inviter_id: EMPLOYER_USER_ID,
    invitee_email: "priya@mariascafe.example",
    invitee_name: "Priya Nair",
    status: "pending",
    permission_level: "limited",
    can_manage_pipeline: true,
    can_create_jobs: false,
    can_delete_jobs: false,
    can_message_candidates: true,
    can_schedule_interviews: true,
    can_send_documents: false,
    assigned_job_ids: null,
    department: "Café",
    invite_code: "PREVIEW-CODE",
    expires_at: daysFromNow(5),
    created_at: daysAgo(1),
  },
];

// ------------------------------------------------------------- user_roles

const userRoles: FixtureRow[] = [
  { id: "80000000-0000-4000-8000-000000000001", user_id: EMPLOYER_USER_ID, role: "employer", created_at: daysAgo(220) },
  { id: "80000000-0000-4000-8000-000000000002", user_id: TEAM_MEMBER_USER_ID, role: "team_member", created_at: daysAgo(95) },
  { id: "80000000-0000-4000-8000-000000000003", user_id: CANDIDATE_USER_ID, role: "candidate", created_at: daysAgo(40) },
  { id: "80000000-0000-4000-8000-000000000004", user_id: REJECTED_CANDIDATE_USER_ID, role: "candidate", created_at: daysAgo(30) },
];

// ----------------------------------------------------------- subscriptions

const subscriptions: FixtureRow[] = [
  {
    id: "90000000-0000-4000-8000-000000000001",
    user_id: EMPLOYER_USER_ID,
    plan_type: "free",
    status: "trialing",
    amount: 0,
    currency: "usd",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    current_period_start: daysAgo(10),
    current_period_end: daysFromNow(20),
    trial_start: daysAgo(10),
    trial_end: daysFromNow(20),
    cancel_at_period_end: false,
    onboarding_completed: true,
    voice_low_balance_notified_at: null,
    created_at: daysAgo(10),
    updated_at: daysAgo(1),
  },
];

// ------------------------------------------------------------ notifications

function notification(id: string, userId: string, overrides: FixtureRow): FixtureRow {
  return {
    id,
    user_id: userId,
    is_read: false,
    link: null,
    created_at: daysAgo(1),
    ...overrides,
  };
}

const notifications: FixtureRow[] = [
  notification("a0000000-0000-4000-8000-000000000001", EMPLOYER_USER_ID, {
    type: "application",
    title: "New application",
    message: "Jordan Alvarez applied to Barista.",
    link: `/applicants/${APP_NOT_YET_ID}`,
  }),
  notification("a0000000-0000-4000-8000-000000000002", CANDIDATE_USER_ID, {
    type: "interview",
    title: "Interview scheduled",
    message: "Your voice interview for Barista is set for Thursday.",
    link: `/applications/${APP_VOICE_ID}`,
    is_read: true,
  }),
];

// ---------------------------------------------------- employer branding /
// -------------------------------------------------- published jobs (public)

const employerPublicBranding: FixtureRow[] = [
  { user_id: EMPLOYER_USER_ID, company_name: "Maria's Café", company_logo: null },
];

const publishedJobsPublic: FixtureRow[] = jobs
  .filter((j) => j.status === "published")
  .map((j) => ({ ...j }));

// --------------------------------------------------------------- exports

export function buildFixtureTables(): FixtureTables {
  return {
    profiles: [employerProfile, teamMemberProfile, candidateProfile, rejectedCandidateProfile].map((r) => ({ ...r })),
    jobs: jobs.map((r) => ({ ...r })),
    applications: applications.map((r) => ({ ...r })),
    interviews: interviews.map((r) => ({ ...r })),
    documents: documents.map((r) => ({ ...r })),
    document_packages: [],
    document_requests: [],
    document_audit_logs: [],
    messages: messages.map((r) => ({ ...r })),
    team_members: teamMembers.map((r) => ({ ...r })),
    team_invitations: teamInvitations.map((r) => ({ ...r })),
    user_roles: userRoles.map((r) => ({ ...r })),
    subscriptions: subscriptions.map((r) => ({ ...r })),
    notifications: notifications.map((r) => ({ ...r })),
    employer_public_branding: employerPublicBranding.map((r) => ({ ...r })),
    published_jobs_public: publishedJobsPublic.map((r) => ({ ...r })),
    activity: [],
    kpis: [],
    candidates: [],
    candidate_details: [],
    blueprint_purchases: [],
    portfolios: [],
    videos: [],
    resumes: [],
    push_subscriptions: [],
  };
}

export const fixtureRpcHandlers: Record<string, (args: unknown) => unknown> = {
  get_job_quiz_keys: () => [],
  assign_user_role: () => ({ success: true }),
  accept_team_invitation: () => ({ success: true }),
  submit_quiz_attempt: () => ({ success: true, score: 85, passed: true }),
  submit_voice_interview_manual_end: () => ({ success: true }),
};

export { EMPLOYER_USER_ID, TEAM_MEMBER_USER_ID, CANDIDATE_USER_ID, REJECTED_CANDIDATE_USER_ID } from "./ids";
