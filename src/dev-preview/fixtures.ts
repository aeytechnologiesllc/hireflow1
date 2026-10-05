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
  APP_ZULU_DONE_ID,
  APP_ZULU_FORM_ID,
  APP_ZULU_TESTING_ID,
  APP_ZULU_LEFT_ID,
  APP_ZULU_RETAKE_ID,
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
  JOB_FRESH_ID,
  REJECTED_CANDIDATE_USER_ID,
  STEP_CHAT_INTERVIEW,
  STEP_CHAT_SIM,
  STEP_PORTFOLIO,
  STEP_SALES,
  STEP_TYPING,
  STEP_VIDEO,
  STEP_VOICE,
  TEAM_MEMBER_USER_ID,
  ZULU_DONE_USER_ID,
  ZULU_FORM_USER_ID,
  ZULU_TESTING_USER_ID,
  ZULU_LEFT_USER_ID,
  ZULU_RETAKE_USER_ID,
} from "./ids";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * DAY).toISOString();
const daysFromNow = (n: number) => new Date(now + n * DAY).toISOString();
const minutesAgo = (n: number) => new Date(now - n * 60 * 1000).toISOString();

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

// ---------------------------------------------------- "fresh" scenario
// One live remote role with nobody in it yet: the state a real account is in
// the day its first job goes out (Zulu Support Team, 2026-10-05). Same
// employer user as the café scenario, so the auth and role plumbing is
// unchanged; only the tables differ. Open it with `__previewScenario=fresh`.

const freshEmployerProfile: FixtureRow = {
  ...employerProfile,
  email: "owner@zulu-support.example",
  full_name: "Zack",
  company_name: "Zulu Support Team",
  company_description: "Player support for Zulu Royal and Zulu Rush.",
  company_address: null,
};

const freshJob: FixtureRow = {
  ...jobBarista,
  id: JOB_FRESH_ID,
  title: "Customer Support Chat Agent (Zulu Royal & Zulu Rush)",
  description:
    "Zulu runs player support for Zulu Royal and Zulu Rush, two online sweepstakes game platforms with players " +
    "across the United States. Players write to us in chat when they have questions about buying, cashing out, " +
    "their account or a game. You answer them in writing: clearly, kindly and accurately. Every conversation is " +
    "written, so you will never be on the phone. You will learn our rules for payments, cash-outs and accounts, " +
    "and you will know when to pass a case to a manager instead of promising something you cannot do. Shifts " +
    "cover days, evenings, overnight and weekends.",
  location: "Remote (worldwide)",
  location_city: null,
  location_region: null,
  location_country: null,
  location_country_code: null,
  is_remote: true,
  job_type: "full-time",
  department: "Support",
  salary_min: null,
  salary_max: null,
  salary_period: "YEAR",
  benefits: [],
  job_code: "JOB-C84E85",
  workflow_steps: [
    { id: "step_typing", type: "typing_test", title: "Typing speed and accuracy" },
    { id: "step_chat", type: "chat_simulation", title: "Player chat practice" },
    { id: "step_interview", type: "chat_interview", title: "Written interview" },
  ],
  quiz_questions: Array.from({ length: 10 }, (_, i) => ({
    id: `fresh-q${i + 1}`,
    question: `Player situation ${i + 1}`,
    options: ["A", "B", "C", "D"],
    correctIndex: 0,
  })),
  required_wpm: 45,
  passing_score: 60,
  processing_mode: "auto",
  created_at: daysAgo(1),
  updated_at: daysAgo(1),
};

/** Daily candidate-side visits for the traffic RPC, oldest first. */
function trafficRows(days: number, perDay: (i: number) => [number, number, number]) {
  return Array.from({ length: days }, (_, i) => {
    const [careers, job, apply] = perDay(i);
    return {
      day: new Date(now - (days - 1 - i) * DAY).toISOString().slice(0, 10),
      careers_views: careers,
      job_views: job,
      apply_views: apply,
    };
  });
}

function buildFreshTables(): FixtureTables {
  return {
    ...buildCafeTables(),
    profiles: [freshEmployerProfile, teamMemberProfile].map((r) => ({ ...r })),
    jobs: [{ ...freshJob }],
    applications: [],
    interviews: [],
    documents: [],
    messages: [],
    team_members: [],
    team_invitations: [],
    notifications: [],
    employer_public_branding: [{ user_id: EMPLOYER_USER_ID, company_name: "Zulu Support Team", company_logo: null }],
    published_jobs_public: [{ ...freshJob }],
  };
}


// ---------------------------------------------------- "zulu" scenario
// The Zulu chat-agent role the way the owner's own test run left it on
// 2026-10-05, so the staff record ("What they submitted" and its sheets) can
// be reviewed offline: one applicant through every step (shaped key for key
// like that run's notes, invented people and words), one part-way through the
// tests, and one who has only pressed Apply. `applying` keeps just the last
// one, the "a lone applicant who has just started" state.

const ZULU_QUIZ = [
  { q: "A player says a $50 payment sent 20 minutes ago is not showing. Your first reply?", cat: "payments", opts: ["Payments can take three business days.", "Sorry for the wait, I'll find it. Which name and exact amount did you send?", "Send me your bank login so I can check.", "That isn't something I can help with."], right: 1 },
  { q: "A player can cash out money still sitting in entries.", cat: "money_rules", opts: ["True", "False"], right: 1, tf: true },
  { q: "A cash-out has been pending three hours and the player threatens a bad review. Best reply?", cat: "cash_outs", opts: ["I'll push it through now.", "It's in the review queue, handled in order, usually within a day. I'll confirm it's queued.", "Reviews don't scare us.", "Try again tomorrow."], right: 1 },
  { q: "Support can see and change game results.", cat: "games", opts: ["True", "False"], right: 1, tf: true },
  { q: "A player asks for a bonus because they've played a lot. You:", cat: "bonuses", opts: ["Explain what's running now and pass the request on.", "Give one yourself.", "Say bonuses don't exist.", "Ignore it."], right: 0 },
  { q: "Someone asks you to unlock an account they don't own. You:", cat: "accounts", opts: ["Refuse and explain one account per person.", "Unlock it if they're polite.", "Ask for the owner's password.", "Unlock it for a fee."], right: 0 },
  { q: "A player is upset and typing in capitals. The first thing to do is:", cat: "tone", opts: ["Ask them to stop shouting.", "Close the chat.", "Acknowledge it, then ask one clear question.", "Send the rules page."], right: 2 },
  { q: "You should ever ask a player for a full card number.", cat: "security", opts: ["True", "False"], right: 1, tf: true },
  { q: "A player wants to take a break from playing. You:", cat: "player_care", opts: ["Show them how to set a limit or pause.", "Offer a bonus to stay.", "Tell them to log out.", "Say you can't help."], right: 0 },
  { q: "A loyal player asks for something you can't give. Best reply?", cat: "bonuses", opts: ["No.", "I can't add that myself, but here's what's running and I'll pass your request on.", "Maybe next week.", "Ask a friend."], right: 1 },
];

const zuluQuizQuestions = ZULU_QUIZ.map((x, i) => ({
  id: `zq${i + 1}`,
  type: x.tf ? "true_false" : "multiple_choice",
  category: x.cat,
  question: x.q,
  options: x.opts,
  time_limit_seconds: x.tf ? 30 : 60,
}));

