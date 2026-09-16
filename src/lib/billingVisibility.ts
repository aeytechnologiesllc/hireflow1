/**
 * The employer applicant-list side of the paywall: which candidate ids may
 * render as real cards, and which must render only as a count inside
 * SealedApplicantsCard.
 *
 * Pulled out of src/cockpit/pages/Applicants.tsx so the arrival-order +
 * allowance math has one place to live and one place to test (see
 * scripts/billing_visibility.test.mjs) — this is exactly the logic a prior
 * review found missing: the applicant list rendered every card regardless
 * of a locked job's paid allowance, making the paywall purely decorative.
 *
 * Matches the model documented in
 * supabase/migrations/20260916170000_job_billing_schema.sql: "processed" vs
 * "sealed" is a VISIBILITY gate on the employer's own applicant list, never
 * a compute gate on the candidate's pipeline. Nothing here ever removes an
 * application or changes what a candidate experiences — it only decides
 * which of the employer's own already-fetched rows are allowed to render.
 */

export interface BillingVisibilitySnapshot {
  billingEnabled: boolean;
  isLocked: boolean;
  processedAllowance: number;
}

export interface BillingVisibilityEntry {
  id: string;
  /** The application's created_at, ISO-ish and string-sortable. Missing/empty
   *  sorts first, which only matters for malformed data and never hides a
   *  well-formed row that should be visible. */
  createdAt: string;
}

/**
 * Returns the set of candidate ids allowed to render as real cards, or
 * `null` when nothing should be hidden (billing is off, the job isn't
 * locked, or there's no billing snapshot yet) — callers can treat `null` as
 * "render everything, as always" without a separate branch.
 *
 * Earliest arrivals fill the allowance first, matching "first 3 applicants,
 * by arrival order, are free" in the decided pricing model: the employer
 * always gets to see who applied first, and it is the later arrivals beyond
 * the paid allowance that stay sealed.
 */
export function computeBillingVisibleIds(
  entries: BillingVisibilityEntry[],
  billing: BillingVisibilitySnapshot | null | undefined,
): Set<string> | null {
  if (!billing || !billing.billingEnabled || !billing.isLocked) return null;
  const byArrival = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const allowance = Math.max(0, billing.processedAllowance);
  return new Set(byArrival.slice(0, allowance).map((e) => e.id));
}

// ---------------------------------------------------------------------------
// Data-level redaction — the actual close of the "paywall is decorative"
// finding. computeBillingVisibleIds above only ever decided which of an
// ALREADY-FETCHED, already-fully-populated array of rows one component
// renders; the raw rows themselves (name, AI score, Ava's analysis, resume)
// were still sitting in the network response and the React Query cache
// regardless, and any OTHER page that reached the same application by id
// (the dashboard activity feed, Messages, Interviews, AIShortlistDialog, the
// /applicants/:id detail route) rendered it in full with no gate of its own.
//
// The fix is to redact at the source: every hook that fetches raw
// `applications` rows (useEmployerApplications, useActivityFeed) calls
// get_employer_sealed_application_ids() once and passes each row through
// redactSealedApplication() before it's ever cached or returned, using the
// sealed id SET the server-side function computes as the single source of
// truth (job_processed_allowance/job_is_locked's own arrival-order model,
// authoritative from Postgres). Every downstream consumer of that data then
// inherits the same gate for free — it never needs to know about billing at
// all, because a sealed application's sensitive fields are simply not
// present in the object it renders.
// ---------------------------------------------------------------------------

/** Employer-facing placeholder name for a sealed applicant — never Ava/AI
 *  wording, matching every other candidate-facing and employer-facing
 *  string in this product. */
export const SEALED_APPLICANT_NAME = "Sealed applicant";

interface RedactableProfile {
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  resume_url?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  portfolio_url?: string | null;
  bio?: string | null;
  skills?: string[] | null;
}

/** The subset of an `applications` row (plus its joined candidate profile)
 *  that carries employer-facing value — everything redactSealedApplication
 *  blanks out for a sealed row. Structurally compatible with
 *  ApplicationWithCandidate (src/hooks/useApplications.ts) and the shape
 *  useActivityFeed.ts fetches, without importing either (this stays a
 *  dependency-free pure module, matching computeBillingVisibleIds above). */
export interface RedactableApplication {
  ai_analysis?: string | null;
  ai_score?: number | null;
  ai_scorecard?: unknown;
  phase_ai_analysis?: string | null;
  resume_score?: number | null;
  resume_url?: string | null;
  cover_letter?: string | null;
  // A shared JSON blob every phase screen reads/writes — quiz results
  // (extractQuizScore reads notes.quizResult.score / notes.quiz.score, see
  // src/cockpit/lib/mappers.ts), uploads, saved answers. Must be redacted
  // for the same reason ai_score is: it's real applicant-provided scoring
  // data, not the employer's own commentary (that's `employer_notes`,
  // a separate column, left untouched).
  notes?: string | null;
  voice_interview_recording_url?: string | null;
  voice_interview_transcript?: unknown;
  voice_interview_result?: unknown;
  profiles?: RedactableProfile | null;
}

/**
 * Returns a shallow-redacted copy of one application row: the row itself
 * (id, job_id, candidate_id, status, timestamps, the employer's own
 * notes/decisions) is untouched, so counts, pipeline stages, and every
 * mutation (advance/hire/reject/message) keep working exactly as today —
 * only the fields that would show the employer "full visibility into this
 * applicant" for free are blanked: the candidate's name/contact/resume, the
 * AI score, Ava's analysis and scorecard, and voice interview artifacts.
 * `email` is typed non-nullable on `profiles`, so it becomes "" rather than
 * null — nothing downstream should ever read it once `full_name` is the
 * fixed placeholder (see mapCandidate's `name` fallback chain).
 */
export function redactSealedApplication<T extends RedactableApplication>(app: T): T {
  // Cast at the boundary: every field this overrides is nullable/optional on
  // RedactableApplication by construction, but a generic T's own declared
  // field types aren't provably widened by that constraint for TS's return-
  // type check — the runtime shape is exactly T's, just with these specific
  // fields blanked, which is what every caller (and scripts/billing_visibility.test.mjs)
  // actually verifies.
  return {
    ...app,
    ai_analysis: null,
    ai_score: null,
    ai_scorecard: null,
    phase_ai_analysis: null,
    resume_score: null,
    resume_url: null,
    cover_letter: null,
    notes: null,
    voice_interview_recording_url: null,
    voice_interview_transcript: null,
    voice_interview_result: null,
    profiles: app.profiles
      ? {
          ...app.profiles,
          full_name: SEALED_APPLICANT_NAME,
          email: "",
          avatar_url: null,
          resume_url: null,
          phone: null,
          linkedin_url: null,
          portfolio_url: null,
          bio: null,
          skills: null,
        }
      : app.profiles,
  } as T;
}

/**
 * Redacts every row in `apps` whose `id` is in `sealedIds` (a Set from
 * get_employer_sealed_application_ids(), or from computeBillingVisibleIds'
 * complement — either way, ids, never the rows themselves). Rows not in the
 * set pass through unchanged (same reference, no new allocation) so this is
 * a no-op — including its cost — for the common case of a job that isn't
 * locked or billing being off (an empty set).
 */
export function redactSealedApplications<T extends RedactableApplication & { id: string }>(
  apps: T[],
  sealedIds: ReadonlySet<string> | null | undefined,
): T[] {
  if (!sealedIds || sealedIds.size === 0) return apps;
  return apps.map((app) => (sealedIds.has(app.id) ? redactSealedApplication(app) : app));
}
