/** Desktop screenshots for Ava create-job (single role, fast path). */
import { chromium } from "playwright";
import { mkdir } from "fs/promises";
import path from "path";

const BASE = process.env.BASE_URL || "http://localhost:8080";
const OUT = path.join(process.cwd(), "screenshots-verify", "ava-create");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto(`${BASE}/auth`);
  await page.fill('input[type="email"]', "employer.test@hireflow.dev");
  await page.fill('input[type="password"]', "Hireflow123!");
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard|jobs/, { timeout: 30000 });

  // Barista path
  await page.evaluate(() => {
    localStorage.removeItem("ava-create-job-draft-v1");
    sessionStorage.removeItem("ava-create-active");
  });
  await page.goto(`${BASE}/jobs/create`);
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, "barista-1-brief-desktop.png") });
  await page.locator("input").first().fill("Barista");
  await page.locator("input").nth(1).fill("Maria's Café · Austin");
  await page.locator("input").nth(3).fill("$18–22 / hr");
  await page.locator("textarea").first().fill("Make drinks, serve guests, keep the bar clean during rushes.");
  await page.click('button:has-text("Continue")');
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, "barista-2-followup-desktop.png") });

  // Developer path (fresh)
  await page.evaluate(() => {
    localStorage.removeItem("ava-create-job-draft-v1");
    sessionStorage.removeItem("ava-create-active");
  });
  await page.goto(`${BASE}/jobs/create`);
  await page.locator("input").first().fill("Frontend Developer");
  await page.locator("input").nth(1).fill("Remote");
  await page.locator("input").nth(3).fill("$90–110k");
  await page.locator("textarea").first().fill("Build React features for our hiring product.");
  await page.click('button:has-text("Continue")');
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, "dev-2-followup-desktop.png") });

  // Complete developer flow to publish
  for (let i = 0; i < 4; i++) {
    await page.locator("footer button").last().click();
    await sleep(600);
  }
  await sleep(2000);
  await page.screenshot({ path: path.join(OUT, "dev-4-building-desktop.png") });
  await page.waitForSelector("text=Here's your hiring plan", { timeout: 120000 });
  await sleep(1000);
  await page.screenshot({ path: path.join(OUT, "dev-5-review-desktop.png"), fullPage: true });

  const genLabel = await page.locator("text=AI generated, text=Built with AI, text=Template fallback, text=Built from playbook").first().textContent().catch(() => "unknown");
  await page.locator('footer button:has-text("Publish role")').click();
  await page.waitForSelector("text=Your role is live", { timeout: 45000 });
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, "dev-6-publish-desktop.png") });

  const code = (await page.locator("button.font-mono").first().textContent())?.trim().split(/\s+/)[0];
  await page.goto(`${BASE}/candidate/apply?code=${code}`);
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, "apply-desktop.png") });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  console.log(JSON.stringify({ genLabel, code, overflow, out: OUT }, null, 2));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