const zuluJob: FixtureRow = {
  ...freshJob,
  application_questions: [
    { id: "q1", type: "text", question: "Full name", required: true },
    { id: "q2", type: "email", question: "Email address", required: true },
    { id: "q3", type: "tel", question: "Phone number (WhatsApp if you have it)", required: true },
    { id: "q4", type: "text", question: "Country and city you will work from", required: true },
    {
      id: "q5",
      type: "multi_select",
      question: "Which shifts can you cover, in US Eastern time? Pick every one that works.",
      options: ["Daytime, 8am to 4pm Eastern", "Evening, 4pm to midnight Eastern", "Overnight, midnight to 8am Eastern", "Weekends (Saturday and Sunday)"],
      required: true,
    },
    { id: "q6", type: "select", question: "How many hours a week can you work?", options: ["Under 20", "20 to 30", "30 to 40", "40 or more"], required: true },
    { id: "q9", type: "textarea", question: "Describe any customer support or chat support experience you have.", required: true },
    { id: "q10", type: "textarea", question: "Why do you want this job, and what makes you good with upset people?", required: true },
    { id: "q11", type: "file", question: "Screenshot of a speed test (fast.com or speedtest.net)", required: false },
  ],
  quiz_questions: zuluQuizQuestions,
  workflow_steps: [
    { id: "step_typing", type: "typing_test", title: "Typing speed and accuracy", config: { min_wpm: 45, min_accuracy_percent: 95 } },
    {
      id: "step_chat",
      type: "chat_simulation",
      title: "Player chat practice",
      config: {
        scenarios: [
          {
            id: "zulu-rigged",
            customerName: "Devin",
            scenario:
              "Devin lost $200 tonight, says the game is rigged, and wants all of his money back. What you know: results are random and support cannot change or see them, and money that has been played cannot be refunded. You can show him how to set a spending limit or take a break.",
          },
        ],
      },
    },
    { id: "step_interview", type: "chat_interview", title: "Written interview" },
  ],
};

function zuluProfile(id: string, email: string, fullName: string): FixtureRow {
  return { ...candidateProfile, id, user_id: id, email, full_name: fullName, resume_url: null, skills: null, bio: null, job_title: null, experience_years: null };
}

const zuluProfiles = [
  zuluProfile(ZULU_DONE_USER_ID, "robin.okafor@example.com", "Robin Okafor"),
  zuluProfile(ZULU_FORM_USER_ID, "dana.whitfield@example.com", "Dana Whitfield"),
  zuluProfile(ZULU_TESTING_USER_ID, "sam.osei@example.com", "Sam Osei"),
  zuluProfile(ZULU_LEFT_USER_ID, "lena.park@example.com", "Lena Park"),
  zuluProfile(ZULU_RETAKE_USER_ID, "jordan.reyes@example.com", "Jordan Reyes"),
];

function makeZuluApplication(overrides: FixtureRow): FixtureRow {
  return { ...makeApplication({ ...overrides, job_id: JOB_FRESH_ID, resume_url: null }), jobs: zuluJob };
}

/** Picks the right answer for every question but the ones listed. */
function zuluQuizRecord(wrong: number[], completedAt: string) {
  const answers = zuluQuizQuestions.map((q, i) => {
    const pick = wrong.includes(i) ? (ZULU_QUIZ[i].right + 1) % q.options.length : ZULU_QUIZ[i].right;
    return {
      question: q.question,
      isCorrect: !wrong.includes(i),
      questionId: q.id,
      questionType: "multiple_choice",
      selectedAnswer: pick,
      selectedAnswerText: q.options[pick],
    };
  });
  const correct = answers.filter((a) => a.isCorrect).length;
  const score = Math.round((correct / answers.length) * 100);
  return {
    quiz: {
      type: "quiz",
      score,
      total: answers.length,
      passed: score >= 60,
      correct,
      answers,
      completedAt,
      totalViolations: 0,
      violationSummary: "No violations detected",
      antiCheatViolations: [],
    },
    quizResult: { score, total: answers.length, passed: score >= 60, correct },
  };
}

const zuluStartedAt = now - 26 * 60 * 1000;
const at = (min: number, sec = 0) => new Date(zuluStartedAt + (min * 60 + sec) * 1000).toISOString();

const zuluDoneNotes = {
  ...zuluQuizRecord([], at(6, 24)),
  applicationAnswers: [
    { type: "text", answer: "Robin Okafor", question: "Full name", questionId: "q1" },
    { type: "email", answer: "robin.okafor@example.com", question: "Email address", questionId: "q2" },
    { type: "tel", answer: "+1 555 010 4477", question: "Phone number (WhatsApp if you have it)", questionId: "q3" },
    { type: "text", answer: "Accra, Ghana", question: "Country and city you will work from", questionId: "q4" },
    {
      type: "multi_select",
      answer: "Daytime, 8am to 4pm Eastern; Weekends (Saturday and Sunday)",
      selected: ["Daytime, 8am to 4pm Eastern", "Weekends (Saturday and Sunday)"],
      question: "Which shifts can you cover, in US Eastern time? Pick every one that works.",
      questionId: "q5",
    },
    { type: "select", answer: "40 or more", question: "How many hours a week can you work?", questionId: "q6" },
    {
      type: "textarea",
      answer: "Two years of chat support for a mobile carrier, mostly billing questions and SIM swaps.",
      question: "Describe any customer support or chat support experience you have.",
      questionId: "q9",
    },
    {
      type: "textarea",
      answer: "I stay calm when people are upset and I like fixing the actual problem, not just apologising.",
      question: "Why do you want this job, and what makes you good with upset people?",
      questionId: "q10",
    },
    {
      type: "file",
      answer: `${ZULU_DONE_USER_ID}/1759678000000_q11.png`,
      question: "Screenshot of a speed test (fast.com or speedtest.net)",
      questionId: "q11",
    },
  ],
  fileUploads: {
    q11: { url: `${ZULU_DONE_USER_ID}/1759678000000_q11.png`, imageUrls: [`${ZULU_DONE_USER_ID}/1759678000000_q11.png`], isResume: false },
  },
  typingTestResult: { wpm: 38, accuracy: 85, score: 72, passed: false, requiredWpm: 45, tabSwitches: 0, violations: [] },
  step_typing: { type: "typing_test", wpm: 38, accuracy: 85, score: 72, passed: false, requiredWpm: 45, tabSwitches: 0, violations: [], completedAt: at(8, 21) },
  chatSimulationResult: {
    scenario:
      "Devin lost $200 tonight, says the game is rigged, and wants all of his money back. What you know: results are random and support cannot change or see them, and money that has been played cannot be refunded. You can show him how to set a spending limit or take a break.",
    messageCount: 11,
    score: 18,
    empathy: 15,
    problemSolving: 12,
    strengths: ["Apologised for how he was feeling early on", "Offered to pause the account in the end"],
    improvements: [
      "Never suggest another deposit to someone asking for help to stop",
      "Say plainly that results are random and support cannot see or change them",
      "Walk him through setting a limit instead of promising it will be okay",
    ],
    completed: true,
    antiCheatSummary: { hasViolations: true, violationCount: 3, tabSwitches: 2, copyPasteAttempts: 1 },
  },
  chatInterviewResult: {
    messages: [
      { role: "assistant", content: "Welcome, Robin. What interests you most about supporting players for this team?", timestamp: at(14, 2) },
      { role: "user", content: "I like the energy of the players and I've played these games myself, so I get how they feel.", timestamp: at(15, 10) },
      { role: "assistant", content: "Tell me about a time you handled a customer who was upset about money.", timestamp: at(15, 31) },
      { role: "user", content: "A customer was double charged. I said sorry and told them it would be fixed.", timestamp: at(16, 40) },
      { role: "assistant", content: "What did you do to get it fixed, step by step?", timestamp: at(16, 58) },
      { role: "user", content: "I passed it to billing and told them to wait.", timestamp: at(17, 44) },
      { role: "assistant", content: "A player says their cash-out is late and they need it for rent. What do you write?", timestamp: at(18, 5) },
      { role: "user", content: "I would tell them to take a break and come back when they feel better.", timestamp: at(19, 12) },
      { role: "assistant", content: "Thanks, Robin — that's everything from me. You'll hear back soon.", timestamp: at(19, 30) },
    ],
    duration: "5:28",
    questionCount: 4,
    violations: [
      { type: "tab_switch", timestamp: at(14, 1), details: "Window lost focus" },
      { type: "tab_switch", timestamp: at(14, 9), details: "Window lost focus" },
      { type: "tab_switch", timestamp: at(18, 40), details: "Window lost focus" },
    ],
    evaluation: {
      score: 25,
      strengths: ["Kind, calm tone", "Perfect score on the rules quiz"],
      concerns: [
        "Answers were general; no step-by-step way of resolving a cash-out problem",
        "Steered an upset player towards taking a break instead of answering the question",
        "Typing came in at 38 WPM against the 45 the job asks for",
      ],
      inconsistencies: [
        {
          claim: "Says they fix the actual problem, not just apologise.",
          evidence: "In both money questions the answer was an apology and a hand-off.",
          assessment: "Not supported by what they wrote here; worth asking for a real example.",
        },
        {
          claim: "Two years of chat support.",
          evidence: "No detail on tools, volume or escalation steps when asked.",
          assessment: "May be real, but nothing in the interview shows it.",
        },
      ],
      credibilityRating: "Medium",
      recommendation: "No Hire",
      summary: "Friendly and calm, strong on the rules, but the answers stayed general and did not show ownership of a player's problem.",
    },
  },
  _trusted: {
    step_typing: { stepType: "typing_test", completedAt: at(8, 21) },
    step_chat: { stepType: "chat_simulation", completedAt: at(12, 27) },
    step_interview: { stepType: "chat_interview", completedAt: at(19, 40) },
  },
};

