import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, devices } from "playwright";

const BASE_URL = process.env.BASE_URL || "https://hireflow1-iota.vercel.app";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "/tmp/hireflow-release-sweep";
const timestamp = Date.now();

const employer = {
  name: "Release Sweep Employer",
  email: `release.employer.${timestamp}@mailinator.com`,
  password: "CodexTest123!",
};

const candidate = {
  name: "Release Sweep Candidate",
  email: `release.candidate.${timestamp}@mailinator.com`,
  password: "CodexTest123!",
};

function log(step, details) {
  const message = `[release-sweep] ${step}${details ? `: ${details}` : ""}`;
  console.log(message);
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

async function clickIfVisible(locator, timeout = 2000) {
  try {
    await locator.waitFor({ state: "visible", timeout });
    await locator.click();
    return true;
  } catch {
    return false;
  }
}

async function signIn(page, route, email, password) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
  await signInOnCurrentPage(page, email, password);
}

async function signInOnCurrentPage(page, email, password) {
  await page.getByLabel(/^Email$/i).fill(email);
  await page.getByLabel(/^Password$/i).fill(password);
  await page.locator("form").getByRole("button", { name: /^Sign In$/i }).click();
  await settle(page, 2500);
}

async function signUpEmployer(page) {
  log("employer-signup", "start");
  await page.goto(`${BASE_URL}/auth`, { waitUntil: "domcontentloaded" });
  await clickIfVisible(page.getByRole("button", { name: /Sign Up/i }), 1500);
  await page.getByLabel(/Full Name/i).fill(employer.name);
  await page.getByLabel(/^Email$/i).fill(employer.email);
  await page.getByLabel(/^Password$/i).fill(employer.password);
  await page.getByRole("button", { name: /Create Employer Account/i }).click();
  await settle(page, 3000);
  log("employer-signup", page.url());
}

async function completeEmployerOnboarding(page) {
  log("employer-onboarding", "start");
  for (let index = 0; index < 8; index += 1) {
    const roleInput = page.getByPlaceholder(/e\.g\. Software Engineer/i);
    if (await roleInput.isVisible().catch(() => false)) {
      await roleInput.fill("Release Sweep Support Specialist");
      const generateWorkflow = page.getByRole("button", { name: /Generate Workflow/i });
      await generateWorkflow.click();
      log("employer-onboarding", `submitted role on step ${index + 1}`);

      try {
        await page.locator("#title").waitFor({ state: "visible", timeout: 30000 });
        log("employer-onboarding", "complete");
        return;
      } catch {
        await screenshot(page, "employer-onboarding-handoff-failed");
        throw new Error("Employer onboarding handoff did not reach create job");
      }
    }

    const nextButton = page.getByRole("button", { name: /^Next$/i });
    if (await clickIfVisible(nextButton, 2000)) {
      await settle(page, 900);
      continue;
    }

    const continueButton = page.getByRole("button", { name: /^Continue$/i });
    if (await clickIfVisible(continueButton, 1200)) {
      await settle(page, 900);
      continue;
    }

    const dashboardLink = page.getByRole("link", { name: /Dashboard/i });
    if (await dashboardLink.isVisible().catch(() => false)) {
      return;
    }

    const createJobTitle = page.locator("#title");
    if (await createJobTitle.isVisible().catch(() => false)) {
      log("employer-onboarding", "complete");
      return;
    }

    await settle(page, 700);
  }

  await screenshot(page, "employer-onboarding-incomplete");
  throw new Error("Employer onboarding did not complete");
}

async function createJob(page) {
  log("create-job", "start");
  await completeEmployerOnboarding(page);
  await page.goto(`${BASE_URL}/jobs/create`, { waitUntil: "domcontentloaded" });
  try {
    await page.locator("#title").waitFor({ state: "visible", timeout: 20000 });
  } catch {
    await screenshot(page, "create-job-load-failed");
    throw new Error("Create Job form did not load");
  }

  await page.getByLabel(/Job Title/i).fill("Release Sweep Support Specialist");
  await page.getByLabel(/Department/i).fill("Support Operations");
  await page.getByLabel(/Location/i).fill("Remote");

  const mustHaves = page.getByLabel(/Must-haves/i);
  if (await mustHaves.isVisible().catch(() => false)) {
    await mustHaves.fill(
      "chat support, written communication, fast typing, comfort using ChatGPT"
    );
  }

  const generateButton = page.getByRole("button", { name: /Generate Full Draft/i });
  await generateButton.click();
  log("create-job", "generate-full-draft clicked");

  try {
    await page.getByRole("heading", { name: /Review Your Job Posting/i }).waitFor({
      timeout: 120000,
    });
  } catch {
    log("create-job", "retrying generate-full-draft");
    await generateButton.click();
    await page.getByRole("heading", { name: /Review Your Job Posting/i }).waitFor({
      timeout: 120000,
    });
  }

  await settle(page, 1500);
  await page.getByRole("button", { name: /Publish Job/i }).click();
  await page.getByText(/Your Job is Live!/i).waitFor({ timeout: 30000 });

  const jobCode = ((await page.getByText(/^JOB-[A-Z0-9]{6}$/).first().textContent()) || "")
    .trim();

  if (!jobCode) {
    throw new Error("Job code not found after publish");
  }

  await clickIfVisible(page.getByRole("button", { name: /^Close$/i }), 1500);
  log("job-code", jobCode);
  return jobCode;
}

