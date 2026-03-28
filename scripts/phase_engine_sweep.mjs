import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "https://hireflow1-iota.vercel.app";
const OUTPUT_DIR =
  process.env.OUTPUT_DIR ||
  "/Users/shahz/Documents/HIreFlow/hireflow1_codex/output/playwright/phase-engine-sweep";
const FAKE_VIDEO =
  process.env.FAKE_VIDEO ||
  "/Users/shahz/Documents/HIreFlow/hireflow1_codex/output/test-media/fake-video.y4m";
const FAKE_AUDIO =
  process.env.FAKE_AUDIO ||
  "/Users/shahz/Documents/HIreFlow/hireflow1_codex/output/test-media/fake-speech.wav";

const timestamp = Date.now();

const employer = {
  name: "Phase Engine Employer",
  email: `phase.employer.${timestamp}@mailinator.com`,
  password: "CodexTest123!",
};

const supportCandidate = {
  name: "Jamie Support Demo",
  email: `phase.support.${timestamp}@mailinator.com`,
  password: "CodexTest123!",
};

const salesCandidate = {
  name: "Casey Sales Demo",
  email: `phase.sales.${timestamp}@mailinator.com`,
  password: "CodexTest123!",
};

function log(step, details = "") {
  const suffix = details ? `: ${details}` : "";
  console.log(`[phase-engine] ${step}${suffix}`);
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function appendDebugLog(line) {
  await fs.appendFile(path.join(OUTPUT_DIR, "network-debug.log"), `${line}\n`, "utf8");
}

async function readEnvValue(key) {
  const candidatePaths = [
    "/Users/shahz/Documents/HIreFlow/hireflow1/.env",
    "/Users/shahz/Documents/HIreFlow/hireflow1_codex/.env",
  ];

  for (const file of candidatePaths) {
    try {
      const content = await fs.readFile(file, "utf8");
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex === -1) continue;
        const currentKey = trimmed.slice(0, separatorIndex).trim();
        if (currentKey !== key) continue;
        const rawValue = trimmed.slice(separatorIndex + 1).trim();
        return rawValue.replace(/^['"]|['"]$/g, "");
      }
    } catch {
      // Try the next file.
    }
  }

  throw new Error(`Could not find ${key} in local env files`);
}

async function getSupabaseConfig() {
  const url = await readEnvValue("VITE_SUPABASE_URL");
  const anonKey =
    (await readEnvValue("VITE_SUPABASE_PUBLISHABLE_KEY").catch(() => null)) ||
    (await readEnvValue("VITE_SUPABASE_ANON_KEY"));
  return { url, anonKey };
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

async function extractAccessToken(page) {
  const token = await page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.includes("-auth-token")) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        if (parsed?.access_token) return parsed.access_token;
        if (parsed?.currentSession?.access_token) return parsed.currentSession.access_token;
        if (parsed?.session?.access_token) return parsed.session.access_token;
      } catch {
        // Ignore malformed values.
      }
    }
    return null;
  });

  if (!token) {
    throw new Error("Supabase access token not found in localStorage");
  }

  return token;
}

async function supabaseSingle({ url, anonKey, accessToken, table, filter, select }) {
  const requestUrl = `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&${filter}`;
  const response = await fetch(requestUrl, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.pgrst.object+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed (${table}): ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function signIn(page, route, email, password) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
  await signInOnCurrentPage(page, email, password);
}

async function signInOnCurrentPage(page, email, password) {
  await page.getByLabel(/^Email$/i).fill(email);
  await page.getByLabel(/^Password$/i).fill(password);
  await page.locator("form").getByRole("button", { name: /^Sign In$/i }).click();
  await settle(page, 3000);
}

async function signUpEmployer(page) {
  log("employer-signup", "start");
  await page.goto(`${BASE_URL}/auth`, { waitUntil: "domcontentloaded" });
  await clickIfVisible(page.getByRole("button", { name: /Sign Up/i }), 1500);
  await page.getByLabel(/Full Name/i).fill(employer.name);
  await page.getByLabel(/^Email$/i).fill(employer.email);
  await page.getByLabel(/^Password$/i).fill(employer.password);
  await page.getByRole("button", { name: /Create Employer Account/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30000 }).catch(() => null);
  await page.waitForFunction(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.includes("-auth-token")) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        if (parsed?.access_token || parsed?.currentSession?.access_token || parsed?.session?.access_token) {
          return true;
        }
      } catch {
        // Ignore malformed values while the auth library is still writing.
      }
    }
    return false;
  }, { timeout: 30000 }).catch(() => null);
  await settle(page, 2500);
}

