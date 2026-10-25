/**
 * No age, birth date or marital status in what the job writers produce
 * (2026-10-25; the second to seventh Phase 6 reviews).
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
 *     to, the last one named before it, is someone else ("patients aged 65
 *     and older", "Are you comfortable helping patients aged 65 and older?",
 *     "a 70-year-old caller", "check that the customer is of legal age",
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
 * current role", "24/7", "tickets aged 72 hours"), and a number near
 * "applicants" is not one either unless an age word goes with it
 * ("Applicants must type 40-50 WPM", "Candidates must work 12-hour shifts").
 *
 * marksAgeOrFamily is the same rule for what a reviewer writes ABOUT an
 * applicant (the written interview's grader, the interview guide): "a mother
 * of three", "seems too young", "her children", "at 45, she may struggle",
 * "just had a baby", "recently married", "close to retirement age". A
 * remark about a person in a practice case ("the single mom's billing
 * case", "the pregnant woman on the line") or about the work ("too
 * old-fashioned for chat", "single-handedly covering two queues") stays.
 *
 * Import-free on purpose, so scripts/age_wording.test.mjs runs it under plain
 * Node as shipped.
 */

/** The sentence each job writer's instructions carry. */
export const AGE_RULE =
  "Never ask applicants their age, date of birth, birth year, graduation year, marital status or family plans, and never write an age preference or limit (an age range, 'below 30', 'young', 'fresh graduates only') in the post, its requirements or its questions: every application already asks 'Are you 18 or older?' on its own.";

const re = (parts: string[], flags = "i") => new RegExp(parts.join("|"), flags);

// After a number: a unit, a score or a time, so not an age ("under 30 minutes", "24/7", "90% accuracy").
const UNITS = String.raw`(?!\s*(%|percent|minutes?|mins?|seconds?|secs?|hours?|hrs?|days?|weeks?|months?|words?|wpm|km|kms|kilometers?|kilometres?|miles?|mbps|gb|mb|points?|calls|chats|tickets|replies|emails|messages|cases|orders|sales|leads|qa\b|csat|nps|per\b|or (higher|more|better)|on\b|in\b|am\b|pm\b|:|\/|x\s*\d|[.,]\d))`;
// An adult age as an ad writes one, for the wordings that also fit years of
// experience ("Ideally 22-30 years" but never "10-15 years of service").
const AGE = String.raw`(1[5-9]|[2-6]\d)`;
const YEAR = String.raw`(19[3-9]\d|20[0-3]\d)`;

// A form label in a list of labels: "Sex, age, civil status", "Name / Age / Address", "Full name, date of birth and address".
const LABEL = String.raw`((full|first|last|middle|complete)\s+)?name|age|sex|gender|civil status|marital status|status|((home|current|permanent)\s+)?address|location|city|nationality|citizenship|religion|height|weight|((contact|phone|mobile|cell(phone)?)(\s+(number|no\.?))?)|email(\s+address)?|date of birth|birth ?date|birthday|place of birth|dob|d\.o\.b\.?|educational attainment|education`;

