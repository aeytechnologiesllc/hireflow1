# Customer-service hiring (Phase 4, 2026-10-25)

HireFlow's niche is hiring customer service agents, chat and phone, for any
business (CLAUDE.md, "Positioning"). A business that types "chat agent for a
dental office" or "phone support for an online store" gets the right
follow-ups, its industry's skills check and chat practice, and grading in its
own words. docs/LAUNCH-PLAN.md, Phase 4, is the plan this follows.

## What Ava asks

**Ava's first question, for every job, is "What kind of job is it?"**
(Answering customers by chat, phone or email / Another kind of job), starting
on her guess (`jobKindFollowUp`, `src/lib/avaEngine/playbook.ts`). The answer
decides the family (`detectFamily` reads it from the brief, in both plan
builders), so a wrong guess costs one click. After a voice brief the builder
asks it too (with the channel, for customer service) before building, with
the voice session kept open, and the screening level follows the answer; the
answer never appears in the published post. It was added after the fourth
Phase 4 review: four rounds of word rules still misread some titles, both
ways.

The guess (`isCustomerService`) reads the title's role phrase, then the
description. The title is read in parts, split at " - ", " | ", commas and
brackets; a part after "for", "at", "in" or "with" names the business, never
the role ("Recruiter - BPO" is a recruiter, "Quality Analyst - Call Center" an
analyst). The role phrase is the first part naming a person's role (an
industry or an account part does not: "Healthcare Account - CSR", "Tech -
Customer Support Agent"), then a support line, else the first part with any
role word, so a place, the hours or "hiring" around it does not hide it
("Remote - Customer Support Agent", "Makati | CSR", "Hiring for Customer
Service Representative"). A support line (customer service, call centre,
BPO, help desk, front desk, guest or patient services…) keeps as its own only
the people it hires, with nothing but when, where, how, at what level or in
what language they work ("Customer Service - Night Shift Agents", "Tech
Support - Level 1 Agents", "Chat Support - Agents Wanted", "Customer Service -
Trainee"), or the people it serves: a plural that is not a shop-floor job
("Customer Success - Teachers"; never beside a call centre, a BPO or a front
desk, which are workplaces: "Call Center - Recruiters" are recruiters), a
part whose last word is no role ("Customer Support - Driver Partners"), or
people the words say it helps or answers ("Customer Support - Uber Drivers /
help drivers by chat"). Any other job named beside it is the role: "Customer
Service - Cashier", "Customer Service - Admin Assistant", "Call Center -
Recruiter", "Help Desk - Network Engineer", "Guest Services - Housekeeper".
A bare role noun takes the part after it ("Specialist, Customer Support",
"Agent (Customer Support)", "Team Leader - Customer Service", "Trainee -
Reservations Agent"; never an analyst or a consultant, who is that
department's: "Analyst - Customer Support"). Its last word is the role noun.
A benefits line or sentence ("Benefits include medical and dental", "13th
month pay", "what you get: medical, dental, 401(k)") is not read, one line or
sentence at a time, nor a sentence naming an HMO unless the work is about it
("verify patients' HMO", "process HMO claims"). A plan offered to the
employee is taken out by itself wherever it is ("excellent medical and dental
plans", "medical and dental insurance included", "we offer medical and
dental", "Medical/dental/vision."), never the business ("a medical and dental
clinic", "Medical & Dental Clinic in Makati", "we provide medical and dental
services") or a plan the work is about ("confirm their dental insurance
coverage", "check dental insurance eligibility", "their dental benefits").
How to apply ("Email your resume to …", "Send your CV via WhatsApp") is not
read either (the same rule as the channel's, below). In this order:

1. the role noun is a shop-floor, kitchen, road, trade or gym one (barista,
   cashier, server, cook, driver, teller, mechanic, instructor, trainer…;
   a clerk, attendant or host unless the role phrase is a support one,
   "Customer Service Clerk", "Live Chat Host", or a clinic's front desk; a
   desk you stand at is a place, so "Front Desk Clerk" at a hotel and
   "Customer Service Desk Clerk" at a supermarket are not); a shop-floor job
   named in the singular in any part of the title or on either side of a
   slash ("Customer Service Rep - Cashier", "Cashier/Customer Service Rep";
   not a computer's server: "Technical Support - Minecraft Server"); a store
   or warehouse associate (not an online shop's); a store named as its own
   part of the title, before the role or after it ("Retail - Customer
   Service Associate", "Grocery | Customer Service Clerk", "Customer Service
   Associate - Retail", "Customer Service - Restaurant", "Customer Service
   (Retail Store)"), unless the title names a channel ("CSR | Retail", "Chat
   Support - Retail") or the words put the work off the floor (chats,
   messages, tickets, an online shop, inbound calls, a BPO, call centre or
   voice account, working from home: "CSR - Retail / inbound calls for a US
   retail account"); answering calls or emails alone does not, since a store
   answers its phone, except after the role with nothing in the words about
   being in the store ("Customer Care Representative - Pharmacy / answer
   calls from members" is the account; "Customer Service Associate - Retail /
   assist customers in our store … and answer phone calls" is the store);
   the front desk of a hotel, gym, salon, spa (not a med spa), museum or an
   office (phones or not), unless the words say the work is done from home
   ("office hours" and "work in our office in Ortigas" say where the agent
   sits, not whose desk it is, unless the work greets visitors there); a
   pharmacy technician; or a clinical assistant who is not virtual or remote:
   not customer service. "Online Store Chat Agent", "Driver Support Agent" and
   "Maid Service Customer Service Representative" name the business, not the
   role, and are;
2. a support title whose people are colleagues (HR, payroll, finance,
   operations, logistics, sales, admin, office, clinical, field, facilities,
   peer or mental health support): not, unless the work is customers'
   calls, emails, chats or tickets and the function is a business one a
   product serves (HR, payroll, finance, accounting, logistics, operations,
   sales, marketing, engineering, a game's community support); admin, office,
   clinical, peer, field, production or facilities support never;
3. work done in person with nothing remote about it (in-store, on the floor,
   at the register or a counter, working the counter or the service desk, at
   the gate, the branch, the airport or the box office, at a post office,
   ticket or check-in counter, in a grocery store, in the lobby, greeting
   guests or members, or customers as they arrive, checking guests, clients,
   vehicles or bags in; tickets, a help desk, the phone or a messaging app
   count as remote, but not the phone at the showroom or the box office the
   words name, nor tickets that are sold): not. A clinic's front desk greets
   and checks in patients and is left to item 6;
3a. a clinic's appointment setter or patient admin role whose work is
   patients' calls or bookings: customer service; then selling or collecting
   in the title (outbound, telesales, sales, collections, cold caller,
   appointment setter; after-sales and pre-sales are service): not, except
   "Sales & Service" or "Sales and Customer Support" whose work answers
   customers with nothing in it that sells (no cold calls, quotas, upselling,
   showroom or commission); then a professional's role noun (engineer, developer,
   designer, analyst, recruiter, accountant, coach…): only a support desk's
   analyst or consultant ("Help Desk Analyst", "Customer Support Consultant",
   "Customer Success Consultant"), or a support, tier or level 1–3 title with
   real support work ("Support Engineer — answer customer tickets", "Tier 1
   Analyst — answer customer tickets"; "L1 Analyst (SOC)" alone is not);
4. a support title is customer service: customer / client service(s),
   support, care, success, relations; support, chat, service-desk or voice
   agents, reps, specialists; customer, chat, technical or IT support
   managers and leads (a senior or remote one too); technical / IT support
   technicians; help or service desk; call or contact centre; a voice or
   non-voice account (and an account named by its channel, "Healthcare
   Account - Voice"); BPO; CSR, CS agent, TSR, CSA; L1, level 1 or tier 1
   support; front desk; a virtual or remote receptionist; patient services
   and appointment schedulers; telephone, switchboard and answering-service
   operators; customer, client, member, guest and billing advisors; a virtual
   assistant whose title names the support ("Virtual Assistant - Customer
   Service"). A reservations or booking agent is customer service unless its
   work is in person, books what is not a customer's (musicians, bands, DJs,
   entertainers, talent, freight, cargo, shipments, containers, group tours;
   models, venues, loads or carriers only as what is booked: "book models",
   "book loads", "freight loads", never "car models", "a high call load",
   "airline carriers" or "our restaurant venues"), or schedules the
   business's own crews or technicians with no customer or channel in the
   words ("Schedule our crews and assign jobs to technicians"; "Take calls
   from customers and schedule our cleaning crews" is customer service). A
   booking agent whose words say nothing about the job ("Must have excellent
   English communication skills") is customer service;
5. outbound calling (cold calls, telemarketing, booking demos): not;
6. a front-office role at a clinic (a receptionist, a medical office or
   office assistant, with patients or a clinic in the words); a patient admin
   role (medical secretary, care, patient care or intake coordinator, a
   (medical) scheduler, appointment setter, a virtual medical or dental
   assistant) when the work is patients' calls or bookings. A clinic is
   patients, a clinic, a dental, medical, chiropractic, orthodontic,
   optometry, physio or vet practice, or pet owners; a pet-friendly office is
   not;
7. a title with "support" and support work ("Support Technician — help
   customers by phone");
8. another role named in the title keeps its family: engineer, manager,
   analyst, writer, tester, a non-clinic receptionist, and the admin and
   sales roles that also answer phones (admin, administrative, executive,
   office, personal or legal assistant, paralegal, secretary, coordinator,
   telemarketer, cold caller, real estate, insurance or collections agent),
   and nursing and triage;
9. else the description has to say the job IS answering customers by a
   channel: a verb, a customer-type word (customer, client, patient, caller,
   player, guest, member, buyer, shopper, user, visitor) and a channel
   ("handle customer tickets"); helping customers by chat, phone or email;
   chatting with customers; incoming or inbound calls; answering chats;
   staffing a live chat or help desk; "customer service for / by …"; or, at a
   clinic, answering the phones. "Answer customer questions" alone does not
   count (a teller or a waiter does that), nor a bare mention ("our live chat
   widget"), a quality ("great customer service"), or "answer phones, manage
   calendars".

Every Phase 4 review's cases, about six hundred and fifty, are in the test
(`scripts/customer_service_hiring.test.mjs`).

Its follow-ups (one chip each, the default in brackets):

| id | Question | Chips |
|---|---|---|
| `cs-channel` | How will they talk to your customers? | Chat, Phone, Email, A mix of these; the default is what the business's own words say (`channelForBrief`), read channel by channel. The title's channel words lead, in any part of its role ("Customer Service (Phone)", "Customer Service - Voice", "Customer Service – Inbound Calls"), never in a "for …" part ("Chat CSR — for a call center" is chat) or as a product ("Phone Repair Store Chat Agent", "Call Center Software Support", "Mobile Phone Customer Support"). The description adds a channel when the agent does that work ("answer calls", "inbound calls", "some phone"), or by a list of channels ("phone, email and chat", "calls and emails", "SMS and phone", "voice and non-voice"), but not what customers own ("their phone and email accounts"); its mere mentions count only when the title names no channel. A channel is out when the words rule it out: always for "non-voice", "chat only" or "chat/email only" ("only tickets and live chat" is both, not tickets only; "inbound only" is phone); for "no phone calls", "we don't take calls", "you won't need to make or take calls", "this role does not involve phone calls (or sales)", "phone support isn't required" or "phone support is handled by another team" unless they also take calls ("You won't need to make calls. You will answer incoming calls."; "handled by our call center" or "by our sales team" counts as someone else), or the words name a voice account ("Voice account. No calls and no sales quotas" is phone); "no emails" for email. A "without" rule stays on its own line ("Can work without supervision" over a line "Handle inbound calls" keeps its calls). Never a rule: "no call center experience", "no voice account experience", "no phone or sales experience", "no phone sales", "no email marketing", "billing calls are handled by another team", "all calls are handled from home", "never call a customer by their first name", or a rule about when ("no calls on weekends", "after 8pm", "outside business hours"). How to apply, from its phrase on ("send your CV by email or call us", "Email your resume to …", "Please email your CV", "Submit your resume through email", "How to apply:", "interested applicants may send …", "apply via email", "for inquiries, email us at …"; never a duty: "know when to apply discounts", "teach customers how to apply promo codes", "interested applicants should be comfortable handling inbound calls"), and a "brand voice" or "on-call" say nothing about the channel. "Calls for patience" is no call, and "a company laptop and phone", "phones and accessories" or a phone a preposition points to is no phone work ("returns for their phones", "requests for call backs", "orders for replacement phones", "questions about smart phones", "make sure phones are shipped"); "answer calls for our clients", "handle a high volume of calls", "through phone", "inquiries from callers" and phone orders or inquiries a verb takes ("take phone orders", "answer phone inquiries") are, but not phone orders as a topic ("answer emails about phone orders"). Call-centre, BPO or phone support experience, asked for or not ("at least 6 months BPO experience", "no call center experience required", "with or without call center experience"), points to phone when the words name no written channel ("Reply to customer emails and chats. No call center experience required." is chat). A call or contact centre in the title's own parts is phone unless the title names a written channel ("Call Center Agent - Chat" is chat); "blended", "omnichannel" or "multichannel" is a mix in the title's role parts ("Blended CSR", "Customer Service Representative (Blended)", "Omnichannel Agent") and in the words unless it names a product or the business ("Blended", "a blended account", "an omnichannel environment" are; "blended coffees" and "a multichannel e-commerce brand" are not). Phone and a written channel is a mix; chat and email, chat; tickets, email. A bare "CSR", a receptionist or an operator with no channel in the words is phone (the Philippine meaning of CSR; any written channel in the words decides instead) |
| `cs-industry` | What kind of business is it? | Medical or dental office, Online store, Software or app, Home services, Gaming, Something else; the default is what the business's own words point to (`industryFromText`) |
| `cs-load` | How many chats or messages at once? ("Besides calls, …" for phone or a mix) | One at a time, [Two or three], Four or more |
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
   the model's questions already asks the same thing about a call: in one
   sentence, or a sentence with the one before it, unless either names a
   written channel: a call set up first and a question about that caller
   ("You're on the phone with a customer. How do you handle it if they start
   yelling?", "You're taking calls all day. How do you handle an angry
   customer?"; a caller who asks for a manager or demands a supervisor is
   still that caller; never a coworker, a manager, a project or a training
   the sentence is about: "How do you handle an angry coworker?", "Your
   manager is angry with you."), or a statement after it ("A patient is
   shouting. They are on the phone."),
   never an upset line and then a question about something else; "Mr." and "Dr." end no sentence. An
   angry caller is angry, upset, furious, irate, rude, abusive, shouting,
   yelling, screaming, swearing or talking over you; on hold is a person on
   hold ("put patients on hold"), or on a call; passing the call on counts
   too. "Transferable skills", "hold yourself accountable", "notes on hold
   times", a project, a ticket or a feeling on hold, and an upset customer by
   chat or email are not that. It
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
  owner's own, "customer" for any other). Lines read `PATIENT 4:`. An
  applicant cannot write a line that reads as one (`_shared/reviewText.ts`):
  their text is folded (NFKC, small capitals to capitals), every invisible or
  format character goes (private-use and unassigned characters and control
  codes too: the flattening's own colon placeholder is one), a combining mark after a digit or a space goes (after
  a Latin letter, only an accent stays: see below), every punctuation mark or symbol outside a short plain list
  becomes a space (so no colon look-alike survives in any script: a closed
  list of what stays, after four reviews kept extending the list of what
  goes), line and paragraph separators become spaces, and any colon after a
  word becomes a dash ("Note: I checked" reads "Note - I checked"). A
  combining mark stays only after a letter (never a digit) of its own script
  (Hindi, Hebrew and Arabic vowel marks read as written; a Myanmar or
  Devanagari mark after a Latin, Cyrillic or Cherokee letter, or after a
  digit, "३ः", goes), and an accent after a Latin letter (Yoruba "ẹ́");
  angle brackets of every width go, and letters shaped like them (ᐸ ᐳ);
  guillemets read as quote marks; everyday symbols stay (°, ×, ¿, ¡, the
  Arabic comma, emoji, skin tones, flags). Times ("10:30"), ratios and "John
  3:16" keep their colon, except after a speaker label or a word that reads
  as one (no small letters, which takes in capitals and scripts with no
  case, or two scripts), where the colon becomes a full stop ("PATIENT
  4.30"; "TOMORROW 10.30" still reads as a time); spaces, tabs and newlines
  before it count as one. Quotes are checked on the same folded words;
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
- Tests: `scripts/customer_service_hiring.test.mjs` (detection on about four
  hundred briefs, both ways, and the job-kind answer overriding the
  guess, every pack against the writing rules, the plan for every industry
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
