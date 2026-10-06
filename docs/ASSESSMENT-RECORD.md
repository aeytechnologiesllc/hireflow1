# The assessment record: the contract

Wave 2 of the "Candidate 1" fix (2026-10-06). The owner's requirements:

- Save every answer and message as it is entered. If an applicant closes the
  tab, the hiring team still sees how far they got and that they left. Nothing
  may depend on the tab staying open.
- Copy and paste are off, screenshots are discouraged, and every switch away
  from the test is recorded. The applicant is told this before each test.
- The owner is told every time an applicant copies, pastes, tries a
  screenshot or switches windows: **one live card per applicant per test** in
  the in-app bell. It counts up and comes back as unread on every new event.
  (Phone push is not configured in HireFlow and is not part of this.)
- The staff record shows everything: both chat transcripts, typed text against
  the passage, the time spent on each quiz question, the integrity timeline
  with time away, and live progress ("answering question 3 · active 1 min ago",
  "Left at question 3 · last active 25 min ago").

Storage, access rules and functions: `supabase/migrations/20261005230146_assessment_record.sql`.
Proof: `scripts/assessment_record_schema.pglite.test.mjs` (real Postgres,
playing every role that will call it). The server's half
(`supabase/functions/_shared/assessmentSession.ts`, and `stepMoveOn.ts` for
the move to the next step) is proven by `scripts/assessment_session_server.test.mjs`
and, against the same migration, `scripts/assessment_session_server.pglite.test.mjs`.
**The server, candidate-page and staff builders all follow this document.** If something here is wrong, fix the
document and the migration together.

---

## 1. The rules that do not bend

1. **Grading, answer keys and the integrity record never go into
   `applications.notes`.** A candidate can read all of their own notes
   ("Candidates can view their own applications"). The existing notes result
   keys (`typingTestResult`, `chatSimulationResult`, `chatInterviewResult`,
   `quiz`, `quizResult`, …) keep their current shapes so current readers still
   work. Everything new goes in the two tables below.
2. **Only staff can read the two tables**: the job's owner and the job's
   active team members (`is_job_owner` / `is_active_team_member_for_job`).
   There is no candidate policy. Candidates write through five functions,
   and those functions never return `grading` or `context`.
3. **The server decides who may write.** Every candidate function checks
   four things. The caller is the application's candidate. The application is
   not rejected, hired or offered. The step is a real step of this job. The
   candidate has *reached* it, by the same rule as the step gate
   (`resolveGatedStep` + `positionFor`, i.e. `hasReachedStep`). A step that is
   already finished takes no new answers. **A finished step is open again
   only when the hiring team handed it back** (a staff reopen marker, 2.8),
   never because of something the applicant can write: they can set their
   own `status` to `pending`, and that alone reopens nothing.
4. **Server time counts.** `created_at` on every event and every session
   timestamp is set by the database. What the page reports (`client_at`)
   is kept next to it and is never trusted alone.
5. **The application form step records integrity events but never alerts the
   owner.** Applicants have good reasons to leave the form, such as running a
   speed test or finding their resume.
6. **Only server code writes a grouped or `integrity` bell card.** A trigger
   on `notifications` refuses both from a browser (4.4).

---

## 2. Tables

### 2.1 `public.assessment_sessions`: one row per application × step × attempt

