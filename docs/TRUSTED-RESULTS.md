# Trusted step results — the part-B conversion guide

Cycle 4 part A (this migration + these two shared files) is the **foundation
only**. It changes nothing for candidates today. Part B is a series of
separate, per-phase conversions — each one moves ONE phase page's
notes/phase write server-side and then flips that phase's own enforcement
flag on. This doc is the recipe every part-B worker follows.

## Why this exists

Today, every phase page (`TypingTestPhase`, `ChatSimulationPhase`,
`ChatInterviewPhase`, `SalesSimulationPhase`, `PortfolioUploadPhase`,
`VideoIntroPhase`) computes its own result **in the candidate's browser** and
writes it straight into `applications.notes` (and, for two of them,
`applications.phase`) with a plain
`supabase.from("applications").update(...)` call running as the candidate's
own session. `trigger-ava-analysis` and `_shared/autopilot.ts` then read
those same `notes` fields as evidence. A candidate who edits those fields in
devtools before the page calls `trigger-ava-analysis` is trusted completely.

The fix: the phase page calls a service-role edge function instead of
writing `applications` directly. That function does whatever *legitimate*
grading the phase needs (scoring a transcript, checking typing accuracy,
analyzing a portfolio, ...) and then calls `recordStepResult` — which
verifies the caller, merges the result into `notes` in the exact shape
today's readers already expect, and advances `phase`/`status` using the same
rules the candidate's own browser uses today. The browser never touches
`applications` for that step again.

## The function

```ts
import { recordStepResult } from "../_shared/trustedResults.ts";

const outcome = await recordStepResult(admin /* service-role client */, {
  applicationId,       // the application this result belongs to
  callerUserId,        // auth.uid() the edge function itself resolved from the JWT — never a body param
  stepId,              // the real step id (route's :stepId — matches a jobs.workflow_steps[].id)
  stepType,            // "typing_test" | "chat_simulation" | "chat_interview" |
                        // "sales_simulation" | "portfolio_upload" |
                        // "video_intro" | "video_message" | "voice_interview"
  advance,             // REQUIRED — "auto_mode" | "never". Whether this call may write
                        // applications.phase/status at all. See "The advance flag" below —
                        // get this wrong and a candidate can end up one step ahead of a
                        // decline recommendation the employer hasn't reviewed yet.
  resultKey,           // the notes key readers check today — see the table below
  result,              // the value written at notes[resultKey] — same shape today's readers expect
  legacyStepEntry,      // optional — also writes notes[stepId] for by-id readers (see table)
  extraNotesEntries,    // optional — also writes other flat top-level notes keys some readers
                        // check exclusively, e.g. video_intro's { videoIntroUrl } (see table)
});

if (!outcome.ok) {
  // outcome.code: "application_not_found" | "not_candidate" | "application_rejected"
  //             | "step_not_reached" | "write_failed"
  return jsonResponse({ error: outcome.error }, outcome.code === "step_not_reached" ? 409 : 400);
}

// outcome.next: { id, type, title } | "waiting" — what the candidate should navigate to.
// Computed the same way regardless of `advance` — even an advance: "never" step (e.g.
// typing_test) gets an informational "what's next" the way its original page did, without
// that ever implying applications.phase actually moved.
```

`recordStepResult` does five things, in order, and refuses (no partial
write) if any of the first three fail:

1. Loads the application (with its job's `workflow_steps`, `quiz_questions`,
   `processing_mode`) by `applicationId`.
2. Checks `callerUserId` really is `application.candidate_id`.
3. Checks the candidate has actually **reached** `stepId` — the exact rule
   `CandidateStepGate.tsx` already gates the route with (`resolveGatedStep`
   + `positionFor` from `candidateJourney.ts`) — and that the application
   isn't `rejected`.
