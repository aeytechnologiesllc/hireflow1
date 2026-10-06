#!/usr/bin/env node
/**
 * The Back button on the candidate flow, in a real browser
 * (docs/SHORT-JOB-LINKS.md §2). Owner, 2026-10-06: applicants "could hit the
 * back button or get confused easily".
 *
 * What it proves:
 *   - every automatic hop REPLACES its history entry: the root to the one job,
 *     an old code link and an old /candidate/job/:id link to the short link,
 *     sign-in back to the job and the job into the application, a refused
 *     step to the application, a sent step to the next one;
 *   - so Back never lands on a page that sends the person forward again, on
 *     the job-code box, on the sign-in screen while signed in, or on a blank
 *     page; from the job page it leaves the site.
 *
 * Two kinds of visit:
 *   - signed out, against the LIVE job (hireflownow.com/team-lead, read with
 *     the publishable key): nothing is written, and every non-GET request to
 *     the database is blocked by this script before it leaves the browser;
 *   - signed in, through the dev preview's candidate fixtures (offline,
 *     src/dev-preview/), with one fixture job given the short link "server"
 *     for this run only.
 *
 *   node scripts/short_job_links_back_check.mjs            # starts vite on 8152
 *   BASE_URL=http://127.0.0.1:8151 node scripts/short_job_links_back_check.mjs
 *
 * Not part of the CI suite: it needs a browser and the live job.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8152);
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const VITE_BIN = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
const LIVE_SLUG = process.env.LIVE_SLUG || "team-lead";
const LIVE_CODE = process.env.LIVE_CODE || "JOB-C84E85";
const LIVE_JOB_ID = process.env.LIVE_JOB_ID || "02f91311-a3a4-461c-a52d-5893cef7a9f3";
// Fixture ids (src/dev-preview/ids.ts).
const FIXTURE_SERVER_JOB = "20000000-0000-4000-8000-000000000002";
const FIXTURE_APP_OFFERED = "30000000-0000-4000-8000-000000000010"; // the candidate's one Server application
// Zulu scenario: the form is sent and the skills check is open.
const FIXTURE_APP_FORM_SENT = "30000000-0000-4000-8000-000000000016";
const FIXTURE_APP_NOT_YET = "30000000-0000-4000-8000-000000000001"; // still on the form
const DEADLINE_MS = 240_000;

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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pathOf = (url) => {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
};

let vite = null;
async function startVite() {
  if (process.env.BASE_URL) return;
  vite = spawn(process.execPath, [VITE_BIN, "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  vite.stdout.on("data", () => {});
  vite.stderr.on("data", () => {});
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await wait(300);
  }
  throw new Error(`vite did not come up on ${BASE}`);
}
function stopVite() {
  if (vite && vite.exitCode === null) vite.kill("SIGTERM");
}

/** Nothing this check does may write to the database: every non-GET request
 *  to Supabase, and every edge function call, is stopped in the browser. */
async function readOnly(context, blocked) {
  await context.route(/supabase\.co\//, (route) => {
    const req = route.request();
    const url = req.url();
    const isRead = ["GET", "HEAD", "OPTIONS"].includes(req.method());
    if (isRead && !url.includes("/functions/v1/")) return route.continue();
    blocked.push(`${req.method()} ${url.replace(/\?.*/, "")}`);
    return route.abort();
  });
}

/** Wait until the address is `want` (a path, or a predicate on the path). */
async function waitForPath(page, want, timeout = 15_000) {
  const ok = typeof want === "function" ? want : (p) => p === want;
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (ok(pathOf(page.url()))) return true;
    await wait(100);
  }
  return false;
}

/** Back, then make sure the page stays put (no bounce forward). */
async function backAndHold(page, ms = 1500) {
  await page.goBack({ waitUntil: "commit" }).catch(() => null);
  await wait(ms);
  return page.url();
}

async function freshPage(context) {
  const page = await context.newPage();
  await page.goto("about:blank");
  return page;
}

/** A recovery link's hash, as Supabase's verify step appends it. */
function recoveryHash() {
  const now = Math.floor(Date.now() / 1000);
  return `#access_token=fake-recovery-token&expires_at=${now + 3600}&expires_in=3600&refresh_token=fake-refresh&token_type=bearer&type=recovery`;
}

const FAKE_USER = {
  id: "00000000-0000-4000-8000-0000000000aa",
  aud: "authenticated",
  role: "authenticated",
  email: "applicant@example.com",
  app_metadata: { provider: "email" },
  user_metadata: { full_name: "Test Applicant" },
  created_at: "2026-10-06T00:00:00Z",
};

