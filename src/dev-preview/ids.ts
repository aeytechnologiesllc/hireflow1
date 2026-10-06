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
// The "zulu" scenario's applicants (invented people) — see fixtures.ts.
export const ZULU_DONE_USER_ID = "10000000-0000-4000-8000-000000000005";
export const ZULU_FORM_USER_ID = "10000000-0000-4000-8000-000000000006";
export const ZULU_TESTING_USER_ID = "10000000-0000-4000-8000-000000000007";
/** Left the skills check at question 3 and never came back. */
export const ZULU_LEFT_USER_ID = "10000000-0000-4000-8000-000000000008";
/** Chat practice handed back for a retake; taking attempt 2 now. */
export const ZULU_RETAKE_USER_ID = "10000000-0000-4000-8000-000000000009";
// The Zulu applicant running the speed test right now (docs/EQUIPMENT-CHECK.md).
export const ZULU_CONNECTION_USER_ID = "10000000-0000-4000-8000-000000000010";
// The rest of the Zulu field (docs/APPLICANTS-LIST.md §5: every state the
// list shows has someone in it). Invented people, as above.
/** On the typing test right now; ran the connection check on a phone. */
export const ZULU_TYPING_USER_ID = "10000000-0000-4000-8000-000000000011";
/** Left chat practice at reply 3, forty minutes ago. */
export const ZULU_LEFT_CHAT_USER_ID = "10000000-0000-4000-8000-000000000012";
/** Moved to interview, one booked. */
export const ZULU_INTERVIEW_USER_ID = "10000000-0000-4000-8000-000000000013";
export const ZULU_OFFERED_USER_ID = "10000000-0000-4000-8000-000000000014";
export const ZULU_HIRED_USER_ID = "10000000-0000-4000-8000-000000000015";
export const ZULU_DECLINED_USER_ID = "10000000-0000-4000-8000-000000000016";
/** Finished every test; the connection check was added after they passed it. */
export const ZULU_STRONG_USER_ID = "10000000-0000-4000-8000-000000000017";
/** Sent the form two hours ago, not scored yet, skills check not started. */
export const ZULU_QUIET_USER_ID = "10000000-0000-4000-8000-000000000018";
/** Finished on the job as it will be once the typing step is dropped: typing timed in the chat practice, under the bar. */
export const ZULU_CHAT_TYPED_USER_ID = "10000000-0000-4000-8000-000000000019";

export const JOB_BARISTA_ID = "20000000-0000-4000-8000-000000000001";
export const JOB_SERVER_ID = "20000000-0000-4000-8000-000000000002";
export const JOB_CASHIER_DRAFT_ID = "20000000-0000-4000-8000-000000000003";
export const JOB_SHIFT_LEAD_CLOSED_ID = "20000000-0000-4000-8000-000000000004";
/** The "fresh" scenario's one live role (see fixtures.ts). */
export const JOB_FRESH_ID = "20000000-0000-4000-8000-000000000005";

// Workflow step ids on the Barista job — see buildCandidateJourney(): the
// journey is [application, quiz, ...these in order, decision].
/** The computer and connection check, the FIRST workflow step (docs/EQUIPMENT-CHECK.md §2). */
export const STEP_CONNECTION = "wf-connection";
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
// The Zulu role, the way the owner's own test run left it (2026-10-05): one
// applicant through every step, one taking the tests, one still on the form.
export const APP_ZULU_DONE_ID = "30000000-0000-4000-8000-000000000013";
export const APP_ZULU_FORM_ID = "30000000-0000-4000-8000-000000000014";
export const APP_ZULU_TESTING_ID = "30000000-0000-4000-8000-000000000015";
export const APP_ZULU_LEFT_ID = "30000000-0000-4000-8000-000000000016";
export const APP_ZULU_RETAKE_ID = "30000000-0000-4000-8000-000000000017";
/** Jordan Alvarez, standing on the Barista job's connection check, nothing sent yet (café scenario). */
export const APP_CONNECTION_ID = "30000000-0000-4000-8000-000000000018";
/** Priya Natarajan, running the speed test on the Zulu role right now. */
export const APP_ZULU_CONNECTION_ID = "30000000-0000-4000-8000-000000000019";
// The rest of the Zulu field, one per state on the Applicants list.
export const APP_ZULU_TYPING_ID = "30000000-0000-4000-8000-000000000020";
export const APP_ZULU_LEFT_CHAT_ID = "30000000-0000-4000-8000-000000000021";
export const APP_ZULU_INTERVIEW_ID = "30000000-0000-4000-8000-000000000022";
export const APP_ZULU_OFFERED_ID = "30000000-0000-4000-8000-000000000023";
export const APP_ZULU_HIRED_ID = "30000000-0000-4000-8000-000000000024";
export const APP_ZULU_DECLINED_ID = "30000000-0000-4000-8000-000000000025";
export const APP_ZULU_STRONG_ID = "30000000-0000-4000-8000-000000000026";
export const APP_ZULU_QUIET_ID = "30000000-0000-4000-8000-000000000027";
/** Kwame Asante: typing measured in the chat practice (docs/TYPING-IN-CHAT.md), no typing test. */
export const APP_ZULU_CHAT_TYPED_ID = "30000000-0000-4000-8000-000000000028";

export const DOC_PENDING_EMPLOYER_ID = "40000000-0000-4000-8000-000000000001";
export const DOC_PENDING_CANDIDATE_ID = "40000000-0000-4000-8000-000000000002";
export const DOC_SIGNED_ID = "40000000-0000-4000-8000-000000000003";
export const DOC_DECLINED_ID = "40000000-0000-4000-8000-000000000004";

export const INTERVIEW_UPCOMING_ID = "50000000-0000-4000-8000-000000000001";
export const INTERVIEW_COMPLETED_ID = "50000000-0000-4000-8000-000000000002";
/** The Zulu field's booked interview ("Interview Thu 3 PM" on the list). */
export const INTERVIEW_ZULU_ID = "50000000-0000-4000-8000-000000000003";
