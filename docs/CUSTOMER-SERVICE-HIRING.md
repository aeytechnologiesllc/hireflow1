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
Trainee", "Customer Service - Representative II"); after it, also its
front-line agents, reps, specialists, associates, advisors, officers,
executives or staff by what its work is about, an industry, an account, a
channel or a support function ("Customer Service - Billing Specialist",
"Customer Care - Retention Specialist", "Call Center - Healthcare Agents",
"BPO - Healthcare Account Agents", "Member Services - Claims Representative",
"Customer Service - Email Specialist"; never another trade's agent, an
account's seller or a floor associate: "Insurance Agent", "Travel Agent",
"Account Executive", "Account Manager", "Retail Associate"; nor a store's,
a hotel's or a care home's own staff: "Retail Staff", "Hospitality Staff",
"Care Staff", the eleventh review; nor a medical,
dental, mortgage or logistics one, which is that job: "Medical
Representative"), and after a support desk, its own analyst, consultant,
engineer or technician ("Help Desk - Analyst", "Help Desk - Level 1 Analyst",
"Customer Support - Tier 2 Engineer", "Help Desk - IT Specialist"; not
"Help Desk - Network Engineer" or "Call Center - Quality Analyst"); or the
people it serves: a plural that is not a shop-floor job or an office or
professional one ("Customer Success - Teachers"; "Customer Service - Admin
Assistants", "Customer Success - Account Executives" and "Technical Support -
Network Engineers" are those jobs; never beside a call centre, a BPO or a
front desk, which are workplaces: "Call Center - Recruiters" are recruiters),
a part whose last word is no role ("Customer Support - Driver Partners"), or
people the words say it helps or answers, singular or plural ("Customer
Support - Uber Drivers / help drivers by chat", "Customer Support - Courier /
help couriers with app issues via chat"; a shop-floor job in the singular
only by a channel or the business's app or platform: "Customer Service -
Cashier / assist cashiers during busy periods" is the cashier, the eleventh
review; "Customer Support - Driver / help drivers with app issues, payouts and
account problems" is the drivers' line, the twelfth; helping them with it in
one sentence, so "Delivery Driver - Customer Service / Use our driver app to
accept deliveries. Help customers with questions at drop-off" is the driver,
the thirteenth). Any other job named beside it is
the role: "Customer Service - Cashier", "Customer Service - Admin Assistant",
"Call Center - Recruiter", "Help Desk - Network Engineer", "Guest Services -
Housekeeper". A channel part names a bare role beside it ("Voice - Agents",
"Non-Voice - Agents"); collectors are sales ("Call Center - Collectors").
A bare role noun takes the part after it ("Specialist, Customer Support",
"Agent (Customer Support)", "Team Leader - Customer Service", "Trainee -
Reservations Agent"; never an analyst or a consultant, who is that
department's: "Analyst - Customer Support"). Its last word is the role noun.
A benefits line or sentence ("Benefits include medical and dental", "13th
month pay", "what you get: medical, dental, 401(k)") is not read, one line or
sentence at a time, nor the bullets under a "Benefits:" or "What we offer:"
heading wherever the heading is (the eleventh review: after a duty line only
the heading went, and "- Discounted dental care" stayed behind; bullets are
"-", "•", "*", "·", "▪", "◦", "✓", "✔" or "➢", round sixteen's, never any mark:
the eighteenth review found the seventeenth's any-mark bullets swallowed the
duties after an emoji-led perks block, "Benefits:\n✅ HMO\n📌
Responsibilities:\n✅ Answer customer chats and emails" was no customer
service and "Benefits:\n✅ Free meals\n📌 Duties:\n✅ Assist shoppers in the
store" was; only the setup line's reader below skips an any-mark perks
block; "What you'll get to do:" heads duties, never perks, and only "to
do": "What you'll get to enjoy:" heads perks, the nineteenth), except a
perk that is how the job is worked: remote work or the night shift
("Perks:\n- Permanent work from home", "What we offer:\n- 100% remote",
"Night shift differential"; the twelfth review: those jobs read as on site;
never "Free virtual fitness classes" or a "Remote work stipend for corporate
staff", the thirteenth; but "100% virtual role" and a "WFH allowance" are,
the fourteenth; "virtual" only as the role or its setup, "Fully virtual
team", "Virtual office", never another virtual perk, "HMO with virtual
consultations", "Virtual team-building events", "Monthly virtual town
halls", which took store, hotel and counter jobs off the floor; the
fifteenth), nor a
sentence naming an HMO unless the work is about it ("verify
patients' HMO", "process HMO claims", "coordinate with HMO providers"). A
plan offered to the employee is taken out by itself wherever it is
("excellent medical and dental plans", "medical and dental insurance
included", "we offer medical and dental", "Medical/dental/vision.", the usual
US list "Medical, dental, and vision insurance", "medical, dental and
optical", "medical and dental reimbursement", "eligible for medical, dental
and vision", "company-paid medical and dental", a yearly check-up: "Free
annual medical and dental check-ups"), never the business ("a
medical and dental clinic", "Medical & Dental Clinic in Makati", "we provide
medical and dental services", "free dental cleanings for staff") or a plan
the work is about ("confirm their dental insurance coverage", "check dental
insurance eligibility", "their dental benefits", "handle dental insurance
verification", "collect medical insurance cards", "prepare dental insurance
claims", "knowledge of dental insurance", "excellent medical front desk
support"). The tenth review found the US list left "dental" behind, so an
office, hotel or salon front desk read as a clinic's. How to apply ("Email
your resume to …", "Send your CV via WhatsApp", "Walk-in applicants are
welcome at our Makati office") is not read either (the same rule as the
channel's, below), nor a remote word that is negated or about the training
("This is not a remote position", "no remote work", "not a work from home
job", "occasional remote training"), which says the job is on site. Each
rule starts at a word, a line or a sentence, or is bounded, so a huge pasted
line is read in linear time (the tenth review: the benefits filter took 4.4
seconds on 90 KB). In this order:

1. the role noun is a shop-floor, kitchen, road, trade or gym one (barista,
   cashier, crew ("Customer Service Crew" at a fast-food or milk-tea counter;
   the thirteenth review; only when the title names no channel, remote or
   support word and the words nothing off the floor: "Chat Support Crew",
   "Non-Voice Crew", "Customer Care Crew - Night Shift / Answer inbound
   calls" are support lines; the fourteenth; a customer experience or CX
   crew is one too, but no other "experience" in the title: "Customer Service
   Crew (No Experience Needed)" is the counter's; the fifteenth), server,
   cook, driver, teller,
   mechanic, instructor, trainer…;
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
   messages, tickets, an online shop, a mail-order pharmacy, an online
   grocery, inbound calls, a BPO, call centre or voice account, a "US retail
   account", working from home: "CSR - Retail / inbound calls for a US retail
   account"). With nothing in the words about being in the store (in it,
   keeping its counter clean, helping customers there, its shelves, aisles
   or fitting rooms, cash handled, its till, running its POS or ringing
   transactions on it, bagging groceries, the front end, a 24-hour store,
   serving food, keeping the store clean, pricing items as a duty; "at our
   50 stores across Texas" is no one store), it is the account when the
   words name a client's signs: a named
   account ("our retail account", "a US retail client"), customers in
   another country ("Assist US customers"; not "Join us and help
   customers"), a US, foreign or Fortune 500 retailer the team works for
   ("for a US retailer", "customers of a Fortune 500 retailer", "Our client
   is a US retail brand", "Our client, a leading US retailer,"; not one that
   is hiring: "Join an American retail brand!", "Walmart is a Fortune 500
   retailer"), a BPO site the agent works at or ours named by its place, or
   an IT park ("Work in our Pasig site", "We are hiring for our Makati
   site!"; not "keep the site clean"),
   policyholders, or members with a plan's claims, coverage, benefits or
   prescriptions (not "help members with returns"), a chain's or a
   restaurant group's hotline, its delivery orders, customers who shop on its
   website or their concerns about orders placed there (not "Prepare orders
   placed on our app for curbside pickup"; the thirteenth), software its customers use or set up, or
   questions about its software ("Customer Support Specialist - Retail /
   support customers of our retail POS software", "help merchants set up our
   POS system"; not "use our software to look up prices" or "operate the POS
   system"); after the role, also any remote channel
   (calls, emails, a telephone, voice, a hotline; not a person's "pleasant
   voice") or the night shift ("Customer Care Representative - Pharmacy /
   answer calls from members"); before it, a written channel ("Shop -
   Customer Support Agent / answer customer emails"), but not calls alone,
   since a store answers its phone ("Customer Service Associate - Retail /
   assist customers in our store … and answer phone calls" is the store; the
   tenth review). The eleventh review found the bare words (POS, members,
   software, site, app, website, online orders, a chain or group, a
   Fortune 500 or American brand, the night shift at a 24-hour store) all
   over stores' own posts, so each now needs what shows a call centre. The
   twelfth found the eleventh's own floor words in call centres' posts ("help
   customers find the right plan", "over the counter items", "counter-check
   order details", "retailers using our POS system", "cash on delivery
   concerns", "experience as a cashier"), so those count only as the store's
   work ("handle cash and keep the counter clean", "process transactions
   using our POS"), and the phones a store sells are no channel ("Sell
   phones, tablets and accessories", "Help customers choose phones and
   plans"). The thirteenth found that narrowing brought the store's own floor
   back as an account wherever its words named a phone, an email or the
   night shift, while every call centre's post the twelfth found carried an
   account sign. So the eleventh's other floor words are back as the floor's
   duties, which keep only the bare channel or night shift after the role
   (or the email before it) from reading as the account, never a client's
   sign: a cashier as a duty ("work as cashier", "handle cashiering duties";
   not "experience as a cashier"), helping customers find goods or items
   ("help customers find products", "assist shoppers in locating items"; not
   "find solutions", "answers" or "the right plan", nor on the website or in
   the online catalog: "Help customers find products on our website over the
   phone"; the fourteenth), the counter ("serve customers over the counter",
   "handle counter transactions"; not "counter-check", "over the counter
   items" or "counter pickup orders"), cash payments or the cash drawer (not
   "cash on delivery concerns"), and using the POS as the agent ("Use our POS
   system to process sales and returns. Graveyard shift" is the store;
   "Support retailers using our POS system by phone" is still the account,
   and "Help merchants use our POS software over the phone" is no floor duty;
   the fourteenth).
   With
   no words at all, a store part after the role is still the store
   ("Customer Service Representative | Retail");
   the front desk or front office of a hotel, gym, salon, spa (not a med
   spa), museum or an office (phones or not; "Hotel Front Office
   Associate"; the "office" of a "Front Office" title is the role's name,
   not the venue, so "Front Office Associate / handle inbound calls for our
   healthcare account" is not; the eleventh review), unless the words say
   the work is done from home ("This is
   not a remote position" does not; "office hours" and "work in our office
   in Ortigas" say where the agent sits, not whose desk it is, unless the
   work greets visitors there); a
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
   ticket or check-in counter, in a grocery store, in the lobby, greeting or
   welcoming guests or members, or customers as they arrive, checking guests,
   clients, vehicles or bags in, a hotel's check-ins and check-outs, greeting
   walk-ins (the thirteenth review: "Guest Service Agent / Welcome guests at
   the front desk and handle check-ins and check-outs", "...greet walk-ins";
   the fourteenth narrowed both back: check-ins and check-outs only beside a
   hotel, a front desk, a lobby or a resort, never a holiday rental's remote
   guest support, "Answer guest questions on Airbnb and VRBO, manage check-ins
   and check-outs"; and a walk-in client or customer, never "Walk-ins
   welcome" or "We accept walk-ins daily at our Ortigas site", which invite
   applicants; the fifteenth narrowed each to that evidence instead:
   check-ins and check-outs anywhere, as the thirteenth read them, an inn's,
   an apartelle's or a hostel's too ("Welcome arriving guests, handle
   check-ins and check-outs, and process payments"), except on the line of a
   holiday rental, Airbnb or VRBO; a walk-in only before a person or a matter,
   "walk-in clients", "walk-in inquiries", "walk-in and phone inquiries",
   never one inviting applicants, "Open for walk-in!", "Walk-in or apply
   online"; and greeting, serving, assisting, attending to, entertaining or
   accommodating walk-ins, "Serve walk-ins and handle cash payments"; the
   sixteenth: a walk-in query or queue too, "Answer walk-in queries and
   process payments", "Manage the walk-in queue", and handling or catering
   to walk-ins, "Handle walk-ins and process bills payment", "Cater to
   walk-ins and answer their inquiries"; never welcoming them, "We welcome
   walk-ins!" invites applicants; and the line of a remote host's guests is
   a rental's whatever it is called: Booking.com, Agoda, a vacation home or
   property, a holiday home, a listing, or check-ins in an app or on a
   platform, "Answer guest questions on Booking.com and Agoda, and manage
   check-ins and check-outs", "Help gym members with app check-ins and
   check-outs"; the seventeenth: a lodging's own check-ins and check-outs
   are its desk's whatever app or platform its bookings come from, under a
   lodging-desk title (a guest-service or guest-relations title, or a front
   desk or front office whose words name guests or take check-ins and
   check-outs) or "at our hotel", resort, inn, hostel, motel, lodge, pension
   house or apartelle, or "in the lobby", never a remote host's (Airbnb,
   VRBO, rentals, vacation or holiday homes): "Front Desk Agent / Handle
   guest check-ins and check-outs and manage reservations from Booking.com
   and Agoda", "Guest Experience Associate / Handle check-ins and check-outs
   at our boutique hotel; respond to reviews on booking platforms"; the
   eighteenth: only when the agent's own verb takes them, handling,
   managing, processing, performing, doing or assisting with the check-ins
   and check-outs, and never by phone, video, chat or email: a hotel
   account's guest-services agent is customer service, "Guest Services Agent
   / Answer guest calls and emails about reservations, check-in and check-out
   times and billing", "Guest Relations Associate / Handle guest calls about
   reservations, check-ins and check-outs for our client hotels", "Guest
   Services Agent - Hotel BPO / Handle check-ins and check-outs over the
   phone for US hotel guests"; the nineteenth: whatever verb takes them, or
   none, since the verbs left the most common hotel desk posts customer
   service, "Front Desk Agent / Responsibilities:\n- Guest check-ins and
   check-outs\n- Answering phone calls", "Facilitate guest check-ins and
   check-outs", "Check-in and check-out guests"; only the eighteenth's
   evidence is taken out, check-ins as the topic, after "about" or
   "regarding" (the twentieth: "with" and "on" also lead the desk's own
   work, "Assist with guest check-ins", "Coordinate with housekeeping on
   room status, process check-ins…", so they no longer count; the
   twenty-first: but "on" a call's, an email's or a question's topic, or
   "over the phone with" the guest, within a few words or a list, are a
   hotel account's calls, "Handle guest calls on reservations, check-ins
   and check-outs"; "check-in/check-out" and "check in and check out"
   are check-ins too; the twenty-second: never across "and" inside that
   window, so "Answer guest calls on reservations and handle check-ins"
   is the desk's; and hotels served for someone else, "our client
   hotels", "partner hotels", "US hotels", are a hotel account's, not a
   door; a lodging desk that greets or welcomes guests, works in the
   lobby or in person is at the door; check-ins in a product's software,
   SaaS or kiosk are a feature), their
   times, policies, schedules (the twentieth: not procedures, "Assist with
   check-in and check-out procedures" is the desk's; the twenty-second:
   requests, concerns, issues, inquiries, questions, problems, changes)
   or dates, and check-ins done by phone, video, chat or email unless in
   person too: "Handle check-ins and check-outs by phone and in person" is
   the desk's), the
   store's own floor work for a title with no store part too (the fifteenth:
   "Customer Service Associate / Greet customers, take orders and handle the
   cash register", "Customer Service Representative / Serve customers, take
   food orders and keep the dining area clean"; only the counter's own
   duties since the sixteenth, the agent operating, running or handling the
   register, the till or the POS, bagging groceries, serving food, stocking
   or keeping the shelves, keeping the store, the counter, the aisles or the
   dining area clean; never a store-floor word named as a topic, which the
   fifteenth's every-word reading took: "Troubleshoot customer issues with
   the front end and back end of our web app", "coordinate restocking with
   our warehouse team", "seat selection (aisle or window)", "Troubleshoot
   point-of-sale terminals and cash registers for our restaurant clients",
   "Answer calls from customers about our cash register software"; the
   seventeenth: and the agent's own cash and floor duties those cases name,
   which the sixteenth had dropped with the topics: handling, counting,
   accepting or taking the cash (never after "to", "train their staff to take
   cash"), cash handling, working the till, at the cash register, restocking
   merchandise, products, items or goods: "Customer Service Representative /
   Handle cash, issue receipts and assist customers with returns and
   exchanges", "Customer Service Assistant / Work the tills, process refunds
   and help shoppers in the aisles"; never transactions on the POS, which a
   merchant line handles, nor opening "the store app"), helping customers in or at the store, the branch or
   the showroom: "Help customers at our cell phone store"; one store only,
   never an online platform's shop or stores in many places: "our TikTok
   Shop", "our WooCommerce store", "our web store", "the App Store", "our
   franchise stores", "our store locations nationwide" (the eleventh review);
   only those: a store "throughout the day", "across from SM City" or
   "across Metro Manila", "our store location in SM North", "our franchise
   store in Cebu", "our franchise restaurant" and "our digital printing shop"
   are one store, and an app, Play or digital store is only the word right
   before the store (the twelfth review); a country is many places ("our
   stores across the US", "throughout Australia"; the thirteenth), and so are
   "the U.S.", North America, Luzon, Visayas and Mindanao, and a US state
   ("our branches across Luzon, Visayas and Mindanao", "our stores throughout
   Texas"; the fourteenth; "across Metro Manila" is still one store);
   tickets, a help desk, the phone, a messaging app, an online business
   (in the words or the title: "E-commerce Customer Service"; a TikTok Shop
   or a Facebook or Instagram shop, but never "post our products on
   Facebook Marketplace" or "download apps from the Play Store"; the twelfth
   and thirteenth) count as
   remote, but not the phone at the showroom, the store or the box office
   the words name (a phone for store locations not placed in a city is no
   one store's: "Help customers at our store locations through our
   hotline"), nor at the entrance the words name ("Greet customers at the
   entrance, assist with returns and answer phone inquiries"; the
   thirteenth), nor at the front desk when the title names a venue
   ("Customer Service Representative - Gym / Greet members at the front desk,
   sell memberships and answer phones"; an office CSR who answers calls and
   emails and helps walk-in clients at the front desk keeps them: the
   fourteenth; only a lodging's, a gym's, a salon's, a spa's, a clubhouse's or
   a museum's, named in the title or as "at the front desk of our gym" or
   "of our salon"; an office's, a firm's, corporate, real estate, a condo's,
   a warehouse's or a factory's never: "Customer Service Representative
   (Office-Based) / Answer customer calls and emails about their accounts.
   Assist walk-in clients at the front desk", "Corporate Customer Service
   Representative" keep their calls and emails; the fifteenth; or a
   lodging's own desk title, which names no venue: a guest-service or
   guest-relations title, or a front desk or front office whose words name
   guests, "Guest Service Agent / Welcome guests at the front desk, handle
   check-ins and check-outs, answer the phone and process payments", "Front
   Desk Agent / Greet guests at the front desk, answer phone calls and handle
   reservations", never one with clients or visitors, "Front Office
   Associate / Answer customer calls and emails and assist walk-in clients at
   the front desk"; the sixteenth; and a lodging desk's check-ins and
   check-outs, as "at the front desk" is: "Guest Relations Officer / Welcome
   guests, handle check-ins and check-outs and coordinate with housekeeping.
   Answer phone inquiries", "Guest Service Agent - Pension House / Handle
   check-ins and check-outs and answer the phone"; the seventeenth), nor tickets
   that are sold or refunded, nor a store's
   lottery tickets): not. A clinic's front desk greets
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
   operators; customer, client, member, guest and billing advisors; hotline
   agents and officers ("Hotline Agent / Answer calls on our 24/7 customer
   hotline", "Hotline Officer"; the fifteenth); a virtual
   assistant whose title names the support ("Virtual Assistant - Customer
   Service"). A reservations or booking agent is customer service unless its
   work is in person, books what is not a customer's (musicians, bands, DJs,
   entertainers, singers, talent, shows, speaking engagements, freight,
   cargo, shipments, containers, truckloads, a freight forwarder's own words
   (import and export, forwarders, customs brokers or clearance, bills of
   lading: "Handle import and export bookings, coordinate with customs
   brokers", "Arrange bookings with forwarders"; the fourteenth), a model's
   bookings, event planning or management and a conference or corporate
   event the work plans, coordinates, manages or executes (never a team's or
   experience: "pass corporate event inquiries to the event management
   team", "Event planning experience is a plus"), whatever guests or rooms
   the words name (the fourteenth review: a planner's post names guest
   lists, RSVPs and hotel room blocks: "Event planning for corporate
   clients: manage guest lists, invitations, catering and venue logistics",
   "Organize corporate events and conferences for our clients; book rooms
   for attendees"), unless the words are a venue's own: our or the hotel or
   resort, room reservations or bookings, a banquet, function rooms or
   conference facilities (the fifteenth review: putting those forms where
   nothing skipped them made hotels' and resorts' reservations agents
   planners again: "Handle hotel room reservations and coordinate corporate
   events with our banquet team", "Handle room reservations for our resort
   and help plan corporate events"; and event planning inquiries, services,
   packages or requests are a venue's, as a team's or experience is:
   "Handle room reservations, group bookings and event planning inquiries
   for our hotel"; the sixteenth narrowed those to the fifteenth's own
   forms: our hotel or resort, or the hotel's, never any "the hotel"; room
   reservations or bookings, never with, at or from (partner) hotels; our
   banquet team, alone or beside another, never any "banquet"; so a
   planner's words are a planner's again: "Plan and coordinate corporate
   events for our clients: book the hotel, catering and AV", "Organize
   corporate events for our clients and handle room reservations with
   partner hotels", "liaise with the venue's banquet team"; the seventeenth:
   a venue's other words for itself are its own too, the banquet team,
   department, calendar, staff or office, never the venue's, for the hotel
   or resort, and a title that names a hotel or resort: "Booking Agent /
   Respond to booking requests for the resort and coordinate corporate events
   with the banquet team", "Reservations Agent - Hotel / Handle reservations
   and coordinate corporate events with the banquet team"; never "at the
   hotel", where a planner books room blocks, and never "our partner
   hotels"; the eighteenth: the banquet team and "for the hotel" only when
   the words name no clients, as an event agency's do: "Plan corporate
   events for our clients and coordinate with the banquet team at each
   venue", "Organize corporate events for the hotel clients we serve as an
   event agency" are a planner's; the nineteenth: only the agency's own
   clients, "for our clients", "for the hotel clients", "clients we serve",
   since a hotel's corporate clients are its guests: "Reservations Agent /
   Coordinate corporate events with the banquet team and answer calls from
   corporate clients" is the venue's; the twentieth: only clients the agency
   works "for", since "answer calls from our corporate clients" is a hotel's
   too; the twenty-first: and "our clients" except "from our clients",
   since "Plan corporate events with our clients" is an agency's), and an
   event management company; or a conference or
   corporate event whose venues, catering or AV the work books (named before
   it, or after it only as what it books: "bookings for corporate events and
   conferences: venues, catering and AV", "Book conference venues and
   catering for our corporate clients"), or an event's logistics ("Manage
   logistics for corporate events and conferences", "Coordinate event
   logistics"), unless the words name rooms or guests, as a venue's own do
   (the thirteenth review: "Answer guest calls and emails about room
   bookings, conferences and catering", "Handle client inquiries for our
   function rooms: weddings, birthdays, conferences and catering", "Answer
   guest calls and coordinate event logistics with our banquet team"; as the
   twelfth's "book hotel rooms for corporate events and conferences", "our
   hotel hosts weddings and conferences"; nor an event planner the venue
   works with: "Coordinate with event planners and handle bookings for our
   function rooms"); never event bookings, inquiries or packages
   ("Coordinate corporate event bookings and room blocks with our sales
   team"); logistics as the business (in the
   title, "a logistics company"), or a freight desk's own logistics words
   when the words name no customer and no channel (logistics partners, a
   logistics department, team, system or providers, "logistics or supply
   chain", "courier and logistics": "coordinate with the logistics
   department"; never travel, transfer or a job's own logistics, "handle
   travel logistics for our tour packages", "coordinate logistics for each
   shoot", nor "our logistics team" beside a customer's calls; the eleventh
   to thirteenth reviews), planned group tours; models, venues,
   loads or carriers only as what is booked or dealt with: "book models",
   "book loads", "freight loads", "negotiate rates with carriers", "call
   carriers", "secure capacity", never "car models", "a high call load",
   "book flights on major carriers" or "our restaurant venues"; a travel
   agency's group tours are customers'), works at the showroom with no
   channel named, or schedules the
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
   not; a cosmetic or plastic surgery practice or an IV therapy lounge too,
   which greet "guests": "Front Desk Receptionist / Welcome guests at the
   front desk, answer phones and schedule appointments for our cosmetic
   surgery center" (the seventeenth review; since the sixteenth a front desk
   with guests is a lodging's);
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

Every Phase 4 review's cases, about a thousand, are in the test
(`scripts/customer_service_hiring.test.mjs`).

Its follow-ups (one chip each, the default in brackets):

| id | Question | Chips |
|---|---|---|
| `cs-channel` | How will they talk to your customers? | Chat, Phone, Email, A mix of these; the default is what the business's own words say (`channelForBrief`), read channel by channel. The title's channel words lead, in any part of its role ("Customer Service (Phone)", "Customer Service - Voice", "Customer Service – Inbound Calls"), never in a "for …" part ("Chat CSR — for a call center" is chat) or as a product ("Phone Repair Store Chat Agent", "Call Center Software Support", "Mobile Phone Customer Support"). The description adds a channel when the agent does that work ("answer calls", "inbound calls", "some phone"), or by a list of channels ("phone, email and chat", "calls and emails", "SMS and phone", "voice and non-voice"), but not what customers own ("their phone and email accounts"); its mere mentions count only when the title names no channel. A channel is out when the words rule it out: always for "non-voice", "chat only" or "chat/email only" ("only tickets and live chat" is both, not tickets only; "inbound only" rules nothing out and is phone only when no written channel is named: "Chat Support Agent / Inbound only, no outbound sales" is chat, "Inbound only, no sales" phone); for "no phone calls", "we don't take calls", "you won't need to make or take calls", "this role does not involve phone calls (or sales)", "phone support isn't required" or "phone support is handled by another team" unless they also take calls ("You won't need to make calls. You will answer incoming calls."; "handled by our call center" or "by our sales team" counts as someone else), or the words name a voice account ("Voice account. No calls and no sales quotas" is phone); "no emails" for email. A "without" rule stays on its own line ("Can work without supervision" over a line "Handle inbound calls" keeps its calls). Never a rule: "no call center experience", "no voice account experience", "no phone or sales experience", "no phone sales", "no email marketing", "billing calls are handled by another team", "all calls are handled from home", "never call a customer by their first name", or a rule about when ("no calls on weekends", "after 8pm", "outside business hours"). How to apply, from its phrase on ("send your CV by email or call us", "Email your resume to …", "Please email your CV", "Submit your resume through email", "How to apply:", "interested applicants may send …", "apply via email", "for inquiries, email us at …", "walk-in applicants are welcome …", "shortlisted applicants will be contacted by phone", "DM us your CV on Messenger", and a sentence that is only how to reach the business to apply: "Text or call 0917 123 4567 to apply.", "Chat with us to apply."; the twelfth review; never a duty: "know when to apply discounts", "teach customers how to apply promo codes", "interested applicants should be comfortable handling inbound calls", "the first point of contact for inquiries, complaints and requests via phone, email and chat", "help customers apply online for our credit card", "customers who apply by phone", "help customers submit an application for financing"), and a "brand voice" or "on-call" say nothing about the channel. "Calls for patience" is no call, and "a company laptop and phone", "phones and accessories" or a phone a preposition points to is no phone work ("returns for their phones", "requests for call backs", "orders for replacement phones", "questions about smart phones", "make sure phones are shipped"); "answer calls for our clients", "handle a high volume of calls", "through phone", "inquiries from callers", "answer and respond to calls", "handle up to sixty calls a day", "take care of customers on calls", "calls are answered within 3 rings", "make sure every call is logged" (not calls someone else took that the agent follows up on: "Follow up on calls from the sales team"; the eleventh review; following up via, over or through calls is the agent's own, and so are missed calls and voicemails: "follow up via calls when needed", "Follow up on missed calls and voicemails from customers"; the twelfth; missed calls and voicemails only when a verb returns, checks or follows them up, never "no more missed calls or voicemails for our customers" or "Turn customer voicemails into tickets"; the thirteenth; or in a list of channels, "Respond to emails, chats and voicemails"; the fourteenth; only after a written channel in it, never leading it or as transcriptions: "Turn customer voicemails and emails into tickets in Zendesk" is email, "Voicemail and email transcripts are reviewed by our QA team" and "Handle customer emails, chats, and voicemail transcriptions" chat; the fifteenth; or one the agent handles or manages, at the head of a list too: "Handle voicemails and emails from customers", "Manage voicemails, emails and live chats" are a mix, "Handle voicemail transcriptions and customer emails" email; the sixteenth), a hotline the agent answers or works through ("Answer the customer hotline", "Man the hotline", "through our hotline and email", and "Hotline" in the title; the thirteenth: in the Philippines it is the usual word for the phone line; a title whose only phone word is its hotline yields to words that name only written channels, as a bare CSR does: "Hotline Officer / Reply to SMS and Viber messages from customers", "Hotline Representative / Respond to customer chats and emails", "Hotline Agent - Non-Voice / Handle customer concerns via email and chat" are chat, "Hotline Agent / Answer the customer hotline and reply to emails" a mix, a "Hotline Agent" with no channel in the words phone; the sixteenth; only by the agent's own written replies, never a written word that is a skill, a report, an update or a tool: "Proficient in MS Office and email", "Experience in chat support is a plus", "Prepare reports and email summaries to supervisors", "send updates to customers via SMS", "Document every interaction in Zendesk" leave a hotline the phone; the seventeenth; and only when every customer duty names a written channel: a duty that names none ("Answer customer inquiries", "Handle customer concerns") is the hotline's, so the reply is added beside the phone, "Hotline Agent / Answer customer inquiries and reply to emails", "Answer product inquiries and handle email escalations", "Handle customer inquiries; also reply to emails and Facebook messages" are a mix; a written reply is within its own part of a list, so "Answer customer inquiries, log tickets and escalate complaints" keeps the phone; and a qualification is no duty for any title, "Handle customer concerns. Must have experience replying to emails" is the phone, "Phone Support Agent / Answer inbound calls. Experience handling emails and chats is a plus" too; the eighteenth; but an untied duty keeps the phone only when it comes before the first written reply, so "Hotline Agent / Reply to customer emails and chats. Resolve customer complaints and escalate when needed" and "Respond to customer emails within 24 hours. Assist customers with refunds" are written; the reply is added beside the phone only when the words take no calls themselves, and messages taken, left or relayed for someone are no written reply, so "Answer calls and take messages for the doctors", "Answer calls and relay messages to the right department", "Handle calls and log messages in the CRM" and "Answer inquiries and take messages for the doctors" are the phone; and a qualification ends at "who", "you" or a colon, where the duty starts again, so "Customer Support (Phone) / We need someone experienced in handling high call volumes who will also reply to customer emails and chats" is a mix; the nineteenth; never a messaging line, "via our Viber hotline", "our SMS hotline", "through our WhatsApp hotline and email", which is written; the fourteenth; its name may take two words or "24/7": "Answer the customer care hotline and emails", "Answer the 24/7 hotline"; the fifteenth; or three, "Answer our 24/7 customer service hotline"; the sixteenth) and phone orders or inquiries a verb takes ("take phone orders", "answer phone inquiries") are, but not phone orders as a topic ("answer emails about phone orders"). Call-centre, BPO, phone or telephone experience, asked for or not ("at least 6 months BPO experience", "no call center experience required", "with or without call center experience", "1+ years of telephone customer service experience", "experience working in a contact center"), points to phone when the words name no written channel ("Reply to customer emails and chats. No call center experience required." is chat). A call or contact centre in the title's own parts is phone unless the title names a written channel ("Call Center Agent - Chat" is chat); "blended", "omnichannel" or "multichannel" is a mix in the title's role parts ("Blended CSR", "Customer Service Representative (Blended)", "Omnichannel Agent") and in the words unless it names a product or the business ("Blended", "a blended account", "an omnichannel environment" are; "blended coffees", "a multichannel e-commerce brand" and "a blended work setup", which is office and home, are not). Intercom is a chat tool ("via Intercom", "Intercom messages", and in a list with a written channel or a help-desk tool, email, chat, tickets, Zendesk, Freshdesk or Slack: "via email and Intercom", "Use Zendesk and Intercom", "Tools: Intercom, Zendesk"; the twelfth and thirteenth reviews); a door's or a building's intercom is not ("Answer phones and the intercom", "the building intercom"; the eleventh review; "intercom calls from the gate", "intercom buzzes"; the twelfth; beside the phones, "Answer phones and intercom", "Answer phones, intercom and greet guests"; the thirteenth). The messages a receptionist takes, leaves or relays are phone messages ("Answer phones, take messages and schedule appointments" is phone; the twelfth). Phone and a written channel is a mix; chat and email, chat; tickets, email. A bare "CSR", a receptionist or an operator with no channel in the words is phone (the Philippine meaning of CSR; any written channel in the words decides instead) |
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
   measured inside it (docs/TYPING-IN-CHAT.md), counted only for a remote job
   (an on-site job's chat may be done on a phone): remote by the brief's work
   mode: the Type field, the place, a title that says so in so many words
   (`isFullyRemoteText`: "Work From Home Chat Support Agent", "WFH CSR |
   Onsite training in Cebu"; never one that says on site too, "CSR (Onsite /
   WFH)", "CSR - Onsite (WFH after regularization)", "Onsite CSR | WFH after
   3 months", "CSR | Onsite & WFH", once on-site training, onboarding or
   orientation is taken out; the sixteenth read only a title that is home or
   on site either way, and the seventeenth found the others built and saved
   remote, so the fifteenth's test is back with only that training taken
   out; the eighteenth: the same class, on-site nesting, an interview,
   hiring, an exam or an assessment, and training or an interview that "is"
   or ": " on site, "WFH Customer Service Representative (Onsite Interview)",
   "WFH CSR - Onsite Nesting", "WFH CSR - Training is onsite", "WFH CSR |
   Training: Onsite", and in-office training, which the title test read
   whole, "WFH CSR - In-office training"; the nineteenth: training, an
   interview or nesting before on site with a plain space too, the word order
   Philippine posts use, "WFH CSR (Training Onsite)", "WFH CSR - Training
   onsite in Makati", "WFH CSR (Interview Onsite)"; "Onsite for the first
   month", "Onsite then WFH", "Onsite for 2 weeks training" and "Onsite
   equipment pickup" still say on site), or a line or sentence of What they do that is nothing but the setup
   ("Permanent work from home.", "This is a WFH role.", "Fully remote.", and
   as posts write it: a bullet, "- Permanent WFH", "• Work from home"; a
   label, "Work setup: Permanent WFH", "Setup: WFH", "Work Arrangement:
   Permanent Work From Home"; "This position is fully remote."; "WFH
   (Permanent)"; the sixteenth; after any mark, as posts pasted from Facebook
   or Jobstreet bullet them, "✅ Permanent WFH", "📌 Work setup: Permanent
   WFH", "👉 WFH", "> Permanent WFH", and a "Job Setup:" label, never after
   a mark that says no, "❌ WFH"; never beside a line that is only another
   setup, as a post hiring for two lists them, "We are hiring for two
   setups:\n- WFH\n- Onsite (Taguig)", "Work setup: Hybrid\n- WFH"; the
   seventeenth; or with a mark after it, "Permanent WFH 🏠", "Work From Home
   ✅", never one that says no, a colon or a question mark; and an on-site
   interview or training under its own heading, where a line ending in ":"
   starts a new one, is no second setup, "Work setup:\n- Permanent
   WFH\nInterview:\n- Onsite (Makati)"; the eighteenth; only a mark after it
   that says yes or names home, "WFH 💯", never "WFH 🔜", "WFH 👎" or
   "WFH... soon!" (the twentieth: any marks again, never a "no", a "not
   yet", a colon, a question or an ellipsis, since the eight marks left
   "Permanent WFH 💻", "‼️ PERMANENT WFH ‼️" and "WORK FROM HOME!!!" on
   site), and only an interview, training, nesting, hiring process,
   assessment, exam, onboarding or orientation heading, after a word or two
   at most ("Final interview:", "Paid training:", never "After training:";
   the twentieth: "Hiring for:" lists two setups; the twenty-first: the
   hiring's own setup, mode, venue, site, location or steps, and a
   recruitment, application or selection process, never a bare "Hiring
   now:"; and an on-site line takes the remote line's marks, so "‼️ ONSITE
   ‼️" beside "‼️ WFH ‼️" is a second setup; the twenty-second: a WFH line
   under such a heading is the hiring's too, so "Hiring setup:\n✅
   Onsite\n✅ WFH" lists two setups and builds on site; the words are
   any of hiring, recruitment, application or selection with any of
   process, setup, mode, venue, site, location or steps), keeps its on-site line
   from the setup: under any other, "Work setup:\n- Onsite (Makati)\nAfter
   regularization:\n- WFH", "Option 1:\n- Onsite (Makati)\nOption 2:\n- WFH"
   and a perk under a heading the perks reader does not know, "What we can
   offer:\n- HMO\n- WFH", were built and saved remote; the nineteenth), never negated, never a perk ("Benefits:\n-
   Work from home Fridays", with any mark as its bullet here,
   "Benefits:\n✅ HMO\n✅ WFH", or under "What's in it for you?" or "Why join
   us?"; the seventeenth) and never any other "WFH". The title and What
   they do decide only while the Type is the builder's default
   (`DEFAULT_JOB_TYPE`, "Full-time · On-site"): an on-site Type the business
   chose, "On-site", "On-site only", "Office-based", "Not remote",
   "Full-time · On-site (Makati)", "Full-time · In person", decides over them
   (the seventeenth review: such a Type left "CSR - Onsite (WFH after
   regularization)" remote, so the field could not undo the guess), read
   whole with only on-site training taken out, as a title is (the
   eighteenth: the on-site word was taken out first, so "Full-time · Onsite
   (WFH after regularization)" and "Full-time · On-site, WFH not available"
   were remote; "Full-time · WFH (onsite training)" is remote, "Full-time ·
   Onsite then WFH" on site, as the title rule reads it); a Type partly at
   home is hybrid, by the place's own rule (the nineteenth: "Full-time ·
   Remote (occasional onsite)", "Full-time · WFH or Onsite" and "Full-time ·
   On-site / Remote" were the business's on-site choice, over the title;
   "Full-time · Remote (On-site 1x/month)" and "Remote, onsite as needed"
   are still on site, as the place reads them). The field is free
   text, so the builder marks a Type the business types (`typeChosen`,
   `AvaCreateJob.tsx`); but the default's own tail, "· On-site" after any
   employment wording that names no place and no in-person word
   ("Part-time · On-site", "Contract · On-site", "Regular · On-site",
   "Full-time / Part-time · On-site", "Full-time · Night shift · On-site",
   "PRN · On-site", the default retyped), is still the default's place, typed
   or not (the eighteenth: a business that changed "Full-time" to
   "Part-time" had chosen the employment word, not the place, and "Work From
   Home Chat Support Agent" was built and saved on site, a US one paid in
   USD; the nineteenth: any employment wording, not a closed list of words;
   "Full-time · Onsite", "Full-time, On-site" and "Full-time - On-site" are
   typed, and decide); the voice brief's
   Type is its default too, since it reads a local role as on-site unless
   told otherwise; a Type that names no place ("Full-time") leaves it to the
   title and the words; and a remote or hybrid place still decides first.
   The thirteenth review read What they do in the note only; the fourteenth
   found the AI plan's post rewords it, and Publish reads the post, so the
   two disagreed, and read What they do by Publish's own rule; the fifteenth
   found that rule took any "WFH" not directly negated ("Work setup: Onsite.
   Possible WFH after regularization", "WFH is not available for this role",
   "WFH: No", "Must have WFH experience"), so on-site jobs were built and
   saved remote with no currency. A sentence that says more than the setup
   is not read ("WFH with own equipment.", "WFH setup, night shift",
   "Training is onsite, then permanent WFH."): the Type field decides those,
   as it now does any guess from the title or the words.
   Publish saves `is_remote` as that work mode and nothing else, on both
   plans (`jobFromFlow.ts`; the fifteenth review's flag): the post's words
   never decide it, so a "Remote" place is saved remote whatever its post
   says, and an on-site brief is saved on site. (The sixteenth review: the
   fifteenth's version also read the post where the place or Type said
   remote, which never decided anything, since `briefFromForm` makes every
   such brief remote or hybrid; it is gone, and `remote_from_location.test.mjs`
   holds why.) The note states the rule, never that this one's typing is
   not counted;
5. the written interview. A phone or mixed job's interview starts with the
   two questions about calls (`PHONE_INTERVIEW_QUESTIONS`), each unless one of
   the model's questions already asks the same thing about a call: in one
   sentence, or a sentence with the one before it, unless either names a
   written channel: a call set up first and a question about that caller
   ("You're on the phone with a customer. How do you handle it if they start
   yelling?", "You're taking calls all day. How do you handle an angry
   customer?"; a caller who asks for a manager or demands a supervisor is
   still that caller, and a customer who is the sentence's subject is the
   caller whatever else it names: "A customer says the training video you
   sent was useless and gets angry"; never a coworker, a manager, a project
   or a training the sentence is about: "How do you handle an angry
   coworker?", "Your manager is angry with you."; never a question after
   another question, "How many calls a day did you handle? How would you
   handle a rude customer?", nor someone in person, "…an angry customer in
   our store?"), or a statement after it ("A patient is shouting. They are on
   the phone."),
   never an upset line and then a question about something else; "Mr." and "Dr." end no sentence. An
   angry caller is angry, upset, furious, irate, rude, abusive, frustrated,
   aggressive, a difficult caller, shouting, yelling, screaming, swearing or
   talking over you (the twelfth review added frustrated, aggressive and
   difficult; frustrated or aggressive only of the other person, "a
   frustrated caller", "a caller who becomes aggressive", never the agent's
   own, "How do you keep from getting frustrated on busy call days?", "the
   frustration of back-to-back calls"; the thirteenth; the other person's
   frustration as a noun, a frustrating call, a caller being aggressive or
   getting more and more frustrated, and de-escalating frustration on a call
   count too: "How do you handle frustrating calls?", "a caller's frustration
   on the phone", "customer frustration over the phone"; the fourteenth; a
   frustrating call only, never "frustrating" as a verb, "How do you keep
   calls short without frustrating customers?", and de-escalating
   frustration or theirs, never the frustration the agent feels, "How do you
   de-escalate the frustration you feel after a long call?"; the fifteenth;
   frustrating callers, and the frustration of a caller, count too: "How do
   you handle frustrating callers?", "How would you de-escalate the
   frustration of a caller who has been on hold for an hour?"; "frustrating
   customers" still does not, since it is the verb as often as not; the
   sixteenth; nor "frustrating callers" after without, avoid, never or not,
   the verb again: "How do you keep calls short without frustrating
   callers?"; the seventeenth); on
   hold is a person on hold ("put patients on hold"), or on a
   call; passing the call on counts too, and so does escalating it ("How
   would you escalate a call to your supervisor?"). "Transferable skills", "hold yourself accountable", "notes on hold
   times", a project, a ticket or a feeling on hold, and an upset customer by
   chat or email are not that. It
   always keeps at least one of the model's own, until the practice call
   exists (docs/LAUNCH-PLAN.md, "Later"); an interview the model left empty
   gets the customer-service bank's questions.

The chat step also keeps the channel the business chose (`config.channel`),
which the interview guide reads.

The plan's notes to the business say only what this job gets (the fifth
product review, a US dental office hiring on site): the chat practice's says
typing speed is measured only for a remote job (the brief's work mode,
which Publish saves as `is_remote` on both plans and nothing else: the post's
words never make an on-site job remote, the fifteenth review; nor a remote
one on site, the sixteenth), and otherwise states the rule, that it counts only for a
remote job since an on-site job's chat may be done on a phone, never that
this one's is not counted (the fourteenth review); the skills check's names
second-language readers only
for a remote job or a place outside the English-first countries (US, UK,
Canada, Australia, New Zealand, Ireland), and otherwise says "in plain
words, with time to read each one"; a phone or mixed job's says the written
interview asks how they handle calls, when the plan has one, and promises no
practice call.

`generate-flow` is told the pack and channel (read against its own
allow-list) so the post, the application and the interview are written for
that industry, in plain English for any country, with the pack's word for
the other person. `ai-generate-job-content` has the same rule.

## Where the job is

`src/lib/jobLocation.ts` reads the place the business typed (and the Type
field): remote, hybrid or on site (`placeSaysRemote`, `placeSaysHybrid`,
used by `briefFromForm`), and the country (`inferCountryCode`, for the
feeds and the currency when the geocoder misses).

- A negated on-site, office or hybrid word says remote: "Remote (no
  onsite)", "Remote; not on-site", "Remote — never on-site", "Fully remote -
  non-office based", "Remote (100%, no hybrid)", and so does the next word
  in a list after it: "Remote (no hybrid or onsite)", "Remote, never onsite
  or hybrid" (a comma ends it: "No hybrid, onsite only" is on site; the
  thirteenth Phase 4 review), whichever word the list starts with: "Onsite
  (no remote or hybrid)", "No WFH or hybrid. Onsite in Taguig" are on site
  (the fourteenth). In the description, "work from home", "WFH" or "fully
  remote" is remote only when it is not negated ("Onsite only, no WFH", "This
  is not a work from home job"; the fourteenth). "Online" and "Philippines
  (online)" are remote, and so is anywhere in a country ("Anywhere in the
  Philippines"), never anywhere in a city or a region ("Anywhere in Metro
  Manila"). A place partly at home is hybrid: "Remote with occasional
  onsite", "WFH or Onsite (Makati)" (the fifth product review and the
  twelfth Phase 4 review).
- Words about the clients or the hours never pick the country: "Makati
  (US-based clients)", "Cebu - US healthcare account", "Quezon City (US
  Mortgage Account)", "Iloilo (US healthcare)", "Makati (US-based healthcare
  account)", "Ortigas (US-based mortgage company)", "BGC Taguig - US-based
  tech startup", "Makati (US-based BPO)", "Cebu City - US-based call
  center", "Quezon City (US-based agency)" are the Philippines, and "Remote,
  US office hours" names none. "-based" before any word but a person's is
  the client's (the fourteenth Phase 4 review's list of kinds, account,
  client, company, brand, business, startup and the industries, missed every
  other kind of business: BPO, firm, agency, call center, clinic, SaaS; the
  fifteenth); without it, what kind of account, client or customer, the
  hours, the market or an industry, and a company, brand, business or
  startup only after "-based": "Remote (US company)", "Remote - US brand" and
  "Remote (UK company)" name the country (the fourteenth had made them none;
  the fifteenth). Where the people are is not a client: "Remote (US-based
  applicants only)", "Remote — US-based team", "Remote (Canada-based
  employees only)", "Remote (US-based agents)", "Remote (US-based
  preferred)" name the country (a closed list: applicants, candidates,
  employees, a team, staff, workers, people, talent, hires, residents,
  citizens, professionals, agents, freelancers, contractors, individuals,
  persons, and "only", "preferred" or "remote"; the thirteenth and the
  fifteenth). The sixteenth review: each of those fifteenth rules fixed one
  side and broke the other ("Remote (US-based position)", "Remote (UK-based
  role)", "Remote (US-based reps)" named no country, so the job was in no
  feed; "Cebu City (US company)" was saved as a US job paid in dollars). So
  "-based" before a word, and a company, brand, business or startup, are the
  client's only when the rest still names a place: "Makati (US-based BPO)"
  and "Cebu City (US company)" are the Philippines, "Remote (US-based
  position)" and "Remote (US company)" the US; the kinds of account, client
  or customer, the hours, the market and the industries are always the
  client's. The seventeenth review: "still names a place" meant a place the
  hints know, so a real city they do not ("Mandaluyong (US-based BPO)",
  "Pasay City - US-based call center", "Lapu-Lapu City (US-based BPO)")
  took the client's country back from the whole text, and Publish saved a
  Philippine job paid in dollars. Now a client's country is never the job's:
  whatever is left once the client's words go is the place, known to the
  hints or not ("Mandaluyong" has no country, so no currency is guessed),
  and the whole text is read only when nothing but the setup is left;
  "-based" before a business (a BPO, company, firm, agency, startup, brand,
  call centre, clinic, practice, office or store, the fourteenth's and
  fifteenth's evidence) is the client's whatever is left, as the fifteenth
  had it, so "Remote - US-based BPO" and "Work from home (US-based
  company)" name no country; any other word after "-based" is still the
  sixteenth's, the client's only when a place is left, taken with the words
  after it ("Remote (US-based staffers)", "Remote (US-based moms welcome)",
  "Remote - US-based support role" are the US), and so is a bare company:
  "Remote (US company)" is the US, "Las Pinas (US company)" none. The
  eighteenth review: only what comes before the first of those client words
  can be the place, so a note after them is none ("Remote (US company) -
  Full-time", "Remote (US-based position) - Night shift", "Remote (UK-based
  role) - GMT hours" keep their country; "US company - remote, Latin
  America" is the US); and a bare business is any kind "-based" takes, so
  "Makati (US BPO)", "Taguig (US call center)", "Quezon City (US agency)"
  and "Pasig (UK firm)" are the Philippines, paid in PHP, and "Remote (US
  BPO)" the US. The nineteenth review: a country or a city named once the
  client's words are gone is the job's own, wherever it stands, and the
  eighteenth's rule is only for a note that names none, so "US company -
  Makati", "Remote (US company), Makati" and "US company · Makati · Hybrid"
  are the Philippines, paid in PHP, and "Remote (US company) - India",
  "Remote (UK company) - India" and "US startup | Remote | India" are India
  (they were the client's country). "US company - Mandaluyong", a city the
  hints do not know after the client's words, is still the US: Publish's
  city reader asks the same of "(US company) - Full-time", and nothing tells
  the two notes apart. "U.S." is the US with
  its dots ("Remote - U.S. only"; the fourteenth). "PH", BGC and Ortigas are
  the Philippines ("Remote, PH", "BGC (U.S. client)").

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
- Remote work is read from What they do only by a line that is nothing but
  the setup, and from the title only in so many words ("Work From Home",
  "WFH", "Fully Remote"), never a title that says on site too. A sentence
  that says more ("WFH with own equipment.", "Training is onsite, then
  permanent WFH.", "Remote (US only)." in the words), a bare "Remote" title
  ("Remote Customer Service Representative") and a title on site for a
  while first ("Customer Service - Onsite 2 weeks then Permanent WFH") are
  the Type field's to say, which starts on On-site (the sixteenth and
  seventeenth reviews' cases; every version so far reads them so, or read
  on-site jobs remote). The Type decides either way: "Remote" makes a job
  remote, and an on-site Type the business typed keeps any title or words on
  site (the seventeenth).
- "-based" before a business is the client's, so "Remote (US-based
  startup)" names no country, as "Work from home (US-based company)" does,
  and a place the hints do not know ("Toronto, ON", "London") names none
  either: no currency is guessed, so only the pay's own sign ("₱25,000",
  "$15/hr") gives one (the seventeenth review).
- The classic job editor (`src/pages/CreateJob.tsx`) writes its own questions
  with `ai-generate-workflow` and uses a pack only in its built-in fallback;
  the Ava job builder is the customer-service path.
