/**
 * No age, birth date or marital status in what the job writers produce
 * (2026-10-25; the second to eighteenth Phase 6 reviews).
 *
 * Every application already starts with HireFlow's own "Are you 18 or
 * older?" (src/lib/ageCheck.ts), and RA 10911 Section 5(a) makes it unlawful
 * to "require the declaration of age or birth date during the application
 * process" or to publish a job notice suggesting an age preference. The
 * models are told so (AGE_RULE), and anything they still write that asks the
 * applicant for their age, birth date, graduation year, marital status or
 * family plans, or that sets an age limit or preference, is dropped before a
 * business sees it: an item from a list, a sentence from a paragraph.
 *
 * Read one sentence at a time, with numbers written as words read as digits
 * ("at least eighteen years old"), in two kinds:
 *   - always the applicant's: a form label ("Age", "Date of birth (MM/DD)",
 *     "Dependents", "Sex, age, civil status", "Date of Birth: ____"), a
 *     question to them ("How old are you?", "Are you under 30?", "Which age
 *     group are you in?", "Do you plan to have children?", "Are you a
 *     parent?", "Are you currently pregnant?", "Who takes care of your
 *     children during your shift?"), "fresh graduates only", "preferably
 *     fresh graduates" or "must be a fresh graduate", a young team or young
 *     agents wanted, a generation preferred, "single applicants preferred",
 *     "no children";
 *   - an age ("21-35 years old", "aged 21-30", "at least 21 years of age",
 *     "must be over 21", "over the age of 21", "ages 18-30", "21+ only",
 *     "in their 20s", "born after 1995", "of legal age", "age limit", "name,
 *     age and location"): the applicant's unless the person it is attached
 *     to, the last one named before it or the one right after it, is
 *     someone else ("patients aged 65 and older", "Are you comfortable
 *     helping patients aged 65 and older?", "a 70-year-old caller",
 *     "70-year-old patients", "check that the customer is of legal age",
 *     "people aged 65 and over", "loan applicants must be 21 or older",
 *     "take each caller's name, age and reason for the visit"), the business
 *     ("a 10 years old company", "our clinic is 25 years old"), or a product
 *     ("the minimum age for a kid's savings account", "our youth plan for
 *     ages 18 to 25", "our over-50s insurance line"). Whoever is named, an
 *     age that is "preferred" or "welcome to apply" is a preference
 *     ("Students aged 18-22 preferred"; the seventh review).
 *     The sixth review: a 40-character window decided whether the applicant
 *     was named in between, so the same idea passed or failed by phrasing.
 *     The seventh: this comment said older customers, product age limits
 *     and a company's age were kept, and for common wordings they were not.
 * A time, a score, a speed, a distance or a number of hours is never an age
 * ("must be under 10 minutes", "must be 30 km or less", "QA score must be 90
 * or higher", "CSAT should be 90 and above", "at least 18 months in your
 * current role", "24/7", "tickets aged 72 hours", "claims aged 30-60 days"),
 * and a number near "applicants" is not one either unless an age word goes
 * with it ("Applicants must type 40-50 WPM", "Candidates must work 12-hour
 * shifts").
 *
 * What an agent asks or tells a customer is the customer's (the eighth
 * review: a medical front desk's identity check was dropped). Speech put to
 * a caller ('Greet the caller and ask, "May I have your date of birth?"',
 * "Say: For security, please confirm your date of birth."), what the agent
 * explains ("Explain that Medicare starts at age 65", "Explain to the caller
 * that you must be 21 or older to rent a car"), a benefit's or a rental's
 * age said to "you" ("You can enroll in Medicare at age 65", "To rent a
 * car, you must be 21 or older"; the ninth), a customer's dependents or
 * filing status ("Ask the client if they are filing single or married"),
 * and since the eleventh a quote to a named caller inside a script's line
 * ('Say: Thanks for calling. Then ask the caller, "Are you 65 or older?"')
 * and a benefit named before a comma ("For Medicare, you're eligible at age
 * 65") stay, and since the twelfth a front desk's line that also names HR, a
 * recruiter, a phone's screen or a plan ("…your date of birth? If they ask
 * about jobs, transfer them to HR", "Thank you for calling PayEasy HR
 * support", "your interest in joining our clinic as a new patient") and what
 * a tax desk explains ("Your refund depends on your filing status and the
 * number of dependents you claim"), and since the thirteenth a customer's
 * intake inside a practice case that names her ("A caller asks why her
 * refund went down. Complete her intake:\n- Filing status and number of
 * dependents:") and an HR desk's own callback ("this is Ana from HR
 * returning your call"), and since the fourteenth that intake when the case
 * names her by name ("Maria Santos asks why her refund went down"), a
 * caller who is a loan, scholarship or visa applicant, and a practice case's
 * note that "the candidate must not share results", and since the fifteenth
 * a customer named only inside the quote ('Ask: "Are you a Medicare member?
 * Are you 65 or older?"', 'Reply: "Players under 18 need a parent's consent.
 * How old are you?"'), a desk's check of a customer's own filing status,
 * discount, premium, fare or ranked play, and an HR desk's caller who applied
 * for leave or asks about their job title, and since the sixteenth a quote
 * after a sentence naming the practice case's customer ('A caller wants to
 * rent a car. Say: "…"'), those topics in their ordinary wordings ("your
 * senior citizen discount", "your youth fare", "you can rent the car"), a
 * desk's "How many members do you have on your plan?", its greeting by name
 * ("Thanks for contacting customer support!"), a study's clinical recruiter
 * and the agent who must "state it back to the caller", and since the
 * seventeenth a customer's own first-person age in the message the agent
 * answers ('Reply to this chat: "I'm 70 years old and can't log in to my
 * account."') and a customer's profile, record or own line with a placeholder
 * ("Patient profile: [Name], [Age]"), and since the eighteenth that age in
 * any message replied to ('Reply to this chat: "I'm 64 years old and want to
 * know when my Medicare plan starts."'), a warm transfer's intro of the caller
 * ("Give the nurse a brief intro: [Name], [Age]…"), a caller's opening line
 * under any label ("The caller opens with: …"), the case's customer after
 * "Next," or a list's mark or in a practice set up as "Candidates practice
 * this call", a desk's headcount ("How many guests do you have in your
 * party?"), 'Before a customer orders wine, ask:', a customer's own HMO plan
 * and a game's role. The same words put to
 * the applicant go ('Ask the candidate: "How old are you?"', "Number of
 * dependents:", 'Ask:
 * "Are you married? Just for our records."', and since the tenth an unquoted
 * "Ask: How old are you? Let me confirm your schedule.": after a script's
 * colon only a plain identity check is a customer's; since the eleventh a
 * date of birth asked "for your file" after "Thanks for applying!" or in a
 * recruiter's, HR's or a phone screen's script, and "Number of dependents in
 * your household:"; since the twelfth "Filing status and number of
 * dependents:" on its own; since the thirteenth a recruiter's or HR's own
 * introduction ("I'm Ana, a recruiter at Bright Clinic", "Welcome to your
 * phone screen") and "Does the number of children in your household affect
 * your availability?"; since the fourteenth an HR hold or callback about a
 * job wherever the job is named, and a quote whose only customer is the
 * job's title or the applicant's experience ("Thanks for applying for the
 * Customer Service Representative role. Are you married?"); since the
 * fifteenth a label naming "their" plan on an employer's form ("Household
 * size and number of dependents (for their HMO coverage):"), "the candidate
 * must provide it" after an identity ask, and a clinical recruiter's own
 * call; since the sixteenth a self-introduction template's blank or
 * placeholder ("My name is ___, ___ years old", "[Age]", "[Civil Status]"),
 * a first-person sample introduction, HR describing the business ("where we
 * care for patients") and an interview's own questions ("Why do you want to
 * work with customers?") whatever customer they name, a job whose title
 * starts with "Loan" or "Leave" on an HR hold, and a hire's own pay or
 * payroll ("your filing status for payroll"); since the seventeenth an
 * interview's, a screening call's or a video's question after a sentence that
 * mentions a customer ('In up to 75 seconds, describe how you would welcome a
 * customer. Then answer: "What is your age and civil status?"'), a hiring
 * team greeting by its service's name before it talks of the job, "How many
 * customers did you…" whatever the verb, and a hire's HMO premium or BIR
 * filing; since the eighteenth "Send your profile: [Name], [Age]…",
 * "Candidate profile:", a BPO agent's "my previous account was a US telco", a
 * self-introduction replied to the recruiter's message, and "Why do you want
 * to help customers?"), and so does an
 * age in a hiring sentence however it is attached ("We want a 25-year-old
 * go-getter", "We hire students aged 18-24", "Retirees aged 55-70 wanted",
 * "Hiring 21-35 year old Patient Access Representatives"; the tenth; "With full benefits, we're
 * looking for students up to age 25"; the twelfth), and a range of ages
 * wherever it is ("Remind them you must be 21-35 years old to apply"; the
 * ninth) unless a product is for it ("you must be 18-25 to get the youth
 * rate"; the tenth). A customer's own wish is never a hire ("A 70-year-old
 * caller says a phone call is preferred", "A worried mother is looking for
 * her 15-year-old son's missing order"; the eleventh; "A 70-year-old caller,
 * Tagalog preferred, asks…"; the twelfth), and a hire's own clause is never
 * a wish ("Students aged 18-22, if they can do nights, preferred"; the
 * twelfth), nor the customers a hire serves ("We need students aged 18-24
 * to help customers, bilingual preferred"; the thirteenth), nor its team
 * ("21-30 y/o team players, bilingual preferred"; the fourteenth).
 *
 * marksAgeOrFamily is the same rule for what a reviewer writes ABOUT an
 * applicant (the written interview's grader, the interview guide): "a mother
 * of three", "seems too young", "her children", "at 45, she may struggle",
 * "just had a baby", "recently married", "close to retirement age", and
 * since the eighth review "she's 45", "the applicant, 45, may tire",
 * "divorced, so flexible", "has five kids", "wants to start a family", and
 * since the ninth "a single parent", "a solo parent", "seems young for a
 * lead role", "just got married". A
 * remark about a person in a practice case ("the single mom's billing
 * case", "the pregnant woman on the line", since the tenth "was kind to a
 * single parent whose card was declined", and since the eleventh "got a
 * 65-year-old member the plan she wanted") or about the work ("too
 * old-fashioned for chat", "single-handedly covering two queues", "mature
 * and calm under pressure", "old-school in his replies") stays.
 *
 * Import-free on purpose, so scripts/age_wording.test.mjs runs it under plain
 * Node as shipped.
 */

/** The sentence each job writer's instructions carry. */
export const AGE_RULE =
  "Never ask applicants their age, date of birth, birth year, graduation year, marital status or family plans, and never write an age preference or limit (an age range, 'below 30', 'young', 'fresh graduates only') in the post, its requirements or its questions: every application already asks 'Are you 18 or older?' on its own.";

/**
 * The sentence the functions that judge an applicant carry (the eighth review): trigger-ava-analysis and ai-analyze (Ava's
 * score, verdict and decline reason) and ai-shortlist read résumés, and Philippine résumés often list age, birth date and
 * civil status. trigger-ava-analysis and ai-analyze write it out word for word in their prompt text, and
 * scripts/age_wording.test.mjs checks that all three carry it.
 */
export const APPLICANT_AGE_RULE =
  "Never mention an applicant's age, birth date, the year they were born or graduated, marital or civil status, children, pregnancy or family plans, even when their resume, profile or answers list them: they count neither for nor against, and never appear in a score, strength, concern, reason or summary. (RA 10911 and fair hiring; the application already asks only whether they are 18 or older.)";

const re = (parts: string[], flags = "i") => new RegExp(parts.join("|"), flags);

// After a number: a unit, a score or a time, so not an age ("under 30 minutes", "24/7", "90% accuracy"). After a range or a
// "+" only a real measure ("claims aged 30-60 days" in the eighth review, "accounts aged 90+ days" in the ninth): the ninth
// found "aged 21-35 in Cebu", "21-30 on hire date" and "aged 21-35: apply now" read as a range of times.
const MEASURE = String.raw`%|percent|minutes?|mins?|seconds?|secs?|hours?|hrs?|days?|weeks?|months?|words?|wpm|km|kms|kilometers?|kilometres?|miles?|mbps|gb|mb|points?|calls|chats|tickets|replies|emails|messages|cases|orders|sales|leads|qa\b|csat|nps`;
const UNITS = String.raw`(?!\s*((\+|(-|–|to|or|and)\s*\d+)\s*(?=(${MEASURE})))?(${MEASURE}|per\b|or (higher|more|better)|on\b|in\b|am\b|pm\b|:|\/|x\s*\d|[.,]\d))`;
// An adult age as an ad writes one, for the wordings that also fit years of
// experience ("Ideally 22-30 years" but never "10-15 years of service").
const AGE = String.raw`(1[5-9]|[2-6]\d)`;
const YEAR = String.raw`(19[3-9]\d|20[0-3]\d)`;

// A form label in a list of labels: "Sex, age, civil status", "Name / Age / Address", "Full name, date of birth and address".
const LABEL = String.raw`((full|first|last|middle|complete)\s+)?name|age|sex|gender|civil status|marital status|status|((home|current|permanent)\s+)?address|location|city|nationality|citizenship|religion|height|weight|((contact|phone|mobile|cell(phone)?)(\s+(number|no\.?))?)|email(\s+address)?|date of birth|birth ?date|birthday|place of birth|dob|d\.o\.b\.?|educational attainment|education`;

// Whose own line a self-introduction template can be (the self-introduction entry below).
const LINE_OWNERS = String.raw`customers?|callers?|patients?|members?|guests?|players?|clients?|users?|account holders?|policyholders?|passengers?|tenants?`;

