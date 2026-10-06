# Typing is measured inside the chat practice

Owner, 2026-10-06: *"getting rid of skill and typing tests and just measure all
of that through the chat practice … check how accurate they are, how long did
they take to reply. Those are the important things."* Agreed plan: the skills
check stays, cut to 5 questions (live since 2026-10-06, docs/ZULU-SKILLS-CHECK.md);
the separate typing test goes; typing is measured while they write their real
replies in the escalated chat practice.

## What is measured, per reply

| measure | how | trusted because |
| --- | --- | --- |
| **Reply time** | server time from the player's message being stored (`assistant_turn.created_at`) to the applicant's reply being stored (`candidate_turn.created_at`). Taken only when the turn just before the reply is the player's message (a second message sent before the player answered has nothing to answer), and never on turns a previous-build page sent at submit (`source: "submitted_transcript"`) | the server's clock, both ends |
| **Typing speed** | the page times every keystroke while they write the reply (`src/lib/typingMeter.ts`). Active typing time = the sum of the gaps between keystrokes, **each gap counted up to 1 second** (`TYPING_GAP_CAP_MS`): the rest of a longer pause is thinking. The Enter that sends is not timed (the re-read before it is not typing). At most **one character is credited per character key** (a letter, a digit, a space, Shift+Enter). WPM = (characters typed ÷ 5) ÷ active minutes | measured on their computer, then checked by the server against the reply it stored (below) |
| **Corrections** | Backspace and Delete presses ÷ all keys pressed, as a percent | measured on their computer |
| **Typos left** | the grader lists spelling mistakes left in the applicant's sent lines (line number and word; spelling only, never grammar or style; at most 25), the server keeps only words it finds in that applicant line; typos per 100 of their words | the grader reads the stored transcript, the server checks every word |

Not typing, so never counted as typing: a held key's repeats (`event.repeat`:
the hold is one key, and one correction for Backspace; the repeats add no key,
no time, no character), a keydown a script dispatched (`isTrusted: false`:
ignored), undo and redo (Ctrl/Cmd+Z, Ctrl/Cmd+Y: the text they bring back is
neither typed nor paste-like), and a Ctrl/Cmd shortcut (a key, never a
character). Shift, Control, Alt, Meta and Caps Lock alone are not keys.

**Why each gap counts up to 1 s, not "gaps over 2 s are dropped"** (the first
build, never shipped). Dropping a long gap still counted the character typed
after it, so the measure jumped at a cliff and could rank typists in reverse:
the same typist pausing 2.000 s before each word read 24 WPM and at 2.001 s
read 98 WPM; a typist pausing 2.1 to 3.5 s before every word (17.8 WPM real
throughput) read 73 WPM, while one twice as fast in real terms (39 WPM,
pausing 0.3 to 1.9 s) read 38 and was flagged. With each gap capped at 1 s a
longer pause never reads faster: the same two typists read 35 (below the
40 bar) and 46 (meets it). A steady typist reads their real speed.

**Paste-like.** A reply is paste-like, and never timed, when:

- more than 15 of its characters arrived without a key each (the page:
  dictation, a text expander, a script setting the value; paste itself is
  blocked); or the server's checks of the page's summary fail:
- more characters typed than keys pressed (the meter credits at most one a
  key, so its own summary never says that);
- the stored reply is longer than what was typed by more than 15 characters
  (`TYPING_UNTYPED_ALLOWANCE`);
- faster than 300 WPM (`TYPING_MAX_PLAUSIBLE_WPM`).

A reply under 20 characters (trimmed) does not count toward speed (too short
to time); its reply time still counts.

## What the page sends: `candidate_turn` `detail.typing`

Each "respond" request carries the page's keystroke summary for that one reply
as `typing`. The server cleans it (`ai-chat-simulation/typing.ts`
`cleanReplyTyping`) and stores it on the reply's `candidate_turn` event as
`detail.typing` (`_shared/assessmentSession.ts` `recordCandidateTurn`), beside
`role`. Exactly these keys, camelCase like the page's summary:

```jsonc
"detail": {
  "role": "agent",
  "typing": {
    "charsTyped": 104,   // whole number, 0 to 100,000
    "activeMs": 21400,   // whole number, 0 to 3,600,000
    "corrections": 6,    // whole number, never more than keys
    "keys": 118,         // whole number, 0 to 100,000
    "pasteLike": false   // true only for a real true
  }
}
```

Anything that is not that shape is no summary at all (the reply has no typing
measure: never a 0). A repeat of the same `client_msg_id` inserts nothing, so
it keeps the first copy's `typing`. The summary is cleaned again when it is
read. Speed, medians and reply times are worked out at grading; a total the
page works out is never asked for and never read.