4. Merges `result` into `notes[resultKey]`, plus `notes[stepId]` if you
   passed `legacyStepEntry`, plus any flat top-level keys you passed in
   `extraNotesEntries`, plus a server-only
   `notes._trusted[stepId] = { stepType, completedAt }` marker no client
   write can ever produce. Since 2026-10-05 it hands ONLY those keys to the
   service-role `merge_application_notes(p_application_id, p_patch)` RPC
   (migration `20261005180943_merge_application_notes.sql`), which merges
   them into whatever `notes` holds at that moment under the row lock — see
   "Notes writes are merges" below. It never writes the whole object back.
5. Computes what the next configured step would be (auto mode, next step
   exists, and it isn't `voice_interview`) exactly like the candidate's own
   browser always did — but only actually **writes** `phase`/`status` to
   that next step when you passed `advance: "auto_mode"`. Manual mode never
   advances regardless of `advance`; an employer/team member moves `phase`
   from the cockpit as they do today.

`recordStepResult` does **not** decide pass/fail — that's the phase's own
grading, done before you call it (or via a separate
`trigger-ava-analysis` call, exactly as today). It only ever decides whether
to move the candidate to the **next configured step**, mirroring what the
candidate's own browser already computes for its "Start next phase" button.

## Notes writes are merges, never whole-object writes (2026-10-05)

`applications.notes` is one TEXT JSON object shared by the candidate's
answers, every step's trusted result, the quiz RPC and Ava's scorecard. The
edge-function writers used to read it, merge in JavaScript and write the
whole object back. That stopped being safe the day Ava started scoring in the
background (see "Moving on in auto mode" below): her run takes ~40 s, starts
from a snapshot, and would erase the next step's result; a step result
written from a stale snapshot would erase her scorecard.

So every server-side notes write goes through one function:

```sql
public.merge_application_notes(p_application_id uuid, p_patch jsonb) returns jsonb
-- SECURITY DEFINER, search_path public, EXECUTE for service_role ONLY
-- (revoked from PUBLIC, anon, authenticated).
```

- It merges `p_patch`'s **top-level** keys into the stored object
  (`stored || p_patch`) under `SELECT ... FOR UPDATE`, so two merges on one
  application serialize. A patched key replaces that key's whole value
  (a retaken result replaces the old one; it is not a deep merge).
- What is stored is never thrown away. NULL, blank or JSON-null notes read as
  `{}`. Notes holding a NUL character (JavaScript writes it as the `\u0000`
  escape, which `JSON.parse` reads and Postgres `jsonb` refuses) are read in
  full with the NUL as U+FFFD. Anything else that is not a JSON object
  (malformed text, an array, a scalar) is kept whole under `_unparsedNotes`
  with the patch merged beside it. None of these is an error. (The first
  draft read them all as `{}` and wrote the patch over them, which would
  have erased an application whose chat transcript held a NUL.)
- A patch holding a NUL cannot reach the function at all (`jsonb` refuses the
  parameter), so both writers pass every patch through
  `withoutNulCharacters` first: NUL becomes U+FFFD, nothing else changes.
- `updated_at` moves through the table's own trigger, and
  `protect_application_columns` still runs (and exempts the service role, as
  for every other server write).
- It returns the merged object.

Who writes what through it:

| writer | keys it owns |
|---|---|
| `recordStepResult` | `resultKey`, `stepId` (when `legacyStepEntry`), `extraNotesEntries`, `_trusted` (this step's marker laid over the markers it just read) |
| `trigger-ava-analysis` | `avaScorecard`, `avaAnalysisMeta` |

Two adapters predate the RPC and have no `.rpc` (ai-chat-interview's
`toMinimalAdmin` and the PGlite test fakes); with those, `recordStepResult`
falls back to its old single whole-notes write. If the RPC itself does not
exist yet (PGRST202 / 42883 — the migration was not applied before the
functions were deployed), both writers fall back loudly; any other RPC error
is a real failure. **Apply the migration before deploying the functions.**

Proof: `scripts/merge_application_notes.pglite.test.mjs` (real Postgres) and
the "notes go through merge_application_notes" section of
`scripts/trusted_results_logic.test.mjs`, which reproduces the race and shows
the old path losing the scorecard.

## Moving on in auto mode — `advanceAfterStep` (2026-10-05)

Owner: in an **auto-mode** job nobody is ever parked part-way. Every
applicant takes every test up to and including the last one, Ava only scores
and flags, and he decides at the end. Deal-breakers are a highlighted flag
(`avaScorecard.dealBreakerFlags`), never a stop.

`trigger-ava-analysis({ autopilotDecision: true, currentPhaseId })` on an
auto-mode job now:

1. reads `jobs.processing_mode` from the database (never the request);
2. calls `advanceAfterStep` (`_shared/trustedResults.ts`), which
   - refuses unless `currentPhaseId` names a real step AND is the row's
     current `phase` (it never falls back to the stored phase — a retry or a
     stale tab can never skip a step; a repeat after the move answers
     "already moved" and writes nothing),
   - refuses unless that step's own result is stored (`stepResultLanded`:
     a `_trusted[stepId]` marker. For a step recorded by `recordStepResult`
     that marker is required whenever the row has any markers, because the
     per-type keys such as `chatSimulationResult` are shared by every step
     of that type; only a legacy row with no markers at all falls back to
     them. The quiz reads `quizResult`, the voice interview its column, the
     application form counts once it is sent),
   - moves `phase` with one compare-and-set
     `UPDATE ... WHERE id = ? AND phase = <finished step> AND status NOT IN
     ('rejected','hired','offered')`, status `reviewing`,
   - goes to the Decision stage (`DECISION_STAGE_ID`, `"decision"`) after the
     last real step, and still stops before a `voice_interview`;
3. answers the browser at once — `decision: "advanced"`, `nextPhaseId`,
   `nextPhaseTitle` (the journey's own titles: "Skills check", "Player chat
   practice", "Decision"), `finishedAllSteps`, `alreadyAdvanced`, and
   `score: null` / `analysisPending: true`. Refusals answer `"stale"`,
   `"not_ready"` (result not stored yet) or `"rejected"`;
4. runs Ava's analysis after the response with `EdgeRuntime.waitUntil`
   when `shouldScoreAfterStep` says so: always when this request moved the
   candidate, and on "already moved on" or "waiting on the employer" when no
   stored analysis has read this step's result yet (`analysisCoversStep`:
   `avaAnalysisMeta.analysisStartedAt` is later than
   `_trusted[stepId].completedAt`). The second case matters because
   `complete-video-intro` and `ai-analyze-portfolio` move the candidate on
   themselves (`advance: "auto_mode"`), so the page's call after a video or a
   portfolio always finds them already moved and is the only request that
   will ever score that step. A true repeat after the analysis saved starts
   nothing and does not notify the employer twice. That run writes analysis
   fields only (`ai_analysis`, `ai_score`,
   `ai_scorecard`, `resume_score`, `phase_ai_analysis` as information, and
   `notes.avaScorecard` / `notes.avaAnalysisMeta` through the merge) and
   **never** `phase` or `status`. A run that started earlier never
   overwrites one that started later (`avaAnalysisMeta.analysisStartedAt`).
   Her decline recommendation is stored for the owner and acted on by
   nothing.

`ai-analyze` shares one 135 s deadline across all of its OpenAI attempts, so
the background run always finishes inside Supabase's 150 s request idle
timeout and 400 s wall clock. The structured attempts stop 55 s before that
deadline (`NARRATIVE_RESERVE_MS`), so a hung structured call can never use up
the narrative fallback's time: worst case 80 s + 55 s. `autopilot-batch`
passes `awaitAnalysis: true` so a batch scores one application at a time; an
analysis that did not save comes back as `analysisError`, and the batch
counts that applicant in `failed` ("Moved on, but Ava could not score them")
rather than as handled.

Manual-mode jobs are unchanged: the analysis runs while the caller waits, and
`handleAutopilotDecision` (score, then advance / defer / recommend-decline)
is reached only for them. `recordStepResult`'s own `advance` flag (below) is
unchanged too — for auto-mode jobs the move after a `"never"` step is
`advanceAfterStep`'s, made after the step's result is stored.

## The `advance` flag

`recordStepResult`'s own write to `applications` never advances `phase`/
`status` — even when the current-step-to-next-step computation says it
could — unless the caller passed `advance: "auto_mode"`. This exists
because only TWO of the seven step types' pre-conversion pages ever wrote
`phase` from the browser themselves; the other five always left the whole
advance/reject decision to a follow-up
`trigger-ava-analysis({ autopilotDecision: true, currentPhaseId })` call —
which, for a manual-mode job, leaves `phase` untouched (only
`status: "reviewing"` + `phase_ai_analysis`) when Ava recommends declining,
so a human reviews before the candidate moves on. (For an auto-mode job that
call now moves them on regardless of her read — "Moving on in auto mode"
above — but only after the step's result is stored, which is still exactly
why `recordStepResult` itself must not move a `"never"` step.) Advancing `phase` from `recordStepResult`
itself for one of those five steps would put the candidate one step ahead
of that still-pending human review the moment their result triggers a
decline recommendation — `CandidateStepGate.tsx` would then let them
navigate straight into the next step's route.

| `stepType` | `advance` | why (verified against the pre-conversion source, commit `40e17d8`) |
|---|---|---|
| `typing_test` | `"never"` | TypingTestPhase.tsx:421-430 resent `phase`/`status` UNCHANGED in both modes — "Do NOT change phase or status here - let backend handle in autopilot mode." |
| `chat_simulation` | `"never"` | ChatSimulationPhase.tsx:684-689's `.update()` wrote only `notes` + `phase_ai_analysis` — no `phase`/`status` key at all. |
| `chat_interview` | `"never"` | ChatInterviewPhase.tsx's candidate-driven `handleSubmit` (:646-651) wrote only `notes` + `phase_ai_analysis`. Its separate pre-conversion "AI auto-detected the end" branch (:260-283) DID write `phase`/`status` directly in auto mode, but with no decline check and no `voice_interview` stop-gate — reproducing that half would reopen this exact bug, so `"never"` covers both of chat_interview's now-merged submit paths. |
| `sales_simulation` | `"never"` | SalesSimulationPhase.tsx:658-661, same shape as chat_simulation — `notes` + `phase_ai_analysis` only. |
| `portfolio_upload` | `"auto_mode"` | PortfolioUploadPhase.tsx:444-450 really did write `phase: isAutoMode ? newPhase : application.phase` (never `status`) in the same `.update()` as `notes`, stopping one step short of `voice_interview`. |
| `video_intro` / `video_message` | `"auto_mode"` | VideoIntroPhase.tsx:343-360/395-398, identical shape to portfolio_upload. |
| `voice_interview` | `"never"` | VoiceInterviewPhase.tsx:281-296 wrote only `voice_interview_transcript` + `phase_ai_analysis`; `ava-voice-tools`'s `end_interview` handler (already server-side before this cycle) wrote only `voice_interview_result` + `phase_ai_analysis`. Every advance past the final interview waits on a human or `trigger-ava-analysis`. |

`advance` is a **required** input (no default) precisely so a new phase
conversion has to make this choice consciously — read that phase's own
pre-conversion `.update()` call (step 1 of the recipe below) and match
what it actually did, not what seems convenient.

## The result_key map

| `resultKey` (any casing) | notes `type` it pairs with | `legacyStepEntry`? | `extraNotesEntries`? |
|---|---|---|---|
| `typingTestResult` | `typing_test` | yes — `notes[stepId]`, TypingTestPhase.tsx:349-361 | no |
| `chatSimulationResult` | `chat_simulation` | no — ChatSimulationPhase.tsx has no by-id reader | no |
| `chatInterviewResult` | `chat_interview` | no | no |
| `salesSimulationResult` | `sales_simulation` | no | no |
| `portfolioResult` | `portfolio_upload` | yes — `notes[stepId]`, PortfolioUploadPhase.tsx:571 checks `notes[stepId] \|\| notes.portfolioResult` | no |
| `videoIntroResult` | `video_intro` (or the legacy `video_message` alias) | yes — `notes[stepId]`, matches VideoIntroPhase.tsx's own write shape | **yes, required** — `{ videoIntroUrl: result.videoUrl }`. VideoIntroPhase.tsx:390 writes a fourth, flat key today, `notes.videoIntroUrl`, that `autopilot-batch/index.ts:129` and `usePendingActionsCount.ts:77` read **exclusively** (never `videoIntroResult`) to decide whether a video was submitted. Drop this and those two readers go stale for every candidate who converts. `videoIntroUrl` is folded into the SAME `videoIntroResult` enforcement flag (not a separate `result_key`) — see the migration. |
| `voiceInterviewResult` | `voice_interview` | no — `CondensedAIAnalysis.tsx:277` reads this notes key as a fallback alongside the real `applications.voice_interview_result` column | no |

Before converting a phase, read that phase page's current
`.update({ notes: ... })` call and match its `updatedNotes` shape exactly —
`result` is whatever that phase's existing readers (`trigger-ava-analysis`,
the cockpit, `CondensedAIAnalysis`) already expect at that key. Don't
invent a new shape. **Also grep every reader of that phase's notes** (not
just the obvious `resultKey`) for a stray flat key like `videoIntroUrl` —
`autopilot-batch/index.ts`, `usePendingActionsCount.ts`,
`getApplicationDisplayState.ts`, `CandidateApplicationDetail.tsx`,
`ChatInterviewPhase.tsx`, `ava-voice-session/index.ts` and
`ava-voice-tools/index.ts` are all real, currently-wired examples of code
that reads `notes` fields outside the `resultKey`/`legacyStepEntry` shapes
above. `video_intro` is the one case the foundation already found and wired
via `extraNotesEntries`; don't assume it's the only one for the phase you're
converting.