// About the applicant, whatever else the sentence says.
const ALWAYS = re([
  // A form label on its own line, with an optional "(MM/DD/YYYY)" or "(optional)", a "*" or a "____" to fill in (the seventh review),
  // or "- optional"; "Age as of last birthday", "Spouse name" and "Name of husband/wife" too (the eighth). Never a bare "Birth
  // certificate" (a list of what a caller brings to a passport office).
  String.raw`^\s*[-•*]?\s*(your\s+|(the\s+)?(applicant|candidate)'?s\s+)?(age|current age|age as of (your )?(last birthday|today)|date of birth|birth ?date|birthday|birth year|dob|d\.o\.b\.?|year of birth|year born|place and date of birth|date and place of birth|marital status|civil status|relationship status|edad|kaarawan|petsa ng kapanganakan|age range|age group|age bracket|dependents|number of (dependents|children|kids)|no\.? of (dependents|children|kids)|children|kids|generation|graduation year|year graduated|spouse|(spouse|husband|wife)('?s)? (name|occupation|job|work|employer|income)|name of (your\s+)?(spouse|husband|wife)(\s*\/\s*(spouse|husband|wife))?|maiden name)\s*(\([^)]*\)|\s[-–—]\s*(optional|required|mandatory|if any))?\s*[:?]?\s*\*?\s*[_.…]*\s*$`,
  // "Sex: ___ Age: ___", "Age is required." (the eighth review); never a patient's "Patient date of birth: ____" (the ninth),
  // but "Applicant age: ____" and "Employee date of birth: ____" are the hire's (the tenth).
  String.raw`(^|[_…]\s*)\s*[-•*]?\s*((your|applicant|candidate|employee)('?s)?\s+)?(age|edad|date of birth|birth ?date|birthday|dob|d\.o\.b\.?|civil status|marital status)\s*:\s*[_…]{2,}|^\s*[-•*]?\s*(your\s+)?(age|date of birth|birth ?date|birthday|dob|d\.o\.b\.?|civil status|marital status)\s+(is\s+)?(required|optional|mandatory|a must)\s*[.!]?\s*$`,
  String.raw`^\s*[-•*]?\s*(?=[^?!]*\b(age|civil status|marital status|date of birth|birth ?date|birthday|dob|d\.o\.b)\b)(${LABEL})(\s*(,|\/|&|\+|\band\b)\s*(${LABEL}))+\s*(\([^)]*\))?\s*[:?]?\s*\*?\s*[_.…]*\s*$`,
  String.raw`^\s*[-•*]?\s*(marital|civil|relationship) status\s*(\([^)]*\))?\s*:`,
  String.raw`^\s*[-•*]?\s*status\s*:\s*(single|married|widowed|separated)\b`,
  String.raw`^\s*[-•*]?\s*(age|edad)\s*(range|group|bracket)?\s*:`,
  // "Date of Birth: ____" is a blank to fill; "Date of birth: 04/12/1961" is a customer's record.
  String.raw`^\s*[-•*]?\s*(date of birth|birth ?date|birthday|dob|d\.o\.b\.?|year of birth|birth year)\s*\*?\s*:\s*([_.…\s]*$|\(?\s*(mm|dd|yyyy|month|day|year)\b)`,
  String.raw`\b(birth year|year of birth|year born)\s*:?\s*${YEAR}\s*(or|and)\s+(later|after|newer|earlier|before|above|below|up|onwards?)\b`,
  // "Married? Y/N", "Any children?", and "Married or not?", "How many kids?" (the eighth review).
  String.raw`^\s*[-•*]?\s*(married|single|pregnant|separated|divorced|widowed|with (kids|children)|any (kids|children|dependents)|have (kids|children)|married or not|how many (kids|children|dependents))\s*\?\s*(\(?\s*y(es)?\s*\/\s*n(o)?\s*\)?)?\s*[.:]?\s*$`,
  String.raw`\bedad\b`,
  // A self-introduction template that asks an age or a civil status through a blank or a placeholder ("My name is [Name], I
  // am [Age] years old", "Good day! My name is ___, ___ years old, from ___", "Your profile: [Name], [Age], [Civil Status]",
  // "I'm ___ (age ___)", "my age is ___"; the sixteenth review: only a form label's blank was read, and this is the usual
  // Philippine BPO introduction). Only where the sentence introduces its writer (in the first person, "yourself", a bio or a
  // profile): a customer's note stays ("Patient intake note: [Name], [Age], reason for visit", "I spoke with [Name], [Age],
  // about her bill", "Maria, 70 years old", "the caller's name and [DOB]"). The seventeenth review: "my", "profile", "bio" and
  // "introduce" anywhere also read a customer's record ("Patient profile: [Name], [Age]", "Player profile: …", "your profile
  // shows you are [Age]", "My caller: [Name], [Age]", "Introduce yourself, then note the caller's name, [Age]…"), and a
  // customer's own line gives her name and age too ("Customer: My name is [Name], I'm [Age] years old, and…"), so only the
  // writer introducing themself counts, as in every case the sixteenth round read: "I am", "I'm" or "my name", a
  // self-introduction, a bio or an intro of their own ("Write a short bio:"), "Your profile:" as the label, or "introduce
  // yourself" or "about yourself" before the template ("Introduce yourself in this format:"), never in a customer's line; and
  // "my age is ___" or "my civil status: ___", never "my date of birth is [DOB]", which a caller says to be checked.
  // The eighteenth review: the seventeenth round's "a", "short", "brief" and "quick" intro read a warm transfer's intro of
  // the caller ("Give the nurse a brief intro: [Name], [Age], [Reason for call]", "Hand the chat to Tier 2 with a short
  // intro: …"), so an intro or bio is the writer's own only as "your", "my" or a video intro, or one they record, film,
  // write, post, upload or send ("Write a short bio:", "Record a short intro:"), never of someone else ("Send a brief intro
  // of the caller to the nurse: …"); its "Your profile:" read only at the start of the line, so "Send your profile:",
  // "Reply with your profile:", "Candidate profile:" and "Applicant bio:" passed, and "Introduce yourself (name, [Age],
  // city)" did too. Its customer's line read a customer word before any colon, so the label naming whom the writer
  // introduces themself to ("Introduce yourself to customers: My name is …", "Record an intro for our customers: …")
  // passed: a customer's line is one whose label is the customer ("Customer:", "Caller (role-play):", "Customer —", after a
  // short label of its own), or names her line, first message, opener or persona ("The member's first message:", "Sample
  // caller opener:", "Caller persona:"), or has her say or open with it ("The caller opens with: …").
  String.raw`^(?!\s*[-•*]?\s*([\w'’-]+(\s+[\w'’-]+)?\s*[:—–]\s*)?((the|a|an)\s+)?(${LINE_OWNERS})(['’]s?)?\s*(\([^)]*\)\s*)?[:—–]|.*\b(${LINE_OWNERS})(['’]s?)?(\s+(first|opening|own))?\s+(lines?|messages?|repl(y|ies)|scripts?|parts?|openers?|opening|persona)\s*[:,]|.*\b(${LINE_OWNERS})(['’]s?)?\s+(says|said|writes|wrote|asks|asked|replies|replied|opens|opened|begins|began)\b)(?:(?=.*\b(your|my|(candidate|applicant)(['’]?s)?)\s+(profile|bio|intro|introduction)\s*:|.*(\b(i am|i['’]m|my name)\b|\bself[\s-]?intro\w*|\b(your|my|video)\s+(bio|intro|introduction)\b|\b(record|film|write|post|upload|send)\s+((a|an|your)\s+)?((short|brief|quick|video)\s+)?(bio|intro|introduction)\b(?!\s+of\s+(the|this|that|a|an|each|every|our|your|her|his|their)\b)|\b(introduce|describe|about)\s+(yourself|myself)\s*(:|\(|,?\s*(in this (format|way)|using|with|like this|as follows)\b))).*((_{2,}|…|\[[^\]\n]{0,20}\]|\{[^}\n]{0,20}\})\s*(years?|yrs?)[\s-]*old\b|\[\s*(your\s+)?(age|edad|civil status|marital status)\s*\]|\{\s*(your\s+)?(age|civil status|marital status)\s*\}|\(\s*(age|civil status|marital status)\s*:?\s*(_{2,}|…)\s*\))|.*\bmy\s+(age|civil status|marital status)\s*(is|:)\s*(_{2,}|…|\[|\{))`,
  // A question to the applicant, or a request to tell.
  String.raw`\bhow old (are you|are u|r u|will you be|you are|you'?ll be)\b`,
  // "Your birthday" is asked for only in a question ("What's your birthday?"); "We celebrate your birthday"
  // and "Your birthday is a paid holiday" are benefits (the sixth and seventh reviews). The eighth: "What's your DOB?" goes;
  // "Walk the customer through your age verification process" is the business's own check.
  String.raw`\byour\s+((current|exact|present|actual)\s+)?(age\b(?!\s+(verification|verify|check|checks|checking|gate|polic(y|ies)|rules?|ratings?|restrictions?|requirements?|limits?)\b)|date of birth|birth ?date|birth year|year of birth|dob|d\.o\.b|marital status|civil status|relationship status)\b|\b(what|when)('?s|\s+is|\s+was)\s+your birthday\b`,
  // "Which age range your family plan covers" is the plan's, not the applicant's.
  String.raw`\byour\s+((own|exact|current)\s+)?age (range|group|bracket)\b|\bage (range|group|bracket)\b[^.?!]{0,30}\b(are you|you are|you're|do you|you belong|you fall|you fit)\b|^\s*[-•*]?\s*(please\s+)?(select|choose|pick)\s+(your\s+)?age\b`,
  // "Please put your birthday", "Upload your PSA birth certificate" (the eighth review).
  String.raw`\b(upload|submit|send|attach|provide|bring|present|include|scan)\s+(a\s+(scanned\s+)?copy\s+of\s+)?your\s+((psa|nso|original|certified|scanned)[\s-]+)*birth certificate\b`,
  String.raw`\b(state|enter|give|provide|list|indicate|include|share|tell us|write|type|fill in|declare|submit|send|put|add|note|mention)\s+(us\s+)?your\s+(age\b|birth ?date\b|date of birth\b|year of birth\b|marital status\b|civil status\b|birthday\b|dob\b|d\.o\.b\b)|^\s*[-•*]?\s*(please\s+|kindly\s+)?(state|enter|give|provide|list|indicate)\s+(age|birth ?date|date of birth|year of birth|marital status|civil status|dob|d\.o\.b)\b`,
  String.raw`\bwhat'?s your\s+((current|exact|present|actual)\s+)?age\b|\bwhat is your\s+((current|exact|present|actual)\s+)?age\b|\bwhat age (are you|will you be|would you be)\b`,
  // The seventh review: "over the age of 18", "currently pregnant", "divorced", "a solo parent". The eighth: "planning to get
  // married", "engaged", "thinking of having children", "currently expecting"; never "Are you a parent or guardian?" (a caller
  // phoning about a child patient) or "a parent company".
  String.raw`\bare you\s+((currently|now|presently|still|already|recently|legally)\s+)?(\d{2}\b${UNITS}|(over|under|above|below|between|at least)\s+(the age of\s+)?\d{2}\b${UNITS}|older than|younger than|(of\s+)?legal age|a (fresh|recent|new) grad\w*|married\b(?!\s+to\s+((the|this|that|a|an|your|our)\s+)?(script|scripts|process|job|work|rules|idea|routine|method|template|playbook))|single\b(?!-)|divorced|widowed|an? widow(er)?\b|separated\b(?!\s+from)|annulled|in a relationship|engaged\s*(\?|$|to be married)|pregnant|expecting (a baby|a child|twins)|expecting\s*[?.!]?\s*$|an? (single |solo |working |stay-at-home |first-time |new )?(parent|mother|father|mom|mum|dad)\b(?!-|\s+(or|\/)\s+(an?\s+)?(legal\s+)?guardian\b|\s+(company|companies|firm|organi[sz]ation|brand|account|business|corporation|group|entity)\b)|(planning|thinking|hoping)\s+(to|on|of|about)\s+(have|having|start|starting) (a family|kids|children|a baby)|(planning|thinking|hoping)\s+(to|on|of|about)\s+(get|getting) married|planning to (marry|wed)\b|(a )?(millennial|gen[\s-]?z|digital native))`,
  String.raw`\b(what|which) year (were you born|did you (graduate|finish (high )?school|finish college|finish university))\b|\bwhen were you born\b|\bwhen is your birthday\b|\byear (you were|were you) born\b`,
  String.raw`\bwhen did you graduate\s*\?|\bwhen did you graduate (from )?(high school|college|university|senior high)\b|\bwhen did you finish (high )?school\b|\bwhen did you finish (college|university)\b`,
  String.raw`\byear (you )?graduated\b|\b(graduation year|year of graduation)\b|\byear born\b|\byears since you graduated\b`,
  // Marital status. The seventh review: "a single parent", "No pregnant applicants", "physically fit, single, and willing to relocate",
  // "Parents with kids under 5 need not apply". The eighth: a tax client's filing status is theirs ("Help clients choose single
  // or married filing status", "What is your filing status, single or married?"); "Childless applicants preferred",
  // "Preferably male, single" go.
  String.raw`(?<!\bfiling(\s+status)?\s*,?\s*(as\s+)?)\b(married or single|single,? (or )?married)\b(?!,?\s+(filing|status|tax|return)\b)|\b(must|should|need to|needs to|has to|have to)\s+(not\s+)?be\s+(single\b(?!-)|married|unmarried|pregnant|childless|an? (single |solo )?(parent|mother|mom|mum|father|dad)\b(?!-))|\b(must|should|need to|needs to|has to|have to)\s+be\b[^.]{0,60}(,|\band\b)\s*(single|married|unmarried|childless)\s*((,\s*(and\s+)?|\s+and\s+)(willing|able|available|ready|physically|with|of good|flexible|open|amenable|fluent)\b|[.!]?\s*$)|\b(single|married|unmarried|childless)\)?\s+(applicants|candidates|people|women|men|only|preferred)\b|\bpreferabl[ey]\s+(((fe)?male|men|women|an? (wo)?man)\s*,?\s*(and\s+)?)?(single|married|unmarried|childless)\b|^\s*[-•*]?\s*(not married|unmarried|single only|childless|no kids|no children)\s*[.!]?\s*$|\b(single|married|unmarried|solo) (parents?|moms?|mothers?|dads?|fathers?)\b[^.]{0,20}\b(need not apply|not (accepted|eligible|considered)|only|preferred)\b|\b(parents|mothers|moms|mums|fathers|dads|pregnant women)\b[^.]{0,30}\b(need not apply|not (accepted|eligible|considered))\b|\b(pregnant|married|single|unmarried)\s+(applicants|candidates|women|men|people)?\s*[^.]{0,20}\bneed not apply\b|\b(with|having|who have)\s+((young|small|little|school-age)\s+)?(kids|children|dependents|a family|a baby|babies|toddlers)\b[^.]{0,30}\bneed not apply\b|\b(no|not)\s+pregnant\s+(applicants|candidates|women|people|staff|workers|employees)\b|\bpregnant (applicants|candidates)\b`,
  // Children and family plans. "Do you have a family plan?" and "kids meals" are products (the seventh review).
  String.raw`\bdo you (have|plan to have) (any |a |an )?((young|small|little|school-age|grown)\s+)?(children|(?<=\b(a|any)\s+((young|small|little|school-age|grown)\s+)?)(child|baby)|kids|family|dependents|babies|toddlers?|little ones|childcare|child care|nanny|babysitter)\b(?!'|[\s-]+(plans?|meals?|menus?|packages?|discounts?|accounts?|rates?|tickets?|pass(es)?|rooms?|suites?|sections?|clubs?|activit(y|ies)|programs?|options?|deals?|bundles?|polic(y|ies)|coverage|friendly|zones?|areas?|toys?|books?|cloth(es|ing)|shoes|products?|items?|versions?|modes?|seats?|insurance|members(hips?)?|cards?|events?|tours?|classes?|camps?|content|games?|apps?|services?|support|experience|doctor|practice|medicine|business|owned|run|history|names?|discount|beds?|cribs?|strollers?|formula|food|gear|wipes|diapers|nappies|sizes?|benefits?|allowances?|subsid(y|ies)|cent(er|re)s?|facilit(y|ies)))|\bhow many (children|kids|dependents) do you have\b|\bplanning (a family|to (have|start) (children|kids|a family|a baby)|on (having|starting) (children|kids|a family|a baby))\b|\bplans? (to|on|of|for) (have|having|start|starting|get|getting) (children|kids|a family|a baby|pregnant)\b|\bno (kids|children)\b[^.]{0,25}\bpreferred\b|\bmust not have (any )?(children|kids)\b`,
  // The seventh review: "Do you plan to get pregnant?", "Who takes care of your children during your shift?", "How will you manage childcare?".
  // Never "If you get pregnant, you keep your HMO" (a benefit) or "How do you handle children who call in?".
  String.raw`\b(do|will|would|are|have) you\b[^.?!]{0,30}\b(get|getting|become|becoming) pregnant\b|\bwho\s+(takes care of|will take care of|looks after|will look after|watches|will watch|minds|will mind|cares for|will care for|babysits|will babysit)\s+your\s+(children|kids|child|baby|babies|toddlers?|little ones|son|daughter)\b|\bhow (will|would|do|can|are) you\s+(going to\s+)?(manage|arrange|sort out|plan|juggle|balance|handle)\s+(child ?care|childcare|babysitting|your (kids|children|family|family life))\b|\b(does|do|what does|where does) your (spouse|husband|wife) (work|do)\b|\bwhat('?s| is) your (spouse|husband|wife)'?s? (job|occupation|work)\b|\bdoes your (spouse|husband|wife) (agree|approve|allow|mind|support)\b`,
  // The eighth review: "Do you plan to get married soon?", "Do you intend to have children?", "Do you have someone to look after
  // your children?"; never 'Do you want to start a family plan?' (a product) or a clinic asked to watch a caller's kids.
  String.raw`\bdo you (plan|intend|want|hope|expect|wish)\s+(to|on)\s+((get|getting) married|marry|marrying|(have|having|start|starting) (children|kids|a baby|a child|a family))\b(?!['’]|[\s-]+(plans?|packages?|accounts?|discounts?|memberships?|bundles?|tickets?|rooms?|suites?|pass(es)?|policy|policies|coverage|insurance|cards?)\b)|\bdo you have (someone|anyone|somebody|a nanny|a babysitter|help)( who can| who will| to)? (look after|take care of|watch|mind|care for|babysit) your (children|kids|child|baby|little ones|son|daughter)\b`,
  // "No children (more flexible)", "Family commitments (fewer is better)": a ranking factor (the sixth review).
  // Never a club, a menu or a customer without children ("A caller with no kids asks about the family package"; the seventh review).
  String.raw`(?<!\b(customers?|callers?|guests?|clients?|members?|patients?|couples?|users?|travel+ers?|passengers?|tenants?|buyers?|shoppers?|visitors?|persons?|people|wom[ae]n|m[ae]n|famil(y|ies)|households?|adults?|someone|anyone)\s+(with|who (have|has)|having|has|have)\s+)\b(no|without|fewer|zero)\s+(kids|children|dependents)\b(?!\s*(under|below|younger|over|aged?|age|may|can|allowed|are|in|at|on|policy|accounts?|menu|programs?|discounts?|clubs?|meals?|sections?|areas?|zones?|pools?|activities|packages?|rooms?|events?|['’]))|\b(no|fewer|few|less|minimal|without|free (of|from)) family (commitments|obligations|responsibilities|ties)\b|\bfamily (commitments|obligations|responsibilities|ties)\s*\(?\s*(fewer|few|less|none|no|minimal|lower)\b`,
  String.raw`\bilang taon ka\b|\bkaarawan mo\b|\b(what|which) generation (are you|do you (belong|fall))\b|\byour generation\b`,
  // Filipino (the eighth review): "Kasal ka na ba?" (are you married?), "May anak ka ba?" (do you have a child?), "Single o may
  // asawa?", "Dalaga o binata lamang" (unmarried women or men only), "Walang anak, mas mainam" (no children is better).
  String.raw`\bkasal ka\b|\bmay (anak|asawa) ka\b|\bsingle o may asawa\b|\b(dalaga|binata) o (dalaga|binata)\b|\bwalang anak\b[^.]{0,20}\b(mas mainam|lamang|only|preferred)\b`,
  String.raw`\bsingle\s*\/\s*married\b(?!\s+filing)|\bmarried\s*\/\s*single\b(?!\s+filing)`,
  String.raw`\bin (your|my) (20s|30s|40s|twenties|thirties|forties)\b`,
  // "Male or female, 21-35"; never "Female callers make up 60-70% of our line".
  String.raw`\b(male|female)\b(?!\s+(callers?|customers?|patients?|clients?|users?|members?|players?|guests?|students?|shoppers?|viewers?|audience))[^.]{0,20}\b\d{2}\s*(-|–|to)\s*\d{2}\b${UNITS}`,
  // A preference for young applicants. "Fresh graduates welcome" is an open door; "preferably fresh graduates" a filter (the sixth review),
  // and so are "Must be a fresh graduate" and a line that is only "Fresh graduate" (the seventh review), "Newly graduated
  // applicants preferred" and "Freshers only" (the eighth). Retirees are kept out the same way ("Retirees need not apply").
  String.raw`\b(retirees|retired (people|persons|applicants|candidates)|senior citizens|older (people|persons|applicants|candidates|workers))\b[^.]{0,20}\bneed not apply\b|\bfreshers?\b[^.]{0,20}\b(only|preferred|required|need apply|priority)\b|\b(fresh|recent|new|newly)\s+(college\s+|university\s+)?grad\w*\b[^.]{0,20}\b(only|preferred|required|need apply|a plus|an advantage|status|priority|first\s*$)|\bonly\s+(fresh|recent|new)\s+grad|\b(preferabl[ey]|prefer|preference for|priority (to|for)|prioriti[sz]e)\s+(a\s+)?(fresh|recent|new)\s+(college\s+|university\s+)?grad|\b(must|should|need to|needs to|has to|have to)\s+be\s+(an?\s+)?(fresh|recent|new)\s+((college|university|high school|senior high)\s+)?grad\w*|^\s*[-•*]?\s*(an?\s+)?(fresh|recent|new)\s+((college|university)\s+)?grad(uate)?s?\s*(\([^)]*\))?\s*[.!]?\s*$`,
  // A line or list item that is only a youth, a generation or a status ("Communication, Young, Empathy"; the seventh review).
  String.raw`^\s*[-•*]?\s*(young|youthful|gen[\s-]?[zy]|millennials?|zoomers?|single|married|unmarried)\s*[.!]?\s*$`,
  // "A young brand" is the company's age, not a wish for young staff.
  String.raw`\byoung(er)?\b(?!\s+(brand|company|companies|business|startup|firm|clinic|store|shop|app|product|industry|market|organi[sz]ation))[,\s]+(and\s+)?([\w-]+[,\s]+){0,3}(team|team players?|talent|blood|crowd)\b|\byoung,?\s+(and\s+)?(energetic|dynamic|vibrant|fresh|fun)\b|\byouthful,?\s+(and\s+)?(energy|energetic|team|vibe)\b|\byouthfulness\b`,
  // Hiring young people; never helping them ("hiring agents to help young professionals find apartments"),
  // talking to them or understanding them ("agents who can talk to young people about student loans"; the seventh review).
  String.raw`\b(want|wants|wanted|seeking|looking for|hiring|hire|prefer|preferred|welcome|only|need|needs)\b(?:(?!\b(help|helps|helping|support|supports|supporting|serve|serves|serving|assist|assists|assisting|guide|guiding|reach|reaching|sell|selling|talk|talks|talking|speak|speaks|speaking|understand|understands|understanding|relate|relates|connect|connects|engage|engages|engaging|explain|explains|explaining|teach|teaches|teaching|for|with|from)\b)[^.]){0,30}\b(young(er)?\b[,\s]+([\w-]+[,\s]+){0,2}(people|person|applicants?|candidates?|agents?|reps?|representatives?|staff|professionals?|workers?|employees?|graduates?|individuals?|talent|hires?|men|women|man|woman|guys?|girls?|ladies)\b|youngsters\b)|\byoung(er)?\s+(applicants|candidates)\b|\b(applicants|candidates|people|someone)\s+who\s+(are|is)\s+young\b|\byoung professionals (welcome|wanted|only|preferred)\b|\byoungsters\s+(only|preferred|wanted|welcome)\b`,
  // A job title: "Young Customer Service Agent".
  String.raw`\byoung(er)?\s+((customer|client|patient|guest|member|tech(nical)?|phone|chat|email|call|contact|service|support|care|sales|night|virtual|remote|front|desk|office|shift|center|centre|bpo|cs|it|help)[\s-]+){0,3}(agents?|reps?|representatives?|associates?|specialists?|assistants?|advisors?|officers?|coordinators?|receptionists?|csrs?|staff|hires?|recruits?|team members?)\b`,
  // A generation wanted; never the customers described ("most of our customers are Gen Z, so…").
  String.raw`\b(millennials?|gen[\s-]?z|gen[\s-]?y|generation z|zoomers?|digital natives?)\b[^.,;:]{0,40}\b(preferred|only|applicants|candidates|reps|agents|wanted|mindset|need apply)\b|\(\s*(gen[\s-]?z|gen[\s-]?y|millennials?)\s*\)|\b(must be|should be|ideally|preferabl[ey])\s+(a\s+)?(millennial|gen[\s-]?z|digital native)`,
]);