async function completeEmployerOnboarding(page) {
  log("employer-onboarding", "start");
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
    const bodyText = (await page.locator("body").innerText().catch(() => "")).trim();
    if (!bodyText) {
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      await settle(page, 1500);
      continue;
    }

    if (await page.locator("#title").isVisible().catch(() => false)) {
      return;
    }

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

    await settle(page, 700);
  }

  await screenshot(page, "create-job-access-failure");
  const failureText = await page.locator("body").innerText().catch(() => "");
  await fs.writeFile(
    path.join(OUTPUT_DIR, "create-job-access-failure.txt"),
    `URL: ${page.url()}\n\n${failureText}`,
    "utf8",
  );

  throw new Error(`Could not reach Create Job screen from ${page.url()}`);
}

async function setPassingScoreToMinimum(page) {
  const sliders = page.getByRole("slider");
  const count = await sliders.count();
  if (count === 0) return;
  const slider = sliders.nth(count - 1);
  await slider.focus();
  await slider.press("Home").catch(() => {});
  await settle(page, 300);
}

async function addWorkflowStepIfAvailable(page, label) {
  const existingStep = page.getByText(new RegExp(`^${label}$`, "i")).first();
  if (await existingStep.isVisible().catch(() => false)) {
    return true;
  }

  const addBothInterviews = page.getByRole("button", { name: /Add Both Interviews/i }).first();
  if (await addBothInterviews.isVisible().catch(() => false)) {
    await addBothInterviews.click();
    await settle(page, 700);
    return true;
  }

  const addStepButton = page.getByRole("button", { name: /Add Step/i }).first();
  if (!(await addStepButton.isVisible().catch(() => false))) {
    await screenshot(page, "add-step-missing");
    const bodyText = await page.locator("body").innerText().catch(() => "");
    await fs.writeFile(
      path.join(OUTPUT_DIR, "add-step-missing.txt"),
      bodyText,
      "utf8",
    );
  }

  await addStepButton.scrollIntoViewIfNeeded().catch(() => {});
  await addStepButton.click();
  const item = page.getByRole("menuitem", { name: new RegExp(label, "i") }).first();
  await item.waitFor({ state: "visible", timeout: 5000 });

  const disabled =
    (await item.getAttribute("data-disabled").catch(() => null)) !== null ||
    !(await item.isEnabled().catch(() => true));

  if (!disabled) {
    await item.click();
    if (await addBothInterviews.isVisible().catch(() => false)) {
      await addBothInterviews.click();
    }
    await settle(page, 700);
    return true;
  }

  await page.keyboard.press("Escape").catch(() => {});
  await settle(page, 300);
  return false;
}

async function waitForReviewStep(page) {
  await page.getByRole("heading", { name: /Review Your Job Posting/i }).waitFor({
    timeout: 120000,
  });
  await settle(page, 1500);
}

async function captureStepFailure(page, name) {
  await screenshot(page, name);
  const bodyText = await page.locator("body").innerText().catch(() => "");
  await fs.writeFile(path.join(OUTPUT_DIR, `${name}.txt`), bodyText, "utf8");
}

async function openWorkflowEditor(page) {
  const workflowStepButton = page.getByRole("button", { name: /^Screening Plan$/ }).first();
  if (await workflowStepButton.isVisible().catch(() => false)) {
    await workflowStepButton.click();
    await settle(page, 1200);
  } else {
    const editWorkflowButton = page.getByRole("button", { name: /^Edit Screening Plan$/ }).first();
    if (await editWorkflowButton.isVisible().catch(() => false)) {
      await editWorkflowButton.click();
      await settle(page, 1200);
    }
  }

  const addStepButton = page.getByRole("button", { name: /^Add Step$/i }).first();
  if (!(await addStepButton.isVisible().catch(() => false))) {
    await captureStepFailure(page, "workflow-editor-missing");
    throw new Error("Workflow editor did not open");
  }
}

