# The computer and connection check: the contract

A candidate step (type `equipment_check`) that runs OUR OWN internet speed
test on the applicant's computer and records what that computer is. Owner,
2026-10-05: *"if you could do an actual speed test right on their computer.
We run our own speed test. That way they cannot lie. And we can ask them,
will you be using this computer? If not, open up on that computer and we run
our own speed test."* It replaces the old "send a screenshot of your speed
test", which proved nothing.

**The page, the edge function, the staff record and the job editor all follow
this document.** If something here is wrong, fix the document and the code
together.

---

## 1. The rules that do not bend

1. **Every figure is measured by the server, from its own clock.** The
   browser cannot be trusted to time itself, so it never does. The test is a
   CHAIN of requests: every response carries a signed stamp (server time,
   bytes, a nonce), and every next request must hand that stamp back. A
   stamp is at the END of a download's bytes, so the request that returns
   it proves the whole download had arrived by the server time it was
   received. The server therefore knows, on its own clock, when it sent each
   download and when it was fully received, when each upload's last byte
   landed, and when each ping came back. Only intervals the page could make
   LONGER are counted (§4 "The figures"): the browser adds nothing but its
   own turnaround time, which can only make a connection look SLOWER, never
   faster. `record` recomputes all three figures from the stamps and ignores
   any number the page sends. The applicant cannot write the result
   themselves either: `notes.equipmentCheckResult` is a guarded key from the
   start (§5), and every reader that moves anyone on, or tells Ava "timed by
   our server", wants the server's own `_trusted` marker beside it.
2. **The applicant is asked, before the test, whether this is the computer
   they will work from.** "Yes" runs the test. "No" tells them to sign in on
   that computer and open this step there; the step stays open until a test
   is sent. "I can't right now, run it here" is allowed and is RECORDED as a
   flag the hiring team sees. A phone or tablet is detected and treated like
   "No" with the same escape hatch. A "No" tapped by mistake can be taken
   back on the same page ("I'm on it after all"), and a "Yes" counts as a
   switch (`no_switched`) only when the earlier "No" came from ANOTHER device.
3. **Nothing here declines anyone.** The result is evidence for Ava and for
   the hiring team. Auto mode moves them to the next step the moment the
   result lands (`stepMoveOn`), like every other step since 2026-10-05.
4. **Everything the test learned is on the staff record**, including what the
   browser reported about the device, the raw stamps, the addresses the test
   ran from and the one the result was sent from (staff-only, in
   `assessment_sessions.grading`), and every flag. A test timed on one
   machine or network and sent from another is a flag, never hidden.
5. **No copy/paste or screen-switch rules on this step.** There is nothing to
   cheat by copying. The session, heartbeat and live progress still run so
   staff see "running the speed test · active just now".

---

## 2. Where it sits

On the live job it is `step_connection`, the FIRST workflow step: switching
computers is cheaper before an hour of tests than after, and a result that
says "phone, 1 Mbps up" is worth knowing early. Every journey runs the
application, then the skills check (the quiz is the job's own
`quiz_questions` column, not a workflow step, and `buildCandidateJourney`
always puts it second), then the workflow steps in order; so the connection
check comes after the skills check and before the typing test. Putting it
before the skills check would mean changing the journey builder in all three
copies (the page's, the functions' mirror and SQL `assessment_journey`). The live job's step is titled **"Computer and connection"**
(shorter than the fallback "Your computer and connection", which wrapped to
three lines in the staff record row on a phone). Job config:

```json
{ "min_download_mbps": 10, "min_upload_mbps": 3, "max_latency_ms": 200 }
```

The job editor (CreateJob) offers the step as **"Computer and connection
check"** and edits those three numbers, while a job is created and on the
edit page too: there the tests and their order stay locked, but the
connection check's bars are numbers on the step's config, and an edit writes
`workflow_steps` alone (`renderEquipmentCheckBars`). New bars apply to anyone
who has not sent the check yet; a sent result keeps the bars it was measured
against.

---

## 3. The page (`/applications/:id/connection/:stepId`, `ConnectionCheckPhase`)

Three screens, one card, phone-first (the applicant may be on the wrong
device on purpose, and that is the point).

