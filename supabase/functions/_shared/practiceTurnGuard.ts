/**
 * practiceTurnGuard.ts — who may spend an AI call on a practice turn, and how
 * big a turn may be (2026-10-25; docs/LAUNCH-PLAN.md, Phase 1, task 3).
 *
 * The chat practice, the written interview and the sales practice
 * (ai-chat-simulation, ai-chat-interview, ai-sales-simulation) are public
 * functions: the gateway lets the site's public key through. Each "start" or
 * "respond" sends a scenario and the whole conversation to OpenAI. Until now
 * a turn with no application, or from nobody signed in, was "served as
 * before": anyone could send any scenario and any history, of any size, and
 * the site paid for the answer. The applicant pages always send their
 * application and step and the applicant's own sign-in
 * (src/hooks/useAssessmentSession.ts assessmentRequestHeaders), so a turn
 * is now served only for a signed-in applicant's own application, and every
 * field has a size.
 *
 * Pure (the application lookup is passed in), so
 * scripts/practice_turn_guard.test.mjs runs it in Node.
 */

/** Largest request body a practice function reads at all. */
export const MAX_PRACTICE_BODY_BYTES = 256 * 1024;

/** Per-field limits, well above anything the pages send (a Zulu escalated case is ~1,500 characters). */
export const PRACTICE_LIMITS = {
  scenario: 6000,
  customerName: 120,
  prospectName: 120,
  prospectCompany: 200,
  productService: 1000,
  jobTitle: 200,
  candidateName: 120,
  agentMessage: 4000,
  salesRepMessage: 4000,
  candidateMessage: 4000,
  message: 4000,
  messages: 80,
} as const;

/** The first field over its limit, or null. */
export function oversizedPracticeField(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  for (const [field, max] of Object.entries(PRACTICE_LIMITS)) {
    if (field === "messages" || field === "message") continue;
    const value = b[field];
    if (typeof value === "string" && value.length > max) return field;
  }
  const messages = b.messages;
  if (Array.isArray(messages)) {
    if (messages.length > PRACTICE_LIMITS.messages) return "messages";
    for (const m of messages) {
      const content = m && typeof m === "object" ? (m as Record<string, unknown>).content : null;
      if (typeof content === "string" && content.length > PRACTICE_LIMITS.message) return "messages";
      if (content != null && typeof content !== "string") return "messages";
    }
  } else if (messages != null) {
    return "messages";
  }
  return null;
}

export type PracticeTurnVerdict =
  | { ok: true }
  | { ok: false; status: number; code: string; error: string };

/**
 * May this start/respond be served? Only for a signed-in user's own
 * application. `loadCandidateId` reads applications.candidate_id (service
 * role); a lookup that fails is a refusal, never a pass.
 */
export async function practiceTurnVerdict(params: {
  target: { applicationId: string; stepId: string } | null;
  userId: string | null;
  loadCandidateId: (applicationId: string) => Promise<string | null>;
}): Promise<PracticeTurnVerdict> {
  if (!params.target) {
    return { ok: false, status: 400, code: "application_required", error: "This practice runs inside an application." };
  }
  if (!params.userId) {
    return { ok: false, status: 401, code: "sign_in_required", error: "Your sign-in has ended. Reload the page to carry on." };
  }
  let owner: string | null = null;
  try {
    owner = await params.loadCandidateId(params.target.applicationId);
  } catch {
    owner = null;
  }
  if (!owner || owner !== params.userId) {
    return { ok: false, status: 403, code: "not_your_application", error: "This practice belongs to another application." };
  }
  return { ok: true };
}

/** The applications lookup the three functions pass in. */
export function candidateIdLoader(admin: {
  from: (table: string) => {
    select: (cols: string) => { eq: (col: string, value: string) => { maybeSingle: () => Promise<{ data: { candidate_id?: string | null } | null; error: unknown }> } };
  };
}) {
  return async (applicationId: string): Promise<string | null> => {
    const { data, error } = await admin.from("applications").select("candidate_id").eq("id", applicationId).maybeSingle();
    if (error || !data) return null;
    return typeof data.candidate_id === "string" ? data.candidate_id : null;
  };
}