async function createJob(page, config) {
  log("create-job", config.title);
  await ensureEmployerCreateJobAccess(page);
  await page.locator("#title").waitFor({ state: "visible", timeout: 30000 });

  await page.locator("#title").fill(config.title);
  await page.getByLabel(/Department/i).fill(config.department);
  await page.getByLabel(/Location/i).fill(config.location);

  const mustHaves = page.getByLabel(/Must-haves/i);
  if (await mustHaves.isVisible().catch(() => false)) {
    await mustHaves.fill(config.mustHaves);
  }

  const dealBreakers = page.getByLabel(/Deal-breakers/i);
  if (await dealBreakers.isVisible().catch(() => false)) {
    await dealBreakers.fill(config.dealBreakers);
  }

  await setPassingScoreToMinimum(page);

  let generateButton = page.getByRole("button", { name: /Generate Full Draft|Regenerate Full Draft/i }).first();
  if (!(await generateButton.isVisible().catch(() => false))) {
    const backToSetup = page.getByRole("button", { name: /Back to Ava Setup/i }).first();
    if (await backToSetup.isVisible().catch(() => false)) {
      await backToSetup.click();
      await settle(page, 1200);
    } else {
      const avaSetupStep = page.getByRole("button", { name: /Ava Setup/i }).first();
      if (await avaSetupStep.isVisible().catch(() => false)) {
        await avaSetupStep.click();
        await settle(page, 1200);
      }
    }
    generateButton = page.getByRole("button", { name: /Generate Full Draft|Regenerate Full Draft/i }).first();
  }

  try {
    await generateButton.waitFor({ state: "visible", timeout: 30000 });
  } catch (error) {
    await captureStepFailure(page, "generate-draft-missing");
    throw error;
  }
  await generateButton.click();

  try {
    await waitForReviewStep(page);
  } catch {
    await generateButton.click();
    await waitForReviewStep(page);
  }

  await openWorkflowEditor(page);

  for (const stepLabel of config.extraSteps) {
    await addWorkflowStepIfAvailable(page, stepLabel);
  }

  const nextButtons = page.getByRole("button", { name: /^Next$/i });
  const nextButtonCount = await nextButtons.count();
  let nextButton = null;

  for (let index = nextButtonCount - 1; index >= 0; index -= 1) {
    const candidate = nextButtons.nth(index);
    if (await candidate.isVisible().catch(() => false)) {
      nextButton = candidate;
      break;
    }
  }

  if (!nextButton) {
    const publishButton = page.getByRole("button", { name: /Publish Job/i }).first();
    if (!(await publishButton.isVisible().catch(() => false))) {
      await captureStepFailure(page, "workflow-next-missing");
      throw new Error("Workflow step is missing the Next button");
    }
  } else {
    await nextButton.scrollIntoViewIfNeeded().catch(() => {});
    await nextButton.click();
    await waitForReviewStep(page);
  }

  const publishButton = page.getByRole("button", { name: /Publish Job/i }).first();
  await publishButton.scrollIntoViewIfNeeded().catch(() => {});
  try {
    await page.waitForFunction(
      () => {
        const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
          /publish job/i.test(candidate.textContent || ""),
        );
        return !!button && button instanceof HTMLButtonElement && !button.disabled;
      },
      undefined,
      { timeout: 30000 },
    );
  } catch (error) {
    await captureStepFailure(page, "publish-job-disabled");
    throw error;
  }

  await publishButton.click();
  await page.getByText(/Your Job is Live!/i).waitFor({ timeout: 30000 });

  const jobCode = ((await page.getByText(/^JOB-[A-Z0-9]{6}$/).first().textContent()) || "").trim();
  if (!jobCode) {
    throw new Error("Job code not found after publish");
  }

  await clickIfVisible(page.getByRole("button", { name: /^Close$/i }), 2000);
  log("job-code", `${config.title} -> ${jobCode}`);
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
    // Continue with best effort.
  }

  await clickIfVisible(page.getByRole("button", { name: /Get Started/i }), 1500);

  for (let index = 0; index < 2; index += 1) {
    if (await clickIfVisible(page.getByRole("button", { name: /^Continue$/i }), 1000)) {
      await settle(page, 600);
    }
  }

  if (await clickIfVisible(page.getByRole("button", { name: /Start Applying/i }), 2000)) {
    await settle(page, 2500);
  }
}

async function signUpCandidate(page, candidate) {
  await page.goto(`${BASE_URL}/candidate/auth?tab=signup`, { waitUntil: "domcontentloaded" });
  await clickIfVisible(page.getByRole("button", { name: /Sign Up/i }), 1500);
  await page.getByLabel(/Full Name/i).fill(candidate.name);
  await page.getByLabel(/^Email$/i).fill(candidate.email);
  await page.getByLabel(/^Password$/i).fill(candidate.password);
  await page.getByRole("button", { name: /^Create Account$/i }).click();
  await settle(page, 2500);
  await completeCandidateOnboarding(page);
}

async function fillVisibleApplicationFields(page, candidate) {
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
        "I have strong written communication, reliable typing accuracy, customer support experience, and I use AI tools carefully and professionally."
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
      await input.fill("Strong communication and reliable execution");
    }
  }
}

async function createResumeFile(name) {
  const resumePath = path.join(OUTPUT_DIR, `${name}-resume.png`);
  await fs.writeFile(
    resumePath,
    await fs.readFile("/Users/shahz/Documents/HIreFlow/hireflow1_codex/src/assets/ava-orb.png")
  );
  return resumePath;
}

