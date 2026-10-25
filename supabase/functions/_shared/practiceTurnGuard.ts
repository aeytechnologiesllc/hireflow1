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
 * scripts/ai_endpoint_limits.test.mjs runs it in Node.
 */

/**
 * Largest request body a practice function reads at all. The pages send the
 * whole conversation on every turn and on submit, so this is generous: a long
 * written interview is tens of kilobytes. (It was 256 KB with 4,000-character
 * answers; the Pass C review showed one long written answer would then fail
 * every later turn and the submit, 2026-10-25.) It is also about the
 * platform's own ceiling: a live probe the same day found Supabase's gateway
 * never passes on a body over about 1 MB (900 KB reached the function and got
 * its 413; 1.1 MB never reached it, and the caller waited for the gateway's
 * 504). Such a request costs nothing, since the function never runs.
 */
export const MAX_PRACTICE_BODY_BYTES = 1024 * 1024;

/**
 * Per-field limits: far above anything a person types in a practice step,
 * low enough that nobody can send a book. The answer boxes have no length
 * limit of their own, so these must never stop a real applicant.
 */
export const PRACTICE_LIMITS = {
  scenario: 20000,
  customerName: 200,
  prospectName: 200,
  prospectCompany: 500,
  productService: 5000,
  jobTitle: 300,
  candidateName: 200,
  agentMessage: 12000,
  salesRepMessage: 12000,
  candidateMessage: 12000,
  userMessage: 12000,
  message: 12000,
  messages: 200,
} as const;

/**
 * Reads the request's JSON body, never more than `max` bytes of it: a
 * chunked request carries no Content-Length to check first. Answers
 * { ok: false, status } for a body too large (413) or not JSON (400).
 */
export async function readJsonWithin(req: Request, max = MAX_PRACTICE_BODY_BYTES): Promise<{ ok: true; body: unknown } | { ok: false; status: number }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max) return { ok: false, status: 413 };
  if (!req.body) return { ok: false, status: 400 };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400 };
  }
}

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
    return { ok: false, status: 403, code: "not_your_application", error: "This practice is for a different account. Sign in with the account you applied with." };
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

/**
 * Why a turn's session could not be opened, when that means the step is not
 * this applicant's to take now (_shared/assessmentSession.ts NoSessionReason):
 * such a turn is refused. A passing error ("error", "not_deployed") or a
 * busy attempt ("session_busy") is not on this list.
 */
const REFUSED_STEP_REASONS: ReadonlySet<string> = new Set([
  "not_your_application",
  "application_closed",
  "unknown_step",
  "step_not_reached",
  "step_finished",
  "wrong_step_type",
]);

export function isRefusedStep(reason: string | null | undefined): boolean {
  return typeof reason === "string" && REFUSED_STEP_REASONS.has(reason);
}