## The result: `notes.chatSimulationResult.typing`

Written when the chat is graded (server-side, from the STORED reply events and
their server times, `buildTypingResult`), on a graded and an ungraded chat
alike (speed and reply time never needed the grader). A chat graded from the
transcript the page sent (no record of the attempt) has no server times and
gets no typing block.

```jsonc
"typing": {
  "wpm": 47,                    // the timed replies taken together, or null
  "correctionsPct": 6,          // Backspace + Delete ÷ keys over those replies, or null
  "medianReplySeconds": 38,     // server-measured, or null
  "typosPer100Words": 1.2,      // null when the grader gave no list (never 0)
  "repliesTimed": 6,
  "pasteLike": 0,               // replies that did not arrive key by key
  "bar": { "minWpm": 40, "maxMedianReplySeconds": 90 },
  "meetsBar": true,
  "below": [],                  // "speed" | "reply_time"
  "notTimed": null,             // why wpm is null: "too_short" | "arrived_without_typing" | "not_sent"
  "measuredBy": { "speed": "page", "replyTime": "server", "typos": "grader" }
}
```

The rules, as built:

1. **Speed and corrections** are taken over the timed replies TOGETHER (all
   their characters ÷ 5 ÷ all their typing minutes; all corrections ÷ all
   keys), so a long reply weighs more than a short one. Both need at least 3
   timed replies; fewer is "not enough typing to time" (shown, never a fail).
2. **`medianReplySeconds`** needs at least 3 replies the server could time,
   and a reply's time counts only when the turn just before it is the
   player's message.
3. **`meetsBar`** is `false` if anything measured is below its bar, `true` if
   the speed was timed and nothing is below, and `null` when the speed was not
   timed and nothing is below.
4. A reply that works out above **300 WPM** is not timed and counts as
   paste-like.
5. **`notTimed`** says why there is no speed: `"not_sent"` when no reply
   carried a summary (an older page), `"arrived_without_typing"` when the
   paste-like replies are at least as many as the timed ones, else
   `"too_short"`. `null` when timed. A block written before this field
   existed reads as "not enough typing to time".

Bars live on the chat step's config, `typing: { min_wpm, max_median_reply_seconds }`,
defaulting to 40 and 90 (`typingBarFrom`; snake_case in the config, camelCase
in the block; the readers accept either in `bar`). 40, not the old 45: this is
active-typing speed while composing a real reply, not copy-typing.

For staff, `assessment_sessions.grading.typing` (the chat practice's own
extra, docs/ASSESSMENT-RECORD.md §2.6) keeps what the block was built from:
`{replies: [{reply, chars, replySeconds, typing, wpm, correctionsPct, timed, pasteLike}], spelling_mistakes: [{line, word}] | null}`.

## How it counts

