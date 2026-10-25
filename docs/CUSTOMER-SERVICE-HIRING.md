# Customer-service hiring (Phase 4, 2026-10-25)

HireFlow's niche is hiring customer service agents, chat and phone, for any
business (CLAUDE.md, "Positioning"). A business that types "chat agent for a
dental office" or "phone support for an online store" gets the right
follow-ups, its industry's skills check and chat practice, and grading in its
own words. docs/LAUNCH-PLAN.md, Phase 4, is the plan this follows.

## What Ava asks

`src/lib/avaEngine/playbook.ts`: the `customer_service` family is checked
before every other (`detectFamily`), so "customer support for our cleaning
company", "software support agent" or a clinic's front desk are not read as
cleaner, developer or admin. It catches customer service / support / care /
success, support or chat agents and reps, help desk, call or contact centre,
CSR, inbound calls, answering phones or chats, front desk, a receptionist for
patients, and patient coordinators. A receptionist at a law office stays
admin; outbound sales stays out.

Its follow-ups (one chip each, the default in brackets):

| id | Question | Chips |
|---|---|---|
| `cs-channel` | How will they talk to your customers? | [Chat], Phone, Email, A mix of these |
| `cs-industry` | What kind of business is it? | Medical or dental office, Online store, Software or app, Home services, Gaming, Something else; the default is what the business's own words point to (`industryFromText`) |
| `cs-load` | How many chats or messages at once? | One at a time, [Two or three], Four or more |
| `cs-hours` | When will they work? | [Daytime], Evenings or nights, Weekends too, Rotating shifts |
| `cs-sensitive` | What private details will they see? | Nothing sensitive, Payment details, Health details, ID documents (health for medical, payment for a store) |
| `cs-tools` | What will they work in? | Email and a chat box, A help desk tool, A phone system (phone), [We'll train them] |

A remote role adds the internet and computer questions, as for every family.

## What it builds

`src/lib/avaEngine/customerService.ts`, `applyCustomerServicePack`, run by
BOTH generators (the AI plan in `flowGenerator.ts` and the built-in plan in
`templateGenerator.ts`), so they can never ask a business's applicants
different things:

1. the application (from the AI, or the `customer_service` question bank);
2. **Skills check**: the pack's five questions, multiple choice, each with
   its own time (75 or 90 seconds). `jobFromFlow.ts` saves them with their
   right answers; the `strip_quiz_answer_keys` trigger moves the answers to
   `job_quiz_keys` as the row is written, so no applicant receives them;
3. the computer and connection check (remote roles);
4. **Customer chat practice**: the pack's six cases on the step
   (`config.scenarios`, with each person's name), tagged `config.pack`. The
   server picks one case per applicant (the stable pick in
   `ai-chat-simulation/prompts.ts`), and typing speed and reply time are
   measured inside it (docs/TYPING-IN-CHAT.md);
5. the written interview. A phone job's interview always has two questions
   about calls (`PHONE_INTERVIEW_QUESTIONS`) until the practice call exists
   (docs/LAUNCH-PLAN.md, "Later").

`generate-flow` is told the pack and channel (read against its own
allow-list) so the post, the application and the interview are written for
that industry, in plain English for any country, with the pack's word for
the other person. `ai-generate-job-content` has the same rule.

## The packs

`src/content/scenarioPacks/packs.ts`, copied byte for byte to
`supabase/functions/_shared/scenarioPacks.ts` (guard
`scenario-packs-client-server-identical`). Six packs:

| id | For | Word | Notes |
|---|---|---|---|
| `medical` | a medical or dental office's front desk | patient | never diagnoses; identity before details; chest pain, trouble breathing or heavy bleeding means the local emergency number or emergency room now, never driving themselves |
| `store` | an online shop | customer | refunds, late orders, wrong or damaged items, price and code requests |
| `software` | a subscription app | customer | locked accounts (never a password), billing, lost data, bugs passed on with the honest timeline |
| `home_services` | cleaning, plumbing, repair, pest control | customer | bookings, no-shows, damage, call-out and minimum charges, gas and water safety |
| `gaming` | an ordinary game company | player | purchases, hacked accounts, bans, lost progress; no sweepstakes, casino or cash-outs |
| `general` | "Something else" | customer | ordinary service work for any small business |

Each pack is five keyed questions (a policy limit, privacy, an upset person,
a numbers question with the rule stated, judgment under load or
follow-through), six chat cases, the word for the person on the other side,
and a note for the grader on what good looks like in that business.

**How they were written** (docs/ZULU-SKILLS-CHECK.md's rules): nothing to know
in advance (every rule is in the question), plain English a second-language
reader finishes in time, no giveaways (the right answer is never the single
longest, wrong options are kind beginner reflexes), right answers spread
across positions, and cases written for two readers: the situation, then
"What the agent knows:", the only true facts. The person played by the test
gets that second part only as staff knowledge it was never told.

**Review history:** one writer per pack, then three independent readers over
all six (ambiguity; a second-language reader under a timer; a hiring manager
who has run teams in each industry), merged by an editor (see "How the packs
were reviewed" below).

## How the packs were reviewed (2026-10-25)

- **Ambiguity** (29 items, 3 must-fix): a chest-pain case that did not say
  whether a visit may be booked; a gems question that did not say which gems
  were spent; a locked-out case that never gave the booking time. "Kindly"
  appeared only in the right answer of three privacy questions (a giveaway);
  several cases gave no day or time for "tomorrow" to mean anything.
- **Second-language reader** (41 items, 6 must-fix): six questions of 160 to
  170 words left a careful reader 5 seconds to answer in 90; all are now 157
  words or fewer. Idioms and phrasal verbs ("within the hour", "give out",
  "look up"), "free" meaning both "costs nothing" and "open", a gas case that
  assumed a gas bill (many homes use a tank).
- **Hiring manager** (13 items): home services never tested safety in its
  skills check (hs1 is now a gas smell while other chats wait); a chest-pain
  patient must not drive themselves (the rule and the grader's note say so,
  and asking "is someone with you?" is good, not a fail); the store and
  home-services notes asked for checks their cases never named; cases now say
  "the details will match" where an identity check is asked for.
- **Merged** by an editor: 54 items changed (3 notes, 20 questions, 31
  cases), every right answer still in its assigned position. One conflict
  (md-chest-pain: the manager's emergency wording with the ambiguity
  reviewer's "the front desk books no visit for these symptoms"; the
  tempting open slot was dropped, so no agent is handed one to offer).
- Every number was worked out by two reviewers: md4 $40, st4 $30, sw4 $90,
  hs4 $90, gm4 $5, gn4 $105.

## How the chat is graded

`supabase/functions/ai-chat-simulation`: the step's `config.pack` picks the
server's own copy of the pack (never the step's text). A pack's case is graded
as a support agent (`rubricForCase`), with:

- the other side named by the pack's word (`PATIENT 4:` lines; the label is
  neutralised if an applicant types it, `_shared/reviewText.ts`);
- WHAT THE AGENT KNOWS as the only true facts, and anything promised or stated
  that they do not allow counting heavily against the mark;
- the pack's note, WHAT GOOD LOOKS LIKE IN THIS KIND OF BUSINESS.

The owner's own business still says "player" (`counterpartFor`). A step with
no pack is graded as before. `EVAL_PROMPT_VERSION` is `chat-sim-eval-8`.

## The interview guide

`src/lib/interviewGuide.ts` (and its server copy): a customer-service job
("support" from the scorer's `inferJobFamily`) gets its own plan. It does not
re-ask what the written interview asked (listed in `alreadyAsked`); it hears
them speak, with a one-minute practice where the interviewer is the customer.
A phone job (`isPhoneJob`, from its own title and description) also asks how
they hold and pass on a call.

## Locks

- Guards (`scripts/guards/phase-4-launch-locks.mjs`):
  `scenario-packs-client-server-identical`, `customer-service-family-exists`,
  `no-gaming-nouns-in-generic-packs`.
- Tests: `scripts/customer_service_hiring.test.mjs` (detection on thirty
  briefs, every pack against the writing rules, the plan for every industry
  and channel, what Publish writes, and the server's grading),
  `scripts/interview_guide.test.mjs`, `scripts/lead_practice_grading.test.mjs`.

## Known limits

- The packs are in the site's code, so their answers can be read by anyone
  who reads the bundle. That is the accepted cost of a fixed, reviewed set
  (like any published test bank); the chat practice, the written interview and
  the typing figures carry most of the weight.
- A team-lead customer-service job gets the agent cases; only the owner's own
  gaming job has takeover cases (docs/ZULU-SKILLS-CHECK.md).
- A phone job practises in writing until the practice call exists.