## Converting one phase — the recipe

1. **Read the phase page's current write.** Find its
   `supabase.from("applications").update(...)` call(s) and note exactly what
   goes into `notes`, `phase`, `status`, and `phase_ai_analysis`.
2. **Move the grading, if any, server-side**, into an edge function running
   with the service-role client — the same place you'd already put a
   scoring call. If the phase already gets its result from a
   `trigger-ava-analysis` call, that stays; only the *candidate-authored*
   write of raw `notes`/`phase` needs to move.
3. **Call `recordStepResult`** from that edge function with the result
   shape from the table above, and the correct `advance` value from
   "The `advance` flag" table — read the page's own pre-conversion
   `.update()` call for `phase`/`status` yourself rather than assuming; two
   step types that look alike (e.g. chat_simulation vs. portfolio_upload)
   can differ here.
4. **Delete the client-side write.** The phase page's own
   `supabase.from("applications").update(...)` call for this step's result
   goes away entirely — the edge function response (`outcome.next`) tells
   the page what to show/navigate to next, replacing its local
   `buildCandidateJourney` + `nextPhase` computation for this purpose.
5. **Prove it with PGlite** the same way `scripts/trusted_step_results.pglite.test.mjs`
   already does for the foundation — add cases for your phase's own
   `result_key` if the shared file doesn't already cover it end-to-end.