1. **Which computer.** "Are you on the computer you'll use for this job right
   now?" Yes / No. The page reads the device first: `navigator.userAgentData`
   (brands, platform, mobile; high-entropy platformVersion, model,
   architecture when granted) with a UA-string fallback, `screen` size and
   `devicePixelRatio`, `hardwareConcurrency`, `deviceMemory`, touch points,
   `navigator.connection` (effectiveType, downlink, rtt, type), language,
   timezone. A phone or tablet (`mobile`, or touch with a short side under
   768px) shows: "This looks like a phone. The job is done on a computer.
   Sign in on that computer and open this step there; the test runs there."
   Windows and ChromeOS are computers whatever their screen unless they say
   `mobile`: a 2-in-1 with a 1920×1080 panel at the default 150% scaling
   reports a 1280×720 screen and ten touch points, and it is exactly the
   computer the applicant works from. The short-side rule stays for every
   other OS (an Android phone asking for the desktop site reports Linux and
   `mobile: false`). Under it, small: "I can't right now, run it here
   anyway." "No" on a computer shows the same instruction (minus "looks like
   a phone"), the same escape hatch, and "I'm on it after all — run the
   test." for a No tapped by mistake (it answers Yes, never a flag).
   A Yes is recorded as `no_switched` only when the hint an earlier visit
   left says No (answered there, or a phone or tablet that never ran it) and
   that visit's device is not this one (`device_sig`, the device in one line);
   the No is carried forward in this page's own hint (`prior_answer`,
   `prior_device_sig`) until the question is answered here, because the
   page's heartbeat replaces the hint.