async function completeCandidateOnboarding(page) {
  try {
    await page.waitForFunction(
      () =>
        !/\/candidate\/auth/i.test(window.location.pathname) ||
        document.body.innerText.includes("Welcome to HireFlow") ||
        document.body.innerText.includes("Enter Job Code"),
      undefined,
      { timeout: 20000 }
    );
  } catch {
    await screenshot(page, "candidate-onboarding-entry-timeout");
  }

  const getStarted = page.getByRole("button", { name: /Get Started/i });
  if (await getStarted.isVisible().catch(() => false)) {
    await getStarted.click();
    await settle(page, 600);
  }

  for (let index = 0; index < 2; index += 1) {
    const continueButton = page.getByRole("button", { name: /^Continue$/i });
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
      await settle(page, 600);
    }
  }

  const startApplying = page.getByRole("button", { name: /Start Applying/i });
  if (await startApplying.isVisible().catch(() => false)) {
    await startApplying.click();
    await settle(page, 2500);
  }

  try {
    await page.waitForFunction(
      () =>
        !document.body.innerText.includes("Welcome to HireFlow") &&
        !document.body.innerText.includes("Start Applying") &&
        (/\/apply/i.test(window.location.pathname) ||
          document.body.innerText.includes("Enter Job Code") ||
          document.body.innerText.includes("Find Position")),
      undefined,
      { timeout: 25000 }
    );
  } catch {
    await screenshot(page, "candidate-onboarding-complete-timeout");
  }
}

async function submitCandidateApplication(page, jobCode) {
  log("candidate-signup", "start");
  await page.goto(`${BASE_URL}/candidate/auth?tab=signup`, { waitUntil: "domcontentloaded" });
  await clickIfVisible(page.getByRole("button", { name: /Sign Up/i }), 1500);
  await page.getByLabel(/Full Name/i).fill(candidate.name);
  await page.getByLabel(/^Email$/i).fill(candidate.email);
  await page.getByLabel(/^Password$/i).fill(candidate.password);
  await page.getByRole("button", { name: /^Create Account$/i }).click();
  await settle(page, 2500);
  log("candidate-signup", page.url());

  await completeCandidateOnboarding(page);
  log("candidate-onboarding", page.url());

  await page.goto(`${BASE_URL}/candidate/apply?code=${jobCode}`, { waitUntil: "domcontentloaded" });
  await settle(page, 1500);
  const findPosition = page.getByRole("button", { name: /Find Position/i });
  if (await findPosition.isVisible().catch(() => false)) {
    await findPosition.click();
    await settle(page, 1500);
  }
  const continued = await clickIfVisible(page.getByRole("button", { name: /Continue to application/i }), 5000);
  log("candidate-apply-preview", `continue=${continued} url=${page.url()}`);
  await settle(page, 1200);
  const applyNowVisible = await clickIfVisible(page.getByRole("button", { name: /Apply Now/i }), 7000);
  log("candidate-job-details", `applyNow=${applyNowVisible} url=${page.url()}`);
  await settle(page, 1800);

  if (/\/candidate\/auth/i.test(page.url())) {
    await signInOnCurrentPage(page, candidate.email, candidate.password);
    const applyAfterSignIn = await clickIfVisible(page.getByRole("button", { name: /Apply Now/i }), 7000);
    log("candidate-job-details", `post-signin-applyNow=${applyAfterSignIn} url=${page.url()}`);
    await settle(page, 1800);
  }

  try {
    await page.getByRole("heading", { name: /Complete Your Application/i }).waitFor({
      timeout: 30000,
    });
  } catch (error) {
    await screenshot(page, "candidate-application-start-failed");
    log("candidate-application-start-failed", page.url());
    throw error;
  }

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
    await phone.click({ clickCount: 3 }).catch(() => {});
    await phone.press("Meta+A").catch(() => {});
    await phone.press("Control+A").catch(() => {});
    await phone.pressSequentially("5554441212", { delay: 30 });
  }

  const years = page.getByLabel(/Years of Experience/i).first();
  if (await years.isVisible().catch(() => false)) {
    await years.fill("4");
  }

  const numberInputs = page.locator("input[type='number']");
  const numberInputCount = await numberInputs.count();
  for (let index = 0; index < numberInputCount; index += 1) {
    const input = numberInputs.nth(index);
    if (!(await input.isVisible().catch(() => false))) continue;
    const currentValue = await input.inputValue().catch(() => "");
    if (!currentValue.trim()) {
      await input.fill("4");
    }
  }

  const textareas = page.locator("textarea");
  const textareaCount = await textareas.count();
  for (let index = 0; index < textareaCount; index += 1) {
    const textarea = textareas.nth(index);
    if (!(await textarea.isVisible().catch(() => false))) continue;
    const currentValue = await textarea.inputValue().catch(() => "");
    if (!currentValue.trim()) {
      await textarea.fill(
        "Experienced with chat support, documentation, typing accuracy, and AI-assisted workflows."
      );
    }
  }

  const textInputs = page.locator(
    "input:not([type='hidden']):not([type='file']):not([type='email']):not([type='tel']):not([type='number'])"
  );
  const inputCount = await textInputs.count();
  for (let index = 0; index < inputCount; index += 1) {
    const input = textInputs.nth(index);
    if (!(await input.isVisible().catch(() => false))) continue;
    const currentValue = await input.inputValue().catch(() => "");
    if (!currentValue.trim()) {
      await input.fill(
        "Experienced with chat support, documentation, typing accuracy, and AI-assisted workflows."
      );
    }
  }

  const resumePath = path.join(OUTPUT_DIR, "resume.png");
  await fs.writeFile(
    resumePath,
    await fs.readFile(path.resolve("src/assets/ava-orb.png"))
  );
  await page.locator("input[type='file']").last().setInputFiles(resumePath);
  await page.getByText(/resume\.png|ava-orb\.png/i).waitFor({ timeout: 30000 }).catch(() => {});
  await page
    .getByText(/Uploading\.\.\./i)
    .waitFor({ state: "hidden", timeout: 45000 })
    .catch(() => {});

  await page.getByRole("button", { name: /Submit Application/i }).click();
  try {
    await page.waitForFunction(
      () =>
        document.body.innerText.includes("reviewing your submission") ||
        document.body.innerText.includes("Application Submitted") ||
        /\/applications\/[a-f0-9-]+$/i.test(window.location.pathname),
      undefined,
      { timeout: 45000 }
    );
  } catch (error) {
    await screenshot(page, "candidate-submit-timeout");
    const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    log("candidate-submit-timeout", `${page.url()} :: ${bodySnippet}`);
    throw error;
  }

  await settle(page, 1500);
  const match = page.url().match(/\/applications\/([a-f0-9-]+)/i);
  if (!match) {
    throw new Error(`Application id not found in URL: ${page.url()}`);
  }

  log("application-id", match[1]);
  return match[1];
}

