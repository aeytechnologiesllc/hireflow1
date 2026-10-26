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
 * against both earlier rounds, in the tenth) to see what the new rules drop
 * that the old ones kept; the seventh to tenth reviews' fixes drop none of
 * them.
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
