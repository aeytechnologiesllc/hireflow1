import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "https://hireflow1-iota.vercel.app";
const OUTPUT_DIR =
  process.env.OUTPUT_DIR ||
  "/Users/shahz/Documents/HIreFlow/hireflow1_codex/output/playwright/autopilot-handoff-check";
const timestamp = Date.now();

const employer = {
  name: "Autopilot Handoff Employer",
  email: `autopilot.employer.${timestamp}@mailinator.com`,
  password: "CodexTest123!",
};

const candidate = {
  name: "Autopilot Candidate",
  email: `autopilot.candidate.${timestamp}@mailinator.com`,
  password: "CodexTest123!",
};

function log(step, details = "") {
  const suffix = details ? `: ${details}` : "";
  console.log(`[autopilot-check] ${step}${suffix}`);
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
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
      // Try next file.
    }
  }

  throw new Error(`Could not find ${key}`);
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

async function invokeEdgeFunction({ url, anonKey, accessToken, functionName, body }) {
  const response = await fetch(`${url}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`${functionName} failed: ${response.status} ${JSON.stringify(data)}`);
  }

  return data;
}

async function invokeEdgeFunctionFromPage(page, { url, anonKey, functionName, body }) {
  return page.evaluate(
    async ({ functionUrl, anonKey, payload }) => {
      const authStorageKey = Object.keys(localStorage).find((key) => key.includes("-auth-token"));
      if (!authStorageKey) {
        return { ok: false, error: "auth token not found in page localStorage" };
      }

      const rawSession = JSON.parse(localStorage.getItem(authStorageKey) || "null");
      const accessToken =
        rawSession?.access_token ||
        rawSession?.currentSession?.access_token ||
        rawSession?.session?.access_token ||
        null;

      if (!accessToken) {
        return { ok: false, error: "access token missing from page localStorage" };
      }

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        text,
      };
    },
    {
      functionUrl: `${url}/functions/v1/${functionName}`,
      anonKey,
      payload: body,
    },
  );
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

async function openWorkflowEditor(page) {
  const screeningPlanButton = page.getByRole("button", { name: /^Screening Plan$/ }).first();
  if (await screeningPlanButton.isVisible().catch(() => false)) {
    await screeningPlanButton.click();
    await settle(page, 1200);
    return;
  }

  const editButton = page.getByRole("button", { name: /^Edit Screening Plan$/i }).first();
  if (await editButton.isVisible().catch(() => false)) {
    await editButton.click();
    await settle(page, 1200);
    return;
  }

  throw new Error("Workflow editor button not found");
}

async function addWorkflowStepIfAvailable(page, label) {
  const addStep = page.getByRole("button", { name: /^Add Step$/i }).first();
  if (!(await addStep.isVisible().catch(() => false))) return false;

  await addStep.click();
  await settle(page, 400);

  const option = page.getByRole("button", { name: new RegExp(label, "i") }).first();
  if (await option.isVisible().catch(() => false)) {
    await option.click();
    await settle(page, 700);
    return true;
  }

  await page.keyboard.press("Escape").catch(() => {});
  return false;
}

async function createJob(page, config) {
  await ensureEmployerCreateJobAccess(page);
  await page.locator("#title").waitFor({ state: "visible", timeout: 30000 });
  log("create-job-form-ready");

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

  const generateButton = page.getByRole("button", { name: /Generate Full Draft|Regenerate Full Draft/i }).first();
  await generateButton.waitFor({ state: "visible", timeout: 30000 });
  log("create-job-generate-click");
  await generateButton.click();
  log("create-job-wait-review");
  await waitForReviewStep(page);
  log("create-job-review-ready");

  if (config.extraSteps.length > 0) {
    await openWorkflowEditor(page);
    log("create-job-workflow-open");
    for (const stepLabel of config.extraSteps) {
      log("create-job-add-step", stepLabel);
      await addWorkflowStepIfAvailable(page, stepLabel);
    }

    const nextButton = page.getByRole("button", { name: /^Next$/i }).last();
    if (await nextButton.isVisible().catch(() => false)) {
      log("create-job-next");
      await nextButton.click();
      await waitForReviewStep(page);
    }
  }

  const publishButton = page.getByRole("button", { name: /Publish Job/i }).first();
  await publishButton.waitFor({ state: "visible", timeout: 30000 });
  log("create-job-publish-ready");
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
      /publish job/i.test(candidate.textContent || ""),
    );
    return !!button && button instanceof HTMLButtonElement && !button.disabled;
  }, undefined, { timeout: 30000 });
  log("create-job-publish-click");
  await publishButton.click();

  await page.getByText(/Your Job is Live!/i).waitFor({ timeout: 30000 });
  log("create-job-live-dialog");
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
      await textarea.fill("I have customer support experience, strong written communication, and I can learn quickly.");
    }
  }

  const numberInputs = page.locator("input[type='number']");
  const numberInputCount = await numberInputs.count();
  for (let index = 0; index < numberInputCount; index += 1) {
    const input = numberInputs.nth(index);
    if (!(await input.isVisible().catch(() => false))) continue;
    const currentValue = await input.inputValue().catch(() => "");
    if (!currentValue.trim()) {
      await input.fill("2");
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
      await input.fill("Customer support and written communication");
    }
  }
}

async function createResumeFile() {
  const resumePath = path.join(OUTPUT_DIR, `${candidate.email.replace(/[@.]/g, "_")}-resume.png`);
  await fs.writeFile(
    resumePath,
    await fs.readFile("/Users/shahz/Documents/HIreFlow/hireflow1_codex/src/assets/ava-orb.png")
  );
  return resumePath;
}

async function submitApplication(page, jobCode) {
  await page.goto(`${BASE_URL}/candidate/apply?code=${jobCode}`, { waitUntil: "domcontentloaded" });
  await settle(page, 1500);
  log("candidate-apply-page", page.url());
  await clickIfVisible(page.getByRole("button", { name: /Find Position/i }), 1500);
  log("candidate-find-position-clicked");
  await settle(page, 1000);
  await clickIfVisible(page.getByRole("button", { name: /Continue to application/i }), 8000);
  log("candidate-continue-clicked", page.url());
  await settle(page, 1000);

  if (/\/candidate\/auth/i.test(page.url())) {
    log("candidate-sign-in-needed");
    await signInOnCurrentPage(page, candidate.email, candidate.password);
    await completeCandidateOnboarding(page);
    await settle(page, 1000);
    await clickIfVisible(page.getByRole("button", { name: /Apply Now/i }), 8000);
    log("candidate-apply-now-after-auth", page.url());
  } else {
    await clickIfVisible(page.getByRole("button", { name: /Apply Now/i }), 8000);
    log("candidate-apply-now-direct", page.url());
  }

  try {
    await page.waitForFunction(
      () =>
        document.body.innerText.includes("Complete Your Application") ||
        document.body.innerText.includes("Submit Application"),
      undefined,
      { timeout: 30000 },
    );
  } catch (error) {
    await screenshot(page, "candidate-application-form-timeout");
    const bodyText = await page.locator("body").innerText().catch(() => "");
    throw new Error(
      `Application form did not appear from ${page.url()}. Body preview: ${bodyText.slice(0, 500)}`,
      { cause: error },
    );
  }
  log("candidate-application-form-ready", page.url());

  await fillVisibleApplicationFields(page);
  const resumePath = await createResumeFile();
  await page.locator("input[type='file']").last().setInputFiles(resumePath);
  await page.getByText(/Uploading\.\.\./i).waitFor({ state: "hidden", timeout: 45000 }).catch(() => {});
  await page.getByRole("button", { name: /Submit Application/i }).click();

  await page.waitForFunction(
    () =>
      document.body.innerText.includes("reviewing your submission") ||
      /\/applications\/[a-f0-9-]+$/i.test(window.location.pathname),
    undefined,
    { timeout: 60000 },
  );
  await settle(page, 3000);

  const match = page.url().match(/\/applications\/([a-f0-9-]+)/i);
  if (!match) {
    throw new Error(`Application id not found in URL: ${page.url()}`);
  }

  return match[1];
}

async function setProcessingMode(page, mode) {
  await page.goto(`${BASE_URL}/jobs`, { waitUntil: "domcontentloaded" });
  await settle(page, 2500);

  const buttonName = mode === "manual" ? /Take Control/i : /Engage Autopilot/i;
  const button = page.getByRole("button", { name: buttonName }).first();
  await button.waitFor({ state: "visible", timeout: 30000 });
  await button.click();
  await settle(page, 600);

  if (mode === "manual") {
    await page.getByRole("button", { name: /^Take Control$/i }).click();
    await settle(page, 3500);
    return { preview: null };
  }

  const dialog = page.locator('[role="dialog"]').last();
  await dialog.waitFor({ state: "visible", timeout: 10000 });
  const previewText = await dialog.innerText();
  await screenshot(page, "autopilot-preview");
  await page.getByRole("button", { name: /^Engage Autopilot$/i }).click();
  await settle(page, 5000);
  return { preview: previewText };
}

async function getApplicationById(supabaseConfig, accessToken, applicationId) {
  return supabaseSingle({
    ...supabaseConfig,
    accessToken,
    table: "applications",
    filter: `id=eq.${applicationId}`,
    select: "id,job_id,phase,status,notes,resume_url,cover_letter,ai_score,phase_ai_analysis,ai_analysis,rejected_by_type",
  });
}

async function run() {
  await ensureOutputDir();
  const supabaseConfig = await getSupabaseConfig();
  let browser;

  try {
    log("launch-browser");
    browser = await chromium.launch({ headless: true });
    const employerContext = await browser.newContext();
    const candidateContext = await browser.newContext();
    const employerPage = await employerContext.newPage();
    const candidatePage = await candidateContext.newPage();

    employerPage.on("request", (request) => {
      const url = request.url();
      if (!url.includes("/functions/v1/autopilot-batch")) return;
      const headers = request.headers();
      const authorization = headers.authorization || headers.Authorization || "";
      log(
        "employer-autopilot-batch-request",
        authorization
          ? `${authorization.slice(0, 16)}... len=${authorization.length}`
          : "no authorization header",
      );
    });

    employerPage.on("response", async (response) => {
      const url = response.url();
      if (!url.includes("/functions/v1/autopilot-batch")) return;
      const status = response.status();
      const body = await response.text().catch(() => "");
      log("employer-autopilot-batch-response", `${status} ${body.slice(0, 1000)}`);
    });

    candidatePage.on("response", async (response) => {
      const url = response.url();
      if (!url.includes("/rest/v1/applications")) return;
      const status = response.status();
      const body = status >= 400 ? await response.text().catch(() => "") : "";
      log("candidate-applications-response", `${status} ${url}${body ? ` :: ${body.slice(0, 240)}` : ""}`);
    });

    log("sign-up-employer", employer.email);
    await signUpEmployer(employerPage);
    log("complete-employer-onboarding");
    try {
      await completeEmployerOnboarding(employerPage);
    } catch (error) {
      log("complete-employer-onboarding-fallback", error instanceof Error ? error.message : "unknown");
    }

    log("create-job");
    const jobCode = await createJob(employerPage, {
      title: "Autopilot Evidence-Gated Support Role",
      department: "Customer Success",
      location: "Remote",
      mustHaves: "chat support, strong writing, professionalism, comfort using digital tools",
      dealBreakers: "hostile tone, inability to use computer-based tools",
      extraSteps: [],
    });
    log("job-created", jobCode);

    log("switch-manual");
    await setProcessingMode(employerPage, "manual");
    const employerToken = await extractAccessToken(employerPage);

    log("sign-up-candidate", candidate.email);
    await signUpCandidate(candidatePage);
    log("submit-application");
    const applicationId = await submitApplication(candidatePage, jobCode);
    log("application-submitted", applicationId);
    await settle(employerPage, 2000);

    log("fetch-before");
    const before = await getApplicationById(supabaseConfig, employerToken, applicationId);
    const previewProbe = await invokeEdgeFunctionFromPage(employerPage, {
      ...supabaseConfig,
      functionName: "autopilot-batch",
      body: {
        jobId: before.job_id,
        previewOnly: true,
      },
    });
    log("switch-autopilot");
    const { preview } = await setProcessingMode(employerPage, "auto");
    log("autopilot-preview-ready");
    await settle(employerPage, 4000);
    log("fetch-after");
    const after = await getApplicationById(supabaseConfig, employerToken, applicationId);

    log("check-candidate-view");
    await candidatePage.goto(`${BASE_URL}/applications/${applicationId}`, { waitUntil: "domcontentloaded" });
    await settle(candidatePage, 2500);
    const candidateBody = await candidatePage.locator("body").innerText().catch(() => "");
    await screenshot(candidatePage, "candidate-after-autopilot");

    const result = {
      employerEmail: employer.email,
      candidateEmail: candidate.email,
      jobCode,
      applicationId,
      before: {
        phase: before.phase,
        status: before.status,
        ai_score: before.ai_score,
        has_resume_url: !!before.resume_url,
        has_cover_letter: !!before.cover_letter,
        notes_keys: before.notes ? Object.keys(typeof before.notes === "string" ? JSON.parse(before.notes) : before.notes) : [],
      },
      after: {
        phase: after.phase,
        status: after.status,
        ai_score: after.ai_score,
        rejected_by_type: after.rejected_by_type,
        phase_ai_analysis: after.phase_ai_analysis,
        has_resume_url: !!after.resume_url,
        has_cover_letter: !!after.cover_letter,
        notes_keys: after.notes ? Object.keys(typeof after.notes === "string" ? JSON.parse(after.notes) : after.notes) : [],
      },
      rawPreview: previewProbe.ok ? JSON.parse(previewProbe.text) : null,
      rawPreviewError: previewProbe.ok ? null : `${previewProbe.status}: ${previewProbe.text}`,
      preview,
      candidateRejectedView:
        /rejected|not selected|did not move forward/i.test(candidateBody) &&
        !/continue|next phase|awaiting review/i.test(candidateBody),
    };

    await fs.writeFile(path.join(OUTPUT_DIR, "result.json"), JSON.stringify(result, null, 2), "utf8");
    log("done");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

run().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
