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
 * marital status, or that sets an age limit.
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
console.log("\nThe three job writers\n");
const flow = read("supabase/functions/generate-flow/index.ts");
check("generate-flow tells the model the rule", /from "\.\.\/_shared\/ageWording\.ts"/.test(flow) && /for phone work, include interview questions about handling calls\. " \+\s*AGE_RULE;/.test(flow));
check("…and drops them from the title, summary, quiz and written interview too (the third review)", /title: textWithoutAgeAsks\(content\.jobPost\.title\)/.test(flow) && /summary: textWithoutAgeAsks\(content\.jobPost\.summary\)/.test(flow) && /quiz: take\(withoutAgeAsks\(content\.quiz/.test(flow) && /voiceQuestions: take<string>\(withoutAgeAsks\(content\.voiceQuestions\)/.test(flow));
check("…and drops age questions and requirements it still writes", /application: take<string>\(withoutAgeAsks\(content\.application\), spec\.app\)/.test(flow) && /requirements: withoutAgeAsks\(content\.jobPost\.requirements\)/.test(flow) && /niceToHaves: withoutAgeAsks\(content\.jobPost\.niceToHaves\)/.test(flow) && /jobPost,\n\s*application:/.test(flow));
const workflow = read("supabase/functions/ai-generate-workflow/index.ts");
check("ai-generate-workflow tells the model and drops age questions, quiz questions included, after its guided questions too", /Always return valid JSON only\. \$\{AGE_RULE\}/.test(workflow) && /application_questions: \(Array\.isArray\(workflowData\.application_questions\)[^\n]*\.filter\(\(q\) => !questionAsksAge\(q\?\.question, q\?\.options\)\)/.test(workflow) && /quiz_questions: \(Array\.isArray\(workflowData\.quiz_questions\)[^\n]*\.filter\(\(q\) => !questionAsksAge\(q\?\.question, q\?\.options\)\)/.test(workflow) && /data\.application_questions = withoutAgeAsks\(enrichApplicationQuestions\(/.test(workflow));
const content = read("supabase/functions/ai-generate-job-content/index.ts");
check("ai-generate-job-content tells the model (both calls) and drops age lines from every field it writes", (content.match(/Write in clean, plain text only\. " \+ AGE_RULE,/g) ?? []).length === 2 && ["description", "requirements", "responsibilities"].every((f) => new RegExp(`parsed\\.${f} = textWithoutAgeAsks\\(parsed\\.${f}\\);`).test(content)) && /parsed\.skills = commaListWithoutAgeAsks/.test(content) && /parsed\.benefits = commaListWithoutAgeAsks/.test(content) && /commaListWithoutAgeAsks\(content\.trim\(\)\) : textWithoutAgeAsks\(content\.trim\(\)\)/.test(content));
check("the rule says every application already asks 'Are you 18 or older?'", /Are you 18 or older\?/.test(A.AGE_RULE) && /marital status/.test(A.AGE_RULE));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