// Ages. Each is the applicant's unless it is attached to someone else.
const AGE_NUMBER = [
  String.raw`\b\d{2}\s*(-|–|to)\s*\d{2}\s*(years?\s*old|yrs?\s*old|years? of age|y\.?\s?o\.?|y\/o)(?=\W|$)`,
  // "35yo and below", "Must be 25yo+" too (the seventh review), and "a 25-year-old", "21+ years old" (the eighth: whose it is,
  // a caller's or the applicant's, is read below).
  String.raw`\b\d{2}\s*\+?[\s-]*(years?|yrs?)[\s-]*(old|of age)\b|\b\d{2}\s*y\/o\b|\b\d{2}\s*y\.o\.?(?=\W|$)|\b\d{2}\s*yo\b`,
  // "21 years or older", "aged 18 and over"; never a bare "85 or above" (a score), nor "Persons 60 and above get a senior discount".
  String.raw`\b\d{2}\s*years?\s*(or|and)\s+(older|above|below|under|younger|over)\b|\b(be|aged?|ages?|applicants?|candidates?)\s+\d{2}\s*(or|and)\s+(older|above|below|under|younger|over)\b`,
  String.raw`\b(at least|over|under|below|above|not more than|no more than|not over|not older than|no older than|younger than|older than|max(imum)?|min(imum)?)\s+\d{2}\s*(years?\s*old|yrs?\s*old|years? of age|y\.?o\.?|y\/o)(?=\W|$)`,
  // "Must be over the age of 21", the usual English wording (the seventh review).
  String.raw`\b(at least|over|under|below|above|not over|not above|older than|younger than|reached|reach)\s+the\s+age\s+of\s+\d{2}\b${UNITS}`,
  // "Retirees over 60 preferred": who is wanted is read below (PREFERRED_AFTER).
  String.raw`\b(over|under|above|below|younger than|older than)\s+${AGE}\b${UNITS}(\s*(years?|yrs?)(\s*old)?)?\s*(preferred|need not apply|(are |is )?(welcome|encouraged|invited) to apply|may apply|can apply)`,
  // "Name, age and where you are from"; never "Take each caller's name, age and reason for the visit" (the seventh review: whose age it is is read below).
  String.raw`\b(name|location|address),\s*(and\s+)?age\b|\bage,\s*(and\s+)?(location|name|where you)\b|\bname and age\b|\bage and (civil|marital) status\b`,
  // "Maria, 24, single mom of two" in a placeholder.
  String.raw`\b${AGE}\s*,\s*(single|married|separated|widowed|an? (single |solo )?(mom|mother|mum|dad|father|parent)|(single |solo )?(mom|mother|mum|dad|father|parent) of)\b`,
  String.raw`\b(must|should|need to|needs to|has to|have to)\s+(not\s+)?be\s+(at least\s+|at most\s+|over\s+|under\s+|below\s+|above\s+|older than\s+|younger than\s+|more than\s+|less than\s+|no more than\s+|not more than\s+|not older than\s+|no older than\s+|between\s+)?\d{2}\b${UNITS}`,
  String.raw`\b(not|no)\s+(older|more)\s+than\s+\d{2}\b${UNITS}`,
  // "Not above 35", "Age must not exceed 35", "Applicants aged up to 35" (the seventh review's probes).
  String.raw`^\s*[-•*]?\s*not (above|over)\s+${AGE}\b${UNITS}|\bage\s+(must|should|shall|cannot|can't|may)\s+not\s+(exceed|be (over|above|more than|older than))\s+\d{2}\b${UNITS}|\baged\s+(up to|under|below|over|above|not over|not above|at least)\s+\d{2}\b${UNITS}`,
  String.raw`\bages?\s+(of\s+)?\d{2}\s*(\+|-|–|to|and|or)|\bages?\s*:\s*\d{2}|\baged?\s+\d{2}\b${UNITS}|\bbetween the ages of\b|\baged?\s+between\s+\d{2}\s+and\s+\d{2}\b|\bages?\s+(under|below|over|above|between|up to|at least|not over|not above|max(imum)?)\s+\d{2}\b${UNITS}`,
  String.raw`\bprefer\w*\b[^.]{0,30}\b(under|below|over|above|younger than|older than)\s+\d{2}\b${UNITS}`,
  String.raw`^\s*[-•*]?\s*(\d{2}\s*(-|–|to)\s*\d{2}|(below|under|over|above)\s+\d{2})\s*(only|years old|yrs old|years)?\s*$`,
  String.raw`\b\d{2}\s*\+\s*only\b|^\s*[-•*]?\s*(must be\s+)?\d{2}\s*\+\s*$`,
  // The sixth review's wordings.
  // "Ideally 22-30 years", "Ideal candidate: 25-30 yrs"; never "for 20-30 years" or "15-20 years of experience".
  String.raw`(?<!\b(have|has|had|having|with|of|for|in|last|past|after|within|about|nearly|almost|around|spent|worked|served|experience|exp)\b[\s:.]*)\b${AGE}\s*(-|–|to)\s*${AGE}\s*(years?|yrs?)\b(?!\s*(of|in|with|as|at|on|for|experience|exp|working|work|service|tenure|ago)\b)`,
  // "Below 30 yrs", "Applicants under 35 years, with BPO experience".
  String.raw`(?<!\b(with|have|has|having|of)\s+)\b(below|under|not over|not above|younger than|max(imum)?)\s+${AGE}\s*(years?|yrs?)\b(?!\s*(of|in|with|as|at|on|for|experience|exp|working|work|service|tenure|ago)\b)`,
  // "Agents under 30 preferred", "Applicants who are 35 or younger", "No applicants over 35".
  String.raw`\b(applicants?|candidates?|agents?|reps?|hires?|staff)\s+(who\s+(are|is)\s+|aged?\s+)?(${AGE}\s*(or|and)\s+(older|above|below|under|younger|over|up|less)\b|(under|below|over|above|younger than|older than)\s+${AGE}\b${UNITS})`,
  String.raw`\b(those|people|persons?|anyone|someone|individuals?)\s+(who\s+(are|is)\s+|aged?\s+)?(${AGE}\s*(or|and)\s+(older|above|below|under|younger|over|up|less)\b|(under|below|over|above|younger than|older than)\s+${AGE}\b${UNITS})[^.]{0,25}\b(need not apply|preferred|only|welcome|wanted|may apply|can apply|should apply)\b`,
  // "Night Shift Agent, 35 and below", "30 and below preferred", "21 and above only".
  String.raw`(^|[,(:–—•*-])\s*${AGE}\s*(years old\s*|yrs old\s*)?(and|or)\s+(below|under|younger|above|up|older|over)\b\s*(only|preferred)?\s*\)?\s*[.!]?\s*$`,
  // "(Under 30)", "(21-30)", "(21-30 yrs)" closing a title or a factor.
  String.raw`\(\s*((under|below|over|above|max\.?|not over)\s+${AGE}|${AGE}\s*(-|–|to)\s*${AGE}|${AGE}\s*\+|${AGE}\s*(and|or)\s+(below|under|younger|above|up|older|over))\s*(years?|yrs?|y\.?o\.?|y\/o)?\s*(old)?\s*\)(?=\s*($|[-–—|,:]))`,
  // "Under 30s only", "Over 21s only" with a space too (the eighth review); never "our over-50s insurance line" (a product, below).
  String.raw`\b(under|over)-${AGE}s\b|\b(under|over)\s+${AGE}s\b(?=\s*(only|preferred|need not apply|wanted|welcome)\b|\s*[.!]?\s*$)|\b${AGE}\s*((-|–|to)\s*${AGE})?[\s-]*(year|yr)[\s-]*olds\b`,
  // The eighth review: "Twenty-somethings wanted", "a 20-something", "Applicants from 21 to 35", "Prefer 35 below", "21 hanggang 35
  // taong gulang"; never "Handle 40-something chats a day".
  String.raw`\b[2-5]0[\s-]?somethings\b|\ban?\s+[2-5]0[\s-]?something\b(?!\s+(tickets|chats|calls|emails|messages|cases|orders|replies|minutes|hours|dollars|items|people|customers|clients|patients)\b)|\b(applicants?|candidates?)\s+(from|between)\s+${AGE}\s*(to|-|–|and)\s*${AGE}\b${UNITS}|\bprefer\w*\s+${AGE}\s+(and\s+)?(below|under|younger|above|over|older)\b|\b\d{2}\s*((-|–|to|hanggang)\s*\d{2}\s*)?taong gulang\b`,
  String.raw`\b(preferabl[ey]|ideally)\s+(${AGE}\s*(-|–|to)\s*${AGE}\b${UNITS}|${AGE}\s*(and|or)\s+(below|under|younger|above|older|over)\b|(under|below|over|above|younger than|older than)\s+${AGE}\b${UNITS})`,
  String.raw`\bbetween\s+${AGE}\s+(and|to)\s+${AGE}\s+(only|preferred)\b|^\s*[-•*]?\s*between\s+${AGE}\s*(and|to|-|–)\s*${AGE}\s*(only|preferred)?\s*[.!]?\s*$`,
  // "Confirm they are 21 or older", "if you are over 25".
  String.raw`\b(they|you|he|she)\s+(are|is|be|were)\s+(${AGE}\s*(or|and)\s+(older|over|above|younger|under|below)\b|${AGE}\s*\+|(over|under|at least|older than|younger than|below|above)\s+${AGE}\b${UNITS})`,
  // A decade of life: "in their 20s", "mid-30s", and "Late 50s need not apply" (the eighth review).
  String.raw`\bin (his|her|their) (20s|30s|40s|50s|twenties|thirties|forties|fifties)\b|\b(early|mid|late)[\s-]?(20s|30s|40s|50s|60s|twenties|thirties|forties|fifties|sixties)\b`,
  // A birth or graduation year: "Born after 1995", "Born 1990-2000", "Graduated 2020 or later", "Born in the 90s",
  // "Graduates from 2020 onwards" (the seventh review).
  String.raw`\bborn\s+((in|after|before|between|from|since|later than|earlier than|on or (after|before))\s+)?${YEAR}\b(\s*(-|–|to|and)\s*${YEAR}\b)?`,
  String.raw`\bborn\s+(in\s+)?(the\s+)?((early|mid|late)[\s-]+)?('?(50|60|70|80|90)s|19[5-9]0s|20[01]0s|fifties|sixties|seventies|eighties|nineties)\b`,
  String.raw`\b(graduated?|graduates?|graduating|grads?|batch(es)?|class(es)? of)\s+((in|from)\s+)?${YEAR}\s*(or|and)\s+(later|after|newer|more recent|earlier|before|older|above|below|up|onwards?)\b|\b(graduated?|graduates?|grads?|batch(es)?)\s+(after|before|since)\s+${YEAR}\b|\b(graduat\w*|batch(es)?|class(es)? of)\s+${YEAR}\s*(-|–|to)\s*${YEAR}\b|\b(batch(es)?|class(es)? of|graduates? (of|from))\s+${YEAR}\b[^.]{0,20}\b(only|preferred|need apply)\b|\b(graduated?|graduates?|graduating|grads?|batch(es)?|class(es)? of)\s+((in|from|of)\s+)?${YEAR}\s*(onwards?\b|and beyond\b|\+)`,
  // Graduation recency, a stand-in for "fresh graduates only" (the eighth review): "Graduated within the last 2 years",
  // "Must have graduated no more than 2 years ago", "2023 graduates preferred".
  String.raw`\bgraduated\s+(with)?in\s+the\s+(last|past)\s+\d+\s+years?\b|\b(must|should|need to|needs to|has to|have to)\s+have\s+graduated\s+(no more than|not more than|less than|within|in the (last|past))\b|\b${YEAR}\s+(graduates?|grads?|batch|passers)\b[^.]{0,20}\b(only|preferred|need apply|wanted|required)\b`,
  // "Of legal age", and "Must be legal age" (the seventh review); never "the legal age for opening an account".
  String.raw`\b(be|is|are|of|at|reached|reach|reaching)\s+(the\s+)?legal age\b`,
  // An age limit by name: "Age cap: 35", "Max age: 35", "Age fit (21-35)".
  // Never "no age limit" or "suggests an age preference".
  String.raw`(?<!\b(no|not|any|never|without|as|hints? at|suggests?|suggesting|impl(y|ies|ying))\s+(an?\s+)?)\b((ideal|preferred|max(imum)?|min(imum)?|required)\s+age|age\s*(limits?|requirements?|range|ranges|brackets?|caps?|ceiling|preferences?|restrictions?|criteria|fit|qualifications?))\b`,
];
// A score, a time or a speed is the subject: "QA score must be 90", "reply time should be under 60".
const METRIC_SUBJECT = /\b(score|scores|rate|rates|speed|accuracy|csat|nps|aht|time|times|reply|replies|response|wpm|typing|qa|quality|sla|target|targets|internet|laptop|computer|ram|average)\b[^.]{0,25}$/i;
// …or the number is measured on something: "Should be 90 or above on the English test".
const METRIC_AFTER = /^[^.]{0,25}\b(on|in|for)\s+(the|a|an|our|your|each|every|all|this)?\s*([\w-]+\s+){0,2}(tests?|exams?|assessments?|quiz(zes)?|audits?|evaluations?|reviews?|scorecards?|surveys?|qa|csat)\b/i;
// What a loan, card or scholarship is applied for: its applicants are customers ("loan applicants must be 21 or older"; the seventh review).
// Never an "account" or a "program": in a call-centre ad that is the client the agents work on ("Applicants for our healthcare account").
const APPLIED_PREFIX = String.raw`loan|card|credit card|credit|scholarship|visa|passport|membership|mortgage|housing|grant|insurance|permit|license|licence|rental|tenancy`;
const APPLIED_FOR = String.raw`loans?|credit|credit cards?|cards?|scholarships?|visas?|passports?|memberships?|mortgages?|housing|grants?|permits?|licen[cs]es?|rentals?|financing|apartments?|financial aid`;
// Someone the age can belong to, or a verb that serves them ("helping patients aged 65").
// "Be patient" is a manner, not a patient. The seventh review: people, persons, folks, women and men, the clientele and owners
// are customers too ("Answer calls from people aged 65 and over", "A woman in her 50s calls"), unless the sentence is hiring them
// (HIRING_CUE: "We prefer people under 30"). The eighth: alumni ("Alumni who graduated within the last 2 years keep the rate").
// The ninth: renters ("Renters must be 21 or older").
const SOMEONE_ELSE = new RegExp(String.raw`\b(customers?|clients?|callers?|(?<!\b(be|very|more|stay|remain|and|being|so|is|are)\s)patients?|members?|users?|players?|gamers?|guests?|child|children|kids?|students?|seniors?|senior citizens|parents?|policyholders?|account (holders?|owners?)|cardholders?|borrowers?|buyers?|shoppers?|drivers?|renters?|famil(y|ies)|travel+ers?|residents?|readers?|viewers?|subscribers?|visitors?|alumn(i|us|a|ae)|son|daughter|mother|father|grandmother|grandfather|grandparents?|she|he|they|minors?|teens?|teenagers?|toddlers?|babies|infants?|adults?|elderly|retirees?|pensioners?|tenants?|homeowners?|guardians?|beneficiar(y|ies)|dependents?|insured|consumers?|passengers?|riders?|learners?|audiences?|fans?|help|helps|helping|serve|serves|serving|assist|assists|assisting|care for|caring for|people|persons?|folks|individuals?|wom[ae]n|m[ae]n|lad(y|ies)|gentlem[ae]n|clientele|owners?|someone|anyone|(${APPLIED_PREFIX})\s+applicants?|applicants?\s+for\s+(an?\s+|our\s+|the\s+|their\s+|its\s+)?(${APPLIED_FOR}))\b`, "gi");
// Words for a person that are the applicant when the sentence is hiring them.
const NEUTRAL_PERSON = /^(people|persons?|folks|individuals?|wom[ae]n|m[ae]n|lad(y|ies)|gentlem[ae]n|someone|anyone|adults?)$/i;
const HIRING_CUE = /\b(prefer\w*|want\w*|seek\w*|hiring|hire|looking for|need\w*|welcom\w*|accept\w*|only|ideal\w*|candidates?|applicants?|open to|calling all|must be|should be|preferabl[ey]|recruit\w*|employ\w*|join)\b[\s:,-]*((an?|the|our|young|younger|older|energetic|[\w-]+)\s+){0,2}$/i;
// Customer-type groups a job can also be hiring, right after a hiring word: "We hire students aged 18-24", "We're hiring
// retirees aged 55-70", "Calling all students aged 18-25!" (the eighth review). "Help students aged 18-24 with their loans"
// and "Most callers are retirees aged 65 and older" stay theirs. "We're recruiting", never "recruit": an outbound agent recruits
// respondents ("Call households to recruit parents aged 25-45 for our product panels"; the ninth review). "We recruit" is the
// business hiring ("We recruit students aged 18-22 as part-time chat agents"; the tenth).
const APPLICANT_GROUP = /^(students?|seniors?|senior citizens|retirees?|pensioners?|parents?|mother|father|teens?|teenagers?|learners?)$/i;
const GROUP_HIRING_CUE = /\b(hire|hires|hiring|looking for|seeking|seek|recruiting|we\s+([a-z]+ly\s+)?recruit|calling all|prefer|prefers|preferring|employ|employs|employing)\s+((an?|the|our|more)\s+)?((college|university|uni|high school|senior high|working|stay-at-home|young|local|retired|active|graduating|part-time|full-time|filipino|pinoy)\s+){0,2}$/i;
// The applicant, or the people being hired. A loan's or a card's applicants are customers (APPLIED_FOR).
const APPLICANT = new RegExp(String.raw`\b(applicants?(?<!\b(${APPLIED_PREFIX})\s+applicants?)(?!\s+for\s+(an?\s+|our\s+|the\s+|their\s+|its\s+)?(${APPLIED_FOR})\b)|candidates?|ideal(ly)?|we('re| are) (looking|hiring|seeking)|seeking|looking for|hiring|hire|prefer\w*|want(ed)?|agents?|reps?|representatives?|staff|hires|team members?|you|your)\b|^\s*[-•*]?\s*must\b`, "gi");
// "Students aged 18-22 preferred", "Seniors aged 60+ are welcome to apply", "Ideal for retirees aged 55 and over": a preference
// for applicants of an age, whoever they are (the seventh review), and "Retirees aged 55-70 wanted" (the eighth). Never
// "preferred seating", "only" (a senior discount) or "wanted to know".
const PREFERRED_AFTER = /^[^.]{0,40}?\b((preferred|need not apply|(are |is )?(welcome|encouraged|invited) to apply|may apply|can apply|should apply)\s*([.!,;:)]|$|for (this|the) (role|job|position|team)\b)|wanted\b(?!\s+(to|a|an|the|their|his|her|its|it|them|help|more|less|answers?|refunds?)\b))/i;
// …never someone's own wish: a pronoun or a "says" between the person and the word makes it theirs (the eleventh review: "A
// 70-year-old caller says a phone call is preferred", "A 65-year-old member got the plan she wanted" read as a hire). The
// twelfth review: a pronoun, a "we" or a "tell" anywhere in between also sits inside the hired person's own clause ("Students
// aged 18-22, if they can do nights, preferred", "…who we can train are preferred", "Retirees aged 55-70, as they bring
// patience, are welcome to apply"), so it is theirs only as the one who wants it ("the plan she wanted", "the phone option she
// preferred") or as what someone says is preferred ("says a phone call is preferred"), and a customer named with the thing
// they prefer after a comma ("A 70-year-old caller, Tagalog preferred, asks…", "For 70-year-old patients, a phone call is
// preferred"; never gamers, whom a game's support team hires). Only "preferred" and "wanted" can be a customer's: "welcome to
// apply", "may apply" and "need not apply" are always a hire.
const SOMEONE_ELSES_WISH = /\b(he|she|they)\s+((really|originally|first|always|had|has|have|most)\s+)?$|\b(says?|said|asks?|asked|tells?|told)\b[^.]*\b(is|are|was|were|would be)\s+(not\s+)?$/i;
function prefersThem(text: string): boolean {
  const found = PREFERRED_AFTER.exec(text);
  if (!found) return false;
  const between = found[0].slice(0, found[0].length - found[1].length);
  return !(/^(preferred|wanted)\b/i.test(found[1]) && (SOMEONE_ELSES_WISH.test(between) || CUSTOMERS_OWN_PREFERENCE.test(between)));
}
// Read on the whole sentence. The tenth review: "This role would be perfect for a 22-year-old fresh graduate", and "It's great
// for a 21-year-old looking for a first job" when the sentence is about a job (never "It's perfect for a 12-year-old's first
// phone"), and since the eleventh only when the job is what they are looking for ("It's great for students aged 18-24 with
// part-time jobs" is a student account).
const IDEAL_FOR = /^\s*[-•*]?\s*(((this|the) (job|role|position|work) (is|would be|will be|could be)\s+)?(ideal|perfect|great|suitable|best suited)\s+for\b|(this|the) (job|role|position|work) (suits|fits)\b|it(['’]s| is| would be| will be)\s+(ideal|perfect|great|suitable|best suited)\s+for\b(?=[^.]*\b(looking for|seeking|searching for|in search of|starting|beginning|wants?|wanting)\s+((an?|the|their|his|her|your)\s+)?([\w-]+\s+)?(jobs?|careers?|roles?|positions?|work)\b))/i;
// …unless the people are plainly customers: "Ideal for customers aged 60+" describes a plan.
const CUSTOMER_WORDS = String.raw`customers?|clients?|callers?|patients?|members?|users?|players?|gamers?|guests?|policyholders?|subscribers?|cardholders?|borrowers?|buyers?|shoppers?|passengers?|travel+ers?|consumers?|tenants?|account (holders?|owners?)`;
const CUSTOMER_WORD = new RegExp(String.raw`^(${CUSTOMER_WORDS})$`, "i");
// "A 70-year-old caller, Tagalog preferred", "70-year-old patients, a phone call is preferred", "A 70-year-old caller: callback
// preferred": what the customer prefers, named after a comma or a colon (prefersThem; the twelfth review). The thirteenth: only
// the customer the age belongs to, right after the age or its "-year-old" with one word between at most ("A 70-year-old Filipino
// caller, Tagalog preferred"); read anywhere before the comma it excused the customers a hire serves ("We need students aged
// 18-24 to help customers, bilingual preferred"). The fourteenth: never the team, the staff or the crew in that one word,
// which are the people hired ("21-30 y/o team players, bilingual preferred", "21-30 yo staff members, …").
const CUSTOMERS_OWN_PREFERENCE = new RegExp(String.raw`^\W*(\d{2}\W*)?((years?|yrs?)[\s-]*old\s+|y[.\/]?o\.?\s+)?((?!(team|staff|crew)\b)[\w-]+\s+)?(?!gamers?\b)(${CUSTOMER_WORDS})\s*[,:]\s*(?!(if|as|since|because|when|while|who|whom|which|that|and|or|but|so|though|although|unless|once)\b)([\w'-]+\s+){1,3}((is|are|was|were|would be)\s+((often|usually|generally|always|mostly|also)\s+)?)?$`, "i");
// "Our 10 years old company", "our 25-year-old family business", an app rated "18+".
const SOMEONE_ELSE_AT = /^\d{2}[\s-]*(years?|yrs?)[\s-]*old\s+([\w'-]+\s+){0,2}?(company|business|brand|firm|clinic|store|shop|app|website|platform|product|account|car|house|practice|agency|startup|restaurant|hotel|resort|bank|school|hospital|office|organi[sz]ation)\b/i;
// "A 70-year-old caller", "a 16-year-old wants to sign up": an article, then the age (the eighth review: the person after it
// says whose it is, and with no one named it is the applicant only when the sentence is hiring: "We want a 25-year-old
// go-getter", "The ideal candidate is a 25-year-old graduate"). The ninth: the person right after the age says whose it is with
// no article too ("70-year-old patients", "16-year-old players", "26-year-old dependents").
const ARTICLE_BEFORE = /\b(an?|the|our|this|that|my|her|his|their|your|its|each|every)\s+((young|younger|old|older|little|teenage|elderly|retired|new|first-time)\s+)?(\d{2}[\s-]*(to|-|–|or|and)[\s-]*)?$/i;
// The hiring word right before the age (or its article): never "The caller wants to add a 16-year-old" or "Agents must be able
// to calm a 16-year-old", and never a product's "perfect for", "great for" or "suits" ("The starter phone is perfect for a
// 12-year-old"; the ninth review): IDEAL_FOR reads those when they open the line ("Perfect for a 21-year-old starting out").
// The fourteenth review: "Ideal candidates:" too, as "Ideal candidate:".
const HIRING_LEAD = /\b(we('re| are| would|'d)?\s+(want|need|prefer|seek|seeking|looking for|hiring)|looking for|seeking|hiring|to hire|hire|ideal(ly)?|ideal (candidates?|hires?|applicants?|fit)|(candidate|applicant|hire|fit) (is|would be|should be)|preferabl[ey]|prefer(red)?|recruiting|calling all|(must|should|needs? to|has to|have to) be)\s*[:,-]?\s*$/i;
const WORDS_AFTER = /^[\s,]*((?:(?!(who|that|which|with|from|and|or|to|for|in|on|at|of|by|as|but|so|is|are|was|were)\b)[\w'’-]+\s*){0,3})/i;
const SOMEONE_ELSE_WORD = new RegExp(SOMEONE_ELSE.source, "i");
const SOMEONE_ELSE_AFTER = /^[^.]{0,15}\b(game|games|ratings?|rated|app|apps|content|movie|plan|plans|account|accounts|discount|discounts)\b/i;
// An age limit on a product or for a customer: "the minimum age for a kid's savings account", "age limits on our insurance plans",
// and "the age range of the group", "age restrictions apply to some tours" (the eighth review), "the minimum age to rent a car",
// "the age limit for the youth fare", "the age requirement to callers" (the ninth).
const THING_AFTER = /^\s*(for|on|of|in|under|does|do|that|your|our|the|each|every|to|apply to|applies to)\b[^.:]{0,40}\b(plans?|accounts?|polic(y|ies)|insurance|coverage|cards?|loans?|products?|tickets?|cases?|claims?|games?|apps?|content|movies?|programs?|courses?|memberships?|discounts?|services?|tours?|trips?|classes?|camps?|vaccines?|benefits?|subscriptions?|tiers?|customers?|clients?|callers?|patients?|members?|users?|kids?|child(ren)?|minors?|students?|policyholders?|riders?|passengers?|guests?|players?|groups?|part(y|ies)|bookings?|reservations?|cars?|vehicles?|rentals?|fares?)\b/i;
// "The plan's age limit": a product's.
const THING_BEFORE = /\b(plan|account|policy|insurance|product|program|card|loan|course|membership|game|app|service|tour|class|camp|subscription)('?s)?\s*$/i;
// With a number too (the seventh review): "our youth plan for ages 18 to 25", "our ages 18-30 travel program", "our over-50s insurance line".
// Never the job's own program ("Our internship program is for ages 18-24").
const JOB_PROGRAM = String.raw`(?<!\b(training|internship|intern|trainee|apprenticeship|ojt|work|job|career|hiring|recruitment|graduate|management|leadership)\s+)`;
const PRODUCTS = String.raw`plans?|programs?|programmes?|insurance|polic(y|ies)|products?|accounts?|cards?|loans?|courses?|memberships?|tours?|trips?|classes?|camps?|subscriptions?|discounts?|coverage|packages?|lines?|fares?|rates?|tickets?|tiers?|bundles?`;
const THING_FOR = new RegExp(String.raw`\b${JOB_PROGRAM}(${PRODUCTS})('?s)?\s+((is|are)\s+)?(for|covering|covers|open to|available (to|for)|limited to|restricted to)\s*$`, "i");
// Right after the age, with no "for our" between: never "Agents aged 21-35 for our insurance line", nor "Applicants aged 20-35
// per company policy" (the ninth review).
const THING_NEXT = new RegExp(String.raw`^[\s\d+–-]*((years?|yrs?)\s*(old)?\s*)?(and (up|over|above)\s+)?((?!(and|or|with|for|to|in|on|at|of|our|the|a|an|your|this|per)\b)[\w'-]+\s+){0,2}${JOB_PROGRAM}(${PRODUCTS})\b`, "i");
// "Our clinic, 30 years old this year, …", "Our company is 25 years old", "Founded in 1999, our clinic is 25 years old":
// the business's own age, as the sentence's (or the clause's) subject (the seventh review).
const BUSINESS_FIRST = /(^|[,;:]\s*)(our|the|this|a|an)?\s*([\w'-]+\s+){0,2}(company|business|brand|clinic|firm|store|shop|startup|agency|practice),?\s*((is|was|has been|turned|turns|will be|will turn|just turned)\s+((now|over|almost|nearly|about|already)\s+)?)?$/i;
// "Our company was born in 2015".
const THING_BORN = /\b(company|business|brand|idea|startup|clinic|store|firm|shop|app|platform|product|it|we)\b[^.]{0,20}\b(was|were)\s*$/i;

// The eighth review: what an agent asks or tells a customer was dropped as if it were asked of the applicant.
const CUSTOMER_PEOPLE = String.raw`customers?|clients?|callers?|(?<!\b(be|very|more|stay|remain|and|being|so|is|are)\s)patients?|members?|guests?|policyholders?|account holders?|cardholders?|borrowers?|buyers?|shoppers?|users?|tenants?|passengers?|travel+ers?|residents?|subscribers?|visitors?|players?|taxpayers?|filers?`;
// A customer's rule, not the applicant's (the eighth review), unless the sentence names applicants (TO_APPLICANTS) or the age
// is a range ("21-35" is a hiring limit; the ninth review found "Remind them you must be 21-35 years old to apply",
// "Eligible from age 21 to 35" and "Let our recruiter know you are 21-35" passing):
//   - told to a customer: "Explain to the caller that, by law, you must be 21 or older to rent a car", "Let the guest know you
//     must be 21" (never "Let us know", "Let our recruiter know": the ninth review), or told with no one named, in the same
//     clause as the age: "Explain that Medicare starts at age 65", "Clarify the age requirement". Never an agent's duty and an
//     age side by side ("Must explain how refunds work and be at least 21", "Able to explain how refunds work, at least 21": the
//     ninth review).
const TELL_VERB = String.raw`explain(s|ed|ing)?|remind(s|ed|ing)?|inform(s|ed|ing)?|advis(e|es|ed|ing)|warn(s|ed|ing)?|clarif(y|ies|ied|ying)|tell(s|ing)?|told`;
const TOLD_TO = String.raw`\b(${TELL_VERB})(\s+to)?\s+((the|a|an|each|every|our|their)\s+)?([\w-]+\s+)?(${CUSTOMER_PEOPLE}|parents?|them|him|her)\b|\blet(s|ting)?\s+(?!(us|me|hr)\b|(our|the|a)\s+(recruiters?|interviewers?|hiring|hr|team)\b)((the|a|an|each|every|our|their)\s+)?[\w'-]+\s+know\b`;
const TOLD_WHAT = String.raw`\b(${TELL_VERB})\s+(that|how|why|when|whether|what)\b|\b(${TELL_VERB})\s+(the|our|their|its|any)\s+([\w-]+\s+){0,2}?(age|rules?|polic(y|ies)|requirements?|restrictions?|limits?|eligibility)\b`;
const TOLD = new RegExp(String.raw`((${TOLD_TO})(?![^.]*(\band|,)\s*(be|are|is|have|has)\b)[^.]*|(${TOLD_WHAT})(?![^.,;]*\band\s+(be|are|is|have|has)\b)[^.,;]*)$`, "i");
// The fourteenth review: never a loan's, a scholarship's or a visa's applicant or interview, who are customers as APPLIED_PREFIX
// says ("…may I have your date of birth? Then walk the loan applicant through the next step", "…the date of their visa
// interview").
const TO_APPLICANTS = new RegExp(String.raw`\b(applicants?|candidates?|interview(s|ees?|ers?)?|job seekers?|new hires?)\b(?<!\b(${APPLIED_PREFIX})\s+(applicants?|interview(s|ees?|ers?)?))`, "i");
//   - when a benefit starts or ends: "Medicare starts at age 65", "You can enroll in Medicare at age 65", "Insurance rates go up
//     after age 50", "Your child can stay on your plan until age 26", "the age 26 rule for dependents" (the ninth: said to "you"
//     too, whatever the verb). Never "from age 21" ("Eligible from age 21", "Agents qualify from age 21": hiring limits), nor a
//     sentence with no benefit in it ("Eligibility starts at age 21", or a grader's "Led a team at age 19"). The benefit is
//     named before the age in its clause, right after it ("You qualify at age 60 for the senior rate"), or anywhere when the
//     age opens the clause ("At age 65, you can enroll in Medicare"; the tenth review: "We hire agents up to age 35 and offer
//     full benefits", "Start your career at age 18 with full benefits!" and "Hiring until age 35 only, with competitive rates"
//     passed). The eleventh: a benefit named earlier in the sentence counts too unless the age's own clause hires someone
//     (HIRES_HERE: "For Medicare, you're eligible at age 65" and "With Social Security, you can start at age 62" were dropped
//     by the comma; "With full benefits, we hire agents up to age 35" still goes, and a sentence naming applicants never has a
//     benefit's age: TO_APPLICANTS). The twelfth: the hiring words are the module's own (HIRING_LEAD, HIRING_CUE), not seven
//     ("With full benefits, we're looking for students up to age 25", "…we want people up to age 35", "…we accept reps up to
//     age 35" and "Full benefits from day one, but you must be up to 35 years old" passed); a want or a need is a hire only
//     when "we" have it ("For Medicare, you may want to wait until age 70" is a caller's), and "open to" stays a fare's.
//     The thirteenth: "we want" is never a hire for "you" signed up or enrolled ("For Medicare, we want you signed up before
//     age 65"; "…we want you to join us before age 30" still goes), and "must be" only right before the age ("you must be up
//     to 35 years old", never "you have to be signed up before age 65").
const BENEFIT_AT = /\b(at|after|before|until|till|up to|as early as|as late as)\s+$/i;
const HIRES_HERE = /\b(hir(e|es|ed|ing)|recruit\w*|employ(s|ed|ing)?|agents?|walk-?ins?|ideal(ly)?|preferabl[ey]|we(['’]re|['’]d| are| would| will)?\s+((also|only|now|currently|gladly|happily|actively|always)\s+)?(want|need|prefer|seek|seeking|looking for|accept|accepting|welcome|welcoming|take|taking)(?!\s+you\s+[a-z]+ed\b)|(must|needs? to|has to|have to) be(?=\s+(at|after|before|until|till|up to|as early as|as late as)\s*$))\b/i;
const BENEFIT = /\b(medicare|medicaid|social security|pensions?|retirement|plans?|coverage|covered|insurance|polic(y|ies)|rates?|premiums?|benefits?|discounts?|fares?|tickets?|pass(es)?|cards?|memberships?|prices?|fees?|tiers?|penalty|enrol\w*)\b/i;
const BENEFIT_NEXT = /^\s*\+?\s*((and|or)\s+(up|over|above|older)\s*)?(for|in|on|into)\s+((the|a|an|your|their)\s+)?([\w'-]+\s*){1,3}/i;
const AGE_FIRST = /^\s*[-•*]?\s*(at|after|before|until|till|up to|as early as|as late as)\s+$/i;
const RULE_AFTER = /^\s*rules?\b/i;
//   - what renting or an account needs: "To rent a car, you must be 21 or older", "You must be 18 or older to open an account".
const TO_RENT = /\bto (rent|open an? ([\w-]+ )?account)\b/i;
// A range of ages that a product is for, right after it: "Explain that you must be 18-25 to get the youth rate", "Tell the
// guest that you must be 18 to 25 for the youth hostel rate" (the tenth review). Never "to apply", "to join the team", "for
// the role" or "per company policy".
const FOR_A_PRODUCT = new RegExp(String.raw`^[^.]{0,30}?\b(to (get|qualify for|buy|book|use|enrol\w* in|sign up for)|for)\s+((the|a|an|our|this|that|their|its)\s+)?([\w'-]+\s+){0,2}?${JOB_PROGRAM}(rates?|fares?|discounts?|plans?|tickets?|pass(es)?|memberships?|cards?|tours?|camps?|classes?|coverage|insurance)\b`, "i");
// "Number of dependents" is the applicant's family on a form, and a customer's on a policy or a tax return ("Enter the number of
// dependents the caller wants covered", "Ask the client for the number of dependents on their tax return", "Update the number
// of dependents on the policy"): only when a customer or their file is named. The ninth review: "Number of dependents for HMO
// coverage", "Civil status and number of dependents (for tax and HMO):" and "Indicate the number of dependents you want covered
// by the company HMO" are the employer's own forms. The tenth: a filing, a household, Form 1040 and a plan or card the
// dependents are "covered under/on" are a customer's too ("Collect the number of dependents for the tax filing", "Verify the
// number of dependents for the household's coverage", "Record the number of dependents covered on the HMO card"). The
// eleventh: those are a customer's only when the form is not the reader's own ("your", "you want", "to be covered"), and a
// filing only as "the tax filing" or "filing status" ("Number of dependents in your household:", "Number of dependents to be
// covered under the HMO plan:" and "Number of dependents for tax filing purposes:" passed).
const NUMBER_OF_DEPENDENTS = /\bnumber of (children|dependents)\b/i;
const CUSTOMER_FILE = new RegExp(String.raw`\b(${CUSTOMER_PEOPLE}|insured|(the|their|each) (polic(y|ies)|accounts?|(tax )?returns?|claims?))\b`, "i");
const CUSTOMER_FORM = /\b((the|their|each|a) (tax )?filings?|filing status|households?|form 1040|covered (under|on) (the|their|each) (?!company\b)([\w-]+ )?(plans?|cards?|polic(y|ies)))\b/i;
const READERS_OWN = /\b(your|you\s+(want|wish|would like)|you['’]d like)\b|\bto be covered\b/i;
// The twelfth review: the reader's own is a form, not what a tax or subsidy desk explains to "you" ("Your refund depends on
// your filing status and the number of dependents you claim", "The tax credit depends on the number of dependents in your
// household"), and a bare label is the employer's form whoever's household or filing it names ("Number of dependents in the
// household:", "Filing status and number of dependents:", as on a W-4).
const DESK_EXPLAINS = /\b(depends? on|depending on|affects?|determines?|(is|are) based on|explain\w*)\b/i;
// The thirteenth review: a desk explains money or eligibility, so the verb alone excused a question put to the applicant about
// their own family ("Does the number of children in your household affect your availability for night shifts?", "Briefly
// explain your household situation, including the number of children you have").
const DESK_TOPIC = /\b(refunds?|tax(es)?|credits?|premiums?|subsid(y|ies)|benefits?|coverage|covered|filing status|deductions?|allowances?|eligib\w*|costs?|prices?|payments?|fees?)\b/i;
// …and a bare label is the employer's only when it stands alone, as an application question does: in an item that names a
// customer or their file it is that customer's intake ("A caller asks why her refund went down. Complete her intake:\n-
// Filing status and number of dependents:"; withoutAgeAsks reads a practice case whole, and the line was read on its own).
// The fourteenth review: a practice case names its customer by name as often as by a word ("Maria Santos asks why her refund
// went down", "Mr. Reyes renews his SNAP benefits", "A mother of two asks why her credit changed"), so her, his or their file
// names one too.
const THEIR_FILE = /\b(her|his|their)\s+([\w-]+\s+)?(refunds?|returns?|credits?|subsid(y|ies)|benefits?|polic(y|ies)|claims?|accounts?|plans?|intake|coverage|premiums?)\b/i;
const THEIR_FILES = new RegExp(THEIR_FILE.source, "gi");
// An employer's own form, whose "their benefits" are the hire's (asksAgeOrStatus).
const HIRING_FORM = /\b(applicants?|candidates?|(new )?hires?|employees?|onboarding|payroll|pre-employment|application (questions?|forms?))\b/i;
const DEPENDENTS_LABEL = /^\s*[-•*]?\s*(([\w-]+\s+){0,2}(status|size|income)\s*(,|\/|&|\band\b)\s*)?(the\s+)?(number|no\.?)\s+of\s+(children|dependents)\b[^.?!:]{0,60}:\s*[_.…]*\s*$/i;
// Speech an agent puts to a customer: quoted ('Greet the caller and ask, "May I have your date of birth?"', 'Ask the member, "Do
// you have dependents on your policy?"', 'Say: "For security, please tell me your date of birth."': the identity check the
// medical guide tells a business to test), after a script's colon ("Say: For security, please confirm your date of birth.") or
// asked of a named customer ("Ask the policyholder whether they are married or single"; the ninth review). It is the customer's
// when the line names a customer or a check (security, confirming, a chart, an account), never when it is put to the applicant
// ('Ask the candidate: "How old are you?"', 'Start the interview by asking, "Can you confirm your date of birth?"'), and never
// an HR ask "for our records", "for your file" or "for the HMO policy" (the ninth review). The tenth review:
//   - after a script's colon, unquoted, the listener could be anyone, so it is a customer's only as a plain identity check: the
//     line names a customer or a check (security, identity, "thanks for calling", an account, a chart; "confirm" or "verify"
//     alone is not enough), is not put to an applicant ("thanks for applying"), and asks nothing but a date of birth. "Ask: How
//     old are you? Are you single? Let me confirm your schedule.", "Script: Hi, thanks for applying! Can you confirm your date
//     of birth?" and "In your video, say: your name, your age, where you live, and confirm your internet speed." passed;
//   - "your policy" is a customer's ('Ask: "May I have your date of birth so I can find your policy?"'), and in quotes so is
//     the customer's own file ("…to locate your file", "…to update your records", "…and update the policy record"), but only
//     for a date of birth: 'Ask: "How old are you? I need it for your file."' and "our records" stay HR's.
// The eleventh review:
//   - a quote inside the rest of a script's line is read as a quote first, and is a customer's when its sentence names one
//     ('Say: Thanks for calling Medicare Help. Then ask the caller, "Are you 65 or older?"': the rest of the line was read as
//     one unquoted ask, and both earlier rounds kept it);
//   - the customer's own file is a customer's only when nothing on the line says the listener is an applicant
//     ('Say: "Thanks for applying! What is your date of birth? I will add it to your file."', 'Recruiter script: "May I
//     have your date of birth to update your records?"' passed), and an unquoted script only when nothing from its label's
//     sentence on does ("Phone screen script: Hi, thanks for your interest in the job. For security, may I have your date of
//     birth?" passed; "Candidates role-play this call. Say: Thank you for calling Bright Clinic. For security, may I have
//     your date of birth?" names its caller's check and stays). A quote that names a customer or a check stays as before.
//     The twelfth review narrowed what says so, and where it is read (applyingForAJob, below).
const QUOTES = String.raw`"([^"\n]{1,400})"|“([^”\n]{1,400})”|‘([^’\n]{1,400})’|(?<=^|[\s:,(])'([^\n]{1,400}?)'(?=[\s.,;:!?)]|$)`;
const QUOTED = new RegExp(String.raw`${QUOTES}|(?<=\b(say|script|ask|opener|opening|greeting)\s*:\s*)([^"“‘'\s][^\n]{0,399})$|(?<=\bask(s|ed|ing)?\s+((the|a|an|each|every|this|that)\s+)?([\w-]+\s+)?(${CUSTOMER_PEOPLE})\s+(whether|if)\s+)([^.;!?\n]{1,400})`, "gi");
const QUOTE_INSIDE = new RegExp(QUOTES, "g");
const SPEECH_BEFORE = /\b(ask|asks|asked|asking|say|says|said|saying|tell|tells|telling|greet|greets|greeting|reply|replies|replying|respond|responds|responding|answer|answers|answering|confirm|confirms|confirming|verify|verifies|verifying|request|requests|requesting|script|line|opener|opening)\b[^"“”‘’]{0,40}$/i;
const CHECK = String.raw`security|secure|identity|identif\w*|charts?|accounts?|your polic(y|ies)|portal|look (it |them )?up|pull (it |them )?up|before sharing|results|(thanks|thank you) for calling`;
const FOR_A_CUSTOMER = new RegExp(String.raw`\b(${CUSTOMER_PEOPLE}|parents?|guardians?|confirm\w*|verif\w*|${CHECK})\b`, "i");
const PLAINLY_A_CUSTOMER = new RegExp(String.raw`\b(${CUSTOMER_PEOPLE}|parents?|guardians?|${CHECK})\b`, "i");
const NAMES_A_CUSTOMER = new RegExp(String.raw`\b(${CUSTOMER_PEOPLE}|parents?|guardians?)\b`, "i");
// A caller's check inside a quote. The fourteenth review read "Are you the policyholder?" here too, now that a customer word in
// a quote counted for nothing; the fifteenth counts that word again (customersQuote), and adds a service's own script ('Customer
// service script: "Hi, welcome to Bright Medicare! Are you 65 or older?"', "Patient care script:"), whose customer word the
// job's reading (SERVICE_WORK) took, and a "confirm" or a "verify" of what only a customer has: their filing status, a
// senior's or a member's discount, a premium, a fare, ranked play ("To verify your senior discount, are you 60 or older?"),
// never "your civil status", "your availability" or "your employee discount". The sixteenth review:
//   - those topics in their ordinary wordings too ("your senior citizen discount", "the senior discount", "your PWD or senior
//     discount", "your youth fare", "your insurance premium", "your tax filing status", "your Medicare eligibility", "you can
//     rent the car", "you can buy gems": the reviewer's trial), never a hire's own pay or payroll ("your premium pay for night
//     shifts", "your fare allowance", "your filing status for payroll" or "on your W-4", "your member discount as a new
//     employee"), "your shift premium" or "your eligibility for the role";
//   - a desk greeting its caller by the service's own name ("Thanks for contacting customer support!", "Welcome to member
//     support!", "Thank you for contacting the patient care line.", "Hi, this is Ana from customer care."), whose customer word
//     SERVICE_WORK took as it took the script label's, never a job, an interview or a team welcoming a hire ("Welcome to the
//     customer support team", "Welcome to your Customer Support interview").
// The seventeenth review:
//   - a hire's own plan and tax are not the topic either ("your insurance premium for the company HMO", "your health premium
//     under our HMO", "your tax filing status with BIR" or "for your payslip", "the discount for staff"), nor a topic checked
//     after welcoming a hire ("Welcome to the team! To confirm your tax filing status, …");
//   - the job, the interview or a job application named anywhere in the rest of the quote makes the greeting HR's ('"Hi, this
//     is Ana from customer care. Do you have a minute to talk about the job? How old are you?"', "…patient support! Before we
//     start the interview, …", "…We read your application."): only the greeting's own sentence was read, and the usual phone
//     screen names the job in the next one. Never a loan's or a card's application ("your application for the card").
// The eighteenth review: three of those went past the cases that justified them, so each was narrowed back to them:
//   - the HMO, the withholding and employees standing alone read a customer's own plan as a hire's ("your premium for the
//     HMO plan", "your senior discount with the HMO", "your filing status for withholding", "your discount for employees of
//     partner companies"; "HMO" is the plan type of "Medicare Advantage HMO" and the Philippines' word for a health plan):
//     a hire's HMO is the company's, the employer's, the staff's, the team's or "our HMO" on its own, as in the seventeenth
//     round's cases ("for the company HMO", "under our HMO, …"), never "our HMO plan" or "our HMO partner";
//   - a welcome to a team read a desk's own greeting ("Welcome to our pharmacy team's refill line!", "Welcome to the Bright
//     Games team chat!"): only a welcome that ends at the team, as "Welcome to the team!" does;
//   - the rest of the quote's "role" read a game's ("Which role do you play?", "your ranked role"), and its application a
//     benefit's ("Your benefits application is in", "your application for the senior discount"): a role only as "the … role"
//     ("the front desk role"), and never an application for what THANKS_FOR_APPLYING already reads as no job.
const DISCOUNT_FOR = String.raw`senior(\s+citizens?)?|student|member|youth|military|loyalty|pwd|child|veterans?`;
const ONLY_A_CUSTOMERS = String.raw`(your|the)\s+(((${DISCOUNT_FOR})(\s+or\s+(${DISCOUNT_FOR}))?\s+)?discount|((insurance|monthly|annual|yearly|policy|plan|health|life|medicare)\s+)?premium|((youth|student|senior|child|reduced|discounted|concession)\s+)?fare|(tax\s+)?filing status|(medicare|medicaid)\s+eligibility)\b(?!\s+(pay|allowance|differential)\b|\s+(for|on|in|under|with|through|via)\s+(((your|the|our|a)\s+)?(((company|employer|staff|employee|group|corporate)\s+)?(payroll|payslips?|pay\s?slips?|w-?4|employment|bir|staff)|(company|employer|staff|employee|group|corporate|team['’]s)\s+hmo)\b|our\s+hmo\b(?![\s-]*\w))|\s+as\s+(an?|our)\s+(new\s+)?(employee|hire|staff|team member)\b)|you\s+(can|may|are able to)\s+(play\s+ranked|rent\s+(the|a|this|your)\s+(car|vehicle)|buy\s+(the\s+)?(gems|coins|credits))`;
// The welcome and the rest of the quote are each read for at most a quote's 400 characters, the welcome only where a
// "confirm" or a "verify" starts, so a long frame stays fast.
const WELCOMES_A_HIRE = String.raw`(?=confirm|verif)(?<!\bwelcome\s+to\s+(the|our)\s+([\w'’&-]+\s+){0,2}?team\s*[!.,;][^"“”]{0,400})`;
// What one applies for that is no job (THANKS_FOR_APPLYING, JOB_TALK). The fifteenth review: SNAP too ('"Thanks for applying
// for SNAP. For security, are you 60 or older?"').
const APPLYING_FOR_A_BENEFIT = String.raw`${APPLIED_FOR}|medicare|medicaid|social security|snap|benefits?|plans?|coverage|insurance|assistance|discounts?|rewards?|loyalty`;
const JOB_TALK = String.raw`interviews?|jobs?|(the|this|that|our)\s+([\w&'’-]+\s+){0,3}?roles?\b|vacanc(y|ies)|hiring|recruit\w*|(?<!\b(${APPLIED_PREFIX}|${APPLYING_FOR_A_BENEFIT})\s+)applications?\b(?!\s+for\s+((an?|the|your|our|this)\s+)?([\w-]+\s+){0,2}?(${APPLYING_FOR_A_BENEFIT})\b)`;
const NOT_A_DESK = String.raw`(?![^.?!]*\b(interviews?|screens?|screening|roles?|jobs?|positions?|openings?|vacanc(y|ies)|posts?|training|hiring|recruit\w*|applications?|assessments?)\b|[^"“”]{0,400}?\b(${JOB_TALK}))`;
const SERVICE_GREETING = String.raw`\b(((thanks|thank you) for (contacting|reaching out to|messaging|writing to|chatting with|calling)|(this is|i['’]?m|i am)\s+[\w'’-]+\s+(from|with|at))\s+((the|our)\s+)?([\w'’&-]+\s+){0,2}?(customer|client|patient|member|user|caller|guest|player)\s+(service|support|care|success|relations|help)\b${NOT_A_DESK}|welcome to\s+((the|our)\s+)?(?!your\b)([\w'’&-]+\s+){0,2}?(customer|client|patient|member|user|caller|guest|player)\s+(service|support|care|success|relations|help)\b(?![\s-]+teams?\b)${NOT_A_DESK})`;
const A_CHECK = new RegExp(String.raw`\b(${CHECK})\b|\b(customer|client|patient|member|caller|guest|player)\s+(service|support|care)\s+(scripts?|repl(y|ies)|greetings?|openers?)\b|${WELCOMES_A_HIRE}\b(confirm\w*|verif\w*)\s+(that\s+)?(${ONLY_A_CUSTOMERS})\b|${SERVICE_GREETING}`, "i");
const CUSTOMERS_OWN_FILE = /\b(your (files?|records?)|polic(y|ies) (records?|files?|numbers?))\b/i;
// The listener is an applicant: the words TO_APPLICANTS reads, "thanks for applying" (never for a card or a loan: "Thanks for
// applying for the Bright Card!"), "your interest in the role", a phone screen, a recruiter, HR. Never "your application"
// alone: a loan, visa or permit desk calls about "your application" too.
// The twelfth review: those words are also a front desk's, read anywhere on a script's line ("If they ask about jobs, transfer
// them to HR", "If you need HR, press 9", "Thank you for calling PayEasy HR support", "our 24-HR pharmacy line", "your cracked
// phone screen", "your interest in joining our clinic as a new patient", "Thanks for applying for Medicare"), so each is read
// only where it says the one spoken to is applying for a job:
//   - thanks for applying, never for a card, a loan, Medicare, benefits, a plan or a discount (unless that is a job's title:
//     "Thanks for applying for our benefits coordinator role");
//   - an interest in joining the team or the company, in working for or at it, or in the role, never in joining a plan, a
//     clinic or a gym, nor in working with a home care agency;
//   - a phone screen, never a phone's screen ("your cracked phone screen", "the phone screen is cracked", "the phone screen
//     claim");
//   - HR or a recruiter as the one calling: a script's label ("HR script", "Recruiter call") or "this is Ana from HR", never
//     a department to send someone to, a business, a help line or an hour, nor on a call the listener made ("Thank you for
//     calling, this is Ana from HR": an HR desk's own caller);
//   - and only up to the ask (upToTheAsk): what follows it is a note about someone else ("…may I have your date of birth? If
//     they ask about jobs, transfer them to HR", "(Calls about a phone screen go to HR.)").
// The thirteenth review: the usual ways HR introduces itself fell outside those closed forms ("I'm Ana, a recruiter at Bright
// Clinic", "Ana here from HR", "this is Ana from Bright Clinic's HR team", "Welcome to your phone screen", "Thanks for applying
// for the Coverage Specialist post"), and an HR desk's own callback and a rewards program read as hiring ("this is Ana from HR
// returning your call", "Thank you for holding, this is Ana from HR", "Thanks for applying for our rewards program").
// The fourteenth review: a job's title runs longer and takes an "&" ("Thanks for applying for our Rewards & Loyalty
// Specialist position", "…our Medicare Advantage Sales Agent role"), and "Welcome to your chat interview" is HR's as "Welcome
// to your phone screen" is (never "your visa interview").
// The fifteenth review: SNAP too (APPLYING_FOR_A_BENEFIT, above).
const JOB_WORDS = String.raw`roles?|jobs?|positions?|openings?|vacanc(y|ies)|posts?`;
const THANKS_FOR_APPLYING = String.raw`\b(thanks|thank you) for applying\b(?!\s+for\s+((an?|our|the|their|its|this|your)\s+)?([\w-]+\s+){0,2}?(${APPLYING_FOR_A_BENEFIT})\b(?![\s-]+([\w&-]+\s+){0,4}?(${JOB_WORDS})\b))`;
const APPLYING = new RegExp(String.raw`${THANKS_FOR_APPLYING}|\binterest in (joining (us\b|((the|our|this)\s+)?([\w-]+\s+){0,2}?(team|staff|company|crew)\b)|working (for|at)|(the|this|our)\s+([\w-]+\s+){0,3}?(role|job|position|opening|vacancy))\b|(?<!\b(your|my|his|her|their|its|cracked|broken|shattered|damaged|scratched|smashed|new|replacement|spare)\s+)\bphone[\s-]screen\b(?!\s+(protectors?|repairs?|replacements?|guards?|glass|cracks?|damage|claims?|insurance|warrant(y|ies)|coverage|is|was|has|got|broke|cracked)\b)|\bwelcome to your ((chat|phone|video|voice|online|written|job)\s+)?(phone[\s-]screen|interview)\b`, "i");
// The fourteenth review: never one who recruits customers ("Hi, I'm Ana, a patient recruiter with Bright Research", "…a study
// recruiter", "…an enrollment recruiter at Bright College"), now that a customer word in a quote no longer outweighs applying.
// The fifteenth: never a clinical recruiter, a hospital's own HR title ("Hi, I'm Ana, a clinical recruiter at Bright Hospital").
// The sixteenth: unless the study is named after it, as a study's own recruiter ("the clinical recruiter for the Bright
// Research diabetes study"). The seventeenth: only a study or a trial named, as the sixteenth round's cases did, never a
// "research" in the business's name ("a clinical recruiter at Bright Medical Research Center" is its HR).
const STUDY_RECRUITER = String.raw`clinical\s+recruiters?\s+(for|with|on|at|of)\s+((the|an?)\s+)?([\w'’-]+\s+){0,4}?(study|studies|trials?)\b`;
const RECRUITER_CALLS = new RegExp(String.raw`(?<![\d/][\s-]*)\b(hr|human resources|recruiters?|recruiting|recruitment)\s+(script|call|screen(ing)?|interview)s?\b(?![\s-]+(cent(er|re)s?|lines?|queues?|desks?)\b)|\b((this is|i['’]?m|i am)\s+([\w'-]+\s+){0,2}?|[\w'-]+\s+here\s+)(from|with|in)\s+(the\s+|([\w-]+\s+){0,2}?[\w-]+['’]s\s+)?(hr|human resources|recruiting|recruitment)\b(?!\s+(support|benefits?|help ?desk|helpline|lines?|portal|services?|hotline|desk)\b)|\b(this is|i['’]?m|i am)\s+(?!(sorry|afraid|not)\b)([\w'-]+,?\s+){0,2}?(an?|the|your)\s+((?!(${CUSTOMER_PEOPLE}|participants?|study|trial|research|enrol+ment|admissions?|students?|${STUDY_RECRUITER})\b)[\w-]+\s+)?recruiters?\b`, "i");
// An HR desk's own caller: one who called in, and since the thirteenth review one it puts on hold or calls back, unless that
// call is about a job or comes from recruiting ("Hi, this is Ana from recruiting returning your call"). The fourteenth: the
// job is read anywhere before the ask, for the hold as for the callback ("Thank you for holding, this is Ana from HR. I see you
// applied for our Coverage Specialist role.", "…returning your call regarding the Coverage Specialist position"); only
// "returning your call about the …" was read. The fifteenth: never what an HR desk's own caller applied for or asks about,
// leave or a loan and their job title ("You applied for parental leave last week", "…your leave application", "I see you asked
// about your job title on your payslip"). The sixteenth: never a job whose title starts with one ("You applied for Loan Officer
// last week", "…for Leave Administrator").
const AGENT_TITLES = String.raw`representatives?|reps?|coordinators?|specialists?|agents?|associates?|advocates?|advisors?|officers?|assistants?|leads?|supervisors?|managers?|navigators?|liaisons?`;
const LEAVE_OR_LOAN = String.raw`(leave|loans?)\b(?![\s-]+(${AGENT_TITLES}|administrators?|processors?|analysts?|clerks?|underwriters?|consultants?|${JOB_WORDS})\b)`;
const HR_DESK_CALL = new RegExp(String.raw`\b(thanks|thank you) for calling\b|^(?!.*\b(recruit\w*|(applied|applying)\b(?!\s+for\s+((an?|the|your|their|his|her)\s+)?([\w-]+\s+)?${LEAVE_OR_LOAN})|(?<!\b(leave|loan)\s+)applications?\b|jobs?\b(?!\s+titles?\b)|(roles?|positions?|openings?|vacanc(y|ies)|posts?)\b)).*\b((thanks|thank you) for holding|returning your (call|message))\b`, "i");
function applyingForAJob(text: string): boolean {
  return APPLYING.test(text) || (RECRUITER_CALLS.test(text) && !HR_DESK_CALL.test(text));
}
// The words that say the one spoken to is applying wherever a script says them: those naming applicants and "thanks for
// applying", read to the end of an unquoted script's line as the tenth round read them (the thirteenth review: "…may I have
// your date of birth? Then begin the interview.", "…? Thanks for applying!"). HR, a recruiter, a phone screen and an interest in
// joining are also a front desk's note after the ask, so they are read only up to it. The fourteenth review: "the candidate
// must…" is the agent a practice case describes, not the one spoken to ("…may I have your date of birth? The candidate must not
// share results until the identity check passes"). The fifteenth: never when what they must do is give the answer asked for
// ("…may I have your date of birth? The candidate must provide it for our HR records", "The applicant must answer before we
// continue the screening"). The sixteenth: what the agent does with the answer is still the agent's ("The candidate must state
// it back to the caller", "…enter it in the patient chart", "…give their reply within 30 seconds", "…answer within 2
// minutes"): "their", "his", "her" or "your" only before what was asked. The seventeenth: never the hiring's own form or
// system ("The applicant must enter it on the application form").
const GIVES_THE_ANSWER = String.raw`\s+(provide|give|share|state|submit|send|enter|tell us)\s+((it|this|that)\b(?!\s+(back\s+)?(to|with)\s+((the|a|an|each|every|their)\s+)?([\w-]+\s+)?(${CUSTOMER_PEOPLE})\b|\s+(in|into|on)\s+((the|a|an|their)\s+)?((?!(applications?|applicants?|candidates?|hiring|jobs?|employment|hr|onboarding|recruit\w*)\b)[\w-]+\s+)?(charts?|systems?|records?|notes?|forms?|accounts?|crm|tickets?)\b)|(their|his|her|your)\s+(own\s+)?(date of birth|birth ?date|birthday|dob|d\.o\.b|age|details|information|info)\b)|\s+answer\b(?!\s+(the|a|an|their|his|her|each|any|every|all|within)\b)`;
const SPOKEN_TO_AN_APPLICANT = new RegExp(String.raw`${TO_APPLICANTS.source}(?!(?<=\bthe\s+(candidate|applicant))\s+(must|should|shall|needs? to|has to|is to|may not|cannot|can['’]?t)\b(?!${GIVES_THE_ANSWER}))|${THANKS_FOR_APPLYING}`, "i");
const BIRTH_DATE = /\b(date of birth|birth ?date|birthday|dob|d\.o\.b\.?)(?=\W|$)/gi;
// What an identity check never asks, named or listed ("your date of birth and civil status" is read for its date of birth).
const NOT_AN_IDENTITY_CHECK = /\b(age|ages|aged|how old|years? old|civil status|marital status|married|single|divorced|widowed|separated|pregnan\w*|kids|children(?!['’])|dependents)\b/i;

/** The text up to the end of the sentence that asks a date of birth (all of it when none does). */
function upToTheAsk(text: string): string {
  const at = text.search(BIRTH_DATE);
  if (at < 0) return text;
  const end = text.slice(at).search(/[.!?]["”’']?(\s|$)/);
  return end < 0 ? text : text.slice(0, at + end + 1);
}

/** True when the speech asks nothing but a date of birth (an identity check), whatever else it says. */
function asksOnlyBirthDate(speech: string): boolean {
  return !NOT_AN_IDENTITY_CHECK.test(speech) && !sentencesOf(speech.replace(BIRTH_DATE, "name")).some((sentence) => sentenceAsks(sentence, () => CUSTOMER_FILE.test(speech)));
}

// "Fresh graduates only, customer service training" names the job, not a customer; so do "customer chats" (sentenceAsks), and
// since the fourteenth review the job named outside a quote ('Opening message for the Customer Support role: "…"').
const SERVICE_WORK = /\b(customer|client|patient|member|user|caller|guest|player)\s+(service|support|care|success|experience|chats?|calls?|emails?|tickets?|complaints?|questions?|accounts?|issues?|quer(y|ies)|orders?|data|records?|inquir(y|ies)|requests?|satisfaction|feedback|needs|relations|portal|information|details|concerns|interactions?|facing)\b/gi;
// …never a customer doing something, opening a clause outside the quote ("A client calls about her refund. Ask: …", "When a
// customer calls, say: …", "A customer orders wine."; the sixteenth review: SERVICE_WORK read the verb as the work), as
// against the work itself ("Answer the customer calls"). The seventeenth review: never before or until one calls ('Before a
// customer calls, ask: "Are you married?"' is asked of someone else). The eighteenth: that took "before" from every verb,
// and before a customer orders she is there to be asked ('Before a customer orders wine, ask: "Are you 21 or older?"', an
// alcohol delivery desk's own check), so "before" is read again for an order.
const A_CUSTOMER_DOES = /((?:^|[.!?;:,(]|\b(?:when|if|once|after|while|as|whenever)\b|\bbefore\b(?=[^.!?;:,(]*?\borders\b))\s*)(an?|the|this|that|one|another|each|every)\s+(([\w'-]+\s+){0,2}?)(customer|client|patient|member|user|caller|guest|player)\s+(?=(calls|chats|emails|orders|requests|questions|needs)\b)/gi;
const outsideTheQuote = (text: string) => text.replace(A_CUSTOMER_DOES, "$1$2 $3$5 who ").replace(SERVICE_WORK, "service work");

// What in a quote names the job or the applicant rather than the one spoken to (customersQuote; the fifteenth review). Each is
// read in its own shape, since the same customer word is a customer's in every other one.
const WHO = String.raw`${CUSTOMER_PEOPLE}|parents?|guardians?`;
// A customer's own record is theirs, never the job's work ("Let me update your member records", "your patient information").
// The sixteenth review: "your member portal" and "your customer account" are a caller's check already (CHECK reads "portal"
// and "account" wherever they are), so this reads them no more: no line was read otherwise, and no check could pin them.
const YOUR_RECORD = /\byour\s+(customer|client|patient|member|user|caller|guest|player)\s+(records?|information|details|data)\b/gi;
const NOT_THE_LISTENER = re([
  // The business's own clientele described ("Our callers are mostly parents", "Most of our callers are seniors", "Our clients
  // like to know"), never a customer addressed as one of them ("Are you one of our members?", "For our senior members, …",
  // "our patient program") or told a rule ("Our players under 18 need a parent's consent", "Our members get a discount at 65",
  // "…are eligible at 65").
  String.raw`\b(our|their|those|these|many|most|other)\s+([\w-]+\s+)?(${WHO})\s+(are|is|were|was|will|would|often|usually|mostly|generally|typically|always|tend|like|love|expect|want|prefer|value|come|live|speak|call|write|chat|ask)\b(?![^.?!]*(\d|\b(need|needs|must|can|may|get|gets|qualif\w*|eligib\w*|consent|discounts?|rates?|plans?|add|enrol\w*|join|apply)\b))[^.?!]*`,
  // The work described: "angry customers", "How many callers can you handle?", "the customers you will serve".
  String.raw`\b(angry|upset|difficult|irate|demanding)\s+([\w-]+\s+)?(${WHO})\b`,
  // The applicant's own experience, said of "you" ("Have you handled angry customers?", "a time you helped a customer", "Do
  // you enjoy helping customers?"), never what the business does for its customers ("We help members over 65 choose a plan")
  // nor what a caller is doing now ("Are you helping a family member with the account?"). The sixteenth review: an interview
  // question's own shapes too ("Why do you want to work with customers?", "Are you comfortable speaking with customers on the
  // phone?", "Do you have experience with customers?", "Tell me about a time you went above and beyond for a customer"), never
  // a caller's own experience ("How was your experience with our member line?"). The seventeenth review: "want to" only
  // before working with them, as the sixteenth round's "Why do you want to work with customers?" ('"Do you want to help a
  // member of your household enroll?"' is a caller's), never "the experience with our member line" ("Sorry about…"), and "Tell
  // me about a time…" only, as the sixteenth round's cases asked: a desk asks its own caller to describe, share or recall one
  // too ("Can you describe a recent time you were overcharged as a member?", "Please share an example of a time our member
  // line kept you waiting"). The eighteenth review: that let the interview's own "Why do you want to help customers?" and
  // "Describe a time a customer was angry with you" through, so "want to" is read before any of the verbs after "why", and
  // describing, sharing or recalling a time is read where the time is a customer's, as in the sixteenth round's "Tell me
  // about a time a customer was unhappy with you" (never "a time you were overcharged as a member").
  String.raw`(?<!\bare\s+)\b(you(['’]ve|['’]d|['’]ll)?|ever|experience)\s+((have|had|ever|already|previously|often|really|also|enjoy|like|love|been|be|will|would|can|could|must|should|get to)\s+|(want|wanted)\s+to\s+(?=work)|(?<=\bwhy\b[^.?!]{0,20})(want|wanted)\s+to\s+){0,2}(handl(e|es|ed|ing)|work(s|ed|ing)?\s+with|serv(e|es|ed|ing)|help(s|ed|ing)?|deal(s|t|ing)?\s+with|support(s|ed|ing)?|assist(s|ed|ing)?|calm(s|ed|ing)?|manag(e|es|ed|ing)|talk(s|ed|ing)?\s+(to|with)|spok(e|en)\s+(to|with)|speak(s|ing)?\s+(to|with))\s+([\w-]+\s+){0,2}?(?<!\bfamily\s+)(${WHO})\b(?!\s+([\w&-]+\s+)?(${AGENT_TITLES})\b)`,
  String.raw`\byou(['’]re| are)?\s+((really|also|very|always|quite)\s+)?(good|great|comfortable|confident|experienced|skilled)\s+((at|in)\s+)?((speaking|talking|working|dealing|chatting|interacting)\s+)?(with|to|around)\s+([\w-]+\s+){0,2}?(?<!\bfamily\s+)(${WHO})\b(?!\s+([\w&-]+\s+)?(${AGENT_TITLES})\b)|(?<!\b(your|the|this|that)\s+)\bexperience\s+(with|in|around)\s+([\w-]+\s+){0,2}?(?<!\bfamily\s+)(${WHO})\b(?!\s+([\w&-]+\s+)?(${AGENT_TITLES})\b)`,
  String.raw`\btell (me|us)( more)? about\s+(a|an|one)\s+((recent|specific|past|difficult|hard|tough|memorable)\s+)?(time|situation|moment|occasion|day|example)\b[^.?!]*|\b(describe|share|recall|give (me|us) an example of)\s+(a|an|one)\s+((recent|specific|past|difficult|hard|tough|memorable)\s+)?(time|situation|moment|occasion|day)\s+(when\s+)?(a|an|the)\s+([\w-]+\s+)?(${WHO})\b[^.?!]*`,
  // "How many callers can you handle an hour?"; never a desk's own "How many members do you have on your plan?" (the sixteenth
  // review). The seventeenth: the sixteenth round read only a list of verbs right after "you", so "How many customers do you
  // think you can handle in a shift?", "…did you resolve per shift…" and "…did you check in per day?" read as a desk's; as the
  // fifteenth round read it, any "how many customers did / can you…" is the work again, but for the desk's own count of who
  // is on a plan, a policy, an account or in a household ("…do you have on your plan?", "…do you want to add to your plan?").
  // The eighteenth review: a desk counts a party, a booking and who will enroll too ("How many guests do you have in your
  // party?", "How many passengers do you have on the booking?", "How many members do you want to enroll?").
  String.raw`\bhow many\s+(${CUSTOMER_PEOPLE})\s+(do|did|can|could|will|would|have)\s+you\b(?!\s+((currently|already|now|still)\s+)?((want|need|wish|plan|would like|like)\s+to\s+enrol\w*\b|(have|want to add|need to add|wish to add|plan to add|would like to add|like to add|want to cover|need to cover)\b[^.?!]*\b(plans?|polic(y|ies)|accounts?|households?|famil(y|ies)|coverage|memberships?|party|parties|bookings?|reservations?)\b))`,
  String.raw`\b(${CUSTOMER_PEOPLE})\s+(that\s+|who\s+)?you(['’]ll|['’]d| will| would)?\s+((also|be|mostly|often)\s+){0,2}(serve|serving|help|helping|support|supporting|handle|handling|talk|talking|speak|speaking|work|working|assist|assisting|answer|answering|chat|chatting)\b`,
  // The job's title, with the job named or applied for ("the Customer Service Representative role", "your application for
  // Patient Coordinator"), and an agent's own title as the fourteenth round read it ("Hi, I'm Ana, your Patient Coordinator"),
  // never the agent a customer is sent to ("Let me connect you with a member specialist").
  String.raw`\b(${CUSTOMER_PEOPLE})\s+([\w&-]+\s+){0,3}?(roles?|positions?|jobs?|openings?|vacanc(y|ies)|post)\b|\b(appl(y|ying|ied)|applications?)\s+(for|to be|as)\s+((the|our|a|an)\s+)?(${CUSTOMER_PEOPLE})\s+([\w&-]+\s+){0,2}?(${AGENT_TITLES})\b`,
  String.raw`\b(i['’]?m|i am|this is|my name is)\s+([\w'-]+,?\s+){0,2}?your\s+(${CUSTOMER_PEOPLE})\s+([\w&-]+\s+){0,2}?(${AGENT_TITLES})\b`,
  // "A patient person", the team's own members.
  String.raw`\bpatient\s+(person|people|listener|man|woman)\b|\b(team|staff|crew)\s+members?\b|\bmembers?\s+of\s+(the|our|this|a)\s+([\w-]+\s+){0,2}?team\b`,
], "gi");
// The speaker's own age in the first person, as a self-introduction gives it ("Hi, I'm Ana, 24 years old", "I'm 24 and…",
// "My name is ___, ___ years old", "I am [Age] years old", "my age is ___"; customersQuote). The seventeenth review: a customer
// gives her age in the first person too, in the message the agent answers ('Reply to this chat: "I'm 70 years old and can't
// log in to my account."', the owner's own 'Hi, I'm 15 years old and I bought gems with my mom's card…'), so it is never read
// in a message replied to (ANSWERS_A_MESSAGE), after a sentence naming the case's customer, or where the speaker names her
// own account, portal, policy, bill, card, order or booking (A_CUSTOMERS_OWN), which no self-introduction the sixteenth round
// read did ("I have handled US accounts" is the work, never "my account"). The eighteenth review: a BPO agent's own
// introduction names her campaign "my account" too ('"Good day! My name is ___, ___ years old. My previous account was a US
// telco."', "my current account is a US bank"), so an account that was or is the speaker's previous, current or last one
// is never a customer's own; and a message replied to that the label gives to the hiring side ('Reply to the recruiter's
// message: "Hi, I'm ___, ___ years old…"') is the speaker's own introduction again (NOT_A_CUSTOMERS_MESSAGE).
const A_CUSTOMERS_OWN = /\bmy\s+(?!(previous|current|last|past|former|prior|first|old|recent|latest|present)\s+accounts?\b)([\w'’-]+\s+){0,2}?(accounts?|portal|polic(y|ies)|bills?|billing|cards?|orders?|bookings?|reservations?|subscriptions?|memberships?|claims?|refunds?|payments?|charges?|appointments?|prescriptions?|deliver(y|ies)|packages?|statements?|balance|loans?|coverage|medicare|medicaid)\b/i;
const OWN_AGE = new RegExp(String.raw`\b(i['’]?m|i am|my name is)\s+(([\w'’.-]+|\[[^\]\n]{0,20}\]|\{[^}\n]{0,20}\})(\s+[\w'’.-]+)?\s*,\s+)?((\d{2}|_{2,}|…|\[[^\]\n]{0,20}\]|\{[^}\n]{0,20}\})\s*((years?|yrs?)[\s-]*old|y\/o)\b|\d{2}\s*(,|\band\b|[.!?]|$))|\bmy\s+(age|birth ?date|date of birth|birthday)\s*(is|:)`, "i");
// The work described to someone applying: what "we", the team, its agents or the job do for customers ("where we care for
// patients", "Our agents support members across the US", "This job is all about patients", "You would be the first voice our
// customers hear"; customersQuote), never a listener welcomed as one of them ("We're glad to have you as a new member").
const THE_WORK = /\b(we|our\s+([\w-]+\s+)?(team|teams|agents|staff|nurses|people|reps|crew)|(this|the)\s+([\w-]+\s+)?(job|role|position|work)|you(['’]d| would| will|['’]ll)\s+be)\b(?![^.?!]*\byou\s+as\s+(a|an|our|one of our)\b)[^.?!]*/gi;
// The one customer a practice case is about, named in a sentence before the quote's ("A caller wants to book a car.", "Tax
// intake. A client calls about her refund.", "Interview role-play: the patient calls to move an appointment."; customersQuote),
// never the customers a job serves ("You will help customers with refunds", "Customers love a friendly voice", "Every
// customer loves a friendly voice", "Our callers are mostly parents"). The seventeenth review: only as the one the case is
// about, opening its sentence or a label's colon as every case the sixteenth round read did, never one the applicant would
// welcome or calm ("In up to 75 seconds, describe how you would welcome a customer.", "The interviewer plays a customer
// later."), and never "the client", which in a BPO's job is the account the agents work on ("Screening call for the Bright
// Health account. The client wants mature agents."). The eighteenth review: a case's next customer opens her sentence after
// a word of sequence, a list's mark or the call she is on too ("Next, a member calls about her premium.", "Then a caller asks
// about Medicare.", "Scenario 2 — a caller…", "Case 1) A caller…", "In this video call, a patient…"; never "In this job, a
// customer may call at night."), and a tax desk's own client calls or asks ("Tax intake. The client calls about her
// refund."), as the BPO's client in the seventeenth round's cases never did (it "is a US health plan", it "wants mature
// agents").
const THE_CASES_CUSTOMER = new RegExp(String.raw`(^|[.!?;:)—–])\s*((next|then|later|now|today)\b,?\s*|(in|on|during)\s+(this|the|a)\s+([\w-]+\s+)?(calls?|visits?|chats?),\s*)?(an?|the(?!\s+([\w'’-]+\s+){0,2}?clients?\b(?!\s+(who\s+)?(calls|called|asks|asked|emails|emailed|writes|wrote|chats|messages)\b))|this|that|one|another)\s+([\w'’-]+\s+){0,2}?(${WHO})\b(?<!s)`, "i");
// …and never after a sentence that names an interview, a candidate or an applicant, a screening call or the applicant's
// video (the seventeenth review: "Interview question. A customer calls about a late refund. …", "Each applicant answers a
// customer.", "Video introduction. Imagine a customer is watching."), unless those sentences set up a role-play, whose words
// they are ("Interview role-play: the patient calls…", "Candidates role-play this call."). The eighteenth review: "in the
// video" and "in this video" read a telehealth visit ("In this video call, a patient asks to reschedule."), so only "in
// your video" is the applicant's; and a practice is set up in other words than "role-play" ("Candidates practice this call.",
// "Practice call for applicants.", "Applicants handle this chat.", "In this practice, the candidate is the agent.", "You are
// the agent; the interviewer plays the caller."), never "Practice for the interview".
const NOT_A_PRACTICE_CASE = new RegExp(String.raw`${TO_APPLICANTS.source}|\bscreening\s+(calls?|interviews?)\b|\b(record|film|upload|submit|send)\s+((a|an|your|the|this)\s+)?([\w-]+\s+)?videos?\b|\bvideo\s+(intro\w*|questions?|prompts?|answers?|responses?|steps?|resumes?|pitch)\b|\bin\s+your\s+video\b`, "i");
const ROLE_PLAY = /\brole[\s-]?play|\bpractice\s+(this\s+)?(calls?|chats?)\b|\b(handle|take|answer)s?\s+this\s+(call|chat)\b|\bis\s+the\s+agent\b|\bplays?\s+the\s+(caller|customer|client|patient|member|guest|player)\b/i;
const aPracticeCase = (earlier: string) => ROLE_PLAY.test(earlier) || !NOT_A_PRACTICE_CASE.test(earlier);
// A label that answers someone's message: the quote is that message, never the speaker's own words ("Reply to: …", "Reply to
// this chat: …", "Respond to this email: …", "Answer the chat: …"; OWN_AGE, the seventeenth review).
const ANSWERS_A_MESSAGE = /\b(repl(y|ies|ying)|respond(s|ing)?|answer(s|ing)?)\s+(to\s*:|(to\s+)?((the|this|that|her|his|their|its|a|an|each|every|the following|following)\s+)?([\w'’-]+\s+){0,2}?(chats?|messages?|e-?mails?|tickets?|texts?|dms?|reviews?|comments?|posts?|complaints?|questions?|inquir(y|ies)|enquir(y|ies)|letters?|notes?|voicemails?|requests?|tweets?)\b)[^"“”‘’]{0,40}$/i;
// …so the age in it is that customer's, as the speaker's own (the eighteenth review: the seventeenth round read the label
// only to skip OWN_AGE, so 'Reply to this chat: "I'm 64 years old and want to know when my Medicare plan starts."' and the
// owner's gaming case without its "My account shows the charge." still needed a customer or a check word), unless the
// label says the message is the hiring side's ("Reply to the recruiter's message: …", "Reply to this message from our HR
// team: …"; one naming applicants or an interview is never read as speech at all, withoutCustomerSpeech) or is a question
// with no customer named (an interview's as often: 'Answer this question: "I'm 24 years old. Can I still apply?"'), or says
// what to reply with ("Reply to the chat with your intro: …": the quote is then the reply).
const NOT_A_CUSTOMERS_MESSAGE = /(?<![\d/][\s-]*)\b(recruit\w*|hiring|hr|human resources|questions?)\b|\b(with|using)\b[^"“”‘’]{0,40}$/i;

/**
 * Whether a quote that `names` a customer, by the words of its sentence before and after it, is put to that customer
 * (withoutCustomerSpeech). The fourteenth review: a customer word in the quote is as often the job's title or the
 * applicant's experience ("Thanks for applying for the Customer Service Representative role. Are you married?", "Have you
 * handled angry customers before? And how old are you?"; also inside a script's line: 'Script: Greet them warmly. Ask, "Have
 * you worked with patients before? How old are you?"'), so the fourteenth round counted that word for nothing. The
 * fifteenth review: then every ordinary customer question that names the customer only inside the quote was dropped ('"Are
 * you a Medicare member? Are you 65 or older?"', the owner's own '"Players under 18 need a parent's consent. How old are
 * you?"'), and with it whole practice cases. So, as every earlier round read it, a customer word inside the quote counts
 * again, once what names the job or the applicant is set aside (NOT_THE_LISTENER, SERVICE_WORK):
 *   - a customer named outside the quote makes it a customer's ('Ask the caller, "Are you 65 or older?"', '"…" to each
 *     caller'), never the job's own "Customer Support" (SERVICE_WORK);
 *   - one that asks more than a date of birth is a customer's with a customer word inside it or a caller's check in its
 *     `frame` (A_CHECK: '"Thanks for calling Medicare Help. Are you 65 or older?"'; a script's own line for a quote inside
 *     it), unless it is put to someone applying for a job (applyingForAJob, up to its ask);
 *   - a date of birth alone, with a check, a "confirm", a "verify" or a customer word inside, or when it is not put to
 *     someone applying ('"Hi, I'm Ana, your Patient Coordinator. May I have your date of birth?"', '"Thanks for applying to
 *     Bright Credit Union! As a new member, may I have your date of birth?"': "thanks for applying" is a desk's for many
 *     products the benefit list cannot name); '"Thanks for applying for the Patient Coordinator role. May I have your date
 *     of birth?"' goes.
 * The sixteenth review:
 *   - a practice case names its customer in an earlier sentence as often as in the quote's own ('Car rental booking. A
 *     caller wants to book a car. Say: "To confirm you can rent the car, are you 21 or older?"'; five of six such cases were
 *     dropped whole, which the thirteenth round kept), so the case's one customer named in the sentences before the quote's
 *     (`earlier`, THE_CASES_CUSTOMER, with what names the job set aside) makes the quote that customer's, unless those
 *     sentences or the quote are put to someone applying, words naming applicants follow it ("…" Then begin the interview.)
 *     or the quote itself speaks of the job (NOT_THE_LISTENER: '"Have you handled angry customers? How old are you?"');
 *   - the speaker's own age in the first person is a self-introduction, never a customer's question (OWN_AGE: '"Hi, I am
 *     Ana, 24 years old, married with two kids, and I love serving customers."', and the same with blanks to fill);
 *   - to someone applying, a date of birth alone is a customer's for a customer word only outside the work described
 *     (THE_WORK: '"Hi, I'm Ana from HR at Bright Clinic, where we care for patients. May I have your date of birth for your
 *     file?"', "We serve customers in 20 countries", "This job is all about patients").
 * The seventeenth review: the sixteenth round's two readings each went past the cases that justified them, so each was
 * narrowed back to those cases rather than given exceptions:
 *   - a first-person age read before anything else made a customer's own message a self-introduction ('Reply to: "I'm 70
 *     years old and can't log in to my account."', the owner's gaming case), and five practice cases were dropped whole: it
 *     is read now only after the label, the case's customer and the speaker's own account, which none of the sixteenth
 *     round's self-introductions had (ANSWERS_A_MESSAGE, `namedBefore`, A_CUSTOMERS_OWN);
 *   - a customer named anywhere in an earlier sentence made every interview, screening call and video prompt that mentions
 *     one a customer's ('In up to 75 seconds, describe how you would welcome a customer. Then answer: "What is your age and
 *     civil status?"'): the case's customer now opens its sentence, as in each of the sixteenth round's cases, is never "the
 *     client", and counts only where no sentence before the quote names an interview, a candidate or an applicant, a
 *     screening call or the applicant's video, unless one sets up a role-play (THE_CASES_CUSTOMER, NOT_A_PRACTICE_CASE).
 * The eighteenth review: the seventeenth round read the message replied to only to skip OWN_AGE, so a customer's own age in
 * it still needed a customer or a check word ('Reply to this chat: "I'm 64 years old and want to know when my Medicare plan
 * starts."', the owner's gaming case without its "account"; three practice cases were dropped whole): a first-person age in a
 * message replied to is that customer's now, before anything else is read, unless the label names the hiring side, a
 * question or what to reply with, or the quote is put to someone applying (NOT_A_CUSTOMERS_MESSAGE); "Reply to the
 * recruiter's message: …" is the speaker's own introduction again, as the sixteenth round read it.
 */
function customersQuote(names: RegExp, before: string, quote: string, after: string, frame = `${before}${quote}${after}`, earlier = ""): boolean {
  // Read only when needed (a line of many quotes stays fast).
  const serviceAside = (text: string) => text.replace(YOUR_RECORD, "the customer's record").replace(SERVICE_WORK, "service work");
  const setAside = (text: string) => serviceAside(text).replace(NOT_THE_LISTENER, "someone");
  let theCase: boolean | undefined;
  const namedBefore = () => (theCase ??= earlier !== "" && THE_CASES_CUSTOMER.test(outsideTheQuote(earlier).replace(NOT_THE_LISTENER, "someone")) && aPracticeCase(earlier) && !applyingForAJob(earlier) && !SPOKEN_TO_AN_APPLICANT.test(after) && serviceAside(quote).search(NOT_THE_LISTENER) < 0);
  const ownAge = OWN_AGE.test(quote);
  if (ownAge && ANSWERS_A_MESSAGE.test(before) && !NOT_A_CUSTOMERS_MESSAGE.test(before)) return !applyingForAJob(upToTheAsk(quote));
  if (!names.test(`${before}${quote}${after}`) && !namedBefore()) return false;
  if (NAMES_A_CUSTOMER.test(outsideTheQuote(`${before}${after}`))) return true;
  if (ownAge && !A_CUSTOMERS_OWN.test(quote) && !namedBefore()) return false;
  const checked = A_CHECK.test(frame);
  const applying = applyingForAJob(upToTheAsk(quote));
  if (asksOnlyBirthDate(quote)) return checked || !applying || /\b(confirm\w*|verif\w*)\b/i.test(frame) || NAMES_A_CUSTOMER.test(setAside(quote).replace(THE_WORK, "someone"));
  return !applying && (checked || NAMES_A_CUSTOMER.test(setAside(quote)) || namedBefore());
}

/** The text with each quoted line an agent says to a customer left out ("…"). */
function withoutCustomerSpeech(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      // Whether the line says someone is applying for a job, up to its ask, read once and only when needed (a line of many
      // quotes stays fast). The words that name applicants (TO_APPLICANTS) are read only in the speech's own sentence, as a
      // customer's are (the twelfth review: "Interview role-play: the patient calls to move an appointment. Say: …" names who
      // does the exercise, not who is spoken to).
      let applying: boolean | undefined;
      const lineApplying = () => (applying ??= applyingForAJob(upToTheAsk(line)));
      return line.replace(QUOTED, (whole: string, ...rest: unknown[]) => {
        const at = rest[rest.length - 2] as number;
        // The rest of its sentence on each side, and the sentences before it (customersQuote), read within 300 characters (a
        // line of many quotes stays fast).
        const sentencesBefore = line.slice(Math.max(0, at - 300), at).split(/(?<=[.!?;])\s+/);
        const said = sentencesBefore.pop() ?? "";
        const earlier = sentencesBefore.join(" ");
        const then = line.slice(at + whole.length, at + whole.length + 300).split(/(?<=[.!?;])\s+/)[0];
        if (!SPEECH_BEFORE.test(said) || TO_APPLICANTS.test(said)) return whole;
        // The rest of the line after "Say:", "Script:" or "Ask:", unquoted, read from its label's sentence on ("Phone screen
        // script: …") to its ask, or to the end of the line for the words naming applicants (SPOKEN_TO_AN_APPLICANT), with its
        // quotes to a named customer read first.
        if (/:\s*$/.test(said) && !/^["“‘']/.test(whole)) {
          if (SPOKEN_TO_AN_APPLICANT.test(`${said}${whole}`) || applyingForAJob(upToTheAsk(`${said}${whole}`))) return whole;
          const unquoted = whole.replace(QUOTE_INSIDE, (quote: string, ...args: unknown[]) => {
            const qAt = at + (args[args.length - 2] as number);
            const quoteBefore = line.slice(Math.max(0, qAt - 300), qAt).split(/(?<=[.!?;])\s+/);
            const before = quoteBefore.pop() ?? "";
            const next = line.slice(qAt + quote.length, qAt + quote.length + 300).split(/(?<=[.!?;])\s+/)[0];
            return SPEECH_BEFORE.test(before) && customersQuote(NAMES_A_CUSTOMER, before, quote, next, `${said}${whole}`, quoteBefore.join(" ")) ? '"…"' : quote;
          });
          return PLAINLY_A_CUSTOMER.test(`${said}${unquoted}`) && asksOnlyBirthDate(unquoted) ? '"…"' : unquoted;
        }
        // The quote's own sentence goes on after it when what follows is lower case ('Ask: "May I have your date of birth for
        // your file?" before each interview.'; the thirteenth review: it was cut at the quote's "?").
        const goesOn = () => /^\s*[a-z,]/.test(then) && TO_APPLICANTS.test(then);
        return customersQuote(FOR_A_CUSTOMER, said, whole, then, undefined, earlier) || (CUSTOMERS_OWN_FILE.test(`${whole}${then}`) && asksOnlyBirthDate(whole) && !TO_APPLICANTS.test(upToTheAsk(`${whole}${then}`)) && !goesOn() && !lineApplying()) ? '"…"' : whole;
      });
    })
    .join("\n");
}

/**
 * Everyone a sentence names, read once (a long sentence stays fast): the people who are not the applicant,
 * and where the applicant is named. "People" right after "We prefer", and in "Women aged 25-35 only", are the
 * ones hired, and so are "students" right after "We hire" (the eighth review).
 */
function peopleIn(sentence: string): { others: Array<{ end: number; word: string }>; applicants: number[] } {
  const endsOnly = /\bonly\s*[.!)]?\s*$/i.test(sentence);
  const others: Array<{ end: number; word: string }> = [];
  for (const m of sentence.matchAll(SOMEONE_ELSE)) {
    const at = m.index ?? 0;
    const lead = sentence.slice(Math.max(0, at - 40), at);
    if (NEUTRAL_PERSON.test(m[0]) && (endsOnly || HIRING_CUE.test(lead))) continue;
    if (APPLICANT_GROUP.test(m[0]) && GROUP_HIRING_CUE.test(lead)) continue;
    others.push({ end: at + m[0].length, word: m[0] });
  }
  return { others, applicants: [...sentence.matchAll(APPLICANT)].map((m) => (m.index ?? 0) + m[0].length) };
}

/** The last of `items` that ends by `at`. */
function lastBy<T>(items: readonly T[], endOf: (item: T) => number, at: number): T | undefined {
  let found: T | undefined;
  for (const item of items) if (endOf(item) <= at) found = item;
  return found;
}

// "eighteen" → "18", "thirty-five" → "35"; never "twenty-four seven".
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ONES: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
function numbersAsDigits(text: string): string {
  return text.replace(
    /\b(twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety)(?:[\s-](one|two|three|four|five|six|seven|eight|nine))?\b|\b(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/gi,
    (whole: string, tens: string | undefined, one: string | undefined, teen: string | undefined, at: number, all: string) => {
      const value = teen ? TEENS[teen.toLowerCase()] : TENS[String(tens).toLowerCase()] + (one ? ONES[one.toLowerCase()] : 0);
      if (value === 24 && /^[\s-]*seven\b/i.test(all.slice(at + whole.length))) return whole;
      return String(value);
    },
  );
}

// Compiled once: a "• one\n• two" list of a thousand lines compiled every pattern a thousand times.
const AGE_PATTERNS = AGE_NUMBER.map((pattern) => new RegExp(pattern, "gi"));

function ageMatches(sentence: string): Array<{ at: number; text: string }> {
  const out: Array<{ at: number; text: string }> = [];
  for (const pattern of AGE_PATTERNS) {
    for (const m of sentence.matchAll(pattern)) out.push({ at: m.index ?? 0, text: m[0] });
  }
  return out;
}

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?;])\s+|\n/).filter((s) => s.trim());
}

/**
 * Whether one sentence asks. `itemNamesACustomer` says whether the whole text it came from (a practice case, a question, a
 * line) names a customer or their file, for a bare label (DEPENDENTS_LABEL).
 */
function sentenceAsks(raw: string, itemNamesACustomer: () => boolean): boolean {
  const sentence = numbersAsDigits(raw);
  if (ALWAYS.test(sentence)) return true;
  if (NUMBER_OF_DEPENDENTS.test(sentence) && !CUSTOMER_FILE.test(sentence) && !(CUSTOMER_FORM.test(sentence) && !(DEPENDENTS_LABEL.test(sentence) && !itemNamesACustomer()) && (!READERS_OWN.test(sentence) || (DESK_EXPLAINS.test(sentence) && DESK_TOPIC.test(sentence))))) return true;
  const plain = sentence.replace(SERVICE_WORK, "service work");
  const matches = ageMatches(plain);
  const people = matches.length > 0 ? peopleIn(plain) : { others: [], applicants: [] };
  // What the whole sentence says, read once.
  const forApplicants = matches.length > 0 && TO_APPLICANTS.test(plain);
  const rental = matches.length > 0 && TO_RENT.test(plain);
  const idealFor = matches.length > 0 && IDEAL_FOR.test(plain);
  for (const m of matches) {
    const before = plain.slice(0, m.at);
    // The tests that read the end of `before` read only its last 200 characters (they never reach further back).
    const near = before.slice(-200);
    const digit = m.text.search(/\d/);
    // From the number itself ("Over 10 years old company" reads from "10").
    const fromNumber = plain.slice(m.at + Math.max(0, digit));
    const after = plain.slice(m.at + m.text.length);
    // A bare number ("must be 85", "be 90 and above") on a score, a time or a test.
    if (digit >= 0 && !/\b(years?|yrs?|y\.?o|y\/o|aged?|ages?|old|olds|born|graduat\w*|batch)\b|\d{2}s\b/i.test(m.text) && (METRIC_SUBJECT.test(near) || METRIC_AFTER.test(after))) continue;
    if (SOMEONE_ELSE_AT.test(fromNumber)) continue;
    // "Accounts aged 90 and over": an account's age (the ninth review), and "any ticket aged 48-72 in the queue", "requests
    // aged 30-60 in Zendesk" (the tenth).
    if (/^aged?\b/i.test(m.text) && /\b(accounts?|tickets?|claims?|invoices?|cases?|orders?|balances?|bills?|receivables|requests?|chats?|emails?)\s+$/i.test(near)) continue;
    // A customer's rule (TOLD, BENEFIT_AT, RULE_AFTER, TO_RENT), never a range of ages nor a sentence about the job's applicants,
    // unless the range is a product's ("Explain that you must be 18-25 to get the youth rate"; the tenth review).
    const range = /^\D{0,25}?\d{2}\s*(-|–|to|and)\s*\d{2}\b/i.test(plain.slice(m.at)) && !FOR_A_PRODUCT.test(after);
    const clause = near.split(/[,;:]/).pop() ?? "";
    const benefit = BENEFIT_AT.test(near) && (BENEFIT.test(clause) || (BENEFIT.test(near) && !HIRES_HERE.test(clause)) || BENEFIT.test(BENEFIT_NEXT.exec(after)?.[0] ?? "") || (AGE_FIRST.test(clause) && BENEFIT.test(plain)));
    if (!range && !forApplicants && (rental || benefit || RULE_AFTER.test(after) || TOLD.test(plain.slice(0, m.at + m.text.length)))) continue;
    // The person it belongs to is the last one named before it: "Are you comfortable helping
    // patients aged 65" is the patients', "Patients call us; agents aged 21-35" the agents'.
    // Unless the sentence prefers applicants of that age, whoever they are ("Students aged 18-22 preferred").
    const other = lastBy(people.others, (o) => o.end, m.at);
    const applicantEnd = lastBy(people.applicants, (end) => end, m.at) ?? -1;
    const preferred = !CUSTOMER_WORD.test(other?.word ?? "") && (prefersThem(plain.slice(m.at)) || idealFor);
    // …or the person right after it: "a 70 year old patient", "70-year-old patients" (the ninth review), unless the sentence is
    // hiring them: a hiring word right before the age or a preference after the person, whoever is named ("We hire 18-24 year
    // old students", and since the tenth review "Hiring 21-35 year old Patient Access Representatives", "Seeking 18-25 year old
    // gamers", "21-35 year old residents of Metro Manila preferred": the ninth excused every customer word there). "Ideal for
    // 16-year-old players" stays a product's, as with a customer before the age. With an article (ARTICLE_BEFORE) and no one
    // after it, the applicant's only when the sentence is hiring ("We want a 25-year-old go-getter"; never "a 16-year-old wants
    // to sign up"). Never "born in the 90s" (a decade; the seventh review). The eleventh review: a hiring word before "her",
    // "his", "their", "my" or "your" is someone looking for their own family ("A worried mother is looking for her 15-year-old
    // son's missing order"), and a preference after the person is theirs only when no one else wishes it (prefersThem).
    if (digit >= 0 && !/^\d{2}s\b/i.test(fromNumber)) {
      const article = ARTICLE_BEFORE.exec(plain.slice(Math.max(0, m.at + digit - 40), m.at + digit));
      const person = /^\s*[,;:(]/.test(after) ? undefined : SOMEONE_ELSE_WORD.exec(WORDS_AFTER.exec(after)?.[1] ?? "")?.[0];
      const lead = !/^(her|his|their|my|your)\b/i.test(article?.[0] ?? "") && HIRING_LEAD.test(plain.slice(Math.max(0, m.at + digit - 100), m.at + digit - (article?.[0].length ?? 0)));
      const hiresThem = lead || prefersThem(after) || (preferred && !CUSTOMER_WORD.test(person ?? ""));
      if (person && !NEUTRAL_PERSON.test(person) && !hiresThem) continue;
      if (article && !(preferred || lead)) continue;
    }
    if (!preferred && (other?.end ?? -1) > applicantEnd) continue;
    // "Ages 12+ game ratings", "the app is 18+": a product's rating.
    if ((/\+\s*$/.test(m.text) || /^\s*\+/.test(after)) && SOMEONE_ELSE_AFTER.test(after.replace(/^\s*\+/, ""))) continue;
    // "The minimum age for a kid's savings account", "age limits on our insurance plans".
    if (digit < 0 && (THING_AFTER.test(after) || THING_BEFORE.test(near))) continue;
    // "Our youth plan for ages 18 to 25", "our over-50s insurance line": a product's, with a number.
    if (!preferred && (THING_FOR.test(near) || THING_NEXT.test(after))) continue;
    if (BUSINESS_FIRST.test(before)) continue;
    if (/^born\b/i.test(m.text) && THING_BORN.test(near)) continue;
    return true;
  }
  return false;
}

/** True when the text asks the applicant for age, a birth date, marital status or family plans, or sets an age limit or preference. */
export function asksAgeOrStatus(text: unknown): boolean {
  if (typeof text !== "string") return false;
  const item = withoutCustomerSpeech(text);
  // Read once and only when a bare label needs it (an item of many labels stays fast). Her, his or their file names a customer
  // only outside the label being judged and in an item that hires no one (the fifteenth review: "Household size and number of
  // dependents (for their HMO coverage):" and "Pre-employment form. Applicants fill this in for their benefits:" passed).
  let named: boolean | undefined;
  let theirs: number | undefined;
  const theirFiles = (part: string) => part.match(THEIR_FILES)?.length ?? 0;
  const itemNamesACustomer = (sentence: string) => (named ??= CUSTOMER_FILE.test(item)) || (theirs ??= HIRING_FORM.test(item) ? 0 : theirFiles(item)) > theirFiles(sentence);
  return sentencesOf(item).some((sentence) => sentenceAsks(sentence, () => itemNamesACustomer(sentence)));
}

// What a reviewer writes about the applicant, in the third person. Never
// "her husband" or "his wife": a customer's spouse is an everyday privacy case
// in the practice chats (scenarioPacks.ts).
const ABOUT_APPLICANT = re([
  String.raw`\b(her|his|their|the (candidate|applicant)'?s|candidate'?s|applicant'?s)\s+(own\s+)?(age|marital status|civil status|pregnancy|children|kids|family (situation|status|plans|life|commitments|obligations|responsibilities))\b`,
  // "Mentioned her 3 kids" (the eighth review); never a customer's "her two children are at home with her" in a practice case.
  String.raw`\b(mentioned|mentions|mentioning|talked about|talks about|spoke about|speaks about|brought up|brings up|cited|cites|raised|raises|noted|notes)\s+(her|his|their)\s+(own\s+)?((\d+|one|two|three|four|five|six|seven|eight|nine|ten|young|small|little|grown)\s+)?(children|kids|baby|babies|toddlers?)\b(?!['’])`,
  // Never "single-minded", "single-handedly" or "married to the script" (the seventh review). The eighth: "She's single",
  // "She is divorced", "He is a widower"; never "She is mature and calm under pressure" or "He is old-school in his replies".
  String.raw`\b(candidate|applicant|she|he|they)(\s+(is|are|was|were|seems?|appears?|looks?|sounds?)|['’](s|re))\s+(too\s+|very\s+|quite\s+|rather\s+|fairly\s+|relatively\s+)?(young|old\b(?!-)|older|younger|elderly|youthful|married\b(?!\s+to\s+((the|this|that|a|an|her|his|their)\s+)?(script|scripts|process|job|work|rules|idea|routine|method|template|playbook))|single\b(?!-)|divorced|widowed|an? widow(er)?|separated\b(?!\s+(the|this|that|these|those|each|both|it|them|issues?|out)\b)|unmarried|engaged\b(?=\s*(to\b|[.,;:!?]|$))|pregnant|a (mother|father|mom|dad|parent)|a single (mother|mom|father|dad|parent))\b`,
  // A bare age (the eighth review): "The candidate is 52.", "She's 45.", "The applicant, 45, may tire on nights.", a remark
  // that opens with one ("A 52-year-old career agent with strong examples"); never "She is 20 chats ahead", "He is 30
  // seconds faster" or the form's own "they are 18 or older". The ninth: only an age that ends its clause or says "years"
  // ("He's 23 and eager"), never "She was 35 lines into the script" or "He was 20 short of the bar".
  String.raw`\b(candidate|applicant|she|he|they)(\s+(is|are|was|were)|['’](s|re))\s+((only|just|about|around|nearly|almost|over|under|barely|already|now|still)\s+)?${AGE}\b${UNITS}(?!\s*(or|and)\s+(older|over|above|up|younger|under|below)\b)(?=\s*([,;:!?)]|\.(?!\d)|$|(years?|yrs?|and|so|but|which|yet)\b))|\b(candidate|applicant|she|he|they),\s*${AGE}\s*,|\b(candidate|applicant)\s*\(\s*(age\s*)?${AGE}\s*\)|^\s*[-•*]?\s*(an?\s+)?${AGE}[\s-]*(years?|yrs?)[\s-]*old\b`,
  // Family plans and status at the start of a remark (the eighth review): "Wants to start a family soon", "Wants kids soon",
  // "Expecting her first child", "Just became a mother", "As a mom, she understands patience", "Divorced, so flexible",
  // "Widowed; wants steady work", "Unmarried and flexible"; never "Wants kids' accounts handled", "Separated the two issues" or
  // "Not married to one script".
  String.raw`\b(wants?|wanting|plans?|planning|hopes?|hoping|intends?|intending|looking)\s+(to\s+)?(start|starting|have|having)\s+(a family|kids|children|a baby)\b(?!['’])|\bwants?\s+(kids|children|a baby)\b(?!['’])|\bexpecting (her|his|their) (first |second |third |next )?(child|baby)\b|\b(became|become|becoming) a (mother|father|mom|mum|dad|parent)\b(?![\s-]+figure)|^\s*[-•*]?\s*as a (single |working |new |young |stay-at-home )?(mom|mother|mum|dad|father|parent)\b|^\s*[-•*]?\s*(divorced|widowed|unmarried|not married\b(?!\s+to\b)|a widow(er)?)\b|^\s*[-•*]?\s*(single|married|separated)\s*[,;:]\s*(so|and|which|but|may|might|could|likely|probably|no|with|has|lives|wants|needs|can)\b`,
  // "He is in his late 50s", "Young for a lead" (the eighth review), "Seems young for a lead role" (the ninth).
  String.raw`\bin (his|her|their) ((early|mid|late)[\s-]?)?(20s|30s|40s|50s|60s|twenties|thirties|forties|fifties|sixties)\b|^\s*[-•*]?\s*((seems?|looks?|appears?|sounds?)\s+)?((a bit|a little|rather|quite|very|too|fairly)\s+)?(young|old|older|younger)\s+for\s+(a|an|the|this)\s+(lead|team lead|leader|role|job|position|supervisor|manager|team)\b`,
  // "Seems too young to lead"; never "their laptop is too old", "too old-fashioned for chat" or "a very old example".
  String.raw`(?<!\b(laptop|computer|device|phone|browser|headset|machine|pc|system|software|equipment|headphones|tone|style|wording|language|example|examples|reference|references|approach|script|template|slang|joke|jokes|phrasing)\b[^.]{0,30})\b(too|very|rather|relatively)\s+(young|old)\b(?=\s*([,.;:!?)]|$|to\b|for\b|and\b|but\b|so\b|compared\b|relative\b|than\b))`,
  String.raw`\b(young|younger|older|elderly|youthful|mature)\s+(candidate|applicant)\b`,
  // "A solo parent" is a legal status in the Philippines (RA 8972; the ninth review).
  String.raw`\b(mother|father|mom|mum|dad|parent) of (one|two|three|four|five|six|\d+|twins|a (newborn|baby|toddler)|an infant|(young|small|little) (kids|children|ones))\b|\b(single|solo|working|stay-at-home|new|young) (mother|mom|father|dad|parent)\b`,
  // "Has five kids at home", "Mentioned her 3 kids" too (the eighth review).
  String.raw`\b(has|have|having|with|lives with|living with) (her |his |their )?(young |small |little |\d+ |one |two |three |four |five |six |seven |eight |nine |ten |several |many |a few |multiple )?(kids|children|a baby|a family|dependents|a newborn|a toddler|toddlers|an infant|twins|a child)\b(?!['’]|[\s-]+(business|owned|run|plan|medicine|practice|doctor|clinic|members?))`,
  // Never "Handled the pregnancy leave question for the employee correctly" (the eighth review).
  String.raw`\bpregnan\w*\b(?!\s+(leave|benefits?|coverage|polic(y|ies)|questions?|claims?|tests?|care|scans?|appointments?|cases?|discrimination|rules?)\b)|\b(family|childcare|child care|parenting) (duties|responsibilities|obligations|commitments)\b`,
  // The seventh review: an age named ("Mentions being 45", "At 45, she may struggle", "Only 19, may lack maturity"), age next to
  // the team, retirement, a new baby, a marriage, parental leave, childcare against the shift.
  // Never a time ("At 21:30 he ended the chat early"; the ninth review).
  String.raw`(?<!\b(company|business|brand|clinic|firm|store|shop|startup|agency|practice|team|it)\s+)\b(being|turned|turning)\s+${AGE}\b(?=\s*([,.;:!?)]|$|(this|next|last|soon|years?|in|on|and|so|which|but)\b))|^\s*(at|only|just|aged?)\s+${AGE}\s*(years old\s*)?([,;]|:(?!\d))|^\s*at\s+${AGE}\s+(she|he|they)\b`,
  String.raw`\b(older|younger) than (the rest of |most of |all of )?(the |his |her |their |our |other |most )?(team|teammates|colleagues|peers|others|agents|staff|team members|applicants|candidates|rest)\b`,
  String.raw`\b(close to|near|nearing|approaching|reaching|past) (the )?retirement( age)?\b|\b(about|due|planning|plans|going|set) to retire\b|\bretiring soon\b|\b(she|he|they|candidate|applicant)\s+(is|was|are)\s+(semi-)?retired\b`,
  String.raw`\b(just|recently) had (a baby|a child|twins|a son|a daughter)\b|\bbaby on the way\b|\bexpecting (a baby|a child|twins)\b`,
  String.raw`\b(recently|newly|just|getting|soon to be|about to be|planning to get|plans to get) (got )?(married|wed|engaged|divorced)\b|\bnewly ?weds?\b`,
  String.raw`\b(on|back from|returning from|returned from|going on|due for|currently on|after) (her |his |their )?(maternity|paternity|parental|pregnancy) leave\b`,
  String.raw`\b(childcare|child care|babysitter|school runs?)\b[^.]{0,40}\b(clash|clashes|conflict|conflicts|limit|limits|risk|issue|problem|hard|harder|difficult|unlikely|unclear|get in the way|interfere)\b`,
]);
// Never the applicant's own "a single parent", "a solo parent", "is a parent of two" (the ninth review: every sentence saying
// "parent" was skipped); "calmed a parent with two kids on the line" is still a customer. The tenth review: it is the
// applicant's only when said of them ("She is a single parent", "As a solo parent, …", "Works as a solo parent", "She, a single
// parent, …", or opening the remark: "Solo parent; needs day shifts"), so "Was kind to a single parent whose card was
// declined", "Calmed a parent of two who was double-charged" and "Explained solo parent leave" are a customer's again.
const NAMES_SOMEONE_ELSE = /\b(customers?|clients?|callers?|(?<!\b(be|very|more|stay|remain|and|being|so|is|are)\s)patients?|members?|users?|players?|guests?|policyholders?|account holders?|borrowers?|buyers?|shoppers?|students?|residents?|parents|(?<!((\b(is|are|was|were|am|as|be|being|been|became|become)(\s+(also|now|still|already|currently))?|\balso|['’]s|,)\s+an?\s+|^\s*[-•*]?\s*(an?\s+)?)((single|solo|working|stay-at-home|new|young|first-time)\s+)?)parent)\b/i;
// "The single mom", "the new mom", "the father who has small kids on the line", "the newlywed couple", and "the single parent's
// billing case" (the ninth): a person in a practice case, never the applicant (who is "she", "the candidate" or "a single mom";
// the seventh review).
const THE_PERSON = /\b(the|that|this)\s+([\w'-]+\s+){0,2}(woman|man|lady|gentleman|mother|father|mom|mum|dad|parent|grandmother|grandfather|grandma|grandpa|couple|wife|husband|widow|widower)\b(?!\s+of\s+(one|two|three|four|five|\d+)\b)/i;

/**
 * True when what a reviewer wrote about an applicant marks their age, family
 * or marital status ("a mother of three, so nights may be hard", "seems too
 * young to lead"), or sets an age limit. A sentence about a customer is left
 * alone ("verified the caller's date of birth", "kind to the parent who has
 * small kids"). The written interview's grader and the interview guide are
 * told never to; this keeps a line that still does from the business.
 */
export function marksAgeOrFamily(text: unknown): boolean {
  if (typeof text !== "string") return false;
  return asksAgeOrStatus(text) || sentencesOf(text).some((sentence) => !NAMES_SOMEONE_ELSE.test(sentence) && !THE_PERSON.test(sentence) && ABOUT_APPLICANT.test(numbersAsDigits(sentence)));
}

// Options that only an applicant's own status answers.
const MARITAL_OPTION = /^\s*(single|married|separated|widowed|divorced|annulled|engaged|unmarried|in a relationship|living together|domestic partner(ship)?|civil union|legally separated|single parent|solo parent|married with (kids|children))\b(?!.*\bfiling\b)/i;
const GENERATION_OPTION = /^\s*(gen(eration)? ?(z|y|x|alpha)|millennials?|baby boomers?|boomers?|zoomers?|silent generation)\s*$/i;
const BRACKET_OPTION = /^\s*((under|below|over|above)\s+\d{2}|\d{2}\s*(-|–|to)\s*\d{2}|\d{2}\s*\+|\d{2}\s*(and|or)\s+(over|above|under|below|older|younger|up))\s*$/i;
// "Which range do you fall into?", "Which of these describes you?", "Where do you fall?": a question to the applicant with
// nothing to say what is measured (the seventh review: it needed the words range, bracket, group, band or category).
const MEASURED = /\b(hours?|wpm|speed|typing|calls?|chats?|tickets?|experience|years?|salary|pay|rate|budget|mbps|internet|minutes?|scores?|team|people|sales|price|cost|usd|php|size|volume|accuracy|shifts?|days?|weeks?|months?|how (long|many|much|often|far|fast|soon)|when|start|notice|commute|distance|km|miles|languages?|tenure|wage|income|earn\w*|quota|target|kpi|aht|csat|nps|rating)\b|[$₱%]/i;

/**
 * A question with answer options: the question's own words decide first,
 * then the options. Any option that names an age or a birth year ("18-25
 * years old", "Born before 1990") drops the question. So do, when the
 * question names no customer: two or more marital statuses ("Single /
 * Married / Separated"), two or more generations ("Gen Z / Millennial"), or
 * age brackets under a question to the applicant that says nothing else about
 * what it measures ("Which range do you fall into?", "Which of these
 * describes you?" or "Where do you fall?" with "18-24 / 25-34"; the seventh
 * review: it needed the words range, bracket or group). Ordinary number
 * options stay: "Under 20 / 20-30 / 30-40" hours a week, "0-2 / 3-5 / 6-10"
 * years of experience (the fifth Phase 6 review). The sixth review found the
 * options were read only for "years old", so "Born before 1990" and every
 * marital-status list passed although this comment said they did not.
 */
export function questionAsksAge(question: unknown, options: readonly unknown[] | null | undefined = []): boolean {
  if (asksAgeOrStatus(question)) return true;
  const texts = (Array.isArray(options) ? options : []).filter((option): option is string => typeof option === "string");
  const q = typeof question === "string" ? question : "";
  // An option is read as the end of its question (the ninth review: "When does Medicare usually start? At age 65" is Medicare's,
  // and "Which details should you verify before sharing lab results? Full name and date of birth" is a caller's check, not a
  // form label; both questions were dropped whole).
  const asked = q.replace(/[\s?.!:]+$/, "");
  if (texts.some((option) => /\b(years?\s*old|yrs?\s*old|y\/o|of age|age|born|birth|marital|civil status|\d0s|twenties|thirties|forties)\b/i.test(option) && asksAgeOrStatus(`${asked} ${option}`))) return true;
  if (NAMES_SOMEONE_ELSE.test(q)) return false;
  if (texts.filter((option) => MARITAL_OPTION.test(option)).length >= 2) return true;
  if (texts.filter((option) => GENERATION_OPTION.test(option)).length >= 2) return true;
  return /\byou\b/i.test(q) && !MEASURED.test(q) && texts.filter((option) => BRACKET_OPTION.test(option)).length >= 2;
}

/** The list without any item that asks for age, a birth date or marital status, or sets an age limit. */
export function withoutAgeAsks<T>(items: readonly T[] | null | undefined, textOf: (item: T) => unknown = (item) => item): T[] {
  return Array.isArray(items) ? items.filter((item) => !asksAgeOrStatus(textOf(item))) : [];
}

function textWithout(text: unknown, drops: (text: unknown) => boolean): unknown {
  if (Array.isArray(text)) return text.filter((item) => !drops(typeof item === "string" ? item : JSON.stringify(item)));
  if (typeof text !== "string") return text;
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (!drops(line)) {
      out.push(line);
      continue;
    }
    // Keep the line's other sentences ("Good English. Must be 21-35 years old. Two years in a call center.").
    const kept = line.split(/(?<=[.!?;])\s+|\s+(?=[•·]\s)/).filter((sentence) => !drops(sentence)).join(" ");
    if (kept.trim()) out.push(kept);
  }
  return out.join("\n");
}

/** A paragraph (or a "• one\n• two" list) without the sentences or lines that do; a list as a list. */
export function textWithoutAgeAsks(text: unknown): unknown {
  return textWithout(text, asksAgeOrStatus);
}

/** A reviewer's paragraph without the sentences that mark age, family or marital status (marksAgeOrFamily). */
export function textWithoutAgeMarks(text: unknown): unknown {
  return textWithout(text, marksAgeOrFamily);
}

/** A "• one\n• two" bullet list without its age lines (the same rule as textWithoutAgeAsks). */
export function bulletsWithoutAgeAsks(text: unknown): unknown {
  return textWithoutAgeAsks(text);
}

/** A comma-separated list ("skills", "benefits"), or the same as an array, without its age items. */
export function commaListWithoutAgeAsks(text: unknown): unknown {
  if (Array.isArray(text)) return withoutAgeAsks(text as unknown[]);
  if (typeof text !== "string") return text;
  return text
    .split(",")
    .filter((item) => !asksAgeOrStatus(item))
    .join(",")
    .trim();
}

/**
 * A text in place, emptied when it asks for age: for lists read by position
 * (generate-flow's phaseRationales, each the note of the step at its index),
 * where dropping one shifted every later note onto the wrong step (the fifth
 * review). The page shows its own note for an empty one.
 */
export function blankAgeAsks(items: readonly unknown[] | null | undefined): unknown[] {
  return Array.isArray(items) ? items.map((item) => (typeof item === "string" && asksAgeOrStatus(item) ? "" : item)) : [];
}
