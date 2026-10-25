# Customer-service hiring (Phase 4, 2026-10-25)

HireFlow's niche is hiring customer service agents, chat and phone, for any
business (CLAUDE.md, "Positioning"). A business that types "chat agent for a
dental office" or "phone support for an online store" gets the right
follow-ups, its industry's skills check and chat practice, and grading in its
own words. docs/LAUNCH-PLAN.md, Phase 4, is the plan this follows.

## What Ava asks

`src/lib/avaEngine/playbook.ts`: the `customer_service` family is checked
before every other (`detectFamily` → `isCustomerService`), in this order:

1. a main-street, trade or clinical role in the title keeps its family,
   whatever else it says ("Customer Service Cashier", a barista, a plumber, a
   pharmacy technician, a dental or medical assistant; the owner: not
   main-street roles). Role nouns only: "Online Store Chat Agent", "Driver
   Support Agent" and "Pharmacy Customer Care Representative" name the
   business, not the role, and are support jobs;
2. a support title is customer service: customer / client service(s),
   support, care, success; support or chat agents, reps, specialists;
   customer, chat, technical or IT support managers and leads (not an
   operations or facilities one); technical / IT support technicians (not a
   field or cell-phone one); help desk; call or contact centre; CSR
   (non-voice too); front desk; patient services and appointment schedulers;
3. a front-office role at a clinic (a receptionist, a medical **office**
   assistant, an appointment setter, with patients or a clinic in the
   words), but never a clinical medical assistant;
4. a title with "support" and support work ("Support Engineer — answer
   customer tickets");
5. another role named in the title keeps its family: engineer, manager,
   analyst, writer, tester, a non-clinic receptionist, and the admin and
   sales roles that also answer phones (administrative, executive, personal
   or legal assistant, secretary, coordinator, telemarketer, cold caller,
   appointment setter outside a clinic, real estate, insurance or
   collections agent);
6. else the description has to say the job IS answering people: a verb, a
   customer-type word (customer, client, patient, caller, player, guest,
   member) and a channel ("handle customer tickets", "calls from our
   customers"); incoming or inbound calls; answering chats; staffing a live
   chat or help desk; "customer service for / by …"; or, at a clinic,
   answering the phones. A bare mention ("our live chat widget", "help desk
   articles"), a quality ("great customer service"), outbound calling and
   "answer phones, manage calendars" do not count.

All three Phase 4 reviews' cases, about a hundred and ten, are in the test.

Its follow-ups (one chip each, the default in brackets):

| id | Question | Chips |
|---|---|---|
| `cs-channel` | How will they talk to your customers? | Chat, Phone, Email, A mix of these; the default is what the business's own words say: phone ("Phone CSR", "inbound calls", "on the phones"), a mix (calls and emails, "Phone & Email Support Rep", "voice and email support"), never phone for "non-voice", "chat only", "no phone calls" or a chat or email CSR |
| `cs-industry` | What kind of business is it? | Medical or dental office, Online store, Software or app, Home services, Gaming, Something else; the default is what the business's own words point to (`industryFromText`) |
| `cs-load` | How many chats or messages at once? | One at a time, [Two or three], Four or more |
| `cs-hours` | When will they work? | [Daytime], Evenings or nights, Weekends too, Rotating shifts |
| `cs-sensitive` | What private details will they see? | Nothing sensitive, Payment details, Health details, ID documents (health for medical, payment for a store) |
| `cs-tools` | What will they work in? | Email and a chat box, A help desk tool, A phone system (phone), [We'll train them] |

A remote role adds the internet and computer questions, as for every family.

## What it builds

`src/lib/avaEngine/customerService.ts`, `applyCustomerServicePack`, run by
both of the job builder's generators (the AI plan in `flowGenerator.ts` and
the built-in plan in `templateGenerator.ts`), so the builder's two paths ask
the same things:

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
5. the written interview. A phone or mixed job's interview starts with the
   two questions about calls (`PHONE_INTERVIEW_QUESTIONS`), each unless one of
   the model's questions already asks the same thing about a call (an angry
   caller; putting someone on hold or passing the call on; "transferable
   skills" and "hold yourself accountable" are not that), and
   always keeps at least one of the model's own, until the practice call
   exists (docs/LAUNCH-PLAN.md, "Later"); an interview the model left empty
   gets the customer-service bank's questions.

The chat step also keeps the channel the business chose (`config.channel`),
which the interview guide reads.

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

- the other side named by the pack's word, whoever's business it is (a pack's
  word wins; a step with no pack says the business's word: "player" for the
  owner's own, "customer" for any other). Lines read `PATIENT 4:`. Anything
  an applicant types that is shaped like a label is neutralised
  (`_shared/reviewText.ts`): look-alikes are folded first (NFKC) and every
  default-ignorable character removed (zero-width, bidi isolates, variation
  selectors, tag characters); then "Word 3:", "WORD_4:", "WORD (4):", any
  capitals with a colon, and a word mixing Latin with look-alike letters
  lose their colon, colon look-alikes included (modifier-letter, Armenian,
  Hebrew, Syriac, Devanagari, Bengali, Gujarati, Ethiopic, Runic, Khmer, Lisu
  and math colons). Numbers count in any digits ("PATIENT ٤:"), with or
  without "No." ("Patient No. 4:"), and small capitals ("ɪɴᴛᴇʀᴠɪᴇᴡᴇʀ:") are
  read as capitals. Times ("10:30"), ratios and "John 3:16" are left alone. Quotes are checked on the same folded words;
- WHAT THE AGENT KNOWS as the only true facts, and anything promised or stated
  that they do not allow counting heavily against the mark;
- the pack's note, WHAT GOOD LOOKS LIKE IN THIS KIND OF BUSINESS.

The owner's own business still says "player" (`counterpartFor`). A step with
no pack is graded as before. `EVAL_PROMPT_VERSION` is `chat-sim-eval-8`.

## The interview guide

`src/lib/interviewGuide.ts` (and its server copy): a customer-service job (a
chat practice with a pack, `customerServiceStepOf`; not any job the scorer
calls "support", which a "supportive team" also is) gets its own plan. It
lists the chat practice as already done and hears them speak, with a
one-minute practice where the interviewer is the customer. A phone job (the
step's `config.channel` is "phone", or "mixed": phones among its channels)
also asks how they hold and pass on a call. The pack's word replaces
"customer" except in "customer service" (the name of the work) and in the
question about their last job, whose customers were not this business's. A team lead's job keeps the team-lead plan. The plan, the guide's
prompt and the written-interview grader all use the pack's word ("patient")
where the job has a pack; only a pack the app knows counts.

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
- The classic job editor (`src/pages/CreateJob.tsx`) writes its own questions
  with `ai-generate-workflow` and uses a pack only in its built-in fallback;
  the Ava job builder is the customer-service path.
