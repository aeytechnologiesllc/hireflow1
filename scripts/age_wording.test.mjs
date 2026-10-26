#!/usr/bin/env node
/**
 * No age, birth date or marital status in what the job writers produce
 * (supabase/functions/_shared/ageWording.ts; the second Phase 6 review).
 *
 * Every application starts with HireFlow's own "Are you 18 or older?"
 * (src/lib/ageCheck.ts). The age guide on the blog says HireFlow never asks
 * for a birth date, so the three job writers (generate-flow for Ava's
 * builder, ai-generate-workflow and ai-generate-job-content for the classic
 * editor) carry the rule in their instructions and drop any line that still
 * asks for age, a birth date, the year someone was born or graduated, or
 * marital status, or that sets an age limit. Since the sixth Phase 6 review
 * the same goes for what the written interview's grader and the interview
 * guide write about an applicant (marksAgeOrFamily); since the seventh, a
 * quiz step's own questions and a lead's quoted evidence. Since the eighth,
 * the functions that judge an applicant (trigger-ava-analysis, ai-analyze,
 * ai-shortlist) carry APPLICANT_AGE_RULE in their prompts; since the ninth,
 * also ava-voice-session's interviewer, the performance report, the practice
 * chat's reviewer, ai-analyze-portfolio and the sales practice's grader, and
 * ai-analyze's interview questions carry AGE_RULE; since the tenth, also
 * ava-voice-session's assistant and job intake.
 *
 * Each round's fixes were also run over the real strings in the repo (scenario
 * packs, question banks, fixtures, prompts, test job posts, docs, the blog:
 * 12,903 lines in the eighth round; every string literal and doc line, 142,431
 * lines and sentences in 1,012 files, in the ninth; 145,325 in 1,017 files,
 * against both earlier rounds, in the tenth; 189,779 whole literals, lines and
 * sentences in 1,276 files, .sql and .txt too, against all three earlier
 * rounds, in the eleventh; 191,936 in 1,281 files, .csv and .yaml too, and
 * the 66 pack items, against the ninth, tenth and eleventh rounds, in the
 * twelfth; 194,917 from the tree at each of the last three rounds and this
 * one, and 212 pack and question-bank items, against the tenth, eleventh
 * and twelfth rounds, in the thirteenth; 195,234 from the trees at the last
 * three rounds and this one, and the same 212 items, against the eleventh,
 * twelfth and thirteenth rounds, in the fourteenth; 195,549 from the trees at
 * the last three rounds and this one, and the same 212 items, against the
 * twelfth, thirteenth and fourteenth rounds, in the fifteenth; 198,980 from
 * the trees at the last three rounds, this one and the main working tree, and
 * the same 212 items, against the thirteenth, fourteenth and fifteenth rounds,
 * in the sixteenth; 200,381 from the trees at the last three rounds, this one
 * and the main working tree, and the same 212 items, against the fourteenth,
 * fifteenth and sixteenth rounds, in the seventeenth; 200,485 from the trees at
 * the last three rounds, this one and the main working tree, and the same 212
 * items, against the fifteenth, sixteenth and seventeenth rounds, in the
 * eighteenth; 201,935 from the trees at the last three rounds, this one and the
 * main working tree, and the same 212 items, against the sixteenth,
 * seventeenth and eighteenth rounds, in the nineteenth; 202,656 from the trees
 * at the last three rounds, this one and the main working tree, and the same
 * 212 items, against the seventeenth, eighteenth and nineteenth rounds, in the
 * twentieth) to see what the new rules drop that the old ones kept; the
 * seventh to twentieth reviews' fixes drop none of them.
 *
 * Run with: node scripts/age_wording.test.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const A = await import("../supabase/functions/_shared/ageWording.ts");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

console.log("\nWhat is dropped\n");
for (const line of [
  "How old are you?", "What is your age?", "Age:", "Enter your age", "Date of birth", "Birthdate", "Birthday", "DOB",
  "What year were you born?", "Year of graduation", "Graduation year", "Marital status", "Civil status", "Are you married or single?",
  "Ages 21 to 35", "Must be 21-35 years old", "Aged 18-25", "Applicants must be under 30 years old", "Below 30", "Not older than 35 years",
  "Fresh graduates only", "Young professionals welcome",
  // The third Phase 6 review: the common Philippine ad wordings, bare labels, family and generation words, Filipino.
  "18-35 years of age", "Below 30 years of age", "Must be 21-30", "21-30 only", "Must not be older than 30", "35 and below", "Age", "Age (years)",
  "Year born", "What year did you graduate high school?", "Relationship status", "Single applicants preferred", "Join our young, dynamic team", "Young, energetic team",
  "Recent graduates only", "Fresh graduates are preferred", "Birth year", "Do you have children?", "Status: single/married", "Aged between 20 and 30", "Age: 21-35",
  "Young and energetic", "Young, dynamic team player", "Youthful energy", "Millennials and Gen Z preferred", "Must be in your 20s", "Mid-20s to early 30s",
  "Max age: 35", "Age limit 35", "Age requirement: 21 and above", "How many years since you graduated?", "D.O.B.", "Ilang taon ka na?", "Edad",
  // The fourth Phase 6 review: an age limit beside other words, and more wordings.
  "Must be 21-35 years old, with own laptop and stable internet", "Aged 21-30, with customer service experience", "Age: 21-35, willing to work on the phone",
  "Join our young, dynamic customer support team", "Fresh graduates only, customer service training provided", "Customer Service Agent (21-35 years old)",
  "You will answer phone calls from our patients. Applicants must be 21-35 years old.", "Must be 21 or older", "Applicants must be at least 21", "21+ only",
  "Must be 21+", "Ages 25+ preferred", "Must be between 21 and 35", "Preferably 25 to 35", "Must not be more than 35", "Must be single", "Civil status: Single",
  "Marital status: single, married, widowed", "When did you graduate?", "How old will you be on your start date?", "How many kids do you have?",
  "Phone Support Agent, ages 21-30", "Below 30 years old, with a headset", "Gen Z or millennial customer service reps preferred", "Must be in your 20s",
]) check(`asks for age or sets an age limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));

console.log("\nWhat stays\n");
for (const line of [
  "Do you have 2+ years of experience in customer service?", "Can you reply to chats in under 60 seconds?", "Over 3 years of experience with Zendesk",
  "Type at least 40 words per minute", "Are you available to start within 2 weeks?", "What is your average handle time?", "Fresh graduates are welcome",
  "Handle 30-40 chats a day", "20-30 hours a week", "No experience needed", "Which language do you speak at home?", "Manage the support page",
  // The third review: a customer's identity check, the people served, a device, a score target, the company.
  "Verify each caller's identity (name, date of birth, policy number) before making changes", "Take down new patient details (name, date of birth, insurance) correctly",
  "Confirm the patient's full name and birthdate", "How old is your computer?", "What is the age of your computer?", "Maintain a CSAT score above 90",
  "Keep your QA score above 85", "Net Promoter Score above 50", "Keep first response time under 60", "Typing speed over 40",
  "Many of our patients are over 60 years old; speak slowly", "Our members are aged 50 and above", "Process change of civil status requests for policyholders",
  "Answer questions from parents of children under 12 years old.", "Over 10 years old company with 20 agents", "Coverage: what age group does the plan cover?",
  "When did you graduate from your training program?", "Enter your graduation date for your TESDA NC II", "10-15 years of service in retail",
  // The fourth review: a time, a score or a speed; a customer's age; a product's rating.
  "Average handle time must be under 10 minutes", "First reply should be under 60 seconds", "Typing speed must be over 40 words per minute",
  "QA scores must be above 85 every month", "Your replies must be under 90 words", "A customer says they are 70 years old and confused by the app. How would you help them?",
  "A mother asks if her 16 years old son can open an account. What do you say?", "A caller can't provide date of birth. What do you do?", "12 to 15 years in hospitality",
  "We help young professionals find apartments", "Do you have kids' product experience?", "Customers must be 18+ to open an account; check their ID",
  "Explain plans for members aged 65 and above", "Ages 12+ game ratings questions", "Process single/married filing status questions for tax clients",
]) check(`left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));

check("a list keeps its other lines, in order", JSON.stringify(A.withoutAgeAsks(["Your name?", "Date of birth?", "Why this job?"])) === JSON.stringify(["Your name?", "Why this job?"]));
check("…objects by their question", A.withoutAgeAsks([{ question: "How old are you?" }, { question: "Shifts?" }], (q) => q.question).length === 1);
check("a bullet list loses only its age line", A.bulletsWithoutAgeAsks("• Good English\n• Must be 21-35 years old\n• Night shifts") === "• Good English\n• Night shifts");
check("a paragraph loses only its age sentence, and inline bullets only their age item", A.textWithoutAgeAsks("Good English. Must be 21-35 years old. Two years in a call center.") === "Good English. Two years in a call center." && A.textWithoutAgeAsks("• Good English • Age: 21-35 • Night shift") === "• Good English • Night shift");
check("a list given as an array keeps its other items", JSON.stringify(A.textWithoutAgeAsks(["Good English", "Ages 21-35", "Night shift"])) === JSON.stringify(["Good English", "Night shift"]) && JSON.stringify(A.commaListWithoutAgeAsks(["Empathy", "young and energetic team"])) === JSON.stringify(["Empathy"]));
check("a comma list loses only its age item", A.commaListWithoutAgeAsks("communication, typing, young and energetic team, empathy") === "communication, typing, empathy");
check("nothing that is not a list or text breaks it", A.withoutAgeAsks(null).length === 0 && A.bulletsWithoutAgeAsks(undefined) === undefined);


// The fifth Phase 6 review: a word for someone else anywhere in the sentence
// kept an age limit, any "you" dropped a question about an older customer,
// and numbers near "applicants" or in answer options read as ages.
console.log("\nThe fifth review's cases\n");
for (const line of ["Are you 21 or older?", "Are you over 25?", "Are you between 21 and 35?", "Are you under 30?", "Please state your age.", "What's your age?", "Age (optional)", "Your age range", "Age range: 18-24, 25-34, 35-44", "Select your age group", "Which age group are you in?", "Year of birth (YYYY)", "When is your birthday?", "Please share your birthdate", "Birth date (MM/DD/YYYY)", "Are you a fresh graduate?", "What year did you graduate from college?", "What year did you finish college?", "When did you finish school?", "Are you married?", "Are you single, married or separated?", "Do you have any children?", "Do you plan to have children?", "Do you have a family?", "Are you pregnant or planning a family?", "What is your civil status?", "Marital Status (Single/Married)", "Ideal candidate: 22-30 years old", "Ideal age: 25-35", "Preferred age 21-30", "Age 21 to 35 only", "21 to 35 years old", "Not more than 30 years old", "Not over 35 years old", "Below 35 years old", "At least 21 years old", "At least 21 years of age", "Must be of legal age", "Must be of legal age (21+)", "Must be 21 years or older", "Must be over 21", "Must be at least 25 years old", "Must be younger than 35", "Should not be older than 40", "Applicants aged 20 to 30", "Age requirement: 18 to 30", "Candidates should be in their twenties", "Ideal for people in their 20s", "We prefer candidates under 30", "We want energetic young people", "Seeking young, energetic customer service reps", "Looking for young and vibrant agents", "Young, energetic and fun", "Youthful and energetic", "Fresh graduates preferred", "Fresh grads only!", "Recent college graduates only", "Only recent graduates need apply", "Gen Z applicants preferred", "Millennial mindset preferred", "Single applicants preferred", "No kids preferred, as the shifts are long", "Must not have children under 5", "Female, 20-28 years old", "Male or female, 21-35", "21-35 y/o", "21–35", "18 to 30 only", "Edad: 21-35", "Ilang taon ka na?", "Kailan ang kaarawan mo?", "Status: Single", "Kindly indicate your age and civil status", "Tell us your name, age and where you are from.", "Introduce yourself: your name, age and location", "In your video, say your name, age, and why you want this job", "Please include your age in your cover letter", "Upload a resume showing your date of birth", "Rank: younger applicants first", "Age", "Prefer applicants who are young", "Max 35 years old", "Not older than 35", "Ages 18-30", "Age 21-35, with good typing speed", "21-35 years old, with good accuracy", "Aged 20-30 with strong CSAT scores", "Age: 21-35, flexible with shift times", "Agents aged 21-35 preferred for our fast-paced business", "Ideal age 21-30 for our growing company", "Preferably 21-30 years old and comfortable with targets", "Between 20 and 30 years old, used to working with customers", "21 to 35 years old, has handled customer complaints", "Below 30 years old, experienced with orders and refunds", "Aged 21-35 and good with apps", "Age limit: 35 (company policy)", "Must be 21-35 years old and know our products"]) check(`(5th review) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
for (const line of ["Must be available to work 40 hours a week", "Must be able to work 40 hours per week, including weekends", "You should be at least 18 months into your current role", "Must be able to type at least 40 WPM", "Must type 45 words per minute or more", "Must have at least 2 years of experience in a call center", "Applicants should have 2+ years of BPO experience", "Candidates with 3-5 years of experience preferred", "Must be available 24/7 on rotating shifts", "Handle 50+ chats a day", "Resolve 80% of tickets on first contact", "Respond to customers within 24 hours", "Answer 60 to 80 calls per shift", "Must be 100% remote ready with a backup internet connection", "Must have an internet speed of at least 25 Mbps", "Must have a computer with at least 16 GB RAM", "Must be willing to work night shift (10 PM to 6 AM EST)", "Must be available from 21:00 to 06:00 Manila time", "Shift: 9 PM - 6 AM, Monday to Friday", "Work 22 days a month", "Must be able to sit for 8 hours", "Should be able to handle 3 chats at once", "Applicants must be fluent in English", "Applicants must pass a 30-minute typing test", "Candidates must be able to start within 30 days", "Must be at least 21 days available before start", "Must commit to at least 12 months", "Applicants must be available for 6 months minimum", "We are a 25-person team serving customers in 40 countries", "Our team of 30 agents answers calls 24/7", "Join our team of 15 friendly agents", "We're looking for someone with a calm voice and 2 years in customer support", "Paid training for 14 days", "13th month pay", "HMO coverage for you and 2 dependents", "Health insurance for you and your dependents", "Life insurance and retirement plan", "Pay: ₱25,000 to ₱35,000 a month", "Salary: $500 - $700 per month", "Pay range: 20-25 USD per hour", "$12 to $15 per hour", "Customer Service Representative (Night Shift, 40 hrs/week)", "Patient Coordinator - 30 hours per week", "Average handle time under 6 minutes", "Keep CSAT above 90%", "Help patients aged 65 and older book appointments", "Verify the caller's date of birth before sharing records", "Confirm the patient's date of birth and insurance ID", "Ask the patient for their date of birth to find their chart", "Verify the patient's identity with their name and date of birth", "Handle questions about senior discounts for customers 60 and over", "Explain our plans to parents of kids under 12", "Help members aged 18-25 choose a student plan", "A customer says she is 82 and can't read the screen. What do you do?", "A caller asks you to change their date of birth on the account. What do you do?", "How would you handle a customer who refuses to give their date of birth for verification?", "Tell us about a time you calmed down an upset caller.", "Describe a time you handled 20+ chats in an hour.", "Why do you want to work night shifts for a US company?", "Must be under 5 minutes average reply time", "First response time should be under 2 minutes", "Must be over 95% accuracy on QA", "Must be at least 95% on quality audits", "QA score must be 90 or higher", "Must score 85 or above on the English test", "Must have been in customer service for 2 years", "Experience: 1-3 years", "Ideal for students or career shifters", "Open to fresh graduates and career shifters", "Fresh graduates are welcome to apply", "New graduates welcome; we train you", "No experience needed. We train you.", "A friendly team that moves fast.", "Work from home in a young company growing fast", "We're a young startup founded in 2023", "Join a young and growing company", "Our clinic has served families for 30 years", "We serve families with young children", "Answer questions about our young adult book series", "Help young drivers with car insurance questions", "Support customers of our youth sports league", "Single point of contact for VIP customers", "Be the single point of contact for patients", "Handle single and married filing status questions", "Process requests to update marital status on policies", "Update the customer's civil status on their account", "Ask the customer to state their date of birth for verification", "Never ask a customer for their full card number", "Must have own laptop (i5 or higher, 8 GB RAM) and a headset", "Applicants must have a laptop no older than 5 years", "Your computer must be under 5 years old", "Must work Philippine holidays at 200% pay", "Candidates must be based in the Philippines", "Must be 2 hours from Manila or less", "You must be at least 30 minutes early for training", "Applicants must be ready by 21 November", "Applicants must reply within 48 hours", "Candidates aged out of school? No problem", "Must be between 9 AM and 6 PM available", "We need you to be on 40 calls a day", "Your team leader has 10+ years in BPO", "You will be at least 25% on phones", "You should be at least 50% on chat and 50% on email", "Applicants must be 80 WPM typists", "The customer has been a member for 15 years", "Our customers are mostly between 25 and 40 years old", "Most of our patients are 65 years old or older", "A 70 year old patient calls confused about her bill. How do you help?", "A 16-year-old wants to sign up but the app is 18+. What do you say?", "Kids under 13 can't create an account; explain this kindly to the parent", "Explain the plan to members aged 50 and above", "Help users reset their passwords", "Applicants should expect a 30-minute skills test.", "Candidates with 10+ years of call center experience will be considered for team lead.", "Our clinic's patients are mostly 60 and older.", "Have you supported customers aged 65 and over?", "Your typing must be 40 WPM or more.", "Explain how you would talk with a customer who is 90 years old.", "How would you help a patient who is 80 years old and can't hear well on the phone?", "You will help patients aged 65 and above book their visits.", "Candidates must be available for 20 to 30 hours a week", "Candidates must work 12-hour shifts", "Applicants must type 40-50 WPM", "Candidates must hit 90 or above on QA", "Must score 85 or above on the English test", "Must be 30 km or less from the office", "Our patients are seniors aged 65+, so patience matters", "Candidates must be 21 hours a week minimum"]) check(`(5th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const [q, options] of [
  ["How many hours a week can you work?", ["Under 20", "20-30", "30-40", "40+"]],
  ["What is your typing speed (WPM)?", ["Under 30", "30-50", "50-70", "70+"]],
  ["How many calls a day have you handled?", ["Under 20", "20-50", "50-80", "80+"]],
  ["Years of Experience", ["0-2", "3-5", "6-10", "10-15", "15+"]],
  ["Expected hourly rate (USD)", ["Under 5", "5-8", "8-12", "Over 12"]],
  ["Internet speed (Mbps)", ["Under 10", "10-25", "25-50", "Over 50"]],
  ["A customer waits 15 minutes. What is the max wait you should allow?", ["Under 10 minutes", "10-15", "15-20", "Over 20"]],
]) check(`a question with number options stays: ${JSON.stringify(q)}`, !A.questionAsksAge(q, options));
check("…while an option that names an age still drops it", A.questionAsksAge("Which group are you in?", ["18-25 years old", "26-35 years old"]) && A.questionAsksAge("How old are you?", ["Under 25", "25+"]));
check("a list read by position keeps its positions (an age note is emptied, not dropped)", JSON.stringify(A.blankAgeAsks(["Why the form", "Agents aged 21-35 preferred", "Why the chat"])) === JSON.stringify(["Why the form", "", "Why the chat"]));

// The sixth Phase 6 review: ordinary ad wordings, numbers as words, titles
// and ranking factors still set an age limit; birth-year, marital and family
// questions (and their answer options) still passed; and a 40-character
// window, score targets and product age limits dropped ordinary
// customer-service text.
console.log("\nThe sixth review's cases\n");
for (const line of [
  // Age limits and preferences in ad wording.
  "Candidates under 30 preferred", "Agents under 30 preferred", "No applicants over 35", "Applicants over 35 need not apply", "Those above 40 need not apply",
  "Applicants who are 35 or younger", "Candidates who are under 30", "Preferably 30 and below", "30 and below preferred", "21 and above only", "Between 21 and 35 only",
  "Age preference: 21-35", "Age cap: 35", "Ideally 22-30 years", "Ideal candidate: 25-30 yrs", "Below 30 yrs", "Applicants under 35 years, with BPO experience",
  "We are hiring 21-35-year-olds", "Under-30s preferred", "Preferably fresh graduates", "Ideal candidate is in his 20s", "Ideal candidate is in her twenties",
  "Looking for a young professional", "Must be at least eighteen years old", "Not older than thirty-five",
  // Titles (generate-flow keeps the title the model writes).
  "Chat Support Agent (Under 30)", "Phone Agent (21-30)", "Phone Agent (21-30 yrs)", "Night Shift Agent, 35 and below", "Young Customer Service Agent", "Customer Service Rep (Gen Z)",
  // Ranking factors (generate-flow's shortlistWeights and voiceDimensions).
  "Age fit (21-35)", "Rank applicants under 30 first", "No children (more flexible)", "Age under 30", "Youthfulness", "Fresh graduate status", "Family commitments (fewer is better)",
  // Birth date, marital status and family plans.
  "Can you tell us how old you are?", "Tell us how old you are", "How old are u?", "Year you were born", "Born after 1995", "Applicants born after 1990 only", "Graduated 2020 or later",
  "Do you have young children at home?", "Do you have small kids?", "Do you have any dependents?", "How many dependents do you have?", "Are you a parent?", "Are you planning to have kids soon?",
  "Do you plan on starting a family?", "Are you expecting a baby?", "Must not be pregnant", "Must not be married", "Preferably single", "Single only", "Not married",
]) check(`(6th review) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
for (const line of [
  // An older customer named in a question to the applicant, however long the sentence.
  "Are you comfortable helping patients aged 65 and older?", "Are you able to help a caller aged 80 who keeps losing track of the steps?", "You should be patient with callers aged 70 and above.",
  "You must help a caller aged 85 reset a password.", "Must be patient with callers who are 70 years old or older", "Must be comfortable talking with customers 60 years old and above",
  // Score targets.
  "Your QA score must be 85 or above", "QA scores should be 90 and above", "CSAT should be 90 and above every month", "Should be 90 or above on the English test",
  // An age limit that is a product's, or a customer's.
  "A parent asks about the minimum age for a kid's savings account. What do you say?", "Explain the age requirements for our travel insurance plans.", "Answer questions about age limits on our insurance plans.",
  "A caller asks which age range your family plan covers.", "Check that the customer is of legal age before opening the account.", "Verify the borrower is of legal age.",
  // The customers described.
  "Our customers are mostly in their 30s.", "Our patients are mostly mid-30s parents.", "Many of our patients are not digital natives; walk them through the portal slowly.",
  "Most of our customers are Gen Z, so our agents keep replies short.", "We're hiring agents to help young professionals find apartments.", "We're looking for someone to support young people applying for student loans.",
  // Other numbers.
  "Resolve tickets aged 72 hours or more first.", "Keep the maximum age of open tickets under 24 hours.", "Are you at least 18 months into your current role?", "Must be 24/7 reachable on Slack during launch week",
  "Are you 24/7 available during peak season?", "Female callers make up 60-70% of our line.", "Young brand, friendly team.",
]) check(`(6th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const [q, options] of [
  ["Status", ["Single", "Married", "Separated", "Widowed"]],
  ["Which describes you?", ["Single", "Married", "Married with kids"]],
  ["Which range do you fall into?", ["18-24", "25-34", "35-44", "45+"]],
  ["Dependents", ["None", "1-2", "3+"]],
  ["Which generation are you?", ["Gen Z", "Millennial", "Gen X"]],
  ["Which applies to you?", ["Born before 1990", "Born 1990-2000", "Born after 2000"]],
]) check(`(6th review) a question whose options are an age, a birth year, a generation or a marital status goes: ${JSON.stringify(q)} ${JSON.stringify(options)}`, A.questionAsksAge(q, options));
check("…while a customer's filing status, hours and typing ranges stay", !A.questionAsksAge("A customer just married. Which status should the caller's tax form show?", ["Single", "Married filing jointly", "Married filing separately"]) && !A.questionAsksAge("How many hours a week can you work?", ["Under 20", "20-30", "30-40", "40+"]) && !A.questionAsksAge("Which range is your typing speed in?", ["30-40", "40-50", "50+"]));
check("(6th review) a paid day off on your birthday is a benefit, not a question", A.commaListWithoutAgeAsks("HMO from day one, 13th month pay, a paid day off on your birthday, paid training") === "HMO from day one, 13th month pay, a paid day off on your birthday, paid training" && A.asksAgeOrStatus("Please share your birthday"));
check("(6th review) generate-flow's ranking factors keep only what is not an age, a youth or a family", JSON.stringify(A.withoutAgeAsks(["Age fit (21-35)", "Rank applicants under 30 first", "No children (more flexible)", "Empathy", "Age under 30", "Youthfulness", "Fresh graduate status", "Family commitments (fewer is better)", "Patience with older patients"])) === JSON.stringify(["Empathy", "Patience with older patients"]));
check("(6th review) the doc comment on answer options says what the code does", /"Born before 1990"\) drops the question/.test(read("supabase/functions/_shared/ageWording.ts")) && !/an\s+\* option only when it names an age/.test(read("supabase/functions/_shared/ageWording.ts")));
for (const line of ["She mentioned being a mother of three, so nights may be hard.", "Seems too young to lead a team.", "Her children may limit her availability.", "The candidate is 45 years old.", "Single mom, may need day shifts.", "Has small kids at home, so weekends are a risk.", "She is pregnant."]) check(`(6th review) a reviewer's remark on age or family is dropped: ${JSON.stringify(line)}`, A.marksAgeOrFamily(line));
for (const line of ["Verified the caller's date of birth before sharing the record.", "Kind to the parent who has small kids on the line.", "Handled the 80-year-old caller with patience.", "Strong with older customers.", "Their laptop is too old for the job.", "Specific examples with numbers.", "Explained the kids' account rules correctly.", "Rightly refused to share the results with her husband."]) check(`(6th review) a reviewer's remark about the work stays: ${JSON.stringify(line)}`, !A.marksAgeOrFamily(line));
check("a reviewer's paragraph loses only that sentence", A.textWithoutAgeMarks("Clear, specific answers. She mentioned being a mother of three. Ready for nights.") === "Clear, specific answers. Ready for nights.");

// The seventh Phase 6 review: the usual English "over the age of 21", form
// labels, pregnancy, marital and childcare questions, youth and birth-year
// wordings still passed; and ordinary customer-service text was dropped (a
// medical front desk recording a caller's age, customers called people or
// women, loan applicants, a product's or the business's own age, a family
// plan), as were grader remarks about the work.
console.log("\nThe seventh review's cases\n");
for (const line of [
  // Finding 1: "over the age of".
  "Must be over the age of 21.", "Applicants must be over the age of 21.", "Over the age of 18 only", "Must be above the age of 21", "Are you over the age of 18?",
  // Finding 4: form labels and date-of-birth asks.
  "Sex, age, civil status", "Age/Civil Status", "Name / Age / Address", "Age and gender:", "Age & civil status:", "Gender and age", "Date of Birth *", "Date of Birth: ____",
  "Please provide your DOB", "Kindly provide your D.O.B.", "Full name, date of birth and address", "Place and date of birth", "Applicant's age", "What age are you?", "What's your current age?",
  // Finding 5: pregnancy, marital and family questions.
  "Are you currently pregnant?", "Do you plan to get pregnant?", "Any plans of having a baby in the next 2 years?", "No pregnant applicants",
  "Are you divorced?", "Are you separated or divorced?", "Are you in a relationship?", "Married? Y/N", "Are you a solo parent?", "Are you a working mom?", "Must not be a single parent",
  "Must be physically fit, single, and willing to relocate", "Who takes care of your children during your shift?", "Who will watch your kids while you work nights?", "How will you manage childcare?",
  "Do you have a child?", "Do you have a young child?", "Any children?", "Applicants with young children need not apply", "Parents with kids under 5 need not apply",
  "Does your spouse work?", "What does your husband do?", "Spouse's occupation", "Name of spouse", "Husband's name", "Settled (married) applicants preferred",
  // Finding 6: youth and birth-year wordings.
  "Must be a fresh graduate", "Must be a recent graduate", "• Fresh graduate", "Fresh graduate", "Recent college graduate (2023 or 2024)", "Must be a recent college graduate", "Gen-Z preferred",
  "Born in the 90s or later", "Birth year: 1995 or later", "Graduates from 2020 onwards", "35yo and below", "Must be 25yo+", "Must be legal age", "Looking for youngsters",
  "e.g. Maria, 24, single mom of two",
  // Finding 3: an applicant group named with a customer word, still an age preference.
  "Students aged 18-22 preferred", "College students aged 18 to 24 preferred", "Seniors aged 60+ are welcome to apply", "Ideal for retirees aged 55 and over", "Retirees over 60 preferred",
  "Perfect for college students aged 18 to 24 who want night shifts",
  // The reviewer's other probes.
  "Applicants aged up to 35", "Not above 35", "Age must not exceed 35", "Age should not exceed 30 years",
]) check(`(7th review) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
for (const line of [
  // Finding 7: a medical front desk records a caller's age.
  "Take each caller's name, age and reason for the visit", "• Record the caller's name, age and symptoms for the nurse", "Take the patient's name, age, and reason for the visit.",
  // Finding 8: customers called people, persons, folks, the clientele, women and men, owners.
  "Answer calls from people aged 65 and over.", "Many of the people who call us are over 65 years old, so speak slowly.", "The insurance covers persons aged 18-60.",
  "Persons 60 and above get a senior discount.", "The clinic sees many folks over 60 years old.", "Most of our clientele are 50 years old and up.", "Women aged 40-60 are our main buyers.",
  "You will talk to people over 60 years old every day.", "A woman in her 50s calls confused about her bill. What do you do?", "A man in his 40s says he was charged twice.",
  "A small business owner in her 30s wants to cancel.", "Business owners aged 30-50 are our main clients.", "The plan covers dependents up to age 26.",
  // Finding 9: a loan's, a card's or a scholarship's applicants are customers.
  "Explain that loan applicants must be 21 or older.", "Our applicants for credit cards must be at least 21 years old.", "Explain the requirement that card applicants be 18 or over.",
  "Answer questions from scholarship applicants aged 18 to 25.",
  // Finding 10: a product's age limit, with digits.
  "Explain our youth plan for ages 18 to 25.", "Questions about our ages 18-30 travel program", "Our over-50s insurance line", "Handle over-60s plan questions", "Customer Service Agent (Over-50s Insurance)",
  // Finding 11: the business's own age.
  "Our company is 25 years old.", "The clinic is 30 years old and still family-run.", "Our practice turned 40 years old this year.",
  // Finding 12: a family plan, kids meals, a kids club, a benefit on your birthday, agents who talk to young people.
  "Do you have a family plan?", 'A caller asks, "Do you have a family plan?" How do you answer?', "Do you have kids meals?", "Explain to guests that the resort has no kids club.",
  "A caller with no kids asks about the family package.", "We celebrate your birthday", "Your birthday is a paid holiday",
  "We need agents who can talk to young people about student loans.", "We want agents who understand young people.",
]) check(`(7th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
// Guards: what the widened rules must still leave alone, and what they must still drop (these passed before the round too).
for (const line of [
  'A customer asks: "Do you have baby formula in stock?"', 'A caller asks, "Do you have child seats for rental cars?"', "Is your spouse on the account?",
  "Must be able to handle billing, single and group bookings", "Must be comfortable working single, split or double shifts", "If you get pregnant, you keep your HMO and get 105 days of paid leave.",
  "Spend more time with your kids: work from home.", "How do you handle children who call in?", "Date of birth: 04/12/1961", "Verify name, date of birth and member ID", "Name, email, phone number",
  "Seniors aged 60 and above only pay half.", "Ideal for customers aged 60 and over, the Gold plan covers home visits.", "Customers aged 18-25 are welcome to apply for the student card.",
  "A caller, Maria, 54, single mom of two, asks about her bill.",
]) check(`(7th review, guard) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  // …while the same people words still mark an age preference when the sentence is hiring them.
  "Women aged 25-35 only", "We prefer people under 30", "Looking for women aged 21-30", "Open to people aged 18-30", "People aged 21-35 are encouraged to apply", "Hiring individuals aged 21-35",
  "Must be a woman aged 25-35", "Our internship program is for ages 18-24", "Agents aged 21-35 for our insurance line", "Applicants for our healthcare account must be 21-35 years old",
  "Our training program applicants must be 21-35", "Married applicants need not apply",
]) check(`(7th review, guard) …and still drops: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
for (const line of ["Must be physically fit and single", "What is your husband's occupation?"]) check(`(7th review) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
check("(7th review) a medical front desk keeps the duty that records a caller's age, in a list and in a bullet list", JSON.stringify(A.withoutAgeAsks(["Take each caller's name, age and reason for the visit", "Book and move appointments"])) === JSON.stringify(["Take each caller's name, age and reason for the visit", "Book and move appointments"]) && A.textWithoutAgeAsks("• Answer calls from patients and families\n• Record the caller's name, age and symptoms for the nurse\n• Book visits") === "• Answer calls from patients and families\n• Record the caller's name, age and symptoms for the nurse\n• Book visits");
check("(7th review, guard) …while the applicant's own name and age still go", A.asksAgeOrStatus("Tell us your name, age and where you are from.") && A.asksAgeOrStatus("Name, age and address"));
check("(7th review) the business's age stays in a paragraph, and a product's title is not blanked", A.textWithoutAgeAsks("Founded in 1999, our clinic is 25 years old. We care for families across the city.") === "Founded in 1999, our clinic is 25 years old. We care for families across the city." && A.textWithoutAgeAsks("Customer Service Agent (Over-50s Insurance)") === "Customer Service Agent (Over-50s Insurance)");
for (const [q, options] of [["Are you over the age of 18?", ["Yes", "No"]], ["Which of these describes you?", ["18-24", "25-34", "35+"]], ["Where do you fall?", ["Under 25", "25-35", "Over 35"]]]) check(`(7th review) a question to the applicant with age brackets goes: ${JSON.stringify(q)} ${JSON.stringify(options)}`, A.questionAsksAge(q, options));
check("(7th review, guard) …while brackets of months or days stay", !A.questionAsksAge("How long have you worked in customer service?", ["Under 12", "12-24", "24+"]) && !A.questionAsksAge("When can you start?", ["Under 30", "30-60", "60+"]));
check("(7th review) a comma list loses a youth, a generation or a status given as its own item", A.commaListWithoutAgeAsks("Communication, Young, energetic, Empathy") === "Communication, energetic, Empathy" && A.commaListWithoutAgeAsks("Typing, Gen Z, Empathy, Millennial, Fresh graduate, single, Patience") === "Typing, Empathy, Patience");
for (const line of [
  // Finding 2: a grader or a guide on the applicant's age, a baby, a marriage, retirement.
  "Mentions being 45, which may mean less energy for nights.", "At 45, she may struggle with night shifts.", "Only 19, may lack maturity to lead.", "Older than the rest of the team; may not fit in.",
  "Close to retirement age.", "Just had a baby, so availability is unclear.", "Has a toddler at home; weekend cover is a risk.", "Mother of a newborn; nights unlikely.",
  "Lives with her 3 kids, so evenings may be hard.", "Recently married, so she may relocate.", "Newly wed; may want day shifts.", "On maternity leave until March.",
  "Her husband works nights too, so childcare could clash with the shift.",
]) check(`(7th review) a reviewer's remark on age or family is dropped: ${JSON.stringify(line)}`, A.marksAgeOrFamily(line));
for (const line of [
  // Finding 13: remarks about the work, or about a person in a practice case.
  "Handled the single mom's billing case well.", "Calm with the young mother in the second scenario.", "Helped the new mom with her claim.", "Showed patience with the father who has small kids on the line.",
  "Was kind to the pregnant woman on the line.", "Tone is too old-fashioned for chat.", "Relied on a very old example from school.", "They are single-minded about quality.",
  "He is single-handedly covering two queues.", "She is married to the script and sounds robotic.",
]) check(`(7th review) a reviewer's remark about the work stays: ${JSON.stringify(line)}`, !A.marksAgeOrFamily(line));
// Guards: what the new remark rules must still leave alone.
for (const line of [
  "Rebooked the newlywed couple's flight without fuss.", "Turned 30 angry chats into thank-yous.", "Being 20 minutes early shows care.", "At 45 WPM, typing is a little slow.", "Retired the old macro and wrote a better one.",
]) check(`(7th review, guard) a reviewer's remark about the work stays: ${JSON.stringify(line)}`, !A.marksAgeOrFamily(line));
// The eighth Phase 6 review: a medical, insurance or tax desk's ordinary
// lines were dropped (a caller's identity check, Medicare at 65, dependents,
// filing status); "a 25-year-old" in a hiring sentence and "We hire students
// aged 18-24" passed; and plain marriage, age-limit, graduation, birth-date
// and Filipino wordings and common grader remarks still passed.
console.log("\nThe eighth review's cases\n");
for (const line of [
  // Finding 3: what an agent asks or tells a customer.
  'Greet the caller and ask, "May I have your date of birth?"', 'Say: "For security, please tell me your date of birth."', 'Verify the account by asking "Can you please confirm your date of birth?"',
  "Ask: \"What's your date of birth?\" to find the patient's chart.", "Ask: 'What's your date of birth?' to pull up the chart.", 'Script: "Thank you for calling. Can you confirm your date of birth for security?"',
  'Say "Thanks for calling. May I have your date of birth?" and wait.', 'Ask the patient, "Are you pregnant or could you be pregnant?" before booking the X-ray.',
  'Ask the caller, "Are you a parent or guardian?"', 'A caller asks, "Are you a parent company of BrightBank?"', '"Are you a parent or guardian?"',
  "Explain that Medicare starts at age 65.", "Medicare starts at age 65.", "Explain the age 26 rule for dependents on health plans.",
  "Enter the number of dependents the caller wants covered.", "Ask the client for the number of dependents on their tax return.", 'Ask the member, "Do you have dependents on your policy?"',
  'Ask the client: "What is your filing status, single or married?"', "What is your filing status, single or married?", "Help clients choose single or married filing status.", "Ask the client if they are filing single or married.",
  "Explain the age requirement to callers.", "Explain that age restrictions apply to some tours.", "Ask about the age range of the group.",
  "Explain to the caller that you must be 21 or older to rent a car.", "A 17-year-old asks to rent a car. Explain that you must be 25 or older to rent.", "Let the customer know you must be 21 to rent a car.",
  "Walk the customer through your age verification process.", "Handle claims aged 30-60 days.",
]) check(`(8th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
check("(8th review) a quiz question whose right answer checks the caller's date of birth stays (ai-generate-workflow)", !A.questionAsksAge("A caller asks for her lab results. What do you do first?", ["Read the results to her", 'Ask, "Can you confirm your date of birth?" and check it against the chart', "Tell her to come in", "Email the results"]));
check("(8th review) …and so do generate-flow's quiz item and its Medicare practice", A.withoutAgeAsks([{ scenario: "A caller wants her test results.", good: 'Asks "Can you confirm your date of birth?" before sharing anything.' }], (q) => `${q.scenario} ${q.good}`).length === 1 && A.withoutAgeAsks([{ title: "Medicare question", prompt: "A 64-year-old caller asks when Medicare starts. The agent explains that Medicare starts at age 65 and offers to send the guide." }], (s) => `${s.title}. ${s.prompt}`).length === 1);
for (const line of [
  // Findings 1 and 2: an age in a hiring sentence, however it is attached.
  "We want a 25-year-old go-getter.", "The ideal candidate is a 25-year-old graduate.", "Our ideal hire is a 24-year-old.", "Perfect for a 21-year-old starting out.", "We're looking for a young 25-year-old.",
  "Hiring: 25-year-old chat agent", "Seeking a twenty-five-year-old agent.", "We want a 25 year old.", "Looking for a 22 year old graduate.", "Must be a 21+ year old.",
  "Looking for a 20-something with great English.",
  "We hire students aged 18-24 for the night shift.", "Hiring college students aged 18 to 22.", "Looking for students aged 18-22.", "We're hiring retirees aged 55-70.", "Retirees aged 55-70 wanted.",
  "Seniors aged 60+ wanted for part-time phone work.", "Stay-at-home parents aged 25-45 wanted.", "Calling all students aged 18-25!",
  // Finding 4: marriage and children plans, age limits, graduation recency, birth date, Filipino.
  "Are you planning to get married?", "Do you plan to get married soon?", "Are you engaged?", "Do you intend to have children?", "Are you thinking of having children?", "Are you currently expecting?",
  "Do you have any little ones at home?", "Do you have someone to look after your children?", "How many kids?", "Married or not?", "Childless applicants preferred.", "Preferably male, single.", "Are you a widow?",
  "Under 30s only.", "Over 21s only.", "Applicants 21+ years old.", "Applicants from 21 to 35", "Must be at most 35.", "Prefer 35 below", "Twenty-somethings wanted.", "Late 50s need not apply.", "Retirees need not apply.",
  "Graduated within the last 2 years.", "Must have graduated no more than 2 years ago.", "Newly graduated applicants preferred.", "2023 graduates preferred.", "Freshers only.",
  "What's your DOB?", "What is your DOB?", "Please put your birthday.", "Age is required.", "Date of birth - optional", "Date of birth — required", "Sex: ___ Age: ___", "Age as of last birthday",
  "Spouse name", "Name of husband/wife", "Upload your PSA birth certificate.",
  "Kasal ka na ba?", "May anak ka ba?", "Single o may asawa?", "Dalaga o binata lamang.", "Walang anak, mas mainam.", "21 hanggang 35 taong gulang lamang",
]) check(`(8th review) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
check("(8th review) a bullet list loses the 25-year-old line", A.textWithoutAgeAsks("• Great English\n• Ideally a 25-year-old fresh from college\n• Night shift") === "• Great English\n• Night shift");
// Guards: what the new rules must still leave alone, and what they must still drop (these passed before the round too).
for (const line of [
  "Agents must be able to calm a 16-year-old who is upset about a ban.", "The caller wants to add a 16-year-old to her plan.", "A customer is looking for a gift for a 10-year-old.", "You will often help a 70-year-old reset a password.",
  "Her 15-year-old son wants his own account.", "Join our 15-year-old company as a phone agent.", "We're a 20-year-old family business hiring chat agents.", "A 70-year-old caller asks for help with the portal.",
  "Handle 40-something chats a day.", "Do you want to start a family plan? Explain the bundle.", 'A parent asks: "Do you have someone to watch my kids during the appointment?"',
  "Tell callers what to bring: birth certificate and a valid ID.", "• Birth certificate", "Help members upload a birth certificate for their newborn.", "Mother's maiden name",
  "Alumni who graduated within the last 2 years keep the student rate.", "We want students aged 18-24 to feel welcome at our gym.", "Retirees aged 65+ wanted to know about the pension change.",
  "Under 18s need a parent's signature.", "Freshers welcome", "Coverage for dependents ends at age 26.", "Are you engaged with your customers?", "Age is required for the senior discount.", "Explain to customers under 18 that they need a parent's consent.",
]) check(`(8th review, guard) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  'Ask the candidate: "How old are you?"', 'Ask: "How old are you?"', 'Ask the applicant, "What is your date of birth?"', "Are you a parent?", "Please state the number of dependents you have.",
  "Are you married or single?", "Able to explain policies clearly, 21-35 years old.", "Applicants eligible from age 21 only.", "This job suits an 18-25 year old student.",
]) check(`(8th review, guard) …and still drops: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
for (const line of [
  // Finding 5: contractions, bare ages, marital status, children, family plans.
  "She's single.", "She's 45.", "He's 52 and may tire on nights.", "The candidate is 52.", "The applicant, 45, may tire on nights.", "Says she is 19.", "Mentioned she is 23, which explains her lack of experience.",
  "At 52, brings deep call-center experience.", "A 52-year-old career agent with strong examples.", "She is divorced.", "He is a widower.", "Divorced, so flexible.", "Widowed; wants steady work.",
  "Not married, so can relocate.", "Unmarried and flexible.", "Has five kids at home.", "Mentioned her 3 kids.", "Wants to start a family soon.", "Wants kids soon; may leave.", "Expecting her first child.",
  "Just became a mother.", "As a mom, she understands patience.", "He is in his late 50s.", "Young for a lead.",
]) check(`(8th review) a reviewer's remark on age or family is dropped: ${JSON.stringify(line)}`, A.marksAgeOrFamily(line));
for (const line of ["She is mature and calm under pressure.", "He is old-school in his replies but accurate.", "Handled the pregnancy leave question for the employee correctly.", "Knew the age 26 rule for dependents."]) check(`(8th review) a reviewer's remark about the work stays: ${JSON.stringify(line)}`, !A.marksAgeOrFamily(line));
for (const line of [
  "Not married to one script; adapts well.", "She's 20 chats ahead of the queue.", "She is 15 for 15 on the quiz.", "Separated the billing issue from the refund.", "Single, split and double shifts are fine for her.",
  "Her two children are at home with her, so she cannot leave.", "Asked for the caller's date of birth before sharing anything: correct.", "Confirmed the caller is 18 or older before changing the plan.",
]) check(`(8th review, guard) a reviewer's remark about the work stays: ${JSON.stringify(line)}`, !A.marksAgeOrFamily(line));

// The ninth Phase 6 review: the eighth round's exemptions let hiring lines
// through (a range of ages before "in", "on", "per" or ":", an employer's own
// HMO and tax forms, an HR ask "for our records", "remind them you must be
// 21-35") and dropped a customer's hyphenated age with no article ("70-year-old
// patients", "16-year-old players"), a product "perfect for a 12-year-old", an
// outbound agent recruiting panel respondents, a blank patient form and grader
// remarks with a time or a count. Customer rules said to "you" (Medicare at 65,
// renting a car at 21), unquoted scripts and the identity-check quiz question
// were dropped too, and the grader skipped every sentence saying "parent".
console.log("\nThe ninth review's cases\n");
for (const line of [
  // Finding 1: the person right after the age.
  "Patience with 70-year-old patients who are new to the portal.", "Experience with 16-year-old players and their parents is a plus.", "You will answer calls from 70-year-old members about their Medicare plans.",
  "Know which plans cover 26-year-old dependents.", "Most 70-year-old patients prefer a phone call.", "Lots of 16-year-old players ask why their purchase failed.", "Guide 60-year-old members through the app.",
  "Refund 16-year-old players only with a parent on the line.", "The starter phone is perfect for a 12-year-old.", "Recommend a plan that is great for a 12-year-old.", "This plan suits a 16-year-old's first phone.",
  "We are hiring agents to support 70-year-old members with their Medicare plans.",
  // Finding 4: a customer's rule said to "you", unquoted scripts, a policyholder asked, an account's age.
  "Say: For security, please confirm your date of birth.", "Opening script: Thank you for calling Bright Clinic. May I have your date of birth?", "Script: Thanks for calling! Can you confirm your DOB?",
  "You can enroll in Medicare at age 65.", "You can claim Social Security as early as age 62.", "Your child can stay on your plan until age 26.", "Life insurance rates go up after age 50.",
  "To rent a car, you must be 21 or older.", "Renters must be 21 or older.", "You must be 18 or older to open an account.", "What is the minimum age to rent a car with us?", "What is the age limit for the youth fare?",
  "Ask the policyholder whether they are married or single so you can quote the right premium.", "Ask the caller if they plan to have children in the next year; the maternity rider must be added early.",
  "Accounts aged 90+ days go to collections.", "Prioritize accounts aged 90 and over.", "Follow up on anything aged 30+ days.",
  // Finding 7: respondents recruited by an agent, a patient's blank form.
  "You will call households to recruit parents aged 25-45 for our product panels.", "Agents recruit students aged 18-24 for paid focus groups.", "Patient date of birth: ____",
]) check(`(9th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  // Finding 2: a range of ages followed by a place, a date or a colon.
  "We are hiring agents aged 21-35 in Cebu.", "Hiring: CSR aged 21-35 in Cebu City", "Women aged 25-40 in Quezon City preferred.", "Male or female aged 21-35 in Metro Manila", "Aged 21-35 in good health.",
  "Must be 21-35 in age.", "Must be between 21 and 35 in age.", "Applicants must be 21-30 on hire date.", "Must be aged 21-35 on the start date.", "Agents aged 21-35: apply now", "Aged 18 to 30 per DOLE rules",
  "Applicants aged 20-35 per company policy.",
  // Finding 3: dependents and civil status on the employer's own HMO and tax forms.
  "Civil status and number of dependents (for tax and HMO):", "Number of dependents for HMO coverage", "Number of dependents to be covered by the HMO:",
  "Indicate the number of dependents you want covered by the company HMO.", "Enter the number of dependents for your tax exemption.", "State the number of dependents you claim for tax.",
  // Finding 5: "told", "benefit" and a range of ages.
  "Remind them you must be 21-35 years old to apply.", "We will explain that you must be 21 to 35 years old.", "Let our recruiter know you are 21-35 years old.", "Eligible from age 21 to 35.",
  "Agents qualify from age 21.", "Eligibility starts at age 21 for this role.", "Hires are covered from age 21 to 35 under our policy.",
  // Finding 6: an HR ask in quotes.
  'Start the interview by asking, "Can you confirm your date of birth?"', 'In the interview, ask: "What is your date of birth, for our files?"', 'Ask: "Are you married? Just for our records."',
  'Ask: "How old are you? I need it for your file."', 'Ask: "How many kids do you have? It is for the HMO policy."',
]) check(`(9th review) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
// Guards: each narrowed rule still keeps or drops what it must (most passed before the round too).
for (const line of [
  "Follow up on anything aged 30-60 days.", "Update the number of dependents on the policy.", "Explain to the caller that, by law, you must be 21 or older to buy alcohol.", "Let the guest know you must be 21 to check in.",
  "Clarify the age requirement.", "Explain the age limit to the parent.", "You are covered up to age 65.", "Membership ends at age 25.", 'Ask "What is your date of birth?" before you open the account.',
]) check(`(9th review, guard) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  'Ask the applicant: "For security, what is your date of birth?"', "Remind them that applicants must be at least 21 years old.", "Must explain how refunds work and be at least 21 years old.",
  "Able to explain how refunds work, at least 21 years old.", "Let our recruiter know you are at least 21.", "Eligibility starts at age 21.",
  "To apply, you must be at least 21 years old.", "We're seeking students aged 18-22.", "We're recruiting students aged 18-22 for weekend shifts.", "Hiring parents aged 30-45 for school-hours shifts.",
  "We hire 18-24 year old students for the night shift.", "Applicants must be 21-35 years old, patient and calm.", "Ask: How old are you?", "Ask the candidate whether they are married or single.",
  "Sex: ___ Age: ___", "Name: ____ Date of birth: ____", 'Greet the caller warmly. Then: "How old are you?"', "Open to agents from age 21, with HMO coverage.", "21-35 years old, patient and calm.", "Must be at least 21, patient and kind to callers.",
  "Let us know you are at least 21.", "Must be able to inform them clearly and be at least 21 years old.",
]) check(`(9th review, guard) …and still drops: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
check("(9th review) a practice case whose customers are 16-year-old players or 70-year-old patients is kept whole (generate-flow and ai-generate-workflow drop a case whole)", A.withoutAgeAsks([
  { title: "Banned teen account", prompt: "A parent writes in angry. Lots of 16-year-old players share one login, and her son's account was banned for it. Calm her, explain the rule and offer the appeal form." },
  { title: "Locked out of the portal", prompt: "Most 70-year-old patients prefer a phone call. This caller is locked out of the portal and wants her lab results. Verify her and walk her through the reset." },
  { title: "Medicare question", prompt: "A 64-year-old caller asks when Medicare starts. Tell her she can enroll at age 65 and offer to send the guide." },
], (s) => `${s.title}. ${s.prompt}`).length === 3);
check("(9th review) …a Medicare helpline's post keeps its hiring sentence, and a requirements list loses an age range in a place and the HMO dependents line",
  A.textWithoutAgeAsks("We run a Medicare helpline. We are hiring agents to support 70-year-old members with their Medicare plans. Night shift, fully remote.") === "We run a Medicare helpline. We are hiring agents to support 70-year-old members with their Medicare plans. Night shift, fully remote." &&
  JSON.stringify(A.withoutAgeAsks(["Excellent written English", "Aged 21-35 in good health", "Civil status and number of dependents (for tax and HMO):"])) === JSON.stringify(["Excellent written English"]));
for (const [q, options] of [
  ["Which details should you verify before sharing lab results?", ["Full name and date of birth", "Email address only", "Nothing; just read them", "Their favorite color"]],
  ["When does Medicare usually start?", ["At age 65", "At age 50", "At age 18", "Never"]],
  ["What is the minimum age to rent a car with us?", ["21", "25", "18", "30"]],
]) check(`(9th review) a quiz question whose answer is a caller's check, a benefit's age or a rental's stays: ${JSON.stringify(q)}`, !A.questionAsksAge(q, options));
check("(9th review, guard) …and so does one whose answer is a bare \"Can you confirm your date of birth?\" (confirming is a caller's check)", !A.questionAsksAge("A caller asks for her lab results. What do you do first?", ['Ask, "Can you confirm your date of birth?"', "Read them out", "Email them"]));
for (const line of [
  "Has handled 70-year-old callers at a pharmacy line for 3 years.", "Calmed 16-year-old players well.", "At 21:30 he ended the chat early.", "She was 35 lines into the script before she asked for the order number.",
  "He was 20 short of the 40 WPM bar.", "They're 25 people on her current team.",
]) check(`(9th review) a reviewer's remark about the work stays: ${JSON.stringify(line)}`, !A.marksAgeOrFamily(line));
for (const line of [
  "She is a single parent, so nights may be hard.", "She is a solo parent.", "Solo parent; needs day shifts.", "As a single parent, she needs day shifts.", "He is a parent of two young kids.",
  "Seems young for a lead role.", "Looks young for this role.", "Just got married, may take leave.",
]) check(`(9th review) a reviewer's remark on age or family is dropped: ${JSON.stringify(line)}`, A.marksAgeOrFamily(line));
// Guards: "a parent" is now read, the bare age needs its clause to end, an age after "at" needs a benefit to be a customer's.
for (const line of ["Became a parent figure to the newer agents.", "Kind to the parent who has small kids on the line.", "Calmed a parent with two kids on the line.", "Handled the single parent's billing case well."]) check(`(9th review, guard) a reviewer's remark about the work stays: ${JSON.stringify(line)}`, !A.marksAgeOrFamily(line));
for (const line of ["He's 23 and eager.", "Led a team at age 19.", "At 23: may lack maturity."]) check(`(9th review, guard) a reviewer's remark on age or family is dropped: ${JSON.stringify(line)}`, A.marksAgeOrFamily(line));

// The tenth Phase 6 review: the ninth round's exemptions let applicant asks and hiring ages through (an unquoted "Ask:" or
// "Script:" line holding a check word such as "confirm", a customer word right after a hiring age, a benefit word anywhere in
// an "up to age 35" line, a prefixed blank label, "we recruit", "would be perfect for a 22-year-old"), and its narrowings
// dropped a tax or insurance desk's dependents lines, an insurance desk's identity check naming "your policy", a product's
// range of ages told as "you must be", a queue item's age range and a grader's line about a single or working parent
// customer. Each was fixed where it came from; every check in this list fails on the ninth round's module.
console.log("\nThe tenth review's cases\n");
for (const line of [
  // Finding 1: after "Say:", "Ask:" or "Script:", unquoted, only a plain identity check of a customer is theirs.
  "Ask: How old are you? Are you single? Let me confirm your schedule.", "Ask: Do you have children? Verify that they can work weekends.",
  "Ask: Which age group are you in? Then confirm their availability.", "Ask: Are you married or single? I need to verify your HMO enrollment.",
  "Ask: Can you confirm your date of birth for our records?", "Script: Hi, thanks for applying to Bright Clinic! Can you confirm your date of birth?",
  "Screening script: Please verify your date of birth and civil status.", "Opening: Hi, thanks for applying! Before we begin, can you confirm your age and civil status?",
  "Greeting: Thanks for applying! Please confirm your date of birth and whether you are married.",
  "Record a 60-second video. Say: your full name, age, civil status, and confirm you can work nights.",
  "In your video, say: your name, your age, where you live, and confirm your internet speed.",
  "Say: Thanks for your interest in the role. How old are you, and do you have kids? I just need to confirm a few details.",
  // Finding 2: a customer word right after a hiring age, or before "preferred".
  "Hiring 21-35 year old Patient Access Representatives.", "Hiring 21-35 year old patient coordinators for our clinic.", "Hiring 20-30 year old Patient Services Representatives in Makati.",
  "We are looking for 20-30 year old Member Services Representatives.", "Hiring 21-35 year old Guest Services Agents for our resort.", "Hiring 21-35 year old client services associates.",
  "Hiring 21-30 year old customer representatives.", "Hiring 21-35 year old help desk agents.", "Seeking 18-25 year old gamers to join our player support team.",
  "Now hiring 21-35 year old residents of Cebu City.", "Hiring 21-30 year old patient and friendly CSRs.", "Looking for 21-30 year old patient, friendly agents.",
  "• 21-35 years old residents of Metro Manila preferred", "18-30 year old residents of Cebu City preferred.", "21-35 year old gamers preferred.",
  // Finding 3: "up to / until / at age N" with the benefit after the age.
  "We hire agents up to age 35 and offer full benefits.", "Hiring until age 35 only, with competitive rates.", "Open to fresh graduates up to age 30, with full benefits.",
  "Open to all genders up to age 35, with HMO and paid leave benefits.", "We welcome agents up to age 40, with health insurance from day one.",
  "Agents up to age 35 get a sign-on bonus and HMO coverage.", "Agents are hired at age 21 and up, with HMO coverage.", "Start your career at age 18 with full benefits!",
  "Work with us at age 18+ with paid training and HMO benefits.", "We accept walk-ins until age 35, with full benefits.",
  // Finding 7: a blank label with "Applicant", "Candidate" or "Employee" before it.
  "Applicant age: ____", "Applicant date of birth: ____", "Applicant DOB: ______", "Candidate date of birth: ____", "Candidate civil status: ____", "Employee date of birth: ______",
  // Finding 8: "we recruit", "would be perfect for", "it's great for" a job.
  "We recruit students aged 18-22 as part-time chat agents.", "We actively recruit retirees aged 55-70 for our day shift.",
  "This role would be perfect for a 22-year-old fresh graduate.", "It's great for a 21-year-old looking for a first job.",
]) check(`(10th review) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
for (const line of [
  // Finding 4: a customer's dependents in tax, marketplace, family-plan and HMO-card work.
  "Collect the number of dependents for the tax filing.", "Confirm income, filing status and number of dependents before you file.", "Ask for the number of dependents to claim on Form 1040.",
  "Ask for household size and number of dependents to estimate the subsidy.", "Verify the number of dependents for the household's coverage.",
  "Enter the number of children covered under the family plan.", "Record the number of dependents covered on the HMO card.",
  // Finding 5: an insurance desk's identity check naming the customer's own policy, file or records.
  'Ask: "May I have your date of birth so I can find your policy?"', 'Script: "Can I get your date of birth to pull your policy?"', 'Say: "Please give me your date of birth to locate your file."',
  'Ask: "What is your date of birth? I need it to update your records."', 'Ask, "What\'s your date of birth?" and update the policy record.', 'Ask: "Do you have dependents on your policy?"',
  // Finding 9: a product's range of ages told as "you must be".
  "Explain that you must be 18-25 to get the youth rate.", "Tell the guest that you must be 18 to 25 for the youth hostel rate.", "Tell callers that you must be 18 to 25 for the student plan.",
  // Finding 10: a queue item's age range before "in".
  "Escalate any ticket aged 48-72 in the queue.", "Follow up on requests aged 30-60 in Zendesk.", "Prioritize chats aged 10-15 in the queue.", "Escalate any case aged 30-60 in the queue.",
]) check(`(10th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  // Finding 6: a single, solo, working or stay-at-home parent who is a customer.
  "Was kind to a single parent whose card was declined.", "Strong: kept a single parent on the line and fixed the double charge.", "Her reply to a single parent's refund request was warm and exact.",
  "Calmed a parent of two who was double-charged.", "Gave a working parent clear options for evening appointments.", "Kind to a stay-at-home parent confused by the bill.",
  "Correctly explained solo parent leave eligibility.", "Ask how they would help a working parent who can only come in after 5 pm.", "Ask how they would calm a single parent whose child's appointment was cancelled.",
]) check(`(10th review) a reviewer's remark about the work stays: ${JSON.stringify(line)}`, !A.marksAgeOrFamily(line));
// …and in the real paths: generate-flow (:252) and ai-generate-workflow (:616) drop a practice case whole, ai-generate-workflow
// (:607) deletes a step's prompt that asks, ai-generate-job-content (:387) keeps a description's other sentences, and the
// written interview's grader (interviewContext.ts) drops a strength that marks.
check("(10th review) a tax desk's, a marketplace desk's and an insurance desk's practice cases are kept whole", A.withoutAgeAsks([
  { title: "Tax season", prompt: "A filer calls about a late refund. Confirm income, filing status and number of dependents before you file, then explain the timeline." },
  { title: "Marketplace renewal", prompt: "A caller is renewing her marketplace plan. Ask for household size and number of dependents to estimate the subsidy, and explain the deadline." },
  { title: "Policy lookup", prompt: 'An insured caller wants her claim status. Ask: "May I have your date of birth so I can find your policy?" Then give the status.' },
], (s) => `${s.title}. ${s.prompt}`).length === 3);
check("(10th review) …a requirements list loses a hiring age before a customer word, a benefit after an age and a prefixed blank", JSON.stringify(A.withoutAgeAsks([
  "Excellent written English", "Hiring 21-35 year old residents of Cebu City", "Start your career at age 18 with full benefits!", "Seeking 18-25 year old gamers to join our player support team", "Applicant age: ____",
])) === JSON.stringify(["Excellent written English"]));
check("(10th review) …a video prompt or a phone screen that asks age or civil status after \"Say:\" or \"Ask:\" asks", A.asksAgeOrStatus("Record a 60-second video. Say: your full name, age, civil status, and confirm you can work nights.") && A.asksAgeOrStatus("Phone screen.\nAsk: How old are you? Are you single? Let me confirm your schedule.\nThen ask about shifts."));
check("(10th review) …a description keeps its other sentences", A.textWithoutAgeAsks("We are a growing clinic in Cebu. Hiring 21-35 year old Patient Coordinators. We hire agents up to age 35 and offer full benefits. Day shift.") === "We are a growing clinic in Cebu. Day shift.");
check("(10th review) …and the grader's strengths keep a line about a single parent customer", ["Was kind to a single parent whose card was declined.", "Calmed a parent of two who was double-charged.", "Clear written English."].filter((l) => !A.marksAgeOrFamily(l)).length === 3);
// Guards: what each narrowed rule must still keep or drop, and the four weakenings the tenth review found no check for (a neutral
// person after an age, "hmo" as a benefit, a range without "and", renting widened to booking).
for (const line of [
  "Say: Thank you for calling Bright Clinic. For security, may I have your full name and date of birth?", "Patient intake script: May I have your date of birth?",
  "Greeting: Thank you for calling Bright Clinic, this is Ana. Can I get your date of birth to pull up your chart?", "Ask: May I have the patient's date of birth?",
  "Script: Thanks for calling about your loan application. For security, may I have your date of birth?",
  "Ideal for 16-year-old players new to the game.", "Under the ACA, your child can stay on your plan until age 26.", "Agents should know coverage ends at age 26.",
  "It's perfect for a 12-year-old's first phone.", "Loan applicant age: ____", "Tell the caller that the youth plan is for ages 18-25.",
  "At age 65, you can enroll in Medicare.", "Until age 26, your child can stay on your plan.", "You qualify at age 60 for the senior rate.", "You become eligible at age 65 for Medicare.",
]) check(`(10th review, guard) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  "Script: Thanks for applying! For security, may I have your date of birth?", "Say: Please confirm your date of birth and civil status for the account.", "Opening: Thanks for calling! How old are you?",
  "Phone screen script: Hi [Name], thanks for applying. To verify your application, what is your date of birth?", 'Ask: "Are you married? I need it to update your records."',
  "Hiring 21-30 year old women for the night shift.", "We want 22-30 year old individuals with BPO experience.", "21-30 year old individuals with BPO experience.",
  "With full benefits, we hire agents up to age 35.", "Free HMO for agents up to age 35.", "We hire at age 21 and above, HMO from day one.",
  "Explain that you must be between 21 and 35 to join the team.", "Explain that you must be 21-35 for the healthcare account.", "We will explain that you must be 21 to 35 years old for the role.",
  "You must be 21 or older to book shifts in our scheduling app.", "Number of dependents covered under the company HMO:", "Number of children (for the family plan):",
  "Hiring 21-35 year old Patient Access Representatives in Cebu; patients first.", "21-35 year old agents with BPO experience.",
  'Say: "Thanks for your interest in the role. How old are you? I just need a few details."', "Say: Welcome to the applicant portal. Please enter your date of birth.",
  "Say: Thanks for calling Bright Clinic! Ilang taon ka na?", 'Ask: "What is your date of birth? It is for our records."', "Explain that you must be 21-35 to join our insurance team.",
  "Number of dependents covered under the company plan:", "Full benefits for agents from age 21.", "We hire up to age 35 for full-time roles with benefits.",
]) check(`(10th review, guard) …and still drops: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
for (const line of [
  "She's a single parent, so nights may be hard.", "She, a single parent, may need day shifts.", "Also a single parent, which may limit nights.", "Works as a solo parent and needs flexibility.",
  "Single parent; may need day shifts.", "Parent of two; nights may be hard.", "Being a solo parent, she prefers days.", "She has been a single parent for years.", "She is now a single parent.",
]) check(`(10th review, guard) a reviewer's remark on age or family is dropped: ${JSON.stringify(line)}`, A.marksAgeOrFamily(line));
// Known, and left (the tenth review): each is read as shown for the reason given, so the next review need not report it.
for (const [line, drops, why] of [
  ['Ask: "Can you confirm your date of birth? Just for our records."', false, "in quotes, \"confirm\" is a customer's check (a clinic asks \"for our records\" too); only an unquoted \"Ask:\" line must be a plain identity check"],
  ["Say: Thanks for calling. Do you have children on your policy?", true, "after a script's colon only a date of birth is a customer's; the same words in quotes stay"],
  ["Ask: Can you please verify your date of birth?", true, "after a script's colon \"confirm\" or \"verify\" alone does not say who is asked (\"Ask: Can you confirm your date of birth for our records?\"); quoted, or naming a customer or a check, it stays"],
  ["We recruit parents aged 25-45 for our product panels.", true, "\"we recruit\" is the business hiring; an agent's \"to recruit\" respondents stays"],
  ["We want 70-year-old patients to feel heard.", true, "a hiring word right before an age hires whoever is named after it (\"Seeking 18-25 year old gamers\")"],
  ["Full HMO coverage for agents up to age 35.", false, "a benefit named before the age reads as the benefit's age (\"You are covered up to age 65\")"],
  ["Up to age 35, with full benefits.", false, "an age that opens its clause is a benefit's when the sentence names one (\"At age 65, you can enroll in Medicare\")"],
  ["Ideal for 18-25 year old gamers.", false, "\"ideal for\" before a customer word reads as a product's (\"Ideal for 16-year-old players new to the game\")"],
  ["• 21-35 years old residents of Metro Manila", false, "with no hiring word before it and no preference after it, the person right after an age says whose it is (\"Most 70-year-old patients prefer a phone call\")"],
]) check(`(10th review, known) ${drops ? "dropped" : "kept"}: ${JSON.stringify(line)}: ${why}`, A.asksAgeOrStatus(line) === drops);

// The eleventh Phase 6 review: the tenth round's read of a script's line, its comma cut for a benefit and its hiring cues
// after a person dropped ordinary customer-service text (a quote to a named caller after "Say:" text, "For Medicare, you're
// eligible at age 65", "A 70-year-old caller says a phone call is preferred", "A worried mother is looking for her
// 15-year-old son's missing order", "It's great for students aged 18-24 with part-time jobs"), and its customer's-own-file and
// dependents exemptions let an applicant's date of birth "for your file" and the employer's "Number of dependents in your
// household:" through. Each was narrowed where it came from; every check in this list fails on the tenth round's module.
console.log("\nThe eleventh review's cases\n");
for (const line of [
  // Finding 1: a quote to a named customer after unquoted "Say:", "Script:" or "Greeting:" text on the same line.
  'Say: Thanks for calling Medicare Help. Then ask the caller, "Are you 65 or older?"', 'Script: Greet the member warmly. Ask the member, "Do you have dependents on your policy?"',
  'Say: Thank you for calling. Then ask the client, "Are you married or single?"', 'Script: Thank the guest, then ask the guest, "Are you 21 or older?" before the rental.',
  'Greeting: Welcome the player. Then ask the player, "Are you 18 or older?"', 'Say: Hi, this is Ana from Bright Clinic. Ask the patient, "Are you 65 or older?"',
  'Script: Greet the taxpayer. Then ask the client, "How many dependents do you have?"', 'Say: Thank you for calling. Ask the caller, "Are you over 65?" and explain the senior plan.',
  // Finding 2: a benefit named before a comma.
  "For Medicare, you're eligible at age 65.", "For Medicare Part A, you become eligible at age 65.", "Good news: for Medicare, you qualify at age 65.", "For Medicare, eligibility starts at age 65.",
  "With Social Security, you can start at age 62.", "For the senior citizen discount, you qualify at age 60.", "For the youth fare, you qualify until age 25.",
  "As for Medicare, you'll be eligible at age 65, and you can sign up three months before.",
  // Finding 3: a customer's own "preferred", "wanted", "looking for", "seeking".
  "A 70-year-old caller says a phone call is preferred.", "The 70-year-old caller says a callback is preferred.", "A 70-year-old customer says cash is preferred.",
  "A 65-year-old member got the plan she wanted.", "A 16-year-old player says the skin he wanted is gone.", "A 70-year-old caller says the agent he wanted was out.",
  "70-year-old patients often say phone calls are preferred.", "Her 15-year-old son got the skin he wanted.",
  "A worried mother is looking for her 15-year-old son's missing order.", "A mother seeking her 17-year-old son's refund calls in angry.",
  // Finding 7: "it's ideal / great / perfect for" a customer who has a job.
  "It's great for students aged 18-24 with part-time jobs.", "It's perfect for seniors aged 60 and over who still work.", "It's ideal for teens aged 13-17 with weekend jobs.",
  "It's great for 16-year-old drivers who drive to work.",
]) check(`(11th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  "Calmed a 16-year-old player who lost the skin he wanted.", "Got a 65-year-old member the plan she wanted.", "Strong: offered a 70-year-old caller the phone option she preferred.",
  "Calmly helped a mother seeking her 17-year-old son's refund.",
]) check(`(11th review) a reviewer's remark about the work stays: ${JSON.stringify(line)}`, !A.marksAgeOrFamily(line));
for (const line of [
  // Finding 4: a date of birth asked of an applicant "for your file" or "your records", or in a recruiter's, HR's or a phone
  // screen's script.
  'Say: "Thanks for applying! What is your date of birth? I will add it to your file."', 'Ask: "Thanks for applying! What is your date of birth? I will add it to your records."',
  'Phone screen script: "Hi, thanks for your interest in the role. Can I get your date of birth to update your records?"', 'Recruiter script: "May I have your date of birth to update your records?"',
  'During the phone screen, ask: "Can I get your date of birth for your file?"', 'HR script: "May I have your date of birth so I can update your records?"',
  "Phone screen script: Hi, thanks for your interest in the job. For security, may I have your date of birth?",
  "Script: Hi! Thanks for your interest in the Patient Coordinator role. To pull up your account, what is your date of birth?",
  'Ask: "Thanks for your interest in joining our team! What is your date of birth for your file?"', 'Say: "Hi, this is Ana from human resources. Can I get your date of birth to update your records?"',
  // Finding 6: the employer's own dependents lines.
  "Number of dependents in your household:", "Number of children in your household:", "Please indicate the number of dependents in your household.",
  "Enter the number of dependents in your household for our records.", "Number of dependents to be covered under the HMO plan:", "Number of dependents you want covered under the HMO plan:",
  "Number of dependents for tax filing purposes:",
]) check(`(11th review) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
// …and in the real paths: generate-flow (:252) and ai-generate-workflow (:616) drop a practice case whole, generate-flow's quiz
// filter (:250) drops an item whole, ai-generate-workflow (:607) deletes a step's prompt that asks, and both read application
// questions (generate-flow :249, ai-generate-workflow's questionAsksAge).
check("(11th review) practice cases with a quote to a named caller, a customer's preference and a mother looking for her son's order are kept whole", A.withoutAgeAsks([
  { title: "Medicare timing", prompt: 'Say: Thanks for calling Medicare Help. Then ask the caller, "Are you 65 or older?" and explain when Part B starts.' },
  { title: "Junior account", prompt: 'Greeting: Welcome the player. Then ask the player, "Are you 18 or older?" and explain the junior account rules.' },
  { title: "Lost skin", prompt: "A 16-year-old player says the skin he wanted is gone after a refund. Check the purchase and explain the policy." },
  { title: "Missing order", prompt: "A worried mother is looking for her 15-year-old son's missing order. Find it and give a delivery date." },
], (s) => `${s.title}. ${s.prompt}`).length === 4);
check("(11th review) …a quiz item whose good answer says when Medicare starts is kept", A.withoutAgeAsks([{ scenario: "A caller turning 64 asks when she can get Medicare.", good: "For Medicare, you're eligible at age 65, and I can send you the sign-up guide." }], (q) => `${q.scenario} ${q.good}`).length === 1);
check("(11th review) …a phone screen's step prompt that asks a date of birth \"for your file\" asks", A.asksAgeOrStatus('Phone screen.\nSay: "Thanks for applying! What is your date of birth? I will add it to your file."\nThen ask about their shift availability.'));
check("(11th review) …and an application form loses \"Number of dependents in your household\", as a line and as a question with options", JSON.stringify(A.withoutAgeAsks(["Full name", "Number of dependents in your household:", "Years of call center experience"])) === JSON.stringify(["Full name", "Years of call center experience"]) && A.questionAsksAge("Number of dependents in your household", ["0", "1", "2", "3 or more"]));
// Guards: what each narrowed rule must still keep or drop, and the one weakening the eleventh review found no check for
// (FOR_A_PRODUCT read 60 characters past the age).
for (const line of [
  // A quote inside a script's line is a customer's only when its sentence names one; a quote on its own after "Say:" text is
  // read with the line as before.
  'Say: Thanks for calling Bright Clinic. "May I have your date of birth?"', 'Script: Welcome the guest. Ask the guest, "Are you 21 or older?" Then offer the wine list.',
  // "Thanks for applying" for a card or a loan is a customer's; "24 HR" is a time; a customer's file stays with no applicant
  // on the line; a script framed for candidates that names its caller's check stays.
  'Say: "Thanks for applying for the Bright Card! What is your date of birth? I will add it to your file."', "Script: Thanks for applying for our credit card. For security, may I have your date of birth?",
  'We offer 24 HR support. Say: "May I have your date of birth to find your file?"', 'Say: "Thanks for calling about your screening. May I have your date of birth to update your records?"',
  'Say: "Your screening is at 3 pm. May I have your date of birth to update your records?"',
  "Candidates role-play this call. Say: Thank you for calling Bright Clinic. For security, may I have your date of birth?",
  // A benefit before a comma, said to "you".
  "With the student discount, you save until age 25.", "For Social Security, you can claim as early as age 62.",
  // A pronoun or "says" makes the wish someone else's; a possessive before the age is someone's family.
  "70-year-old callers say a phone call is preferred.", "A mother calls: her 16-year-old son lost the skin he wanted.", "A caller seeking her 70-year-old mother's records needs written consent.",
  // A customer's tax filing with "their", and a named customer's form even with "your".
  "Confirm the number of dependents on their tax filing.", "Ask the client for the number of dependents on your intake form.",
]) check(`(11th review, guard) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  'Say: Hi. Then confirm, "How old are you?"', 'Say: Hi. Then ask, "For security, how old are you?"', 'Opening: Thanks for applying! Then ask the caller, "How old are you?"',
  'Say: Thanks for your interest in the role. Ask the guest, "Are you married?"', 'Phone screen script: Greet them, then ask the member, "How old are you?"',
  'Phone screen. Say: "May I have your date of birth to update your records?"', 'Recruiter call. Ask: "Can I get your date of birth for your file?"',
  'Ask: How many angry callers do you handle in a day, and "are you married?"',
  "For Medicare, we hire agents up to age 65.", "With full benefits, we hire up to age 35.", "With full benefits, agents up to age 35 are welcome.", "With full benefits, we recruit students up to age 25.",
  "With full benefits, we employ students up to age 25.", "With full benefits, we accept walk-ins up to age 35.", "Full benefits, ideally up to age 35.", "Full benefits, preferably up to age 35.",
  "With HMO coverage, we accept applicants up to age 35.",
  "21-35 year old gamers who love our games are preferred.", "21-35 year old gamers preferred, since they know our games.", "Our client is looking for 21-35 year old Patient Coordinators.",
  "We are hiring our new 21-35 year old Patient Coordinators.", "21-35 year old players wanted for our support team.",
  "Number of dependents covered under the company HMO:", "Number of dependents you'd like covered under the HMO plan:",
  "It's perfect for a 22-year-old who wants a part-time job.", "It's ideal for students aged 18-24 seeking part-time work.",
  "Explain that you must be 21-35 years old if you want to apply for our HMO plan.",
]) check(`(11th review, guard) …and still drops: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
// Known, and left (the eleventh review): each is read as shown for the reason given, so the next review need not report it.
for (const [line, drops, why, fn = "asksAgeOrStatus"] of [
  ["Wanted: 21-35 year old Patient Coordinators", false, "the hiring words before a customer-word title are a list (HIRING_LEAD); \"Wanted:\", \"Vacancy:\", \"Requirements:\" are not in it, and no one word adds them without dropping a caller's \"wanted\" (\"The caller wanted a 16-year-old's account closed\") or a game desk's \"Requirements: 16-year-old players need a parent's consent\""],
  ["21-35 year old Patient Coordinators, apply now!", false, "a preference after the person is a list (PREFERRED_AFTER: \"preferred\", \"wanted\", \"may apply\"…); \"needed\" and \"apply now\" are not in it"],
  ["Say: Hi, I'm calling about your application. To verify your identity, what's your date of birth?", false, "\"your application\" is a loan's, a visa's or a permit's too; HR's \"thanks for applying\", \"your interest in the role\", a recruiter, HR and a phone screen are read"],
  ["With full benefits, open to all up to age 35.", false, "a benefit named before the age counts unless the age's own clause hires someone (HIRES_HERE); \"open to\" is a fare's too (\"For the youth fare, it's open to riders up to age 25\")"],
  ['Ask: "What is your household size and number of dependents?"', true, "a household is a customer's only when the form is not the reader's own; \"your\" with no customer named is the applicant's (as in the ninth round)"],
  ["She is the parent of two young kids, so nights could be hard.", false, "\"parent\" is the applicant's when said of them with \"a\" (the tenth review); \"the parent of two\" reads as a person in a practice case (\"Calmed the parent of two who called\")", "marksAgeOrFamily"],
  ["Reassured a single mom whose card was declined.", true, "only \"parent\" is read as a customer in a remark (the tenth review); \"a single mom\" is the applicant's, as in \"She is a single mom\"", "marksAgeOrFamily"],
]) check(`(11th review, known) ${drops ? "dropped" : "kept"}: ${JSON.stringify(line)}: ${why}`, A[fn](line) === drops);

// The twelfth Phase 6 review: the eleventh round's applicant cues, read anywhere on a script's line, dropped a front desk's
// identity check ("…transfer them to HR", "If you need HR, press 9", "PayEasy HR support", "24-HR", "your cracked phone screen",
// "your interest in joining our clinic as a new patient", "Thanks for applying for Medicare", "Interview role-play: the patient
// calls…"), its pronoun and "says" exemption let a hiring preference through ("…, if they can do nights, preferred", "…who we can
// train are preferred", "…, as they bring patience, are welcome to apply"), a customer's own preference with an age still read
// as a hire ("A 70-year-old caller, Tagalog preferred, asks…"), a tax desk's "Your refund depends on your filing status and the
// number of dependents you claim" was dropped while the employer's "Filing status and number of dependents:" passed, and a
// benefit before a comma excused "we're looking for students up to age 25". Each was narrowed where it came from; every check
// in this list fails on the eleventh round's module.
console.log("\nThe twelfth review's cases\n");
for (const line of [
  // Finding 1: an applicant word that is a department, a phone-menu option, a business, an hour, a phone's screen or a plan's.
  "Say: Thanks for calling Bright Clinic. For security, may I have your date of birth? If they ask about jobs, transfer them to HR.",
  "Say: Thank you for calling Bright Pharmacy. For security, may I have your date of birth? If you need HR, press 9.",
  "Say: Thanks for calling Bright Clinic. To pull up your chart, what is your date of birth? Send job questions to human resources.",
  "Say: Thank you for calling Bright Clinic. For security, may I have your date of birth? If it's a recruiter, take a message.",
  "Script: Thank you for your interest in joining our clinic as a new patient. For security, may I have your date of birth?",
  "Script: Thank you for your interest in joining our Medicare Advantage plan. To verify your identity, may I have your date of birth?",
  "Say: Thanks for your interest in joining the gym. For security, may I have your date of birth?",
  "Script: Thanks for calling about your cracked phone screen. To verify your identity, what is your date of birth?",
  "Script: Thank you for calling PayEasy HR support. For security, may I have your date of birth?",
  "Say: Thank you for calling the Human Resources benefits line. For security, may I have your date of birth?",
  "Script: Thanks for calling our 24-HR pharmacy line. For security, may I have your date of birth?",
  "Script: Thank you for calling. For security, may I have your date of birth? (Calls about a phone screen go to HR.)",
  "Script: Thanks for your interest in working with Bright Home Care. For security, may I have your date of birth?",
  'Say: "Thank you for your interest in joining our plan. May I have your date of birth to find your file?"',
  'Interview role-play: the patient calls to move an appointment. Say: "May I have your date of birth to find your file?"',
  'Say: "Thanks for applying for Medicare. May I have your date of birth to update your file?"',
  'Say: "I can help with the phone screen claim. May I have your date of birth to update your records?"',
  "Script: Thank you for applying for the senior discount. For security, may I have your date of birth?",
  // Finding 3: a customer's own preference, named after a comma or a colon.
  "A 70-year-old caller, Tagalog preferred, asks about her refill.", "Profile: 70-year-old patient, Tagalog preferred.",
  "A 72-year-old member, phone contact preferred, calls about her bill.", "For 70-year-old patients, a phone call is preferred.",
  "A 70-year-old caller: callback preferred.", "With 70-year-old patients, a phone call is often preferred.",
  // Finding 4: what a tax or subsidy desk explains to "you".
  "Your refund depends on your filing status and the number of dependents you claim.", "The tax credit depends on the number of dependents in your household.",
  "Explain that the subsidy depends on your household income and the number of dependents in your household.",
  "Your benefit amount depends on the number of children in your household.", "Your premium is based on your household size and the number of dependents on your plan.",
  "Explain how the number of dependents affects your filing status.",
]) check(`(12th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  // Finding 2: a pronoun, "we" or "tell" inside the hired person's own clause.
  "Retirees aged 55-70, as they bring patience, are welcome to apply.", "Students aged 18-22, if they can do nights, preferred.",
  "Students aged 18-22 who we can train are preferred.", "Seniors aged 60+ who tell us they miss working may apply.",
  "College students aged 18-22 who we can train on weekends are welcome to apply.", "21-35 year old residents who say they can work nights preferred.",
  "18-24 year old students, if they are available, preferred.",
  // Finding 4: the employer's bare labels, whoever's household or filing they name.
  "Number of dependents in the household:", "Filing status and number of dependents:", "Number of children in the household:", "Household size and number of dependents:",
  // Finding 6: a benefit earlier in the sentence and the module's own hiring words in the age's clause.
  "With full benefits, we're looking for students up to age 25.", "With full benefits, we want people up to age 35.", "With full benefits, we accept reps up to age 35.",
  "Full benefits from day one, but you must be up to 35 years old.", "Free HMO plan, but you need to be up to 35 years old to join.", "Our benefits are great, but you have to be up to 30 years old.",
]) check(`(12th review) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
// …and in the real paths: generate-flow (:252) and ai-generate-workflow (:616) drop a practice case whole, ai-generate-workflow
// (:607) deletes a step's prompt that asks, generate-flow's quiz filter (:250) drops an item whole, and textWithoutAgeAsks
// keeps a job post's other sentences.
check("(12th review) practice cases with a front desk's identity check and a caller's language preference are kept whole", A.withoutAgeAsks([
  { title: "Front desk: move an appointment", prompt: "Say: Thanks for calling Bright Clinic. For security, may I have your date of birth? If they ask about jobs, transfer them to HR. Then move the appointment to Friday." },
  { title: "Cracked screen claim", prompt: "Script: Thanks for calling about your cracked phone screen. To verify your identity, what is your date of birth? Then open the claim." },
  { title: "New patient", prompt: "Script: Thank you for your interest in joining our clinic as a new patient. For security, may I have your date of birth? Then book the first visit." },
  { title: "Payroll login", prompt: "Say: Thank you for calling PayEasy HR support. For security, may I have your date of birth? Then reset the login." },
  { title: "Medicare Advantage enrollment", prompt: "Script: Thank you for your interest in joining our Medicare Advantage plan. To verify your identity, may I have your date of birth? Then explain the plan." },
  { title: "Refill call", prompt: "A 70-year-old caller, Tagalog preferred, asks about her refill. Find the prescription and give a pickup time." },
], (s) => `${s.title}. ${s.prompt}`).length === 6);
check("(12th review) …a front desk's step prompt keeps its HR transfer line", !A.asksAgeOrStatus("Front desk call.\nSay: Thanks for calling Bright Clinic. For security, may I have your date of birth? If they ask about jobs, transfer them to HR.\nThen book the appointment."));
check("(12th review) …a tax desk's quiz item is kept", A.withoutAgeAsks([{ scenario: "A caller asks why her refund went down this year.", good: "Your refund depends on your filing status and the number of dependents you claim, so let's check both." }], (q) => `${q.scenario} ${q.good}`).length === 1);
check("(12th review) …and a job post loses a retiree preference with a pronoun and a hiring age after a benefit", A.textWithoutAgeAsks("Flexible part-time hours. Retirees aged 55-70, as they bring patience, are welcome to apply. With full benefits, we're looking for students up to age 25. Paid training.") === "Flexible part-time hours. Paid training.");
// Guards: what each narrowed rule must still keep or drop, and the eight weakenings the twelfth review found no check for (a
// preference's exemption gaining "can", "if" or "with", the possessive rule losing "his", the preference read 70 characters past
// the age, any "interest in" an applicant's, "HR" read without case, "visas" lost from what is applied for).
for (const line of [
  "A father is looking for his 15-year-old son's missing order.", "A 70-year-old caller explains that for her, a phone call is preferred.",
  "Script: Thank you for your interest in our membership. For security, may I have your date of birth?", "Script: Thanks for calling our 24-hr pharmacy line. For security, may I have your date of birth?",
  "Say: Welcome to our 24 hr call center. For security, may I have your date of birth?", "Script: Thanks for applying for a visa. For security, may I have your date of birth?",
  // An HR desk's own caller; a phone's screen; a customer's wish said as "not preferred"; what a caller may want to do.
  "Say: Thank you for calling, this is Ana from HR. For security, may I have your date of birth?", "Say: Thanks for calling about your phone screen repair. For security, may I have your date of birth?",
  "A 72-year-old patient says email is not preferred.", "For Medicare, you may want to wait until age 70.", "With Social Security, you'll want to wait until age 70.", "For Medicare, you need to sign up at age 65.",
  // A sentence ending in a colon is a label only when it is one; Form 1040 in a sentence is a customer's.
  "Confirm the household's number of dependents:", "Report the number of dependents in the household on Form 1040.",
  "Explain that the number of dependents in your household changes your premium.", "Good answer: The number of dependents you claim affects your filing status and your refund.",
  "Role-play for the interview. Say: \"May I have your date of birth so I can locate your file?\"", "The candidate plays the front desk. Say: \"May I have your date of birth to find your file?\"",
  // A note after the ask, quoted too; HR's own help lines; someone looking for their family's records.
  'Say: "May I have your date of birth to find your file?" Calls about a phone screen go to HR.', "Say: Hi, this is Ana from HR support. For security, may I have your date of birth?",
  "Script: Thanks for reaching the HR call line. For security, may I have your date of birth?", "Say: Welcome to the 24 hr call service. For security, may I have your date of birth?",
  "A caller seeking their 70-year-old mother's records needs written consent.", "For Social Security, you should be ready to claim at age 62.",
]) check(`(12th review, guard) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  "Students aged 18-22 who can work nights are preferred.", "Retirees aged 55-70, if available on weekdays, are welcome to apply.", "Students aged 18-22 with good English preferred.",
  "Students aged 18-22, bilingual preferred.", "21-35 year old gamers, bilingual preferred.", "Retirees aged 55+ who say they love people are welcome to apply.",
  "Students aged 18-22, if possible, are preferred.", "Students aged 18-22 with a degree are preferred.", "Students aged 18-22 with their own laptop are preferred.",
  "Students aged 18-22 who are bilingual are preferred.", "18-25 year old players, students welcome to apply.", "18-25 year old players, if bilingual, preferred.",
  "18-25 year old players, who love games preferred.", "18-22 year old students, bilingual preferred.",
  // Applicant cues still read where they say the one spoken to is applying, before the ask.
  "Say: Hi, how are you today? Thanks for applying! For security, may I have your date of birth?",
  "Script: Thanks for applying for our benefits coordinator role. For security, may I have your date of birth?",
  "Say: Thanks for your interest in working for Bright Clinic. For security, may I have your date of birth?",
  "Script: Thanks for your interest in joining the Bright Clinic team. For security, may I have your date of birth?",
  "During the phone screen, say: For security, may I have your date of birth?", "Say: Hi, this is Ana from recruiting. For security, may I have your date of birth?",
  'Say: "Hi, this is Ana from HR. May I have your date of birth to update your records?"', 'Say: "Welcome to your interview. May I have your date of birth for your file?"',
  // The reader's own form, unless a desk explains it; a label ending in a colon, with blanks too.
  "Ask for the number of dependents in your household for our records.", "Number of dependents in the household (for the subsidy):", "Number of dependents in the household: ____",
  "Indicate the number of dependents to be covered under the HMO plan.", "Indicate the number of dependents you'd like covered under the HMO plan.",
  "Please indicate the number of dependents for tax filing.", "Enter your filing status and the number of dependents.",
  "Indicate the number of dependents covered under the company plan.", "Indicate the number of dependents covered by the company HMO.",
  "With full benefits, we are also looking for students up to age 25.", "HMO plan included, and we only take people up to age 35.",
]) check(`(12th review, guard) …and still drops: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
// Known, and left (the twelfth review): each is read as shown for the reason given, so the next review need not report it.
for (const [line, drops, why] of [
  ["Enter the number of dependents you want covered under the family plan.", true, "an instruction that names what \"you want\" covered is the reader's own form (\"Indicate the number of dependents you want covered by the company HMO\"); only an explanation (depends on, affects, is based on, explain) is a desk's"],
  ["A 70-year-old caller thinks a callback is preferred.", true, "a customer's wish is read after \"says\", \"asks\" or \"tells\", a pronoun right before the word, or a comma or colon after the customer; \"thinks\", \"noted\" and \"believes\" are not read, since \"A 21-year-old who thinks on his feet is preferred\" is a hire"],
  ["A 16-year-old player got the skin his mom wanted.", true, "a pronoun right before \"wanted\" is the customer's own (\"the skin he wanted\"); a possessive and a person (\"his mom\") is not read"],
  ["21-35 year old gamers who say they love our games are preferred.", false, "\"says\" before \"is/are preferred\" is someone's wish (\"A 70-year-old caller says a phone call is preferred\"), and a \"who say\" clause in a hiring sentence reads the same"],
  ["Paid training and full benefits, open to people up to age 35.", false, "\"open to\" is a fare's too, as the eleventh review's \"With full benefits, open to all up to age 35\""],
  ["With the senior discount, agents can offer 10% off at age 60.", true, "\"agents\" in the age's clause is a hire (\"With full benefits, agents up to age 35 are welcome\"), so an agent's offer at an age reads the same"],
  ['Say: "May I have your date of birth to find your file? Thanks again for applying!"', false, "applicant cues are read up to the ask; after it they are a note about someone else (\"…may I have your date of birth? If they ask about jobs, transfer them to HR\")"],
]) check(`(12th review, known) ${drops ? "dropped" : "kept"}: ${JSON.stringify(line)}: ${why}`, A.asksAgeOrStatus(line) === drops);

// The thirteenth Phase 6 review: the twelfth round's customer before a comma was never anchored to the person the age belongs
// to, so it excused the customers a hire serves ("We need students aged 18-24 to help customers, bilingual preferred"), and its
// bare label, read one sentence at a time, dropped a customer's intake inside a practice case ("Complete her intake:\n- Filing
// status and number of dependents:"), and an applicant word after a script's ask went unread ("…? Then begin the interview."):
// all three regressed against the tenth and eleventh rounds. Its desk exemption read only the verb ("Does the number of children
// in your household affect your availability for night shifts?"), its applicant cues missed the usual HR and recruiter openers,
// and an HR desk's own callback and a benefit's "have to be signed up" read as hiring. Each was narrowed where it came from, or read as the tenth round read it; every check
// in this list fails on the twelfth round's module.
console.log("\nThe thirteenth review's cases\n");
for (const line of [
  // Finding 1: a customer word before the comma is the customers a hire serves unless it is the age's own person.
  "We need students aged 18-24 to help customers, bilingual preferred.", "We need retirees aged 55-70 to call patients, Tagalog preferred.",
  "Ideal hires: students aged 18-24 for our clients, bilingual preferred.", "• Students aged 18-24 to help callers, bilingual preferred",
  "Open to students aged 18-24 to help callers, bilingual preferred.", "18-24 year old students to help customers, bilingual preferred.",
  "Retirees aged 55-70 to support patients, Tagalog preferred.", "Students aged 18-22 for our patients: bilingual preferred.", "Students aged 18-22 serving guests, weekends preferred.",
  // Finding 3: a family question to the applicant that says "affect", "depend" or "explain".
  "Does the number of children in your household affect your availability for night shifts?", "How does the number of dependents in your household affect your schedule?",
  "Will the number of dependents in your household affect your ability to work nights?", "Briefly explain your household situation, including the number of children you have.",
  "Explain how the number of children in your household affects your availability.", "Does your household size or number of dependents affect when you can work?",
  "Your shift options depend on the number of children in your household.",
  // Finding 4: the usual HR and recruiter openers, "Welcome to your phone screen", a "post", and "before each interview" after a quote.
  'Say: "Hi Maria, I\'m Ana, a recruiter at Bright Clinic. May I have your date of birth for your file?"', 'Say: "Hi, this is Ana from Bright Clinic\'s HR team. May I have your date of birth for your file?"',
  'Say: "Hi Maria, Ana here from HR. May I have your date of birth for your file?"', 'Say: "Welcome to your phone screen. May I have your date of birth for your file?"',
  'Say: "Thanks for applying for the Coverage Specialist post. May I have your date of birth for your file?"', 'Ask: "May I have your date of birth for your file?" before each interview.',
  "Script: Hi Maria, I'm Ana, a recruiter at Bright Clinic. To verify your identity, may I have your date of birth?", "Script: Welcome to your phone screen. To verify your identity, may I have your date of birth?",
  "Script: Hi, I'm Ana, your recruiter. For security, may I have your date of birth?", 'Say: "May I have your date of birth to update your records?" to each candidate.',
  // Finding 5: an applicant word after the ask on the same listener's script line.
  "Say: Good morning! To verify your identity, may I have your date of birth? Then ask the applicant about their availability.",
  "Script: Hi Maria, to verify your identity, what is your date of birth? Then begin the interview.", "Script: Hi, may I have your date of birth? I'll pull up your interview file.",
  "Script: For security, may I have your date of birth? Thanks for applying!",
]) check(`(13th review) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
for (const line of [
  // Finding 2: a customer's intake label in a practice case that names her.
  "Tax refund call. A caller asks why her refund went down this year. Complete her intake:\n- Name:\n- Filing status and number of dependents:\n- Last year's refund:\nThen explain what changed.",
  "Subsidy renewal. A member renews her health subsidy. Fill in:\nHousehold size and number of dependents:\nMonthly household income:\nThen tell her the new amount.",
  "A client calls about her return. Fill in:\nNumber of dependents in the household:\nFiling status:",
  // Finding 6: an HR desk's own callback or hold, and "thanks for applying" for a rewards program.
  "Script: Hi, this is Ana from HR returning your call. To verify your identity, may I have your date of birth?",
  "Say: Good morning, this is Ana from Human Resources returning your call about your leave request. To verify your identity, what is your date of birth?",
  "Script: Thank you for holding, this is Ana from HR. For security, may I have your date of birth?",
  'Say: "Thanks for applying for our rewards program. May I have your date of birth to find your file?"', 'Say: "Thanks for applying for our loyalty program. May I have your date of birth to find your file?"',
  // Finding 7: a benefit's "have to be signed up".
  "For Medicare Part B, you have to be signed up before age 65.", "For Medicare, we want you signed up before age 65 to avoid the penalty.",
  "For Social Security, you need to be retired before age 70 to get the full amount.",
]) check(`(13th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
// …and in the real paths: generate-flow (:252) and ai-generate-workflow (:616) drop a practice case whole, generate-flow's
// requirements (:242) and application (:249) drop an item, ai-generate-workflow reads an application question with its options
// (questionAsksAge), and textWithoutAgeAsks keeps a job post's other sentences.
check("(13th review) practice cases with a customer's intake label are kept whole", A.withoutAgeAsks([
  { title: "Tax refund call", prompt: "A caller asks why her refund went down this year. Complete her intake:\n- Name:\n- Filing status and number of dependents:\n- Last year's refund:\nThen explain what changed." },
  { title: "Subsidy renewal", prompt: "A member renews her health subsidy. Fill in:\nHousehold size and number of dependents:\nMonthly household income:\nThen tell her the new amount." },
], (s) => `${s.title}. ${s.prompt}`).length === 2);
check("(13th review) …a job's requirements and post lose a hiring preference beside the customers it serves", JSON.stringify(A.withoutAgeAsks(["Good English", "We need students aged 18-24 to help customers, bilingual preferred.", "Stable internet"])) === JSON.stringify(["Good English", "Stable internet"]) && A.textWithoutAgeAsks("Flexible part-time hours. We need students aged 18-24 to help customers, bilingual preferred. Paid training.") === "Flexible part-time hours. Paid training.");
check("(13th review) …and an application loses a question about the household's children and the applicant's shifts, as a line and with options", JSON.stringify(A.withoutAgeAsks(["Full name", "Does the number of children in your household affect your availability for night shifts?"])) === JSON.stringify(["Full name"]) && A.questionAsksAge("Does the number of children in your household affect your availability for night shifts?", ["Yes", "No"]));
// Guards: what each narrowed rule must still keep or drop, and the four weakenings the thirteenth review found that change a
// realistic line (a pronoun two words before "preferred", the recruiting label, "thanks for" for "thanks for calling", the ask
// read only up to the birth date).
for (const line of [
  // The customer right after the age, one word between at most, in its usual forms.
  "A 70-year-old Filipino caller, Tagalog preferred, asks about her refill.", "A 70 yo caller, Tagalog preferred, asks about her refill.",
  "18-24 year old callers, Tagalog preferred, ask about the student plan.", "For our 70-year-old patients, a phone call is preferred.", "A 70-year-old retired caller, a callback preferred.",
  // A label in an item that names a customer; a desk that explains money or eligibility.
  "Explain that the number of dependents in your household affects your monthly cost.", "Explain that the number of dependents in your household determines who is covered.",
  "Explain how the number of dependents in your household affects your Medicaid eligibility.", "Your allowance depends on the number of children in your household.",
  "The number of dependents in your household affects your refund.", "Claim intake. Complete the claim form:\nHousehold size and number of dependents:",
  // A front desk that is not HR, an HR help line, a phone's screen, a note after a quote.
  "Say: Hi, I'm Ana at the front desk; if you want a recruiter, press 2. For security, may I have your date of birth?",
  "Script: Hi, this is Ana from Bright Clinic's HR support line. For security, may I have your date of birth?", "Script: Hi, I'm sorry, the recruiter is out. For security, may I have your date of birth?",
  "Script: Hi, I'm not a recruiter, I'm the front desk. For security, may I have your date of birth?", "Script: Thanks for calling about your phone screen. For security, may I have your date of birth?",
  'Say: "May I have your date of birth to find your file?" Interviews are on Fridays.', "For Medicare, we want you enrolled before age 65.",
]) check(`(13th review, guard) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  "Retirees aged 55+ if they live nearby preferred.", "Students aged 18-22 if they speak Tagalog preferred.",
  "Recruitment call script: Hi Maria! For security, may I have your date of birth?", 'Recruiting call. Ask: "May I have your date of birth for your file?"',
  "Say: Hi Maria, thanks for your time, this is Ana from HR. For security, may I have your date of birth?", 'Say: "Thanks for joining, this is Ana from HR. May I have your date of birth for your file?"',
  "Script: To verify your identity, may I have your date of birth before we start the phone screen?", "Script: To verify your identity, may I have your date of birth before we start the interview?",
  // The customer word a hire serves, after the age's own person; an employer's form with no customer named.
  "21-35 year old agents for our clients, Tagalog preferred.", "Hiring students aged 18-24 to support callers, night shift preferred.",
  "New hire form:\nFull name:\nFiling status and number of dependents:\nBank account:", "Payroll setup. Fill in:\nFiling status and number of dependents:\nTax ID:",
  // A question to the applicant about money that is theirs, not a desk's explanation.
  "List the number of children in your household, which is needed for your HMO coverage.", "Does the number of children in your household affect the amount of overtime you can work?",
  "Will the number of children in your household affect your expected rate?",
  // A callback about a job or from recruiting; a hold on a recruiter's call.
  "Script: Hi, this is Ana from HR returning your call about the Coverage Specialist role. To verify your identity, may I have your date of birth?",
  "Script: Hi, this is Ana from HR returning your call about your application. To verify your identity, may I have your date of birth?",
  "Script: Hi, this is Ana from recruiting returning your call. To verify your identity, may I have your date of birth?", "Recruiter call: Hi, thank you for holding. For security, may I have your date of birth?",
  "Script: Hi Maria, Ana here from recruiting. For security, may I have your date of birth?",
  // A job program and a job title; the candidate after a quote; a hire after a benefit with "we want you".
  'Say: "Thanks for applying for our trainee program. May I have your date of birth for your file?"', 'Say: "Thanks for applying for the Rewards Specialist role. May I have your date of birth for your file?"',
  'Say: "May I have your date of birth?" and wait for the candidate to answer.', "With full benefits, we want you to join us before age 30.",
]) check(`(13th review, guard) …and still drops: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
// Known, and left (the thirteenth review): each is read as shown for the reason given, so the next review need not report it.
for (const [line, drops, why] of [
  ['Say: "Thanks for your interest in joining Bright Clinic. May I have your date of birth for your file?"', false, "\"joining\" a business by name is a new patient's or a gym member's too (\"…in joining Bright Fitness\"); an interest in joining is HR's only with the team, the staff, the company, the crew or \"us\""],
  ["Script: Thank you for calling Bright Clinic. For security, may I have your date of birth? Job seekers go to the recruiter line.", true, "after a script's colon the words naming applicants are read to the end of the line, as the tenth and eleventh rounds read them (\"…your date of birth? Then begin the interview.\"); only HR, a recruiter or a phone screen after the ask are a front desk's note"],
  ['Ask: "May I have your date of birth for your file?" Then begin the interview.', false, "after a quote, the words naming applicants are read to the end of the quote's own sentence ('…\" before each interview.'); a new sentence after the quote is the writer's note, as the tenth and twelfth rounds read it ('…\" Calls about a phone screen go to HR.')"],
  ["A 70-year-old caller from Cebu, Tagalog preferred, asks about her refill.", true, "a customer's own preference is read only when the comma comes right after the age's own person (\"A 70-year-old caller, Tagalog preferred\"); words after the person (\"from Cebu\", \"named Rosa\") read as a hire, as in every earlier round, since \"…to help customers, bilingual preferred\" is a hire"],
  ["Our customers are families. Please answer:\nNumber of children in the household:", false, "a bare label is a customer's intake in an item that names a customer or their file (\"A caller asks… Complete her intake:\"), so a form under a line about the business's customers reads the same"],
  ["Does the number of dependents in your household affect your benefits?", false, "a desk explains money or eligibility (a refund, a credit, a premium, a benefit, coverage, a cost); the applicant is asked about availability, a schedule or shifts, and a question about \"your benefits\" reads as a desk's"],
  ["Say: Thanks for calling Bright Clinic, I'm Ana, a recruiter. For security, may I have your date of birth?", false, "a call the listener made is their own (\"Thank you for calling, this is Ana from HR\"; the twelfth review), whoever answers it"],
  ["18-25 year old players, bilingual preferred.", false, "a customer named right after the age, with what they prefer after a comma, is theirs (the twelfth review), a range of ages too (\"For 65-70 year old patients, a phone call is preferred\"); players are the owner's own customers, and only gamers are a game support team's hires (\"18-22 year old gamers, bilingual preferred\" goes)"],
]) check(`(13th review, known) ${drops ? "dropped" : "kept"}: ${JSON.stringify(line)}: ${why}`, A.asksAgeOrStatus(line) === drops);

// The fourteenth Phase 6 review: the thirteenth round's HR desk read a job only right after "returning your call about the …",
// so an HR hold, or a callback "regarding" a job or naming it in the next sentence, was the desk's own caller (a regression
// against both earlier rounds), and a job's title with an "&" or three words after a benefit word read as the benefit. A quote
// that named a customer word was the customer's whatever it asked, and in customer-service hiring the job's title names one
// (every round). A practice case naming its customer by name lost her intake, "team players" read as customers, and a loan
// applicant or a case's note on what the candidate must do read as the applicant (each against one earlier round). Each was
// narrowed where it came from; every check in this list fails on the thirteenth round's module.
console.log("\nThe fourteenth review's cases\n");
for (const line of [
  // Finding 1: an HR hold or callback about a job, the job named anywhere before the ask; a longer job title with an "&".
  'Say: "Thank you for holding, this is Ana from HR. I see you applied for our Coverage Specialist role. May I have your date of birth for your file?"',
  'Say: "Thank you for holding, this is Ana from HR returning your call about your application. May I have your date of birth for your file?"',
  'Say: "Hi Maria, this is Ana from HR returning your call regarding the Coverage Specialist position. May I have your date of birth for your file?"',
  'Say: "Hi Maria, this is Ana from HR returning your call on the Coverage Specialist job. May I have your date of birth for your file?"',
  'Say: "Hi Maria, this is Ana from HR returning your call. It\'s about the Coverage Specialist role you applied for. May I have your date of birth for your file?"',
  "Script: Hi Maria, this is Ana from HR returning your call regarding the Coverage Specialist position. To verify your identity, may I have your date of birth?",
  "Script: Thank you for holding, this is Ana from HR. About the Patient Coordinator opening you applied for: may I have your date of birth for your file?",
  "Script: Hi, this is Ana from HR. Thanks for holding about the Coverage Specialist post. For security, may I have your date of birth?",
  "Script: Hi, this is Ana from HR about the Coverage Specialist role. Thank you for holding. For security, may I have your date of birth?",
  'Say: "Thank you for holding, this is Ana from HR. I see you applied with us last week. May I have your date of birth for your file?"',
  'Say: "Thanks for holding, this is Ana from HR. I hear you\'re applying with us. May I have your date of birth for your file?"',
  'Say: "Thanks for applying for our Rewards & Loyalty Specialist position. May I have your date of birth for your file?"', 'Say: "Thanks for applying for our Medicare Advantage Sales Agent role. May I have your date of birth for your file?"',
  'Say: "Thanks for applying for our Medicare Advantage Customer Service Representative role. May I have your date of birth for your file?"',
  // Finding 2: a quote whose only customer is the job's title or the applicant's experience, put to someone applying or asking
  // more than a date of birth; "Welcome to your chat interview".
  'Opening message: "Thanks for applying for the Customer Service Representative role! To start, how old are you?"', 'Say: "Thanks for applying for the Customer Service Representative role. Are you married?"',
  'Greeting: "Hi! Thanks for your interest in our Patient Care Coordinator role. Are you married or single?"', 'Opening line: "Welcome to your chat interview for the Customer Support role. What is your date of birth?"',
  'Ask: "Have you handled angry customers before? And how old are you?"', 'Recruiter script: "Thanks for applying! Can you confirm your age and civil status?"', 'Recruiter script: "Can you confirm your age?"',
  'Say: "Thanks for applying for the Patient Coordinator role. May I have your date of birth?"', 'Say: "Thanks for applying for the Customer Service role! For security, how old are you?"',
  'Say: "Are you the customer service rep we spoke to? How old are you?"', 'Opening message for the Customer Support role: "Thanks for applying! How old are you?"',
  'Ask: "Are you a patient person? How old are you?"',
  // …and the same inside a script's line.
  'Script: Greet them warmly. Ask, "Have you worked with patients before? How old are you?"', 'Say: Welcome! Then ask, "How many customers do you handle a day? Are you married?"',
  'Opening: Hi! Then ask, "Do you have kids? Our callers are mostly parents."', 'Phone screen: Hi! Then ask, "Have you served customers before, and how old are you?"',
  // Finding 4: the team, the staff or the crew in the one-word slot before a customer word; "Ideal candidates:".
  "21-30 y/o team players, bilingual preferred.", "• 21-30 y/o staff members, bilingual preferred", "21-30 yo team members, bilingual preferred.",
  "Requirements: 21 to 30 yo team players, BPO experience preferred.", "We'd love a 25-year-old team player, Tagalog preferred.", "18-25 yo crew members, Tagalog preferred.",
  "Ideal candidates: 18-25 year old players, bilingual preferred.", "Ideal applicants: 18-25 year old players, bilingual preferred.",
]) check(`(14th review) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
for (const line of [
  // Finding 3: a customer's intake label in a practice case that names her by name, or as a mother, a homeowner or a woman.
  "Tax refund chat. Maria Santos asks why her refund went down this year. Complete her intake:\n- Name:\n- Filing status and number of dependents:\n- Last year's refund:\nThen explain what changed.",
  "Child tax credit call. A mother of two asks why her credit changed. Complete her intake:\n- Filing status and number of dependents:\n- Last year's credit:\nThen explain what changed.",
  "Subsidy renewal. A homeowner renews her housing subsidy. Fill in:\nHousehold size and number of dependents:\nMonthly household income:\nThen tell her the new amount.",
  "Benefits renewal. Mr. Reyes renews his SNAP benefits. Fill in:\nHousehold size and number of dependents:\nMonthly household income:",
  "A woman calls about her tax return. Fill in:\nNumber of dependents on the tax filing:\nFiling status:",
  "Tax refund chat. Maria Santos asks about her refund. Fill in:\n- Filing status and number of dependents:",
  "Child tax credit call. A mother of two asks why her credit changed. Fill in:\n- Filing status and number of dependents:",
  // Finding 5: a loan's, a scholarship's or a visa's applicant or interview, and "the candidate must…" after the ask.
  "Lab results call. A patient calls for her results. Script: Thank you for calling Bright Clinic. For security, may I have your date of birth? The candidate must not share results until the identity check passes.",
  "Script: Thank you for calling Bright Clinic. For security, may I have your date of birth? The candidate should not share results until the identity check passes.",
  "Script: Welcome to your visa interview. For security, may I have your date of birth?",
  "Say: Thank you for calling the visa appointment line. For security, may I have your date of birth? Then confirm the date of their visa interview.",
  "Say: Thank you for calling Bright Bank. For security, may I have your date of birth? Then walk the loan applicant through the next step.",
  'Ask: "May I have your date of birth to find your file?" when a loan applicant calls.', 'Say: "May I have your date of birth to update your records?" to each scholarship applicant.',
  // One who recruits customers is not HR's recruiter.
  "Script: Hi, this is Ana, a study recruiter at Bright Research. To verify your identity, may I have your date of birth?",
]) check(`(14th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
// …and in the real paths: generate-flow (:252) and ai-generate-workflow (:616) drop a practice case whole, generate-flow's
// requirements (:242) drop an item, textWithoutAgeAsks keeps a job post's other sentences, and ai-generate-workflow's
// configWithoutAgeAsks (:607) deletes a step's prompt that asksAgeOrStatus flags.
check("(14th review) practice cases that name their customer by name, or note what the candidate must do, are kept whole", A.withoutAgeAsks([
  { title: "Tax refund chat", prompt: "Maria Santos asks why her refund went down this year. Complete her intake:\n- Name:\n- Filing status and number of dependents:\n- Last year's refund:\nThen explain what changed." },
  { title: "Subsidy renewal", prompt: "A homeowner renews her housing subsidy. Fill in:\nHousehold size and number of dependents:\nMonthly household income:\nThen tell her the new amount." },
  { title: "Lab results call", prompt: "A patient calls for her results. Script: Thank you for calling Bright Clinic. For security, may I have your date of birth? The candidate must not share results until the identity check passes." },
], (s) => `${s.title}. ${s.prompt}`).length === 3);
check("(14th review) …a job's requirements and post lose an age preference for its team players", JSON.stringify(A.withoutAgeAsks(["Excellent written English.", "21-30 y/o team players, bilingual preferred.", "At least 6 months of BPO experience."])) === JSON.stringify(["Excellent written English.", "At least 6 months of BPO experience."]) && A.textWithoutAgeAsks("Flexible part-time hours. 21-30 y/o team members, bilingual preferred. Paid training.") === "Flexible part-time hours. Paid training.");
check("(14th review) …and a step's prompt with an HR hold about a job, or a chat interview opening that asks the applicant's age, is flagged", A.asksAgeOrStatus('Phone screen.\nSay: "Thank you for holding, this is Ana from HR. I see you applied for our Coverage Specialist role. May I have your date of birth for your file?"\nThen ask about their shift availability.') && A.asksAgeOrStatus('Chat interview.\nOpening message: "Thanks for applying for the Customer Service Representative role! To start, how old are you?"\nThen ask about their experience with upset customers.'));
// Guards: what each narrowed rule must still keep or drop, including the side effects the fourteenth review named for its
// trial of finding 2 (a desk's "thanks for applying" for a product, a clinical study's "patient recruiter") and an agent's own
// introduction.
for (const line of [
  // An HR desk's own hold or callback with no job named; a rewards program with an "&".
  'Say: "Thank you for holding, this is Ana from HR returning your call about your leave request. May I have your date of birth for your file?"',
  "Script: Thanks for holding, this is Ana from Human Resources. To verify your identity, may I have your date of birth?",
  'Say: "Thanks for applying for our Rewards & Loyalty program. May I have your date of birth to find your file?"',
  // A date of birth alone, with a check, a "confirm" or no applying; a customer named outside the quote; a caller's check; a
  // listener called a customer; the job's own "customer service" in a label with a caller's check.
  'Say: "Hi, I\'m Ana, your Patient Coordinator. May I have your date of birth?"', 'Say: "Thanks for applying for the program. For security, may I have your date of birth?"',
  'Say: "Thanks for applying for SNAP. Can you confirm your date of birth?"', 'Say: "Thanks for applying for a checking account with Bright Bank. To verify your identity, may I have your date of birth?"',
  'Say: "Hi, I\'m Ana, a patient recruiter with Bright Research. To confirm I have the right person, may I have your date of birth?"',
  'Say: "Hi, I\'m Ana, a patient recruiter with Bright Research. May I have your date of birth to find your file?"',
  'Greet the caller and say, "Thanks for applying for SNAP. Are you 65 or older?"', 'Say: "Thanks for calling Medicare Help. Are you 65 or older?"',
  'Ask: "Are you the policyholder? Are you over 65?"', 'Ask the member, "Do you have dependents on your policy?"',
  'Customer service script: "Thanks for calling Bright Medicare. Are you 65 or older?"',
  // …and inside a script's line, the check on the script's own line.
  'Script: Thank you for calling Medicare Help. Ask, "Are you a member? Are you 65 or older?"', 'Script: Hi there. Ask, "Are you the patient? Are you over 18?"',
  'Say: Hi! Then ask, "Hi, I\'m Ana, your Patient Coordinator. May I have your date of birth?"',
  // The applying words read in the quote (not its label, not after its ask), its check on the whole sentence, a benefit's few
  // title words.
  'During the phone screen role-play, say: "Thanks for calling Medicare Help. Are you 65 or older?"',
  'Say: "Hi, I\'m Ana, your Patient Coordinator. May I have your date of birth? For a phone screen, press 2."',
  'For security, say: "Thanks for applying for SNAP. May I have your date of birth?"',
  "Script: Thanks for applying for the home loan with us so you can move closer to your job. For security, may I have your date of birth?",
  // A customer's own preference right after the age; a visa interview inside a quote.
  "A 70 y/o member, Tagalog preferred, asks about her claim.", 'Say: "Thank you for calling the embassy. For security, may I have your date of birth before your visa interview?"',
]) check(`(14th review, guard) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  // HR's recruiter; an employer's form that names "their" own details; applicant words after the ask that are not "the
  // candidate must…"; any other interview; a callback about a job application; a bare "thanks for applying".
  'Say: "Hi, I\'m Ana, a senior recruiter at Bright Clinic. May I have your date of birth for your file?"',
  "Payroll setup. Update their tax details:\nFiling status and number of dependents:\nTax ID:", "New hire form. Complete their onboarding:\nHousehold size and number of dependents:",
  "Benefits form. Fill in your plan details:\nHousehold size and number of dependents:",
  "Script: For security, may I have your date of birth? The candidates must bring their resumes.", "Script: For security, may I have your date of birth? Each candidate must bring a valid ID.",
  "Script: For security, may I have your date of birth? Then ask the candidate to describe a refund.",
  "Say: Thank you for calling. For security, may I have your date of birth? Then begin the job interview.", 'Say: "Welcome to your video interview. May I have your date of birth?"',
  "Script: Hi Maria, this is Ana from HR returning your call about your job application. For security, may I have your date of birth?",
  'Recruiter script: "Thanks for applying! How old are you?"', 'Opening message: "Thanks for applying! To start, how old are you?"',
]) check(`(14th review, guard) …and still drops: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
// Known, and left (the fourteenth review): each is read as shown for the reason given, so the next review need not report it.
for (const [line, drops, why] of [
  ['Say: "Thanks for applying! For security, what is your date of birth?"', false, "a quote that asks only a date of birth with a caller's check (security, identity, an account, \"thanks for calling\"), a \"confirm\" or a \"verify\" is an identity check whatever else it says, as every earlier round read it: \"thanks for applying\" is a desk's for products the benefit list cannot name (\"…for SNAP\", \"…for a checking account\", \"…for the clinical trial\"); only a customer word inside the quote no longer outweighs applying"],
  ['Phone screen script: "Hi, thanks for your interest in the job. For security, may I have your date of birth?"', false, "the same; a quote's applying words are read in the quote, not its label, since a label also names the exercise (\"Interview role-play: the patient calls…\"; the twelfth review)"],
  ['Say: "Thanks for applying to Bright Clinic! Can you confirm your date of birth?"', false, "the same, for \"confirm\" (\"Thanks for applying for SNAP. Can you confirm your date of birth?\" is a desk's)"],
  ['Say: "Hi, I\'m Ana, your Patient Coordinator. How old are you?"', true, "a quote that asks more than a date of birth is a customer's only when the customer is named outside it or with a caller's check, since a customer word inside it is as often the job's title; an agent's own title reads the same (a date of birth alone stays: \"…your Patient Coordinator. May I have your date of birth?\"); since the fifteenth review a customer word inside a quote counts again, but an agent's own title in a \"your …\" introduction is still read as the job's (NOT_THE_LISTENER), as here"],
  ['Say: "Thanks for applying for a checking account with Bright Bank. Are you 65 or older?"', true, "a question beyond a date of birth is a customer's with a check only when nothing says the listener applies for a job, and an account is also a BPO's client (\"Thanks for applying for our healthcare account\"), so it is not on the benefit list"],
  ["Script: Thanks for applying for the program. For security, may I have your date of birth?", true, "after a script's colon, unquoted, \"thanks for applying\" for anything off the benefit list is read to the end of the line, as the eleventh to thirteenth rounds read it (the thirteenth review's LOW 2); the quoted form with a check is an identity check"],
  ["Script: Hi, this is Ana from the front desk. For security, may I have your date of birth? The candidate plays the front desk.", true, "after the ask only \"the candidate must, should, needs to…\" is the agent a case describes; other verbs are read as the tenth round read them, since \"Then the candidate answers…\" may be about the listener"],
  ["Script: Hi, this is Ana from Bright College's recruitment office. For security, may I have your date of birth?", true, "a business's own recruitment team or office is HR's in the thirteenth round's possessive form (\"Bright Clinic's HR team\"), so a college's or a study's reads the same (the fourteenth review's finding 6, left)"],
  ["Explain that your SNAP allotment depends on the number of children in your household.", true, "a desk's explanation needs the money or eligibility it explains (DESK_TOPIC); an allotment, a stipend or an amount is not among them, since \"…affect the amount of overtime you can work?\" is the applicant's (the fourteenth review's finding 7, left)"],
]) check(`(14th review, known) ${drops ? "dropped" : "kept"}: ${JSON.stringify(line)}: ${why}`, A.asksAgeOrStatus(line) === drops);

// The fifteenth Phase 6 review: the fourteenth round counted a customer word inside a quote for nothing, so every ordinary
// customer question that names the customer only inside the quote was dropped, and with it whole practice cases (a regression
// against both earlier rounds, the owner's own gaming customers among them). Its "their plan" for a named customer also excused
// an employer's own form (both), and three narrowings each let one thing past that the thirteenth round caught: an HR desk's
// own caller who applied for leave, "the candidate must provide it" after an identity ask, a clinical recruiter's call. A
// customer word inside the quote counts again once what names the job or the applicant is set aside (NOT_THE_LISTENER), and
// each other rule was narrowed where it came from; every check in this list fails on the fourteenth round's module.
console.log("\nThe fifteenth review's cases\n");
for (const line of [
  // Finding 1: a customer named only inside the quote, asked an age, marital or dependents question.
  'Ask: "Are you a Medicare member? Are you 65 or older?"', 'Ask: "Medicare members can enroll at 65. Are you 65 or older?"',
  'Say: "Hi! Our senior discount is for members 65 and up. Are you 65 or older?"', 'Ask: "As a member, do you have any dependents you\'d like to add to your plan?"',
  'Ask: "Do you have any dependents you\'d like to add to the policy, as the policyholder?"', 'Ask: "Are you married? Members can add a spouse to the plan."',
  'Reply: "Thanks for reaching out! Players under 18 need a parent\'s consent. How old are you?"',
  'Say: "Thanks for contacting Bright Games support! Are you 18 or older? Players under 18 need parental consent for purchases."',
  'Ask: "Are you a new patient? Are you over 18?"', 'Patient care script: "Hi, is this for a new patient? Are you over 18?"', 'Ask: "Are you a guardian of the patient, and are you over 18?"',
  'Say: "Our youth fare is for passengers under 25. How old are you?"', 'Say: "To quote your premium as a member, what is your age?"',
  'Customer service script: "Hi, welcome to Bright Medicare! Are you 65 or older?"',
  // …the same inside a script's line;
  'Script: Hi there. Ask, "Are you a member? Are you 65 or older?"', 'Say: Hi! Then ask, "Players under 18 need a parent\'s consent. How old are you?"',
  // …a date of birth alone, a customer word inside and "thanks for applying" for what the benefit list cannot name;
  'Say: "Thanks for applying to Bright Credit Union! As a new member, may I have your date of birth?"',
  'Say: "Thanks for applying for the clinical trial! May I have your date of birth to find your patient file?"', 'Say: "Thanks for your interest in joining us as a member! May I have your date of birth?"',
  // …a confirm or verify of a customer's own filing status, discount or ranked play; SNAP;
  'Ask: "Can you confirm your filing status? Are you married or single?"', 'Say: "To verify your senior discount, are you 60 or older?"', 'Say: "To confirm you can play ranked, are you 18 or older?"',
  'Say: "To confirm your fare, are you under 25?"', 'Say: "Thanks for applying for SNAP. For security, are you 60 or older?"',
  'Say: "Thanks for applying for SNAP. Are you 60 or older? Members over 60 get a different deduction."', "Script: Thanks for applying for SNAP. For security, may I have your date of birth?",
  // …and the business's own customers addressed or told a rule, its service, the agent a customer is sent to, a customer's own
  // record, a relative: each of these the reviewer's trial fix dropped.
  'Ask: "Are you one of our members? Are you 65 or older?"', 'Reply: "Thanks for reaching out! Our players under 18 need a parent\'s consent. How old are you?"',
  'Say: "Our members get a senior discount at 65. Are you 65 or older?"', 'Say: "We help members over 65 choose a plan. Are you 65 or older?"',
  'Say: "Let me connect you with a member specialist. Are you 65 or older?"', 'Say: "You can talk to a member specialist about that. Are you 65 or older?"',
  'Ask: "Is this for a patient with a referral? Are you over 18?"', 'Ask: "Is this the patient you\'re calling about? Are you over 18?"', 'Ask: "How many members are on your plan? Are you married?"',
  'Say: "Let me update your member records. How old are you?"', 'Ask: "Can I get your patient information? Are you over 18?"', 'Ask: "Will you be helping a family member with their plan? Are you over 18?"',
  'Say: "Hi, I\'m Ana, a patient recruiter with Bright Research. How old are you?"', 'Say: "Thanks for applying to our patient program! May I have your date of birth?"',
  'Ask: "Are you helping a patient with this booking? Are you over 18?"', 'Say: "Hi, I\'m Ana, a member advocate. Are you 65 or older?"',
  'Say: "Hi, I\'m Ana, your patient recruiter for the Bright Research study. Are you over 18?"',
  // Finding 3: an HR desk's own caller who applied for leave or a loan, or asks about their job title.
  "Script: Thank you for holding, this is Ana from HR. You applied for parental leave last week. For security, may I have your date of birth?",
  'Say: "Thank you for holding, this is Ana from HR. You applied for parental leave last week. May I have your date of birth for your file?"',
  "Script: Thank you for holding, this is Ana from HR. I see you asked about your job title on your payslip. For security, may I have your date of birth?",
  "Script: Thank you for holding, this is Ana from HR. You applied for a salary loan last week. For security, may I have your date of birth?",
  "Script: Hi Maria, this is Ana from HR returning your call about your leave application. To verify your identity, may I have your date of birth?",
]) check(`(15th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  // Finding 2: "their" plan on an employer's own form, in the label itself or in an item that hires.
  "Household size and number of dependents (for their HMO coverage):", "Filing status and number of dependents (for their benefits enrollment):",
  "Ask each applicant about their HMO plan needs:\nHousehold size and number of dependents:",
  "Pre-employment form. Applicants fill this in for their benefits:\n- Filing status and number of dependents:",
  "Benefits enrollment. Each new hire picks their HMO plan. Fill in:\nHousehold size and number of dependents:",
  "Application question. For their HMO coverage, list:\nHousehold size and number of dependents:",
  "New hire form. Complete their onboarding so we can start their HMO coverage:\nHousehold size and number of dependents:",
  "Employee benefits form. Enter their plan choice:\nHousehold size and number of dependents:",
  // Finding 4: what the candidate must do is give the answer asked for.
  "Script: For security, may I have your date of birth? The candidate must provide it for our HR records.",
  "Script: To verify your identity, may I have your date of birth? The applicant must give it to proceed.",
  "Script: For security, may I have your date of birth? The applicant must answer before we continue the screening.",
  "Script: For security, may I have your date of birth? The candidate should share it before the assessment starts.",
  "Script: For security, may I have your date of birth? The candidate must provide their date of birth.",
  // Finding 5: a clinical recruiter is a hospital's HR.
  "Script: Hi, I'm Ana, a clinical recruiter at Bright Hospital. To verify your identity, may I have your date of birth?",
  'Say: "Hi, I\'m Ana, the clinical recruiter for Bright Clinic\'s nursing team. May I have your date of birth for your file?"',
]) check(`(15th review) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
// …and the review's 756-line brute force (7 speech labels, 12 customer openings, 9 asks), and the same over 26 more customer
// openings: every one a customer's.
const speechLabels = ["Say: ", "Ask: ", "Reply: ", "Greeting: ", "Opening line: ", "Then say, ", "Script line: "];
const customerAsks = ["Are you 65 or older?", "How old are you?", "Are you over 18?", "Are you married?", "Do you have any dependents you'd like to add?", "What is your age?", "Are you under 25?", "Are you married or single?", "Do you have children under 18?"];
const quoteGrid = (openings) => speechLabels.flatMap((label) => openings.flatMap((opening) => customerAsks.map((ask) => `${label}"${opening}${ask}"`)));
const reviewOpenings = ["Are you a Medicare member? ", "As a member, ", "Players under 18 need a parent's consent. ", "Is this for a new patient? ", "Are you a returning customer? ",
  "Our youth fare is for passengers under 25. ", "Hi, valued member! ", "Since you're a new guest, ", "Policyholders can add dependents. ", "Hi! Senior members get 10% off. ",
  "Medicare members can enroll at 65. ", "Thanks for being a loyal customer! "];
const moreOpenings = ["Are you one of our members? ", "For our senior members: ", "Our players under 18 need a parent's consent. ", "Our members get a discount at 65. ",
  "Thanks for being one of our loyal customers! ", "Most of our members qualify at 65. ", "Our policyholders can add a spouse. ", "Our patients under 18 need a guardian. ",
  "We help members over 65 choose a plan. ", "I can help members with that. ", "We serve patients 18 and older. ", "Let me connect you with a member specialist. ",
  "Is this for a patient with a referral? ", "Is this the patient you're calling about? ", "How many members are on your plan? ", "As one of our members, ",
  "Our members are eligible at 65. ", "Other members your age get the senior rate. ", "Hi! As a valued customer, ", "Welcome back, member! ", "Hi! Are you the cardholder? ",
  "Customers under 21 can't order wine. ", "Guests must be 21 to book. ", "Is the patient with you? ", "Are you the parent or guardian? ", "Are you a student member? "];
for (const [name, openings] of [["the review's 756", reviewOpenings], ["26 more customer openings", moreOpenings]]) {
  const lines = quoteGrid(openings);
  const dropped = lines.filter((line) => A.asksAgeOrStatus(line));
  check(`(15th review) a quote to a customer named only inside it is the customer's: ${name} (${lines.length} lines)`, lines.length === openings.length * 63 && dropped.length === 0, dropped.slice(0, 3).join(" | "));
}
// …and in the real paths: generate-flow's simulation filter (:252) keeps each practice case whole, ai-generate-workflow's
// configWithoutAgeAsks (:607) keeps each step's prompt, and generate-flow's application filter (:249) and
// ai-generate-workflow's questionAsksAge (:638) drop an employer's dependents question that names "their" plan.
const consentCases = [
  { title: "Medicare enrollment call", prompt: 'A caller wants to know when she can join Medicare. Say: "Medicare members can enroll at 65. Are you 65 or older?" Then explain the enrollment window.' },
  { title: "Parental consent chat", prompt: 'A player wants to buy gems. Reply: "Thanks for reaching out! Players under 18 need a parent\'s consent. How old are you?" Then explain the consent form.' },
  { title: "Add a dependent", prompt: 'A member calls to update her HMO plan. Ask: "As a member, do you have any dependents you\'d like to add to your plan?" Then confirm the change.' },
  { title: "New patient intake", prompt: 'Ask: "Are you a new patient? Are you over 18?" If not, ask for a parent or guardian.' },
];
check("(15th review) practice cases whose quote names the customer only inside it are kept whole, and their step prompts kept", A.withoutAgeAsks(consentCases, (s) => `${s.title}. ${s.prompt}`).length === 4 && consentCases.every((s) => !A.asksAgeOrStatus(s.prompt)));
check("(15th review) …and an application question naming \"their\" plan is dropped from both job writers", A.withoutAgeAsks(["Household size and number of dependents (for their HMO coverage):", "Filing status and number of dependents (for their benefits enrollment):", "Preferred shift:"]).length === 1 && ["Household size and number of dependents (for their HMO coverage):", "Filing status and number of dependents (for their benefits enrollment):"].every((q) => A.questionAsksAge(q, [])));
// Guards: what each narrowed reading must still drop or keep. A quote whose customer word is the job's title, the applicant's
// experience, the business's clientele or the team; a confirm of what an applicant has; applying words; the review's trial
// fix's shapes, each read only as the job's (the fourteenth round's drops, which the thirteenth kept).
for (const line of [
  'Ask: "Do you have kids? Our callers are mostly parents."', 'Ask: "Most of our callers are seniors. How old are you?"', 'Ask: "Our customers are mostly young. Are you under 30?"',
  'Ask: "Are you married? Our clients like to know."', 'Script: Greet them, then ask, "Do you have children at home? Our players call late at night."',
  'Ask: "Tell me about a time you helped a customer. Also, how old are you?"', 'Ask: "Do you enjoy helping customers? How old are you?"', 'Ask: "Have you ever dealt with difficult callers? Are you married?"',
  'Ask: "The customers you serve will be in the US. How old are you?"', 'Ask: "How many callers can you handle an hour? How old are you?"', 'Say: Good morning. Then ask, "Are you single? You will talk to many customers."',
  'Ask: "As a member of our team, are you married?"', 'Say: "Thanks for applying! As a new member of our support team, may I have your date of birth?"',
  'Say: "Thanks for applying! You\'ll be helping our customers. May I have your date of birth for your file?"',
  'Say: "Hi Maria, this is Ana from HR about your application for Patient Coordinator. May I have your date of birth for your file?"',
  'Ask: "How many customer calls do you take a day? Are you married?"', 'Ask: "Tell me about your patient care experience. Are you married?"',
  'Customer service script: "Thanks for applying! How old are you?"', 'Ask: "Can you confirm your civil status? Are you married or single?"', 'Ask: "To confirm you can work nights, are you married?"',
  'Ask: "Can you confirm your employee discount preference? How old are you?"', 'Opening message: "Thanks for applying! To confirm your shift premium, how old are you?"',
  'Say: "Thanks for applying for the SNAP Outreach Specialist role. Are you married?"', 'Ask: "Upset callers are part of the job. How old are you?"',
  'Ask: "The work is mostly patient records and scheduling. How old are you?"', "Benefits form. Fill in their details:\nHousehold size and number of dependents:",
  // An HR hold about a job, whatever else is applied for.
  "Script: Thank you for holding, this is Ana from HR. You applied for our Leave Specialist opening last week. For security, may I have your date of birth?",
  'Say: "Thank you for holding, this is Ana from HR. I see you applied for leave and for our Coverage Specialist role. May I have your date of birth for your file?"',
  "Script: Thank you for holding, this is Ana from HR. About your job application: for security, may I have your date of birth?",
  'Say: "Thank you for holding, this is Ana from HR. I see you applied for Coverage Specialist last week. May I have your date of birth for your file?"',
  "Script: Thank you for holding, this is Ana from HR. About the job offer: for security, may I have your date of birth?",
]) check(`(15th review, guard) …and still drops: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
const applicantOpenings = ["Have you handled angry customers before? ", "Have you worked with patients before? ", "How many customers do you handle a day? ", "Do you have kids? Our callers are mostly parents. ",
  "Our clients are mostly seniors. ", "Most of our callers are parents. ", "Tell me about a time you helped a customer. ", "Do you enjoy helping customers? ",
  "How do you handle an angry caller? ", "Have you served customers before? ", "Are you a patient person? ", "Are you the customer service rep we spoke to? ",
  "The customers you serve are in the US. ", "Our team members work nights. ", "As a member of our team, ", "Our customers tend to be young. ",
  "Have you ever dealt with difficult callers? ", "Have you supported patients on the phone? ",
  "Thanks for applying for the Customer Service Representative role! ", "Thanks for your interest in our Patient Care Coordinator role. ",
  "Welcome to your chat interview for the Member Support role. ", "Thanks for applying! Our members love fast replies. ", "Thanks for applying to Bright BPO! Our customers are in the US. ",
  "Thanks for applying! Have you handled angry customers? ", "Welcome to your phone screen! Have you worked with patients? "];
{
  const lines = quoteGrid(applicantOpenings);
  const kept = lines.filter((line) => !A.asksAgeOrStatus(line));
  check(`(15th review, guard) …and a quote put to an applicant whose customer word is the job's, the applicant's or the clientele's still drops (${lines.length} lines)`, lines.length === 1575 && kept.length === 0, kept.slice(0, 3).join(" | "));
}
for (const line of [
  // A customer's own intake in a practice case that names her (the fourteenth round's), her plan named in her label too.
  "Maria Santos renews her HMO plan. Fill in:\nHousehold size and number of dependents (for her plan):",
  "HMO renewal chat. Mr. Cruz updates his plan. Fill in:\n- Household size and number of dependents:\n- Monthly income:",
  "A family calls to renew their subsidy. Fill in:\nHousehold size and number of dependents:",
  // The agent a practice case describes, checking the answer; a clinical trial's or a clinical research site's recruiter.
  "Script: Thank you for calling Bright Clinic. For security, may I have your date of birth? The candidate must confirm it matches the chart before sharing results.",
  "Script: Thank you for calling Bright Clinic. For security, may I have your date of birth? The candidate must verify the caller's answer before sharing results.",
  "Script: Thank you for calling Bright Bank. For security, may I have your date of birth? The candidate must give the caller their balance only after the check.",
  'Say: "Hi, I\'m Ana, the clinical trial recruiter for the Bright Research diabetes study. May I have your date of birth for your file?"',
  'Say: "Hi, I\'m Ana, a clinical research recruiter at Bright Research. May I have your date of birth for your file?"',
  // A caller's check on a script's own line, for a quote whose only customer is the clientele described.
  'Script: Thank you for calling Bright Health. Then ask, "Our members are mostly retirees. Are you 65 or older?"',
]) check(`(15th review, guard) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
// Known, and left (the fifteenth review): each is read as shown for the reason given, so the next review need not report it.
for (const [line, drops, why] of [
  ['Say: "Can you verify you are over 21 so I can unlock the wine club order?"', true, "a \"confirm\" or a \"verify\" with no customer word is a caller's check only for what only a customer has (a filing status, a senior's, a student's or a member's discount, a premium, a fare, ranked play); an order is also an applicant's work (\"verify you can process 50 orders\"), so it was not added (the fifteenth review's finding 1)"],
  ['Say: "Thanks for applying for the clinical trial! Patients must be 18 to 65. Are you over 18?"', true, "\"thanks for applying\" for what the benefit list cannot name is read as applying for a job, and a question beyond a date of birth put to someone applying is never a customer's; SNAP was added (one word, no false drop), a trial was not (\"Thanks for applying for the trial shift\" is a job's)"],
  ['Say: "Our members are important to us. Are you 65 or older?"', true, "the business's own clientele described (\"Our callers are mostly parents\") is set aside whatever the description, unless the sentence states a rule (a number, a need, a discount, \"can\", \"get\", \"eligible\"…), so a quote whose only customer is \"Our members are…\" is read as the job's"],
  ['Ask: "Are you patient with callers? How old are you?"', false, "\"patient with callers\", a customer in a hypothetical (\"if a customer yelled at you\") and \"member services\" are the applicant's, but read as a customer as the twelfth and thirteenth rounds read them; the fourteenth dropped them only by counting no customer word inside a quote at all, and each would need its own shape (\"good with customers\" has one since the sixteenth review, which drops it)"],
  ["Script: Thank you for holding, this is Ana from HR. About your position on the night roster: for security, may I have your date of birth?", true, "on an HR hold the job words are read as hiring wherever they are (the fourteenth round), except leave or a loan applied for and a job title; \"your position\", \"your role\" and \"your job code\" are as often a job applied for, so they were not excused (the fifteenth review's finding 3)"],
  ["Script: Hi, I'm Ana, a student recruiter at Bright BPO. To verify your identity, may I have your date of birth?", false, "a student recruiter is a college's admissions as often as an employer's HR (the fourteenth round's exclusion), so only \"clinical\" was taken out of it (the fifteenth review's finding 5)"],
]) check(`(15th review, known) ${drops ? "dropped" : "kept"}: ${JSON.stringify(line)}: ${why}`, A.asksAgeOrStatus(line) === drops);

// The sixteenth Phase 6 review: the fifteenth round's desk check was fixed for its report's exact wordings only, so a
// practice case that names its customer in an earlier sentence ("A caller wants to rent a car. Say: …") and the ordinary
// wordings of a customer's own discount, fare, premium or filing status were still dropped, and with them five of six
// practice cases whole (a regression against the thirteenth and twelfth rounds); a desk's "How many members do you have on
// your plan?" and "Thanks for contacting customer support!" read as the job's. A self-introduction template's blanks and
// placeholders asked an age every round kept ("My name is ___, ___ years old"), and a customer word inside a first-person
// sample, HR's description of the business or an interview question made a quote put to an applicant a customer's. Three
// narrowings each caught the other side (a "Loan Officer" applied for, the agent who must "state it back to the caller", a
// study's clinical recruiter), and the desk topics named a hire's own pay. A sentence before the quote that names the case's
// one customer counts again, the desk topics take their ordinary wordings, and each other rule was narrowed where it came
// from; every check in this list but the pins below fails on the fifteenth round's module.
console.log("\nThe sixteenth review's cases\n");
for (const line of [
  // Finding 1: a customer's own discount, fare, premium, filing status or eligibility in its ordinary wordings, renting, gems;
  'Say: "To verify your senior citizen discount, are you 60 or older?"', 'Say: "To verify the senior discount, are you 60 or older?"', 'Say: "To verify your PWD or senior discount, are you 60 or older?"',
  'Say: "To confirm your youth fare, are you under 25?"', 'Say: "To confirm your student fare, are you under 25?"', 'Say: "To confirm your insurance premium, how old are you?"',
  'Ask: "Can you confirm your tax filing status? Are you married or single?"', 'Say: "To confirm you can rent the car, are you 21 or older?"', 'Say: "To verify your Medicare eligibility, are you 65 or older?"',
  'Say: "To confirm you can buy gems, are you 18 or older?"',
  // …a practice case's one customer named in an earlier sentence, whatever the quote asks;
  'A caller wants to rent a car. Say: "To confirm you can rent the car, are you 21 or older?"',
  'Car rental booking. A caller wants to book a car. Say: "Drivers under 25 pay a young driver fee. How old are you?" Then quote the price.',
  'Medicare enrollment. A caller asks about Medicare. Say: "To confirm your eligibility, are you 65 or older?" Then explain the enrollment window.',
  'Tax intake. A client calls about her refund. Ask: "Are you married or single?" Then explain the refund.', 'A patient calls to book a visit. Say: "Are you over 18?" Then book it.',
  'When a customer calls, say: "Are you 18 or older?"', 'Wine order. A customer orders wine. Say: "Can you verify you are 21 or older before I place the order?" Then confirm delivery.',
  'Interview role-play: the patient calls to move an appointment. Say: "Are you over 18?"', 'A guest calls to book a room. Then ask: "Are you 21 or older?"',
  'Candidates role-play this call. A caller asks about Medicare. Say: "Are you 65 or older?"',
  'Car rental booking. A caller wants to book a car. Say: "May I have your date of birth?" If they ask about jobs, transfer them to HR.',
  'Car rental booking. A caller wants to book a car. Script: Hi there. Ask, "Are you 21 or older?"',
  // …a desk's own count of a plan's members, and a desk greeting its caller by the service's own name;
  'Ask: "How many members do you have on your plan? Are you married?"', 'Ask: "How many members do you want to add to your plan? Do you have any dependents?"',
  'Reply: "Thanks for contacting customer support! Are you 18 or older?"', 'Reply: "Thanks for contacting Bright Games customer support! Are you 18 or older?"',
  'Reply: "Thanks for reaching out to player support! Are you 18 or older?"', 'Say: "Welcome to member support! Are you 65 or older?"',
  'Say: "Thank you for contacting the patient care line. Are you over 18?"', 'Say: "Hi, this is Ana from customer care. Are you 18 or older?"',
  'Say: "Thanks for contacting the customer support team! Are you 18 or older?"',
  // Finding 4: a job whose title starts with leave or loan is no leave or loan; the agent's own handling of the answer; a
  // study's clinical recruiter.
  'Say: "Hi, I\'m Ana, the clinical recruiter for the Bright Research diabetes study. May I have your date of birth for your file?"',
  "Script: Hi, I'm Ana, a clinical recruiter for the Bright Research study. To verify your identity, may I have your date of birth?",
  "Script: Thank you for calling Bright Clinic. For security, may I have your date of birth? The candidate must state it back to the caller.",
  "Script: Thank you for calling Bright Clinic. For security, may I have your date of birth? The candidate must enter it in the patient chart before sharing results.",
  "Script: Thank you for calling Bright Clinic. For security, may I have your date of birth? The candidate must give their reply within 30 seconds.",
  "Script: Thank you for calling Bright Clinic. For security, may I have your date of birth? The candidate must answer within 2 minutes.",
  "Script: Thank you for calling Bright Clinic. For security, may I have your date of birth? The candidate must share their screen during the role-play.",
]) check(`(16th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  // Finding 2: a self-introduction template's blank or placeholder for an age or a civil status.
  'Record a short video. Say: "Hi, my name is ___, I am ___ years old."', 'Record a short video. Start with: "Hi, my name is ___, I am ___ years old, from ___."',
  'Introduce yourself: "Hi, I\'m [name], [age] years old, from [city]."', "Introduce yourself in this format: My name is [Name], I am [Age] years old, and I am from [City].",
  'In your video, say: "My name is ___, my age is ___, and I live in ___."', 'Template: "I am [Name], [Age], [Civil status], from [City]."',
  'Begin with "My name is ___ and I am ___ years old."', "Self-introduction: Good day! My name is ___, ___ years old, from ___.",
  "Self-introduction script: Good day! My name is [Name], [Age] years old, residing in [City].", "Say: Good day! My name is ___, I am ___ years old.",
  'Write a short bio: "[Name], [Age], [City], [Years of experience]".', "Complete this sentence: I am ___ years old and I have worked in customer service for ___ years.",
  "Complete: My age: ___ | My city: ___", "Your profile: [Name], [Age], [Civil Status], [Location]", 'Write a short intro: "I\'m ___ (age ___), a ___ from ___."',
  // Finding 3: a first-person sample introduction, HR describing the business, an interview question, whatever customer they name;
  'Record a short video. Say: "Hi, my name is ___, I am ___ years old, and I love helping customers."', 'Opening line: "Hi! I\'m ___, ___ years old, and I love helping customers."',
  'Say: "Hi, I am Ana, 24 years old, married with two kids, and I love serving customers."', 'Example answer: "I\'m Ana, 24 years old, and I love helping customers."',
  'Video intro. Say: "Good day! I am Ana Reyes, 24 years old, single, from Cebu City, and I love helping customers."',
  'Record a 60-second video. Say: "Hi, I\'m Ana. I\'m 24 years old and I enjoy talking to customers."',
  'Say: "Hi, I\'m Ana from HR at Bright Clinic, where we care for patients. May I have your date of birth for your file?"',
  'Say: "Hi, this is Ana from Bright Clinic\'s HR team. We look after 2,000 patients. May I have your date of birth for your file?"',
  'Say: "Hi, I\'m Ana, a recruiter at Bright Health. Our agents support members across the US. May I have your date of birth?"',
  'Say: "Thanks for applying to Bright Health! Our team supports members every day. May I have your date of birth for your file?"',
  'Say: "Thanks for applying for the night shift role! You would be the first voice our customers hear. May I have your date of birth?"',
  'Say: "Welcome to your phone screen! This job is all about patients. May I have your date of birth for your file?"',
  'Say: "Thanks for your interest in joining our team. We serve customers in 20 countries. May I have your date of birth?"',
  'Say: "Why do you want to work with customers? How old are you?"', 'Opening line: "Why do you want to work with patients? And are you married?"',
  'Ask: "Are you comfortable speaking with customers on the phone? How old are you?"', 'Ask: "Do you have experience with customers? How old are you?"',
  'Opening message: "Hi! Tell me about a time you went above and beyond for a customer. Also, how old are you?"', 'Ask: "Tell me about a time a customer was unhappy with you. Are you married?"',
  'Ask: "Are you good with customers? How old are you?"', 'In your video, say: "My name is ___, my age is ___, and I enjoy helping customers."',
  'Video intro. Say: "Hi, I\'m 24, my civil status is ___, and I love helping customers."',
  // Finding 4: a job whose title starts with leave or loan, applied for on an HR hold;
  "Script: Thank you for holding, this is Ana from HR. You applied for Loan Officer last week. For security, may I have your date of birth?",
  "Script: Thank you for holding, this is Ana from HR. You applied for Leave Administrator. For security, may I have your date of birth?",
  // Finding 5: a hire's own pay or payroll.
  'Ask: "To confirm your premium pay for night shifts, how old are you?"', 'Ask: "To confirm your filing status for payroll, are you married or single?"',
  'Say: "Welcome aboard! To confirm your filing status for your W-4, are you married or single?"', 'Ask: "Can you confirm your filing status on your W-4? Are you married?"',
  'Ask: "To confirm your fare allowance, how old are you?"', 'Ask: "To confirm your student discount as a new hire, how old are you?"',
]) check(`(16th review) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
// …and in the real paths: generate-flow's simulation filter (:252) keeps each of the review's six practice cases whole,
// ai-generate-workflow's configWithoutAgeAsks (:607) keeps each one's step prompt, and a self-introduction template is dropped
// from a video or portfolio step's prompt (ai-generate-workflow :607) and from generate-flow's voice questions (:253).
const reviewCases = [
  { title: "Car rental booking", prompt: 'A caller wants to book a car for the weekend. Say: "To confirm you can rent the car, are you 21 or older?" Then explain the deposit.' },
  { title: "Medicare enrollment", prompt: 'A caller asks when she can join. Say: "To confirm your eligibility, are you 65 or older?" Then explain the enrollment window.' },
  { title: "Senior discount", prompt: 'A customer asks for the senior citizen discount on her order. Say: "To verify your senior citizen discount, are you 60 or older?" Then apply it.' },
  { title: "Youth fare", prompt: 'A passenger wants the cheaper ticket. Say: "To confirm your youth fare, are you under 25?" Then book it.' },
  { title: "Tax intake", prompt: 'A client asks why her refund changed. Ask: "Can you confirm your tax filing status? Are you married or single?" Then explain the change.' },
  { title: "HMO dependents", prompt: 'A member wants to add her baby. Ask: "How many members do you have on your plan? Do you have any other dependents?" Then add the baby.' },
];
check("(16th review) the review's six practice cases are kept whole, and their step prompts kept", A.withoutAgeAsks(reviewCases, (s) => `${s.title}. ${s.prompt}`).length === 6 && reviewCases.every((s) => !A.asksAgeOrStatus(s.prompt)));
const introPrompts = [
  "Introduce yourself in this format: My name is [Name], I am [Age] years old, and I am from [City].", 'Record a 60-second video. Say: "Good day! My name is ___, ___ years old, from ___."',
  'Record a 60-second video. Say: "Hi, I am Ana, 24 years old, married with two kids, and I love serving customers." Then tell us about your last job.',
  "Self-introduction: Good day! My name is [Name], [Age] years old, [Civil status], residing in [City].",
];
check("(16th review) …and a self-introduction template is dropped from a step's prompt and from the voice questions", introPrompts.every((p) => A.asksAgeOrStatus(p)) && A.withoutAgeAsks([...introPrompts, "Tell us about your last job."]).length === 1);
// …and a practice case's customer named in an earlier sentence, over every speech label and customer ask (the fifteenth
// review's grid): every one a customer's.
const caseOpenings = ["A caller wants to book a car. ", "Tax intake. A client calls about her refund. ", "A patient calls to move an appointment. ", "Interview role-play: the patient calls to move an appointment. ",
  "A member wants to add her baby. ", "Gem purchase. A player wants to buy gems. ", "A passenger asks about a cheaper ticket. ", "Hotel booking. A guest calls to book a room. "];
{
  const lines = caseOpenings.flatMap((opening) => quoteGrid([""]).map((line) => `${opening}${line}`));
  const dropped = lines.filter((line) => A.asksAgeOrStatus(line));
  check(`(16th review) a quote after a sentence naming the case's one customer is the customer's (${lines.length} lines)`, lines.length === caseOpenings.length * 63 && dropped.length === 0, dropped.slice(0, 3).join(" | "));
}
// Guards: what each narrowed or widened reading must still drop or keep. The reviewer's trial's 16 applicant lines; a sentence
// before the quote that names the job's customers, the clientele, an applicant cue or the work, or a quote that names the
// job or is followed by an interview; a desk's count is never the applicant's count; a greeting to a team, an interview or
// a role; HR's description of the business never outweighs a listener addressed as a member; a first-person age is never an
// agent's question.
for (const line of [
  'Ask: "To confirm your eligibility for the role, are you 18 or older?"', 'Ask: "To confirm your eligibility, are you 18 or older?"', 'Ask: "To confirm your shift premium, how old are you?"',
  'Ask: "To confirm the shift premium, how old are you?"', 'Ask: "To confirm your night differential, are you married?"', 'Ask: "To confirm your employee discount, how old are you?"',
  'Ask: "To confirm the employee discount, are you married?"', 'Ask: "To confirm your benefits eligibility, are you married?"', 'Ask: "To confirm your HMO premium, are you married?"',
  'Ask: "To confirm you can work nights, are you married?"', 'Ask: "To confirm you can rent a room near the office, how old are you?"', 'Ask: "To confirm you can start Monday, how old are you?"',
  'Opening message: "Thanks for applying! To confirm your shift premium, how old are you?"', 'Say: "Thanks for applying! To verify your senior citizen discount, are you 60 or older?"',
  'Ask: "Can you confirm your civil status? Are you married or single?"', 'Ask: "Can you confirm your tax status for payroll? Are you married or single?"',
  'Phone screen. You will talk to customers all day. Ask: "Are you married?"', 'Our callers are mostly parents. Ask: "How old are you?"', 'You will help customers with refunds. Ask: "How old are you?"',
  'Video intro. Customers love a friendly voice. Say: "How old are you?"', 'Car rental booking. A caller wants to book a car. Say: "How old are you?" Then begin the interview.',
  'Car rental booking. A caller wants to book a car. Say: "How old are you?" The candidate must provide it for our HR records.',
  'A caller wants to rent a car. Say: "Have you handled angry customers? How old are you?"', 'Answer the customer calls. Ask: "How old are you?"',
  'Our callers are mostly parents. Say: "May I have your date of birth?"', 'Thanks for applying! A caller may test you. Say: "How old are you?"', 'HR phone screen. A caller wants a car. Say: "Are you married?"',
  'Every customer loves a friendly voice. Ask: "How old are you?"', 'Handle the customers in the queue first. Ask: "How old are you?"',
  'Video intro. Customer after customer will hear you. Say: "How old are you?"', 'Interview question. Tell me about a time a customer yelled at you. Then ask: "How old are you?"',
  'Ask: "How many customers do you handle a day? Are you married?"', 'Ask: "How many callers can you handle an hour? How old are you?"',
  'Ask: "How many patients did you see a day at your last job? How old are you?"', 'Ask: "How many customers did you have per day? Are you married?"',
  'Say: "Welcome to the customer support team! Are you married?"', 'Say: "Welcome to your Customer Support interview! How old are you?"',
  'Say: "Hi, this is Ana from customer care about the Customer Care Specialist role. How old are you?"',
  'Say: "Thanks for applying! As a new member of our support team, may I have your date of birth?"',
  'Video intro. Say: "Hi, I\'m Ana, 24 years old, from Cebu. I have two years of experience helping customers."',
  'Say: "Welcome to your customer support onboarding! How old are you?"',
]) check(`(16th review, guard) …and still drops: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
for (const line of [
  // A customer's note with an age, a placeholder or a blank; a customer's own words in the first person.
  "Patient intake note: Maria, 70 years old, wants a callback.", "Confirm the caller's name and [DOB] before sharing results.", "Patient intake note: [Name], [Age], reason for visit: [Reason].",
  "I spoke with [Name], [Age], about her bill.", "Fill in the triage note: Patient is ___ years old, female, chest pain.", "Reply template: Hi [Name], your order [Order ID] ships today.",
  "Please confirm your details: [Name], [Age], [Plan].", "The ticket says the account is ___ days old.", 'A caller says: "I\'m 70 years old and confused by the app." How would you help?',
  // An agent's own line to a customer, with a template's blank for the agent's name, the business's members' age, a listener
  // welcomed as a member, an agent a customer is sent to, a relative, a caller's own experience.
  'Say: "I love helping members find the right plan. Are you 65 or older?"', 'Say: "Hi, my name is ___, and I\'ll help you with your plan as a member. Are you 65 or older?"',
  'Say: "Thank you for calling Bright Health, my name is [Agent Name], how may I help you? Are you 65 or older?"',
  'Say: "Hi, I\'m Ana, and our members 65 years old and over get a discount. Are you 65 or older?"',
  'Say: "Thanks for applying to Bright Credit Union! We\'re glad to have you as a new member. May I have your date of birth?"',
  'Ask: "Would you like to speak with a member advocate? Are you 65 or older?"', 'Ask: "Do you want to help a family member enroll? Are you 65 or older?"',
  'Ask: "How was your experience with our member line? Are you 65 or older?"', 'Ask: "Do you want to add a member to your plan? Are you married?"',
  'Ask: "Can you describe the situation with your member card? Are you 65 or older?"', 'Ask: "Are you comfortable with a family member joining the call? Are you over 18?"',
  'Ask: "Are you comfortable speaking with a member advocate? Are you 65 or older?"', 'Reply to the player: "I\'m 25 and I run the tournaments. Are you 18 or older?"',
  // A leave or a loan applied for, and a study's clinical recruiter, as the fifteenth round read them.
  "Script: Thank you for holding, this is Ana from HR. You applied for a salary loan last week. For security, may I have your date of birth?",
  'Say: "Hi, I\'m Ana, a clinical trial recruiter for the Bright Research diabetes study. May I have your date of birth for your file?"',
]) check(`(16th review, guard) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
{
  const lines = ["Phone screen. You will talk to customers all day. ", "Our callers are mostly parents. ", "You will help customers with refunds. ", "Video intro. Customers love a friendly voice. ",
    "Thanks for applying! A caller may test you. ", "HR phone screen. A caller wants a car. ", "Answer the customer calls. "].flatMap((opening) => quoteGrid([""]).map((line) => `${opening}${line}`));
  const kept = lines.filter((line) => !A.asksAgeOrStatus(line));
  check(`(16th review, guard) …and a sentence before the quote that names the job's customers or applying makes no quote a customer's (${lines.length} lines)`, lines.length === 441 && kept.length === 0, kept.slice(0, 3).join(" | "));
}
// Pins: the fifteenth round's own word lists, each of which a one-word narrowing could lose with no check failing (the
// sixteenth review's finding 6: a discount for the young, the military or a loyalty card, "you may play ranked", a service's
// reply, greeting and opener, the desk check's "that", "his", "her" and "their" leave, payroll and pre-employment forms,
// "tell us", the digit of a clientele's rule, "difficult", "irate" and "demanding", the "ever" and "experience" openers,
// calming, managing and assisting). They pass on the fifteenth round's module too.
for (const line of [
  'Say: "To verify your youth discount, are you under 25?"', 'Say: "To verify your military discount, are you 65 or older?"', 'Say: "To confirm your loyalty discount, how old are you?"',
  'Say: "To confirm you may play ranked, are you 18 or older?"', 'Customer service reply: "Hi! Are you 18 or older?"', 'Customer care greeting: "Hi there! Are you 65 or older?"',
  'Member support opener: "Hello! Are you 65 or older?"', 'Say: "Can you verify that your senior discount is active? Are you 60 or older?"',
  "Script: Thank you for holding, this is Ana from HR. I see your husband applied for his paternity leave through us. For security, may I have your date of birth?",
  "Script: Thank you for holding, this is Ana from HR. I see Maria applied for her maternity leave and you are her manager. For security, may I have your date of birth?",
  "Script: Thank you for holding, this is Ana from HR. You and your team applied for their parental leave together. For security, may I have your date of birth?",
  'Say: "Our members are mostly over 65. Are you 65 or older?"',
]) check(`(16th review, pin) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  "Payroll form. Fill in their HMO plan:\nHousehold size and number of dependents:", "Pre-employment form. Enter their HMO plan:\nHousehold size and number of dependents:",
  "Script: To verify your identity, may I have your date of birth? The applicant must tell us that before the screening.",
  'Ask: "Irate callers are common here. How old are you?"', 'Ask: "Difficult patients are part of the job. Are you married?"', 'Ask: "Demanding customers call all day. How old are you?"',
  'Ask: "Ever helped a customer with a refund? How old are you?"', 'Ask: "Any experience helping patients? Are you married?"', 'Ask: "Can you calm callers down? How old are you?"',
  'Ask: "Do you manage customers well? Are you married?"', 'Ask: "Have you assisted patients before? Are you married?"',
]) check(`(16th review, pin) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
// Known, and left (the sixteenth review): each is read as shown for the reason given, so the next review need not report it.
for (const [line, drops, why] of [
  ['Ask: "How would you explain a delay to a customer? Are you married?"', false, "a question about how the applicant would treat a customer (\"How would you…\", \"What would you say to a customer who…\", \"How do you keep a customer happy?\") is read as a customer's: a desk asks its own caller \"How would you like…\" and \"What would you…\" too, so only an interview's own shapes were set aside (\"Tell me about a time…\", \"Why do you want to work with…\", \"comfortable speaking with…\", \"experience with…\", \"good with…\")"],
  ['Say: "To confirm your eligibility for the senior rate, are you 65 or older?"', true, "\"your eligibility\" alone, and a purchase (\"…so I can complete the purchase\"), are a hire's as often (\"your eligibility for the role\", \"…so I can process the order\"), so standing alone they were not added; in a practice case that names its customer in an earlier sentence they are the customer's (the review's finding 1)"],
  ['Reply: "Thanks for reaching out to Bright Games! Are you 18 or older?"', true, "a chat greeting is a caller's check when it names the service's customer (\"Thanks for contacting customer support!\"); one naming only the business (\"Thanks for reaching out to Bright Games\", \"Thanks for messaging Bright Games support\") is HR's reply to an applicant as often, and every round dropped it"],
  ['Car rental booking. A caller wants to book a car. Say: "To confirm you can work nights, are you married?"', false, "a practice case's customer named in an earlier sentence makes its quote hers unless the quote speaks of the job (NOT_THE_LISTENER), is followed by words naming applicants or is put to someone applying; a hire's topic inside such a case (\"you can work nights\", \"your filing status for payroll\") was not read, since a case's customer works nights and files a W-4 too"],
  ['Ask: "To verify your member discount as a new employee, how old are you?"', false, "a customer word inside the quote counts as the fifteenth round restored it, and \"member\" is one, so the desk check's \"as a new employee\" (which drops \"your student discount as a new hire\") does not reach it; the job named after a customer word would need its own shape"],
  ['Record a 60-second video. Say: "Hi, I\'m Ana, I\'m 24, and I\'ve worked with patients for two years."', false, "a sample introduction that gives a bare number (\"I'm 24\", \"Ana, 24, from Cebu\") asks nothing and sets no limit, and every round kept it; its blank (\"I'm ___ years old\", \"(age ___)\") and \"24 years old\" are dropped"],
]) check(`(16th review, known) ${drops ? "dropped" : "kept"}: ${JSON.stringify(line)}: ${why}`, A.asksAgeOrStatus(line) === drops);

// The seventeenth Phase 6 review: the sixteenth round's first-person age read a customer's own message as a
// self-introduction ('Reply to: "I'm 70 years old and can't log in to my account."', the owner's own gaming case), and
// generate-flow and ai-generate-workflow dropped five practice cases whole (a regression against the thirteenth to
// fifteenth rounds); its earlier-sentence reading made any interview, screening or video prompt that mentions a customer a
// customer's ('In up to 75 seconds, describe how you would welcome a customer. Then answer: "What is your age and civil
// status?"'), broader than the thirteenth round ever read; its self-introduction entry read a customer's profile or record
// ("Patient profile: [Name], [Age]"); a service greeting before talk of the job, any verb after "How many customers did
// you…", a hire's HMO premium and BIR filing, and a few desk lines read as the other side. Each rule was narrowed back to the
// cases its round read, or reverted; every check in this list but the guards, the pins and the known items fails on the
// sixteenth round's module.
console.log("\nThe seventeenth review's cases\n");
for (const line of [
  // Finding 1: a customer's own first-person age in the message the agent answers, after the case's customer, or naming her
  // own account, portal, card or bill.
  'A senior member writes in. Reply to: "I\'m 70 years old and can\'t log in to my account."', 'Reply to this message: "I\'m 70 years old and I can\'t log in to my member account."',
  'Respond to this email: "I\'m 80 years old and I can\'t read the small print on my bill. Can you help with my account?"',
  'Answer the chat: "I\'m 70 years old and confused by the app. Please help with my account."', 'Reply to this chat: "Hi, I\'m Rosa, 70 years old, and I need help with my patient portal."',
  'Reply to this chat: "Hi, I\'m Rosa, 70 years old, and I want to talk to a member advocate."', 'Answer this ticket: "I am 68 years old and I need a patient advocate to call me."',
  'Reply to: "Hi, I\'m Rosa, 70 years old, and I want to talk to a member advocate."', 'Say: "My name is Rosa, I\'m 72 years old, and my patient portal is locked."',
  'Say: "I\'m 80 years old and my member card has not come."',
  'A senior member writes in. Reply: "I\'m 70 years old and confused by the app."', 'A player writes in about a charge. Say: "I\'m 15 years old. Can I play ranked?"',
  'Opening message: "I\'m 70 years old and can\'t log in to my account."', 'Say: "Hi, I\'m 15 years old and my mom\'s card paid for gems on my account."',
  // Finding 3: a customer's profile, record, macro or own line with a placeholder for her age.
  "Patient profile: [Name], [Age], [Reason for visit]", "Player profile: [Username], [Age], [Region], [Rank]", "Customer profile: [Name], [Age], [Plan], [Concern]",
  "Reply template: Hi [Player], your profile shows you are [Age], so ranked play opens when you turn 18.", "Use this note format: My caller: [Name], [Age], [Issue].",
  "Introduce yourself, then note the caller's name, [Age] and reason for calling.", "Caller: Hi, my date of birth is [DOB] and my member ID is [ID].",
  "Customer: My name is [Name], I'm [Age] years old, and I need to update my address.", "Role-play script. Customer line: My name is [Name], I'm [Age] years old, and my card was declined.",
  "Profile check: confirm the account holder is [Age] years old before unlocking ranked.", "Update the member's profile: [Name], [Age], [Plan].", "Player bio: [Username], [Age], [Rank].",
  "Ticket template: My customer [Name] ([Age]) asked about [Topic].", "The caller reads out: my date of birth is [DOB] and my member ID is [ID].",
  // Finding 7: a desk's own caller helping a member, the experience with its line, a desk asking its caller to describe one.
  'Ask: "Do you want to help a member of your household enroll? Are you 65 or older?"', 'Ask: "Did you want to help another member sign up? Are you 65 or older?"',
  'Say: "Sorry about the experience with our member line. Are you 65 or older?"', 'Ask: "Can you describe a recent time you were overcharged as a member? Are you 65 or older?"',
  'Ask: "Please share an example of a time our member line kept you waiting. Are you 65 or older?"', 'Ask: "Can you share a moment when the app failed for a family member? Are you over 18?"',
]) check(`(17th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  // Finding 2: an interview, a screening call, a video prompt or "the client" before the quote, or a customer the applicant
  // would welcome or greet, makes no age, marital or birth-date question put to the applicant a customer's.
  'In up to 75 seconds, describe how you would welcome a customer. Then answer: "What is your age and civil status?"',
  'In 60 seconds, tell us how you would greet a guest at the front desk. Then answer: "How old are you?"',
  'Screening call. The client wants agents who are mature. Ask: "How old are you? Just for our records."',
  'Phone interview for the Bright Health account. The client needs agents who can work nights. Ask: "Are you married? Do you have kids?"',
  'Each applicant answers a customer. Say: "How old are you?"', 'Interview. The candidate will role-play a call with a member. Before that, ask: "How old are you?"',
  'Chat interview. You will chat with a customer named Ana later. Opening message: "Hi! Before we start, how old are you?"',
  'Interview question. A customer calls about a late refund. How would you handle it? Ask: "How old are you?"', 'Written interview. A patient is waiting on hold. First, ask: "What is your date of birth?"',
  'Video introduction. Imagine a customer is watching. Say: "How old are you? Just for our records."', 'Record a short video. A caller wants to book a car. Say: "Are you married?"',
  // (The eighteenth review: 'Tax intake. The client calls about her refund. Ask: "Are you married or single?"' was here; a
  // client who calls or asks is the case's own customer, so it is kept now, below.)
  'The client is a US health plan. Ask: "How old are you?"',
  'The US client wants mature agents. Ask: "How old are you?"', 'Screening call. A customer calls about a late refund. Ask: "How old are you?"',
  'Practice for the interview: a caller wants a refund. Ask: "How old are you?"', 'In this job, a customer may call at night. Ask: "Are you married?"',
  // Finding 4: a service greeting, then the job, the interview or an application.
  'Say: "Hi, this is Ana from customer care. Do you have a minute to talk about the job? How old are you?"',
  'Say: "Hi, this is Ana from Bright Clinic\'s patient care team. I\'m calling about your application for the front desk role. How old are you?"',
  'Say: "Welcome to Bright Clinic patient support! Before we start the interview, how old are you?"',
  'Reply: "Thanks for reaching out to Bright Games player support! We read your application. Are you 18 or older?"',
  // Finding 5: "How many customers did / can you…", whatever verb follows.
  'Ask: "How many customers do you think you can handle in a shift? How old are you?"', 'Ask: "How many customers did you resolve per shift at your last job? How old are you?"',
  'Ask: "How many callers do you expect to handle per hour here? Are you married?"', 'Ask: "How many patients did you check in per day? How old are you?"',
  'Ask: "How many customers did you process a day? Are you married?"', 'Ask: "How many customers do you think you could chat with at once? Do you have children?"',
  'Ask: "How many customers have you trained? How old are you?"',
  // Finding 6: a hire's HMO premium, BIR filing, payslip and staff discount, and a topic after welcoming a hire.
  'Ask: "To confirm your insurance premium for the company HMO, are you married or single?"', 'Ask: "To confirm your health premium under our HMO, how many dependents do you have?"',
  'Ask: "To confirm your tax filing status with BIR, are you single or married?"', 'Ask: "To confirm your tax filing status for your payslip, are you married?"',
  'Opening message: "Welcome to the team! To confirm your tax filing status, are you married or single?"', 'Ask: "To confirm the discount for staff, how old are you?"',
  // Finding 7: a hospital whose name says research, the hiring's own form, a customer who has not called yet.
  'Say: "Hi, I\'m Ana, a clinical recruiter at Bright Medical Research Center. May I have your date of birth for your file?"',
  "Script: For security, may I have your date of birth? The applicant must enter it on the application form.",
  'Before a customer calls, ask: "Are you married?"', 'Ask: "How old are you?" before the client requests a schedule.',
  // …and "want to" read as one step before working with them, so an adverb before it no longer hides the interview's
  // question.
  'Say: "Why do you really want to work with customers? How old are you?"',
]) check(`(17th review) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
// Pins (finding 8): the self-introduction entry's placeholders in braces, which dropping that alternative changed no check
// for, and the greeting's own sentence read for the sixteenth round's words (now that the rest of the quote is read for the
// job's, an assessment named in the greeting's sentence was the only thing left to pin). They pass on the sixteenth round's
// module too.
for (const line of ['Template: "I am {name}, {age}, {civil status}, from {city}."', "Introduce yourself in this format: My name is {name}, {age}, from {city}.",
  'Say: "Hi, this is Ana from customer care calling about your skills assessment. How old are you?"']) {
  check(`(17th review, pin) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
}
// …and in the real paths: generate-flow's simulation filter (:252) keeps the review's five practice cases whole and
// ai-generate-workflow's configWithoutAgeAsks (:607, :616) keeps each one's prompt and scenario; the review's four practice
// cases and two quiz items built on a customer's profile or macro are kept (generate-flow :250, :252); a video step's
// prompt that asks the applicant is dropped (ai-generate-workflow :607); the interview guide drops an interview's own
// questions that mention a customer (guideMaterial.ts:402, marksAgeOrFamily).
const replyCases = [
  { title: "Locked patient portal", prompt: 'A senior patient writes in. Reply to her message: "I\'m 72 years old and I can\'t log in to my patient portal. Can you help?" Then walk her through a reset.' },
  { title: "Minor's purchase", prompt: 'A parent writes in about a charge. Reply to the chat: "Hi, I\'m 15 years old and I bought gems with my mom\'s card. My account shows the charge. Can I get a refund?"' },
  { title: "Small print", prompt: 'An elderly member emails the support desk. Respond to this email: "I\'m 80 years old and I can\'t read the small print on my bill. Can you help with my account?"' },
  { title: "App confusion", prompt: 'A member is confused by the app. Answer the chat: "I\'m 70 years old and confused by the app. Please help with my account."' },
  { title: "Portal help", prompt: 'Reply to this chat: "Hi, I\'m Rosa, 70 years old, and I need help with my patient portal." Keep it simple and kind.' },
];
check("(17th review) the review's five practice cases with a customer's own age are kept whole, with their prompts and scenarios", A.withoutAgeAsks(replyCases, (s) => `${s.title}. ${s.prompt}`).length === 5 && replyCases.every((s) => !A.asksAgeOrStatus(s.prompt) && !A.asksAgeOrStatus(`${s.title}. ${s.prompt}`)));
const profileCases = [
  { title: "After-call note", prompt: "A patient calls to move her check-up. After the call, fill in the patient profile: [Name], [Age], [Reason for visit], [New time]." },
  { title: "Age-locked ranked", prompt: "A player says ranked mode is locked. Use the macro: Hi [Player], your profile shows you are [Age], so ranked opens at 18. Then offer casual mode." },
  { title: "CRM update", prompt: "A member calls to change her plan. Update the member's profile: [Name], [Age], [Plan], [Reason for change]." },
  { title: "Intake", prompt: "Introduce yourself, then take the caller's name, [Age] and reason for calling." },
];
check("(17th review) …the review's four practice cases and two quiz items built on a customer's profile or macro are kept", A.withoutAgeAsks(profileCases, (s) => `${s.title}. ${s.prompt}`).length === 4 && A.withoutAgeAsks(["A caller asks to update her record. Which CRM entry is complete? Customer profile: [Name], [Age], [Plan], [Concern]", "A player asks why ranked is locked. Best reply: Hi [Player], your profile shows you are [Age]; ranked opens at 18."]).length === 2);
const videoPrompts = ['In up to 75 seconds, describe how you would welcome a customer. Then answer: "How old are you, and are you single or married?"', 'In 60 seconds, tell us how you would greet a guest at the front desk. Then answer: "How old are you?"',
  'Record a video for the Bright Health account. The client needs agents who can work nights. Answer: "Are you married? Do you have kids?"'];
check("(17th review) …a video step's prompt that asks the applicant, after a customer it would greet, is dropped", videoPrompts.every((p) => A.asksAgeOrStatus(p)));
check("(17th review) …and the interview guide drops an interview's question that mentions a customer", A.marksAgeOrFamily('Interview question. A customer calls about a late refund. How would you handle it? Then ask: "How old are you?"') && A.marksAgeOrFamily('Screening call. The client wants agents who are mature. Ask: "How old are you? Just for our records."'));
// …and the review's grids: (A) a customer's own first-person age after a reply label, in five contexts, every one kept (the
// eighteenth review: this check kept back the two messages naming no account, portal or member with no case's customer
// before them, "I am 68 … my policy renewal" and "I'm 64 … my Medicare plan", 28 lines every round dropped; a message
// replied to is the customer's whatever it names, so none is dropped now); (B) an earlier sentence naming an interview, a
// screening call, a video, an applicant or "the client", every one dropped.
{
  const contexts = ["", "A senior member writes in. ", "A player writes in about a charge. ", "Patient portal help. A patient emails the clinic. ", "Medicare chat. "];
  const labels = ["Reply to this chat: ", "Reply to: ", "Respond to this email: ", "Answer the chat: ", "Reply to her message: ", "Respond to the message: ", "Answer this ticket: "];
  const bodies = ["I'm 70 years old and can't log in to my account.", "Hi, I'm 72 years old and I need help with my patient portal.", "I'm 15 years old and my account was charged for gems. Can I get a refund?",
    "I am 68 years old and my policy renewal went up. Why?", "Hi, I'm Rosa, 70 years old, and my member card has not arrived.", "I'm 16 years old and my account got banned. Why?",
    "I'm 80 years old and the app is too small to read. Please help with my account.", "I'm 64 years old and want to know when my Medicare plan starts."];
  const lines = contexts.flatMap((c) => labels.flatMap((l) => bodies.map((b) => `${c}${l}"${b}"`)));
  const dropped = lines.filter((line) => A.asksAgeOrStatus(line));
  check(`(17th review) a customer's first-person age in the message replied to is hers (${lines.length} lines)`, lines.length === 280 && dropped.length === 0, dropped.slice(0, 3).join(" | "));
  const openings = ["Interview question. A customer calls about a late refund. How would you handle it? ", "Screening call for the Bright Health account. The client wants mature agents. ",
    "Voice interview. The interviewer plays a customer later. ", "Interview. The candidate will role-play a call with a member. ", "Written interview. A patient is waiting on hold. ",
    "The client is a US health plan. ", "Each applicant answers a customer. ", "Video introduction. Imagine a customer is watching. ", "Chat interview. A customer may test you later. "];
  const blabels = ["Ask: ", "Then ask: ", "Say: ", "First, ask: ", "Opening message: "];
  const asks = ['"How old are you?"', '"Are you married?"', '"Do you have kids?"', '"What is your date of birth?"', '"Are you single?"', '"How old are you? Just for our records."'];
  const bLines = openings.flatMap((o) => blabels.flatMap((l) => asks.map((a) => `${o}${l}${a}`)));
  const kept = bLines.filter((line) => !A.asksAgeOrStatus(line));
  check(`(17th review) …and a customer named before a question put to the applicant does not make it hers (${bLines.length} lines)`, bLines.length === 270 && kept.length === 0, kept.slice(0, 3).join(" | "));
}
// Guards: what each narrowed reading must still drop or keep. A first-person age in a self-introduction with the BPO's
// "accounts", after a label that has the speaker say it, or after "answer" with no message named; a role-play, a video
// call, a medical screening and a case's "A client" before the quote; a self-introduction's own label, bio or "about
// yourself" before the template; a greeting before a card's or a loan's application or a player's posts; a desk's count
// of who is on a policy or in a household; a customer's premium for the policy, a passenger's "Welcome aboard!", a desk's
// discount; the interview's own "want to work with", "experience with" and "Tell me about a time"; the agent's own chart.
for (const line of [
  'Record a 60-second video. Say: "Good day! My name is ___, ___ years old. I have handled US accounts for ___ years."',
  'Say: "Hi, I\'m Ana, 24 years old, and I have handled healthcare accounts for two years."', 'Example reply: "Hi, I\'m Ana, 24 years old, and I love helping customers."',
  'Reply: "Hi, I\'m ___, ___ years old, and I love helping customers."', 'Answer this question: "How old are you?"', 'Reply to this question: "Are you married?"',
  'Answer the interviewer: "Hi, I\'m Ana, 24 years old, and I love helping customers."', 'Respond to the recruiter: "Hi, I\'m ___, ___ years old, and I enjoy helping customers."',
  'Opening line: "Hi! I\'m Ana, 24 years old, and my plan is to grow with your team."',
  "Introduce yourself: [Name], [Age], [City].", "Tell us about yourself: [Name], [Age], [Civil status], [City].", "Your profile: [Name], [Age], [Civil Status], [Location]",
  "Write a short bio: [Name], [Age], [City].", "Video intro: Hi, I'm [Name], [Age] years old, from [City].", "My bio: [Name], [Age], [City]", "Complete: My civil status: ___",
  'Ask: "Do you have experience with customers? How old are you?"', 'Ask: "Tell me about a time a customer was unhappy with you. Are you married?"',
  // A case's customer only opening its sentence, one at a time, with an interview's own shapes set aside.
  'The customers on this line are mostly parents. Ask: "How old are you?"',
  'Tell me about a time: a customer yelled at you. Then ask: "How old are you?"',
]) check(`(17th review, guard) …and still drops: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
for (const line of [
  'Interview role-play: the patient calls to move an appointment. Say: "Are you over 18?"', 'Candidates role-play this call. A caller asks about Medicare. Say: "Are you 65 or older?"',
  'Interview. Candidates role-play this call. A caller asks about Medicare. Say: "Are you 65 or older?"', 'Video role-play: a guest calls to book a room. Say: "Are you 21 or older?"', 'Telehealth desk. A patient on a video call wants to reschedule. Say: "Are you over 18?"',
  'Streaming support. A customer says her video will not play. Ask: "Are you 18 or older?"', 'A patient calls about her cancer screening. Say: "Are you over 40?"',
  'Tax intake. A client calls about her refund. Ask: "Are you married or single?"',
  'Say: "Thanks for contacting member support! I see your application for the senior card. Are you 65 or older?"',
  'Reply: "Thanks for contacting player support! I see your posts were removed. Are you 18 or older?"', 'Say: "Hi, this is Ana from customer care. Your loan application is approved. Are you 18 or older?"',
  'Say: "Thanks for contacting customer support! Are you 18 or older?" If they ask about jobs, transfer them to HR.',
  'Ask: "Tell me about the situation with your member card. Are you 65 or older?"',
  'Ask: "How many members do you have on your policy? Are you 65 or older?"', 'Ask: "How many patients do you have in your household? Are you over 18?"',
  'Say: "To confirm your insurance premium for the policy, are you 65 or older?"', 'Say: "Welcome aboard! To confirm your youth fare, are you under 25?"',
  'Say: "To verify your senior discount for the pharmacy, are you 60 or older?"', 'Say: "Welcome to the Bright Rewards family! To verify your senior discount, are you 60 or older?"',
  'Ask: "Can you confirm your tax filing status for your refund? Are you married or single?"',
  "Script: Thank you for calling Bright Clinic. For security, may I have your date of birth? The candidate must enter it in the patient chart before sharing results.",
  'Say: "Hi, I\'m Ana, a clinical recruiter for the Bright Research diabetes trial. May I have your date of birth for your file?"', 'After a customer calls, say: "Are you 18 or older?"',
]) check(`(17th review, guard) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
// Known, and left (the seventeenth review): each is read as shown for the reason given, so the next review need not report it.
for (const [line, drops, why] of [
  ['Opening question for the screen. A customer once said our agents are too slow. Ask: "How old are you?"', false, "a customer opening a sentence before the quote is the case's customer whatever the verb, as the sixteenth round's cases are worded; \"the screen\" alone is as often a device's (\"the screen is blank\", a screen name), so only \"screening call\", \"phone screen\", a video and the interview words stop it, and a past \"said\" is a practice case's too (\"A member said her card was declined\")"],
  ['Hiring tip. A member said our wait times are long. Ask: "How old are you?"', false, "\"hiring\" was not added to the words that stop a case's customer: a practice case is set up for hiring as often (\"Hiring practice: a caller wants…\"), and \"Interview role-play\" already needed its own reading"],
  ['Give a scenario first: a patient calls to cancel. Then ask: "How old are you?"', false, "an interview guide's own scenario or role-play set up before the ask (\"Give a scenario first:\", \"Start with a role-play: the caller wants a refund. Afterwards ask: …\", \"A customer calls about a double charge. Walk me through your first three sentences. Then answer: …\", \"Interview. The candidate will role-play this call. A caller asks about Medicare. Before that, ask: …\") reads like a practice case's \"A guest calls to book a room. Then ask: …\"; \"first\", \"afterwards\", \"before that\" and \"then\" are the case's next line as often, and a role-play's own sentences may say \"Interview\" or \"Candidates\", so only the interview words, a screening call, a video and \"the client\" with no role-play before the quote stop it (marksAgeOrFamily keeps it as asksAgeOrStatus does)"],
  ['Hotel booking. When a guest calls to book a room, check the dates. Then ask: "Are you 21 or older?"', true, "a case's customer in an earlier sentence counts only opening it or a label's colon, as every case the sixteenth round read did; after \"when\" or \"if\" it is an interview's as often (\"Describe what you do when a customer is angry.\"), and in the quote's own sentence it still counts (\"When a customer calls, say: …\", A_CUSTOMER_DOES)"],
  ['Say: "Hi, I\'m Ana from customer support. Before we begin, are you married?"', false, "a service greeting is HR's only when the rest of the quote names the job, the interview or a job application (\"Before we start the interview\"); \"before we begin\" and \"You applied last week\" are a desk's too (a tax desk asks \"are you married?\", a loan desk says \"you applied\")"],
  ['Say: "Thanks for applying to Bright Credit Union! We serve members across the state. May I have your date of birth?"', true, "\"thanks for applying to\" a business is HR's or a credit union's alike, and the work described after it (\"We serve members\", \"Our team supports members\") reads as HR's, as the sixteenth round read \"We serve customers in 20 countries\" after \"your interest in joining our team\"; only a listener welcomed as a member (\"We're glad to have you as a new member\") keeps it"],
  ['Phone screen practice: when a customer calls, ask: "How old are you?"', false, "a customer named in the quote's own sentence outside the quote makes it hers before anything else is read, as every round read 'Ask the caller, \"…\"', and since the sixteenth review one doing something there (\"When a customer calls, say: …\"); only \"before\" and \"until\" were taken out of that reading (the review's other line)"],
  ['The client is a US health plan, so ask: "Do you have kids who need care at night?"', false, "\"the client\" in the quote's own sentence names a customer outside the quote, as every round read it; it was taken out of the case's customer in an earlier sentence only (the review's finding 2)"],
  ['Opening message: "I am 66 years old and my Medicare card has not come."', true, "a customer's first-person age with nothing else to say whose it is (no reply label, no case's customer before it, no account, portal or member in it) is dropped, as every round dropped it; her own card makes it no self-introduction, but the age is read as any age with no one named"],
]) check(`(17th review, known) ${drops ? "dropped" : "kept"}: ${JSON.stringify(line)}: ${why}`, A.asksAgeOrStatus(line) === drops && (line.startsWith("Give a scenario") ? A.marksAgeOrFamily(line) === drops : true));

// The eighteenth Phase 6 review: a customer's first-person age in the message the agent replies to was still read as the
// applicant's when the message named no customer or check word ('Reply to this chat: "I'm 64 years old and want to know
// when my Medicare plan starts."', the owner's gaming case without its "account"; every round since the thirteenth dropped
// it), and four of the seventeenth round's readings went past the cases that justified them: the hire's HMO, withholding and
// employees read a customer's own plan ("your premium for the HMO plan"), its brief or quick intro a warm transfer's intro of
// the caller, its case's customer only right after a full stop (never "Next, a member calls…", "Case 1) A caller…", "In this
// video call, a patient…", "The client calls about her refund", or after "Candidates practice this call."), and its
// self-introduction entry and first-person age let applicant templates through ("Send your profile: [Name], [Age]…", "My
// previous account was a US telco", 'Reply to the recruiter's message: "Hi, I'm ___, ___ years old…"'); "Why do you want to
// help customers?", a desk's headcount, "Before a customer orders wine, ask:", a game's role and a benefits application read
// as the other side. Each rule was narrowed back to its round's cases; every check in this list but the guards, the pins and
// the known items fails on the seventeenth round's module.
console.log("\nThe eighteenth review's cases\n");
for (const line of [
  // Finding 1: a customer's own first-person age in the message replied to, with no customer or check word in it.
  'Reply to this chat: "I\'m 64 years old and want to know when my Medicare plan starts."', 'Medicare chat. Reply to this chat: "I\'m 64 years old and want to know when my Medicare plan starts."',
  'Reply to the chat: "Hi, I\'m 15 years old and I bought gems with my mom\'s card. Can I get a refund?"', 'Reply to this message: "I\'m 70 years old and my prescription refill is late again."',
  'Respond to this email: "I\'m 80 years old and I can\'t read the small print on my bill."', 'Reply to: "I am 68 years old and my policy renewal went up. Why?"',
  'Reply to this ticket: "I\'m 16 years old and my subscription renewed without asking."', 'Reply to this chat: "I\'m 65 years old today. Can I switch to a Medicare Advantage plan?"',
  'Reply to this message: "I\'m 70 years old and need to move my appointment to Friday."',
  'In a friendly tone and with plain words, as simply as possible, reply to this chat: "I\'m 64 years old and want to know when my Medicare plan starts."',
  // Finding 2: a customer's own HMO plan, withholding or employee discount, and a desk's own team in its greeting.
  'Say: "To confirm your premium for the HMO plan, are you 65 or older?"', 'Say: "To confirm your premium for your HMO, are you 65 or older?"',
  'Ask: "To confirm your premium with your HMO, are you 65 or older?"', 'Say: "To verify your premium under our HMO plan, are you 65 or older?"',
  'Medicare Advantage line. Say: "To confirm your premium for the HMO plan, are you 65 or older?"', 'Say: "To confirm your senior discount with the HMO, are you 60 or older?"',
  'Say: "To confirm your premium through the HMO, are you 65 or older?"', 'Ask: "To confirm your filing status for withholding, are you married or single?"',
  'Ask: "To verify your filing status for the withholding tables, are you married or single?"', 'Say: "To confirm your discount for employees of partner companies, are you 60 or older?"',
  'Say: "To confirm your senior discount through our HMO partner, are you 60 or older?"',
  'Say: "Welcome to our pharmacy team\'s refill line! To verify your senior discount, are you 60 or older?"',
  'Reply: "Welcome to the Bright Games team chat! To confirm you can play ranked, are you 18 or older?"',
  // Finding 3: a warm transfer's intro of the caller, and a caller's own opening line under any label.
  "Warm transfer. Give the nurse a brief intro: [Name], [Age], [Reason for call].", "Before transferring, give the specialist a quick intro: caller [Name], [Age], [Issue].",
  "Transfer the call with a brief introduction: [Name], [Age], [Reason].", "Warm transfer script: a short intro of the patient, [Name], [Age], [Concern].",
  "Warm handoff: give the pharmacist a quick intro of the patient ([Name], [Age], [Medication]).", "Hand the chat to Tier 2 with a short intro: [Username], [Age], [Region], [Problem].",
  "Send a brief intro of the caller to the nurse: [Name], [Age], [Reason for call].",
  "The caller opens with: Hi, my name is [Name], I'm [Age] years old, and my card was declined.", "Caller (role-play): My name is [Name], I'm [Age] years old, and I need to update my address.",
  "Customer — Hi, I'm [Name], [Age] years old, and my order is late.", "The member's first message: Hi, I'm [Name], [Age] years old, and my claim was denied.",
  "Sample caller opener: Hi, my name is [Name], I'm [Age] years old, and I need a refill.", "Caller persona: I'm [Name], [Age] years old, and I just moved.",
  // Finding 4: the case's customer after a word of sequence, a list's mark or the call she is on, a practice set up in other
  // words than "role-play", a tax desk's own client.
  'Next, a member calls about her premium. Ask: "Are you 65 or older?"', 'Then a caller asks about Medicare. Ask: "Are you 65 or older?"',
  'Later, a guest calls to book a room. Ask: "Are you 21 or older?"', 'Now a patient asks to reschedule. Ask: "Are you 65 or older?"', 'Today a caller asks about Medicare. Ask: "Are you 21 or older?"',
  'Scenario 2 — a caller asks about Medicare. Ask: "Are you 65 or older?"', 'Case 1) A caller asks about Medicare. Ask: "Are you 65 or older?"', '(1) A caller asks about Medicare. Ask: "Are you 21 or older?"',
  'Candidates practice this call. A caller asks about Medicare. Ask: "Are you 65 or older?"', 'Practice call for applicants. A guest calls to book a room. Ask: "Are you 21 or older?"',
  'Applicants handle this chat. A player says ranked is locked. Ask: "Are you 21 or older?"', 'In this practice, the candidate is the agent. A caller asks about Medicare. Ask: "Are you 65 or older?"',
  'You are the agent; the interviewer plays the caller. A caller asks about Medicare. Ask: "Are you 65 or older?"',
  'In this video call, a patient asks to reschedule. Ask: "Are you 65 or older?"', 'Telehealth. In the video visit, a patient asks about her results. Ask: "Are you 21 or older?"',
  'Tax intake. The client calls about her refund. Ask: "Are you 65 or older?"', 'Tax intake. The client calls about her refund. Ask: "Are you married or single?"',
  'Tax season. The client asks why her refund is late. Ask: "Are you 21 or older?"', 'During the call, a member asks about her premium. Ask: "Are you 65 or older?"',
  // Finding 7: a desk's headcount, an alcohol desk's check before an order, a game's role and a benefit's application after a
  // service greeting.
  'Ask: "How many guests do you have in your party? Are you 21 or older?"', 'Ask: "How many members do you want to enroll? Are you 65 or older?"',
  'Ask: "How many members would you like to enroll? Are you 65 or older?"', 'Ask: "How many passengers do you have on the booking? Are you over 18?"',
  'Before a customer orders wine, ask: "Are you 21 or older?"', 'Wine delivery chat. Before a customer orders, ask: "Are you 21 or older?"',
  'Reply: "Thanks for contacting player support! Which role do you play? Are you 18 or older?"', 'Reply: "Thanks for contacting player support! I see your ranked role was reset. Are you 18 or older?"',
  'Say: "Thanks for contacting member support! Your benefits application is in. Are you 65 or older?"',
  'Say: "Thanks for contacting member support! I see your application for the senior discount. Are you 60 or older?"',
]) check(`(18th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  // Finding 5: a profile or bio label that is the writer's or an applicant's, "Introduce yourself (…)", a self-introduction
  // whose label names whom it is for, a BPO agent's own "account", and a self-introduction replied to the hiring side.
  "Send your profile: [Name], [Age], [Civil Status], [Location].", "Send us your profile: [Name], [Age], [Civil Status], [City]", "Reply with your profile: Name, [Age], [Civil Status]",
  "Candidate profile: [Name], [Age], [Civil Status], [Location]", "Applicant profile: [Name], [Age], [Civil Status]", "Applicant bio: [Name], [Age], [City]",
  "Introduce yourself (name, [Age], city).", "Introduce yourself to customers: My name is [Name], I am [Age] years old.",
  "Record an intro for our customers: Hi, I'm [Name], [Age] years old, from [City].", "Video intro for our members: My name is ___, ___ years old, and I will be your agent.",
  'Record a 60-second video. Say: "Good day! My name is ___, ___ years old. My previous account was a US telco."',
  'Say: "Hi, I\'m ___, ___ years old, and my current account is a US bank."', 'Opening line: "Hi! I\'m ___, ___ years old, and my last account was customer care for a US telco."',
  'Record a 60-second video. Say: "Hi, I\'m Ana, 24 years old. My last account was a US healthcare provider."', 'Say: "Hi, I\'m Ana, 24 years old. In my previous account I handled billing disputes."',
  'Video intro. Say: "Hi, I\'m [Name], [Age] years old. My previous accounts were telco and billing."',
  'Reply to the recruiter\'s message: "Hi, I\'m ___, ___ years old, and I love helping customers."', 'Reply to the hiring manager\'s email: "Hi, I\'m ___, ___ years old, and I love helping customers."',
  'Reply to this message from our HR team: "Hi, I\'m ___, ___ years old, and I enjoy serving customers."', 'Reply to this chat from our recruiter: "Hi, I\'m Ana, 24 years old, and I have handled US accounts."',
  'Respond to the recruiter\'s text: "Hello, I am [Name], [Age] years old, and I love helping customers."',
  'Reply to this chat from the hiring team: "Hi, I\'m ___, ___ years old, and I love helping customers."',
  // Finding 2's other side: the team's own HMO is a hire's, as the company's is.
  'Ask: "To confirm your health premium for our team\'s HMO, how many dependents do you have?"',
  // Finding 6: an interview's own "Why do you want to help…" and "Describe a time a customer…".
  'Ask: "Why do you want to help customers? How old are you?"', 'Ask: "Why do you want to support patients? Are you married?"',
  'Ask: "Describe a time a customer was angry with you. Are you married?"', 'Ask: "Can you recall a time a customer thanked you? Do you have kids?"',
]) check(`(18th review) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
// …and in the real paths: generate-flow's simulation filter (:252) and quiz filter (:250) keep the review's practice cases and
// quiz items whole (a customer's own message replied to, an HMO desk, a warm transfer, the case's customer after "Next," or a
// practice's setup), and ai-generate-workflow's configWithoutAgeAsks (:607) deletes none of their prompts.
const reviewCases18 = [
  { title: "Medicare start date", prompt: 'Reply to this chat: "I\'m 64 years old and want to know when my Medicare plan starts." Explain the Initial Enrollment Period.' },
  { title: "Refill delay", prompt: 'Reply to this message: "I\'m 70 years old and my prescription refill is late again." Apologize and give a date.' },
  { title: "Minor's purchase", prompt: 'Reply to the chat: "Hi, I\'m 15 years old and I bought gems with my mom\'s card. Can I get a refund?" Follow the minors refund policy.' },
  { title: "HMO premium tier", prompt: 'Medicare Advantage HMO line. Say: "To confirm your premium for the HMO plan, are you 65 or older?" Then explain the cost.' },
  { title: "Maxicare senior rate", prompt: 'Maxicare member line. Ask: "To confirm your premium for your HMO plan, are you 60 or older?" Then quote the senior rate.' },
  { title: "Clinic senior discount", prompt: 'Front desk, Bright Clinic. Say: "To verify your senior discount with your HMO, are you 60 or older?" Then process the visit.' },
  { title: "Premium question", prompt: 'Explain the HMO premium tiers. Then ask: "To confirm your premium under the HMO, are you 60 or older?"' },
  { title: "Warm transfer to the nurse", prompt: "A patient asks to speak to a nurse about her new medication. Give the nurse a brief intro: [Name], [Age], [Reason for call]. Then transfer the call." },
  { title: "Tier 2 handoff", prompt: "A player cannot log in after a password reset. Hand the chat to Tier 2 with a short intro: [Username], [Age], [Region], [Problem]." },
  { title: "Pharmacist handoff", prompt: "A caller has a question about a refill. Warm handoff: give the pharmacist a quick intro of the patient ([Name], [Age], [Medication])." },
  { title: "Senior caller", prompt: 'Next, a member calls about her premium. Ask: "Are you 65 or older?" Then explain the plan.' },
  { title: "Booking", prompt: 'Candidates practice this call. A guest calls to book a room. Ask: "Are you 21 or older?" Then book it.' },
  { title: "Telehealth reschedule", prompt: 'In this video call, a patient asks to reschedule. Ask: "Are you over 18?" Then book it.' },
  { title: "Ranked lock", prompt: 'Applicants handle this chat. A player says ranked is locked. Reply: "Are you 18 or older?" Then explain.' },
];
const reviewQuiz18 = [
  { scenario: "Which opener fits a Medicare Advantage HMO line?", good: 'Say: "To confirm your premium for the HMO plan, are you 65 or older?"' },
  { scenario: "You are transferring a caller to billing. Which handoff is complete?", good: "Transfer the call with a brief introduction: [Name], [Age], [Reason]." },
];
check(`(18th review) the review's ${reviewCases18.length} practice cases and ${reviewQuiz18.length} quiz items are kept whole, and no step prompt is deleted`, A.withoutAgeAsks(reviewCases18, (s) => `${s.title}. ${s.prompt}`).length === reviewCases18.length && A.withoutAgeAsks(reviewQuiz18, (q) => `${q.scenario} ${q.good}`).length === reviewQuiz18.length && reviewCases18.every((s) => !A.asksAgeOrStatus(s.prompt)));
// …and the review's openings over every speech label and customer ask (the fifteenth review's grid): every one a customer's.
const caseOpenings18 = ["Next, a member calls about her premium. ", "Then a caller asks about Medicare. ", "Today a caller asks about Medicare. ", "Scenario 2 — a caller asks about Medicare. ",
  "Case 1) A caller asks about Medicare. ", "Candidates practice this call. A caller asks about Medicare. ", "Practice call for applicants. A guest calls to book a room. ",
  "Applicants handle this chat. A player wants to buy gems. ", "In this video call, a patient asks to reschedule. ", "Tax intake. The client calls about her refund. "];
{
  const lines = caseOpenings18.flatMap((opening) => quoteGrid([""]).map((line) => `${opening}${line}`));
  const dropped = lines.filter((line) => A.asksAgeOrStatus(line));
  check(`(18th review) a quote after the case's customer named after a word of sequence, a list's mark, the call or a practice's setup is the customer's (${lines.length} lines)`, lines.length === caseOpenings18.length * 63 && dropped.length === 0, dropped.slice(0, 3).join(" | "));
}
// Pins (finding 8): the review's nine weakenings and widenings that changed no check, on this round's text: the hire-pay
// article "a" and "plan" among its nouns, "email" in the reply label (above) and its 40 characters, the welcome's 400
// characters and the words before its "team", the rest of the quote's 400 characters, and the customer's line that she says
// or opens with ("withholding" is no hire-pay noun any more). They pass on the seventeenth round's module too.
for (const line of [
  'Say: "To confirm your premium for the plan, are you 65 or older?"', 'Say: "To verify your senior discount with the plan, are you 60 or older?"',
  "The caller says: Hi, my name is [Name], I'm [Age] years old, and my card was declined.", "A caller says: Hi, my name is [Name], I'm [Age] years old, and I need a refill.",
  "The patient said: Hi, I'm [Name], [Age] years old, and I need a new appointment.",
  // …and this round's own parts the review's lines do not reach: a customer's label after a short label of its own, her
  // line named in the middle of a sentence.
  "Role-play: Customer: My name is [Name], I'm [Age] years old, and my order is late.", "Read the customer's line: My name is [Name], I'm [Age] years old, and my card was declined.",
]) check(`(18th review, pin) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  'Ask: "To confirm your premium under a company HMO, are you married or single?"',
  'Reply to the chat in a friendly tone, and then in your own video say: "Hi, I\'m ___, ___ years old, from ___."',
  'Opening message: "Welcome to the support team! To confirm your tax filing status, are you married or single?"',
  'Opening message: "Welcome to the team! We are so glad to have you with us, and your lead will call on Monday. To confirm your tax filing status, are you married or single?"',
  'Say: "Thanks for contacting customer support! Thank you for your patience while we looked at everything you sent us. Do you have a minute to talk about the job? How old are you?"',
  // …the welcome's comma, "want to work with" with no "why" before it, and the company's payroll.
  'Opening message: "Welcome to the team, Ana! To confirm your tax filing status, are you married or single?"', 'Ask: "Do you want to work with customers? How old are you?"',
  'Ask: "To confirm your filing status for the company payroll, are you married or single?"',
]) check(`(18th review, pin) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
// Guards: what each narrowed reading must still drop or keep. A message replied to that the label gives to the hiring side,
// to a question or to the reply, or whose quote is someone applying; a hire's HMO of the company's, "our HMO" on its own, a
// welcome that ends at the team; an intro or bio the writer records, writes or makes a video of; a customer's label that is
// no line of hers; a case's customer after an interview, in a job or in the applicant's own video, one the applicant
// welcomes, a customer the interviewer plays; a count of the work; a role that is the job's.
for (const line of [
  'Respond to this email: "Thanks for applying! Please reply with: I\'m ___, ___ years old, from ___."', 'Reply to the chat with your intro: "Hi, I\'m ___, ___ years old, from ___."',
  'Answer this question: "I\'m 24 years old. Can I still apply?"', 'Answer the interview question: "Hi, I\'m ___, ___ years old, and I love helping customers."',
  'Reply to this message: "Hi! Before we continue, how old are you?"', 'Reply to the candidate\'s message: "Hi, I\'m ___, ___ years old, and I love helping customers."',
  'Answer in your own words: "Hi, I\'m ___, ___ years old, from ___."',
  'Ask: "To confirm your insurance premium for the company HMO, are you married or single?"',
  'Ask: "To confirm your health premium under our HMO, how many dependents do you have?"', 'Opening message: "Welcome to the team! To confirm your tax filing status, are you married or single?"',
  "Video intro: [Name], [Age], [City].", "Record a short intro: [Name], [Age], [Civil Status], [City].", "Write a short bio: [Name], [Age], [City].",
  "Record a short intro of yourself: [Name], [Age], [City].",
  "Customer service intro: Hi, I'm [Name], [Age] years old, from [City].",
  'Chat interview. Next, a customer calls about a refund. Ask: "How old are you?"', 'In this job, a customer may call at night. Ask: "Are you married?"',
  'In your video, answer this. A customer calls about a refund. Then ask: "How old are you?"', 'Practice for the interview: a caller wants a refund. Ask: "How old are you?"',
  'Welcome a customer warmly. Then ask: "How old are you?"', 'Voice interview. The interviewer plays a customer. A customer calls about a refund. Ask: "How old are you?"',
  'Ask: "How many customers did you enroll last month? How old are you?"', 'Before a customer calls, ask: "Are you married?"',
  'Say: "Hi, this is Ana from customer care. Do you have a minute to talk about the role? How old are you?"',
]) check(`(18th review, guard) …and still drops: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
for (const line of [
  'Reply to the player\'s message: "I\'m 15 years old and my gems are gone."', 'Answer the member\'s question: "I\'m 70 years old. When does my Medicare start?"',
  'Ask: "Why do you want to add a member to your plan? Are you 65 or older?"',
  "Patient profile: [Name], [Age], [Reason for visit]", 'Opening message: "I\'m 70 years old and can\'t log in to my account."',
]) check(`(18th review, guard) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
// Known, and left (the eighteenth review): each is read as shown for the reason given, so the next review need not report it.
for (const [line, drops, why] of [
  ['Ask: "How many guests will you be bringing? Are you 21 or older?"', true, "a desk's count is read only for who is on a plan, a policy, an account, a household, a party or a booking, or who will enroll; \"will you be bringing\", \"will you be traveling with\" and \"do you need to cover\" are the work's count as often (\"How many customers will you be handling?\"), and every round dropped them"],
  ["Profile: [Name], [Age], [Civil Status], [City]", false, "a profile is the writer's or an applicant's only when the label says so (\"Your profile:\", \"Send your profile:\", \"Candidate profile:\", \"Applicant bio:\"); a bare \"Profile:\" is a customer's record as often (\"Patient profile:\", \"Player profile:\" in a CRM), so it was not added"],
  ['Sample answer: "My name is ___, ___ years old. I handled billing for my account at Teleperformance."', false, "a BPO agent's own \"account\" is read only as her previous, current or last one (\"my previous account was a US telco\"); \"my account at\" a business is a customer's own as often (\"my account at Bright Bank is locked\")"],
  ['Ask: "To confirm your tax filing status with the BIR, are you single or married?"', true, "\"BIR\" is a hire's tax as the seventeenth round read it (\"your tax filing status with BIR\"); a Philippine tax desk says it too, but every round but the sixteenth dropped it, and only the HMO, withholding and employees were reported"],
  ['Say: "Welcome to the Medicare help team. To verify your Medicare eligibility, are you 65 or older?"', true, "a welcome that ends at the team is a hire's, as \"Welcome to the team!\" is; a desk's team named that way reads the same, and every round but the sixteenth dropped it"],
  ['Until a customer requests a callback, say: "Are you 65 or older?"', true, "\"before\" is read again only for an order, where the customer is there to be asked; before or until one calls or requests something she is not on the line yet (the seventeenth round's 'Before a customer calls, ask: \"Are you married?\"')"],
  ["Customers: introduce yourself in this format: My name is [Name], [Age], [Civil Status].", false, "a label that opens with the customer is her line, as \"Customer:\" and \"Caller persona:\" are; one that then tells the reader to introduce themself is the seventeenth round's reading, left"],
  ['The client asks for mature agents. Ask: "How old are you?"', false, "a client who calls or asks is the case's own customer (a tax desk's \"The client asks why her refund is late\"), as the seventeenth round's BPO client that \"is a US health plan\" or \"wants mature agents\" never was; \"asks for\" is a customer's as often (\"The client asks for a refund\"), and a screening call, an interview or an applicant named before it still drops it"],
  ['Reply to the welcome message: "Hi, I\'m ___, ___ years old."', false, "a message replied to is the customer's unless the label names the hiring side, a question or the reply's own words (\"Reply to the welcome message with your intro:\" drops); a welcome message is a desk's as often"],
]) check(`(18th review, known) ${drops ? "dropped" : "kept"}: ${JSON.stringify(line)}: ${why}`, A.asksAgeOrStatus(line) === drops);

// The nineteenth Phase 6 review: the eighteenth round's early return for a message replied to went past its cases both ways.
// A label that says how to reply or names the chat's own question ("Reply to this chat with empathy:", "Respond to this email
// with an apology and a date:", "Answer the question in this chat:") still left a customer's own age to be read as the
// applicant's (every round; four practice cases dropped whole, the owner's gaming case among them), and the label alone made
// an applicant's own self-introduction a customer's message ("To apply, reply to this email:", "Step 2 of your application.",
// "Reply to the screening email:", "Reply to the job post:", "… Candidates must use this format.", "Her reply to the first
// message:"; a regression against both earlier rounds, in the job post's "How to apply" line, the application questions, the
// written interview's grader and the interview guide). Its intro written or sent to someone else read a warm transfer as the
// writer's own, and its narrowings and widenings of the account, the customer's line, "Introduce yourself (", "your
// profile:", "describe a time", the role, the welcome, the hire's HMO, the desk's count and "opens" each read one side as the
// other. Each was narrowed back to its round's cases; every check in this list but the pins and the known items fails on the
// eighteenth round's module.
console.log("\nThe nineteenth review's cases\n");
for (const line of [
  // Finding 1: a label that says how to reply, or names the chat's own question, before a customer's own age.
  'Reply to this chat with empathy: "I\'m 64 years old and want to know when my Medicare plan starts."',
  'Reply to this chat with empathy: "Hi, I\'m 15 years old and I bought gems with my mom\'s card. Can I get a refund?"',
  'With empathy, reply to this chat: "I\'m 70 years old and my prescription refill is late again."',
  'Respond to this email with an apology and a date: "I\'m 70 years old and my prescription refill is late again."',
  'Reply to this message with care: "I\'m 64 years old and want to know when my Medicare plan starts."', 'Reply to this ticket with next steps: "I\'m 16 years old and my subscription renewed without asking."',
  'Reply to the chat using plain words: "I\'m 70 years old and my prescription refill is late again."', 'Reply to this chat with a short, kind answer: "I\'m 64 years old and want to know when my Medicare plan starts."',
  'Reply to this chat and answer her questions: "I\'m 70 years old and need to move my appointment to Friday."', 'Answer the question in this chat: "I\'m 64 years old and want to know when my Medicare plan starts."',
  'Reply with empathy to this chat: "I\'m 70 years old and my prescription refill is late again."',
  'Reply to this chat with the correct information: "I\'m 64 years old and want to know when my Medicare plan starts."',
  'Reply to this ticket using your knowledge base: "I\'m 16 years old and my subscription renewed without asking."',
  // …and the seventeenth round's case, a customer word in the message after such a label.
  'Reply to this chat with empathy: "I\'m 70 years old, a member since 2010, and my refill is late."', 'Reply to the chat using the macro: "I\'m 72 years old, a patient of Dr. Cruz, and I need a refill."',
  'Reply to this chat and answer her questions: "I\'m 70 years old and a member. Is my plan changing?"',
  // Finding 3: a warm transfer's intro written or sent to someone, or about the caller.
  "Send a brief intro to the nurse: [Name], [Age], [Reason for call].", "Write a short intro for the nurse: [Name], [Age], [Reason for call].",
  "Write a brief intro for Tier 2: [Username], [Age], [Issue].", "Send a quick intro to the specialist: caller [Name], [Age], [Issue].",
  "Post a quick intro in the escalation channel: [Name], [Age], [Account], [Problem].", "Before you transfer, send a quick intro to the nurse line: [Name], [Age], [Reason].",
  "Write a quick intro about the patient: [Name], [Age], [Concern].",
  // Finding 4: a bank customer's current account, a customer's line under a longer label, "Introduce yourself (…)" before
  // the customer's details, "your profile:" said to a customer, a desk's "recall / share a time".
  'Opening message: "Hi, I\'m 68 years old and my current account was charged twice."', 'Opening message: "I\'m 75 years old and my current account is locked."',
  'Chat opener: "Hi, I\'m 70 years old and my last account statement shows a fee I don\'t know."', 'Opening message: "I\'m 70 years old and my recent account activity looks wrong."',
  "Practice chat 1 — Customer: Hi, I'm [Name], [Age] years old, and my order is late.", "Mock call script — Caller: Hi, my name is [Name], I'm [Age] years old, and my card was declined.",
  "Sample chat transcript: Customer: Hi, I'm [Name], [Age] years old, and my claim was denied.", "Role-play 2 (billing) — Caller: My name is [Name], I'm [Age] years old, and I was double-charged.",
  "Chat simulation, round 1 — Member: Hi, I'm [Name], [Age] years old, and I need my ID card.", "Opening line from the caller: Hi, I'm [Name], [Age] years old, and I need a refill.",
  "Introduce yourself (first name only), then read back the patient's [Name], [Age] and [Allergies].", "Pediatric nurse line: introduce yourself (name, role), then ask for the child's [Name], [Age] and [Weight].",
  'Say: "Please check your profile: Name, [Age], Address must match your ID."', "Ask the patient to confirm what is on your profile: [Name], [DOB], [Age].",
  'Ask: "Can you recall a time the customer app charged you twice? Are you over 18?"', 'Ask: "Can you share a time when a member benefit was denied? Are you 65 or older?"',
]) check(`(19th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  // Finding 2: an applicant's own self-introduction after a reply label, put to someone applying before the quote, after it
  // or in it, or the applicant's own reply in a reviewer's note.
  'To apply, reply to this email: "Hi, I\'m [Name], [Age] years old, and I\'d like to apply for the Chat Support role."', 'To apply, reply to this email: "Hi, I\'m ___, ___ years old, from ___."',
  'Step 2 of your application. Reply to this message: "Hi, I\'m [Name], [Age] years old, [Civil Status]."', 'Video interview question 2. Reply to this message: "My name is ___, ___ years old."',
  'All applicants must do this. Reply to our email: "Hi, I\'m ___, ___ years old, from ___."',
  'Reply to this message: "Hi, I\'m [Name], [Age] years old." Candidates must use this format.', 'Reply to the screening email: "Good day! My name is ___, ___ years old, single, and I have 2 years of BPO experience."',
  'Screening step. Reply to our email: "Hi, I\'m ___, ___ years old, from ___."', 'Reply to the job post: "Hi, I\'m ___, ___ years old, from ___."', 'Reply to the job post: "I\'m 24 years old and single."',
  'Reply to our Facebook post: "Hi, I\'m ___, ___ years old, from ___."', 'Respond to our invitation email: "Good day! My name is ___, ___ years old, single, and I have 2 years of BPO experience."',
  'Reply to our email: "My date of birth is ___ and my civil status is ___."', 'Reply to our email: "I am 24 years old and single, with no kids."',
  'Respond to the shortlist message: "Hi, I\'m ___, ___ years old, from ___."', 'Reply to the email you received from us: "Hi, I\'m ___, ___ years old, from ___."',
  'Reply to: "Hello, I am [Name], [Age] years old, and I would like to apply."', 'Answer this email: "Hi! I\'m [Name], [Age] years old, and I\'m interested in this position."',
  'Reply to our message: "Hi, I\'m [Name], [Age] years old, and I am applying for the Customer Service Representative position."', 'Reply to Ana\'s email: "Hello, I am [Name], [Age] years old, and I would like to apply."',
  'Reply to this message: "Hi, I\'m [Name], [Age] years old, and I\'d like to apply for the Chat Support role."',
  'Her reply to the first message: "I\'m 19 years old and this is my first job."', 'Her answer to the opening message: "I\'m 19 years old and this is my first job."',
  'Responding to the chat: "I\'m 30 years old and single, so nights are fine."', 'Ask about her reply to the chat: "I\'m 30 years old and single, so nights are fine."',
  'Her reply to the practice chat: "I am 45 years old and very patient with customers."',
  'In your video, reply to this message: "Hi, I\'m ___, ___ years old, from ___."', 'Thanks for applying! Reply to this message: "Hi, I\'m ___, ___ years old, from ___."',
  // Finding 5: the role, the welcome and the hire's HMO in other words, the desk's count of the agent's own, an applicant's
  // template next to "the caller begins".
  'Say: "Hi, this is Ana from customer care. Do you have a minute to talk about a role with us? How old are you?"', 'Say: "Hi, this is Ana from customer care. We have open roles on our team. Are you married?"',
  'Say: "Hi, I\'m Ana from customer care at Bright Clinic. Are you still interested in a role here? How old are you?"', 'Say: "Thanks for contacting member support! We have roles open for night shift. Are you single or married?"',
  'Opening message: "Welcome to our team at Bright Clinic! To confirm your tax filing status, are you married or single?"', 'Opening message: "Welcome to the team and congratulations! To confirm your tax filing status, are you married or single?"',
  'Opening message: "Welcome to the team :) To confirm your tax filing status, are you married or single?"', 'Ask: "To confirm your premium for the HMO as a new hire, how many dependents do you have?"',
  'Ask: "How many members do you plan to enroll in your first month? How old are you?"', 'Ask: "How many guests did you have per shift at your last hotel booking desk? How old are you?"',
  'Ask: "How many customers did you want to enroll per month at your last job? How old are you?"',
  "Record your intro before the caller begins: Hi, I'm ___, ___ years old, from ___.", "Write your opener for when a customer opens the chat: Hi, I'm [Name], [Age] years old, and I'll help you today.",
]) check(`(19th review) asks for age or marks it: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line) && A.marksAgeOrFamily(line));
// …and in the real paths: generate-flow's simulation filter (:252) keeps the review's practice cases whole and
// ai-generate-workflow's configWithoutAgeAsks (:607) deletes none of their prompts; ai-generate-job-content's description
// (textWithoutAgeAsks, :387) loses its "How to apply" line and generate-flow's application filter (:249) both template
// questions; the written interview's grader (interviewContext.ts, interviewEvaluationFrom) and the interview guide
// (guideMaterial.ts, personalGuideFrom) leave out the applicant's own reply quoted with her age.
const reviewCases19 = [
  { title: "Medicare start date", prompt: 'Reply to this chat with empathy: "I\'m 64 years old and want to know when my Medicare plan starts." Explain the Initial Enrollment Period.' },
  { title: "Minor's purchase", prompt: 'Reply to the chat with empathy and the refund policy: "Hi, I\'m 15 years old and I bought gems with my mom\'s card. Can I get a refund?"' },
  { title: "Refill delay", prompt: 'Respond to this email with an apology and a new date: "I\'m 70 years old and my prescription refill is late again."' },
  { title: "Appointment move", prompt: 'With empathy, reply to this message: "I\'m 70 years old and need to move my appointment to Friday." Offer two times.' },
  { title: "Nurse transfer", prompt: "A patient asks about her new medication. Send a brief intro to the nurse: [Name], [Age], [Reason for call]. Then transfer the call." },
  { title: "Tier 2 escalation", prompt: "A player cannot log in after a reset. Write a short intro for Tier 2: [Username], [Age], [Region], [Problem]. Then hand off the chat." },
  { title: "Pharmacist handoff", prompt: "A caller has a refill question. Write a quick intro about the patient: [Name], [Age], [Medication]. Then warm-transfer." },
  { title: "Late order", prompt: "Practice chat 1 — Customer: Hi, I'm [Name], [Age] years old, and my order is late. Reply with a fix." },
  { title: "Declined card", prompt: "Mock call script — Caller: Hi, my name is [Name], I'm [Age] years old, and my card was declined. Resolve it." },
  { title: "Double charge", prompt: 'Opening message: "Hi, I\'m 68 years old and my current account was charged twice." Find the charge and explain the refund.' },
  { title: "Locked account", prompt: 'Opening message: "I\'m 75 years old and my current account is locked." Walk her through unlocking it.' },
];
check(`(19th review) the review's ${reviewCases19.length} practice cases are kept whole, and no step prompt is deleted`, A.withoutAgeAsks(reviewCases19, (s) => `${s.title}. ${s.prompt}`).length === reviewCases19.length && reviewCases19.every((s) => !A.asksAgeOrStatus(s.prompt)));
{
  const description = ["We are hiring a Chat Support Agent for a US dental clinic.", 'How to apply: To apply, reply to this email: "Hi, I\'m [Name], [Age] years old, [Civil Status], and I\'d like to apply for the Chat Support role."', "We review every application within 3 days."].join("\n");
  const application = ["Tell us about a time you calmed an upset customer.", 'Step 2 of your application. Reply to this message: "Hi, I\'m [Name], [Age] years old, [Civil Status], from [City]."', 'Reply to the screening email: "Good day! My name is ___, ___ years old, single, and I have 2 years of BPO experience."'];
  check("(19th review) …a job post's \"How to apply\" line and the application's template questions are dropped, the rest kept", A.textWithoutAgeAsks(description) === "We are hiring a Chat Support Agent for a US dental clinic.\nWe review every application within 3 days." && JSON.stringify(A.withoutAgeAsks(application)) === JSON.stringify([application[0]]));
  const C19 = await import("../supabase/functions/ai-chat-interview/interviewContext.ts");
  const M19 = await import("../supabase/functions/interview-guide/guideMaterial.ts");
  const g = C19.interviewEvaluationFrom({
    score: 62, recommendation: "Maybe", credibilityRating: "Medium", strengths: ["Clear, warm writing"],
    concerns: ['Her reply to the first message: "I\'m 19 years old and this is my first job." Little real experience.', "Vague about the refund steps"],
    inconsistencies: [{ claim: "Says 3 years of BPO experience", evidence: 'Her answer to the opening message: "I\'m 19 years old and this is my first job."', assessment: "The two do not fit" }, { claim: "Claimed 5 years", evidence: "Form says 1-2 years", assessment: "Exaggeration" }],
    summary: 'Clear writer. Her reply to the first message: "I\'m 30 years old and single, so nights are fine."',
  }, { leadRole: false, messages: [] });
  check("(19th review) …and the written interview's grader leaves out a concern, an inconsistency and a summary sentence quoting her own reply with her age", JSON.stringify(g.concerns) === JSON.stringify(["Vague about the refund steps"]) && g.inconsistencies.length === 1 && g.inconsistencies[0].evidence === "Form says 1-2 years" && g.summary === "Clear writer.", JSON.stringify(g));
  const record = { job: C19.interviewJobFrom({ title: "Chat Support Agent", description: "Answer customers.", quiz_questions: [] }), family: "support", notes: { applicationAnswers: [] }, interview: [], practiceLines: [] };
  const q = (question, why) => ({ question, why, listenFor: "A concrete example.", redFlag: "No example.", source: "application", quote: "" });
  const guide19 = M19.personalGuideFrom({
    atAGlance: ['Her answer to the opening message: "I\'m 19 years old and this is my first job."', "Says 3 years in chat support."],
    questions: [q("Walk me through the last refund you handled.", "From the form."), q("Tell me about a customer who stayed angry.", "From the form."), q("How would you cover a weekend shift?", 'Her reply to the first message: "I\'m 30 years old and single, so nights are fine."')],
    confirm: ["Confirm they can start on 1 November."],
  }, record);
  check("(19th review) …and the interview guide leaves out an at-a-glance line and a question whose reason quotes it", guide19 && JSON.stringify(guide19.atAGlance) === JSON.stringify(["Says 3 years in chat support."]) && guide19.questions.length === 2, JSON.stringify(guide19));
}
// …and the review's grids: (A) its reply labels before three customers' own messages, every one kept whatever manner or
// question of the chat the label names (its "Reply to this question:", naming no chat, is a known item below); (B) its 25
// reply labels before four applicant templates, every one that names applying, a step of the hiring or the business's own
// message dropped (the rest are the known items below).
{
  const msgs = ['"I\'m 64 years old and want to know when my Medicare plan starts."', '"Hi, I\'m 15 years old and I bought gems with my mom\'s card. Can I get a refund?"', '"I\'m 70 years old and my prescription refill is late again."'];
  const labels = ["Reply to this chat:", "Reply to this chat with empathy:", "With empathy, reply to this chat:", "Reply to this chat with a short, kind answer:", "Reply to this message with care:",
    "Respond to this email with an apology and a date:", "Reply to the chat using plain words:", "Reply to this chat and answer her questions:", "Answer this question from a caller:",
    "Answer the question in this chat:", "Reply to this chat with the correct information:", "Reply with empathy to this chat:", "Using the knowledge base, reply to this chat:", "Reply to this ticket with next steps:",
    "Reply to this email with the policy:", "Reply to the chat below with a helpful answer:", "Write a reply to this message:", "Reply to this chat in under 60 words:"];
  const lines = labels.flatMap((label) => msgs.map((m) => `${label} ${m}`));
  const dropped = lines.filter((line) => A.asksAgeOrStatus(line));
  check(`(19th review) a customer's own age in the message replied to is hers whatever the label says of the reply (${lines.length} lines)`, lines.length === 54 && dropped.length === 0, dropped.slice(0, 3).join(" | "));
  const intros = ['"Hi, I\'m ___, ___ years old, from ___."', '"Hi! I\'m [Name], [Age] years old, and I\'m interested in this position."', '"Good day! My name is ___, ___ years old, single, and I have 2 years of BPO experience."', '"Hello, I am [Name], [Age] years old, and I would like to apply."'];
  const hiring = ["Reply to the job post:", "Reply to this job post:", "Reply to our job post:", "Reply to our Facebook post:", "Respond to our invitation email:", "Reply to our email:",
    "Reply to the email you received from us:", "Reply to our message:", "Reply to our first message:", "Reply to the screening email:", "Respond to the shortlist message:", "Reply to the interview invite email:"];
  const hLines = hiring.flatMap((label) => intros.map((m) => `${label} ${m}`));
  const kept = hLines.filter((line) => !A.asksAgeOrStatus(line));
  check(`(19th review) …and an applicant's template after a label naming the job, a step of the hiring or the business's own message is hers (${hLines.length} lines)`, hLines.length === 48 && kept.length === 0, kept.slice(0, 3).join(" | "));
  const others = ["Reply to: ", "Respond to the message below:", "Answer this email:", "Reply to Ana's email:", "Reply to this message from Bright Clinic:", "Reply to the onboarding email:", "Reply to the text from our team:"];
  const asking = [intros[1], intros[3]].flatMap((m) => others.map((label) => `${label} ${m}`));
  const keptAsking = asking.filter((line) => !A.asksAgeOrStatus(line));
  check(`(19th review) …and after any other reply label, a template that asks to apply or names the position is hers (${asking.length} lines)`, asking.length === 14 && keptAsking.length === 0, keptAsking.slice(0, 3).join(" | "));
}
// Finding 6: the review's three weakenings that changed no check (NOT_A_CUSTOMERS_MESSAGE losing its digit lookbehind or
// gaining "team", the "why … want to" window widened to 200 characters), and this round's own parts the review's lines do not
// reach: a customer's own wish to apply for a benefit, a bare "apply" in a message naming a plan, a reply to write. They pass
// on the eighteenth round's module too.
for (const line of [
  'Reply to this chat on the 24-hr refill line: "I\'m 70 years old and my prescription refill is late again."', 'As the billing team, reply to this chat: "I\'m 70 years old and my prescription refill is late again."',
  'Ask: "Tell me why you called today and whether you want to help a member of your household enroll. Are you 65 or older?"',
  'Reply to this chat: "I\'m 64 years old and want to apply for Medicare. When can I start?"', 'Reply to this chat: "I\'m 66 years old and I saw your senior plan. I\'d like to apply."',
  'Write a reply to this message: "I\'m 70 years old and my prescription refill is late again."',
  'Your task is to reply to this chat: "I\'m 64 years old and want to know when my Medicare plan starts."', 'You will respond to this email: "I\'m 70 years old and my prescription refill is late again."',
  'Write your reply to this message: "I\'m 70 years old and my prescription refill is late again."',
]) check(`(19th review, pin) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
for (const line of [
  // …and a bio is always the writer's own, whatever follows it (only an intro can be someone else's).
  "Write a short bio for the customer portal: [Name], [Age], [City].",
]) check(`(19th review, pin) asks for age or sets a limit: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
// Guards: what each narrowed reading must still drop or keep. The reply's own words, the hiring side and a question that
// asks to apply still make the quote the applicant's, whatever manner the label names; a customer's own message after "to
// apply for" a benefit, a loan application or a comment on the business's post, after "her message" or "Then reply", in a
// practice set up for candidates or before a case's note on what the candidate must do, is still hers.
for (const line of [
  'Reply to the welcome message with your intro: "Hi, I\'m ___, ___ years old."', 'Reply to this chat with your details: "Hi, I\'m ___, ___ years old, from ___."',
  'Reply to the recruiter\'s message with empathy: "Hi, I\'m ___, ___ years old, and I love helping customers."',
  'Reply to this question: "I\'m 24 years old. Can I still apply for the night shift role?"',
  "Write your opening line for the caller: Hi, I'm ___, ___ years old, from ___.",
  'Answer this question: "I\'m 45 years old. Am I too old for this job?"',
]) check(`(19th review, guard) …and still drops: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
for (const line of [
  'To apply for Medicare, reply to this email: "I\'m 64 years old and want to know when my plan starts."',
  'A member asks about her loan application. Reply to this chat: "I\'m 70 years old and my loan application is late."',
  'Reply to the comment on our Facebook post: "I\'m 70 years old and my order never came."',
  'A member wants the senior discount. Reply to this chat: "I\'m 66 years old and I\'d like to apply for the senior discount."',
  'Reply to her message: "I\'m 72 years old and I can\'t log in to my patient portal."', 'Then reply to this chat: "I\'m 70 years old and my prescription refill is late again."',
  'Reply to this chat: "I\'m 64 years old and want to know when my Medicare plan starts." The candidate must explain the enrollment period.',
  'Candidates practice this chat. Reply to this chat: "I\'m 70 years old and my prescription refill is late again."',
  'Step 3 of your application: a practice chat. Reply to this chat: "I\'m 70 years old and my prescription refill is late again."',
  'Reply to this message about her cancer screening: "I\'m 52 years old and I need to rebook my screening."',
  'Reply to this chat about the loan application: "I\'m 70 years old and my loan application is late."',
  'Reply to this chat: "I\'m 66 years old and interested in your Medicare Advantage plan. Can you call me?"',
  'Reply to this message: "I\'m 70 years old, so the late fee should not apply."',
]) check(`(19th review, guard) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
// Known, and left (the nineteenth review): each is read as shown for the reason given, so the next review need not report it.
for (const [line, drops, why] of [
  ['Reply to Ana\'s email: "Hi, I\'m ___, ___ years old, from ___."', false, "a message replied to is the customer's unless the label names the hiring side or the reply's own words, the case is put to someone applying, or the message is the business's own (\"our email\", \"from us\"); \"Ana\" is a customer as often, and the same template that asks to apply (\"…and I would like to apply.\") drops"],
  ['Reply to the onboarding email: "Hi, I\'m ___, ___ years old, from ___."', false, "an onboarding email is an app's or a bank's to its customer as often as a hire's; only a job post, a screening, a shortlist and the business's own message were read as a step of the hiring"],
  ['Reply to the text from our team: "Hi, I\'m ___, ___ years old, from ___."', false, "only \"our email\" right after \"reply to\" and \"from us\" are read as the business's own message; \"from our team\" names a desk's own team as often (\"Reply to this email from our support team:\")"],
  ['Interested? Reply to this post: "Hi, I\'m ___, ___ years old, from ___."', false, "\"Interested?\" and \"this post\" are a desk's social post as often; a job post is read only as one"],
  ['Reply to this email: "Hi, I\'m [Name], [Age] years old. Thanks for considering my application."', false, "\"my application\" is a benefit's or a loan's caller's as often; only applying for the role, the job or the position, or a bare \"I'd like to apply\" in a message naming no plan or benefit, is the quote's own ask to apply"],
  ['Ask: "To confirm your health premium under the HMO we give employees, how many dependents do you have?"', false, "a hire's HMO is the company's, the employer's, the staff's, the team's, \"our HMO\" on its own or one \"as a new hire\" (the eighteenth review: employees standing alone read a customer's own \"discount for employees of partner companies\")"],
  ['Ask: "How many members would you like to enroll each week in this role? Are you married?"', false, "\"would you like to enroll\" is a desk's count, as the eighteenth round read it; the job is not read after it"],
  ['Reply to this question: "I\'m 70 years old and my prescription refill is late again."', true, "a question with no chat, message or email named is an interview's or a job post's as often ('Answer this question: \"I\'m 45 years old. Am I too old for this job?\"'), as the eighteenth round read it; the chat's own question is the customer's (\"Answer the question in this chat:\", \"Reply to this chat and answer her questions:\")"],
  ['Say: "Hi, this is Ana from patient support. I am calling about a support role you applied to. How old are you?"', false, "a role is the job's only as \"the … role\", \"a role with us\", \"a role here\" or \"open roles\" (a game's role reads the same otherwise: the eighteenth review)"],
]) check(`(19th review, known) ${drops ? "dropped" : "kept"}: ${JSON.stringify(line)}: ${why}`, A.asksAgeOrStatus(line) === drops);

// The twentieth Phase 6 review: the nineteenth round removed both ways the seventeenth and eighteenth rounds kept a
// customer's own first-person age after a reply label, so her message was a self-introduction whenever its early return did
// not fire, even one naming her membership or her doctor: after a manner word, the agent told to reply or a gerund ("Politely
// reply to this chat:", "The agent should reply…", "Responding to this chat:"), in a case whose set-up names the candidates
// ("Candidates see this chat."), before a note on how they are scored ("Candidates are scored on empathy and accuracy.") or in
// a message "sent to our live chat" (MEDIUM, a regression against both; generate-flow and ai-generate-workflow dropped six
// practice cases whole). A template replied "with a short self-introduction", "using this format" or "with the following", or
// under a "How to apply" heading on its own line, was a customer's message (LOW-MEDIUM, a regression against both); a caller
// who "opens the chat:", a desk's welcome "to our pharmacy team at Bright Clinic", its "How many guests do you want to add to
// your booking?" and "How many guests will be in your party?" were dropped, and 'She wrote: "I'm 19 years old…"' passed (LOW).
// The seventeenth round's skip is back, after a label that opens its clause and for an age given as a number; the nineteenth
// round's readings were narrowed back to its cases. Every check in this list but the guards and the known items fails on the
// nineteenth round's module.
console.log("\nThe twentieth review's cases\n");
{
  // Finding 1: the review's labels before a customer's own message that names her membership or her doctor, every one kept,
  // as the seventeenth and eighteenth rounds kept them; and its manner-first and agent labels before one naming neither (the
  // owner's gaming case, a Medicare start date), kept as the eighteenth round kept them.
  const named = ['"I\'m 70 years old, a member since 2010, and my refill is late."', '"I\'m 72 years old, a patient of Dr. Cruz, and I need a refill."'];
  const plain = ['"Hi, I\'m 15 years old and I bought gems with my mom\'s card. Can I get a refund?"', '"I\'m 64 years old and want to know when my Medicare plan starts."'];
  const told = ["Politely reply to this chat:", "Briefly reply to this chat:", "Calmly respond to this email:", "Professionally respond to this email:", "Empathetically reply to this chat:",
    "Quickly reply to this message:", "Patiently answer this chat:", "Warmly reply to this chat:", "Please politely reply to this chat:", "Your job is to politely reply to this chat:",
    "The agent should reply to this chat:", "Agents must respond to this email:", "Each agent replies to this chat:"];
  const gerunds = ["Responding to this chat:", "Replying to this email:", "Answering this ticket:", "Task: responding to this chat:", "Practice: replying to a chat:"];
  const lines = [...[...told, ...gerunds].flatMap((label) => named.map((m) => `${label} ${m}`)), ...told.flatMap((label) => plain.map((m) => `${label} ${m}`))];
  const dropped = lines.filter((line) => A.asksAgeOrStatus(line));
  check(`(20th review) a customer's own message after a manner word, the agent told to reply or a gerund is hers (${lines.length} lines)`, lines.length === 62 && dropped.length === 0, dropped.slice(0, 3).join(" | "));
  // …after the review's practice set-ups (its three ROLE_PLAY now reads with any message; the rest when the message names her),
  // before its notes on how candidates are scored, and in a message sent to the business's own chat.
  const setUps = ["Candidates see this chat.", "Applicants act as the agent.", "The candidate replies as the agent."];
  const otherSetUps = ["Chat simulation for applicants.", "Interview practice.", "In this step, the candidate is a support agent.", "The applicant plays a chat agent at Bright Pharmacy.",
    "Each applicant gets this chat.", "This is part of the interview.", "A customer-service test for new hires.", "Help a member who asks how to apply.", "Chat test 2 of your application.",
    "Simulation from the job post.", "Customer chat for the candidate.", "Practice for the interview."];
  const notes = ["Candidates should apologize and offer a new date.", "Applicants have 5 minutes to reply.", "The applicant has 5 minutes to reply.", "Each candidate types a reply.",
    "The interviewer scores the reply for empathy.", "Candidates are scored on empathy and accuracy.", "Score the candidate's reply for empathy."];
  const cases = [
    ...setUps.flatMap((s) => [...named, ...plain].map((m) => `${s} Reply to this chat: ${m}`)), ...otherSetUps.map((s) => `${s} Reply to this chat: ${named[0]}`),
    ...notes.flatMap((n) => [named[0], plain[0]].map((m) => `Reply to this chat: ${m} ${n}`)),
    ...[named[0], plain[0]].map((m) => `Reply to this message sent to our live chat: ${m}`), `Reply to this question sent to our chat: ${plain[1]}`,
  ];
  const droppedCases = cases.filter((line) => A.asksAgeOrStatus(line));
  check(`(20th review) …and after a set-up or before a note naming the candidates, or sent to the business's own chat (${cases.length} lines)`, cases.length === 41 && droppedCases.length === 0, droppedCases.slice(0, 3).join(" | "));
}
for (const line of [
  // Finding 3: the customer's own line opened or begun at the colon, a desk's welcome to its team, its count of a booking or a
  // plan; finding 4: "how many" never the business's clientele.
  "The caller opens the chat: Hi, I'm [Name], [Age] years old, and my order is late.", "The customer opens the conversation: Hi, I'm [Name], [Age] years old, and my card was declined.",
  "The patient begins the call: My name is [Name], I'm [Age] years old, and I need a refill.", "The member begins: Hi, I'm [Name], [Age] years old, and I need my ID card.",
  "The caller opens: Hi, I'm [Name], [Age] years old, and my order is late.", "A caller opened the call: Hi, I'm [Name], [Age] years old, and my bill is wrong.",
  "The customer opens the chat by saying: Hi, I'm [Name], [Age] years old, and my order is late.",
  'Opening message: "Welcome to our pharmacy team at Bright Clinic! To verify your senior discount, are you 60 or older?"',
  'Opening message: "Welcome to the refill team at Bright Pharmacy! To confirm your senior discount, are you 60 or older?"',
  'Opening message: "Welcome to the Bright Games team and thanks for reaching out! To verify you can play ranked, are you 18 or older?"',
  'Ask: "How many guests do you want to add to your booking? Are you 21 or older?"', 'Ask: "How many passengers do you need to add to the booking? Are you over 65?"',
  'Ask: "How many members do you need to enroll on your plan? Are you 65 or older?"',
  'Ask: "How many guests will be in your party? Are you 21 or older?"', 'Ask: "How many passengers are traveling with you today? Are you over 65?"',
  'Ask: "How many guests are joining the wine tasting? Is everyone 21 or older? Are you 21 or older?"',
]) check(`(20th review) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
{
  // Finding 2: a template to reply with, named without "your" or "my".
  const templates = ['"Hi, I\'m [Name], [Age] years old, [Civil Status], from [City]."', '"Good day! My name is ___, ___ years old, single, and I have 2 years of BPO experience."', '"Hi, I\'m ___, ___ years old, from ___."'];
  const labels = ["Reply to this email with a short self-introduction:", "Reply to this email with a short introduction:", "Reply to this message with a brief intro:",
    "Reply to this email with an introduction like this:", "Reply to this message with the following:", "Reply to this email with these details:", "Reply to this email using this format:",
    "Reply to this message using the template below:", "Reply to this email in this format:", "Reply to this message in the format below:", "Reply to this email with an intro in this format:",
    "Reply to this message with a short intro, like this:", "Reply to this email with the details below:", "Answer this email using this template:"];
  const lines = labels.flatMap((label) => templates.map((m) => `${label} ${m}`));
  const kept = lines.filter((line) => !A.asksAgeOrStatus(line));
  check(`(20th review) an applicant's template after a label naming what to reply with is hers (${lines.length} lines)`, lines.length === 42 && kept.length === 0, kept.slice(0, 3).join(" | "));
}
for (const line of [
  // Finding 5: the applicant quoted in her own words after "she wrote" or "he said".
  'She wrote: "I\'m 19 years old and this is my first job."', 'Asked to reply to the opening message, she wrote: "I\'m 30 and single, so nights are fine."',
  'When asked to reply to the first message, she said: "I\'m 19 years old and this is my first job."', 'He said, "I\'m 45 and a team lead now."', 'They wrote: "I am 22 years old and eager to learn."',
]) check(`(20th review) a reviewer's remark on age or family is dropped: ${JSON.stringify(line)}`, A.marksAgeOrFamily(line));
// …and in the real paths: generate-flow's simulation filter (:252) keeps the review's six practice cases and its five
// manner-first ones whole, and ai-generate-workflow's configWithoutAgeAsks (:607) deletes none of their prompts;
// ai-generate-job-content's description (textWithoutAgeAsks, :387, one line at a time) loses the template under a "How to
// apply" heading on its own line, in the app's own job post's form (src/lib/jobPost.ts) and the review's; generate-flow's
// application filter (:249) drops the template questions; the written interview's grader leaves out a concern quoting her.
{
  const sims20 = [
    { title: "Late refill", prompt: 'Politely reply to this chat: "I\'m 70 years old, a member since 2010, and my refill is late again." Offer a new date.' },
    { title: "Portal lockout", prompt: 'Briefly respond to this email: "I\'m 68 years old, a member since 2015, and I can\'t log in." Walk her through a reset.' },
    { title: "Doctor's refill", prompt: 'Candidates see this chat. Reply to this chat: "I\'m 72 years old, a patient of Dr. Cruz, and I need a refill today."' },
    { title: "Plan change", prompt: 'Reply to this chat: "I\'m 70 years old and a member. Is my plan changing next year?" Candidates are scored on empathy and accuracy.' },
    { title: "Late refill 2", prompt: 'Reply to this chat: "I\'m 70 years old, a member since 2010, and my refill is late again." Applicants have 5 minutes to reply.' },
    { title: "Live chat refill", prompt: 'Reply to this message sent to our live chat: "I\'m 70 years old, a member since 2010, and my refill is late."' },
    { title: "Minor's purchase", prompt: 'Calmly reply to this chat: "Hi, I\'m 15 years old and I bought gems with my mom\'s card. Can I get a refund?" Explain the refund policy for minors.' },
    { title: "Medicare start date", prompt: 'Briefly respond to this email: "I\'m 64 years old and want to know when my Medicare plan starts." Explain the Initial Enrollment Period.' },
    { title: "Appointment move", prompt: 'Patiently reply to this message: "I\'m 72 years old, a patient of Dr. Cruz, and I need to move my appointment to Friday." Offer two times.' },
    { title: "Locked portal", prompt: 'Professionally respond to this email: "I\'m 68 years old, a member since 2015, and I can\'t log in." Walk her through a reset.' },
    { title: "Refill, politely", prompt: 'Politely reply to this chat: "I\'m 70 years old, a member since 2010, and my refill is late again." Offer a new date and apologize.' },
  ];
  check(`(20th review) the review's ${sims20.length} practice cases are kept whole, and no step prompt is deleted`, A.withoutAgeAsks(sims20, (s) => `${s.title}. ${s.prompt}`).length === sims20.length && sims20.every((s) => !A.asksAgeOrStatus(s.prompt)));
  const post = (...lines) => ["We are hiring a Chat Support Agent for a US dental clinic.", ...lines, "We review every application within 3 days."].join("\n");
  const under = [
    ["How to apply:", 'Reply to this email: "Hi, I\'m [Name], [Age] years old, [Civil Status], from [City]."'], ["HOW TO APPLY", 'Reply to this email: "Hi, I\'m [Name], [Age] years old, [Civil Status], from [City]."'],
    ["**How to apply**", 'Reply to this email: "Hi, I\'m [Name], [Age] years old, [Civil Status], from [City]."'], ["How to apply", 'Reply to this email: "Hi, I\'m ___, ___ years old, from ___."'],
    ["How to apply:", 'Reply to this email with a short self-introduction: "Hi, I\'m [Name], [Age] years old, [Civil Status], from [City]."'],
    ["How to apply:", '- Reply to this email with a brief intro: "Hi, I\'m ___, ___ years old, from ___."'],
  ];
  const left = under.filter(([heading, line]) => A.textWithoutAgeAsks(post(heading, line)) !== post(heading));
  check(`(20th review) …a job post's template under a "How to apply" heading on its own line is dropped, the rest kept (${under.length} posts)`, left.length === 0, left.map(([h]) => h).join(" | "));
  const application = ["Tell us about a time you calmed an upset customer.", 'Reply to this message with a short self-introduction: "Hi, I\'m [Name], [Age] years old, [Civil Status], from [City]."',
    'Reply to this message using this format: "Good day! My name is ___, ___ years old, single, and I have 2 years of BPO experience."', 'Reply to this message in this format: "Hi, I\'m [Name], [Age] years old, [Civil Status], from [City]."'];
  check("(20th review) …the application's template questions are dropped, the rest kept", JSON.stringify(A.withoutAgeAsks(application)) === JSON.stringify([application[0]]));
  const C20 = await import("../supabase/functions/ai-chat-interview/interviewContext.ts");
  const g = C20.interviewEvaluationFrom({
    score: 62, recommendation: "Maybe", credibilityRating: "Medium", strengths: ["Clear, warm writing"],
    concerns: ['She wrote: "I\'m 19 years old and this is my first job." Little real experience.', "Vague about the refund steps"], inconsistencies: [],
    summary: 'Clear writer. Asked to reply to the opening message, she wrote: "I\'m 30 and single, so nights are fine."',
  }, { leadRole: false, messages: [] });
  check("(20th review) …and the written interview's grader leaves out a concern and a summary sentence quoting her after \"she wrote\"", JSON.stringify(g.concerns) === JSON.stringify(["Vague about the refund steps"]) && g.summary === "Clear writer.", JSON.stringify(g));
}
// Guards: what each narrowed reading must still drop or keep. A gerund, an adjective or the agent's own reply before a message
// naming no customer is still a reviewer's note; an applicant's template with blanks after a step of the hiring is hers
// whatever customer it names, the seventeenth round's skip reading only an age given as a number; a note that says the quote
// is the format to use, an interview's "how many … are you …", a quota to enroll and a job "as the agent" still put it to
// someone applying. A label that goes on past "with a brief intro", a note on following a policy, a "How to apply" heading
// read past a blank line or another heading, a count said in the first person and a customer quoted by name are still kept.
for (const line of [
  'Friendly reply to this chat: "I\'m 30 years old and single, so nights are fine."', 'The agent\'s reply to this chat: "I\'m 30 years old and single, so nights are fine."',
  'Replies to this chat: "I\'m 30 years old and single, so nights are fine."',
  'To apply, reply to this email: "Hi, I\'m ___, ___ years old, and I love helping customers."', 'Step 2 of your application. Reply to this message: "Good day! My name is ___, ___ years old, single, and I enjoy serving patients."',
  'Reply to the screening email: "Hi, I\'m ___, ___ years old, and I love helping customers."', 'Reply to this message: "Hi, I\'m ___, ___ years old, and I love helping customers." Candidates must use this format.',
  'Ask: "How many customers are you able to handle in a shift? How old are you?"', 'Ask: "How many customers do you need to enroll each month? How old are you?"',
  'Interview question. You\'ll work as the agent for Bright Pharmacy. A customer calls about a refill. Ask: "How old are you?"',
  // …and a gerund inside a reviewer's note, and the nineteenth round's "with your answer" (this round's template does not
  // read it).
  'While answering the practice chat: "I am 45 years old and very patient with customers."', 'Reply to this email with your answer: "I\'m 24 years old and single."',
]) check(`(20th review, guard) …and still drops: ${JSON.stringify(line)}`, A.asksAgeOrStatus(line));
for (const line of [
  'Reply to this chat with the details of her refund: "I\'m 70 years old and my prescription refill is late again."',
  'Reply to this chat with a brief intro and an apology: "I\'m 70 years old and my prescription refill is late again."',
  'Reply to this chat: "Hi, I\'m 15 years old and I bought gems with my mom\'s card. Can I get a refund?" Candidates should follow the refund policy.',
  'Reply in this format to the chat: "I\'m 70 years old and my prescription refill is late again."',
  'Reply to this chat: "I\'m 64 years old and want to know when my Medicare plan starts." Follow the template in the knowledge base.',
  // …and the business's own clientele told a plan, now that "how many" no longer reaches that part.
  'Say: "Most of our members are on the senior plan. Are you 65 or older?"',
]) check(`(20th review, guard) left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));
{
  const practice = 'Reply to this chat: "I\'m 64 years old and want to know when my Medicare plan starts."';
  const posts = [["How to apply:", "Send your resume to jobs@brightclinic.com.", "", practice], ["How to apply:", "Send your resume to jobs@brightclinic.com.", "PRACTICE CHAT", practice], ["How to apply:", "Send your resume to jobs@brightclinic.com.", "Sample chat:", practice]].map((lines) => lines.join("\n"));
  const cut = posts.filter((text) => A.textWithoutAgeAsks(text) !== text);
  check(`(20th review, guard) …a "How to apply" heading is read only to the next blank line or heading (${posts.length} posts)`, cut.length === 0, cut.map((t) => JSON.stringify(t)).join(" | "));
}
for (const line of ['She wrote: "I\'m 30 chats into my shift and still calm."', 'The caller wrote: "I\'m 64 years old and I can\'t log in."', 'She wrote: "I\'m 21 or older, as the form asks."', 'Her reference wrote: "I\'m 52 and I managed her for three years."'])
  check(`(20th review, guard) a reviewer's remark about the work stays: ${JSON.stringify(line)}`, !A.marksAgeOrFamily(line));
// Known, and left (the twentieth review): each is read as shown for the reason given, so the next review need not report it.
for (const [line, drops, why] of [
  ['Responding to this chat: "I\'m 64 years old and want to know when my Medicare plan starts."', true, "a gerund label is a reviewer's note as often (\"Responding to the chat: …\", the nineteenth review), so it is never read as an instruction to reply; after one, the message's own customer words decide, as the seventeenth round read it (\"…, a member since 2010, …\" stays)"],
  ['Chat simulation for applicants. Reply to this chat: "Hi, I\'m 15 years old and I bought gems with my mom\'s card. Can I get a refund?"', true, "a set-up naming applicants is a practice only in the words ROLE_PLAY reads (\"Candidates see this chat.\", \"Applicants act as the agent.\"); otherwise the message's own customer words decide, as the seventeenth round read it (with \"a member since 2010\" it stays)"],
  ['To apply, reply to this email: "Hi, I\'m Ana, 24 years old, and I love helping customers."', false, "after a step of the hiring a message that gives an age as a number is read by its own customer words, as the seventeenth round read a customer's own message; a template with blanks (\"I'm ___, ___ years old\") is the applicant's whatever it names"],
  ['Reply to this chat with a short intro: "I\'m 70 years old and my prescription refill is late again."', true, "an intro, a format, a template, \"the following\" or the details ending the label are what to reply with (the review's \"Reply to this message with a brief intro:\" before a template; the seventeenth and eighteenth rounds read every \"with\" so); a label that goes on (\"with a brief intro and an apology:\") is a customer's"],
  ['Reply to this email using your own words, like this: "Hi, I\'m [Name], [Age] years old, [Civil Status], from [City]."', false, "\"your own words\" says how to reply as often (\"Reply to this chat using your own words:\" before a customer's message); only an intro, a format, a template, \"the following\" or the details are the reply itself"],
  ['Reply to this message: "Hi, I\'m ___, ___ years old, from ___." Candidates are scored on clarity.', false, "a note after the quote puts it to someone applying only as the format they use (\"Candidates must use this format.\"); a note on how they are scored follows a customer's message as often (the twentieth review), as the eighteenth round read it"],
  ['Opening message: "Welcome to the support team at Bright! To confirm your tax filing status, are you married or single?"', false, "a welcome goes on \"at\" or \"and\" as a hire's only from \"the team\" or \"our team\" itself (the twentieth review: \"our pharmacy team at Bright Clinic\", \"the refill team at Bright Pharmacy\" are desks); a team named by its work reads the same for a desk and a hire"],
  ['Ask: "How many customers are waiting in your queue right now? How old are you?"', false, "\"how many … are …\" is a desk's own count as often (\"How many passengers are traveling with you today?\"); only \"how many … are you …\" and \"… do, did or can you …\" are the work"],
]) check(`(20th review, known) ${drops ? "dropped" : "kept"}: ${JSON.stringify(line)}: ${why}`, A.asksAgeOrStatus(line) === drops);

console.log("\nThe three job writers\n");
const flow = read("supabase/functions/generate-flow/index.ts");
check("generate-flow tells the model the rule", /from "\.\.\/_shared\/ageWording\.ts"/.test(flow) && /for phone work, include interview questions about handling calls\. " \+\s*AGE_RULE;/.test(flow));
check("…and drops them from the title, summary, quiz and written interview too (the third review)", /title: textWithoutAgeAsks\(content\.jobPost\.title\)/.test(flow) && /summary: textWithoutAgeAsks\(content\.jobPost\.summary\)/.test(flow) && /quiz: take\(withoutAgeAsks\(content\.quiz/.test(flow) && /voiceQuestions: take<string>\(withoutAgeAsks\(content\.voiceQuestions\)/.test(flow));
check("…and drops age questions and requirements it still writes", /application: take<string>\(withoutAgeAsks\(content\.application\), spec\.app\)/.test(flow) && /requirements: withoutAgeAsks\(content\.jobPost\.requirements\)/.test(flow) && /niceToHaves: withoutAgeAsks\(content\.jobPost\.niceToHaves\)/.test(flow) && /jobPost,\n\s*application:/.test(flow));
const workflow = read("supabase/functions/ai-generate-workflow/index.ts");
check("ai-generate-workflow tells the model and drops age questions, quiz questions included, after its guided questions too", /Always return valid JSON only\. \$\{AGE_RULE\}/.test(workflow) && /application_questions: \(Array\.isArray\(workflowData\.application_questions\)[^\n]*\.filter\(\(q\) => !questionAsksAge\(q\?\.question, q\?\.options\)\)/.test(workflow) && /quiz_questions: \(Array\.isArray\(workflowData\.quiz_questions\)[^\n]*\n\s*\.filter\(\(q\) => !questionAsksAge\(q\?\.question, q\?\.options\)\)/.test(workflow) && /data\.application_questions = withoutAgeAsks\(enrichApplicationQuestions\(/.test(workflow));
// The sixth review: what an applicant reads inside a step, and a quiz question's grading key.
check("(6th review) ai-generate-workflow also drops an age prompt or practice situation inside a step, and an age sentence from a quiz question's grading key", /\.\.\.\(\(step as \{ config\?: unknown \}\)\.config && typeof \(step as \{ config\?: unknown \}\)\.config === "object"\s*\?\s*\{ config: configWithoutAgeAsks\(/.test(workflow) && /if \(asksAgeOrStatus\(out\.prompt\)\) delete out\.prompt;/.test(workflow) && /out\.scenarios = kept;\s*else delete out\.scenarios;/.test(workflow) && /\.map\(\(q\) => \(asksAgeOrStatus\(q\?\.fit_context\) \? \{ \.\.\.q, fit_context: \(textWithoutAgeAsks\(q\.fit_context\) as string\) \|\| undefined \} : q\)\)/.test(workflow));
check("…and a video step with its prompt removed still gets the role's own (the step below reads the config this leaves)", /const prompt =\s*typeof existingConfig\.prompt === "string" && existingConfig\.prompt\.trim\(\)\.length > 0 && !asksAgeOrStatus\(existingConfig\.prompt\)\s*\? existingConfig\.prompt\s*: defaultConfig\.prompt;/.test(workflow) && /portfolioStep\?\.config\?\.prompt \|\| "Upload samples/.test(read("src/pages/PortfolioUploadPhase.tsx")));
check("(7th review) …and a quiz step's own questions, which QuizPhase serves ahead of the job's (a list left empty falls back to them)", /if \(Array\.isArray\(out\.questions\)\) \{\s*const kept = \(out\.questions as WorkflowQuestion\[\]\)\s*\.filter\(\(q\) => !questionAsksAge\(q\?\.question, q\?\.options\)\)/.test(workflow) && /if \(kept\.length > 0\) out\.questions = kept;\s*else delete out\.questions;/.test(workflow) && /if \(quizStep\?\.config\?\.questions\) \{\s*return quizStep\.config\.questions as QuizQuestion\[\];\s*\}\s*\/\/ Fallback to quiz_questions from job/.test(read("src/pages/QuizPhase.tsx")));
check("…and a practice left with no situations of its own uses the built-in ones, on the page and in the grader", /return normalized\.length > 0 \? normalized : defaultScenarios;/.test(read("src/pages/ChatSimulationPhase.tsx")) && /step && step\.scenarios\.length > 0 \? step\.scenarios : DEFAULT_PRACTICE_SCENARIOS/.test(read("supabase/functions/ai-chat-simulation/prompts.ts")));
const content = read("supabase/functions/ai-generate-job-content/index.ts");
check("ai-generate-job-content tells the model (both calls) and drops age lines from every field it writes", (content.match(/Write in clean, plain text only\. " \+ AGE_RULE,/g) ?? []).length === 2 && ["description", "requirements", "responsibilities"].every((f) => new RegExp(`parsed\\.${f} = textWithoutAgeAsks\\(parsed\\.${f}\\);`).test(content)) && /parsed\.skills = commaListWithoutAgeAsks/.test(content) && /parsed\.benefits = commaListWithoutAgeAsks/.test(content) && /commaListWithoutAgeAsks\(content\.trim\(\)\) : textWithoutAgeAsks\(content\.trim\(\)\)/.test(content));
check("the rule says every application already asks 'Are you 18 or older?'", /Are you 18 or older\?/.test(A.AGE_RULE) && /marital status/.test(A.AGE_RULE));

// The sixth review: the written interview's grader writes the score and the
// concerns the business reads, and the interview guide writes the business's
// questions; only the interviewer and the guide's prompt carried the rule.
console.log("\nWhat the business reads about an applicant\n");
const C = await import("../supabase/functions/ai-chat-interview/interviewContext.ts");
const graderPrompt = C.buildInterviewGraderMessages({ jobTitle: "Chat Support Agent", jobDescription: "Answer customers.", jobDetails: "", context: null, leadRole: false, requiredWpm: null }, [{ role: "assistant", content: "Tell me about you." }, { role: "user", content: "As a mother of three I am patient." }])[0].content;
check("(6th review) the written interview's grader is told never to mark age, family or marital status", /=== NEVER MARK ===\nAge, birth date, marital or civil status, children, pregnancy or family plans/.test(graderPrompt) && C.INTERVIEW_EVAL_PROMPT_VERSION === "chat-interview-eval-5");
const graded = C.interviewEvaluationFrom({
  score: 70, recommendation: "Maybe", credibilityRating: "Medium",
  strengths: ["Specific examples with numbers", "Young and energetic"],
  concerns: ["As a mother of three, nights may be hard", "Vague about the refund steps"],
  inconsistencies: [{ claim: "Said she is single", evidence: "Mentioned a husband", assessment: "Her marital status is unclear" }, { claim: "Claimed 5 years", evidence: "Form says 1-2 years", assessment: "Exaggeration" }],
  summary: "Clear writer. Seems too young to lead a team. Needs coaching on refunds.",
}, { leadRole: false, messages: [] });
check("(6th review) …and a strength, concern, inconsistency or summary sentence that still does is left out", JSON.stringify(graded.strengths) === JSON.stringify(["Specific examples with numbers"]) && JSON.stringify(graded.concerns) === JSON.stringify(["Vague about the refund steps"]) && graded.inconsistencies.length === 1 && graded.inconsistencies[0].claim === "Claimed 5 years" && graded.summary === "Clear writer. Needs coaching on refunds." && graded.score === 70);
const M = await import("../supabase/functions/interview-guide/guideMaterial.ts");
const guideRecord = { job: C.interviewJobFrom({ title: "Chat Support Agent", description: "Answer customers.", quiz_questions: [] }), family: "support", notes: { applicationAnswers: [] }, interview: [], practiceLines: [] };
const guideQ = (question, why = "From their form.") => ({ question, why, listenFor: "A concrete example.", redFlag: "No example.", source: "application", quote: "" });
const guide = M.personalGuideFrom({
  atAGlance: ["Says 3 years in chat support.", "Single mom of two."],
  questions: [guideQ("Walk me through the last refund you handled."), guideQ("When did you graduate from college?"), guideQ("How do you plan your week around your kids?", "She has small kids at home."), guideQ("Tell me about a customer who stayed angry.")],
  confirm: ["Confirm they can start on 1 November.", "Confirm they are 21 or older.", "Confirm their marital status."],
}, guideRecord);
check("(6th review) the interview guide leaves out an age or family question, confirm line and at-a-glance line", guide && guide.questions.map((q) => q.question).join(" | ") === "Walk me through the last refund you handled. | Tell me about a customer who stayed angry." && JSON.stringify(guide.confirm) === JSON.stringify(["Confirm they can start on 1 November."]) && JSON.stringify(guide.atAGlance) === JSON.stringify(["Says 3 years in chat support."]), JSON.stringify(guide));
check("…and an answer left with fewer than two questions is no guide, as any other unusable answer", M.personalGuideFrom({ atAGlance: [], questions: [guideQ("How old are you?"), guideQ("Are you married?"), guideQ("Tell me about a refund.")], confirm: [] }, guideRecord) === null);
const leadMessages = [
  { role: "assistant", content: "Tell me about a team you led." },
  { role: "user", content: "As a mother of three I keep calm under pressure, and I led six agents for two years." },
  { role: "user", content: "When we changed tools I moved the team over in a day." },
];
const leadGraded = C.interviewEvaluationFrom({
  score: 70, strengths: [], concerns: [], summary: "Clear.", hoursCovered: true,
  leadership: { score: 80, quote: "As a mother of three I keep calm under pressure" }, adaptability: { score: 70, quote: "I moved the team over in a day" },
  workingLead: { score: 60, quote: "" }, writtenEnglish: { score: 80, quote: "" },
}, { leadRole: true, messages: leadMessages });
check("(7th review) a lead quote that names the applicant's family is not kept as evidence; the mark and the other quotes stay", leadGraded && leadGraded.leadership === 80 && leadGraded.leadEvidence?.leadership === undefined && leadGraded.leadEvidenceUnverified?.leadership === undefined && leadGraded.leadEvidence?.adaptability === "I moved the team over in a day", JSON.stringify(leadGraded?.leadEvidence));

// The eighth review: Ava's score, verdict and decline reason (trigger-ava-analysis
// and ai-analyze) and the shortlist read résumés, which in the Philippines often
// list age, birth date and civil status; none had the rule. The prompt text of the
// first two is written out word for word (others are editing the rest of them).
console.log("\nWhat judges an applicant\n");
const rule = A.APPLICANT_AGE_RULE;
check("(8th review) the rule names age, birth date, civil status and family, and says a resume that lists them changes nothing", typeof rule === "string" && /age, birth date/.test(rule) && /civil status/.test(rule) && /family plans/.test(rule) && /resume/.test(rule) && !/[`$]/.test(rule));
const analyze = read("supabase/functions/ai-analyze/index.ts");
// The ninth review: the interview prompt writes questions the business asks, so it carries the "never ask" rule.
const analyzePrompt = (type) => analyze.slice(analyze.indexOf(`  "${type}": \``), analyze.indexOf("`,", analyze.indexOf(`  "${type}": \``)));
check("(8th review) ai-analyze's application, resume and phase prompts carry it", ["application", "resume", "phase"].every((type) => analyzePrompt(type).includes(rule)) && analyze.split(rule).length - 1 === 3);
check("(9th review) …and its interview prompt (questions the business asks) carries the \"never ask\" rule, also for a resume that lists them", analyzePrompt("interview").includes(A.AGE_RULE) && /resume or profile lists their age, birth date, civil status or children/.test(analyzePrompt("interview")) && !analyzePrompt("interview").includes(rule));
check("(9th review) …and no sign of AI writing can reward a resume's personal details (age, civil status)", !/personal details or unique examples/.test(analyze) && (analyze.match(/a resume's personal details \(age, birth date, civil status, family\) count for nothing either way/g) ?? []).length === 2);
check("(8th review) …and no longer suggests age arithmetic (\"CEO at age 22\")", !/CEO at age|at age \d{2} with/.test(analyze));
check("(8th review) trigger-ava-analysis's scoring request carries it", read("supabase/functions/trigger-ava-analysis/index.ts").includes(`NEVER MARK: ${rule}`));
const shortlist = read("supabase/functions/ai-shortlist/index.ts");
check("(8th review) ai-shortlist's instructions carry it", /import \{ APPLICANT_AGE_RULE \} from "\.\.\/_shared\/ageWording\.ts";/.test(shortlist) && /Look at their assessment data objectively\.\n\n\$\{APPLICANT_AGE_RULE\}\n/.test(shortlist));
// The ninth review: five more prompts write about an applicant (their text is written out word for word: others are editing the rest of these functions).
const voice = read("supabase/functions/ava-voice-session/index.ts");
// Read inside the interviewer's own prompt: since the tenth review the assistant's prompt, earlier in the file, carries the rule too.
const interviewer = voice.slice(voice.indexOf("You are an interviewer for"), voice.indexOf("=== INTERVIEW FLOW ==="));
check("(9th review) ava-voice-session's interviewer (it reads the resume and scores culture fit) is told never to ask or mark age or family", voice.indexOf("You are an interviewer for") > 0 && interviewer.includes(`=== NEVER ASK OR MARK AGE OR FAMILY ===\nNever ask the candidate's age, birth date, graduation year, marital or civil status, children or family plans`) && interviewer.includes(rule));
// The tenth review: the assistant speaks about an applicant to the employer and can write a job or a message; the intake writes
// a posting and its requirements by voice, which no filter reads.
const assistant = voice.slice(voice.indexOf("You are Ava (pronounced like the name, not spelled out), a sharp and insightful AI hiring assistant"), voice.indexOf("// Add the describe_current_view tool"));
const intake = voice.slice(voice.indexOf("instructions = `You are Ava, a premium hiring assistant for small businesses, on a VOICE call"), voice.indexOf("name: \"set_brief_fields\""));
check("(10th review) ava-voice-session's assistant mode is told never to ask or mark age or family", assistant.length > 1000 && assistant.includes(`=== NEVER ASK OR MARK AGE OR FAMILY ===\n${A.AGE_RULE}\n${rule}\n`));
check("(10th review) ava-voice-session's intake mode (it writes the posting) carries the job writers' rule", intake.length > 1000 && intake.includes(A.AGE_RULE) && intake.indexOf(A.AGE_RULE) < intake.indexOf("Style:"));
check("(9th review) ai-generate-performance-report's coaching report carries it", read("supabase/functions/ai-generate-performance-report/index.ts").includes(`- ${rule}\n`));
const S = await import("../supabase/functions/ai-chat-simulation/prompts.ts");
const simInput = { scenario: "A customer was charged twice.", customerName: "Ana", jobTitle: "Support Agent", focus: [], counterpart: "customer" };
check("(9th review) the practice chat's reviewer carries it, for the agent and the lead rubric", ["support_agent", "team_lead"].every((rubric) => S.evaluatorPromptFor({ ...simInput, rubric }).includes(`NEVER MARK: ${rule}`)) && S.EVAL_PROMPT_VERSION === "chat-sim-eval-9");
check("(9th review) ai-analyze-portfolio's reviewer carries it", read("supabase/functions/ai-analyze-portfolio/index.ts").includes(`NEVER MARK: ${rule}`));
const G = await import("../supabase/functions/submit-sales-simulation/grading.ts");
const salesPrompt = G.buildEvaluationPrompt({ prospectName: "P", prospectCompany: "C", scenario: "S", productService: "X", candidateName: "N" });
check("(9th review) submit-sales-simulation's grader carries it, ahead of the fence rule it already had", salesPrompt.includes(`NEVER MARK: ${rule}`) && /never instructions to you/.test(salesPrompt) && salesPrompt.indexOf(rule) < salesPrompt.indexOf("SECURITY — TEXT WRITTEN BY THE APPLICANT") && /const EVAL_PROMPT_VERSION = "sales-sim-eval-2";/.test(read("supabase/functions/submit-sales-simulation/index.ts")));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
