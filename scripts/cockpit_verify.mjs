/**
 * Headless verification + screenshots for employer cockpit and candidate apply.
 * Run: node scripts/cockpit_verify.mjs
 */
import { chromium } from "playwright";
import { mkdir, readFile } from "fs/promises";
import path from "path";

const BASE = process.env.BASE_URL || "http://localhost:8080";
const OUT = path.join(process.cwd(), "screenshots-verify");
const EMAIL = "employer.test@hireflow.dev";
const PASS = "Hireflow123!";

async function loadEnv() {
  try {
    const raw = await readFile(path.join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  } catch {
    /* optional */
  }
}

const WIDTHS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

async function overflowCheck(page) {
  return page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
}

async function loginEmployer(page) {
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const url = process.env.VITE_SUPABASE_URL || "https://yqklrkpptnhubsnijqze.supabase.co";
  if (!anonKey) {
    throw new Error("Missing VITE_SUPABASE_ANON_KEY");
  }

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  const session = await res.json();
  if (!session.access_token) throw new Error(`Login failed: ${JSON.stringify(session)}`);

  const projectRef = url.replace("https://", "").split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;

  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ storageKey, session }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + session.expires_in,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        }),
      );
    },
    { storageKey, session },
  );

  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
}

async function main() {
  await loadEnv();
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of WIDTHS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    try {
      await loginEmployer(page);
      await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2000);
      const dashOf = await overflowCheck(page);
      await shot(page, `dashboard-${vp.name}`);
      results.push({ route: "dashboard", vp: vp.name, overflow: dashOf.overflow, consoleErrors: consoleErrors.length });

      await page.goto(`${BASE}/applicants`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      const appOf = await overflowCheck(page);
      await shot(page, `applicants-${vp.name}`);
      results.push({ route: "applicants", vp: vp.name, overflow: appOf.overflow, consoleErrors: consoleErrors.length });

      await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      results.push({ route: "jobs", vp: vp.name, overflow: (await overflowCheck(page)).overflow });

      await page.goto(`${BASE}/messages`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      results.push({ route: "messages", vp: vp.name, overflow: (await overflowCheck(page)).overflow });
    } catch (err) {
      results.push({ route: "employer", vp: vp.name, error: String(err) });
    }

    // Candidate surfaces (no login)
    try {
      await page.goto(`${BASE}/candidate`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      await shot(page, `candidate-landing-${vp.name}`);
      const candOf = await overflowCheck(page);
      results.push({ route: "candidate-landing", vp: vp.name, overflow: candOf.overflow });

      await page.goto(`${BASE}/candidate/apply`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      await shot(page, `candidate-apply-${vp.name}`);
      results.push({ route: "candidate-apply", vp: vp.name, overflow: (await overflowCheck(page)).overflow });
    } catch (err) {
      results.push({ route: "candidate", vp: vp.name, error: String(err) });
    }

    await context.close();
  }

  await browser.close();
  console.log(JSON.stringify({ screenshots: OUT, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