const appZuluDone = makeZuluApplication({
  id: APP_ZULU_DONE_ID,
  candidate_id: ZULU_DONE_USER_ID,
  status: "reviewing",
  phase: "step_interview",
  created_at: new Date(zuluStartedAt).toISOString(),
  updated_at: at(20, 0),
  ai_score: 34,
  notes: JSON.stringify(zuluDoneNotes),
  ai_analysis:
    "**OVERALL ASSESSMENT**\nSummary: Strong on the rules quiz and kind in tone, but the practice chat and the written interview showed little ownership of the player's problem, and typing came in under the bar.\n",
  ai_scorecard: {
    overallScore: 34,
    confidence: 70,
    recommendedAction: "reject",
    decisionState: "ready_for_decision",
    hardRejectReason: "Typing test result of 38 WPM is below the job's 45 WPM minimum.",
    transferableEvidence: ["States two years of chat support for a mobile carrier.", "Perfect score on the rules quiz."],
    riskFlags: [
      "Resume could not be analyzed",
      "Overall score is below the passing threshold",
      "Typing test result of 38 WPM is below the job's 45 WPM minimum.",
      "Completed chat practice scored 18/100 — very weak empathy and problem solving for a chat role.",
      "Written interview recommendation: No Hire.",
    ],
  },
});

const appZuluTesting = makeZuluApplication({
  id: APP_ZULU_TESTING_ID,
  candidate_id: ZULU_TESTING_USER_ID,
  status: "reviewing",
  // In the written interview right now (see the live attempt below).
  phase: "step_interview",
  created_at: minutesAgo(38),
  updated_at: minutesAgo(7),
  ai_score: 71,
  notes: JSON.stringify({
    ...zuluQuizRecord([2, 6], minutesAgo(31)),
    applicationAnswers: [
      { type: "text", answer: "Sam Osei", question: "Full name", questionId: "q1" },
      { type: "email", answer: "sam.osei@example.com", question: "Email address", questionId: "q2" },
      {
        type: "multi_select",
        answer: "Evening, 4pm to midnight Eastern; Overnight, midnight to 8am Eastern",
        selected: ["Evening, 4pm to midnight Eastern", "Overnight, midnight to 8am Eastern"],
        question: "Which shifts can you cover, in US Eastern time? Pick every one that works.",
        questionId: "q5",
      },
      { type: "select", answer: "30 to 40", question: "How many hours a week can you work?", questionId: "q6" },
    ],
    typingTestResult: { wpm: 52, accuracy: 96, score: 96, passed: false, requiredWpm: 45, tabSwitches: 0, violations: [] },
    step_typing: { type: "typing_test", wpm: 52, accuracy: 96, score: 96, passed: false, requiredWpm: 45, tabSwitches: 0, violations: [], completedAt: minutesAgo(26) },
    chatSimulationResult: {
      scenario: String((zuluJob.workflow_steps as Array<{ config?: { scenarios?: Array<{ scenario: string }> } }>)[1].config!.scenarios![0].scenario),
      messageCount: 9,
      score: 64,
      empathy: 70,
      problemSolving: 58,
      strengths: ["Named the spending limit and showed where to set it"],
      improvements: ["Say plainly that support cannot see or change results"],
      completed: true,
      antiCheatSummary: { hasViolations: false, violationCount: 0, tabSwitches: 0, copyPasteAttempts: 0 },
    },
    _trusted: {
      step_typing: { stepType: "typing_test", completedAt: minutesAgo(26) },
      step_chat: { stepType: "chat_simulation", completedAt: minutesAgo(8) },
    },
  }),
  ai_analysis: "Summary: Solid on the rules and the practice chat; the written interview is under way.",
  ai_scorecard: { overallScore: 71, recommendedAction: "review", decisionState: "needs_more_evidence", riskFlags: ["Resume could not be analyzed"] },
});

const appZuluLeft = makeZuluApplication({
  id: APP_ZULU_LEFT_ID,
  candidate_id: ZULU_LEFT_USER_ID,
  status: "pending",
  phase: "quiz",
  created_at: minutesAgo(44),
  updated_at: minutesAgo(33),
  ai_score: 58,
  notes: JSON.stringify({
    applicationAnswers: [
      { type: "text", answer: "Lena Park", question: "Full name", questionId: "q1" },
      { type: "email", answer: "lena.park@example.com", question: "Email address", questionId: "q2" },
      { type: "text", answer: "Manila, Philippines", question: "Country and city you will work from", questionId: "q4" },
      {
        type: "multi_select",
        answer: "Overnight, midnight to 8am Eastern",
        selected: ["Overnight, midnight to 8am Eastern"],
        question: "Which shifts can you cover, in US Eastern time? Pick every one that works.",
        questionId: "q5",
      },
      { type: "select", answer: "40 or more", question: "How many hours a week can you work?", questionId: "q6" },
    ],
  }),
  ai_analysis: "Summary: Covers the overnight shift the team needs most; the skills check is next.",
  ai_scorecard: { overallScore: 58, recommendedAction: "review", decisionState: "needs_more_evidence", riskFlags: ["Resume could not be analyzed"] },
});