/**
 * Answers Supabase's auth endpoints inside the browser, so a password reset
 * can be walked end to end with nothing sent: the reset request is recorded,
 * the recovery session and the new password are accepted, and the signed-in
 * reads that follow use the public key (the fake token would be refused) and
 * see a candidate with no applications.
 */
async function fakeAuth(page, recover) {
  const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route(/supabase\.co\/auth\/v1\//, (route) => {
    const url = route.request().url();
    if (url.includes("/auth/v1/recover")) {
      recover.push(new URL(url).searchParams.get("redirect_to") ?? "");
      return route.fulfill(json({}));
    }
    if (url.includes("/auth/v1/user")) return route.fulfill(json(FAKE_USER));
    if (url.includes("/auth/v1/logout")) return route.fulfill({ status: 204, body: "" });
    return route.abort();
  });
  await page.route(/supabase\.co\/rest\/v1\//, (route) => {
    const req = route.request();
    const url = req.url();
    if (!["GET", "HEAD"].includes(req.method())) {
      // Stopped here, like every write in this check (a real candidate's
      // Apply would create their application at this point).
      console.log(`        (stopped ${req.method()} ${url.replace(/\?.*/, "").replace(/^.*\/rest\/v1\//, "rest/v1/")})`);
      return route.abort();
    }
    if (url.includes("/rest/v1/user_roles")) return route.fulfill(json([{ role: "candidate" }]));
    if (url.includes("/rest/v1/applications") || url.includes("/rest/v1/team_members")) return route.fulfill(json([]));
    const headers = { ...req.headers() };
    delete headers.authorization;
    return route.continue({ headers });
  });
}

/** On the reset form: type a new password twice and save. */
async function setNewPassword(page) {
  const field = page.locator("#new-password");
  await field.waitFor({ timeout: 15_000 }).catch(() => null);
  if (!(await field.isVisible().catch(() => false))) return false;
  await field.fill("NewPassw0rd!");
  await page.locator("#confirm-new-password").fill("NewPassw0rd!");
  await page.getByRole("button", { name: "Save password and sign in" }).click();
  return true;
}