6. **Ship a migration that flips your phase's own flag**, once (and only
   once) step 4 is live and proven:

   ```sql
   UPDATE public.trusted_result_enforcement
   SET enforced = true, updated_at = now()
   WHERE result_key = 'typingTestResult'; -- your phase's own key
   ```

   Flip only your own `result_key`. Never flip `phase` — see below.

## The `phase` flag is different — flip it last, once every phase is done

`phase` (`applications.phase` itself) is guarded by ONE global flag, not
per-phase, because a candidate's own `UPDATE` isn't scoped to a single step
type. Flipping it while even one phase still writes `phase` from the
browser breaks that phase outright. Flip `result_key = 'phase'` only in the
final part-B migration, once `typingTestResult`, `chatSimulationResult`,
`chatInterviewResult`, `salesSimulationResult`, `portfolioResult`,
`videoIntroResult`, and `voiceInterviewResult` are ALL already enforced.

`ApplicationFormPhase.tsx`'s own submit write never touches `phase` at all
(only `status: "pending"`) — the row's `phase: "application"` comes from
`JobDetails.tsx`'s `INSERT`, which this trigger never sees. So there is no
carved-out exception to preserve; once `phase` is enforced, a candidate
cannot change it at all, full stop.

## `voice_interview` is special

`VoiceInterviewPhase.tsx` writes `applications.voice_interview_transcript`
directly from the browser, **after** `voice_interview_result` has already
been set server-side (by `ava-voice-tools`' `end_interview` tool call, or by
`submit_voice_interview_manual_end`). If your conversion flips
`voiceInterviewResult` on, you must also move the transcript write
server-side (into the same `recordStepResult` call, or its own service-role
write) first — otherwise the candidate's own interview-end flow breaks the
moment the flag flips, because the migration blocks
`voice_interview_transcript` once `voice_interview_result` is non-null AND
`voiceInterviewResult` is enforced.