// Jordan's chat practice was handed back for a retake (status pending, phase
// on the step): the first attempt's result is still in notes, the second
// attempt is being taken now.
const ZULU_CHAT_SCENARIO = String((zuluJob.workflow_steps as Array<{ config?: { scenarios?: Array<{ scenario: string }> } }>)[1].config!.scenarios![0].scenario);
const appZuluRetake = makeZuluApplication({
  id: APP_ZULU_RETAKE_ID,
  candidate_id: ZULU_RETAKE_USER_ID,
  status: "pending",
  phase: "step_chat",
  created_at: minutesAgo(3 * 60 + 10),
  updated_at: minutesAgo(9),
  ai_score: 49,
  notes: JSON.stringify({
    ...zuluQuizRecord([4], minutesAgo(3 * 60)),
    applicationAnswers: [
      { type: "text", answer: "Jordan Reyes", question: "Full name", questionId: "q1" },
      { type: "email", answer: "jordan.reyes@example.com", question: "Email address", questionId: "q2" },
      { type: "select", answer: "40 or more", question: "How many hours a week can you work?", questionId: "q6" },
    ],
    typingTestResult: { wpm: 49, accuracy: 96, score: 94, passed: false, requiredWpm: 45, tabSwitches: 0, violations: [] },
    step_typing: { type: "typing_test", wpm: 49, accuracy: 96, score: 94, passed: false, requiredWpm: 45, tabSwitches: 0, violations: [], completedAt: minutesAgo(2 * 60 + 50) },
    chatSimulationResult: {
      scenario: ZULU_CHAT_SCENARIO,
      messageCount: 6,
      score: 22,
      empathy: 25,
      problemSolving: 18,
      strengths: ["Stayed polite"],
      improvements: ["Answer the question he asked", "Do not promise a refund support cannot give"],
      completed: true,
      antiCheatSummary: { hasViolations: true, violationCount: 5, tabSwitches: 4, copyPasteAttempts: 1 },
    },
    _trusted: {
      step_typing: { stepType: "typing_test", completedAt: minutesAgo(2 * 60 + 50) },
      step_chat: { stepType: "chat_simulation", completedAt: minutesAgo(2 * 60 + 30) },
    },
  }),
  ai_analysis: "Summary: Quick and accurate typist; the first practice chat was rushed, so it was handed back for a second try.",
  ai_scorecard: { overallScore: 49, recommendedAction: "review", decisionState: "needs_more_evidence", riskFlags: ["Resume could not be analyzed"] },
});

const appZuluForm = makeZuluApplication({
  id: APP_ZULU_FORM_ID,
  candidate_id: ZULU_FORM_USER_ID,
  status: "in_progress",
  phase: "application",
  created_at: minutesAgo(5),
  updated_at: minutesAgo(5),
  notes: null,
});

// --------------------------------------- the test record (wave 2, sessions)
// What the server keeps of each attempt (docs/ASSESSMENT-RECORD.md): one
// assessment_sessions row per application × step × attempt, and its
// append-only assessment_events. Robin's five finished attempts carry the
// whole record (both chat transcripts, every quiz pick with its seconds, the
// typing snapshots against the passage, switches away with how long); Sam is
// in the written interview right now; Lena left the skills check at question
// 3 and closed the page; Dana is filling in the form (6 of 9 answered).

const ZULU_PASSAGE =
  "Customer service is about creating positive experiences for every client. Active listening, empathy, and clear communication are essential skills. A great support representative can turn a frustrated customer into a loyal advocate.";
const ROBIN_TYPED =
  "Customer service is about creating positive experiences for every client. Active listning, empathy, and clear comunication are esential skills. A great suport representative can turn a frustrated";

const sessionId = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function zuluSession(
  id: string,
  applicationId: string,
  candidateId: string,
  stepId: string,
  stepType: string,
  overrides: FixtureRow,
): FixtureRow {
  return {
    id,
    application_id: applicationId,
    job_id: JOB_FRESH_ID,
    candidate_id: candidateId,
    step_id: stepId,
    step_type: stepType,
    attempt: 1,
    status: "completed",
    end_reason: "submitted",
    last_heartbeat_at: null,
    hidden_at: null,
    progress: {},
    context: {},
    draft: null,
    grading: null,
    integrity_summary: {},
    event_seq: 0,
    ...overrides,
    created_at: overrides.started_at,
    updated_at: overrides.ended_at ?? overrides.last_activity_at,
  };
}

type FixtureEvent = { kind: string; at: string; content?: string; detail?: FixtureRow; duration_ms?: number; client_at?: string };
let zuluEventId = 0;
/** One attempt's events, numbered in order the way the events trigger numbers them. */
function zuluEvents(session: FixtureRow, list: FixtureEvent[]): FixtureRow[] {
  return list.map((e, i) => {
    zuluEventId += 1;
    return {
      id: zuluEventId,
      session_id: session.id,
      application_id: session.application_id,
      job_id: session.job_id,
      seq: i + 1,
      kind: e.kind,
      content: e.content ?? null,
      detail: e.detail ?? {},
      duration_ms: e.duration_ms ?? null,
      client_at: e.client_at ?? null,
      created_at: e.at,
      client_msg_id: null,
    };
  });
}

const shift = (iso: string, secs: number) => new Date(Date.parse(iso) + secs * 1000).toISOString();

// ── Robin Okafor: every step finished ───────────────────────────────────
const robinForm = zuluSession(sessionId(1), APP_ZULU_DONE_ID, ZULU_DONE_USER_ID, "application", "application", {
  started_at: at(0, 0),
  last_activity_at: at(2, 55),
  ended_at: at(3, 0),
  progress: { answered: 9, total: 9, draft_saved_at: at(2, 55) },
  integrity_summary: { counts: { tab_hidden: 1 }, total: 1, away_ms: 42000, short_away: 0, dropped: 0 },
});
const robinFormEvents = zuluEvents(robinForm, [
  { kind: "system", at: at(0, 0), detail: { what: "started", attempt: 1 } },
  { kind: "integrity", at: at(2, 22), client_at: at(1, 40), duration_ms: 42000, detail: { kind: "tab_hidden", duration_ms: 42000 } },
  { kind: "system", at: at(3, 0), detail: { what: "submitted" } },
]);