async function signedOutChecks(browser) {
  console.log(`\nSigned out, against the live job (${BASE})`);
  const blocked = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await readOnly(context, blocked);
  // Remember whether the job-code box was ever on screen.
  await context.addInitScript(() => {
    const look = () => {
      if (document.body && /Enter your job code/.test(document.body.innerText || "")) {
        sessionStorage.setItem("__sawCodeBox", "1");
      }
    };
    new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true });
  });

  // 1. The root with one open job.
  {
    const page = await freshPage(context);
    await page.goto(`${BASE}/`);
    check("hireflownow.com/ opens the one open job", await waitForPath(page, `/${LIVE_SLUG}`), pathOf(page.url()));
    check("by replacing the root (history: blank page + the job)", (await page.evaluate(() => history.length)) === 2);
    await page.getByRole("button", { name: "Apply Now" }).waitFor({ timeout: 15_000 }).catch(() => null);
    check("the job page shows its Apply button", await page.getByRole("button", { name: "Apply Now" }).isVisible().catch(() => false));
    check("a stranger sees no 'Back to Apply' (the code box)", !(await page.getByRole("button", { name: /Back to Apply/ }).count()));
    const back = await backAndHold(page);
    check("Back from the job leaves the site (no bounce to the root)", back === "about:blank", back);
    await page.close();
  }

  // 2. An old code link.
  {
    const page = await freshPage(context);
    await page.goto(`${BASE}/candidate/apply?code=${LIVE_CODE}`);
    check("/candidate/apply?code=… forwards to the short link", await waitForPath(page, `/${LIVE_SLUG}`), pathOf(page.url()));
    check("the code box never showed on the way", !(await page.evaluate(() => sessionStorage.getItem("__sawCodeBox"))));
    check("by replacing the old link", (await page.evaluate(() => history.length)) === 2);
    const back = await backAndHold(page);
    check("Back leaves the site, never the code box", back === "about:blank", back);
    await page.close();
  }

  // 3. An old job link.
  {
    const page = await freshPage(context);
    await page.goto(`${BASE}/candidate/job/${LIVE_JOB_ID}`);
    check("/candidate/job/:id forwards to the short link", await waitForPath(page, `/${LIVE_SLUG}`), pathOf(page.url()));
    const back = await backAndHold(page);
    check("Back leaves the site", back === "about:blank", back);
    await page.close();
  }

  // 4. Typed another way.
  {
    const page = await freshPage(context);
    await page.goto(`${BASE}/${LIVE_SLUG.toUpperCase()}/`);
    check("/TEAM-LEAD/ settles on /team-lead", await waitForPath(page, `/${LIVE_SLUG}`), pathOf(page.url()));
    await page.close();
  }

  // 5. Apply, signed out → sign-in → Back.
  {
    const page = await freshPage(context);
    await page.goto(`${BASE}/${LIVE_SLUG}`);
    const apply = page.getByRole("button", { name: "Apply Now" });
    await apply.waitFor({ timeout: 15_000 });
    const jobTitle = ((await page.locator("h1").first().textContent().catch(() => "")) || "").trim();
    await apply.click();
    const want = `/candidate/auth?redirect=${encodeURIComponent(`/${LIVE_SLUG}?apply=1`)}&tab=signup`;
    check("Apply opens sign-in with the way back to this job", await waitForPath(page, want), pathOf(page.url()));
    await page.getByRole("heading", { name: "Create your account" }).waitFor({ timeout: 10_000 }).catch(() => null);
    check("...on Sign Up (a stranger from a job link has no account yet)", await page.getByRole("heading", { name: "Create your account" }).isVisible().catch(() => false));
    check(
      `...naming the job ("${jobTitle}"), not "Candidate Portal"`,
      !!jobTitle && (await page.getByRole("heading", { name: jobTitle }).isVisible().catch(() => false)) && !(await page.getByText("Candidate Portal").count()),
    );
    await page.getByRole("link", { name: "Back to the job" }).waitFor({ timeout: 10_000 }).catch(() => null);
    check("sign-in's back link is the job, not the portal", await page.getByRole("link", { name: "Back to the job" }).isVisible().catch(() => false));
    const back = await backAndHold(page);
    check("Back from sign-in is the job page, and it stays", pathOf(back) === `/${LIVE_SLUG}`, back);
    await page.close();
  }

  // 5b. On a phone, Apply follows the reader down the long description.
  {
    const page = await freshPage(context);
    await page.goto(`${BASE}/${LIVE_SLUG}`);
    await page.getByRole("button", { name: "Apply Now" }).waitFor({ timeout: 15_000 });
    const bar = page.getByTestId("sticky-apply");
    check("at the top, the Apply card is on screen and there is no bar", !(await bar.count()));
    await page.mouse.wheel(0, 20_000);
    await bar.waitFor({ timeout: 5_000 }).catch(() => null);
    check("read to the end: the Apply bar is there", await bar.isVisible().catch(() => false));
    check("...with the one Apply button in it", await bar.getByRole("button", { name: "Apply Now" }).isVisible().catch(() => false));
    await page.mouse.wheel(0, -40_000);
    await bar.waitFor({ state: "detached", timeout: 5_000 }).catch(() => null);
    check("back at the top: the bar leaves again", !(await bar.count()));
    await page.close();
  }

  // 6. A name no job has.
  {
    const page = await freshPage(context);
    await page.goto(`${BASE}/no-such-role`);
    const heading = page.getByRole("heading", { name: "This role isn’t open" });
    await heading.waitFor({ timeout: 15_000 }).catch(() => null);
    check("/no-such-role says the role isn't open (not a blank page)", await heading.isVisible().catch(() => false));
    await page.getByRole("button", { name: "See open roles" }).click();
    check("'See open roles' with one job opens it", await waitForPath(page, `/${LIVE_SLUG}`), pathOf(page.url()));
    const back = await backAndHold(page);
    check("Back returns to the not-open page and stays (no loop)", pathOf(back) === "/no-such-role", back);
    await page.close();
  }

  // 6b. Forgot password in the middle of applying: the new password brings
  //     them back to the job, never to the job-code box. Supabase's auth
  //     endpoints are answered inside the browser (nothing is sent).
  {
    const page = await freshPage(context);
    const recover = [];
    await fakeAuth(page, recover);
    await page.goto(`${BASE}/${LIVE_SLUG}`);
    await page.getByRole("button", { name: "Apply Now" }).click();
    await page.getByRole("button", { name: "Sign In" }).first().click();
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.locator("#forgot-email").fill("applicant@example.com");
    await page.getByRole("button", { name: "Send Reset Link" }).click();
    await page.getByText("Check your email for the reset link").waitFor({ timeout: 10_000 }).catch(() => null);
    const redirectTo = recover[0] ?? "";
    check(
      "the reset link carries the job",
      redirectTo.endsWith(`/candidate/auth?reset=true&redirect=${encodeURIComponent(`/${LIVE_SLUG}?apply=1`)}`),
      redirectTo,
    );
    check(
      "...and so does this browser",
      (await page.evaluate(() => JSON.parse(localStorage.getItem("hf-candidate-reset-redirect") || "{}").target)) === `/${LIVE_SLUG}?apply=1`,
    );

    // The emailed link, opened in this browser by a mail app that dropped the
    // query string: the browser's copy still knows the job.
    await page.goto(`${BASE}/candidate/auth?reset=true${recoveryHash()}`);
    const lands = await setNewPassword(page);
    check("reset form shown; after the new password they are back on the job", lands && (await waitForPath(page, (p) => p.startsWith(`/${LIVE_SLUG}`))), pathOf(page.url()));
    check("not on /candidate, /apply or the code box", !/^\/(candidate|apply)/.test(pathOf(page.url())) && !(await page.evaluate(() => sessionStorage.getItem("__sawCodeBox"))));
    await page.close();
  }
  {
    // The link opened in ANOTHER browser (no stored copy): the link's own
    // ?redirect= brings them back.
    const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const otherBlocked = [];
    await readOnly(other, otherBlocked);
    const page = await freshPage(other);
    await fakeAuth(page, []);
    await page.goto(`${BASE}/candidate/auth?reset=true&redirect=${encodeURIComponent(`/${LIVE_SLUG}?apply=1`)}${recoveryHash()}`);
    const lands = await setNewPassword(page);
    check("another browser: the link's own redirect brings them to the job", lands && (await waitForPath(page, (p) => p.startsWith(`/${LIVE_SLUG}`))), pathOf(page.url()));
    await page.close();

    // No job at all: their own applications, not the portal's code box.
    const page2 = await freshPage(other);
    await fakeAuth(page2, []);
    await page2.goto(`${BASE}/candidate/auth?reset=true${recoveryHash()}`);
    const lands2 = await setNewPassword(page2);
    check("no job to return to: their applications, never /candidate or /apply", lands2 && (await waitForPath(page2, "/applications")), pathOf(page2.url()));
    await page2.close();
    check("nothing tried to write to the database (other browser)", otherBlocked.length === 0, otherBlocked.join("; "));
    await other.close();
  }

  // 7. The staff host keeps its NotFound.
  {
    const page = await freshPage(context);
    const staff = BASE.replace("127.0.0.1", "staff.localhost");
    for (const p of ["/no-such-page", `/${LIVE_SLUG}`]) {
      await page.goto(`${staff}${p}`);
      const notFound = page.getByText("Oops! Page not found");
      await notFound.waitFor({ timeout: 15_000 }).catch(() => null);
      check(`staff host ${p} is NotFound`, await notFound.isVisible().catch(() => false), pathOf(page.url()));
    }
    await page.close();
  }

  check("nothing tried to write to the database", blocked.length === 0, blocked.join("; "));
  await context.close();
}

