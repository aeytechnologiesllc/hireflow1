#!/usr/bin/env node
/**
 * Render proof for the job-benefits fix: opens the dev-preview fixture's
 * Barista job page (which carries a real `benefits` array — see
 * src/dev-preview/fixtures.ts) at candidate role, and screenshots it at
 * phone (390) and the ~820px pane width, at the scroll position where the
 * Benefits section sits.
 *
 * Run with: node scripts/screenshot_job_benefits.mjs
 * (requires `npx vite --port 5481` already running)
 */
import { chromium } from "/Users/shahzaib/hireflow-wt/w2-job-benefits/node_modules/playwright/index.mjs";
import path from "node:path";

const JOB_BARISTA_ID = "20000000-0000-4000-8000-000000000001";
const BASE = "http://localhost:5481";
const URL = `${BASE}/job/${JOB_BARISTA_ID}?__preview=1&__previewRole=candidate`;
const OUT_DIR = "/Users/shahzaib/hireflow-wt/w2-job-benefits/design/preview/job-benefits";

async function shoot(browser, width, filename) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Benefits", { timeout: 15000 });
  const benefitsHeading = page.locator("h3", { hasText: "Benefits" });
  await benefitsHeading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300); // let the framer-motion fade-in settle

  const outPath = path.join(OUT_DIR, filename);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`  saved ${outPath}`);

  const bodyText = await page.locator("body").innerText();
  const hasFreeDrinks = bodyText.includes("Free shift drinks");
  const hasFlexSchedule = bodyText.includes("Flexible schedule");
  // 429s (an unrelated dev-preview rate-limit check) and the "no Stripe key"
  // notice are known, pre-existing dev-preview noise (see CLAUDE.md's Stripe
  // note) — unrelated to this fix, so only real (non-network, non-Stripe)
  // console errors fail this proof.
  const relevantErrors = consoleErrors.filter((e) => !/429|VITE_STRIPE_PUBLISHABLE_KEY/.test(e));
  console.log(`  width ${width}: "Free shift drinks" present=${hasFreeDrinks}, "Flexible schedule" present=${hasFlexSchedule}, relevant console errors=${relevantErrors.length}`);
  if (relevantErrors.length) console.log("    ", relevantErrors.slice(0, 5));

  await page.close();
  return hasFreeDrinks && hasFlexSchedule && relevantErrors.length === 0;
}

async function main() {
  const browser = await chromium.launch();
  let ok = true;
  ok = (await shoot(browser, 390, "job-benefits-390.png")) && ok;
  ok = (await shoot(browser, 820, "job-benefits-820.png")) && ok;
  await browser.close();
  if (!ok) {
    console.error("\nFAIL: benefits text or console errors did not match expectations.");
    process.exit(1);
  }
  console.log("\nOK: Benefits section rendered with real data at both widths, no console errors.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