Everything below happens **only on a job with no typing step**
(`chatTypingForJob`). A job that still has a typing step is unchanged: the
judge is not shown the chat's typing, the fingerprint does not carry it, the
scorecard does not read it, and staff see it as information only ("This job
also has a typing test; that test is its typing measure"; no WPM on the chat
practice's gem, so one row never shows two WPM figures).

- **Score** (`chatTypingScore`), for a team lead's tests blend, where it is
  typing's 0.10:
  `round(0.8 × min(100, wpm ÷ minWpm × 100) + 0.2 × reply)`, where
  `reply` = 100 at or under `maxMedianReplySeconds`, else
  `max ÷ median × 100`. No reply time: the speed alone. No speed (fewer than 3
  timed replies): `null`, and typing is left out of the blend (the three other
  tests take the tests' share in proportion), never a 0. Corrections and typos
  are shown, never scored. Every other family's blend ignores it.
- **Flags**, each a risk flag and a reason for "review", never a decline and
  never a penalty on the number:
  - "Typed N WPM in the chat practice; the job asks for M" (also a "why down" line);
  - "Slow replies: median N s; the job asks for M s" (also a "why down" line);
  - "N chat practice replies arrived without being typed (as pasted or
    dictated text does); their speed was not counted", when 2 or more
    replies, or at least as many as were timed, were paste-like
    (`chatTypingArrivedWithoutTyping`). Their speed is left out, so this
    must not be a way around the bar.
- A speed at or over the bar is a "why up" line ("Typed N WPM in the chat
  practice (bar M)").
- **The judge** (trigger-ava-analysis) reads one line in the chat block:
  "Typing in the chat: 47 WPM while writing their replies (the job asks for
  40: meets it); 6% of keys were corrections; median reply 38 s (…); 1.2 typos
  left per 100 words". A speed that was not timed reads "typing speed was not
  timed in this chat, so it is unknown: do not count typing speed either way"
  (why it was not timed is for a person, never the judge).
- **The judge's notes about typing** are the chat practice's topic: while the
  chat practice is still ahead a typing note is owed to it, and once it is
  done, timed or not, a typing note is that measure's result, never a hard
  conflict that costs the judgment points (being untimed must never cost more
  than being timed and slow). A job with neither a typing step nor a chat
  practice is unchanged.

## Where it shows

- **The applicant** reads, on the chat practice's rules card: "We also note how
  quickly and accurately you type your replies." Nothing else changes for them.
- **Staff**: the chat practice row and record sheet show "Typing 47 WPM · 6%
  corrections · replies in 38 s (median)" (with no speed: "Typing: not enough
  typing to time", "Typing: replies arrived without typing" or "Typing: not
  timed by the page"), amber when it is the job's typing measure and under a
  bar or its replies arrived without typing. The sheet adds the bars, the
  typos and why no speed was timed. The applicants list's "Below the job's bar
  on: Typing" filter reads it when the job has no typing step
  (docs/APPLICANTS-LIST.md).
- **The preview**: Kwame Asante's full profile in the `zulu` scenario
  (docs/DEV-PREVIEW.md) shows the job as it will be without its typing step,
  his chat typing under both bars; Robin and Wanjiru show the information line
  on the job as it is today.

## Calibration: an open question for the owner

Neither bar has been checked against real applicants yet. Both only ever ask
for a person's look, never decline anyone, but on a job with no typing step a
miss keeps the card from "advance".

- **40 WPM** is a guess at composing speed with each pause capped at 1 s. A
  45 WPM copy typist who pauses 0.4 to 1.5 s between words reads about 35.
- **90 s** is raw reply time, what a waiting player feels. It does not grow
  with the length of the reply: a lead writing 300-character answers at
  45 WPM spends about 80 s just typing each one, so a thorough chat can read
  "slow replies". Only replies that answer a player's message are timed.

Recommendation: read the figures of the first 10 to 20 real applicants before
relying on either bar, and set `step_chat.config.typing` if they need to move.

## Shipping it, in this order

1. Deploy the functions (`ai-chat-simulation`, `trigger-ava-analysis`) and the
   site (the page sends `typing` with each reply). The analysis version is 9,
   so every frozen analysis is redone with the new rules.
2. **Before** the data change, confirm new replies carry the summary
   (read-only):
   ```sql
   select count(*) filter (where e.detail ? 'typing') as with_typing, count(*) as replies
   from assessment_events e join assessment_sessions s on s.id = e.session_id
   where s.step_type = 'chat_simulation' and e.kind = 'candidate_turn'
     and e.created_at > '<the deploy time>';
   ```
   A page bundle still on the previous build sends no typing: its chat reads
   "not timed by the page", and on a job with no typing step that applicant
   has no typing measure at all.
3. Then **one data change**: drop `step_typing` from the live job's
   `workflow_steps`, so the journey is 6 steps, and in the same change set
   `step_chat.config.typing = { min_wpm, max_median_reply_seconds }` if the
   owner wants bars other than 40 and 90 (the job's `required_wpm` is still
   45 and its requirements still say 45 WPM). The record follows the job's
   steps, so the 2 live applications that took the typing test (of 3, on
   2026-10-06) stop showing that step, and their chats have no typing block.

## Proof

- `scripts/typing_meter.test.mjs`: the meter from synthetic keystroke streams
  (each gap capped at 1 s, a longer pause never faster and no cliff, the
  sending Enter not timed, held keys, script keydowns, undo, text arriving in
  short pieces, more than 15 characters with no key is paste-like); the
  server's aggregation (the replies taken together, the 3-reply minimum,
  under-20-character replies skipped, `notTimed`), its checks of each summary
  against the stored reply, reply time from stored timestamps, and nothing the
  page totals up ever read; the page wiring.
- `scripts/lead_scoring_scenarios.test.mjs`: a team-lead job with no typing
  step scores typing from the chat; the judge's typing note costs nothing
  once the chat is done, timed or not, and is still owed while it is ahead;
  replies that arrived without typing are "review"; a job with a typing step
  is unchanged byte for byte, and trigger-ava-analysis gates the judge's line
  and the fingerprint on it.
- `scripts/assessment_record.test.mjs` and `scripts/applicant_list.test.mjs`:
  the staff line, its tone and reasons, the record and the scorecard reading
  every block the same way, the "Typing" filter.
- `scripts/lead_practice_grading.test.mjs`, `scripts/chat_simulation_grading.test.mjs`:
  the spelling list (capped at 25), the bar from the step config, the block on
  the result.