// Seconds on each of the ten questions; question 3 was changed once.
const ROBIN_QUIZ_SECS = [12, 9, 31, 7, 14, 10, 22, 6, 11, 18];
const robinQuizEventsList: FixtureEvent[] = [{ kind: "system", at: at(3, 30), detail: { what: "started", attempt: 1 } }];
let quizClock = Date.parse(at(3, 32));
zuluQuizQuestions.forEach((q, i) => {
  const shownAt = new Date(quizClock).toISOString();
  robinQuizEventsList.push({ kind: "quiz_shown", at: shownAt, detail: { question_id: q.id, question_index: i } });
  if (i === 2) {
    robinQuizEventsList.push({
      kind: "quiz_answer",
      at: shift(shownAt, 19),
      duration_ms: 19000,
      detail: { question_id: q.id, question_index: i, answer: 0, seconds_on_question: 19, shown_at: shownAt, timing_source: "server", changed: false },
    });
  }
  const secs = ROBIN_QUIZ_SECS[i];
  robinQuizEventsList.push({
    kind: "quiz_answer",
    at: shift(shownAt, secs),
    duration_ms: secs * 1000,
    detail: {
      question_id: q.id,
      question_index: i,
      answer: ZULU_QUIZ[i].right,
      seconds_on_question: secs,
      shown_at: shownAt,
      // One timing the server could not anchor to its own "shown" time.
      timing_source: i === 6 ? "previous_answer" : "server",
      changed: i === 2,
    },
  });
  quizClock += (secs + 2) * 1000;
});
robinQuizEventsList.push({ kind: "system", at: at(6, 24), detail: { what: "submitted" } });
const robinQuiz = zuluSession(sessionId(2), APP_ZULU_DONE_ID, ZULU_DONE_USER_ID, "quiz", "quiz", {
  started_at: at(3, 30),
  last_activity_at: at(6, 22),
  ended_at: at(6, 24),
  progress: { answered: 10, total: 10, current_question_id: "zq10", current_index: 9 },
  grading: {
    graded_at: at(6, 25),
    result: {
      score: 100,
      correct: 10,
      total: 10,
      answers: zuluQuizQuestions.map((q, i) => ({
        question_id: q.id,
        picked: ZULU_QUIZ[i].right,
        picked_text: q.options[ZULU_QUIZ[i].right],
        correct_answer: q.options[ZULU_QUIZ[i].right],
        is_correct: true,
        seconds_on_question: ROBIN_QUIZ_SECS[i],
      })),
    },
  },
});
const robinQuizEvents = zuluEvents(robinQuiz, robinQuizEventsList);

const robinTyping = zuluSession(sessionId(3), APP_ZULU_DONE_ID, ZULU_DONE_USER_ID, "step_typing", "typing_test", {
  started_at: at(6, 40),
  last_activity_at: at(8, 20),
  ended_at: at(8, 21),
  context: { target_text: ZULU_PASSAGE, required_wpm: 45 },
  progress: { typed_chars: ROBIN_TYPED.length, elapsed_ms: 61600 },
  grading: {
    graded_at: at(8, 21),
    result: { wpm: 38, accuracy: 85, score: 72, requiredWpm: 45, passed: false, formula: "gross WPM × word accuracy" },
  },
});
const robinTypingEvents = zuluEvents(robinTyping, [
  { kind: "system", at: at(6, 40), detail: { what: "started", attempt: 1 } },
  { kind: "typing_snapshot", at: at(7, 0), detail: { typed_text: ROBIN_TYPED.slice(0, 52), wpm: null, accuracy: null, elapsed_ms: 15000, final: false } },
  { kind: "typing_snapshot", at: at(7, 30), detail: { typed_text: ROBIN_TYPED.slice(0, 131), wpm: null, accuracy: null, elapsed_ms: 45000, final: false } },
  {
    kind: "typing_snapshot",
    at: at(8, 20),
    detail: { typed_text: ROBIN_TYPED, target_text: ZULU_PASSAGE, wpm: 38, accuracy: 85, elapsed_ms: 61600, final: true },
  },
  { kind: "system", at: at(8, 21), detail: { what: "submitted" } },
]);

const ROBIN_CHAT: Array<[string, string, number, number]> = [
  // [speaker, text, minute, second]
  ["customer", "This game is rigged. I lost $200 tonight and I want ALL of it back right now.", 8, 45],
  ["agent", "Hi Devin, I'm sorry you're upset. Let me see what I can do for you.", 9, 20],
  ["customer", "What you can do is refund me. The machine never pays.", 9, 41],
  ["agent", "I understand. Sometimes the games go on a cold streak, it will turn around if you keep playing.", 10, 1],
  ["customer", "Keep playing?? I'm asking for help to STOP.", 11, 12],
  ["agent", "Sorry, I didn't mean it like that. Would a bonus help you feel better?", 11, 58],
  ["customer", "I don't want a bonus. I want my money back.", 12, 2],
  ["agent", "I can't refund money that was played. I can pause your account if you want a break.", 12, 10],
  ["customer", "Fine. Pause it. And tell me how to stop this happening again.", 12, 16],
  ["agent", "Done, it's paused. You can also set a daily limit in Settings.", 12, 22],
  ["customer", "Okay. Thanks, I guess.", 12, 25],
];
const robinChat = zuluSession(sessionId(4), APP_ZULU_DONE_ID, ZULU_DONE_USER_ID, "step_chat", "chat_simulation", {
  started_at: at(8, 40),
  last_activity_at: at(12, 22),
  ended_at: at(12, 27),
  end_reason: "customer_resolved",
  context: {
    scenario:
      "Devin lost $200 tonight, says the game is rigged, and wants all of his money back. What you know: results are random and support cannot change or see them, and money that has been played cannot be refunded. You can show him how to set a spending limit or take a break.",
    customer_name: "Devin",
  },
  progress: { candidate_turns: 5, assistant_turns: 6 },
  integrity_summary: {
    counts: { window_blur: 1, tab_hidden: 2, paste: 1 },
    total: 4,
    away_ms: 72800,
    short_away: 1,
    dropped: 0,
    first_event_at: at(9, 31),
    last_event_at: at(11, 56),
  },
  grading: {
    graded_at: at(12, 30),
    model: "gpt-5.6-terra",
    result: {
      score: 18,
      empathy: 15,
      problemSolving: 12,
      communication: 26,
      professionalism: 31,
      strengths: ["Apologised for how he was feeling early on", "Offered to pause the account in the end"],
      improvements: [
        "Never suggest another deposit to someone asking for help to stop",
        "Say plainly that results are random and support cannot see or change them",
        "Walk him through setting a limit instead of promising it will be okay",
      ],
      overallFeedback:
        "Polite, but told a player who asked for help to stop that a cold streak would turn around, and offered a bonus before a limit. The pause came only at the end.",
    },
  },
});
const robinChatEvents = zuluEvents(robinChat, [
  { kind: "system", at: at(8, 40), detail: { what: "started", attempt: 1 } },
  ...ROBIN_CHAT.slice(0, 3).map(([who, text, m, sec]): FixtureEvent => ({
    kind: who === "agent" ? "candidate_turn" : "assistant_turn",
    at: at(m, sec),
    content: text,
    detail: { role: who },
  })),
  { kind: "integrity", at: at(9, 31), client_at: at(9, 30), duration_ms: 400, detail: { kind: "window_blur", duration_ms: 400 } },
  ...ROBIN_CHAT.slice(3, 4).map(([who, text, m, sec]): FixtureEvent => ({
    kind: who === "agent" ? "candidate_turn" : "assistant_turn",
    at: at(m, sec),
    content: text,
    detail: { role: who },
  })),
  { kind: "integrity", at: at(11, 9), client_at: at(10, 2), duration_ms: 67000, detail: { kind: "tab_hidden", duration_ms: 67000 } },
  ...ROBIN_CHAT.slice(4, 5).map(([who, text, m, sec]): FixtureEvent => ({
    kind: who === "agent" ? "candidate_turn" : "assistant_turn",
    at: at(m, sec),
    content: text,
    detail: { role: who },
  })),
  { kind: "integrity", at: at(11, 30), client_at: at(11, 30), detail: { kind: "paste", target: "reply" } },
  { kind: "integrity", at: at(11, 56), client_at: at(11, 50), duration_ms: 5400, detail: { kind: "tab_hidden", duration_ms: 5400 } },
  ...ROBIN_CHAT.slice(5).map(([who, text, m, sec]): FixtureEvent => ({
    kind: who === "agent" ? "candidate_turn" : "assistant_turn",
    at: at(m, sec),
    content: text,
    detail: who === "agent" ? { role: who } : { role: who, model: "gpt-5.6-terra", ...(text.startsWith("Okay") ? { resolved: true } : {}) },
  })),
  { kind: "system", at: at(12, 27), detail: { what: "submitted" } },
]);

