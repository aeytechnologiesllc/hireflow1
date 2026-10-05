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
  ],
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
  phase: "step_typing",
  created_at: minutesAgo(9),
  updated_at: minutesAgo(1),
  ai_score: 71,
  notes: JSON.stringify({
    ...zuluQuizRecord([2, 6], minutesAgo(2)),
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
  }),
  ai_analysis: "Summary: Solid on the rules so far; the typing test, chat practice and written interview are still to come.",
  ai_scorecard: { overallScore: 71, recommendedAction: "review", decisionState: "needs_more_evidence", riskFlags: ["Resume could not be analyzed"] },
});

const appZuluForm = makeZuluApplication({
  id: APP_ZULU_FORM_ID,
  candidate_id: ZULU_FORM_USER_ID,
  status: "in_progress",
  phase: "application",
  created_at: minutesAgo(2),
  updated_at: minutesAgo(2),
  notes: null,
});

/** The right answers, filed the way get_job_quiz_keys returns them. */
const zuluQuizKeys = zuluQuizQuestions.map((q, i) => ({
  step_id: "__quiz_questions__",
  question_id: q.id,
  key: { correct_answer: q.options[ZULU_QUIZ[i].right] },
}));

function buildZuluTables(onlyApplying: boolean): FixtureTables {
  const apps = onlyApplying ? [appZuluForm] : [appZuluDone, appZuluTesting, appZuluForm];
  return {
    ...buildFreshTables(),
    profiles: [freshEmployerProfile, teamMemberProfile, ...zuluProfiles].map((r) => ({ ...r })),
    jobs: [{ ...zuluJob }],
    applications: apps.map((r) => ({ ...r })),
    published_jobs_public: [{ ...zuluJob }],
    notifications: [
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
