import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "https://hireflow1-iota.vercel.app";
const OUTPUT_DIR =
  process.env.OUTPUT_DIR ||
  "/Users/shahz/Documents/HIreFlow/hireflow1_codex/output/playwright/candidate-rejection-handoff-check";
const HEADED = /^(1|true|yes)$/i.test(process.env.HEADED || "");
const SLOW_MO = Number(process.env.SLOW_MO || 0);
const timestamp = Date.now();

const employer = {
  name: "Candidate Rejection Employer",
  email: `candidate.rejection.employer.${timestamp}@mailinator.com`,
  password: "CodexTest123!",
};

const candidate = {
  name: "Candidate Rejection Tester",
  email: `candidate.rejection.candidate.${timestamp}@mailinator.com`,
  password: "CodexTest123!",
};

function log(step, details = "") {
  const suffix = details ? `: ${details}` : "";
  console.log(`[candidate-rejection-check] ${step}${suffix}`);
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function screenshot(page, name) {
  const file = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function settle(page, ms = 1200) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForTimeout(ms);
}

async function clickIfVisible(locator, timeout = 2500) {
  try {
    await locator.waitFor({ state: "visible", timeout });
    await locator.click();
    return true;
  } catch {
    return false;
  }
}

async function signInOnCurrentPage(page, email, password) {
  await page.getByLabel(/^Email$/i).fill(email);
  await page.getByLabel(/^Password$/i).fill(password);
  await page.locator("form").getByRole("button", { name: /^Sign In$/i }).click();
  await settle(page, 3000);
}

async function signUpEmployer(page) {
  await page.goto(`${BASE_URL}/auth`, { waitUntil: "domcontentloaded" });
  await clickIfVisible(page.getByRole("button", { name: /Sign Up/i }), 1500);
  await page.getByLabel(/Full Name/i).fill(employer.name);
  await page.getByLabel(/^Email$/i).fill(employer.email);
  await page.getByLabel(/^Password$/i).fill(employer.password);
  await page.getByRole("button", { name: /Create Employer Account/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30000 }).catch(() => null);
  await settle(page, 2500);
}

async function completeEmployerOnboarding(page) {
  for (let index = 0; index < 8; index += 1) {
    const roleInput = page.getByPlaceholder(/e\.g\. Software Engineer/i);
    if (await roleInput.isVisible().catch(() => false)) {
      await roleInput.fill("Support Operations Specialist");
      await page.getByRole("button", { name: /Generate Workflow/i }).click();
      await page.locator("#title").waitFor({ state: "visible", timeout: 30000 });
      await settle(page, 1500);
      return;
    }

    if (await clickIfVisible(page.getByRole("button", { name: /^Next$/i }), 1200)) {
      await settle(page, 700);
      continue;
    }

    if (await clickIfVisible(page.getByRole("button", { name: /^Continue$/i }), 1200)) {
      await settle(page, 700);
      continue;
    }

    if (await page.locator("#title").isVisible().catch(() => false)) {
      return;
    }
  }

  throw new Error("Employer onboarding did not finish");
}

async function ensureEmployerCreateJobAccess(page) {
  await page.goto(`${BASE_URL}/jobs/create`, { waitUntil: "domcontentloaded" });
  await settle(page, 2000);

  for (let index = 0; index < 10; index += 1) {
    if (await page.locator("#title").isVisible().catch(() => false)) return;

    const roleInput = page.getByPlaceholder(/e\.g\. Software Engineer/i);
    if (await roleInput.isVisible().catch(() => false)) {
      await roleInput.fill("Support Operations Specialist");
      await page.getByRole("button", { name: /Generate Workflow/i }).click();
      await page.locator("#title").waitFor({ state: "visible", timeout: 30000 });
      await settle(page, 1500);
      return;
    }

    if (await clickIfVisible(page.getByRole("button", { name: /Create with Ava/i }), 1200)) {
      await settle(page, 1200);
      continue;
    }

    if (await clickIfVisible(page.getByRole("button", { name: /^Next$/i }), 1200)) {
      await settle(page, 700);
      continue;
    }

    if (await clickIfVisible(page.getByRole("button", { name: /^Continue$/i }), 1200)) {
      await settle(page, 700);
      continue;
    }
  }

  throw new Error("Could not reach create job form");
}

async function waitForReviewStep(page) {
  await page.waitForFunction(
    () => document.body.innerText.includes("Review Your Job Posting"),
    undefined,
    { timeout: 60000 },
  );
  await settle(page, 1500);
}

async function createJob(page) {
  await ensureEmployerCreateJobAccess(page);
  await page.locator("#title").waitFor({ state: "visible", timeout: 30000 });

  await page.locator("#title").fill("Candidate Rejection Support Role");
  await page.getByLabel(/Department/i).fill("Customer Success");
  await page.getByLabel(/Location/i).fill("Remote");

  const mustHaves = page.getByLabel(/Must-haves/i);
  if (await mustHaves.isVisible().catch(() => false)) {
    await mustHaves.fill("chat support, strong writing, professionalism");
  }

  const dealBreakers = page.getByLabel(/Deal-breakers/i);
  if (await dealBreakers.isVisible().catch(() => false)) {
    await dealBreakers.fill("hostile tone, wrong resume, fabricated experience");
  }

  const generateButton = page.getByRole("button", { name: /Generate Full Draft|Regenerate Full Draft/i }).first();
  await generateButton.waitFor({ state: "visible", timeout: 30000 });
  await generateButton.click();
  await waitForReviewStep(page);

  const publishButton = page.getByRole("button", { name: /Publish Job/i }).first();
  await publishButton.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll("button")).find((candidateButton) =>
      /publish job/i.test(candidateButton.textContent || ""),
    );
    return !!button && button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 30000 });
  await publishButton.click();

  await page.getByText(/Your Job is Live!/i).waitFor({ timeout: 30000 });
  const jobCode = ((await page.getByText(/^JOB-[A-Z0-9]{6}$/).first().textContent()) || "").trim();
  if (!jobCode) throw new Error("Job code not found");
  return jobCode;
}