async function mobileCheck(page, route, name) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
  await settle(page, 1800);
  const file = await screenshot(page, name);
  const metrics = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    hasHorizontalOverflow: document.body.scrollWidth > window.innerWidth + 1,
    text: document.body.innerText.slice(0, 1500),
  }));
  console.log(
    JSON.stringify(
      {
        name,
        route,
        screenshot: file,
        ...metrics,
      },
      null,
      2
    )
  );
}

async function deleteAccount(page) {
  await page.goto(`${BASE_URL}/settings`, { waitUntil: "domcontentloaded" });
  await settle(page, 2000);
  const deleteButton = page.getByRole("button", { name: /^Delete Account$/i });
  if (await deleteButton.isVisible().catch(() => false)) {
    await deleteButton.click();
    await page.getByRole("button", { name: /Yes, Delete My Account/i }).click();
    await settle(page, 5000);
  }
}

async function main() {
  await ensureOutputDir();
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const employerPage = await desktopContext.newPage();
  await signUpEmployer(employerPage);
  const jobCode = await createJob(employerPage);

  const candidateDesktopContext = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const candidatePage = await candidateDesktopContext.newPage();
  const applicationId = await submitCandidateApplication(candidatePage, jobCode);
  await candidateDesktopContext.close();

  const mobileDevice = devices["iPhone 13"];

  const employerMobile = await browser.newContext({ ...mobileDevice });
  const employerMobilePage = await employerMobile.newPage();
  await signIn(employerMobilePage, "/auth", employer.email, employer.password);
  await mobileCheck(employerMobilePage, "/dashboard", "mobile-employer-dashboard");
  await mobileCheck(employerMobilePage, "/team", "mobile-employer-team");
  await clickIfVisible(
    employerMobilePage.getByRole("button", { name: /Invite Team Member/i }),
    3000
  );
  await screenshot(employerMobilePage, "mobile-employer-team-invite");
  await mobileCheck(employerMobilePage, "/jobs/create", "mobile-employer-create-job");

  const candidateMobile = await browser.newContext({ ...mobileDevice });
  const candidateMobilePage = await candidateMobile.newPage();
  await signIn(candidateMobilePage, "/candidate/auth", candidate.email, candidate.password);
  await mobileCheck(
    candidateMobilePage,
    `/applications/${applicationId}`,
    "mobile-candidate-application-detail"
  );
  await mobileCheck(
    candidateMobilePage,
    `/candidate/apply?code=${jobCode}`,
    "mobile-candidate-apply-with-code"
  );

  await deleteAccount(employerMobilePage);
  await deleteAccount(candidateMobilePage);

  await employerMobile.close();
  await candidateMobile.close();
  await desktopContext.close();
  await browser.close();
  log("done", OUTPUT_DIR);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