async function submitApplication(page, candidate, jobCode) {
  log("candidate-apply", `${candidate.email} -> ${jobCode}`);
  await page.goto(`${BASE_URL}/candidate/apply?code=${jobCode}`, { waitUntil: "domcontentloaded" });
  await settle(page, 1500);

  if (await clickIfVisible(page.getByRole("button", { name: /Find Position/i }), 1500)) {
    await settle(page, 1200);
  }

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
      document.body.innerText.includes("Submit Application") ||
      document.body.innerText.includes("Upload Resume"),
    undefined,
    { timeout: 30000 },
  );
  await fillVisibleApplicationFields(page, candidate);

  const resumePath = await createResumeFile(candidate.email.replace(/[@.]/g, "_"));
  await page.locator("input[type='file']").last().setInputFiles(resumePath);
  await page
    .getByText(/Uploading\.\.\./i)
    .waitFor({ state: "hidden", timeout: 45000 })
    .catch(() => {});

  await page.getByRole("button", { name: /Submit Application/i }).click();

  await page.waitForFunction(
    () =>
      document.body.innerText.includes("reviewing your submission") ||
      document.body.innerText.includes("Application Submitted") ||
      /\/applications\/[a-f0-9-]+$/i.test(window.location.pathname),
    undefined,
    { timeout: 60000 }
  );

  await settle(page, 2000);
  const match = page.url().match(/\/applications\/([a-f0-9-]+)/i);
  if (!match) {
    throw new Error(`Application id not found in URL: ${page.url()}`);
  }

  return match[1];
}

async function waitForTextareaEnabled(page, timeout = 20000) {
  await page.waitForFunction(
    () => {
      const textareas = Array.from(document.querySelectorAll("textarea"));
      return textareas.some((textarea) => !(textarea).disabled);
    },
    undefined,
    { timeout }
  );
}

async function startConversationPhase(page, buttonName) {
  const startButton = page.getByRole("button", { name: buttonName }).first();
  await startButton.waitFor({ state: "visible", timeout: 30000 });
  await startButton.scrollIntoViewIfNeeded().catch(() => {});
  await startButton.click({ force: true });
  await settle(page, 1200);
  await page.waitForFunction(
    () => {
      const textarea = document.querySelector("textarea");
      const introButton = Array.from(document.querySelectorAll("button")).find((button) =>
        /start (simulation|interview|meeting)/i.test(button.textContent || ""),
      );
      return !!textarea && !introButton;
    },
    { timeout: 30000 },
  );
}

async function completeQuiz(page) {
  log("phase", "quiz");
  await page.waitForLoadState("domcontentloaded");
  await settle(page, 1500);

  for (let attempts = 0; attempts < 40; attempts += 1) {
    const submitResults = page.getByRole("button", { name: /Submit Results/i }).first();
    if (await submitResults.isVisible().catch(() => false)) {
      break;
    }

    const radioOption = page.locator("[role='radio']").first();
    const checkbox = page.locator("button[role='checkbox'], input[type='checkbox']").first();
    const textarea = page.locator("textarea").first();

    if (await radioOption.isVisible().catch(() => false)) {
      await radioOption.click();
    } else if (await checkbox.isVisible().catch(() => false)) {
      await checkbox.click();
    } else if (await textarea.isVisible().catch(() => false)) {
      await textarea.fill("I would stay calm, communicate clearly, and solve the issue professionally.");
    }

    const finishQuiz = page.getByRole("button", { name: /Finish Quiz/i }).first();
    if ((await finishQuiz.isVisible().catch(() => false)) && (await finishQuiz.isEnabled().catch(() => false))) {
      await finishQuiz.click();
      await settle(page, 1500);
      if (await submitResults.isVisible().catch(() => false)) {
        break;
      }
      continue;
    }

    const nextButton = page.getByRole("button", { name: /^Next$/i }).first();
    if ((await nextButton.isVisible().catch(() => false)) && (await nextButton.isEnabled().catch(() => false))) {
      await nextButton.click();
      await settle(page, 300);
      continue;
    }

    await settle(page, 400);
  }

  const submitResults = page.getByRole("button", { name: /Submit Results/i }).first();
  if (!(await submitResults.isVisible().catch(() => false))) {
    await screenshot(page, "quiz-submit-missing");
    const bodyText = await page.locator("body").innerText().catch(() => "");
    await fs.writeFile(
      path.join(OUTPUT_DIR, "quiz-submit-missing.txt"),
      bodyText,
      "utf8",
    );
    throw new Error("Quiz did not reach the results submission state");
  }

  await submitResults.click();
  await settle(page, 4000);
}

async function completeTypingTest(page) {
  log("phase", "typing");
  await clickIfVisible(page.getByRole("button", { name: /Start Typing Test/i }), 5000);
  await page.getByRole("button", { name: /Finish Early/i }).waitFor({ state: "visible", timeout: 30000 });
  await page.locator("textarea").first().waitFor({ state: "visible", timeout: 30000 });
  await settle(page, 1200);

  const targetText = ((await page.locator("p.font-mono").last().textContent()) || "").trim();
  if (!targetText) {
    throw new Error("Typing test target text not found");
  }

  const textarea = page.locator("textarea").first();
  await textarea.fill(targetText);
  await page.getByRole("button", { name: /Finish Early/i }).click();
  await settle(page, 600);
  await page.getByRole("button", { name: /Submit Results/i }).click();
  await settle(page, 5000);
}