## What NOT to do

- Don't add a new `result_key` without a matching row in
  `trusted_result_enforcement` (seed it `enforced = false` in your own
  migration, same pattern as the foundation migration).
- Don't write to `notes._trusted` from anywhere except `recordStepResult` —
  it's protected unconditionally (every casing, every phase) from the
  moment the foundation migration ships, not gated behind any flag.
- Don't flip a flag before the corresponding client-side write is actually
  gone — the PGlite proof only tells you the trigger behaves correctly, not
  that your page no longer needs the old behavior.
- Don't try to replicate `trigger-ava-analysis`'s own score-vs-passing-
  threshold pass/fail decision inside `recordStepResult` — that's a
  separate, existing concern (and a separate call) `recordStepResult`
  deliberately leaves alone.
- Don't assume `resultKey` + `legacyStepEntry` covers every reader. At least
  one phase (`video_intro`) has a reader-facing flat key
  (`notes.videoIntroUrl`) that neither covers — use `extraNotesEntries` for
  it, and grep before you assume your phase has none.

## Where things live

- `supabase/functions/_shared/candidateJourney.ts` — server mirror of
  `src/lib/candidateJourney.ts`. Guarded against drift by
  `scripts/guards/candidate-journey-shared-copy.mjs` (part of
  `node scripts/guardrails.mjs`) — if you ever need to touch the journey
  rules themselves, edit both files identically.
