/**
 * E2E verify Ava create-job flow + candidate apply by code.
 * Run: node scripts/ava_create_verify.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import path from "path";

const BASE = process.env.BASE_URL || "http://localhost:8080";
const OUT = path.join(process.cwd(), "screenshots-verify", "ava-create");
const EMAIL = "employer.test@hireflow.dev";
const PASS = "Hireflow123!";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overflow(page) {
  return page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
}

async function login(page) {
  await page.goto(`${BASE}/auth`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|jobs)/, { timeout: 30000 });
}

async function walkCreateJob(page, roleTitle, tag) {
  await page.goto(`${BASE}/jobs/create`, { waitUntil: "networkidle" });
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, `${tag}-1-brief.png`) });

  await page.locator('input[placeholder*="Barista"]').first().fill(roleTitle);
  await page.locator('input').nth(1).fill("Austin, TX");
  await page.locator('input').nth(3).fill("$18–22 / hr");
  await page.locator("textarea").first().fill(`Day-to-day work for a ${roleTitle}.`);
  await page.click('button:has-text("Continue")');
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, `${tag}-2-followup.png`) });

  for (let i = 0; i < 3; i++) {
    const next = page.locator('button:has-text("Next question"), button:has-text("Looks right")').last();
    if (await next.isVisible()) await next.click();
    await sleep(700);
  }
  await page.screenshot({ path: path.join(OUT, `${tag}-3-rigor.png`) });

  await page.click('button:has-text("Build my flow")');
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, `${tag}-4-building.png`) });

  await page.waitForSelector("text=Here's your hiring plan", { timeout: 90000 });
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, `${tag}-5-review.png`), fullPage: true });

  const genBadge = await page.locator("text=AI generated, text=Built with AI, text=Template fallback, text=Built from playbook").first().textContent().catch(() => "");
  const quizText = await page.locator("body").innerText();
  return { genBadge, quizSnippet: quizText.slice(0, 2000) };
}

async function publish(page, tag) {
  await page.locator('footer button:has-text("Publish role")').click();
  await page.waitForSelector("text=Your role is live", { timeout: 45000 });
  await sleep(1000);
  const code = (await page.locator("button.font-mono").first().textContent())?.trim().split(/\s+/)[0] ?? "";
  await page.screenshot({ path: path.join(OUT, `${tag}-6-publish.png`) });
  return code;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const view of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: view.width, height: view.height } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await login(page);
    const barista = await walkCreateJob(page, "Barista", `barista-${view.name}`);
    const dev = await walkCreateJob(page, "Frontend Developer", `dev-${view.name}`);
    const different = barista.quizSnippet !== dev.quizSnippet;
    const code = await publish(page, `barista-${view.name}`);

    await page.goto(`${BASE}/candidate/apply?code=${encodeURIComponent(code)}`, { waitUntil: "networkidle" });
    await sleep(800);
    const applyOk = (await page.locator("body").innerText()).toLowerCase().includes("developer");
    await page.screenshot({ path: path.join(OUT, `apply-${view.name}.png`) });

    const o = await overflow(page);
    results.push({ view: view.name, different, code, applyOk, overflow: o.overflow, errors: errors.length, gen: barista.genBadge });
    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  const failed = results.some((r) => r.overflow || !r.applyOk || !r.different);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