async function completeVideoIntro(page) {
  log("phase", "video-intro");
  await clickIfVisible(page.getByRole("button", { name: /Enable Camera/i }), 5000);
  await settle(page, 2500);
  const startRecording = page.getByRole("button", { name: /Start Recording/i }).first();
  try {
    await startRecording.waitFor({ state: "visible", timeout: 60000 });
  } catch (error) {
    await screenshot(page, "video-start-recording-missing");
    const bodyText = await page.locator("body").innerText().catch(() => "");
    await fs.writeFile(
      path.join(OUTPUT_DIR, "video-start-recording-missing.txt"),
      bodyText,
      "utf8",
    );
    throw error;
  }
  await startRecording.click();
  await page.waitForTimeout(4500);
  await page.getByRole("button", { name: /Stop Recording/i }).click();
  await settle(page, 1500);
  await page.getByRole("button", { name: /Submit Video/i }).click();
  await settle(page, 8000);
}

async function completeChatConversation(page, labels) {
  try {
    await waitForTextareaEnabled(page, 30000);
  } catch (error) {
    await screenshot(page, "chat-conversation-timeout");
    const bodyText = await page.locator("body").innerText().catch(() => "");
    await fs.writeFile(
      path.join(OUTPUT_DIR, "chat-conversation-timeout.txt"),
      bodyText,
      "utf8",
    );
    throw error;
  }
  const textarea = page.locator("textarea").first();
  const messages = labels.messages;

  for (const message of messages) {
    await textarea.fill(message);
    await page.getByRole("button", { name: labels.send }).click();
    await page.waitForTimeout(4500);
  }

  await page.getByRole("button", { name: labels.end }).click();
  await settle(page, 8000);
}

async function completeChatSimulation(page) {
  log("phase", "chat-simulation");
  await startConversationPhase(page, /Start Simulation/i);
  await completeChatConversation(page, {
    send: /Send/i,
    end: /End Simulation & Submit/i,
    messages: [
      "I'm sorry you're dealing with that billing issue. I can help. Please confirm the email on the account and whether both charges happened this month.",
      "Thank you. I can see the duplicate payment and I will flag the extra charge for refund right away.",
      "I also want to prevent this from happening again, so I am checking whether autopay retried after a failed authorization.",
      "The refund is now being submitted and you should receive a confirmation email shortly.",
      "If you would like, I can also note the account for extra monitoring and stay here for any final questions.",
    ],
  });
}

async function completeChatInterview(page) {
  log("phase", "chat-interview");
  await startConversationPhase(page, /Start Interview/i);
  await completeChatConversation(page, {
    send: /Send/i,
    end: /End Interview & Submit/i,
    messages: [
      "I enjoy support work because I like solving problems clearly and calmly for customers.",
      "My strongest skill is written communication under pressure while keeping documentation accurate.",
      "I use ChatGPT as a drafting assistant, but I always verify tone, policy, and factual accuracy before sending anything.",
      "When a customer is frustrated, I acknowledge the issue, clarify the goal, and give them a concrete next step quickly.",
      "I would be a strong fit here because I can balance empathy, speed, and careful process execution.",
    ],
  });
}

async function completeSalesSimulation(page) {
  log("phase", "sales-simulation");
  await startConversationPhase(page, /Start Meeting/i);
  await completeChatConversation(page, {
    send: /Send/i,
    end: /End Call & Submit/i,
    messages: [
      "Thanks for meeting with me. Before I jump into the product, I’d like to understand how your team is handling outbound today and where the biggest bottlenecks are.",
      "That makes sense. When reps lose time on manual follow-up and fragmented notes, pipeline visibility usually suffers too.",
      "What we help with is faster outreach, cleaner follow-up, and better coaching data so managers can spot what’s working sooner.",
      "If implementation time is the concern, we typically start with one team, import the current workflow, and measure response lift within the first few weeks.",
      "If it helps, I can outline a pilot plan with expected outcomes so you can evaluate risk before making a full commitment.",
    ],
  });
}

