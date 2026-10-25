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
]) check(`left as written: ${JSON.stringify(line)}`, !A.asksAgeOrStatus(line));

check("a list keeps its other lines, in order", JSON.stringify(A.withoutAgeAsks(["Your name?", "Date of birth?", "Why this job?"])) === JSON.stringify(["Your name?", "Why this job?"]));
check("…objects by their question", A.withoutAgeAsks([{ question: "How old are you?" }, { question: "Shifts?" }], (q) => q.question).length === 1);
check("a bullet list loses only its age line", A.bulletsWithoutAgeAsks("• Good English\n• Must be 21-35 years old\n• Night shifts") === "• Good English\n• Night shifts");
check("a paragraph loses only its age sentence, and inline bullets only their age item", A.textWithoutAgeAsks("Good English. Must be 21-35 years old. Two years in a call center.") === "Good English. Two years in a call center." && A.textWithoutAgeAsks("• Good English • Age: 21-35 • Night shift") === "• Good English • Night shift");
check("a comma list loses only its age item", A.commaListWithoutAgeAsks("communication, typing, young and energetic team, empathy") === "communication, typing, empathy");
check("nothing that is not a list or text breaks it", A.withoutAgeAsks(null).length === 0 && A.bulletsWithoutAgeAsks(undefined) === undefined);

console.log("\nThe three job writers\n");
const flow = read("supabase/functions/generate-flow/index.ts");
check("generate-flow tells the model the rule", /from "\.\.\/_shared\/ageWording\.ts"/.test(flow) && /for phone work, include interview questions about handling calls\. " \+\s*AGE_RULE;/.test(flow));
check("…and drops them from the title, summary, quiz and written interview too (the third review)", /title: textWithoutAgeAsks\(content\.jobPost\.title\)/.test(flow) && /summary: textWithoutAgeAsks\(content\.jobPost\.summary\)/.test(flow) && /quiz: take\(withoutAgeAsks\(content\.quiz/.test(flow) && /voiceQuestions: take<string>\(withoutAgeAsks\(content\.voiceQuestions\)/.test(flow));
check("…and drops age questions and requirements it still writes", /application: take<string>\(withoutAgeAsks\(content\.application\), spec\.app\)/.test(flow) && /requirements: withoutAgeAsks\(content\.jobPost\.requirements\)/.test(flow) && /niceToHaves: withoutAgeAsks\(content\.jobPost\.niceToHaves\)/.test(flow) && /jobPost,\n\s*application:/.test(flow));
const workflow = read("supabase/functions/ai-generate-workflow/index.ts");
check("ai-generate-workflow tells the model and drops age questions, quiz questions included, after its guided questions too", /Always return valid JSON only\. \$\{AGE_RULE\}/.test(workflow) && /application_questions: withoutAgeAsks\(/.test(workflow) && /quiz_questions: withoutAgeAsks\(/.test(workflow) && /data\.application_questions = withoutAgeAsks\(enrichApplicationQuestions\(/.test(workflow));
const content = read("supabase/functions/ai-generate-job-content/index.ts");
check("ai-generate-job-content tells the model (both calls) and drops age lines from every field it writes", (content.match(/Write in clean, plain text only\. " \+ AGE_RULE,/g) ?? []).length === 2 && ["description", "requirements", "responsibilities"].every((f) => new RegExp(`parsed\\.${f} = textWithoutAgeAsks\\(parsed\\.${f}\\);`).test(content)) && /parsed\.skills = commaListWithoutAgeAsks/.test(content) && /parsed\.benefits = commaListWithoutAgeAsks/.test(content) && /commaListWithoutAgeAsks\(content\.trim\(\)\) : textWithoutAgeAsks\(content\.trim\(\)\)/.test(content));
check("the rule says every application already asks 'Are you 18 or older?'", /Are you 18 or older\?/.test(A.AGE_RULE) && /marital status/.test(A.AGE_RULE));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