// About the applicant, whatever else the sentence says.
const ALWAYS = re([
  // A form label on its own line, with an optional "(MM/DD/YYYY)" or "(optional)", a "*" or a "____" to fill in (the seventh review).
  String.raw`^\s*[-•*]?\s*(your\s+|(the\s+)?(applicant|candidate)'?s\s+)?(age|current age|date of birth|birth ?date|birthday|birth year|dob|d\.o\.b\.?|year of birth|year born|place and date of birth|date and place of birth|marital status|civil status|relationship status|edad|kaarawan|petsa ng kapanganakan|age range|age group|age bracket|dependents|number of (dependents|children|kids)|no\.? of (dependents|children|kids)|children|kids|generation|graduation year|year graduated|spouse|(spouse|husband|wife)'?s (name|occupation|job|work|employer|income)|name of (your\s+)?(spouse|husband|wife)|maiden name)\s*(\([^)]*\))?\s*[:?]?\s*\*?\s*[_.…]*\s*$`,
  String.raw`^\s*[-•*]?\s*(?=[^?!]*\b(age|civil status|marital status|date of birth|birth ?date|birthday|dob|d\.o\.b)\b)(${LABEL})(\s*(,|\/|&|\+|\band\b)\s*(${LABEL}))+\s*(\([^)]*\))?\s*[:?]?\s*\*?\s*[_.…]*\s*$`,
  String.raw`^\s*[-•*]?\s*(marital|civil|relationship) status\s*(\([^)]*\))?\s*:`,
  String.raw`^\s*[-•*]?\s*status\s*:\s*(single|married|widowed|separated)\b`,
  String.raw`^\s*[-•*]?\s*(age|edad)\s*(range|group|bracket)?\s*:`,
  // "Date of Birth: ____" is a blank to fill; "Date of birth: 04/12/1961" is a customer's record.
  String.raw`^\s*[-•*]?\s*(date of birth|birth ?date|birthday|dob|d\.o\.b\.?|year of birth|birth year)\s*\*?\s*:\s*([_.…\s]*$|\(?\s*(mm|dd|yyyy|month|day|year)\b)`,
  String.raw`\b(birth year|year of birth|year born)\s*:?\s*${YEAR}\s*(or|and)\s+(later|after|newer|earlier|before|above|below|up|onwards?)\b`,
  // "Married? Y/N", "Any children?"
  String.raw`^\s*[-•*]?\s*(married|single|pregnant|separated|divorced|widowed|with (kids|children)|any (kids|children|dependents)|have (kids|children))\s*\?\s*(\(?\s*y(es)?\s*\/\s*n(o)?\s*\)?)?\s*[.:]?\s*$`,
  String.raw`\bedad\b`,
  // A question to the applicant, or a request to tell.
  String.raw`\bhow old (are you|are u|r u|will you be|you are|you'?ll be)\b`,
  // "Your birthday" is asked for only in a question ("What's your birthday?"); "We celebrate your birthday"
  // and "Your birthday is a paid holiday" are benefits (the sixth and seventh reviews).
  String.raw`\byour\s+((current|exact|present|actual)\s+)?(age|date of birth|birth ?date|birth year|year of birth|marital status|civil status|relationship status)\b|\b(what|when)('?s|\s+is|\s+was)\s+your birthday\b`,
  // "Which age range your family plan covers" is the plan's, not the applicant's.
  String.raw`\byour\s+((own|exact|current)\s+)?age (range|group|bracket)\b|\bage (range|group|bracket)\b[^.?!]{0,30}\b(are you|you are|you're|do you|you belong|you fall|you fit)\b|^\s*[-•*]?\s*(please\s+)?(select|choose|pick)\s+(your\s+)?age\b`,
  String.raw`\b(state|enter|give|provide|list|indicate|include|share|tell us|write|type|fill in|declare|submit|send)\s+(us\s+)?your\s+(age\b|birth ?date\b|date of birth\b|year of birth\b|marital status\b|civil status\b|birthday\b|dob\b|d\.o\.b\b)|^\s*[-•*]?\s*(please\s+|kindly\s+)?(state|enter|give|provide|list|indicate)\s+(age|birth ?date|date of birth|year of birth|marital status|civil status|dob|d\.o\.b)\b`,
  String.raw`\bwhat'?s your\s+((current|exact|present|actual)\s+)?age\b|\bwhat is your\s+((current|exact|present|actual)\s+)?age\b|\bwhat age (are you|will you be|would you be)\b`,
  // The seventh review: "over the age of 18", "currently pregnant", "divorced", "a solo parent".
  String.raw`\bare you\s+((currently|now|presently|still|already|recently|legally)\s+)?(\d{2}\b${UNITS}|(over|under|above|below|between|at least)\s+(the age of\s+)?\d{2}\b${UNITS}|older than|younger than|(of\s+)?legal age|a (fresh|recent|new) grad\w*|married\b(?!\s+to\s+((the|this|that|a|an|your|our)\s+)?(script|scripts|process|job|work|rules|idea|routine|method|template|playbook))|single\b(?!-)|divorced|widowed|separated\b(?!\s+from)|annulled|in a relationship|pregnant|expecting (a baby|a child|twins)|an? (single |solo |working |stay-at-home |first-time |new )?(parent|mother|father|mom|mum|dad)\b(?!-)|planning (to have|on having|to start|on starting) (a family|kids|children|a baby)|(a )?(millennial|gen[\s-]?z|digital native))`,
  String.raw`\b(what|which) year (were you born|did you (graduate|finish (high )?school|finish college|finish university))\b|\bwhen were you born\b|\bwhen is your birthday\b|\byear (you were|were you) born\b`,
  String.raw`\bwhen did you graduate\s*\?|\bwhen did you graduate (from )?(high school|college|university|senior high)\b|\bwhen did you finish (high )?school\b|\bwhen did you finish (college|university)\b`,
  String.raw`\byear (you )?graduated\b|\b(graduation year|year of graduation)\b|\byear born\b|\byears since you graduated\b`,
  // Marital status. The seventh review: "a single parent", "No pregnant applicants", "physically fit, single, and willing to relocate",
  // "Parents with kids under 5 need not apply".
  String.raw`\bmarried or single\b|\bsingle,? (or )?married\b|\b(must|should|need to|needs to|has to|have to)\s+(not\s+)?be\s+(single\b(?!-)|married|unmarried|pregnant|childless|an? (single |solo )?(parent|mother|mom|mum|father|dad)\b(?!-))|\b(must|should|need to|needs to|has to|have to)\s+be\b[^.]{0,60}(,|\band\b)\s*(single|married|unmarried|childless)\s*((,\s*(and\s+)?|\s+and\s+)(willing|able|available|ready|physically|with|of good|flexible|open|amenable|fluent)\b|[.!]?\s*$)|\b(single|married|unmarried)\)?\s+(applicants|candidates|people|women|men|only|preferred)\b|\bpreferabl[ey]\s+(single|married|unmarried|childless)\b|^\s*[-•*]?\s*(not married|unmarried|single only|childless|no kids|no children)\s*[.!]?\s*$|\b(single|married|unmarried|solo) (parents?|moms?|mothers?|dads?|fathers?)\b[^.]{0,20}\b(need not apply|not (accepted|eligible|considered)|only|preferred)\b|\b(parents|mothers|moms|mums|fathers|dads|pregnant women)\b[^.]{0,30}\b(need not apply|not (accepted|eligible|considered))\b|\b(pregnant|married|single|unmarried)\s+(applicants|candidates|women|men|people)?\s*[^.]{0,20}\bneed not apply\b|\b(with|having|who have)\s+((young|small|little|school-age)\s+)?(kids|children|dependents|a family|a baby|babies|toddlers)\b[^.]{0,30}\bneed not apply\b|\b(no|not)\s+pregnant\s+(applicants|candidates|women|people|staff|workers|employees)\b|\bpregnant (applicants|candidates)\b`,
  // Children and family plans. "Do you have a family plan?" and "kids meals" are products (the seventh review).
  String.raw`\bdo you (have|plan to have) (any |a |an )?((young|small|little|school-age|grown)\s+)?(children|(?<=\b(a|any)\s+((young|small|little|school-age|grown)\s+)?)(child|baby)|kids|family|dependents|babies|toddlers?|childcare|child care|nanny|babysitter)\b(?!'|[\s-]+(plans?|meals?|menus?|packages?|discounts?|accounts?|rates?|tickets?|pass(es)?|rooms?|suites?|sections?|clubs?|activit(y|ies)|programs?|options?|deals?|bundles?|polic(y|ies)|coverage|friendly|zones?|areas?|toys?|books?|cloth(es|ing)|shoes|products?|items?|versions?|modes?|seats?|insurance|members(hips?)?|cards?|events?|tours?|classes?|camps?|content|games?|apps?|services?|support|experience|doctor|practice|medicine|business|owned|run|history|names?|discount|beds?|cribs?|strollers?|formula|food|gear|wipes|diapers|nappies|sizes?|benefits?|allowances?|subsid(y|ies)|cent(er|re)s?|facilit(y|ies)))|\bhow many (children|kids|dependents) do you have\b|\bnumber of (children|dependents)\b|\bplanning (a family|to (have|start) (children|kids|a family|a baby)|on (having|starting) (children|kids|a family|a baby))\b|\bplans? (to|on|of|for) (have|having|start|starting|get|getting) (children|kids|a family|a baby|pregnant)\b|\bno (kids|children)\b[^.]{0,25}\bpreferred\b|\bmust not have (any )?(children|kids)\b`,
  // The seventh review: "Do you plan to get pregnant?", "Who takes care of your children during your shift?", "How will you manage childcare?".
  // Never "If you get pregnant, you keep your HMO" (a benefit) or "How do you handle children who call in?".
  String.raw`\b(do|will|would|are|have) you\b[^.?!]{0,30}\b(get|getting|become|becoming) pregnant\b|\bwho\s+(takes care of|will take care of|looks after|will look after|watches|will watch|minds|will mind|cares for|will care for|babysits|will babysit)\s+your\s+(children|kids|child|baby|babies|toddlers?|little ones|son|daughter)\b|\bhow (will|would|do|can|are) you\s+(going to\s+)?(manage|arrange|sort out|plan|juggle|balance|handle)\s+(child ?care|childcare|babysitting|your (kids|children|family|family life))\b|\b(does|do|what does|where does) your (spouse|husband|wife) (work|do)\b|\bwhat('?s| is) your (spouse|husband|wife)'?s? (job|occupation|work)\b|\bdoes your (spouse|husband|wife) (agree|approve|allow|mind|support)\b`,
  // "No children (more flexible)", "Family commitments (fewer is better)": a ranking factor (the sixth review).
  // Never a club, a menu or a customer without children ("A caller with no kids asks about the family package"; the seventh review).
  String.raw`(?<!\b(customers?|callers?|guests?|clients?|members?|patients?|couples?|users?|travel+ers?|passengers?|tenants?|buyers?|shoppers?|visitors?|persons?|people|wom[ae]n|m[ae]n|famil(y|ies)|households?|adults?|someone|anyone)\s+(with|who (have|has)|having|has|have)\s+)\b(no|without|fewer|zero)\s+(kids|children|dependents)\b(?!\s*(under|below|younger|over|aged?|age|may|can|allowed|are|in|at|on|policy|accounts?|menu|programs?|discounts?|clubs?|meals?|sections?|areas?|zones?|pools?|activities|packages?|rooms?|events?|['’]))|\b(no|fewer|few|less|minimal|without|free (of|from)) family (commitments|obligations|responsibilities|ties)\b|\bfamily (commitments|obligations|responsibilities|ties)\s*\(?\s*(fewer|few|less|none|no|minimal|lower)\b`,
  String.raw`\bilang taon ka\b|\bkaarawan mo\b|\b(what|which) generation (are you|do you (belong|fall))\b|\byour generation\b`,
  String.raw`\bsingle\s*\/\s*married\b(?!\s+filing)|\bmarried\s*\/\s*single\b(?!\s+filing)`,
  String.raw`\bin (your|my) (20s|30s|40s|twenties|thirties|forties)\b`,
  // "Male or female, 21-35"; never "Female callers make up 60-70% of our line".
  String.raw`\b(male|female)\b(?!\s+(callers?|customers?|patients?|clients?|users?|members?|players?|guests?|students?|shoppers?|viewers?|audience))[^.]{0,20}\b\d{2}\s*(-|–|to)\s*\d{2}\b${UNITS}`,
  // A preference for young applicants. "Fresh graduates welcome" is an open door; "preferably fresh graduates" a filter (the sixth review),
  // and so are "Must be a fresh graduate" and a line that is only "Fresh graduate" (the seventh review).
  String.raw`\b(fresh|recent|new)\s+(college\s+|university\s+)?grad\w*\b[^.]{0,20}\b(only|preferred|required|need apply|a plus|an advantage|status|priority|first\s*$)|\bonly\s+(fresh|recent|new)\s+grad|\b(preferabl[ey]|prefer|preference for|priority (to|for)|prioriti[sz]e)\s+(a\s+)?(fresh|recent|new)\s+(college\s+|university\s+)?grad|\b(must|should|need to|needs to|has to|have to)\s+be\s+(an?\s+)?(fresh|recent|new)\s+((college|university|high school|senior high)\s+)?grad\w*|^\s*[-•*]?\s*(an?\s+)?(fresh|recent|new)\s+((college|university)\s+)?grad(uate)?s?\s*(\([^)]*\))?\s*[.!]?\s*$`,
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
  // "35yo and below", "Must be 25yo+" too (the seventh review).
  String.raw`\b\d{2}\s*(years?|yrs?)[\s-]*(old|of age)\b|\b\d{2}\s*y\/o\b|\b\d{2}\s*y\.o\.?(?=\W|$)|\b\d{2}\s*yo\b`,
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
  String.raw`\b(must|should|need to|needs to|has to|have to)\s+(not\s+)?be\s+(at least\s+|over\s+|under\s+|below\s+|above\s+|older than\s+|younger than\s+|more than\s+|less than\s+|no more than\s+|not more than\s+|not older than\s+|no older than\s+|between\s+)?\d{2}\b${UNITS}`,
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
  String.raw`\b(under|over)-${AGE}s\b|\b${AGE}\s*((-|–|to)\s*${AGE})?[\s-]*(year|yr)[\s-]*olds\b`,
  String.raw`\b(preferabl[ey]|ideally)\s+(${AGE}\s*(-|–|to)\s*${AGE}\b${UNITS}|${AGE}\s*(and|or)\s+(below|under|younger|above|older|over)\b|(under|below|over|above|younger than|older than)\s+${AGE}\b${UNITS})`,
  String.raw`\bbetween\s+${AGE}\s+(and|to)\s+${AGE}\s+(only|preferred)\b|^\s*[-•*]?\s*between\s+${AGE}\s*(and|to|-|–)\s*${AGE}\s*(only|preferred)?\s*[.!]?\s*$`,
  // "Confirm they are 21 or older", "if you are over 25".
  String.raw`\b(they|you|he|she)\s+(are|is|be|were)\s+(${AGE}\s*(or|and)\s+(older|over|above|younger|under|below)\b|${AGE}\s*\+|(over|under|at least|older than|younger than|below|above)\s+${AGE}\b${UNITS})`,
  // A decade of life: "in their 20s", "mid-30s".
  String.raw`\bin (his|her|their) (20s|30s|40s|50s|twenties|thirties|forties|fifties)\b|\b(early|mid|late)[\s-]?(20s|30s|40s|twenties|thirties|forties)\b`,
  // A birth or graduation year: "Born after 1995", "Born 1990-2000", "Graduated 2020 or later", "Born in the 90s",
  // "Graduates from 2020 onwards" (the seventh review).
  String.raw`\bborn\s+((in|after|before|between|from|since|later than|earlier than|on or (after|before))\s+)?${YEAR}\b(\s*(-|–|to|and)\s*${YEAR}\b)?`,
  String.raw`\bborn\s+(in\s+)?(the\s+)?((early|mid|late)[\s-]+)?('?(50|60|70|80|90)s|19[5-9]0s|20[01]0s|fifties|sixties|seventies|eighties|nineties)\b`,
  String.raw`\b(graduated?|graduates?|graduating|grads?|batch(es)?|class(es)? of)\s+((in|from)\s+)?${YEAR}\s*(or|and)\s+(later|after|newer|more recent|earlier|before|older|above|below|up|onwards?)\b|\b(graduated?|graduates?|grads?|batch(es)?)\s+(after|before|since)\s+${YEAR}\b|\b(graduat\w*|batch(es)?|class(es)? of)\s+${YEAR}\s*(-|–|to)\s*${YEAR}\b|\b(batch(es)?|class(es)? of|graduates? (of|from))\s+${YEAR}\b[^.]{0,20}\b(only|preferred|need apply)\b|\b(graduated?|graduates?|graduating|grads?|batch(es)?|class(es)? of)\s+((in|from|of)\s+)?${YEAR}\s*(onwards?\b|and beyond\b|\+)`,
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
// (HIRING_CUE: "We prefer people under 30").
const SOMEONE_ELSE = new RegExp(String.raw`\b(customers?|clients?|callers?|(?<!\b(be|very|more|stay|remain|and|being|so|is|are)\s)patients?|members?|users?|players?|gamers?|guests?|child|children|kids?|students?|seniors?|senior citizens|parents?|policyholders?|account (holders?|owners?)|cardholders?|borrowers?|buyers?|shoppers?|drivers?|famil(y|ies)|travel+ers?|residents?|readers?|viewers?|subscribers?|visitors?|son|daughter|mother|father|grandmother|grandfather|grandparents?|she|he|they|minors?|teens?|teenagers?|toddlers?|babies|infants?|adults?|elderly|retirees?|pensioners?|tenants?|homeowners?|guardians?|beneficiar(y|ies)|dependents?|insured|consumers?|passengers?|riders?|learners?|audiences?|fans?|help|helps|helping|serve|serves|serving|assist|assists|assisting|care for|caring for|people|persons?|folks|individuals?|wom[ae]n|m[ae]n|lad(y|ies)|gentlem[ae]n|clientele|owners?|someone|anyone|(${APPLIED_PREFIX})\s+applicants?|applicants?\s+for\s+(an?\s+|our\s+|the\s+|their\s+|its\s+)?(${APPLIED_FOR}))\b`, "gi");
// Words for a person that are the applicant when the sentence is hiring them.
const NEUTRAL_PERSON = /^(people|persons?|folks|individuals?|wom[ae]n|m[ae]n|lad(y|ies)|gentlem[ae]n|someone|anyone|adults?)$/i;
const HIRING_CUE = /\b(prefer\w*|want\w*|seek\w*|hiring|hire|looking for|need\w*|welcom\w*|accept\w*|only|ideal\w*|candidates?|applicants?|open to|calling all|must be|should be|preferabl[ey]|recruit\w*|employ\w*|join)\b[\s:,-]*((an?|the|our|young|younger|older|energetic|[\w-]+)\s+){0,2}$/i;
// The applicant, or the people being hired. A loan's or a card's applicants are customers (APPLIED_FOR).
const APPLICANT = new RegExp(String.raw`\b(applicants?(?<!\b(${APPLIED_PREFIX})\s+applicants?)(?!\s+for\s+(an?\s+|our\s+|the\s+|their\s+|its\s+)?(${APPLIED_FOR})\b)|candidates?|ideal|we('re| are) (looking|hiring|seeking)|seeking|looking for|hiring|hire|prefer\w*|want(ed)?|agents?|reps?|representatives?|staff|hires|team members?|you|your)\b|^\s*[-•*]?\s*must\b`, "gi");
// "Students aged 18-22 preferred", "Seniors aged 60+ are welcome to apply", "Ideal for retirees aged 55 and over": a preference
// for applicants of an age, whoever they are (the seventh review). Never "preferred seating" or "only" (a senior discount).
const PREFERRED_AFTER = /^[^.]{0,40}?\b(preferred|need not apply|(are |is )?(welcome|encouraged|invited) to apply|may apply|can apply|should apply)\s*([.!,;:)]|$|for (this|the) (role|job|position|team)\b)/i;
const IDEAL_FOR = /^\s*[-•*]?\s*((this|the) (job|role|position|work) is\s+)?(ideal|perfect|great|suitable|best suited)\s+for\b/i;
// …unless the people are plainly customers: "Ideal for customers aged 60+" describes a plan.
const CUSTOMER_WORD = /^(customers?|clients?|callers?|patients?|members?|users?|players?|gamers?|guests?|policyholders?|subscribers?|cardholders?|borrowers?|buyers?|shoppers?|passengers?|travel+ers?|consumers?|tenants?|account (holders?|owners?))$/i;
// "A 70-year-old caller", "a 16-year-old", "our 10 years old company", an app rated "18+".
const SOMEONE_ELSE_AT = /^(an?|the|our|this|my)\s+\d{2}[\s-]*(years?|yrs?)[\s-]*old\b|^\d{2}[\s-]*(years?|yrs?)[\s-]*old\s+(company|business|brand|firm|clinic|store|shop|app|website|platform|product|account|car|house)\b/i;
const SOMEONE_ELSE_AFTER = /^[^.]{0,15}\b(game|games|ratings?|rated|app|apps|content|movie|plan|plans|account|accounts|discount|discounts)\b/i;
// An age limit on a product or for a customer: "the minimum age for a kid's savings account", "age limits on our insurance plans".
const THING_AFTER = /^\s*(for|on|of|in|under|does|do|that|your|our|the|each|every|to)\b[^.:]{0,40}\b(plans?|accounts?|polic(y|ies)|insurance|coverage|cards?|loans?|products?|tickets?|cases?|claims?|games?|apps?|content|movies?|programs?|courses?|memberships?|discounts?|services?|tours?|trips?|classes?|camps?|vaccines?|benefits?|subscriptions?|tiers?|customers?|clients?|patients?|members?|users?|kids?|child(ren)?|minors?|students?|policyholders?|riders?|passengers?|guests?|players?)\b/i;
// "The plan's age limit": a product's.
const THING_BEFORE = /\b(plan|account|policy|insurance|product|program|card|loan|course|membership|game|app|service|tour|class|camp|subscription)('?s)?\s*$/i;
// With a number too (the seventh review): "our youth plan for ages 18 to 25", "our ages 18-30 travel program", "our over-50s insurance line".
// Never the job's own program ("Our internship program is for ages 18-24").
const JOB_PROGRAM = String.raw`(?<!\b(training|internship|intern|trainee|apprenticeship|ojt|work|job|career|hiring|recruitment|graduate|management|leadership)\s+)`;
const PRODUCTS = String.raw`plans?|programs?|programmes?|insurance|polic(y|ies)|products?|accounts?|cards?|loans?|courses?|memberships?|tours?|trips?|classes?|camps?|subscriptions?|discounts?|coverage|packages?|lines?|fares?|rates?|tickets?|tiers?|bundles?`;
const THING_FOR = new RegExp(String.raw`\b${JOB_PROGRAM}(${PRODUCTS})('?s)?\s+((is|are)\s+)?(for|covering|covers|open to|available (to|for)|limited to|restricted to)\s*$`, "i");
// Right after the age, with no "for our" between: never "Agents aged 21-35 for our insurance line".
const THING_NEXT = new RegExp(String.raw`^[\s\d+–-]*((years?|yrs?)\s*(old)?\s*)?(and (up|over|above)\s+)?((?!(and|or|with|for|to|in|on|at|of|our|the|a|an|your|this)\b)[\w'-]+\s+){0,2}${JOB_PROGRAM}(${PRODUCTS})\b`, "i");
// "Our clinic, 30 years old this year, …", "Our company is 25 years old", "Founded in 1999, our clinic is 25 years old":
// the business's own age, as the sentence's (or the clause's) subject (the seventh review).
const BUSINESS_FIRST = /(^|[,;:]\s*)(our|the|this|a|an)?\s*([\w'-]+\s+){0,2}(company|business|brand|clinic|firm|store|shop|startup|agency|practice),?\s*((is|was|has been|turned|turns|will be|will turn|just turned)\s+((now|over|almost|nearly|about|already)\s+)?)?$/i;
// "Our company was born in 2015".
const THING_BORN = /\b(company|business|brand|idea|startup|clinic|store|firm|shop|app|platform|product|it|we)\b[^.]{0,20}\b(was|were)\s*$/i;

/**
 * Everyone a sentence names, read once (a long sentence stays fast): the people who are not the applicant,
 * and where the applicant is named. "People" right after "We prefer", and in "Women aged 25-35 only", are the
 * ones hired.
 */
function peopleIn(sentence: string): { others: Array<{ end: number; word: string }>; applicants: number[] } {
  const endsOnly = /\bonly\s*[.!)]?\s*$/i.test(sentence);
  const others: Array<{ end: number; word: string }> = [];
  for (const m of sentence.matchAll(SOMEONE_ELSE)) {
    const at = m.index ?? 0;
    if (NEUTRAL_PERSON.test(m[0]) && (endsOnly || HIRING_CUE.test(sentence.slice(Math.max(0, at - 40), at)))) continue;
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

function sentenceAsks(raw: string): boolean {
  const sentence = numbersAsDigits(raw);
  if (ALWAYS.test(sentence)) return true;
  // "Fresh graduates only, customer service training" names the job, not a customer; so do "customer chats".
  const plain = sentence.replace(/\b(customer|client|patient|member|user|caller|guest|player)\s+(service|support|care|success|experience|chats?|calls?|emails?|tickets?|complaints?|questions?|accounts?|issues?|quer(y|ies)|orders?|data|records?|inquir(y|ies)|requests?|satisfaction|feedback|needs|relations|portal|information|details|concerns|interactions?|facing)\b/gi, "service work");
  const matches = ageMatches(plain);
  const people = matches.length > 0 ? peopleIn(plain) : { others: [], applicants: [] };
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
    // "A 70 year old patient": an article, then the age, then the person. Never "born in the 90s" (a decade; the seventh review).
    if (digit >= 0 && !/^\d{2}s\b/i.test(fromNumber) && /\b(an?|the|our|this|my)\s*$/i.test(plain.slice(Math.max(0, m.at - 20), m.at + digit))) continue;
    // The person it belongs to is the last one named before it: "Are you comfortable helping
    // patients aged 65" is the patients', "Patients call us; agents aged 21-35" the agents'.
    // Unless the sentence prefers applicants of that age, whoever they are ("Students aged 18-22 preferred").
    const other = lastBy(people.others, (o) => o.end, m.at);
    const applicantEnd = lastBy(people.applicants, (end) => end, m.at) ?? -1;
    const preferred = !CUSTOMER_WORD.test(other?.word ?? "") && (PREFERRED_AFTER.test(plain.slice(m.at)) || IDEAL_FOR.test(before));
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
  return sentencesOf(text).some(sentenceAsks);
}

// What a reviewer writes about the applicant, in the third person. Never
// "her husband" or "his wife": a customer's spouse is an everyday privacy case
// in the practice chats (scenarioPacks.ts).
const ABOUT_APPLICANT = re([
  String.raw`\b(her|his|their|the (candidate|applicant)'?s|candidate'?s|applicant'?s)\s+(own\s+)?(age|marital status|civil status|pregnancy|children|kids|family (situation|status|plans|life|commitments|obligations|responsibilities))\b`,
  // Never "single-minded", "single-handedly" or "married to the script" (the seventh review).
  String.raw`\b(candidate|applicant|she|he|they)\s+(is|are|seems?|appears?|looks?|sounds?)\s+(too\s+|very\s+|quite\s+|rather\s+|fairly\s+|relatively\s+)?(young|old|older|younger|elderly|mature|youthful|married\b(?!\s+to\s+((the|this|that|a|an|her|his|their)\s+)?(script|scripts|process|job|work|rules|idea|routine|method|template|playbook))|single\b(?!-)|pregnant|a (mother|father|mom|dad|parent)|a single (mother|mom|father|dad|parent))\b`,
  // "Seems too young to lead"; never "their laptop is too old", "too old-fashioned for chat" or "a very old example".
  String.raw`(?<!\b(laptop|computer|device|phone|browser|headset|machine|pc|system|software|equipment|headphones|tone|style|wording|language|example|examples|reference|references|approach|script|template|slang|joke|jokes|phrasing)\b[^.]{0,30})\b(too|very|rather|relatively)\s+(young|old)\b(?=\s*([,.;:!?)]|$|to\b|for\b|and\b|but\b|so\b|compared\b|relative\b|than\b))`,
  String.raw`\b(young|younger|older|elderly|youthful|mature)\s+(candidate|applicant)\b`,
  String.raw`\b(mother|father|mom|mum|dad|parent) of (one|two|three|four|five|six|\d+|twins|a (newborn|baby|toddler)|an infant|(young|small|little) (kids|children|ones))\b|\b(single|working|stay-at-home|new|young) (mother|mom|father|dad|parent)\b`,
  String.raw`\b(has|have|having|with|lives with|living with) (her |his |their )?(young |small |little |\d+ |one |two |three |four )?(kids|children|a baby|a family|dependents|a newborn|a toddler|toddlers|an infant|twins|a child)\b(?![\s-]+(business|owned|run|plan|medicine|practice|doctor|clinic|members?))`,
  String.raw`\bpregnan\w*\b|\b(family|childcare|child care|parenting) (duties|responsibilities|obligations|commitments)\b`,
  // The seventh review: an age named ("Mentions being 45", "At 45, she may struggle", "Only 19, may lack maturity"), age next to
  // the team, retirement, a new baby, a marriage, parental leave, childcare against the shift.
  String.raw`(?<!\b(company|business|brand|clinic|firm|store|shop|startup|agency|practice|team|it)\s+)\b(being|turned|turning)\s+${AGE}\b(?=\s*([,.;:!?)]|$|(this|next|last|soon|years?|in|on|and|so|which|but)\b))|^\s*(at|only|just|aged?)\s+${AGE}\s*(years old\s*)?[,;:]\s*(she|he|they|the candidate|the applicant|may|might|could|is|seems|probably|likely)\b`,
  String.raw`\b(older|younger) than (the rest of |most of |all of )?(the |his |her |their |our |other |most )?(team|teammates|colleagues|peers|others|agents|staff|team members|applicants|candidates|rest)\b`,
  String.raw`\b(close to|near|nearing|approaching|reaching|past) (the )?retirement( age)?\b|\b(about|due|planning|plans|going|set) to retire\b|\bretiring soon\b|\b(she|he|they|candidate|applicant)\s+(is|was|are)\s+(semi-)?retired\b`,
  String.raw`\b(just|recently) had (a baby|a child|twins|a son|a daughter)\b|\bbaby on the way\b|\bexpecting (a baby|a child|twins)\b`,
  String.raw`\b(recently|newly|just|getting|soon to be|about to be|planning to get|plans to get) (married|wed|engaged|divorced)\b|\bnewly ?weds?\b`,
  String.raw`\b(on|back from|returning from|returned from|going on|due for|currently on|after) (her |his |their )?(maternity|paternity|parental) leave\b`,
  String.raw`\b(childcare|child care|babysitter|school runs?)\b[^.]{0,40}\b(clash|clashes|conflict|conflicts|limit|limits|risk|issue|problem|hard|harder|difficult|unlikely|unclear|get in the way|interfere)\b`,
]);
const NAMES_SOMEONE_ELSE = /\b(customers?|clients?|callers?|(?<!\b(be|very|more|stay|remain|and|being|so|is|are)\s)patients?|members?|users?|players?|guests?|policyholders?|account holders?|borrowers?|buyers?|shoppers?|students?|residents?|parents?)\b/i;
// "The single mom", "the new mom", "the father who has small kids on the line", "the newlywed couple": a person in a practice case, never the applicant
// (who is "she", "the candidate" or "a single mom"; the seventh review).
const THE_PERSON = /\b(the|that|this)\s+([\w'-]+\s+){0,2}(woman|man|lady|gentleman|mother|father|mom|mum|dad|grandmother|grandfather|grandma|grandpa|couple|wife|husband|widow|widower)\b(?!\s+of\s+(one|two|three|four|five|\d+)\b)/i;

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
  return sentencesOf(text).some((sentence) => sentenceAsks(sentence) || (!NAMES_SOMEONE_ELSE.test(sentence) && !THE_PERSON.test(sentence) && ABOUT_APPLICANT.test(numbersAsDigits(sentence))));
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
  if (texts.some((option) => /\b(years?\s*old|yrs?\s*old|y\/o|of age|age|born|birth|marital|civil status|\d0s|twenties|thirties|forties)\b/i.test(option) && asksAgeOrStatus(option))) return true;
  const q = typeof question === "string" ? question : "";
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