async function completeVoiceInterview(page) {
  log("phase", "voice-interview");
  const enabledMedia = await clickIfVisible(page.getByRole("button", { name: /Enable Camera & Microphone/i }), 10000);
  await settle(page, 1500);

  const setupWorksButton = page.getByRole("button", { name: /My Setup Works/i }).first();
  const startVideoButton = page.getByRole("button", { name: /Start Video Interview/i }).first();

  if (enabledMedia) {
    await setupWorksButton.waitFor({ state: "visible", timeout: 30000 });
  } else {
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("button")).some((button) =>
          /my setup works|start video interview/i.test(button.textContent || ""),
        ),
      undefined,
      { timeout: 30000 },
    );
  }

  if (await setupWorksButton.isVisible().catch(() => false)) {
    await setupWorksButton.click();
    await settle(page, 800);
  }

  await startVideoButton.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(
    () => {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        /start video interview/i.test(candidate.textContent || ""),
      );
      return !!button && button instanceof HTMLButtonElement && !button.disabled;
    },
    undefined,
    { timeout: 30000 },
  );
  await startVideoButton.click();

  const endInterview = page.getByRole("button", { name: /End Interview/i });
  await page.waitForFunction(
    () => {
      const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
        /end interview/i.test(candidate.textContent || ""),
      );
      return !!button && button instanceof HTMLButtonElement && !button.disabled;
    },
    undefined,
    { timeout: 60000 },
  );

  await page.waitForTimeout(25000);
  if (await endInterview.isVisible().catch(() => false)) {
    await endInterview.scrollIntoViewIfNeeded().catch(() => {});
    try {
      await endInterview.click({ timeout: 5000 });
    } catch {
      await endInterview.click({ force: true, timeout: 5000 }).catch(() => {});
    }
  }

  try {
    await page.getByText(/Processing Interview|Interview Complete!|Video Interview Submitted/i).waitFor({ timeout: 120000 });
  } catch (error) {
    await screenshot(page, "voice-completion-missing");
    const bodyText = await page.locator("body").innerText().catch(() => "");
    await fs.writeFile(
      path.join(OUTPUT_DIR, "voice-completion-missing.txt"),
      bodyText,
      "utf8",
    );
    throw error;
  }
  await page.waitForTimeout(15000);

  await clickIfVisible(page.getByRole("button", { name: /Return to Applications|Back to Application/i }), 30000);
  await settle(page, 3000);
}

async function openApplicantDetail(page, applicationId) {
  await page.goto(`${BASE_URL}/applicants/${applicationId}`, { waitUntil: "domcontentloaded" });
  await settle(page, 3000);
}

async function configureAvaInterview(page) {
  await clickIfVisible(page.getByRole("button", { name: /Configure Interview/i }), 10000);
  await settle(page, 1000);
  await page.getByRole("button", { name: /Quick screening/i }).first().click();
  await page.getByRole("button", { name: /^Next$/i }).click();
  await settle(page, 500);
  await page.getByRole("button", { name: /Start Interview/i }).click();
  await settle(page, 4000);
}

async function getJobByCode(supabaseConfig, accessToken, jobCode) {
  return supabaseSingle({
    ...supabaseConfig,
    accessToken,
    table: "jobs",
    filter: `job_code=eq.${encodeURIComponent(jobCode)}`,
    select: "id,title,job_code,workflow_steps,quiz_questions,processing_mode,passing_score",
  });
}

async function getApplicationById(supabaseConfig, accessToken, applicationId) {
  return supabaseSingle({
    ...supabaseConfig,
    accessToken,
    table: "applications",
    filter: `id=eq.${applicationId}`,
    select: "id,job_id,phase,status,notes,ai_score,phase_ai_analysis,voice_interview_result,voice_interview_transcript",
  });
}

function findStep(workflowSteps, type) {
  return Array.isArray(workflowSteps)
    ? workflowSteps.find((step) => step.type === type) || null
    : null;
}