const robinInterviewTurns = (zuluDoneNotes.chatInterviewResult.messages as Array<{ role: string; content: string; timestamp: string }>).map(
  (m): FixtureEvent => ({
    kind: m.role === "user" ? "candidate_turn" : "assistant_turn",
    at: m.timestamp,
    content: m.content,
    detail: m.role === "user" ? { role: "candidate" } : { role: "interviewer", model: "gpt-5.6-terra" },
  }),
);
const robinInterview = zuluSession(sessionId(5), APP_ZULU_DONE_ID, ZULU_DONE_USER_ID, "step_interview", "chat_interview", {
  started_at: at(13, 50),
  last_activity_at: at(19, 12),
  ended_at: at(19, 40),
  end_reason: "ai_closed",
  progress: { candidate_turns: 4, assistant_turns: 5 },
  integrity_summary: {
    counts: { window_blur: 1, tab_hidden: 2, screenshot_suspected: 1 },
    total: 4,
    away_ms: 71000,
    short_away: 0,
    dropped: 0,
    first_event_at: at(14, 7),
    last_event_at: at(19, 4),
  },
  grading: { graded_at: at(19, 45), result: zuluDoneNotes.chatInterviewResult.evaluation },
});
const robinInterviewEvents = zuluEvents(
  robinInterview,
  [
    { kind: "system", at: at(13, 50), detail: { what: "started", attempt: 1 } },
    ...robinInterviewTurns,
    { kind: "integrity", at: at(14, 7), client_at: at(14, 1), duration_ms: 6000, detail: { kind: "window_blur", duration_ms: 6000 } },
    { kind: "integrity", at: at(14, 50), client_at: at(14, 9), duration_ms: 41000, detail: { kind: "tab_hidden", duration_ms: 41000 } },
    { kind: "integrity", at: at(17, 51), client_at: at(17, 50), detail: { kind: "screenshot_suspected", keys: "Meta+Shift" } },
    { kind: "integrity", at: at(19, 4), client_at: at(18, 40), duration_ms: 24000, detail: { kind: "tab_hidden", duration_ms: 24000 } },
    { kind: "system", at: at(19, 40), detail: { what: "submitted" } },
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
);

// ── Sam Osei: in the written interview now ─────────────────────────────
const samDone = (n: number, stepId: string, stepType: string, from: number, to: number) =>
  zuluSession(sessionId(n), APP_ZULU_TESTING_ID, ZULU_TESTING_USER_ID, stepId, stepType, {
    started_at: minutesAgo(from),
    last_activity_at: minutesAgo(to),
    ended_at: minutesAgo(to),
  });
const samInterview = zuluSession(sessionId(10), APP_ZULU_TESTING_ID, ZULU_TESTING_USER_ID, "step_interview", "chat_interview", {
  status: "active",
  end_reason: null,
  started_at: minutesAgo(7),
  last_activity_at: minutesAgo(1),
  last_heartbeat_at: minutesAgo(0.4),
  ended_at: null,
  progress: { candidate_turns: 3, assistant_turns: 4 },
  integrity_summary: { counts: { window_blur: 1 }, total: 1, away_ms: 3200, short_away: 0, dropped: 0, first_event_at: minutesAgo(4), last_event_at: minutesAgo(4) },
});
const SAM_TURNS: Array<[string, string, number]> = [
  ["interviewer", "Welcome, Sam. What interests you most about supporting players for this team?", 6.8],
  ["candidate", "I've done night-shift chat for a ticketing company, and I like being the calm person at 3am when something has gone wrong.", 6.1],
  ["interviewer", "Tell me about a time you handled a customer who was upset about money.", 5.9],
  ["candidate", "A customer was charged twice for the same tickets. I checked both charges in our admin, refunded the duplicate, sent the reference number and set a reminder to confirm it landed.", 4.6],
  ["interviewer", "Good. A player says their cash-out is late and they need it for rent. What do you write?", 4.4],
  ["candidate", "I'd say I'm sorry it's late and I know it matters, check where it is in the queue, and tell them honestly when it will go out instead of guessing.", 1.1],
  ["interviewer", "And if it's stuck for a reason you can't fix yourself?", 1.0],
];
const samInterviewEvents = zuluEvents(samInterview, [
  { kind: "system", at: minutesAgo(7), detail: { what: "started", attempt: 1 } },
  ...SAM_TURNS.slice(0, 4).map(([role, text, ago]): FixtureEvent => ({
    kind: role === "candidate" ? "candidate_turn" : "assistant_turn",
    at: minutesAgo(ago),
    content: text,
    detail: { role },
  })),
  { kind: "integrity", at: minutesAgo(3.9), client_at: minutesAgo(4), duration_ms: 3200, detail: { kind: "window_blur", duration_ms: 3200 } },
  ...SAM_TURNS.slice(4).map(([role, text, ago]): FixtureEvent => ({
    kind: role === "candidate" ? "candidate_turn" : "assistant_turn",
    at: minutesAgo(ago),
    content: text,
    detail: { role },
  })),
]);

// ── Lena Park: left the skills check at question 3, 25 minutes ago ──────
const lenaQuiz = zuluSession(sessionId(20), APP_ZULU_LEFT_ID, ZULU_LEFT_USER_ID, "quiz", "quiz", {
  status: "active",
  end_reason: null,
  started_at: minutesAgo(28),
  last_activity_at: minutesAgo(25),
  last_heartbeat_at: minutesAgo(25),
  hidden_at: minutesAgo(25),
  ended_at: null,
  progress: { answered: 2, total: 10, current_question_id: "zq3", current_index: 2 },
  integrity_summary: { counts: { page_closed: 1 }, total: 1, away_ms: 0, short_away: 0, dropped: 0, first_event_at: minutesAgo(24.9), last_event_at: minutesAgo(24.9) },
});
const lenaQuizEvents = zuluEvents(lenaQuiz, [
  { kind: "system", at: minutesAgo(28), detail: { what: "started", attempt: 1 } },
  { kind: "quiz_shown", at: minutesAgo(27.6), detail: { question_id: "zq1", question_index: 0 } },
  { kind: "quiz_answer", at: minutesAgo(27.3), duration_ms: 18000, detail: { question_id: "zq1", question_index: 0, answer: 1, seconds_on_question: 18, timing_source: "server", changed: false } },
  { kind: "quiz_shown", at: minutesAgo(27.25), detail: { question_id: "zq2", question_index: 1 } },
  { kind: "quiz_answer", at: minutesAgo(26.7), duration_ms: 33000, detail: { question_id: "zq2", question_index: 1, answer: 0, seconds_on_question: 33, timing_source: "server", changed: false } },
  { kind: "quiz_shown", at: minutesAgo(25), detail: { question_id: "zq3", question_index: 2 } },
  { kind: "integrity", at: minutesAgo(24.9), client_at: minutesAgo(24.9), detail: { kind: "page_closed" } },
]);
const lenaForm = zuluSession(sessionId(21), APP_ZULU_LEFT_ID, ZULU_LEFT_USER_ID, "application", "application", {
  started_at: minutesAgo(44),
  last_activity_at: minutesAgo(41),
  ended_at: minutesAgo(40),
  progress: { answered: 5, total: 9 },
});

// ── Jordan Reyes: chat practice reopened, attempt 2 under way ────────────
// Attempt 1 left the window four times and pasted once; attempt 2 is live,
// on a laptop whose clock runs three minutes slow (the transcript places its
// flag by the server's clock all the same).
const jordanDone = (n: number, stepId: string, stepType: string, from: number, to: number) =>
  zuluSession(sessionId(n), APP_ZULU_RETAKE_ID, ZULU_RETAKE_USER_ID, stepId, stepType, {
    started_at: minutesAgo(from),
    last_activity_at: minutesAgo(to),
    ended_at: minutesAgo(to),
  });
const jordanChat1 = zuluSession(sessionId(43), APP_ZULU_RETAKE_ID, ZULU_RETAKE_USER_ID, "step_chat", "chat_simulation", {
  started_at: minutesAgo(2 * 60 + 45),
  last_activity_at: minutesAgo(2 * 60 + 31),
  ended_at: minutesAgo(2 * 60 + 30),
  context: { scenario: ZULU_CHAT_SCENARIO, customer_name: "Devin" },
  progress: { candidate_turns: 3, assistant_turns: 3 },
  integrity_summary: { counts: { tab_hidden: 4, paste: 1 }, total: 5, away_ms: 252000, short_away: 0, dropped: 0 },
  grading: { result: { score: 22, empathy: 25, problemSolving: 18, communication: 30, professionalism: 41, overallFeedback: "Rushed: answered a question Devin did not ask and promised a refund support cannot give." } },
});
const jordanChat1Events = zuluEvents(jordanChat1, [
  { kind: "system", at: minutesAgo(2 * 60 + 45), detail: { what: "started", attempt: 1 } },
  { kind: "integrity", at: minutesAgo(2 * 60 + 42), client_at: minutesAgo(2 * 60 + 43), duration_ms: 61000, detail: { kind: "tab_hidden", duration_ms: 61000 } },
  { kind: "integrity", at: minutesAgo(2 * 60 + 40), client_at: minutesAgo(2 * 60 + 40), detail: { kind: "paste", target: "reply" } },
  { kind: "integrity", at: minutesAgo(2 * 60 + 37), client_at: minutesAgo(2 * 60 + 38), duration_ms: 74000, detail: { kind: "tab_hidden", duration_ms: 74000 } },
  { kind: "integrity", at: minutesAgo(2 * 60 + 34), client_at: minutesAgo(2 * 60 + 35), duration_ms: 58000, detail: { kind: "tab_hidden", duration_ms: 58000 } },
  { kind: "integrity", at: minutesAgo(2 * 60 + 32), client_at: minutesAgo(2 * 60 + 33), duration_ms: 59000, detail: { kind: "tab_hidden", duration_ms: 59000 } },
  { kind: "system", at: minutesAgo(2 * 60 + 30), detail: { what: "submitted" } },
]);
const jordanChat2 = zuluSession(sessionId(44), APP_ZULU_RETAKE_ID, ZULU_RETAKE_USER_ID, "step_chat", "chat_simulation", {
  attempt: 2,
  status: "active",
  end_reason: null,
  started_at: minutesAgo(6),
  last_activity_at: minutesAgo(1),
  last_heartbeat_at: minutesAgo(0.4),
  ended_at: null,
  context: { scenario: ZULU_CHAT_SCENARIO, customer_name: "Devin" },
  progress: { candidate_turns: 2, assistant_turns: 3 },
  integrity_summary: { counts: { tab_hidden: 1 }, total: 1, away_ms: 12000, short_away: 0, dropped: 0 },
});
const SLOW_CLOCK_MIN = 3;
const jordanChat2Events = zuluEvents(jordanChat2, [
  { kind: "system", at: minutesAgo(6), detail: { what: "started", attempt: 2 } },
  { kind: "assistant_turn", at: minutesAgo(5.8), content: "I lost $200 tonight. This game is rigged and I want my money back.", detail: { role: "customer" } },
  {
    kind: "candidate_turn",
    at: minutesAgo(4.9),
    client_at: minutesAgo(4.9 + SLOW_CLOCK_MIN),
    content: "I'm sorry tonight went that way, Devin. I can't see or change game results, and they are random, but I can help you set a limit or take a break.",
    detail: { role: "agent" },
  },
  { kind: "assistant_turn", at: minutesAgo(4.6), content: "So you won't refund me? Then what are you for?", detail: { role: "customer" } },
  // Away for 12 s at 3.5 min ago; the page sent it on return, on its slow clock.
  { kind: "integrity", at: minutesAgo(3.3), client_at: minutesAgo(3.5 + SLOW_CLOCK_MIN), duration_ms: 12000, detail: { kind: "tab_hidden", duration_ms: 12000 } },
  {
    kind: "candidate_turn",
    at: minutesAgo(2.2),
    client_at: minutesAgo(2.2 + SLOW_CLOCK_MIN),
    content: "Played money can't be refunded, and I won't promise what I can't do. What I can do right now is set a daily limit with you so tonight doesn't repeat.",
    detail: { role: "agent" },
  },
  { kind: "assistant_turn", at: minutesAgo(1.9), content: "Fine. How do I set it?", detail: { role: "customer" } },
]);

// ── Dana Whitfield: on the form, 6 of 9 answered ─────────────────────────
const danaForm = zuluSession(sessionId(30), APP_ZULU_FORM_ID, ZULU_FORM_USER_ID, "application", "application", {
  status: "active",
  end_reason: null,
  started_at: minutesAgo(5),
  last_activity_at: minutesAgo(1),
  last_heartbeat_at: minutesAgo(0.3),
  ended_at: null,
  progress: { answered: 6, total: 9, draft_saved_at: minutesAgo(1) },
  draft: {
    q1: "Dana Whitfield",
    q2: "dana.whitfield@example.com",
    q3: "555 014 2290",
    q4: "Kingston, Jamaica",
    q5: ["Evening, 4pm to midnight Eastern", "Weekends (Saturday and Sunday)"],
    q6: "30 to 40",
    q9: "",
    _phoneCountryCodes: { q3: "+1" },
  },
  integrity_summary: { counts: { tab_hidden: 1 }, total: 1, away_ms: 38000, short_away: 0, dropped: 0 },
});
const danaFormEvents = zuluEvents(danaForm, [
  { kind: "system", at: minutesAgo(5), detail: { what: "started", attempt: 1 } },
  { kind: "integrity", at: minutesAgo(2.4), client_at: minutesAgo(3), duration_ms: 38000, detail: { kind: "tab_hidden", duration_ms: 38000 } },
]);

// The hand-back behind Jordan's retake (assessment_step_reopens, written by
// the server's trigger when staff put him back on the step). Without it the
// record would read his chat practice as done: status and phase alone are
// something an applicant can set, so they are never proof of a reopen.
const jordanChatReopen: FixtureRow = {
  application_id: APP_ZULU_RETAKE_ID,
  step_id: "step_chat",
  job_id: JOB_FRESH_ID,
  reopened_at: minutesAgo(9),
  reopened_by: EMPLOYER_USER_ID,
  reopen_count: 1,
};

function zuluSessions(onlyApplying: boolean): { sessions: FixtureRow[]; events: FixtureRow[] } {
  if (onlyApplying) return { sessions: [danaForm], events: danaFormEvents };
  return {
    sessions: [
      robinForm,
      robinQuiz,
      robinTyping,
      robinChat,
      robinInterview,
      samDone(11, "application", "application", 38, 35),
      samDone(12, "quiz", "quiz", 34, 31),
      samDone(13, "step_typing", "typing_test", 29, 26),
      samDone(14, "step_chat", "chat_simulation", 14, 8),
      samInterview,
      lenaForm,
      lenaQuiz,
      jordanDone(40, "application", "application", 3 * 60 + 10, 3 * 60 + 5),
      jordanDone(41, "quiz", "quiz", 3 * 60 + 4, 3 * 60),
      jordanDone(42, "step_typing", "typing_test", 2 * 60 + 58, 2 * 60 + 50),
      jordanChat1,
      jordanChat2,
      danaForm,
    ],
    events: [
      ...robinFormEvents,
      ...robinQuizEvents,
      ...robinTypingEvents,
      ...robinChatEvents,
      ...robinInterviewEvents,
      ...samInterviewEvents,
      ...lenaQuizEvents,
      ...jordanChat1Events,
      ...jordanChat2Events,
      ...danaFormEvents,
    ],
  };
}

/** The owner's integrity cards: one per applicant per test, counted up
 *  (public.assessment_integrity_alert writes exactly these words). */
function zuluIntegrityCards(onlyApplying: boolean): FixtureRow[] {
  if (onlyApplying) return [];
  const card = (n: number, appId: string, stepId: string, name: string, message: string, createdAt: string, read: boolean) =>
    notification(`a0000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`, EMPLOYER_USER_ID, {
      type: "integrity",
      title: `Integrity — ${name}`,
      message,
      link: `/applicants/${appId}`,
      group_key: `integrity:${appId}:${stepId}`,
      is_read: read,
      created_at: createdAt,
    });
  return [
    card(5, APP_ZULU_RETAKE_ID, "step_chat", "Jordan Reyes", "During Player chat practice: left the window 1 time (12s away)", minutesAgo(3.3), false),
    card(1, APP_ZULU_TESTING_ID, "step_interview", "Sam Osei", "During Written interview: left the window 1 time (3s away)", minutesAgo(3.9), false),
    card(2, APP_ZULU_LEFT_ID, "quiz", "Lena Park", "During Skills check: closed the test page x1", minutesAgo(24.9), false),
    card(3, APP_ZULU_DONE_ID, "step_interview", "Robin Okafor", "During Written interview: left the window 3 times (1m 11s away), possible screenshot x1", at(19, 4), false),
    card(4, APP_ZULU_DONE_ID, "step_chat", "Robin Okafor", "During Player chat practice: left the window 2 times (1m 12s away), paste attempt x1", at(11, 56), true),
  ];
}

/** The right answers, filed the way get_job_quiz_keys returns them. */
const zuluQuizKeys = zuluQuizQuestions.map((q, i) => ({
  step_id: "__quiz_questions__",
  question_id: q.id,
  key: { correct_answer: q.options[ZULU_QUIZ[i].right] },
}));

function buildZuluTables(onlyApplying: boolean): FixtureTables {
  const apps = onlyApplying ? [appZuluForm] : [appZuluDone, appZuluTesting, appZuluLeft, appZuluRetake, appZuluForm];
  const record = zuluSessions(onlyApplying);
  return {
    ...buildFreshTables(),
    profiles: [freshEmployerProfile, teamMemberProfile, ...zuluProfiles].map((r) => ({ ...r })),
    jobs: [{ ...zuluJob }],
    applications: apps.map((r) => ({ ...r })),
    published_jobs_public: [{ ...zuluJob }],
    assessment_sessions: record.sessions.map((r) => ({ ...r })),
    assessment_events: record.events.map((r) => ({ ...r })),
    assessment_step_reopens: onlyApplying ? [] : [{ ...jordanChatReopen }],
    notifications: [
      ...zuluIntegrityCards(onlyApplying),
      notification("a0000000-0000-4000-8000-000000000101", EMPLOYER_USER_ID, {
        type: "application",
        title: "New application",
        message: `Robin Okafor applied to ${String(zuluJob.title)}.`,
        link: `/applicants/${APP_ZULU_DONE_ID}`,
        created_at: new Date(zuluStartedAt + 3 * 60 * 1000).toISOString(),
      }),
    ],
  };
}

// --------------------------------------------------------------- exports

/** `cafe` is the default. `fresh`: one live role, nobody yet. `zulu`: the Zulu
 *  role with three applicants at three points. `applying`: the Zulu role with
 *  only the applicant still on the form. */
export type FixtureScenario = "cafe" | "fresh" | "zulu" | "applying";

export const FIXTURE_SCENARIOS: readonly FixtureScenario[] = ["cafe", "fresh", "zulu", "applying"];

export function buildFixtureTables(scenario: FixtureScenario = "cafe"): FixtureTables {
  if (scenario === "fresh") return buildFreshTables();
  if (scenario === "zulu") return buildZuluTables(false);
  if (scenario === "applying") return buildZuluTables(true);
  return buildCafeTables();
}

export function buildFixtureRpcHandlers(scenario: FixtureScenario = "cafe"): Record<string, (args: unknown) => unknown> {
  return {
    ...fixtureRpcHandlers,
    // The Zulu role carries a real answer key; the café's quiz has none filed.
    get_job_quiz_keys: () => (scenario === "zulu" || scenario === "applying" ? zuluQuizKeys : []),
    get_careers_traffic: () =>
      scenario !== "cafe"
        ? trafficRows(2, (i) => [i === 0 ? 9 : 14, i === 0 ? 4 : 6, i === 0 ? 1 : 2])
        : trafficRows(14, (i) => [20 + ((i * 7) % 11), 9 + ((i * 5) % 7), 3 + (i % 4)]),
  };
}

function buildCafeTables(): FixtureTables {
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
    // The test record (wave 2): nothing recorded for the café's applicants.
    assessment_sessions: [],
    assessment_events: [],
    assessment_step_reopens: [],
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
