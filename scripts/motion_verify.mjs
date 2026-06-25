/**
 * Motion + scroll smoke test — overflow + console errors on key routes.
 * Run: node scripts/motion_verify.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:8080";
const WIDTHS = [1440, 1180, 768, 390];

const ROUTES = [
  "/dashboard",
  "/auth",
  "/ava-preview",
  "/candidate",
  "/jobs",
];

async function checkPage(page, route, width) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(route === "/ava-preview" ? 1200 : 800);

  const overflow = await page.evaluate(() => ({
    bad: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));

  return { route, width, overflow, errors: [...new Set(errors)] };
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results = [];

  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      results.push(await checkPage(page, route, width));
    }
  }

  // Ava preview — click through all 6 step states quickly
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/ava-preview`, { waitUntil: "networkidle" });
  const stepErrors = [];
  page.on("pageerror", (e) => stepErrors.push(e.message));
  for (let i = 0; i < 5; i++) {
    const btn = page.locator('button:has-text("Continue"), button:has-text("Next question"), button:has-text("Looks right"), button:has-text("Build my flow")').first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(600);
    }
  }

  await browser.close();

  const fails = results.filter((r) => r.overflow.bad || r.errors.length > 0);
  console.log(JSON.stringify({ total: results.length, fails: fails.length, results, avaStepErrors: stepErrors }, null, 2));
  if (fails.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