2. **The test.** About 20 seconds, with a live gauge and plain words
   ("Checking how fast we can send you data…"). One chain, in order: 8
   pings; then 3 downloads, one after the other (never in parallel: the
   chain needs the order); then 4 uploads of random bytes, one after the
   other. The first download asks for 512 KB and the first upload carries
   64 KB (it closes the downloads; the server does not count it, §4); every
   later one is sized to take about 2.5 s (download) or 2 s (upload) at the
   pace the one before it went, between 64 KB / 32 KB and 3 MB / 1.5 MB
   (`nextRequestBytes`). A line far too slow for 3 MB (under about 0.3 Mbps
   down) therefore still finishes every request inside its 90 s limit,
   instead of failing every run for good and leaving the applicant on this
   step. Only the SIZE comes from the page's clock; a smaller request only
   ever adds a round trip to its proven time. Every request carries the
   previous response's stamp. The page shows a running estimate, but the
   figures on the result screen are the ones `record` computed and
   returned. A request that fails is retried once with the same previous
   stamp and size; a chain that cannot finish says so in plain words and
   offers "Try again". A refusal's words are the server's only when it wrote
   them for the page (a `code`); a bare 401 asks them to sign in again. Every
   finished run is recorded as a session event (`test_run`, with the
   server's figures), so staff see every run, not only the one sent.
3. **Result and send.** The three numbers against the job's bars in plain
   words ("Download 28 Mbps · we ask for 10"). Two buttons: **Send this
   result** and **Run it again** (up to 3 runs; a bad wifi moment should not
   be the record). With more than one run, a chip per run picks the one to
   send; a chip showing the page's own estimate says "about". A run the
   server refuses to save (stale, broken) can never be sent again: it reads
   "couldn't be saved", it does not count toward the 3, so **Run it again**
   is always there after a refusal, and the latest run that can still be
   sent is picked. With 3 sendable runs on screen the words say "Pick the
   run to send." Send calls `connection-test?op=record` with the chosen
   run's stamps; then the usual `NextStepCard` ("Up next: Typing test ·
   Begin").

The figures on the result screen are the server's: when a chain finishes, the
page sends its stamps once more with the `test_finished` marker
(`connection-test?op=event`), and the server answers with the figures it
computed from them, the same ones `record` will store for that chain. The
gauge waits at its last step ("Getting the exact figures from our server…")
for up to 8 seconds; only when that answer does not come does the result
screen show the page's own estimate, marked "about" and saying so.

The page starts an assessment session (`start_assessment_session`), heartbeats
with its hint (`progress.client = {screen, device_kind, device_sig, answer,
prior_answer, prior_device_sig, run, step, runs_done, failed}`), and writes
`system` markers through
`connection-test?op=event` as they happen: `{what:'device_read', device_kind,
os, browser, screen}`, `{what:'computer_answer', answer}` (`yes`, `no`,
`no_switched`, `ran_here_anyway`), `{what:'test_started', run}`,
`{what:'test_finished', run, download_mbps, upload_mbps, latency_ms}` (the
page's estimate). A candidate cannot write a `system` event any other way
(`record_integrity_events` writes only `integrity`), so a tab closed mid-test
still shows how far they got.

---

## 4. The edge function `connection-test` (verify_jwt = true)

One function, routed by `?op=`. `ping`, `download` and `upload` need only a
valid JWT (they move bytes and stamp times; they read nothing). `event` and
`record` need the application's own candidate, on an application that has
reached this step.

**The stamp.** Every response carries `x-stamp`, a signed JSON string:
`{kind, nonce, at, bytes, prev_nonce, prev_at, candidate?, timing?, head?,
ip?, ua}` and `sig`, where `sig = HMAC-SHA256(secret, canonical fields)`. `at`
is the server's `Date.now()` at the moment that matters for the kind (below).
`prev_nonce` / `prev_at` are copied from the stamp the request handed in
(`x-prev-stamp` header or `prev` query), after its signature was verified;
`prev_at` is overwritten with the server time the request ARRIVED
(`received`), which is the number that proves the previous step was
complete. `ip` is the address the request came from as the platform reports
it (`bestEffortIp`, absent when it reports none) and `ua` the first 16 hex
characters of SHA-256 of its User-Agent: the chain is bound to the JWT's
subject AND says which machine and network ran it. The secret is derived once
per worker: `HMAC(SUPABASE_SERVICE_ROLE_KEY, "connection-test:v1")`; nobody
configures it.

| op | method | `at` means | does |
| --- | --- | --- | --- |
| `ping` | GET | response sent | returns `{}` with the stamp. Round trip for ping N = `received` of the request carrying stamp N − `at` of stamp N. |
| `download` | GET `&bytes=N` | streaming began | streams N bytes (at least 512, cap 3 MB) of incompressible random data in 64 KB chunks (CPU limit 2 s/request), `Cache-Control: no-store`, `Content-Encoding: identity`, `Content-Length` set, and the stamp BOTH in the `x-stamp` header and as the last 512 bytes of the body (JSON padded with spaces; room for an IPv6 address). The body copy is the one the page must hand back: it cannot be known before the whole body has arrived. Download time = `received` of the next request − `at`. |
| `upload` | POST raw body (cap 1.5 MB) | last body byte read | reads the body in chunks, counts bytes, stamps when the last chunk is in. Upload time = `at` − the PREVIOUS upload's `at`: the page could only send this body once it held that stamp, which was minted after that `at`, so the interval is proven and merely includes the page's turnaround. `at` − `received` of the same request is never used: nothing proves the request arrived before the body left the page, and when the gateway buffers a body the handler starts after it is all in, so that difference is an internal handoff (a 6 ms one would read a 0.5 Mbps uplink as 2,000 Mbps). The first upload therefore has no proven start (the stamp before it is a download, whose `at` is when it BEGAN): it closes the last download and its own bytes and time are not counted. The stamp's `timing: "stream" \| "chain"` (5 ms or more between arrival and last byte, or not) is a diagnostic label only, kept to see how the deployed gateway behaves. |
| `event` | POST JSON `{application_id, step_id, what, detail, client_msg_id, stamps?}` | | writes one of the page's markers (§3) on the live attempt, its `detail` kept to the keys staff read, idempotent on the page's `client_msg_id`; pins the job's bars on the attempt (`context.bars`) once. A `test_finished` that carries its run's `stamps` is verified exactly as `record` verifies a chain; when it holds, the server writes that run's `test_run` marker (its own figures, keyed `srv:test_run:<first nonce>`) and answers `{recorded, figures: {downloadMbps, uploadMbps, latencyMs, jitterMs, meetsBars, below}}`; when it does not, `{recorded, figures: null, code, error}`. Writes nothing to the application. A marker that cannot be written (no attempt open, the step already finished) still answers 200 `{recorded: false}`. |
| `record` | POST JSON `{application_id, step_id, stamps[], device, using_this_computer, device_kind, runs[], estimate, network}` | | verifies every stamp's signature, that they form one chain (each `prev_nonce` = the previous stamp's `nonce`, no gaps, no reuse), that they come in the contract's order (a ping first, then pings, downloads, uploads), that every `at` is within the last 20 minutes, that the chain belongs to this JWT and that every stamp names the same browser (`ua`); computes latency (median and jitter of the ping round trips), download Mbps (total download bytes ÷ total proven download ms), upload Mbps (same for the uploads with a proven start); compares the chain's addresses and browser with its own request's; records the result (section 5) and moves the candidate on. Returns the figures it recorded. |

**The figures.** Only intervals the page could make LONGER count: a ping's
round trip and a download's time end when the NEXT request arrived; an
upload's time starts at the previous upload's `at`. An interval of 0 ms or
less (two edge workers' clocks disagreeing) proves nothing, and that step's
bytes AND its time are left out together (`unproven`), never the time alone,
which would read 3 MB in 0 ms. The contract's order is enforced so that no
step can sit where its time would not be proven (an upload first in a chain
had its whole body arrive before `received`).

`record` refuses (400, with a reason the page shows in plain words) a chain
with fewer than 4 pings, 2 downloads or 2 uploads, a broken signature, a
chain out of order, a stamp older than 20 minutes, a nonce used twice, or
stamps from two browsers. A chain from more than one address is NOT refused
(a connection can move between IPv4 and IPv6, or a phone between networks,
mid-test): it is recorded, with a test sent from another address or browser
than the one it ran on, as a flag the hiring team sees (§5 `source`, §6). A
full remote desktop still passes; a script run from a fast server and sent
from home does not pass unseen. It never reads a figure from the page, and
it reads its JSON body with a counting reader (cap 256 KB), never whole
before the cap. When the attempt's record cannot be read at all (a
transient database error) it still never records a second result: one
already on file is answered back unless the hiring team handed the step back
for a retake (status `pending`, phase on the step, and a staff reopen marker
newer than the result).

`runs[]` is every run the page finished (`{run, sent, download_mbps,
upload_mbps, latency_ms, server, duration_ms, finished_at}`, the sent one
`sent: true`); its length is §5's `runs`, and the whole body minus the
stamps is kept in `grading.raw`. The ping, download and upload ops write
nothing, so the server cannot count runs itself: `runs` is the page's count,
and the grading and the staff sheet say so (`runs_counted_by: "page"`,
"counted by their page"). After the result it writes the sent run's
`test_run` marker (a no-op when `event` already wrote it) and
`{what:'submitted', run, runs}`; a refused chain leaves
`{what:'record_refused', reason}`.

## 5. What is recorded

Through `recordStepResult` (trustedResults.ts) into `applications.notes`:

```jsonc
"equipmentCheckResult": {
  "downloadMbps": 28.4, "uploadMbps": 9.1,   // both from the server's clock
  "latencyMs": 42, "jitterMs": 6,
  "measuredBy": "server",
  "runs": 2,                       // runs finished when this one was sent, the sent one included (1–3)
  "usingThisComputer": "yes" | "no_switched" | "ran_here_anyway",
  "deviceKind": "computer" | "phone" | "tablet",
  "device": { "os": "Windows", "osVersion": "11", "browser": "Chrome", "browserVersion": "131",
              "screen": "1920×1080", "dpr": 1, "cores": 8, "memoryGb": 8, "touch": false,
              "language": "en-PH", "timezone": "Asia/Manila", "connectionType": "wifi", "model": null },
  "bars": { "minDownloadMbps": 10, "minUploadMbps": 3, "maxLatencyMs": 200 },
  "meetsBars": true,
  "below": [],                      // e.g. ["upload"]
  "measuredAt": "2026-10-05T23:40:00Z",
  "attempt": 1,
  // where the test ran against where it was sent from; null = unknown (§4)
  "source": { "oneAddress": true, "sameAddress": true, "sameBrowser": true },
  "_trusted": true
}
```

Into the assessment session (staff-only): `grading = { graded_at, model:
null, prompt_version: "connection-stamps-1", fallback: false, result: <the
figures, the chain's byte counts, `unproven`, `source`, `runs_counted_by:
"page"`>, stamps, ip (where the result was sent from), testIps (every address
the chain's stamps name), userAgent, raw: <the page's request body without
the stamps> }`, status `completed`, end_reason `submitted`; `context.bars` =
the job's bars when the attempt began, in the step config's shape. The step
is "done" when `notes.equipmentCheckResult` exists (`stepHasResult`).

**The applicant cannot write it.** `20261006124409_equipment_check.sql` seeds
the forgery guard's row for `equipmentCheckResult` ENFORCED (`enforced =
true`, `ON CONFLICT DO UPDATE`): `protect_application_columns` refuses a
candidate's own write, change or removal of the key (or of the step's own
entry, `type: "equipment_check"`). The older steps were seeded off and
flipped later only because their pages used to write their own results; no
client ever wrote this one. And nothing leans on the guard alone:
`stepResultLanded` (trustedResults.ts) moves an applicant off this step only
with the server's `_trusted[step.id]` marker, never on the key (no legacy row
of this type exists); trigger-ava-analysis reads it through
`recordedEquipmentCheck`, which wants that marker; `readEquipmentCheckResult`
never turns a value that does not say `measuredBy: "server"` into one; and
the staff record says "Timed by our server." only beside the marker.

---

## 6. What staff see

The record list row: **`↓ 28 · ↑ 9 Mbps`**, verdict "Meets the bar" (jade)
or "Below the bar: upload 1.2 Mbps" (amber). The row's numbers are whole
Mbps rounded DOWN (28.4 reads 28), and a figure under its bar, or under
1 Mbps, keeps one decimal rounded down (2.6 against 3 reads "↑ 2.6", never
"↑ 3"; 0.4 never reads 0). Flags, as plain words, each one its own line
under the verdict, never cut: "Not the computer they'll work from (ran here
anyway)", "Ran on a phone", "Sent after 3 runs", "Sent from a different
network than the test ran on" (or "The test ran from more than one
network"), "Sent from a different browser than the test ran in". A switch to
the right computer (`no_switched`) is what the page asked for and is never a
flag: the answer says it in neutral words. Under the numbers, small: "Timed
by our server." (only when the server's `_trusted` marker is there).

The sheet: the three numbers against the bars; the device as a table (OS,
browser, screen, cores, memory, touch, language, timezone, connection type);
the answer to the computer question (while the check is open, a plain "No.
They were told to open this step on the computer they'll work from; it has
not been run there yet."); the timeline from the session's events (the run
that was sent is the one the `submitted` marker names); where the test ran
from and where it was sent from, and the runs before sending, "counted by
their page" (staff only). While it is still being taken, the sheet's note
follows the screen they are on, in the row's words: choosing the computer,
running the speed test, looking at the result, or a run that did not finish
("The speed test did not finish · run N" on the row).

Ava's evidence (ai-analyze): one line — "Connection: 28 Mbps down, 9 up,
42 ms, timed by our server; Windows 11 / Chrome on a 1920×1080 computer; says it is
the computer they will use." (plus "sent from a different network than the
test ran on" and the like when §5's `source` says so). Ava's job description
already asks for a reliable connection; the bars are in the prompt as the
job's own numbers. The connection is evidence, never a conflict: the `resume`
prompt trigger-ava-analysis uses and the structured-score rules both say a
connection shortfall goes under Phase Concerns and never into
`hardRequirementConflicts`, and `buildAvaScorecard` (autopilot.ts) sets aside
any conflict on the network topic whenever the job has the check, pending or
recorded, unless it is a real eligibility blocker. The shortfall reaches the
owner as a risk flag ("Connection below the job's bar"), never as the reason
Ava recommends declining. The topic is network words only: a bare
"connection" ("no connection between their retail background and the CRM
skills") stays a conflict.

---

## 7. Proof

- `scripts/connection_test_stamps.test.mjs`: stamps sign and verify; a
  forged, stale, foreign, reordered, out-of-order (an upload or a download
  first, a ping after the uploads) or reused stamp breaks the chain and is
  refused, and so are stamps from two browsers; the three figures are
  computed from the chain alone and a client figure is ignored; a chain with
  too few steps is refused. The reviewer's cases are there: a buffered
  upload labelled "stream" reads a 0.5 Mbps uplink as 0.5, an upload first
  in a chain never verifies, a 0 ms interval drops that download's bytes
  with its time (2.0 Mbps stays 2.0, never 3.0), and a chain run from a
  server and sent from home carries two flags.
- `scripts/connection_test_stamps.test.mjs` also proves the result shape,
  `meetsBars` and `below`, how `runs` is counted and which run was sent, and
  what each marker keeps; and, from the function's source, that `event`
  writes no application and takes a run's figures only from its verified
  chain.
- `scripts/connection_check_client.test.mjs`: the page's side. The download
  stamp read from the body's tail, the chain's order, retry and refusal (and
  whose words a refusal shows), the request sizing (a 0.15 / 0.08 Mbps line
  finishes every request inside 90 s), the running estimate, device parsing
  from userAgentData and from a UA string, phone/tablet detection (a Windows
  2-in-1 at 150% scaling is a computer), the markers' requests and the
  server's figures in their replies, and the page source against this
  contract.
- `scripts/trusted_step_results.pglite.test.mjs` (the row is seeded enforced;
  a candidate cannot put, change or delete the result) and
  `scripts/trusted_results_logic.test.mjs` (a forged key alone never moves
  anyone on; the server's marker does).
- The existing suites extended for the new type: journey route segment,
  `stepHasResult`, the record builder (including the live words from
  `progress.client`), the dev-preview fixture, the step_type constraint in
  the pglite schema test, the server's session helpers on an
  `equipment_check` attempt (a marker on the live attempt, once per key;
  nothing after the send), and the page's grading-reply handling.
- Looked at rendered, at 390 and 1280, on `/dev-preview` as a candidate (the
  three screens) and as staff (the record row and sheet).