async function completeCandidateOnboarding(page) {
  await clickIfVisible(page.getByRole("button", { name: /Get Started/i }), 1500);
  for (let index = 0; index < 2; index += 1) {
    if (await clickIfVisible(page.getByRole("button", { name: /^Continue$/i }), 1000)) {
      await settle(page, 600);
    }
  }
  await clickIfVisible(page.getByRole("button", { name: /Start Applying/i }), 2000);
  await settle(page, 2500);
}

async function signUpCandidate(page) {
  await page.goto(`${BASE_URL}/candidate/auth?tab=signup`, { waitUntil: "domcontentloaded" });
  await clickIfVisible(page.getByRole("button", { name: /Sign Up/i }), 1500);
  await page.getByLabel(/Full Name/i).fill(candidate.name);
  await page.getByLabel(/^Email$/i).fill(candidate.email);
  await page.getByLabel(/^Password$/i).fill(candidate.password);
  await page.getByRole("button", { name: /^Create Account$/i }).click();
  await settle(page, 2500);
  await completeCandidateOnboarding(page);
}

async function fillVisibleApplicationFields(page) {
  const fullName = page.getByLabel(/Full Name/i).first();
  if (await fullName.isVisible().catch(() => false)) {
    await fullName.fill(candidate.name);
  }

  const email = page.getByLabel(/Email Address/i).first();
  if (await email.isVisible().catch(() => false)) {
    await email.fill(candidate.email);
  }

  const phone = page.getByPlaceholder(/123-456-7890/i).first();
  if (await phone.isVisible().catch(() => false)) {
    await phone.fill("5554441212");
  }

  const years = page.getByLabel(/Years of Experience/i).first();
  if (await years.isVisible().catch(() => false)) {
    await years.fill("2");
  }

  const textareas = page.locator("textarea");
  const textareaCount = await textareas.count();
  for (let index = 0; index < textareaCount; index += 1) {
    const textarea = textareas.nth(index);
    if (!(await textarea.isVisible().catch(() => false))) continue;
    const currentValue = await textarea.inputValue().catch(() => "");
    if (!currentValue.trim()) {
      await textarea.fill("I have customer support experience and strong written communication.");
    }
  }

  const textInputs = page.locator(
    "input:not([type='hidden']):not([type='file']):not([type='email']):not([type='tel']):not([type='number'])",
  );
  const inputCount = await textInputs.count();
  for (let index = 0; index < inputCount; index += 1) {
    const input = textInputs.nth(index);
    if (!(await input.isVisible().catch(() => false))) continue;
    const currentValue = await input.inputValue().catch(() => "");
    if (!currentValue.trim()) {
      await input.fill("Customer support and written communication");
    }
  }
}

async function createResumeFile() {
  const resumePath = path.join(OUTPUT_DIR, `${candidate.email.replace(/[@.]/g, "_")}-resume.png`);
  await fs.writeFile(
    resumePath,
    await fs.readFile("/Users/shahz/Documents/HIreFlow/hireflow1_codex/src/assets/ava-orb.png"),
  );
  return resumePath;
}

