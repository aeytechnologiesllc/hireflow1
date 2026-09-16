/**
 * Dev-preview-only. Fixed ids shared between the fixture tables
 * (fixtures.ts) and the picker's screen list (screens.ts), so a screen's URL
 * can point at exactly the fixture row it needs without importing the whole
 * fixture dataset just to read an id.
 */

export const EMPLOYER_USER_ID = "10000000-0000-4000-8000-000000000001";
export const TEAM_MEMBER_USER_ID = "10000000-0000-4000-8000-000000000002";
export const CANDIDATE_USER_ID = "10000000-0000-4000-8000-000000000003";
export const REJECTED_CANDIDATE_USER_ID = "10000000-0000-4000-8000-000000000004";

export const JOB_BARISTA_ID = "20000000-0000-4000-8000-000000000001";
export const JOB_SERVER_ID = "20000000-0000-4000-8000-000000000002";
export const JOB_CASHIER_DRAFT_ID = "20000000-0000-4000-8000-000000000003";
export const JOB_SHIFT_LEAD_CLOSED_ID = "20000000-0000-4000-8000-000000000004";

// Workflow step ids on the Barista job — see buildCandidateJourney(): the
// journey is [application, quiz, ...these in order, decision].
export const STEP_TYPING = "wf-typing";
export const STEP_VIDEO = "wf-video";
export const STEP_CHAT_SIM = "wf-chatsim";
export const STEP_CHAT_INTERVIEW = "wf-chatint";
export const STEP_SALES = "wf-sales";
export const STEP_VOICE = "wf-voice";
export const STEP_PORTFOLIO = "wf-portfolio";

// One application per journey position, all for the same candidate + job, so
// every phase page's "first screen, already reached" state — and the one
// "not yet" state — has a real application to open it against.
export const APP_NOT_YET_ID = "30000000-0000-4000-8000-000000000001"; // phase: application
export const APP_QUIZ_ID = "30000000-0000-4000-8000-000000000002";
export const APP_TYPING_ID = "30000000-0000-4000-8000-000000000003";
export const APP_VIDEO_ID = "30000000-0000-4000-8000-000000000004";
export const APP_CHAT_SIM_ID = "30000000-0000-4000-8000-000000000005";
export const APP_CHAT_INTERVIEW_ID = "30000000-0000-4000-8000-000000000006";
export const APP_SALES_ID = "30000000-0000-4000-8000-000000000007";
export const APP_VOICE_ID = "30000000-0000-4000-8000-000000000008";
export const APP_PORTFOLIO_ID = "30000000-0000-4000-8000-000000000009";
export const APP_OFFERED_ID = "30000000-0000-4000-8000-000000000010";
export const APP_HIRED_ID = "30000000-0000-4000-8000-000000000011";
export const APP_REJECTED_ID = "30000000-0000-4000-8000-000000000012";

export const DOC_PENDING_EMPLOYER_ID = "40000000-0000-4000-8000-000000000001";
export const DOC_PENDING_CANDIDATE_ID = "40000000-0000-4000-8000-000000000002";
export const DOC_SIGNED_ID = "40000000-0000-4000-8000-000000000003";
export const DOC_DECLINED_ID = "40000000-0000-4000-8000-000000000004";

export const INTERVIEW_UPCOMING_ID = "50000000-0000-4000-8000-000000000001";
export const INTERVIEW_COMPLETED_ID = "50000000-0000-4000-8000-000000000002";