| column | type | who writes it | meaning |
| --- | --- | --- | --- |
| `id` | uuid pk | db | session id |
| `application_id` | uuid, FK applications ON DELETE CASCADE | functions | |
| `job_id` | uuid | **trigger** (copied from the application; any value a writer sends is overwritten) | read by RLS |
| `candidate_id` | uuid | **trigger** (copied from the application) | |
| `step_id` | text | functions | the journey step id (`application`, `quiz`, `step_typing`, …) |
| `step_type` | text | functions | `application`, `quiz`, `typing_test`, `chat_simulation`, `chat_interview`, `sales_simulation`, `voice_interview`, `video_intro`, `portfolio_upload`, `equipment_check` (a legacy `video_message` is stored as `video_intro`) |
| `attempt` | int ≥ 1 | functions | 1, 2, … per application+step |
| `status` | text | functions / server | see 2.3 |
| `end_reason` | text ≤ 64 | functions / server | see 2.3 |
| `started_at` | timestamptz | db | the attempt opened |
| `last_activity_at` | timestamptz | db | the last thing the **applicant** did (see 2.4) |
| `last_heartbeat_at` | timestamptz | `touch_assessment_session` | the page last checked in (not activity: 2.4) |
| `hidden_at` | timestamptz | `touch_assessment_session` | the time the page was hidden, or NULL while it is visible |
| `ended_at` | timestamptz | functions / server | |
| `progress` | jsonb object | functions / triggers; the page only under `progress.client` | how far they got (2.5). **Returned to the candidate**, so it never holds grading |
| `context` | jsonb object | server only | test inputs pinned by the server: `{scenario, customer_name, scenario_id?}` for chat practice; `{server_candidate_context, candidate_name}` for the interview (the context the server built from the record; the older key `candidate_context`, where a previous build pinned the request's copy, is never read); for typing `{target_text, required_wpm, run, run_started_at, runs: [{run, started_at, target_text}]}` (the current run and up to 20 runs so far, one per "Try again"). Never returned to the candidate |
| `draft` | jsonb | `save_application_draft` | application form only: the answers not yet sent |
| `grading` | jsonb | server only | the full grading for staff (2.6). Never returned to the candidate |
| `integrity_summary` | jsonb object | `record_integrity_events` | 2.7 |
| `event_seq` | int | events trigger | the last `seq` handed out |
| `created_at`, `updated_at` | timestamptz | trigger | |

Constraints: `unique (application_id, step_id, attempt)`; **at most one live
row** (`status in ('active','grading')`) per application + step (partial
unique index). `application_id`, `job_id`, `candidate_id`, `step_id`,
`step_type` and `attempt` never change after insert (trigger raises 22023).

### 2.2 `public.assessment_events`: append-only

| column | type | who writes it | meaning |
| --- | --- | --- | --- |
| `id` | bigint identity | db | |
| `session_id` | uuid, FK sessions ON DELETE CASCADE | writer | **the only id a writer supplies** |
| `application_id`, `job_id` | uuid | **trigger** (from the session) | |
| `seq` | int | **trigger** | 1, 2, 3 … per session, in insert order, never reused |
| `kind` | text | writer | `candidate_turn`, `assistant_turn`, `quiz_shown`, `quiz_answer`, `typing_snapshot`, `integrity`, `system` |
| `content` | text ≤ 100,000 | writer | the message text, for turns. NULL for other kinds |
| `detail` | jsonb object | writer | the kind's own shape (section 3) |
| `duration_ms` | int ≥ 0 | writer | time away (integrity), time on the question (quiz_answer) |
| `client_at` | timestamptz | writer | when the page says it happened |
| `created_at` | timestamptz | **trigger** (`now()`, the writer's value is ignored) | when the server stored it |
| `client_msg_id` | text 1–128 | writer | idempotency key. `unique (session_id, client_msg_id)` |

**A repeated `client_msg_id` inserts nothing.** No error, zero rows: the
trigger skips it under the session's row lock, so a retried request is always
safe. To read the stored row afterwards, select by
`(session_id, client_msg_id)`.

Events are never edited, by any role (an UPDATE raises 42501). A correction is
a new event. Inserting an event also updates its session (`event_seq`,
activity, the turn counters), and staff see that through realtime.

### 2.3 Status and end reasons

| status | meaning | set by |
| --- | --- | --- |
| `active` | open; the applicant is (or was recently) taking it | functions |
| `grading` | the applicant finished; the server is checking it (one request holds the claim, 5.1.4) | server |
| `completed` | the result is on file | server; the form and quiz triggers; `start` / `open_assessment_session` and the sweep (self-heal, see below); the reopen trigger (an attempt still open on the old result) |
| `failed` | checking crashed, or the request holding the claim died (a claim untouched for 7 minutes, below); the server still owes the result, and the next submit finishes this same attempt | server; `start` / `open_assessment_session`, the heartbeat and the sweep (an expired claim) |
| `abandoned` | marked "left" by `mark_stale_assessment_sessions` (not scheduled yet). **It comes back to life** if the applicant returns | sweep |
| `superseded` | a newer attempt replaced it | functions / server |

`end_reason` (free text, ≤ 64 chars). Use these values:
`submitted` (the applicant sent it: the form, the quiz, typing, the End
button), `ai_closed` (the interviewer ended the chat), `ended_early` (the
written interview's End button before the interviewer had closed),
`customer_resolved` (chat practice `[RESOLVED]`), `time_up` (a timer ran out),
`left` (the sweep), `result_recorded` (closed because the result was already
on file: by `start` / `open_assessment_session`, by the sweep, or by a staff
reopen), `superseded`, `staff_reset`.

**Who closes a session when its result lands.** The form: a trigger on
`applications` (status leaves `in_progress`). The quiz: a trigger on
`applications` (`notes.quiz.completedAt` or `notes.quizResult` appears;
`submit_quiz_attempt` writes them). Every other test: the edge function that
grades it (5.1.4).

**Self-heal.** If a result is on file but its session is still `active`
(written by a path that did not close it), the next
`start_assessment_session` / `open_assessment_session` call for that step, or
the sweep, marks the session `completed` with `result_recorded`. The sweep
never marks such a session `left`.

The same call also completes (`result_recorded`) an attempt of a finished
step stuck in `grading` or `failed` whose `updated_at` is **more than 7
minutes** old: the result landed, but the request that held the grading claim
died before it completed the attempt (no edge function runs that long, and
nothing grades a finished step again). A younger `grading` row is left alone,
because its request may be about to complete it with the full grading; a
younger `failed` one too. 7 minutes is the server's own stale-claim limit
(`STALE_GRADING_MS`, 5.1.4). Its `grading` (for a `failed` row,
`{last_error, failed_at}`) is kept for staff. The sweep does not do this for
a `failed` row.

**A dead grading claim.** A `grading` attempt nobody has written to for 7
minutes or more belongs to a request that was killed before it could
complete the attempt or mark it failed (the wall-clock limit, memory, a
restart). Nothing else would ever move it: the page waits on `grading`, and
`touch` and `start` only report it. So `start_assessment_session` /
`open_assessment_session`, `touch_assessment_session` and the sweep each
expire it when they see it (`assessment_expire_stale_claim`, under the
step's lock): `completed` with `result_recorded` when the step is finished
(the result landed first), otherwise `failed` with
`grading = {last_error: "claim_expired", failed_at}`. The page reads
`failed` as "owed" and sends the test once more, and the server claims it
from `failed` (5.1.4). A younger claim is never touched.

### 2.4 What counts as activity (`last_activity_at`)

It moves on:

- a `candidate_turn`, `quiz_shown`, `quiz_answer` or `typing_snapshot` event
  (this also clears `hidden_at`);
- `save_application_draft`;
- `start_assessment_session` on a live session (a reload);
- `touch_assessment_session` with `p_hidden: false` (they came back to the
  page) or `p_active: true` (the page saw input since the last beat: a key,
  a pick, a click or tap, the mouse wheel. Not the `scroll` event itself:
  the page scrolls by itself when the interviewer answers).

It does **not** move on a plain heartbeat, interviewer replies, integrity
events, system markers or a hidden heartbeat. A visible tab nobody touches is
not activity: an applicant who walks away from it reads as "Left … · last
active 25 min ago", as the owner asked. That is why the page must send
`p_active: true` while someone is typing a long answer they have not sent
yet; otherwise the interview reads "Left" while they are writing.

### 2.5 `progress` keys

Keys the server owns (the page cannot overwrite them):

| step | keys | written by |
| --- | --- | --- |
| application | `answered`, `total`, `draft_saved_at` | `save_application_draft` |
| quiz | `answered` (distinct questions answered), `total`, `current_question_id`, `current_index` (0-based) | `record_quiz_answer` |
| chat steps | `candidate_turns`, `assistant_turns` | events trigger |
| typing | `typed_chars`, `elapsed_ms` (from the latest snapshot) | events trigger |

The page's own hint (`{screen: "intro"}` and similar) is
`progress.client`, set through `touch_assessment_session(p_progress)` and
nowhere else. The computer and connection check has no server-owned keys:
everything staff read live is in its hint, `{screen: "computer" | "test" |
"result", device_kind, answer, run, step, runs_done, failed}`
(docs/EQUIPMENT-CHECK.md §3). Each hint **replaces** the previous one whole (send the full
hint object each time, at most 4 KB), so it can never grow. The W4 server may
add keys of its own, for example `question_count` for the interview. **Never put anything secret in
`progress`: `start_assessment_session` returns it to the applicant.**

### 2.6 `grading` (server only)

```json
{
  "graded_at": "2026-10-06T15:57:59Z",
  "model": "gpt-5.6-terra",
  "prompt_version": "chat-sim-eval-4",
  "fallback": false,
  "result": { "...": "the grader's full output, unabridged" }
}
```

What `result` holds, by step:

- **Chat practice:** `score, empathy, problemSolving, communication, professionalism, strengths, improvements, overallFeedback` (the lead rubric's own items when the case is a takeover), and since `chat-sim-eval-4` the reviewer's `spellingMistakes`. Beside `result`, the chat practice's own extra `typing: {replies: [{reply, chars, replySeconds, typing, wpm, correctionsPct, timed, pasteLike}], spelling_mistakes: [{line, word}] | null}`: each reply's timing and the spelling mistakes the server found in the applicant's lines, which `notes.chatSimulationResult.typing` was built from (docs/TYPING-IN-CHAT.md). It is not that block: staff read the block from notes only.
- **Written interview:** `score, recommendation, credibilityRating, strengths, concerns, inconsistencies, summary`. Use the same shape for both the End button and the auto-end.
- **Typing:** `{wpm, accuracy, score, requiredWpm, passed, formula: "gross WPM × word accuracy", word_errors: [{index, expected, typed}], attempts_before_submit}`.
- **Quiz**: **not written in this release.** Nothing changes `submit_quiz_attempt` in wave 2, so the quiz session is closed by the trigger when the result lands (2.3) with `grading` NULL. The staff record reads the score from `notes.quizResult`, each pick and its time from the `quiz_answer` events, and the right answers from `get_job_quiz_keys`. When a later migration has `submit_quiz_attempt` write it, the shape is `{score, correct, total, answers: [{question_id, picked, picked_text, correct_answer, is_correct, seconds_on_question}]}`: the only place a right answer may sit next to the pick, never in notes.

### 2.7 `integrity_summary`

```json
{
  "counts": { "tab_hidden": 2, "window_blur": 1, "paste": 1, "right_click": 1 },
  "total": 5,
  "away_ms": 75000,
  "short_away": 0,
  "dropped": 0,
  "first_event_at": "2026-10-06T15:49:58Z",
  "last_event_at": "2026-10-06T15:51:20Z"
}
```

- `total`: integrity events stored for this session (at most 500).
- `away_ms`: the sum of `duration_ms` over `tab_hidden` + `window_blur`.
- `short_away`: away episodes under 1 s (`duration_ms < 1000`). They are on
  the timeline but are not counted on the owner's card and never ping. **One
  threshold everywhere**: the database, the server, the staff record and the
  page (`useTestIntegrity` `SHORT_AWAY_MS`) all use 1,000 ms, so the applicant
  is warned about every switch the hiring team is told about.
- `dropped`: events not stored, either over a cap or malformed.

### 2.8 `public.assessment_step_reopens`: a step handed back for a retake

| column | type | meaning |
| --- | --- | --- |
| `application_id` | uuid, FK applications ON DELETE CASCADE | primary key with `step_id` |
| `step_id` | text | the step handed back |
| `job_id` | uuid | read by RLS (staff of the job may read it) |
| `reopened_at` | timestamptz | the latest hand-back (database time) |
| `reopened_by` | uuid | `auth.uid()` of the staff member; NULL for the service role or the SQL editor |
| `reopen_count` | int | how many times it was handed back |

Nobody writes it directly. The trigger `assessment_step_reopened` on
`applications` writes it when a write that is **not the applicant's own**
changes `phase` or `status` and leaves the row on `status = 'pending'` with
`phase` = a step id (not the form, not the quiz) whose result is on file. That
is what Ava's `move_applicant_to_phase` writes today, and what a future
"reopen" button should write. The same trigger closes any attempt of that step
still open on the old result (`completed`, `result_recorded`), so the retake
starts as a fresh attempt.

A step counts as reopened only while the marker is **newer than the result on
file** (the later of `notes._trusted[step].completedAt`, which only the server
writes, and the step's last completed attempt). So a hand-back is one retake:
once the retake's result lands the step is finished again, even though
`status` is still `pending` and `phase` still on the step. To hand it back a
second time, staff change `phase` or `status` again.

---

## 3. Event kinds and their `detail`

| kind | written by | `content` | `detail` (exact keys) | other columns |
| --- | --- | --- | --- | --- |
| `candidate_turn` | server (chat functions) | the applicant's message | `{role, typing?}`: `role` is `"agent"` in chat practice / sales, `"candidate"` in the interview. `typing` (chat practice only) is the page's keystroke summary for this reply, `{charsTyped, activeMs, corrections, keys, pasteLike}`, cleaned by the server (`ai-chat-simulation/typing.ts` `cleanReplyTyping`: whole numbers in range, corrections never more than keys, `pasteLike` only for a real true; anything else is left out) and read at grading only (docs/TYPING-IN-CHAT.md). A repeat of the same `client_msg_id` inserts nothing, so it keeps the first copy's `typing`. A transcript a previous-build page sent only at submit is stored with `source: "submitted_transcript"` | `client_msg_id` = the page's id for the message; `"srv:<uuid>"` when the page sent none (no retry safety); `"submit:<position>"` for a submitted transcript. `client_at` = when it was sent |
| `assistant_turn` | server | the full reply text | `{role, model}`. `role` is `"customer"` in chat practice / sales, `"interviewer"` in the interview. Optional extras: `resolved: true`, `closed: true`, `source: "submitted_transcript"` | `client_msg_id`: `"opener"` for the first message, `"reply:<candidate client_msg_id>"` for a reply (so a retried request never stores two replies), `"submit:<position>"` in a submitted transcript |
| `quiz_shown` | `record_quiz_answer` | – | `{question_id, question_index, client_shown_at?, client_shown_at_raw?}` | `client_msg_id` = `"shown:<question_id>"` (once per question per attempt); `client_at` = the page's shown time when plausible (4.6) |
| `quiz_answer` | `record_quiz_answer` | – | `{question_id, question_index, answer, seconds_on_question, shown_at, timing_source, changed, client_shown_at?, client_shown_at_raw?}`. `timing_source` is `server`, `client`, `previous_answer` or `attempt_start` | `duration_ms` = time on the question |
| `typing_snapshot` | server (`submit-typing-test`) | – | `{typed_text, target_text?, wpm, accuracy, elapsed_ms, final, attempt_run?, ended_by?, text_source?}`. Three kinds, by `client_msg_id`: **while typing** `"snap:<run start ms>:<5 s bucket>"` (`final: false`, `wpm`/`accuracy` may be null, `target_text` may be omitted: it is also in `context.target_text`); **a run's end** `"snap:<run start ms>:end"` (`final: false`, `ended_by: "time_up" \| "finished_early"`: the text as it stood when that run stopped, one per run, including runs later replaced by "Try again"); **the submitted text** `"final"` (`final: true`, **always** with `target_text`, `wpm` and `accuracy`; `text_source: "complete"` when it was taken from the run-end snapshot, `"request"` when a previous-build page sent it only at submit). The graded text is the `final` one. `attempt_run: n` names the run | `client_msg_id` as described |
| `integrity` | `record_integrity_events` | – | the page's own `detail` (minus the server's keys), plus `{kind, duration_ms?, reported_kind?, after_end?, client_at_raw?}`, which only the server writes: the page's own values for these keys are removed first, even where the server's value is "none" | `duration_ms`, `client_at` (only when plausible, 4.4), `client_msg_id` = the page's event id |
| `system` | functions / triggers / server | – | `{what, …}`. `what` is `started` (+`attempt`), `reloaded`, `came_back` (+`away_ms`), `submitted`, `marked_left`; from `connection-test` (docs/EQUIPMENT-CHECK.md §3–§4) the page's markers `device_read` (+`device_kind, os, browser, screen`), `computer_answer` (+`answer`: `yes`, `no`, `no_switched`, `ran_here_anyway`), `test_started` (+`run`), `test_finished` (+`run`, the page's own `download_mbps, upload_mbps, latency_ms`, `estimate: "page"`), and the server's `test_run` (+`run`, the server's figures, `sent: true` when `record` wrote it), `record_refused` (+`reason`), `submitted` (+`run, runs`); from the chat functions also `reply_asked` (the model is being asked again for a reply, or for the opener: the earlier ask failed or is older than 45 s, 5.1.2) / `reply_failed` (an ask produced no stored reply: the model failed, said nothing, or the reply could not be saved; + `reason`), both with `reply_for`: the message id the reply is for, `"opener"` for the first one. Readers skip a `what` they do not know | the opener's first ask has `client_msg_id` `"srv:opener"` (so two starts at once ask for ONE opener); others none |

### 3.1 Integrity kinds

| kind | what the page saw | on the owner's card | words on the card |
| --- | --- | --- | --- |
| `tab_hidden` | the page was hidden (tab switch, app switch, minimise). **One event per episode**, sent when they come back: `client_at` = when they left, `duration_ms` = how long | yes, if ≥ 1 s | "left the window N times (1m 12s away)" |
| `window_blur` | focus left the window but the page stayed visible (another monitor, split screen, an overlay). One event per episode, with duration, as above. If the page was also hidden during the episode, send `tab_hidden` instead, never both | yes, if ≥ 1 s | counted with the above |
| `paste` | a paste was blocked (event, Ctrl/Cmd+V, `beforeinput` insertFromPaste) | yes | "paste attempt xN" |
| `bulk_insert` | text arrived without a paste event: more than about 20 characters in one input (a phone clipboard chip), or a drop (`detail.via: "drop"`) | yes | "pasted-in text xN" |
| `copy`, `cut` | a copy/cut was blocked | yes | "copy attempt xN" |
| `screenshot_key` | PrintScreen (on **keyup**) | yes | "screenshot attempt xN" |
| `screenshot_suspected` | Meta+Shift held, then a blur within ~1.5 s (a macOS / Windows snip) | yes | "possible screenshot xN" |
| `devtools` | developer tools detected | yes | "developer tools opened xN" |
| `page_closed` | `pagehide` during a running test (closed or reloaded) | yes | "closed the test page xN" |
| `right_click` | a context menu was blocked | recorded only | – |
| `other` | anything else, e.g. a blocked Ctrl+P/S (`detail.what: "shortcut", key`). An unknown `kind` is stored as `other` with `detail.reported_kind` | recorded only | – |

Two kinds were added beyond the first draft of this contract, for these
reasons. `page_closed` exists because the rules card promises "closing or
reloading this page is recorded", and a closed tab ends without a "came back"
moment. `bulk_insert` exists because text dropped in, or inserted by a phone
keyboard chip, never fires a paste event. Both alert the owner.

---

## 4. Functions

All of them are `SECURITY DEFINER`, `search_path = public, pg_temp`, and
revoked from `PUBLIC` and `anon`. The candidate functions are granted to
`authenticated` (and `service_role`). The server-only ones are granted to
`service_role` alone.

### 4.1 Errors (candidate functions)

PostgREST passes these through as `error.code`. The message is a stable token
and `DETAIL` explains it.

| code | message | meaning | what the page does |
| --- | --- | --- | --- |
| `42501` | `not_signed_in`, `not_your_application`, `not_your_session` | wrong person, or no such application | stop recording |
| `HF001` | `application_closed` | rejected, hired or offered | stop recording |
| `HF002` | `unknown_step` | not a step of this job, the Decision stage, or the wrong step for this function | stop recording |
| `HF003` | `step_not_reached` | the applicant is not on this step yet | stop recording; the step gate handles navigation |
| `HF004` | `step_finished` | the result is on file, or it is being checked | show the done/waiting screen |
| `HF005` | `session_full` | 5,000 events in one session | stop recording |
| `22023` | `events_must_be_an_array`, `answers_must_be_an_object`, `draft_too_large`, `unknown_question`, `answer_too_large`, `progress_must_be_a_small_object` | bad argument | a bug in the page |
| `22P05` | (Postgres, before the function runs) `unsupported Unicode escape sequence` | a U+0000 character in a jsonb argument | never retry it (it can never succeed). The page prevents it: see below |
| `PGRST202` | (PostgREST) | the function is not deployed yet | stop recording; never block the test |

**Recording must never block a test.** If a call fails, the applicant carries
on. Retry network errors from an outbox. Never retry the codes above.

**Strip U+0000 before every call.** Postgres refuses a `\u0000` inside any
`jsonb` argument (22P05) before the function body runs, so the server cannot
repair it. A NUL can arrive in pasted-in form answers (a PDF through a phone
keyboard's clipboard chip). The page replaces each `\u0000` with U+FFFD in every
string and key in `p_answers`, `p_answer`, `p_events` and `p_progress` before
sending (the same rule as the server's `withoutNul`, so two keys that differ
only by a NUL stay apart), and treats 22P05 as "drop", never "retry".

### 4.2 `start_assessment_session(p_application_id uuid, p_step_id text) → jsonb`

Call it when a test starts (the Start button) and whenever a test page mounts
on a step that is not finished, which covers resuming after a reload. It finds
or creates the attempt:

- If an attempt is live, it is used and gets a `reloaded` marker.
- If an `abandoned` attempt exists, it comes back to life with a `came_back`
  marker.
- If the last attempt `failed` (the server owes a result), it is returned as
  it is. If staff reopened the step, it is marked `superseded` instead and a
  new attempt opens.
- If the last attempt is `grading` and its claim is 7 minutes old or more
  (the request holding it died, 2.3), it is marked `failed`
  (`claim_expired`) first and then handled as above: the reply says
  `status: "failed"`, and the page sends the test again. A younger
  `grading` attempt is returned as it is (`status: "grading"`): the page
  shows its "being checked" screen.
- If there is none yet, or the last one completed (a step staff reopened, or
  a quiz staff handed back by clearing its result), attempt n+1 is created
  with a `started` marker.
- Before reviving or creating an attempt, the access rule runs again under a
  per-step lock. If the step finished in the meantime (the form was sent
  while a draft save was in flight), the call fails with `HF004`
  `step_finished` instead of opening an attempt nothing would ever close.
  The same applies to every function that opens an attempt.

Example reply:

```json
{
  "session_id": "4e97b1a3-…",
  "step_id": "step_chat",
  "step_type": "chat_simulation",
  "attempt": 1,
  "status": "active",
  "started_at": "2026-10-06T15:48:40Z",
  "last_activity_at": "2026-10-06T15:51:20Z",
  "ended_at": null,
  "progress": { "candidate_turns": 4, "assistant_turns": 5 },
  "integrity": { "total": 3, "away_count": 2 },
  "turns": [
    { "seq": 2, "kind": "assistant_turn", "content": "Hi, my deposit is missing.", "client_msg_id": "opener", "created_at": "…" },
    { "seq": 3, "kind": "candidate_turn", "content": "Sorry to hear that…", "client_msg_id": "m1", "created_at": "…" }
  ],
  "draft": null,
  "quiz": null,
  "finished": false,
  "resumed": true,
  "server_now": "2026-10-06T15:51:31Z"
}
```

- `turns` holds only `candidate_turn` and `assistant_turn`, in `seq` order.
- `draft` is set for the application step only.
- `quiz` is set for the quiz only, as
  `{"answers": {"zq1": 1, "zq2": 0}, "shown_at": {"zq1": "…"}}`. These are
  the latest answers and the first time each question was shown. Nothing about
  correctness.
- `server_now` lets the page correct its clock (quiz deadlines).
- **When the step is finished**, the reply is the latest attempt with
  `finished: true`, `resumed: false` and `turns: []`. No new attempt is opened.
  First, an attempt of that step still `active`, or stuck in `grading` /
  `failed` for more than 7 minutes, is completed with `result_recorded`
  (2.3, Self-heal). A `grading` attempt younger than that is returned as it
  is (`status: "grading"`): the page shows its "being checked" screen.

`open_assessment_session(p_application_id, p_step_id, p_candidate_id) → jsonb`
is the same thing for the **service role**. An edge function that has
verified the caller's JWT itself (as `recordStepResult` does) passes the user
id. Edge functions get the `session_id` this way and **never take a session
id from the request body** without checking it against the application and
the caller.

### 4.3 `touch_assessment_session(p_session_id uuid, p_hidden boolean default null, p_progress jsonb default null, p_active boolean default null) → jsonb`

(`p_active` is new in this revision of the contract. There is exactly one
signature, so PostgREST never sees two candidates for a call.)

The heartbeat. Send it every 30 s while visible (`p_hidden` null), at once on
`visibilitychange` (`true` when hidden, `false` when visible again), and on
`pagehide` (`true`, sent with a keepalive fetch, see 6.3).

- `p_active: true` on any beat after the page saw input (a key, a pick, a
  click or tap, the mouse wheel) since the previous beat. A beat without it only moves
  `last_heartbeat_at`; it is **not** activity (2.4).
- `p_hidden: false` (back on the page) is activity; `p_hidden: true` is not.
- `p_progress` (an object ≤ 4 KB) **replaces** `progress.client`. Send the
  whole hint each time it changes.

```json
{ "session_id": "…", "updated": true, "status": "active", "hidden": false,
  "last_activity_at": "…", "server_now": "…" }
```

If the session is no longer `active`, nothing changes and the reply is
`{updated: false, status}`. When the page sees `grading` or `completed`, the
server has ended the test and the page should show that. A closed application
gives `{updated: false, reason: "application_closed"}`. One exception: a
`grading` claim 7 minutes old or more is expired first (2.3), so a page
waiting on "being checked" reads `failed` (send it again) or `completed`
within one beat instead of waiting for ever.

### 4.4 `record_integrity_events(p_application_id uuid, p_step_id text, p_events jsonb) → jsonb`

```json
[
  { "kind": "tab_hidden", "client_at": "2026-10-06T15:49:58.120Z", "duration_ms": 67000,
    "id": "0b5e…uuid", "detail": { "visible_again_at": "…" } },
  { "kind": "paste", "client_at": "…", "id": "9c1d…uuid", "detail": { "target": "reply" } }
]
```

- `id` is optional but recommended: a uuid per event, so a retried batch is
  stored once.
- `detail` is optional: an object ≤ 2 KB. Anything larger is replaced with
  `{truncated: true}`. The keys the server writes (`kind`, `duration_ms`,
  `reported_kind`, `after_end`, `client_at_raw`) are removed from it first,
  so a page can never mark a live event "after sending" or "200 ms".
- `duration_ms` is clamped to 0…24 h. Send it at the top level only.
- `client_at` is stored only if it is a real time within
  [the attempt's start − 1 day, now + 10 minutes]. Anything else
  (unparsable, `infinity`, `epoch`, a clock far off) is stored as NULL and
  the page's text goes to `detail.client_at_raw`, so one bad clock cannot
  shift the staff timeline. The page sends its device time; a device more
  than 10 minutes fast loses `client_at` (staff then read `created_at`).
- At most 100 events are stored per call and 500 per session. The rest are
  counted in `integrity_summary.dropped`.
- There must be a live session for the step. If there is none, the attempt is
  opened as `start` would open it. Events that arrive **within 2 minutes after
  the session ended** (the flush from a closing tab) are kept with
  `detail.after_end: true`. Later ones get `HF004`.

```json
{ "session_id": "…", "accepted": 2, "duplicates": 0, "dropped": 0, "total": 5,
  "alerted": true, "server_now": "…" }
```

**The owner's card.** On any alerting event (3.1) in any step except the
application form, the card is rewritten from the whole `integrity_summary`
and upserted for each recipient. The recipients are the job's employer and
every active team member scoped to the job: the same people
`notify_new_application_submitted` notifies.

| field | value |
| --- | --- |
| `type` | `integrity` (new `notification_type` value) |
| `title` | `Integrity — <full name, else email, else "A candidate">` |
| `message` | `During <the job's own step title>: left the window 3 times (1m 12s away), paste attempt x1` (the parts appear in the order of 3.1) |
| `link` | `/applicants/<application_id>` |
| `group_key` | `integrity:<application_id>:<step_id>` |
| `is_read` | set back to `false` on every alerting event |
| `created_at` | set to `now()` on every alerting event, so the card moves to the top. For a grouped card this means "last updated" |

There is one row per `(user_id, group_key)`. The first event INSERTs the row
(the existing push trigger fires once, and push is not configured anyway).
Every later event UPDATEs that row. If the owner has deleted the card, the
next event creates a new one. An alert failure is logged and never loses the
events.

**Only the server writes these cards.** Production lets an applicant insert a
notification for the employer of a job they applied to, so the trigger
`notifications_grouped_cards_server_only` refuses (`42501`) any INSERT from a
browser (`anon` / `authenticated`) that has a `group_key` or type
`integrity`, and any browser UPDATE that changes such a card's `group_key`,
`type`, `user_id`, `title`, `message` or `link`. The owner can still mark it
read or delete it. Inside `assessment_integrity_alert` (security definer),
edge functions (`service_role`) and migrations, nothing changes.

### 4.5 `save_application_draft(p_application_id uuid, p_answers jsonb) → jsonb`

This works only while the application's status is `in_progress`. Afterwards it
returns `HF004`.

`p_answers` is an object keyed by the **job's application question id**. A
value is a string, or an array for pick-several questions. Keys starting with
`_` carry the form's own extra state (`_phoneCountryCodes`, `_coverLetter`, …)
and are not counted. The maximum size is 64 KB.

```json
{ "fq1": "Robin Okafor", "fq2": ["Mornings", "Weekends"], "fq3": "555 0100",
  "_phoneCountryCodes": { "fq3": "+1" } }
```

`answered` counts the job's questions that have a filled value: a string that
is not blank, a non-empty array, an object, a number or `true`. `total` is the
number of questions on the job.

```json
{ "session_id": "…", "answered": 3, "total": 11, "saved_at": "…" }
```

When the applicant submits the form (status `in_progress` → anything else),
a trigger on `applications` completes the form session
(`end_reason: submitted`, with a `submitted` marker). The trigger never blocks
the submission.

### 4.6 `record_quiz_answer(p_application_id uuid, p_question_id text, p_answer jsonb, p_shown_at timestamptz default null) → jsonb`

It works for the standard quiz only: step id `quiz`, with questions from
`jobs.quiz_questions`. That is the only quiz the journey has. A question id is
the question's `id`, or `__idx_<n>` when it has none, the same ids
`submit_quiz_attempt` uses.

- **`p_answer` null** means "this question is on screen now". Call it the
  moment each question is displayed. It records `quiz_shown` once per
  question per attempt, and the server's time is the one that counts.
  `p_shown_at` (the page's clock) is stored as `client_at` /
  `detail.client_shown_at` only within the same window as integrity
  `client_at` (4.4); otherwise its text goes to `detail.client_shown_at_raw`.
  `progress.current_question_id` / `current_index` move. The reply is
  `{session_id, recorded: "shown", question_index, shown_at, server_now}`.
- **`p_answer` set** (the pick: an index or option text, as the page holds it,
  ≤ 4 KB) records `quiz_answer`, with the time since the question was first
  shown. The start of that time is, in order of preference: the server's
  shown time; else `p_shown_at` if it lies inside this attempt; else the
  previous answer; else the attempt's start. `detail.timing_source` says which
  was used. Changing an answer adds another event marked `changed: true`, and
  staff read the latest one. The reply is
  `{session_id, recorded: "answer", answered, total, seconds_on_question, server_now}`.
- **Correctness is never computed, stored or returned here.** Grading stays
  in `submit_quiz_attempt`.
- After the quiz is submitted (`notes.quiz.completedAt` / `notes.quizResult`)
  or while it is being checked, the function returns `HF004`.
- When `submit_quiz_attempt` writes the result, a trigger closes the quiz
  session (`completed`, `submitted`, a `submitted` marker). Nothing else has
  to.

### 4.7 Server-only

- `open_assessment_session(p_application_id, p_step_id, p_candidate_id)`: see
  4.2, including the self-heal of a finished step's attempts (2.3).
- `assessment_integrity_alert(p_session_id) → int`: rewrites the card for a
  session. Use it if the server ever changes `integrity_summary` itself.
- `mark_stale_assessment_sessions(p_idle_minutes int default 30) → int`: marks
  `active` sessions that have been quiet that long (minimum 10 minutes) as
  `abandoned` / `left`, except a session whose step is already finished,
  which it completes (`result_recorded`) instead, and expires every
  `grading` claim 7 minutes old or more (2.3). Returns how many it
  changed. It is **not scheduled.** pg_cron is not installed, and turning it
  on is the owner's decision. When it is, schedule
  `select public.mark_stale_assessment_sessions();` every few minutes.
- Internal helpers (not for direct use): `assessment_step_access`,
  `assessment_step_completion` (`{result_on_file, reopened, finished}` for
  one step: the one answer to "is it finished"),
  `assessment_expire_stale_claim` (a dead grading claim, 2.3),
  `assessment_session_for_write`, `assessment_session_payload`,
  `assessment_journey`, `assessment_notes_object`, `assessment_jsonb_truthy`,
  `assessment_duration_text`.
- Triggers (never called directly): `assessment_sessions_before_write`,
  `assessment_events_before_insert`, `assessment_events_append_only`,
  `assessment_application_form_submitted`, `assessment_quiz_result_landed`,
  `assessment_step_reopened`, `notifications_grouped_cards_server_only`.

### 4.8 The rules for "reached" and "finished" (one place: `assessment_step_access`)

- **Journey** (`assessment_journey`, mirroring `buildCandidateJourney`): the
  application; then the quiz, if `jobs.quiz_questions` is a non-empty array;
  then each `jobs.workflow_steps` entry that has an id and a type and is not
  an application/quiz entry, in the order configured; then `decision`.
- **Position** (mirroring `positionFor`): the first step whose id or type
  equals `phase`. If there is none and the status is pending, reviewing,
  interview, offered, hired or rejected, the position is Decision. Otherwise
  it is the first step. The applicant has **reached** a step when their
  position index is at or after the step's index.
- **Finished**:
  - application: the status is no longer `in_progress`.
  - quiz: `notes[step].completedAt` or `notes.quizResult` is present. This is
    the same test `submit_quiz_attempt` uses, with no reopen carve-out.
  - every other step: its result key holds a value (as in
    `journeyProgress.ts stepHasResult`), unless the step was **reopened for a
    retake**: status `pending` with `phase` equal to the step (the rule every
    phase page uses, `isRetakeOpen`) **and** a staff reopen marker newer than
    the result on file (2.8). The status and phase alone are not enough: the
    applicant can set their own status to `pending`, and before this rule
    that reopened any step whose phase had not moved on yet (an auto-mode
    step whose move was not triggered, every step of a manual-mode job),
    letting the result be graded again and overwritten.

**When `buildCandidateJourney`, `positionFor` or `stepHasResult` changes,
change `assessment_journey` / `assessment_step_completion` in a new
migration.** The one-shot guard on grading (W4's `resolveSession` /
`gateGrading`) reads `finished` from here, so it is exactly as strong as this
rule.

---

## 5. What each builder writes

### 5.1 Server (edge functions, service role): W4

1. **Get the session.** Verify the JWT (`auth.getUser`), then call
   `open_assessment_session(applicationId, stepId, user.id)`. Persist
   **only when the request carries the new fields** (candidate JWT +
   `applicationId` + `stepId`). A browser still on the previous build sends
   none of them and must keep working exactly as before.
2. **Chat turns** (`ai-chat-simulation`, `ai-chat-interview`, `submit-sales-simulation`):
   - Insert the `candidate_turn`
     `{session_id, kind, content, client_msg_id, client_at, detail: {role, typing?}}`
     **before** calling OpenAI (`typing`: chat practice only, the request's
     keystroke summary cleaned, section 3). Rebuild the history from the stored turns,
     never from the request body.
   - After the stream completes, insert the `assistant_turn`
     `{session_id, kind, content: <full text>, client_msg_id: "reply:<id>", detail: {role, model}}`.
   - On start, if the session already has turns, return them. Do not ask for a
     second opener. The opener's `client_msg_id` is `opener`. The first start
     records the ask as a `system` `reply_asked` marker with `client_msg_id`
     `"srv:opener"`; a second start at the same moment (a reload while the
     opener streams, a second tab) inserts nothing there, so it waits for that
     opener and returns the resume JSON with it instead of asking again.
   - **The applicant's message is stored or the request stops.** The insert is
     tried three times (pauses of 250 ms and 750 ms). If it still fails, the
     function answers **503 `{error, code: "turn_not_saved", retryable: true}`**
     and the model is not asked, so the page sends it again (same
     `clientMsgId`, which is idempotent). A full session (`HF005`) is never
     retried: that message is answered without being recorded. If the message
     was stored but the conversation cannot be read back, the request's
     history is used and the reply is still recorded.
   - **A message sent again before its reply is stored** (a reload during the
     stream, a dropped connection) waits for the reply the first request is
     still streaming and plays that one back, so the applicant sees the reply
     the record keeps. It asks the model again only when the latest ask has a
     later `reply_failed` marker (the model failed or said nothing, or the
     reply could not be saved) or is older than **45 s** (`REPLY_WINDOW_MS`:
     its request died without saying so); that ask writes a `reply_asked`
     marker. So a resend can take up to 45 s before its stream starts. A
     first reply slower than 45 s can be asked twice; the record keeps the one
     saved first.
   - Pin the scenario and the inputs in `context` on the first start:
     `update assessment_sessions set context = … where id = …`.
3. **Typing** (`submit-typing-test`):
   - On start (and on each "Try again"), set the typing context (2.1:
     `target_text, required_wpm, run, run_started_at, runs`;
     `typing_test_starts` keeps doing its job too).
   - **A run that could never be graded is refused before it starts**, and
     before `typing_test_starts` is reset: a finished step answers
     **409 `{code: "step_finished"}`**, an attempt being checked right now
     **409 `{code: "already_checking"}`** (a stale claim does not block: the
     next submit takes it over). Otherwise the applicant types a whole run
     that the submit answers with the old result, and it is lost.
   - Snapshots arrive as `typing_snapshot` (3: while typing, a run's end,
     the submitted `final`).
   - On submit, insert the `final: true` snapshot, set `grading`, and set
     `status = 'completed', ended_at = now(), end_reason = 'submitted' | 'time_up'`.
4. **Grading and closing: one request grades an attempt** (`gateGrading`,
   decided before anything is spent).
   - **Claim** with a compare-and-set from the status it read (`active`,
     `failed`: the result is still owed, or `abandoned`):
     ```
     update … set status = 'grading'
     where id = $1 and status = <the status read>
     returning id
     ```
     A row back: this request holds the claim, and only it completes the
     attempt.
   - **No row back, or already `grading`**: another request is checking it.
     Wait up to **45 s** (`GRADING_WAIT_MS`) for that one: `completed` →
     answer with the result on file; it let go (`active` / `failed`) → claim
     once more; still `grading` → **409 `{error, code: "already_checking"}`**.
   - **A stale claim is taken over.** A `grading` row whose `updated_at` is
     **7 minutes** old or more (`STALE_GRADING_MS`: longer than any edge
     function runs, so its request died) is claimed with
     `where id = $1 and status = 'grading' and updated_at < now() − 7 min`.
     The database expires such a row on its own as well (2.3): `start`,
     `open_assessment_session`, the heartbeat and the sweep turn it into
     `failed` (`claim_expired`), or `completed` when the step is finished, so
     the page learns it must send again and the next submit claims it from
     `failed`.
   - **The result is already on file** (the step is finished and not handed
     back): no model call, no write. The answer is **200 with the recorded
     result in the function's usual shape plus `alreadyRecorded: true`**
     (typing `{results, next}`, chat practice
     `{chatSimulationResult, phaseAiAnalysis, next}`, interview `{next}`,
     sales `{success, next}`; chat practice's `phaseAiAnalysis` is rebuilt
     from the stored scores, never read from the `phase_ai_analysis` column,
     which the hiring team's own analysis overwrites), or
     **409 `{error, code: "already_recorded"}`**
     when that result cannot be read back. A request body is never graded
     over a result on file.
   - **No record at all** (the migration not applied, a page on the previous
     build without ids, a database error): grade exactly as before.

   When the result is recorded (in `recordStepResult`, after the notes merge
   succeeds), set `grading = {…}` and `status = 'completed'`,
   `ended_at = coalesce(ended_at, now())`, `end_reason`, only from `grading`
   when the claim is held (from the open statuses when no claim could be
   made); the write is tried twice and a second failure is logged as
   `SESSION LEFT UNFINISHED` (the 7-minute self-heal in 2.3 then closes it).
   If the step refuses the result, the claim is released back to the status
   it was taken from. On a crash, set `status = 'failed'` and put the error
   under `grading.last_error`. The interview and sales submit answers no
   longer carry `evaluation`, and the interview's old unauthenticated
   `evaluate` mode (the real grader, run on any posted transcript) is gone
   (400 `unknown_mode`): the full employer-facing grading is written only to
   `session.grading`. **What the applicant can still read** (rule 1's
   "keep current shapes" exception, unchanged in this release):
   `notes.chatInterviewResult` keeps its two shapes, so the End button's
   holds `score, strengths, concerns, recommendation` and the interviewer's
   own close holds the whole `evaluation` (credibility rating and
   inconsistencies included); `applications.phase_ai_analysis` holds
   "Interview: <recommendation> (<score>%). <summary>" until
   `trigger-ava-analysis` replaces it with its own analysis, which can be a
   decline note. Both are readable by the applicant ("Candidates can view
   their own applications"). Moving them out needs reader changes
   (`trigger-ava-analysis`, `CondensedAIAnalysis`, the staff mappers) and is
   the owner's decision.
5. **Quiz**: nothing to do in this release. `submit_quiz_attempt` is not
   changed in wave 2; the trigger `assessment_quiz_result_landed` completes
   the quiz session when the result lands, with `grading` NULL (2.6). A
   later migration that has `submit_quiz_attempt` write `grading` must keep
   correctness out of notes.
6. **Integrity from the request body** (the old `violations` arrays) stays in
   the existing notes shapes for current readers. The timeline the staff UI
   reads comes from `integrity` events.
7. Every insert goes through the events trigger. **Never insert
   `assessment_sessions` directly**: use `open_assessment_session`, so attempt
   numbering and the one-live-row rule hold.
8. **One-shot grading** reads `finished` from `assessment_step_access` (or a
   `step_finished` from `open_assessment_session`). A retake needs a staff
   reopen marker (2.8); the applicant setting their own status to `pending`
   no longer reopens a finished step, so a request body can never be graded
   over a result on file.
9. **Moving on does not depend on the tab** (`_shared/stepMoveOn.ts`). In an
   auto-mode job every test above records its result with `advance: "never"`,
   and the move to the next step, Ava's score and (before a voice interview)
   the employer's "ready for interview" notice all come from
   `trigger-ava-analysis`'s auto path. Until now only the page asked for it,
   after its submit answered; a tab closed while the result was being graded
   left the applicant on the step for good. So right after a result is
   recorded (`submit-typing-test` submit, `ai-chat-simulation` evaluate,
   `ai-chat-interview` submit on both paths, `submit-sales-simulation`), the
   function calls `scheduleStepMoveOn`, which works in the background
   (`EdgeRuntime.waitUntil`) and never blocks or fails the answer:
   - It is scheduled only with a signed-in user's JWT (the request's own
     `Authorization`, passed on unchanged: `trigger-ava-analysis` accepts only
     a user JWT) and both ids. The job's `processing_mode` is read from the
     database at once; a manual job asks nothing (its page asks with
     `autopilotDecision: false`, and the manual path with `true` would park
     or move people).
   - **It waits 20 s** for the page's own ask (sent within a second or two of
     the submit's answer, and once more 3 s later), then reads the
     application and plans the move exactly as `trigger-ava-analysis` will
     (`planAutoAdvance`). Still on the step: nobody asked, so it POSTs the
     page's own body `{applicationId, autopilotDecision: true,
     currentPhaseId: <stepId>}` to `/functions/v1/trigger-ava-analysis`.
     Already moved on: the page's request did it, and started the analysis:
     nothing. Closed, moved elsewhere, no result, manual now: nothing.
   - **Before a voice interview** the phase never moves (the employer sets the
     interview up), so the page's request leaves no trace until its analysis
     is saved. It looks again at **75 s** and asks unless an analysis that
     started after the result is stored (`analysisCoversStep`) or the
     employer's `interview` notice for `/applicants/<id>` is newer than the
     result (it is sent even when the analysis fails).
   - **Why it waits instead of asking at once.** The move is idempotent
     (compare-and-set; a repeat reads `already_advanced`), but the analysis
     is not, for its first ~40 s: a repeat is recognised only once a stored
     analysis has read the step, and that is saved when the run ends. Asking
     with the page would run Ava twice on every step and, before a voice
     interview, notify and email the employer twice.
   - Both waits are cut short to ask at least 15 s before the JWT expires
     (its `exp`, read only for timing). A failed ask (network, timeout,
     429, 5xx) is tried once more after 3 s, unless the application now shows
     the first ask landed; a 4xx is not. Every outcome is logged
     (`[step-move-on]`). The usual case keeps the worker 20 s past the
     submit (75 s before a voice interview); the worst case (two failed asks
     before a voice interview) about two minutes. The edge runtime's wall
     clock is 400 s on paid plans (150 s on free, where a slow grading plus
     that worst case could be cut off: the move is then lost, as before).
   - The page keeps its own call: it moves an open tab on at once, and
     whichever ask comes second gets the idempotent answer. A page whose own
     ask comes more than 20 s late, or a voice-interview step whose analysis
     takes longer than 75 s, can still start a second analysis: rare, and
     the later run only overwrites the earlier one.
10. **The computer and connection check** (`connection-test`; the contract is
   docs/EQUIPMENT-CHECK.md). `record` grades like a typing submit: one
   request per attempt (`gateGrading`), **409 `{code: "already_checking"}`**
   while another holds the claim, **409 `{code: "step_finished"}`** when the
   step is finished and its result cannot be read back, `{results, next,
   alreadyRecorded: true}` when it can. It writes `grading = {graded_at,
   model: null, prompt_version: "connection-stamps-1", fallback: false,
   result, stamps, ip, userAgent, raw}` (`raw` is the page's request body
   without the stamps) and `end_reason = 'submitted'`, then the `test_run`
   (`sent: true`, a no-op when the page's `test_finished` already wrote that
   run) and `submitted` markers. A refused chain releases the claim and
   leaves a `record_refused` marker. `op=event` writes the page's markers on
   the live attempt (`purpose: "turns"`, so a finished step opens nothing),
   pins the job's bars in `context.bars` once (the step config's
   snake_case shape), and for a `test_finished` that carries its stamps adds
   that run's `test_run` with the server's figures. It records with
   `advance: "never"`; the move on is `scheduleStepMoveOn` (9).

### 5.2 Candidate pages: W5

- **Rules before each test** (`TestRulesNotice`, wave 1): copy and paste are
  off, don't switch screens, every switch is recorded and the hiring team is
  told.
- **Start**: call `start_assessment_session` when Start is pressed, and again
  on mount for an unfinished step (resume). Restore from its reply: chat
  `turns`, quiz `answers`/`shown_at` (with `server_now` for deadlines), the
  form `draft`.
- **Heartbeat**: 4.3. Send `p_active: true` on a beat whenever the page saw
  input since the previous one (keys in a reply box count even before the
  message is sent; the `scroll` event does not, 2.4). Without it a beat is not activity, and a long unsent
  answer reads as "Left" after 10 minutes. Send the whole `p_progress` hint
  each time it changes: it replaces the previous one.
- **Integrity**: one shared hook. Use document-level capture listeners. Send
  one away episode per switch, on return, with `client_at` = when they left
  and `duration_ms`. Each event gets a uuid `id`. Send events live, keep them
  in a localStorage outbox while offline, and flush on reconnect and on
  `pagehide` (keepalive). On `pagehide` during a running test, send
  `page_closed`. The application form uses the same hook (its events never
  alert). The short-away threshold is **1,000 ms** (`SHORT_AWAY_MS`), the
  same as the server's: a switch of 1.2 s is one the applicant is told about,
  because the hiring team is told about it. Never put `kind`, `duration_ms`,
  `after_end`, `reported_kind` or `client_at_raw` in `detail`: the server
  removes them.
- **Replace U+0000** (with U+FFFD) in every string and key before each call (4.1).
- **Form**: `save_application_draft` about 1.5 s after the last change, and on
  `visibilitychange` hidden.
- **Quiz**: `record_quiz_answer(q, null)` when each question appears, and
  `record_quiz_answer(q, answer)` on each pick.
- **Errors**: 4.1. Recording never blocks or interrupts the test.
- **Answers from the test functions** (5.1.2, 5.1.4):
  - **503 `{code: "turn_not_saved", retryable: true}`** on start/respond: the
    message was not stored. Put the text back in the input, or send it again
    with the same `clientMsgId`; never leave an unanswered bubble.
  - **409 `{code: "already_checking"}`** on submit/evaluate: another request
    is still grading this attempt. Show the "being checked" screen (the
    heartbeat says `grading`); the result arrives on the row. A wait the page
    did not start with its own send (a reload while it is checked, End
    pressed on another device) compares the stored result against the one
    the page **first read** (`useResultKeyAtFirstLoad`), never the one
    cached when the wait began: the page's realtime refresh usually brings
    the new result in before the heartbeat says `completed`.
  - **200 with `alreadyRecorded: true`**: the result was already on file.
    Treat it as success. **409 `already_recorded`**: the same, but the
    result could not be read back; re-read the application.
  - A message sent again while its reply is on its way can take **up to 45 s**
    before its stream starts: keep the typing indicator up.
  - A claim whose request died is expired by the server (2.3): the
    heartbeat (or the start reply after a reload) then says `failed`, and
    the page sends the test once more ("owed"). Nothing to time on the page.
  - **A finished step is never offered again.** The chat practice,
    interview, sales and typing pages read `finished` from the start reply
    before they show Start: their own rule (`isRetakeOpen`: status
    `pending`, phase on the step) cannot tell a staff hand-back from a
    manual-mode job, which never moves phase. (The form and the quiz have
    no such rule: their "finished" never has a reopen carve-out.)
    `finished` → the done state (auto mode asks for the move, as after a
    send; manual mode shows "saved" with `NextStepCard`'s `doneStepId`, which
    never offers that step again); `grading` → the waiting screen. Typing's
    `start` answers 409 `step_finished` / `already_checking` the same way
    (5.1.3). The candidate overview (`whereCandidateStands`) still reads the
    retake shape on its own and can offer the step: that page does not call
    `start` yet.
  - The interview and sales submit answers no longer include `evaluation`.
  - After a submit in an auto-mode job, keep calling `trigger-ava-analysis`
    as today; the server asks as well (5.1.9), so a closed tab still moves on.

### 5.3 Staff record: W6

**Queries** (RLS does the scoping; there is no read RPC):

```ts
// Every attempt for one applicant (the record sheet).
supabase.from("assessment_sessions")
  .select("id, step_id, step_type, attempt, status, end_reason, started_at, last_activity_at, last_heartbeat_at, hidden_at, ended_at, progress, context, grading, draft, integrity_summary, updated_at")
  .eq("application_id", applicationId)
  .order("started_at");

// Live progress for a job's list: only the open ones.
supabase.from("assessment_sessions")
  .select("id, application_id, step_id, step_type, attempt, status, last_activity_at, hidden_at, progress, integrity_summary, updated_at")
  .eq("job_id", jobId)
  .in("status", ["active", "grading", "abandoned"]);

// One attempt's full timeline: transcript, quiz timing, typing, integrity, markers.
supabase.from("assessment_events")
  .select("seq, kind, content, detail, duration_ms, client_at, created_at")
  .eq("session_id", sessionId)
  .order("seq");

// The applicant's whole integrity timeline across tests.
supabase.from("assessment_events")
  .select("session_id, seq, detail, duration_ms, client_at, created_at")
  .eq("application_id", applicationId)
  .eq("kind", "integrity")
  .order("created_at");
```

**Realtime.** `assessment_sessions` is in `supabase_realtime`;
`assessment_events` is not. Subscribe to
`postgres_changes` (`event: "*"`, `table: "assessment_sessions"`, filter
`application_id=eq.<id>` on the sheet, or `job_id=eq.<id>` on the list). Use
a **per-instance channel topic** (`useId`), as `useEmployerLiveSync` does.
Every event insert also updates its session row, so when a session row
changes, fetch that session's events with `seq > <last seen>`.

**Where each part of the record comes from:**

- **Chat practice / written interview transcript**: `candidate_turn` +
  `assistant_turn` in `seq` order, using `detail.role` for the speaker and
  `created_at` for times. The full grading is `session.grading.result`, and
  the scenario is `session.context`. For attempts from before this release,
  fall back to the notes shapes, which wave 1's `assessmentRecord.ts` already
  reads.
- **Typed text vs the passage**: the `final: true` `typing_snapshot`
  (`typed_text`, `target_text`), plus `grading.result.word_errors`. Each
  run's end snapshot (`snap:<ms>:end`, `final: false`, `ended_by`) is what
  that run looked like when it stopped, including runs replaced by "Try
  again"; the `final` one is the text that was graded.
- **Time per quiz question**: the latest `quiz_answer` per `question_id`,
  using `detail.seconds_on_question`. Mark `timing_source` other than
  `server` as approximate. Correct answers come from `get_job_quiz_keys`
  (the quiz session's `grading` is not written in this release, 2.6).
- **Integrity timeline**: `integrity` events. Show the time (`client_at` when
  present, else `created_at`; `client_at` is NULL when the page's clock was
  implausible, and `detail.client_at_raw` then holds what it said), the words
  from 3.1, and for away episodes the away time from `duration_ms` ("Left
  the window for 1m 7s"). Show `after_end` events as "after sending" (only
  the server sets it). Sub-second blips may be collapsed.
- **Retakes**: `isRetakeOpen` (status `pending`, phase on the step) is what
  the applicant's pages show, and the applicant can produce it themselves.
  A real hand-back has a row in `assessment_step_reopens` (staff-readable:
  who, when, how many times) newer than the result. Use it to say
  "Reopened for a retake" only when staff really did.
- **Notification**: the bell needs an icon for type `integrity`. Its
  `group_key` names the application and step, so a tap can open that test's
  integrity section.

**Live labels.** This is the lazy "left" rule; no cron is needed:

```
quiet = now − last_activity_at
active    & quiet ≥ 10 min → "Left <where> · last active <quiet ago>"
abandoned                  → same "Left …" label
active    & hidden_at set  → "Away from the test · since <hidden_at>"
active                     → "<doing> · active <quiet ago>"
grading                    → "Checking the answers"
completed                  → "Finished <ended_at>"
failed                     → "Checking failed. Retrying"
superseded                 → do not show; a newer attempt exists
```

| step | `<doing>` | `<where>` |
| --- | --- | --- |
| application | "Filling in the form · {answered} of {total} answered" | "the form at {answered} of {total}" |
| quiz | "Answering question {current_index+1} of {total}" | "at question {current_index+1}" |
| chat steps | "In the conversation · {candidate_turns} replies" | "after {candidate_turns} replies" |
| typing | "Typing" | "during the typing test" |
| computer and connection | "Choosing the computer" (`progress.client.screen` = `computer`), "Running the speed test · run {run}" (`test`, or no hint), "Looking at the result · run {runs_done}" (`result`); the run only from 2 | "before the speed test" / "during the speed test" / "at the result" |

---

## 6. Reference

### 6.1 Access model in one table

| who | sessions/events (SELECT) | candidate functions | server-only functions | INSERT/UPDATE/DELETE |
| --- | --- | --- | --- | --- |
| anon | no (permission denied) | no | no | no |
| the applicant | 0 rows | yes, for their own application and reached steps | no | no |
| another applicant | 0 rows | 42501 | no | no |
| job owner | yes, their jobs | 42501 (not the candidate) | no | no |
| active team member scoped to the job | yes | 42501 | no | no |
| team member scoped elsewhere / inactive | 0 rows | 42501 | no | no |
| service role | everything | yes | yes | yes. Events are never updated, by anyone |

`assessment_step_reopens` has the same read rule as the two tables above
(staff of the job; the applicant reads 0 rows) and only its trigger writes
it. On `notifications`, a browser can no longer create or rewrite a grouped
or `integrity` card (4.4); everything else about notifications is unchanged.

### 6.2 Deleting

Sessions and events cascade from the application. If an applicant deletes
their application (the applications DELETE policy allows it), the record goes
with it. Whether it should survive, as `quiz_attempt_ledger` does, is the
owner's call.

### 6.3 Keepalive on `pagehide`

`sendBeacon` cannot carry the Authorization header, so use fetch:

```ts
fetch(`${SUPABASE_URL}/rest/v1/rpc/record_integrity_events`, {
  method: "POST",
  keepalive: true, // body ≤ 64 KB
  headers: {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ p_application_id, p_step_id, p_events }),
});
```

Use the same pattern for `touch_assessment_session` with `{p_session_id, p_hidden: true}`.

### 6.4 Apply and read back

The migration is additive: three new tables, a new enum value, one new
nullable column with a partial unique index and a BEFORE INSERT/UPDATE guard
trigger on `notifications` (it refuses only grouped/`integrity` rows written
from a browser, which nothing writes today), three AFTER UPDATE triggers on
`applications` that never block (form sent, quiz result landed, step
reopened), and new functions. Apply it on
its own, before deploying any client or edge function that calls it
(`docs/MIGRATION-HISTORY.md`: one at a time, stop on failure, diff by name).
Read it back with:

```sql
select enumlabel from pg_enum where enumtypid = 'public.notification_type'::regtype order by enumsortorder;
select column_name from information_schema.columns where table_schema = 'public' and table_name = 'notifications' and column_name = 'group_key';
select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename like 'assessment%';
select tablename, policyname, cmd, roles from pg_policies where tablename like 'assessment%';
select relname, relrowsecurity from pg_class where relname in ('assessment_sessions', 'assessment_events', 'assessment_step_reopens');
select table_name, grantee, privilege_type from information_schema.role_table_grants where table_name in ('assessment_sessions', 'assessment_events', 'assessment_step_reopens') order by 1, 2, 3;
select p.proname, p.proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and (p.proname like 'assessment%' or p.proname in ('start_assessment_session','touch_assessment_session','record_integrity_events','save_application_draft','record_quiz_answer','open_assessment_session','mark_stale_assessment_sessions','notifications_grouped_cards_server_only'));
select tgname from pg_trigger where tgrelid = 'public.applications'::regclass and tgname in ('assessment_application_form_submitted', 'assessment_quiz_result_landed', 'assessment_step_reopened');
select tgname from pg_trigger where tgrelid = 'public.notifications'::regclass and tgname = 'notifications_grouped_cards_server_only';
select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'touch_assessment_session';  -- exactly one row, ending in p_active boolean
```