- `supabase/functions/_shared/trustedResults.ts` — `recordStepResult`,
  `advanceAfterStep` and their pure helpers (`hasReachedStep`,
  `computeNextStepDecision`, `mergeTrustedNotes`, `buildTrustedNotesPatch`,
  `stepResultLanded`, `planAutoAdvance`, `analysisCoversStep`,
  `shouldScoreAfterStep`, `withoutNulCharacters`). Zero imports beyond
  `candidateJourney.ts`, so its pure functions run under plain Node too.
- `supabase/migrations/20261005180943_merge_application_notes.sql` — the
  service-role notes merge both server writers use.
- `supabase/migrations/20260915140000_trusted_step_results.sql` — the
  `trusted_result_enforcement` table and the extended
  `protect_application_columns()` trigger.
- `scripts/trusted_results_logic.test.mjs` — plain-Node test of
  `trustedResults.ts`'s pure decision logic across realistic journeys,
  including the merge path and the auto-mode advance on the live Zulu
  journey.
- `scripts/merge_application_notes.pglite.test.mjs` — real-Postgres proof of
  the merge function (merge semantics, unreadable notes kept, the NUL case,
  service-role only).
- `scripts/pending_phase_not_a_conflict.test.mjs` — the scorecard rules:
  nothing stops an auto-mode applicant part-way, the judge's prose is never a
  reason, the interview counts in both result shapes.
- `scripts/trusted_step_results.pglite.test.mjs` — real-Postgres (PGlite)
  proof of the migration's trigger, flags on and off.
