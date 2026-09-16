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
   write can ever produce.
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

## The `advance` flag

`recordStepResult`'s own write to `applications` never advances `phase`/
`status` — even when the current-step-to-next-step computation says it
could — unless the caller passed `advance: "auto_mode"`. This exists
because only TWO of the seven step types' pre-conversion pages ever wrote
`phase` from the browser themselves; the other five always left the whole
advance/reject decision to a follow-up
`trigger-ava-analysis({ autopilotDecision: true, currentPhaseId })` call —
which, critically, leaves `phase` untouched (only `status: "reviewing"` +
`phase_ai_analysis`) when Ava recommends declining, so a human reviews
before the candidate moves on. Advancing `phase` from `recordStepResult`
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
- `supabase/functions/_shared/trustedResults.ts` — `recordStepResult` and
  its pure helpers (`hasReachedStep`, `computeNextStepDecision`,
  `mergeTrustedNotes`). Zero imports beyond `candidateJourney.ts`, so its
  pure functions run under plain Node too.
- `supabase/migrations/20260915140000_trusted_step_results.sql` — the
  `trusted_result_enforcement` table and the extended
  `protect_application_columns()` trigger.
- `scripts/trusted_results_logic.test.mjs` — plain-Node test of
  `trustedResults.ts`'s pure decision logic across realistic journeys.
- `scripts/trusted_step_results.pglite.test.mjs` — real-Postgres (PGlite)
  proof of the migration's trigger, flags on and off.