async function runSupportFlow({ employerPage, candidatePage, supabaseConfig }) {
  const supportJobCode = await createJob(employerPage, {
    title: "Phase Engine Support Specialist",
    department: "Customer Success",
    location: "Remote",
    mustHaves: "chat support, strong typing accuracy, good written tone, comfort using ChatGPT responsibly",
    dealBreakers: "poor written communication, cannot work in computer-based tools, cannot stay calm with frustrated customers",
    extraSteps: ["Typing Test", "Video Message", "Chat Simulation", "Interview with Ava", "Ava Interview"],
  });

  const employerToken = await extractAccessToken(employerPage);
  const supportJob = await getJobByCode(supabaseConfig, employerToken, supportJobCode);

  await signUpCandidate(candidatePage, supportCandidate);
  const applicationId = await submitApplication(candidatePage, supportCandidate, supportJobCode);
  const candidateToken = await extractAccessToken(candidatePage);

  if (Array.isArray(supportJob.quiz_questions) && supportJob.quiz_questions.length > 0) {
    await candidatePage.goto(`${BASE_URL}/applications/${applicationId}/quiz/quiz`, {
      waitUntil: "domcontentloaded",
    });
    await completeQuiz(candidatePage);
  }

  const typingStep = findStep(supportJob.workflow_steps, "typing_test");
  if (typingStep) {
    await candidatePage.goto(`${BASE_URL}/applications/${applicationId}/typing-test/${typingStep.id}`, {
      waitUntil: "domcontentloaded",
    });
    await completeTypingTest(candidatePage);
  }

  const videoStep = findStep(supportJob.workflow_steps, "video_message") || findStep(supportJob.workflow_steps, "video_intro");
  if (videoStep) {
    await candidatePage.goto(`${BASE_URL}/applications/${applicationId}/video-intro/${videoStep.id}`, {
      waitUntil: "domcontentloaded",
    });
    await completeVideoIntro(candidatePage);
  }

  const chatSimulationStep = findStep(supportJob.workflow_steps, "chat_simulation");
  if (chatSimulationStep) {
    await candidatePage.goto(`${BASE_URL}/applications/${applicationId}/chat-simulation/${chatSimulationStep.id}`, {
      waitUntil: "domcontentloaded",
    });
    await completeChatSimulation(candidatePage);
  }

  const chatInterviewStep = findStep(supportJob.workflow_steps, "chat_interview");
  if (chatInterviewStep) {
    await candidatePage.goto(`${BASE_URL}/applications/${applicationId}/chat-interview/${chatInterviewStep.id}`, {
      waitUntil: "domcontentloaded",
    });
    await completeChatInterview(candidatePage);
  }

  await openApplicantDetail(employerPage, applicationId);
  await screenshot(employerPage, "support-applicant-before-voice");
  await configureAvaInterview(employerPage);

  const voiceStep = findStep(supportJob.workflow_steps, "voice_interview");
  if (voiceStep) {
    await candidatePage.goto(`${BASE_URL}/applications/${applicationId}/voice-interview/${voiceStep.id}`, {
      waitUntil: "domcontentloaded",
    });
    await completeVoiceInterview(candidatePage);
  }

  await openApplicantDetail(employerPage, applicationId);
  await screenshot(employerPage, "support-applicant-after-voice");

  const finalApplication = await getApplicationById(supabaseConfig, employerToken, applicationId);
  log(
    "support-summary",
    JSON.stringify({
      applicationId,
      status: finalApplication.status,
      phase: finalApplication.phase,
      aiScore: finalApplication.ai_score,
      hasVoiceResult: !!finalApplication.voice_interview_result,
      hasTranscript:
        Array.isArray(finalApplication.voice_interview_transcript) &&
        finalApplication.voice_interview_transcript.length > 0,
    })
  );

  const notes = typeof finalApplication.notes === "string" ? JSON.parse(finalApplication.notes || "{}") : finalApplication.notes || {};
  return {
    applicationId,
    notes,
    finalApplication,
    supportJob,
    employerToken,
    candidateToken,
  };
}

async function runSalesFlow({ employerPage, candidatePage, supabaseConfig, employerToken }) {
  const salesJobCode = await createJob(employerPage, {
    title: "Phase Engine Sales Representative",
    department: "Revenue",
    location: "Remote",
    mustHaves: "discovery skills, objection handling, confident written communication, CRM discipline",
    dealBreakers: "cannot run a structured sales conversation, avoids clarifying buyer needs, poor follow-through",
    extraSteps: ["Sales Conversation", "Interview with Ava"],
  });

  const salesJob = await getJobByCode(supabaseConfig, employerToken, salesJobCode);

  await signUpCandidate(candidatePage, salesCandidate);
  const applicationId = await submitApplication(candidatePage, salesCandidate, salesJobCode);

  if (Array.isArray(salesJob.quiz_questions) && salesJob.quiz_questions.length > 0) {
    await candidatePage.goto(`${BASE_URL}/applications/${applicationId}/quiz/quiz`, {
      waitUntil: "domcontentloaded",
    });
    await completeQuiz(candidatePage);
  }

  const salesSimulationStep = findStep(salesJob.workflow_steps, "sales_simulation");
  if (salesSimulationStep) {
    await candidatePage.goto(`${BASE_URL}/applications/${applicationId}/sales-simulation/${salesSimulationStep.id}`, {
      waitUntil: "domcontentloaded",
    });
    await completeSalesSimulation(candidatePage);
  }

  await openApplicantDetail(employerPage, applicationId);
  await screenshot(employerPage, "sales-applicant-detail");

  const finalApplication = await getApplicationById(supabaseConfig, employerToken, applicationId);
  const notes = typeof finalApplication.notes === "string" ? JSON.parse(finalApplication.notes || "{}") : finalApplication.notes || {};
  log(
    "sales-summary",
    JSON.stringify({
      applicationId,
      status: finalApplication.status,
      phase: finalApplication.phase,
      aiScore: finalApplication.ai_score,
      hasSalesSimulation: !!notes.salesSimulationResult,
      hasChatInterview: !!notes.chatInterviewResult,
    })
  );

  return { applicationId, notes, finalApplication, salesJob };
}