/** A browser context in which every page load is a dev-preview load as the
 *  fixture candidate, whatever URL the app moves to (a full reload, such as
 *  "Start <next step>", would otherwise drop the query). */
async function previewContext(browser, blocked, scenario = null) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await readOnly(context, blocked);
  await context.addInitScript((scenarioName) => {
    const url = new URL(window.location.href);
    if (url.protocol.startsWith("http") && !url.searchParams.has("__preview")) {
      url.searchParams.set("__preview", "1");
      url.searchParams.set("__previewRole", "candidate");
      if (scenarioName) url.searchParams.set("__previewScenario", scenarioName);
      history.replaceState(history.state, "", url);
    }
  }, scenario);
  return context;
}

function stripPreview(url) {
  const u = new URL(url);
  for (const key of ["__preview", "__previewRole", "__previewScenario"]) u.searchParams.delete(key);
  const q = u.searchParams.toString();
  return `${u.pathname}${q ? `?${q}` : ""}`;
}

async function waitClean(page, want, timeout = 15_000) {
  const ok = typeof want === "function" ? want : (p) => p === want;
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (page.url() !== "about:blank" && ok(stripPreview(page.url()))) return true;
    await wait(100);
  }
  return false;
}

async function signedInChecks(browser) {
  console.log("\nSigned in as the dev preview's candidate (offline fixtures)");
  const blocked = [];
  const context = await previewContext(browser, blocked);
  // For this run only, the fixture Server job has a short link.
  await context.route(/\/src\/dev-preview\/fixtures\.ts/, async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace('job_code: "SERVER-ELM",', 'job_code: "SERVER-ELM",\n  slug: "server",');
    await route.fulfill({ response: res, body });
  });

  // 1. Sign-in brings them back with ?apply=1: straight into their application.
  {
    const page = await freshPage(context);
    await page.goto(`${BASE}/server`);
    await page.getByRole("button", { name: "Apply Now" }).waitFor({ timeout: 15_000 });
    check("a signed-in candidate's way back is their applications", await page.getByRole("button", { name: "Your applications" }).isVisible());
    await page.goto(`${BASE}/candidate/auth?redirect=${encodeURIComponent("/server?apply=1")}`);
    check(
      "sign-in → the job → their application, by itself",
      await waitClean(page, `/applications/${FIXTURE_APP_OFFERED}`),
      stripPreview(page.url()),
    );
    check("both hops replaced the sign-in entry (history: blank, job, application)", (await page.evaluate(() => history.length)) === 3);
    const back = await backAndHold(page);
    check("Back is the job page, and it stays (no sign-in, no bounce)", back !== "about:blank" && stripPreview(back) === "/server", back);
    const back2 = await backAndHold(page);
    check("Back again leaves the site", back2 === "about:blank", back2);
    await page.close();
  }

  // 2. An old job link, signed in.
  {
    const page = await freshPage(context);
    await page.goto(`${BASE}/candidate/job/${FIXTURE_SERVER_JOB}`);
    check("/candidate/job/:id → /server, signed in too", await waitClean(page, "/server"), stripPreview(page.url()));
    check("by replacing", (await page.evaluate(() => history.length)) === 2);
    await page.close();
  }

  // 3. A sent step → "Start <next step>" replaces it.
  {
    const zulu = await previewContext(browser, blocked, "zulu");
    const page = await freshPage(zulu);
    await page.goto(`${BASE}/applications/${FIXTURE_APP_FORM_SENT}`);
    await wait(1500);
    await page.goto(`${BASE}/applications/${FIXTURE_APP_FORM_SENT}/application/application`);
    const start = page.getByRole("button", { name: /^Start / });
    await start.waitFor({ timeout: 20_000 }).catch(() => null);
    const label = (await start.textContent().catch(() => "")) || "";
    check(`the sent form offers the next step ("${label.trim()}")`, /^Start /.test(label.trim()));
    if (/^Start /.test(label.trim())) {
      await start.click();
      check(
        "it opens the next step",
        await waitClean(page, (p) => p.startsWith(`/applications/${FIXTURE_APP_FORM_SENT}/`) && !p.endsWith("/application/application")),
        stripPreview(page.url()),
      );
      const back = await backAndHold(page);
      check("Back from the next step is the application, not the sent step", stripPreview(back) === `/applications/${FIXTURE_APP_FORM_SENT}`, back);
    }
    await page.close();
    await zulu.close();
  }

  // 4. A step that is not open yet (an old link) → its refusal is replaced.
  {
    const page = await freshPage(context);
    await page.goto(`${BASE}/applications/${FIXTURE_APP_NOT_YET}/typing-test/wf-typing`);
    const button = page.getByRole("button", { name: "Back to your application" });
    await button.waitFor({ timeout: 20_000 }).catch(() => null);
    check("a step that is not open yet says so", await button.isVisible().catch(() => false));
    await button.click();
    check("its button opens the application", await waitClean(page, `/applications/${FIXTURE_APP_NOT_YET}`), stripPreview(page.url()));
    const back = await backAndHold(page);
    check("Back skips the refused step (it was replaced)", back === "about:blank", back);
    await page.close();
  }

  check("nothing tried to write to the database", blocked.length === 0, blocked.join("; "));
  await context.close();
}

const timer = setTimeout(() => {
  console.log(`FAIL  - the check did not finish in ${DEADLINE_MS / 1000} s`);
  stopVite();
  process.exit(1);
}, DEADLINE_MS);

let browser;
try {
  await startVite();
  browser = await chromium.launch({ args: ["--host-resolver-rules=MAP staff.localhost 127.0.0.1"] });
  await signedOutChecks(browser);
  await signedInChecks(browser);
} catch (error) {
  failed += 1;
  console.log(`FAIL  - the check crashed: ${error?.stack || error}`);
} finally {
  await browser?.close().catch(() => null);
  stopVite();
  clearTimeout(timer);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