async function submitApplication(page, jobCode) {
  await page.goto(`${BASE_URL}/candidate/apply?code=${jobCode}`, { waitUntil: "domcontentloaded" });
  await settle(page, 1500);
  await clickIfVisible(page.getByRole("button", { name: /Find Position/i }), 1500);
  await settle(page, 1000);
  await clickIfVisible(page.getByRole("button", { name: /Continue to application/i }), 8000);
  await settle(page, 1000);

  if (/\/candidate\/auth/i.test(page.url())) {
    await signInOnCurrentPage(page, candidate.email, candidate.password);
    await completeCandidateOnboarding(page);
    await settle(page, 1000);
    await clickIfVisible(page.getByRole("button", { name: /Apply Now/i }), 8000);
  } else {
    await clickIfVisible(page.getByRole("button", { name: /Apply Now/i }), 8000);
  }

  await page.waitForFunction(
    () =>
      document.body.innerText.includes("Complete Your Application") ||
      document.body.innerText.includes("Submit Application"),
    undefined,
    { timeout: 30000 },
  );

  await fillVisibleApplicationFields(page);
  const resumePath = await createResumeFile();
  await page.locator("input[type='file']").last().setInputFiles(resumePath);
  await page.getByText(/Uploading\.\.\./i).waitFor({ state: "hidden", timeout: 45000 }).catch(() => {});
  await page.getByRole("button", { name: /Submit Application/i }).click();

  try {
    await page.waitForFunction(
      () =>
        document.body.innerText.includes("reviewing your submission") ||
        /\/applications\/[a-f0-9-]+$/i.test(window.location.pathname) ||
        window.location.pathname === "/applications",
      undefined,
      { timeout: 60000 },
    );
  } catch (error) {
    await screenshot(page, "candidate-submit-timeout");
    const bodyText = await page.locator("body").innerText().catch(() => "");
    throw new Error(
      `Application submit did not settle from ${page.url()}. Body preview: ${bodyText.slice(0, 800)}`,
      { cause: error },
    );
  }

  await settle(page, 3000);

  const match = page.url().match(/\/applications\/([a-f0-9-]+)/i);
  if (!match) {
    throw new Error(`Application id not found in URL: ${page.url()}`);
  }

  return match[1];
}

async function rejectCandidate(page, applicationId) {
  await page.goto(`${BASE_URL}/applicants/${applicationId}`, { waitUntil: "domcontentloaded" });
  await settle(page, 3000);
  await page.getByRole("button", { name: /^Reject$/i }).first().click();
  await settle(page, 800);
  await page.getByRole("button", { name: /^Reject Candidate$/i }).click();
  await settle(page, 4500);
}

async function waitForRejectedUi(page, contextLabel) {
  const matched = await page.waitForFunction(
    () => {
      const body = document.body.innerText;
      return (
        body.includes("This Chapter Has Closed") ||
        body.includes("Application Closed") ||
        body.includes("This opportunity wasn't the right match")
      );
    },
    undefined,
    { timeout: 30000 },
  ).then(() => true).catch(() => false);

  await screenshot(page, contextLabel);
  return matched;
}

async function run() {
  await ensureOutputDir();
  let browser;

  try {
    browser = await chromium.launch({ headless: !HEADED, slowMo: Number.isFinite(SLOW_MO) ? SLOW_MO : 0 });
    const employerContext = await browser.newContext();
    const employerPage = await employerContext.newPage();

    log("sign-up-employer", employer.email);
    await signUpEmployer(employerPage);
    await completeEmployerOnboarding(employerPage);

    log("create-job");
    const jobCode = await createJob(employerPage);
    log("job-created", jobCode);

    const candidateContext = await browser.newContext();
    const candidatePage = await candidateContext.newPage();

    log("sign-up-candidate", candidate.email);
    await signUpCandidate(candidatePage);

    log("submit-application");
    const applicationId = await submitApplication(candidatePage, jobCode);
    log("application-submitted", applicationId);

    await candidatePage.goto(`${BASE_URL}/applications`, { waitUntil: "domcontentloaded" });
    await settle(candidatePage, 2500);
    await screenshot(candidatePage, "candidate-before-reject");

    log("reject-candidate");
    await rejectCandidate(employerPage, applicationId);

    log("verify-candidate-list");
    const listRejectedUi = await waitForRejectedUi(candidatePage, "candidate-after-reject-list");

    log("verify-candidate-detail");
    await candidatePage.goto(`${BASE_URL}/applications/${applicationId}`, { waitUntil: "domcontentloaded" });
    await settle(candidatePage, 2500);
    const detailRejectedUi = await waitForRejectedUi(candidatePage, "candidate-after-reject-detail");

    const result = {
      employerEmail: employer.email,
      candidateEmail: candidate.email,
      jobCode,
      applicationId,
      listRejectedUi,
      detailRejectedUi,
      candidateUrl: candidatePage.url(),
    };

    await fs.writeFile(path.join(OUTPUT_DIR, "result.json"), JSON.stringify(result, null, 2), "utf8");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