async function main() {
  await ensureOutputDir();
  const supabaseConfig = await getSupabaseConfig();
  let browser;
  const contexts = [];

  try {
    browser = await chromium.launch({
      channel: "chrome",
      headless: true,
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-video-capture=${FAKE_VIDEO}`,
        `--use-file-for-fake-audio-capture=${FAKE_AUDIO}`,
        "--autoplay-policy=no-user-gesture-required",
      ],
    });

    const employerContext = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
    });
    contexts.push(employerContext);
    const employerPage = await employerContext.newPage();
    employerPage.on("requestfailed", (request) => {
      void appendDebugLog(
        `[requestfailed] ${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`,
      );
    });
    employerPage.on("response", (response) => {
      const url = response.url();
      if (
        url.includes("/functions/v1/get-subscription") ||
        url.includes("/functions/v1/ai-generate-job-content") ||
        url.includes("/functions/v1/ai-generate-workflow") ||
        url.includes("/auth/v1/")
      ) {
        void appendDebugLog(`[response] ${response.status()} ${response.request().method()} ${url}`);
      }
    });
    employerPage.on("console", (message) => {
      const text = message.text();
      if (/subscription|auth|session|get-subscription|loading|generate-job|generate-workflow/i.test(text)) {
        void appendDebugLog(`[console:${message.type()}] ${text}`);
      }
    });
    await signUpEmployer(employerPage);

    const supportCandidateContext = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      permissions: ["camera", "microphone"],
    });
    contexts.push(supportCandidateContext);
    const supportCandidatePage = await supportCandidateContext.newPage();
    supportCandidatePage.on("requestfailed", (request) => {
      const url = request.url();
      if (/ai-chat|trigger-ava-analysis|candidate-interview-response|ava-voice-session/i.test(url)) {
        void appendDebugLog(
          `[candidate-requestfailed] ${request.method()} ${url} :: ${request.failure()?.errorText ?? "unknown"}`,
        );
      }
    });
    supportCandidatePage.on("response", (response) => {
      const url = response.url();
      if (/ai-chat|trigger-ava-analysis|candidate-interview-response|ava-voice-session/i.test(url)) {
        void appendDebugLog(`[candidate-response] ${response.status()} ${response.request().method()} ${url}`);
      }
    });
    supportCandidatePage.on("console", (message) => {
      const text = message.text();
      if (/chat simulation|chat interview|voice interview|submit|analysis|error/i.test(text)) {
        void appendDebugLog(`[candidate-console:${message.type()}] ${text}`);
      }
    });

    const supportResults = await runSupportFlow({
      employerPage,
      candidatePage: supportCandidatePage,
      supabaseConfig,
    });

    const salesCandidateContext = await browser.newContext({
      viewport: { width: 1440, height: 1100 },
      permissions: ["camera", "microphone"],
    });
    contexts.push(salesCandidateContext);
    const salesCandidatePage = await salesCandidateContext.newPage();
    salesCandidatePage.on("requestfailed", (request) => {
      const url = request.url();
      if (/ai-chat|ai-sales-simulation|trigger-ava-analysis/i.test(url)) {
        void appendDebugLog(
          `[sales-requestfailed] ${request.method()} ${url} :: ${request.failure()?.errorText ?? "unknown"}`,
        );
      }
    });
    salesCandidatePage.on("response", (response) => {
      const url = response.url();
      if (/ai-chat|ai-sales-simulation|trigger-ava-analysis/i.test(url)) {
        void appendDebugLog(`[sales-response] ${response.status()} ${response.request().method()} ${url}`);
      }
    });

    const salesResults = await runSalesFlow({
      employerPage,
      candidatePage: salesCandidatePage,
      supabaseConfig,
      employerToken: supportResults.employerToken,
    });

    await fs.writeFile(
      path.join(OUTPUT_DIR, "summary.json"),
      JSON.stringify(
        {
          employer,
          supportCandidate,
          salesCandidate,
          supportResults: {
            applicationId: supportResults.applicationId,
            status: supportResults.finalApplication.status,
            phase: supportResults.finalApplication.phase,
            aiScore: supportResults.finalApplication.ai_score,
            noteKeys: Object.keys(supportResults.notes || {}),
          },
          salesResults: {
            applicationId: salesResults.applicationId,
            status: salesResults.finalApplication.status,
            phase: salesResults.finalApplication.phase,
            aiScore: salesResults.finalApplication.ai_score,
            noteKeys: Object.keys(salesResults.notes || {}),
          },
        },
        null,
        2
      )
    );

    log("done", OUTPUT_DIR);
  } finally {
    await Promise.all(
      contexts.map(async (context) => {
        try {
          await context.close();
        } catch {
          // Ignore cleanup failures.
        }
      }),
    );

    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore cleanup failures.
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
