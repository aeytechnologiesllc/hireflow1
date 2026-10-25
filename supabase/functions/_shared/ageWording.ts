/**
 * No age, birth date or marital status in what the job writers produce
 * (2026-10-25; the second to sixth Phase 6 reviews).
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
 *     "Dependents"), a question to them ("How old are you?", "Are you under
 *     30?", "Which age group are you in?", "Do you plan to have children?",
 *     "Are you a parent?"), "fresh graduates only" or "preferably fresh
 *     graduates", a young team or young agents wanted, a generation
 *     preferred, "single applicants preferred", "no children";
 *   - an age ("21-35 years old", "aged 21-30", "at least 21 years of age",
 *     "must be over 21", "ages 18-30", "21+ only", "in their 20s", "born
 *     after 1995", "of legal age", "age limit"): the applicant's unless the
 *     person it is attached to, the last one named before it, is someone
 *     else ("patients aged 65 and older", "Are you comfortable helping
 *     patients aged 65 and older?", "a 70-year-old caller", "check that the
 *     customer is of legal age", "a 10 years old company"), or an age limit
 *     belongs to a product ("the minimum age for a kid's savings account").
 *     The sixth review: a 40-character window decided whether the applicant
 *     was named in between, so the same idea passed or failed by phrasing.
 * A time, a score, a speed, a distance or a number of hours is never an age
 * ("must be under 10 minutes", "must be 30 km or less", "QA score must be 90
 * or higher", "CSAT should be 90 and above", "at least 18 months in your
 * current role", "24/7", "tickets aged 72 hours"), and a number near
 * "applicants" is not one either unless an age word goes with it
 * ("Applicants must type 40-50 WPM", "Candidates must work 12-hour shifts").
 *
 * marksAgeOrFamily is the same rule for what a reviewer writes ABOUT an
 * applicant (the written interview's grader, the interview guide): "a mother
 * of three", "seems too young", "her children".
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

// About the applicant, whatever else the sentence says.
const ALWAYS = re([
  // A form label on its own line, with an optional "(MM/DD/YYYY)" or "(optional)".
  String.raw`^\s*[-•*]?\s*(your\s+)?(age|date of birth|birth ?date|birthday|birth year|dob|d\.o\.b\.?|year of birth|year born|marital status|civil status|relationship status|edad|kaarawan|petsa ng kapanganakan|age range|age group|age bracket|dependents|number of (dependents|children|kids)|no\.? of (dependents|children|kids)|children|kids|generation|graduation year|year graduated|spouse|spouse'?s name|maiden name)\s*(\([^)]*\))?\s*[:?]?\s*$`,
  String.raw`^\s*[-•*]?\s*(marital|civil|relationship) status\s*(\([^)]*\))?\s*:`,
  String.raw`^\s*[-•*]?\s*status\s*:\s*(single|married|widowed|separated)\b`,
  String.raw`^\s*[-•*]?\s*(age|edad)\s*(range|group|bracket)?\s*:`,
  String.raw`\bedad\b`,
  // A question to the applicant, or a request to tell.
  String.raw`\bhow old (are you|are u|r u|will you be|you are|you'?ll be)\b`,
  // "Your birthday" is a question, "a paid day off on your birthday" a benefit (the sixth review).
  String.raw`\byour (age|date of birth|birth ?date|birth year|year of birth|marital status|civil status|relationship status)\b|(?<!\b(on|for)\s)\byour birthday\b(?!\s+(off|leave|bonus|gift|treat|perk))`,
  // "Which age range your family plan covers" is the plan's, not the applicant's.
  String.raw`\byour\s+((own|exact|current)\s+)?age (range|group|bracket)\b|\bage (range|group|bracket)\b[^.?!]{0,30}\b(are you|you are|you're|do you|you belong|you fall|you fit)\b|^\s*[-•*]?\s*(please\s+)?(select|choose|pick)\s+(your\s+)?age\b`,
  String.raw`\b(state|enter|give|provide|list|indicate|include|share|tell us)\s+your\s+(age|birth ?date|date of birth|year of birth|marital status|civil status|birthday)\b|^\s*[-•*]?\s*(state|enter|give|provide|list)\s+(age|birth ?date|date of birth|year of birth|marital status)\b`,
  String.raw`\b(name|location|address),\s*(and\s+)?age\b|\bage,\s*(and\s+)?(location|name|where you)\b|\bname and age\b|\bage and (civil|marital) status\b`,
  String.raw`\bwhat'?s your age\b|\bwhat is your age\b`,
  String.raw`\bare you\s+(\d{2}\b${UNITS}|(over|under|above|below|between|at least)\s+\d{2}\b${UNITS}|older than|younger than|of legal age|a (fresh|recent|new) grad\w*|married|single\b(?!-)|pregnant|expecting (a baby|a child|twins)|a (parent|mother|father|mom|dad)\b|a single (parent|mother|mom|father|dad)\b|planning (to have|on having|to start|on starting) (a family|kids|children|a baby)|(a )?(millennial|gen ?z|digital native))`,
  String.raw`\b(what|which) year (were you born|did you (graduate|finish (high )?school|finish college|finish university))\b|\bwhen were you born\b|\bwhen is your birthday\b|\byear (you were|were you) born\b`,
  String.raw`\bwhen did you graduate\s*\?|\bwhen did you graduate (from )?(high school|college|university|senior high)\b|\bwhen did you finish (high )?school\b|\bwhen did you finish (college|university)\b`,
  String.raw`\byear (you )?graduated\b|\b(graduation year|year of graduation)\b|\byear born\b|\byears since you graduated\b`,
  // Marital status.
  String.raw`\bmarried or single\b|\bsingle,? (or )?married\b|\b(must|should|need to|needs to|has to|have to)\s+(not\s+)?be\s+(single|married|unmarried|pregnant|childless)\b|\b(single|married|unmarried) (applicants|candidates|people|women|men|only|preferred)\b|\bpreferabl[ey]\s+(single|married|unmarried|childless)\b|^\s*[-•*]?\s*(not married|unmarried|single only|childless|no kids|no children)\s*[.!]?\s*$|\b(single|married|unmarried|solo) (parents?|moms?|mothers?|dads?|fathers?)\b[^.]{0,20}\b(need not apply|not (accepted|eligible|considered)|only|preferred)\b|\b(parents|mothers|moms|fathers|dads|pregnant women)\b[^.]{0,15}\bneed not apply\b`,
  // Children and family plans.
  String.raw`\bdo you (have|plan to have) (any )?((young|small|little|school-age|grown)\s+)?(children|kids|a family|dependents|a baby|babies|toddlers?)\b(?!')|\bhow many (children|kids|dependents) do you have\b|\bnumber of (children|dependents)\b|\bplanning (a family|to (have|start) (children|kids|a family|a baby)|on (having|starting) (children|kids|a family|a baby))\b|\bplans? (to|on) (have|having|start|starting) (children|kids|a family|a baby)\b|\bno (kids|children)\b[^.]{0,25}\bpreferred\b|\bmust not have (any )?(children|kids)\b`,
  // "No children (more flexible)", "Family commitments (fewer is better)": a ranking factor (the sixth review).
  String.raw`\b(no|without|fewer|zero)\s+(kids|children|dependents)\b(?!\s*(under|below|younger|over|aged?|age|may|can|allowed|are|in|at|on|policy|accounts?|menu|programs?|discounts?|['’]))|\b(no|fewer|few|less|minimal|without|free (of|from)) family (commitments|obligations|responsibilities|ties)\b|\bfamily (commitments|obligations|responsibilities|ties)\s*\(?\s*(fewer|few|less|none|no|minimal|lower)\b`,
  String.raw`\bilang taon ka\b|\bkaarawan mo\b|\b(what|which) generation (are you|do you (belong|fall))\b|\byour generation\b`,
  String.raw`\bsingle\s*\/\s*married\b(?!\s+filing)|\bmarried\s*\/\s*single\b(?!\s+filing)`,
  String.raw`\bin (your|my) (20s|30s|40s|twenties|thirties|forties)\b`,
  // "Male or female, 21-35"; never "Female callers make up 60-70% of our line".
  String.raw`\b(male|female)\b(?!\s+(callers?|customers?|patients?|clients?|users?|members?|players?|guests?|students?|shoppers?|viewers?|audience))[^.]{0,20}\b\d{2}\s*(-|–|to)\s*\d{2}\b${UNITS}`,
  // A preference for young applicants. "Fresh graduates welcome" is an open door; "preferably fresh graduates" a filter (the sixth review).
  String.raw`\b(fresh|recent|new)\s+(college\s+|university\s+)?grad\w*\b[^.]{0,20}\b(only|preferred|required|need apply|a plus|an advantage|status|priority|first\s*$)|\bonly\s+(fresh|recent|new)\s+grad|\b(preferabl[ey]|prefer|preference for|priority (to|for)|prioriti[sz]e)\s+(a\s+)?(fresh|recent|new)\s+(college\s+|university\s+)?grad`,
  // "A young brand" is the company's age, not a wish for young staff.
  String.raw`\byoung(er)?\b(?!\s+(brand|company|companies|business|startup|firm|clinic|store|shop|app|product|industry|market|organi[sz]ation))[,\s]+(and\s+)?([\w-]+[,\s]+){0,3}(team|team players?|talent|blood|crowd)\b|\byoung,?\s+(and\s+)?(energetic|dynamic|vibrant|fresh|fun)\b|\byouthful,?\s+(and\s+)?(energy|energetic|team|vibe)\b|\byouthfulness\b|^\s*[-•*]?\s*youthful\s*[.!]?\s*$`,
  // Hiring young people; never helping them ("hiring agents to help young professionals find apartments").
  String.raw`\b(want|wants|wanted|seeking|looking for|hiring|hire|prefer|preferred|welcome|only|need|needs)\b(?:(?!\b(help|helps|helping|support|supports|supporting|serve|serves|serving|assist|assists|assisting|guide|guiding|reach|reaching|sell|selling|for|with|from)\b)[^.]){0,30}\byoung(er)?\b[,\s]+([\w-]+[,\s]+){0,2}(people|person|applicants?|candidates?|agents?|reps?|representatives?|staff|professionals?|workers?|employees?|graduates?|individuals?|talent|hires?|men|women|man|woman|guys?|girls?|ladies)\b|\byoung(er)?\s+(applicants|candidates)\b|\b(applicants|candidates|people|someone)\s+who\s+(are|is)\s+young\b|\byoung professionals (welcome|wanted|only|preferred)\b`,
  // A job title: "Young Customer Service Agent".
  String.raw`\byoung(er)?\s+((customer|client|patient|guest|member|tech(nical)?|phone|chat|email|call|contact|service|support|care|sales|night|virtual|remote|front|desk|office|shift|center|centre|bpo|cs|it|help)[\s-]+){0,3}(agents?|reps?|representatives?|associates?|specialists?|assistants?|advisors?|officers?|coordinators?|receptionists?|csrs?|staff|hires?|recruits?|team members?)\b`,
  // A generation wanted; never the customers described ("most of our customers are Gen Z, so…").
  String.raw`\b(millennials?|gen ?z|gen ?y|generation z|zoomers?|digital natives?)\b[^.,;:]{0,40}\b(preferred|only|applicants|candidates|reps|agents|wanted|mindset|need apply)\b|\(\s*(gen ?z|gen ?y|millennials?)\s*\)|\b(must be|should be|ideally|preferabl[ey])\s+(a\s+)?(millennial|gen ?z|digital native)`,
]);

// Ages. Each is the applicant's unless it is attached to someone else.
const AGE_NUMBER = [
  String.raw`\b\d{2}\s*(-|–|to)\s*\d{2}\s*(years?\s*old|yrs?\s*old|years? of age|y\.?\s?o\.?|y\/o)(?=\W|$)`,
  String.raw`\b\d{2}\s*(years?|yrs?)[\s-]*(old|of age)\b|\b\d{2}\s*y\/o\b|\b\d{2}\s*y\.o\.?(?=\W|$)`,
  // "21 years or older", "aged 18 and over"; never a bare "85 or above" (a score).
  String.raw`\b\d{2}\s*years?\s*(or|and)\s+(older|above|below|under|younger|over)\b|\b(be|aged?|ages?|applicants?|candidates?|persons?)\s+\d{2}\s*(or|and)\s+(older|above|below|under|younger|over)\b`,
  String.raw`\b(at least|over|under|below|above|not more than|no more than|not over|not older than|no older than|younger than|older than|max(imum)?|min(imum)?)\s+\d{2}\s*(years?\s*old|yrs?\s*old|years? of age|y\.?o\.?|y\/o)(?=\W|$)`,
  String.raw`\b(must|should|need to|needs to|has to|have to)\s+(not\s+)?be\s+(at least\s+|over\s+|under\s+|below\s+|above\s+|older than\s+|younger than\s+|more than\s+|less than\s+|no more than\s+|not more than\s+|not older than\s+|no older than\s+|between\s+)?\d{2}\b${UNITS}`,
  String.raw`\b(not|no)\s+(older|more)\s+than\s+\d{2}\b${UNITS}`,
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
  // A birth or graduation year: "Born after 1995", "Born 1990-2000", "Graduated 2020 or later".
  String.raw`\bborn\s+((in|after|before|between|from|since|later than|earlier than|on or (after|before))\s+)?${YEAR}\b(\s*(-|–|to|and)\s*${YEAR}\b)?`,
  String.raw`\b(graduated?|graduates?|graduating|grads?|batch(es)?|class(es)? of)\s+((in|from)\s+)?${YEAR}\s*(or|and)\s+(later|after|newer|more recent|earlier|before|older|above|below|up|onwards?)\b|\b(graduated?|graduates?|grads?|batch(es)?)\s+(after|before|since)\s+${YEAR}\b|\b(graduat\w*|batch(es)?|class(es)? of)\s+${YEAR}\s*(-|–|to)\s*${YEAR}\b|\b(batch(es)?|class(es)? of|graduates? (of|from))\s+${YEAR}\b[^.]{0,20}\b(only|preferred|need apply)\b`,
  String.raw`\bof legal age\b`,
  // An age limit by name: "Age cap: 35", "Max age: 35", "Age fit (21-35)".
  // Never "no age limit" or "suggests an age preference".
  String.raw`(?<!\b(no|not|any|never|without|as|hints? at|suggests?|suggesting|impl(y|ies|ying))\s+(an?\s+)?)\b((ideal|preferred|max(imum)?|min(imum)?|required)\s+age|age\s*(limits?|requirements?|range|ranges|brackets?|caps?|ceiling|preferences?|restrictions?|criteria|fit|qualifications?))\b`,
];
// A score, a time or a speed is the subject: "QA score must be 90", "reply time should be under 60".
const METRIC_SUBJECT = /\b(score|scores|rate|rates|speed|accuracy|csat|nps|aht|time|times|reply|replies|response|wpm|typing|qa|quality|sla|target|targets|internet|laptop|computer|ram|average)\b[^.]{0,25}$/i;
// …or the number is measured on something: "Should be 90 or above on the English test".
const METRIC_AFTER = /^[^.]{0,25}\b(on|in|for)\s+(the|a|an|our|your|each|every|all|this)?\s*([\w-]+\s+){0,2}(tests?|exams?|assessments?|quiz(zes)?|audits?|evaluations?|reviews?|scorecards?|surveys?|qa|csat)\b/i;
// Someone the age can belong to, or a verb that serves them ("helping patients aged 65").
// "Be patient" is a manner, not a patient.
const SOMEONE_ELSE = /\b(customers?|clients?|callers?|(?<!\b(be|very|more|stay|remain|and|being|so|is|are)\s)patients?|members?|users?|players?|gamers?|guests?|child|children|kids?|students?|seniors?|senior citizens|parents?|policyholders?|account (holders?|owners?)|cardholders?|borrowers?|buyers?|shoppers?|drivers?|famil(y|ies)|travel+ers?|residents?|readers?|viewers?|subscribers?|visitors?|son|daughter|mother|father|grandmother|grandfather|grandparents?|she|he|they|minors?|teens?|teenagers?|toddlers?|babies|infants?|adults?|elderly|retirees?|pensioners?|tenants?|homeowners?|guardians?|beneficiar(y|ies)|insured|consumers?|passengers?|riders?|learners?|audiences?|fans?|help|helps|helping|serve|serves|serving|assist|assists|assisting|care for|caring for)\b/gi;
// The applicant, or the people being hired.
const APPLICANT = /\b(applicants?|candidates?|ideal|we('re| are) (looking|hiring|seeking)|seeking|looking for|hiring|hire|prefer\w*|want(ed)?|agents?|reps?|representatives?|staff|hires|team members?|you|your)\b|^\s*[-•*]?\s*must\b/gi;
// "A 70-year-old caller", "a 16-year-old", "our 10 years old company", an app rated "18+".
const SOMEONE_ELSE_AT = /^(an?|the|our|this|my)\s+\d{2}[\s-]*(years?|yrs?)[\s-]*old\b|^\d{2}[\s-]*(years?|yrs?)[\s-]*old\s+(company|business|brand|firm|clinic|store|shop|app|website|platform|product|account|car|house)\b/i;
const SOMEONE_ELSE_AFTER = /^[^.]{0,15}\b(game|games|ratings?|rated|app|apps|content|movie|plan|plans|account|accounts|discount|discounts)\b/i;
// An age limit on a product or for a customer: "the minimum age for a kid's savings account", "age limits on our insurance plans".
const THING_AFTER = /^\s*(for|on|of|in|under|does|do|that|your|our|the|each|every|to)\b[^.:]{0,40}\b(plans?|accounts?|polic(y|ies)|insurance|coverage|cards?|loans?|products?|tickets?|cases?|claims?|games?|apps?|content|movies?|programs?|courses?|memberships?|discounts?|services?|tours?|trips?|classes?|camps?|vaccines?|benefits?|subscriptions?|tiers?|customers?|clients?|patients?|members?|users?|kids?|child(ren)?|minors?|students?|policyholders?|riders?|passengers?|guests?|players?)\b/i;
// "The plan's age limit": a product's.
const THING_BEFORE = /\b(plan|account|policy|insurance|product|program|card|loan|course|membership|game|app|service|tour|class|camp|subscription)('?s)?\s*$/i;
// "Our clinic, 30 years old this year, …": the business's own age, as the sentence's subject.
const BUSINESS_FIRST = /^\s*(our|the|this|a|an)?\s*([\w'-]+\s+){0,2}(company|business|brand|clinic|firm|store|shop|startup|agency|practice),?\s*$/i;
// "Our company was born in 2015".
const THING_BORN = /\b(company|business|brand|idea|startup|clinic|store|firm|shop|app|platform|product|it|we)\b[^.]{0,20}\b(was|were)\s*$/i;

/** The end of the last match of `pattern` in `text`, or -1. */
function lastEnd(pattern: RegExp, text: string): number {
  let end = -1;
  for (const m of text.matchAll(pattern)) end = (m.index ?? 0) + m[0].length;
  return end;
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

function ageMatches(sentence: string): Array<{ at: number; text: string }> {
  const out: Array<{ at: number; text: string }> = [];
  for (const pattern of AGE_NUMBER) {
    for (const m of sentence.matchAll(new RegExp(pattern, "gi"))) out.push({ at: m.index ?? 0, text: m[0] });
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
  for (const m of ageMatches(plain)) {
    const before = plain.slice(0, m.at);
    const digit = m.text.search(/\d/);
    // From the number itself ("Over 10 years old company" reads from "10").
    const fromNumber = plain.slice(m.at + Math.max(0, digit));
    const after = plain.slice(m.at + m.text.length);
    // A bare number ("must be 85", "be 90 and above") on a score, a time or a test.
    if (digit >= 0 && !/\b(years?|yrs?|y\.?o|y\/o|aged?|ages?|old|olds|born|graduat\w*|batch)\b|\d{2}s\b/i.test(m.text) && (METRIC_SUBJECT.test(before) || METRIC_AFTER.test(after))) continue;
    if (SOMEONE_ELSE_AT.test(fromNumber)) continue;
    // "A 70 year old patient": an article, then the age, then the person.
    if (digit >= 0 && /\b(an?|the|our|this|my)\s*$/i.test(plain.slice(0, m.at + digit))) continue;
    // The person it belongs to is the last one named before it: "Are you comfortable helping
    // patients aged 65" is the patients', "Patients call us; agents aged 21-35" the agents'.
    if (lastEnd(SOMEONE_ELSE, before) > lastEnd(APPLICANT, before)) continue;
    // "Ages 12+ game ratings", "the app is 18+": a product's rating.
    if ((/\+\s*$/.test(m.text) || /^\s*\+/.test(after)) && SOMEONE_ELSE_AFTER.test(after.replace(/^\s*\+/, ""))) continue;
    // "The minimum age for a kid's savings account", "age limits on our insurance plans".
    if (digit < 0 && (THING_AFTER.test(after) || THING_BEFORE.test(before))) continue;
    if (BUSINESS_FIRST.test(before)) continue;
    if (/^born\b/i.test(m.text) && THING_BORN.test(before)) continue;
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
  String.raw`\b(candidate|applicant|she|he|they)\s+(is|are|seems?|appears?|looks?|sounds?)\s+(too\s+|very\s+|quite\s+|rather\s+|fairly\s+|relatively\s+)?(young|old|older|younger|elderly|mature|youthful|married|single|pregnant|a (mother|father|mom|dad|parent)|a single (mother|mom|father|dad|parent))\b`,
  // "Seems too young to lead"; never "their laptop is too old".
  String.raw`(?<!\b(laptop|computer|device|phone|browser|headset|machine|pc|system|software|equipment|headphones)\b[^.]{0,30})\b(too|very|rather|relatively)\s+(young|old)\b`,
  String.raw`\b(young|younger|older|elderly|youthful|mature)\s+(candidate|applicant)\b`,
  String.raw`\b(mother|father|mom|dad|parent) of (one|two|three|four|five|six|\d+)\b|\b(single|working|stay-at-home|new|young) (mother|mom|father|dad|parent)\b`,
  String.raw`\b(has|have|having|with) (young |small |little |\d+ |one |two |three |four )?(kids|children|a baby|a family|dependents|a newborn)\b(?![\s-]+(business|owned|run|plan|medicine|practice|doctor|clinic|members?))`,
  String.raw`\bpregnan\w*\b|\b(family|childcare|child care|parenting) (duties|responsibilities|obligations|commitments)\b`,
]);
const NAMES_SOMEONE_ELSE = /\b(customers?|clients?|callers?|(?<!\b(be|very|more|stay|remain|and|being|so|is|are)\s)patients?|members?|users?|players?|guests?|policyholders?|account holders?|borrowers?|buyers?|shoppers?|students?|residents?|parents?)\b/i;

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
  return sentencesOf(text).some((sentence) => sentenceAsks(sentence) || (!NAMES_SOMEONE_ELSE.test(sentence) && ABOUT_APPLICANT.test(numbersAsDigits(sentence))));
}

// Options that only an applicant's own status answers.
const MARITAL_OPTION = /^\s*(single|married|separated|widowed|divorced|annulled|engaged|unmarried|in a relationship|living together|domestic partner(ship)?|civil union|legally separated|single parent|solo parent|married with (kids|children))\b(?!.*\bfiling\b)/i;
const GENERATION_OPTION = /^\s*(gen(eration)? ?(z|y|x|alpha)|millennials?|baby boomers?|boomers?|zoomers?|silent generation)\s*$/i;
const BRACKET_OPTION = /^\s*((under|below|over|above)\s+\d{2}|\d{2}\s*(-|–|to)\s*\d{2}|\d{2}\s*\+|\d{2}\s*(and|or)\s+(over|above|under|below|older|younger|up))\s*$/i;
// "Which range do you fall into?" with nothing to say what is measured.
const BRACKET_QUESTION = /\b(which|what)\b[^?]{0,25}\b(range|bracket|group|band|category)\b/i;
const MEASURED = /\b(hours?|wpm|speed|typing|calls?|chats?|tickets?|experience|years of|salary|pay|rate|budget|mbps|internet|minutes?|scores?|team|people|sales|price|cost|usd|php|size|volume|accuracy|shifts?|days?|weeks?|months?)\b|[$₱%]/i;

/**
 * A question with answer options: the question's own words decide first,
 * then the options. Any option that names an age or a birth year ("18-25
 * years old", "Born before 1990") drops the question. So do, when the
 * question names no customer: two or more marital statuses ("Single /
 * Married / Separated"), two or more generations ("Gen Z / Millennial"), or
 * age brackets under a question that says nothing else about what it measures
 * ("Which range do you fall into?" with "18-24 / 25-34"). Ordinary number
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
  return BRACKET_QUESTION.test(q) && /\byou\b/i.test(q) && !MEASURED.test(q) && texts.filter((option) => BRACKET_OPTION.test(option)).length >= 2;
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
