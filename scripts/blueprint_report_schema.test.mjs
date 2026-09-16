#!/usr/bin/env node
/**
 * Local test runner for the Improvement Blueprint report schema —
 * `validateBlueprintReport` from supabase/functions/_shared/blueprintReport.ts,
 * the validator passed to callOpenAIJson in
 * supabase/functions/ai-generate-performance-report/index.ts. Exercises: a
 * fully valid report passes; each required section/field is independently
 * required; the exact developmental-disclaimer sentence is enforced
 * (word-for-word, not a paraphrase); and the "candidates never see the
 * words AI or Ava" rule is enforced on every string field, including deep
 * inside arrays.
 *
 * Run with: node scripts/blueprint_report_schema.test.mjs
 */
import {
  validateBlueprintReport,
  REQUIRED_DEVELOPMENTAL_DISCLAIMER,
} from "../supabase/functions/_shared/blueprintReport.ts";

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

function validReport(overrides = {}) {
  const base = {
    summary: {
      whatHappened: "Your application for Front Desk Associate didn't move forward this time.",
      keyTakeaway: "Typing speed was the main gap against this role's requirements.",
    },
    whatWentWell: [
      {
        strength: "Clear, friendly writing in your cover letter",
        evidence: "You described handling a difficult customer calmly in your own words.",
        howToUseItNextTime: "Open your next cover letter with that same story.",
      },
    ],
    gapsForThisRole: [
      {
        area: "Typing speed",
        requirement: "This role's screening step looks for 40+ WPM",
        whatWeObserved: "You typed 28 WPM on the timed test.",
        whyItMatters: "Front desk staff type while a guest is waiting, so speed affects wait time.",
        practiceSteps: [
          { action: "Practice 10 minutes daily on a free typing site.", example: "Type: 'Thank you for calling, how can I help you today?' five times, timing yourself." },
        ],
      },
    ],
    presentingYourExperience: {
      observation: "Your cover letter was three sentences.",
      suggestion: "Add one concrete example of a time you helped a customer.",
      example: "Instead of 'I am good with people,' try: 'When a guest's flight was cancelled, I found them a room within ten minutes.'",
    },
    practicePlan: {
      thisWeek: ["Practice typing 10 minutes a day."],
      nextTwoWeeks: ["Apply to two similar front-desk roles using the rewritten cover letter."],
    },
    rolesToConsiderNext: [
      { roleType: "Retail associate", why: "Your customer-service writing sample showed the same calm, clear communication retail roles look for." },
    ],
    closing: {
      note: "Thank you for the time you put into this application.",
      disclaimer: REQUIRED_DEVELOPMENTAL_DISCLAIMER,
    },
    metadata: {
      candidateName: "Jordan Lee",
      jobTitle: "Front Desk Associate",
      overallScore: 42,
      passingScore: 70,
      generatedAt: new Date().toISOString(),
      applicationId: "app-1",
      completedPhases: ["Typing Test", "Cover Letter"],
      dataDepth: "moderate",
    },
  };
  return { ...base, ...overrides };
}

console.log("Improvement Blueprint report schema:\n");

check("a fully valid report passes", validateBlueprintReport(validReport()) === null);

check("null is rejected", typeof validateBlueprintReport(null) === "string");
check("a plain string is rejected", typeof validateBlueprintReport("not an object") === "string");

{
  const r = validReport();
  delete r.summary.keyTakeaway;
  check("missing summary.keyTakeaway is rejected", typeof validateBlueprintReport(r) === "string");
}

{
  const r = validReport({ whatWentWell: [] });
  check("empty whatWentWell is rejected", typeof validateBlueprintReport(r) === "string");
}

{
  const r = validReport();
  delete r.whatWentWell[0].howToUseItNextTime;
  check("a whatWentWell entry missing howToUseItNextTime is rejected", typeof validateBlueprintReport(r) === "string");
}

{
  const r = validReport({ gapsForThisRole: [] });
  check("empty gapsForThisRole is rejected — every report must name a specific gap", typeof validateBlueprintReport(r) === "string");
}

{
  const r = validReport();
  r.gapsForThisRole[0].practiceSteps = [];
  check("a gap with zero practiceSteps is rejected — a gap without a concrete way to practice is not useful", typeof validateBlueprintReport(r) === "string");
}

{
  const r = validReport();
  delete r.gapsForThisRole[0].practiceSteps[0].example;
  check("a practiceStep missing a worked example is rejected", typeof validateBlueprintReport(r) === "string");
}

{
  const r = validReport();
  delete r.presentingYourExperience.example;
  check("missing presentingYourExperience.example is rejected", typeof validateBlueprintReport(r) === "string");
}

{
  const r = validReport({ rolesToConsiderNext: [] });
  check("empty rolesToConsiderNext is rejected", typeof validateBlueprintReport(r) === "string");
}

{
  const r = validReport();
  r.closing.disclaimer = "This is developmental feedback.";
  check(
    "a paraphrased disclaimer is rejected — must be the exact required sentence",
    typeof validateBlueprintReport(r) === "string",
  );
}

{
  const r = validReport();
  r.closing.note = "Our AI reviewed your application and found some gaps.";
  check('closing.note mentioning "AI" is rejected (candidates never see that word)', typeof validateBlueprintReport(r) === "string");
}

{
  const r = validReport();
  r.gapsForThisRole[0].whyItMatters = "Ava noticed this during your interview.";
  check('a forbidden term buried inside gapsForThisRole (deep field) is still caught', typeof validateBlueprintReport(r) === "string");
}

{
  const r = validReport();
  r.rolesToConsiderNext[0].why = "This role uses Java, which lines up with the coding examples you gave.";
  check('"Java" (contains the substring "ava") is NOT a false positive — word-boundary match only', validateBlueprintReport(r) === null);
}

{
  const r = validReport();
  r.summary.whatHappened = "We used a chatgpt-style tool to review this.";
  check('"chatgpt" is rejected', typeof validateBlueprintReport(r) === "string");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
