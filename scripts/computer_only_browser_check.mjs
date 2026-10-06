#!/usr/bin/env node
/**
 * The computer-only rule in a real browser (docs/COMPUTER-ONLY-TESTS.md,
 * "Proof", browser). Through the dev preview's candidate fixtures (offline,
 * src/dev-preview/): the Barista job, whose connection check is its first
 * workflow step, with an application standing on every step.
 *
 * What it proves:
 *   - at 390×844 as an iPhone (iPhone user agent, touch): the application
 *     form and the skills check render as usual; the connection check, the
 *     typing test, the video intro, the chat practice, the written
 *     interview, the sales practice, the voice interview and the portfolio
 *     (the check and every step after it) each show ONLY "Continue on your
 *     computer", and the step page's own module is never even loaded, so
 *     none of its hooks ran (no attempt opened, no integrity event, no timer);
 *   - the same as an iPad asking for the desktop site (a Mac user agent with
 *     touch, 1180×820);
 *   - at 1280×900 on a desktop browser, every one of those steps renders
 *     its own page and never the gate screen;
 *   - review 2026-10-06: an Android tablet on Chrome's default desktop site
 *     (Linux, mobile:false, touch, 1280×800, a finger; Chrome's own
 *     userAgentMetadata override) and the same tablet with a trackpad cover
 *     (a fine pointer, an ARM navigator.platform) are gated and named a
 *     tablet, while an x86 Linux touch laptop with a trackpad runs the step;
 *     an iPhone on "Request Desktop Website" is gated and named a phone;
 *   - every card button on the applications list opens its own step on a
 *     phone and on a desktop (the connection check and the typing test went
 *     to a 404), and with several steps waiting the list stays;
 *   - a fresh arrival at /applications on a computer with ONE step waiting
 *     opens that step (the screen's "you'll be taken straight to this
 *     step"), never on a phone, never when reached from inside the app;
 *   - a closed application's step on a phone shows the decision card;
 *   - a server refusal mid-step (computer_required) swaps the page for the
 *     screen without recording "left the test page", and the screen then
 *     does not say "Nothing has started here"; leaving by the back arrow
 *     still records it (the control).
 *
 * The last three need applications the café fixtures do not have; the
 * check adds them in the served copy of src/dev-preview/fixtures.ts (one
 * line, through a route), never in the file.
 *
 *   node scripts/computer_only_browser_check.mjs            # starts vite on 8161
 *   BASE_URL=http://127.0.0.1:8161 node scripts/computer_only_browser_check.mjs
 *   SHOTS_DIR=/some/dir node scripts/computer_only_browser_check.mjs
 *     # also saves the gate screen at 360, 390 and 1280, Night and Day
 *
 * Not part of the CI suite: it needs a browser.
 */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8161);
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}`;
const VITE_BIN = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
const SHOTS_DIR = process.env.SHOTS_DIR || null;
const DEADLINE_MS = 600_000;

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
// Chrome on an Android tablet, desktop site (the default at 10 inches or more): an X11 Linux UA.
const ANDROID_DESKTOP_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Fixture ids (src/dev-preview/ids.ts): the Barista job, one application per step.
const app = (n) => `30000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const OPEN_STEPS = [
  { name: "application form", path: `/applications/${app(1)}/application/application`, module: "ApplicationFormPhase", text: "Complete your application" },
  { name: "skills check", path: `/applications/${app(2)}/quiz/quiz`, module: "QuizPhase", text: "Start the skills check" },
];
const GATED_STEPS = [
  { name: "connection check", path: `/applications/${app(18)}/connection/wf-connection`, module: "ConnectionCheckPhase", text: "Are you on the computer you'll use for this job right now?" },
  { name: "typing test", path: `/applications/${app(3)}/typing-test/wf-typing`, module: "TypingTestPhase", text: "Start typing test" },
  { name: "video intro", path: `/applications/${app(4)}/video-intro/wf-video`, module: "VideoIntroPhase", text: "Record your video" },
  { name: "chat practice", path: `/applications/${app(5)}/chat-simulation/wf-chatsim`, module: "ChatSimulationPhase", text: "Start the conversation" },
  { name: "written interview", path: `/applications/${app(6)}/chat-interview/wf-chatint`, module: "ChatInterviewPhase", text: "Start the interview" },
  { name: "sales practice", path: `/applications/${app(7)}/sales-simulation/wf-sales`, module: "SalesSimulationPhase", text: "Start Meeting" },
  { name: "voice interview", path: `/applications/${app(8)}/voice-interview/wf-voice`, module: "VoiceInterviewPhase", text: "Your voice interview" },
  { name: "portfolio", path: `/applications/${app(9)}/portfolio/wf-portfolio`, module: "PortfolioUploadPhase", text: "Upload Your Portfolio" },
];
const GATE = '[data-testid="continue-on-computer"]';

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

let vite = null;
async function startVite() {
  if (process.env.BASE_URL) return;
  vite = spawn(process.execPath, [VITE_BIN, "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  vite.stdout.on("data", (d) => (output += d));
  vite.stderr.on("data", (d) => (output += d));
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    if (vite.exitCode !== null) throw new Error(`vite exited (port ${PORT} taken?)\n${output.slice(-800)}`);
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

const previewUrl = (p, theme = "dark") => `${BASE}${p}?__preview=1&__previewRole=candidate&__previewTheme=${theme}`;

/** Opens a step and waits until either the gate screen or `text` is on screen; reports which, and every page module requested. */
async function openStep(context, step, theme = "dark", setup = null) {
  const page = await context.newPage();
  const modules = [];
  const errors = [];
  page.on("request", (req) => {
    const m = /\/src\/pages\/([A-Za-z]+)\.tsx/.exec(req.url());
    if (m) modules.push(m[1]);
  });
  page.on("pageerror", (err) => errors.push(err.message));
  if (setup) await setup(page);
  await page.goto(previewUrl(step.path, theme), { waitUntil: "domcontentloaded" });
  const gate = page.locator(GATE);
  const own = page.getByText(step.text, { exact: false }).first();
  const until = Date.now() + 30_000;
  let seen = null;
  while (Date.now() < until && !seen) {
    if (await gate.isVisible().catch(() => false)) seen = "gate";
    else if (await own.isVisible().catch(() => false)) seen = "page";
    else await wait(150);
  }
  // A moment more, so anything that would mount late has the chance to.
  await wait(600);
  return { page, seen, modules, errors };
}

async function gateOnly(page) {
  return page.evaluate((sel) => {
    const gate = document.querySelector(sel);
    const h1s = [...document.querySelectorAll("h1")].map((h) => h.textContent?.trim());
    const buttons = [...document.querySelectorAll("main button, [data-testid] button")].map((b) => b.textContent?.trim()).filter(Boolean);
    return {
      gate: !!gate,
      h1s,
      buttons,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  }, GATE);
}

/**
 * Chrome's own "desktop site" on an Android tablet, per page (CDP): an X11
 * Linux UA, userAgentData platform Linux and mobile:false, and the
 * navigator.platform given. Chromium cannot emulate a fine pointer together
 * with touch, so `finePointer` answers the page's `(pointer: fine)` /
 * `(hover: hover)` queries the way a trackpad cover would.
 */
function androidDesktopSetup({ platform, architecture, finePointer }) {
  return async (page) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setUserAgentOverride", {
      userAgent: ANDROID_DESKTOP_UA,
      platform,
      userAgentMetadata: {
        brands: [{ brand: "Google Chrome", version: "131" }],
        fullVersion: "131.0.0.0",
        platform: "Linux",
        platformVersion: "",
        architecture,
        model: "",
        mobile: false,
      },
    });
    if (finePointer) {
      await page.addInitScript(() => {
        const real = window.matchMedia.bind(window);
        window.matchMedia = (query) =>
          /\(pointer: ?fine\)|\(hover: ?hover\)/.test(query) ? { ...real(query), matches: true, media: query } : real(query);
      });
    }
  };
}

/**
 * Adds applications to (or takes them from) the café's own list, in the copy
 * of src/dev-preview/fixtures.ts the dev server serves to THIS context: one
 * line of buildCafeTables gets a hook, and `patch` (run in the page) edits
 * the rows. The file on disk is never touched.
 */
async function patchCafeApplications(context, patch) {
  const state = { patched: 0 };
  await context.route(/\/src\/dev-preview\/fixtures\.ts/, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    // Matched loosely: the dev server serves the file reformatted.
    const next = body.replace(
      /applications:\s*applications\.map\(/,
      "applications: (globalThis.__hfPatchApps ? globalThis.__hfPatchApps(applications) : applications).map(",
    );
    if (next !== body) state.patched += 1;
    await route.fulfill({ response, body: next });
  });
  await context.addInitScript(`globalThis.__hfPatchApps = ${patch.toString()};`);
  return state;
}

/** Every integrity event the page records, as it writes it to its outbox (before any send). */
function spyIntegrityOutbox() {
  return async (page) => {
    await page.addInitScript(() => {
      window.__hfIntegrity = [];
      const realSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(key, value) {
        try {
          if (String(key).startsWith("hf.integrity.outbox:")) {
            for (const event of JSON.parse(value)) {
              const tag = `${event.kind}${event.detail?.via ? `:${event.detail.via}` : ""}`;
              if (!window.__hfIntegrity.includes(tag)) window.__hfIntegrity.push(tag);
            }
          }
        } catch {
          /* not ours */
        }
        return realSet.call(this, key, value);
      };
    });
  };
}

async function run() {
  await startVite();
  const browser = await chromium.launch();
  try {
    /* ---------------------------------------------------------- iPhone */
    console.log("\nAn iPhone, 390×844 (iPhone user agent, touch):\n");
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    for (const step of OPEN_STEPS) {
      const { page, seen, modules } = await openStep(phone, step);
      check(`${step.name}: renders as usual on a phone`, seen === "page" && modules.includes(step.module) && !(await page.locator(GATE).count()), `${seen} ${modules.join(",")}`);
      await page.close();
    }
    for (const step of GATED_STEPS) {
      const { page, seen, modules, errors } = await openStep(phone, step);
      const shown = await gateOnly(page);
      const pageText = await page.getByText(step.text, { exact: false }).count();
      check(
        `${step.name}: only "Continue on your computer"`,
        seen === "gate" && shown.h1s.length === 1 && shown.h1s[0] === "Continue on your computer" && pageText === 0,
        JSON.stringify({ seen, h1s: shown.h1s, pageText }),
      );
      check(`${step.name}: the step page was never loaded, so none of its hooks ran`, !modules.includes(step.module), modules.join(","));
      check(`${step.name}: nothing on it starts anything (only Copy link and Back)`, shown.buttons.every((b) => /Copy link|Back to your application|^$/.test(b)), shown.buttons.join(" | "));
      check(`${step.name}: no sideways scroll, no page error`, !shown.overflow && errors.length === 0, errors.join(" | "));
      await page.close();
    }
    {
      // Copy link puts this step's own address on the clipboard.
      await phone.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
      const { page } = await openStep(phone, GATED_STEPS[1]);
      await page.getByRole("button", { name: "Copy link" }).click();
      await page.getByRole("button", { name: "Link copied" }).waitFor({ timeout: 5_000 }).catch(() => {});
      const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
      check("Copy link copies this step's own address", copied === `${BASE}${GATED_STEPS[1].path}`, copied);
      check("…and says so", (await page.getByRole("button", { name: "Link copied" }).count()) === 1);
      await page.close();
    }
    await phone.close();

    /* ---------------------------------------------------- iPad as a Mac */
    console.log("\nAn iPad on the desktop site, 1180×820 (a Mac user agent with touch):\n");
    const ipad = await browser.newContext({ viewport: { width: 1180, height: 820 }, userAgent: IPAD_AS_MAC_UA, hasTouch: true });
    for (const step of [OPEN_STEPS[1], GATED_STEPS[0], GATED_STEPS[3]]) {
      const { page, seen, modules } = await openStep(ipad, step);
      const gated = GATED_STEPS.includes(step);
      check(
        `${step.name}: ${gated ? "Continue on your computer, and it says tablet" : "renders as usual"}`,
        gated
          ? seen === "gate" && !modules.includes(step.module) && (await page.getByText("It can't be taken on a tablet.").count()) === 1
          : seen === "page",
        `${seen} ${modules.join(",")}`,
      );
      await page.close();
    }
    await ipad.close();

    /* ---------------------------------------------------------- desktop */
    console.log("\nA desktop browser, 1280×900:\n");
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    for (const step of [...OPEN_STEPS, ...GATED_STEPS]) {
      const { page, seen, modules } = await openStep(desktop, step);
      check(`${step.name}: renders its own page, never the gate`, seen === "page" && modules.includes(step.module) && (await page.locator(GATE).count()) === 0, `${seen} ${modules.join(",")}`);
      await page.close();
    }
    await desktop.close();

    /* ------------------------- review 2026-10-06: tablets on the desktop site */
    console.log("\nAn Android tablet on Chrome's default desktop site, 1280×800 (Linux, mobile:false, touch):\n");
    const tabletOpts = { viewport: { width: 1280, height: 800 }, screen: { width: 1280, height: 800 }, userAgent: ANDROID_DESKTOP_UA, hasTouch: true };
    {
      const ctx = await browser.newContext(tabletOpts);
      const finger = androidDesktopSetup({ platform: "Linux x86_64", architecture: "x86", finePointer: false });
      for (const step of [GATED_STEPS[0], GATED_STEPS[1]]) {
        const { page, seen, modules } = await openStep(ctx, step, "dark", finger);
        const reading = await page.evaluate(() => ({ platform: navigator.userAgentData?.platform, mobile: navigator.userAgentData?.mobile, coarse: matchMedia("(pointer: coarse)").matches }));
        check(
          `${step.name}: Continue on your computer, and it says tablet (the page read ${JSON.stringify(reading)})`,
          seen === "gate" && !modules.includes(step.module) && (await page.getByText("It can't be taken on a tablet.").count()) === 1 &&
            reading.platform === "Linux" && reading.mobile === false && reading.coarse === true,
          `${seen} ${modules.join(",")}`,
        );
        await page.close();
      }
      const { page: quizPage, seen: quizSeen } = await openStep(ctx, OPEN_STEPS[1], "dark", finger);
      check("…the skills check still renders as usual on it", quizSeen === "page");
      await quizPage.close();
      const cover = androidDesktopSetup({ platform: "Linux armv81", architecture: "arm", finePointer: true });
      {
        const { page, seen, modules } = await openStep(ctx, GATED_STEPS[1], "dark", cover);
        const fine = await page.evaluate(() => matchMedia("(pointer: fine)").matches && navigator.platform);
        check(
          `typing test with a trackpad cover (a fine pointer, ${fine}): still a tablet`,
          seen === "gate" && !modules.includes(GATED_STEPS[1].module) && (await page.getByText("It can't be taken on a tablet.").count()) === 1,
          `${seen} ${modules.join(",")}`,
        );
        await page.close();
      }
      const laptop = androidDesktopSetup({ platform: "Linux x86_64", architecture: "x86", finePointer: true });
      {
        const { page, seen, modules } = await openStep(ctx, GATED_STEPS[1], "dark", laptop);
        check("an x86 Linux touch laptop with a trackpad runs the typing test itself", seen === "page" && modules.includes(GATED_STEPS[1].module), `${seen} ${modules.join(",")}`);
        await page.close();
      }
      await ctx.close();
    }
    {
      console.log("\nAn iPhone on Request Desktop Website, 390×844 (a Mac user agent with touch):\n");
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, userAgent: IPAD_AS_MAC_UA, hasTouch: true, isMobile: true });
      const { page, seen, modules } = await openStep(ctx, GATED_STEPS[1]);
      check(
        "typing test: Continue on your computer, and it says phone (not tablet)",
        seen === "gate" && !modules.includes(GATED_STEPS[1].module) && (await page.getByText("It can't be taken on a phone.").count()) === 1,
        `${seen} ${modules.join(",")}`,
      );
      await page.close();
      await ctx.close();
    }

    /* ------------------------------- the applications list's buttons */
    const LIST = { name: "applications list", path: "/applications", module: "Applications", text: "Your applications" };
    const ACTION = '[data-testid="application-action"]';
    const NOT_FOUND = /Page not found|404/;
    for (const viewport of [
      { label: "phone", opts: { viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
      { label: "desktop", opts: { viewport: { width: 1280, height: 900 } } },
    ]) {
      console.log(`\nThe applications list on a ${viewport.label} — every card button opens its own step:\n`);
      const ctx = await browser.newContext(viewport.opts);
      const first = await openStep(ctx, LIST);
      await first.page.locator(ACTION).first().waitFor({ timeout: 15_000 }).catch(() => {});
      const labels = await first.page.locator(ACTION).allTextContents();
      check(`the list stays the list with several steps waiting for a computer (${labels.length} buttons)`, first.seen === "page" && new URL(first.page.url()).pathname === "/applications" && labels.length >= 8, `${first.seen} ${first.page.url()}`);
      await first.page.close();
      const landed = [];
      for (let i = 0; i < labels.length; i += 1) {
        const { page } = await openStep(ctx, LIST);
        await page.locator(ACTION).nth(i).waitFor({ timeout: 15_000 });
        await page.locator(ACTION).nth(i).click();
        await page.waitForFunction(() => location.pathname !== "/applications", null, { timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(900);
        const pathname = new URL(page.url()).pathname;
        const body = (await page.locator("body").innerText().catch(() => "")) || "";
        const gate = (await page.locator(GATE).count()) > 0;
        landed.push(pathname);
        check(
          `"${labels[i].trim()}" → ${pathname}${gate ? " (Continue on your computer)" : ""}`,
          /^\/applications\/[0-9a-f-]+\/[a-z-]+\/[A-Za-z0-9_-]+$/.test(pathname) && !NOT_FOUND.test(body) && (viewport.label === "desktop" ? !gate : true),
          body.slice(0, 120),
        );
        await page.close();
      }
      check(
        "…the connection check's and the typing test's buttons included",
        landed.some((p) => p.endsWith("/connection/wf-connection")) && landed.some((p) => p.endsWith("/typing-test/wf-typing")),
        landed.join(" "),
      );
      await ctx.close();
    }

    /* ------------------------ the screen's promise: straight to the step */
    console.log("\nOne step waiting for a computer — a fresh /applications opens it (on a computer only):\n");
    const TYPING_APP = app(3);
    const onlyTyping = (apps) => apps.filter((a) => a.id === "30000000-0000-4000-8000-000000000003" || a.status === "offered" || a.status === "hired");
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const patched = await patchCafeApplications(ctx, onlyTyping);
      const { page, modules } = await openStep(ctx, LIST);
      await page.waitForFunction(() => location.pathname !== "/applications", null, { timeout: 10_000 }).catch(() => {});
      await page.getByText("Start typing test", { exact: false }).first().waitFor({ timeout: 15_000 }).catch(() => {});
      check(
        "desktop, fresh arrival: forwarded to the typing test, and it runs there",
        patched.patched > 0 && new URL(page.url()).pathname === `/applications/${TYPING_APP}/typing-test/wf-typing` && modules.includes("TypingTestPhase") && (await page.locator(GATE).count()) === 0,
        `${patched.patched} ${page.url()}`,
      );
      // From inside the app (the overview's way back to the list), the list stays.
      await page.goto(previewUrl(`/applications/${TYPING_APP}`), { waitUntil: "domcontentloaded" });
      const toList = page.locator('a[href="/applications"]').first();
      await toList.waitFor({ timeout: 15_000 }).catch(() => {});
      if (await toList.count()) {
        await toList.click();
        await page.waitForTimeout(1500);
        check("…reached from inside the app (a link to the list), the list stays", new URL(page.url()).pathname === "/applications" && (await page.locator(ACTION).count()) === 1, page.url());
      } else {
        check("…reached from inside the app (a link to the list), the list stays", false, "no link to /applications on the overview");
      }
      await page.close();
      await ctx.close();
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA, hasTouch: true, isMobile: true });
      await patchCafeApplications(ctx, onlyTyping);
      const { page } = await openStep(ctx, LIST);
      await page.locator(ACTION).first().waitFor({ timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(800);
      check("phone, fresh arrival: the list stays (a phone is never forwarded)", new URL(page.url()).pathname === "/applications" && (await page.locator(ACTION).count()) === 1, page.url());
      await page.close();
      await ctx.close();
    }

    /* ------------------------------------- a closed application, on a phone */
    console.log("\nA rejected application whose phase is still on a gated step, on a phone:\n");
    const CLOSED_APP = "30000000-0000-4000-8000-0000000000c1";
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      await patchCafeApplications(ctx, (apps) => {
        const typing = apps.find((a) => a.id === "30000000-0000-4000-8000-000000000003");
        return [...apps, { ...typing, id: "30000000-0000-4000-8000-0000000000c1", status: "rejected" }];
      });
      const step = { name: "closed typing test", path: `/applications/${CLOSED_APP}/typing-test/wf-typing`, module: "TypingTestPhase", text: "The hiring team has made a decision" };
      const { page, seen, modules } = await openStep(ctx, step);
      check(
        "the decision card, never Continue on your computer, and the step page never loads",
        seen === "page" && (await page.locator(GATE).count()) === 0 && !modules.includes("TypingTestPhase"),
        `${seen} ${modules.join(",")}`,
      );
      if (SHOTS_DIR) {
        await mkdir(SHOTS_DIR, { recursive: true });
        await page.screenshot({ path: path.join(SHOTS_DIR, "closed-application-390-night.png") });
      }
      await page.close();
      await ctx.close();
    }

    /* ---------------- a refusal mid-step: no "left the test page" record */
    console.log("\nThe server refuses a page that read itself as a computer (chat practice, desktop):\n");
    const CHAT = GATED_STEPS[3];
    const chatOpener = 'data: {"choices":[{"delta":{"content":"Hi, my payment is not showing."}}]}\n\ndata: [DONE]\n\n';
    async function startChat(ctx, answer) {
      const calls = [];
      await ctx.route(/\/functions\/v1\/ai-chat-simulation/, async (route) => {
        let mode = null;
        try {
          mode = JSON.parse(route.request().postData() || "{}").mode ?? null;
        } catch {
          mode = null;
        }
        calls.push(mode);
        await answer(route, mode);
      });
      const { page, seen } = await openStep(ctx, CHAT, "dark", spyIntegrityOutbox());
      await page.locator('button[role="checkbox"]').first().click().catch(() => {});
      const start = page.getByRole("button", { name: "Start the conversation" });
      await start.waitFor({ timeout: 15_000 }).catch(() => {});
      await page.waitForFunction(() => {
        const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("Start the conversation"));
        return b && !b.disabled;
      }, null, { timeout: 15_000 }).catch(() => {});
      await start.click().catch(() => {});
      return { page, seen, calls };
    }
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const { page, calls } = await startChat(ctx, (route) =>
        route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "This part needs the computer you will work on.", code: "computer_required", deviceKind: "phone" }),
        }),
      );
      await page.locator(GATE).waitFor({ timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(1200);
      const recorded = await page.evaluate(() => window.__hfIntegrity ?? []);
      const gateText = (await page.locator(GATE).innerText().catch(() => "")) || "";
      check("the refusal swaps the chat practice for Continue on your computer", calls.includes("start") && (await page.locator(GATE).count()) === 1, calls.join(","));
      check("…and records no 'left the test page'", !recorded.some((t) => t.startsWith("page_closed")), recorded.join(" | "));
      check("…and the screen keeps 'Your answers so far are saved.' but not 'Nothing has started here'", /Your answers so far are saved\./.test(gateText) && !/Nothing has started here/.test(gateText));
      if (SHOTS_DIR) await page.screenshot({ path: path.join(SHOTS_DIR, "refused-mid-step-1280-night.png") });
      await page.close();
      await ctx.close();
    }
    {
      // The control: the same page left by its own back arrow mid-chat IS recorded, so the spy sees page_closed when there is one.
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const { page } = await startChat(ctx, (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: chatOpener }));
      await page.getByText("Hi, my payment is not showing.").first().waitFor({ timeout: 15_000 }).catch(() => {});
      await page.getByRole("button", { name: "Back to application overview" }).first().click().catch(() => {});
      await page.waitForTimeout(1500);
      const recorded = await page.evaluate(() => window.__hfIntegrity ?? []);
      check("control: leaving the chat by the back arrow still records 'left the test page'", recorded.some((t) => t === "page_closed:left_test_page"), recorded.join(" | "));
      await page.close();
      await ctx.close();
    }

    /* ------------------------------------------------------- the shots */
    if (SHOTS_DIR) {
      await mkdir(SHOTS_DIR, { recursive: true });
      console.log(`\nThe gate screen, saved to ${SHOTS_DIR}:\n`);
      const sizes = [
        { label: "360", viewport: { width: 360, height: 780 }, userAgent: IPHONE_UA, isMobile: true },
        { label: "390", viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA, isMobile: true },
        { label: "1280-tablet", viewport: { width: 1280, height: 900 }, userAgent: IPAD_AS_MAC_UA, isMobile: false },
        {
          label: "1280-android-tablet",
          viewport: { width: 1280, height: 800 },
          userAgent: ANDROID_DESKTOP_UA,
          isMobile: false,
          setup: androidDesktopSetup({ platform: "Linux x86_64", architecture: "x86", finePointer: false }),
        },
      ];
      for (const size of sizes) {
        for (const theme of ["dark", "light"]) {
          const ctx = await browser.newContext({ viewport: size.viewport, screen: size.viewport, userAgent: size.userAgent, hasTouch: true, isMobile: size.isMobile, deviceScaleFactor: 2 });
          const { page, seen } = await openStep(ctx, GATED_STEPS[1], theme, size.setup ?? null);
          const name = `gate-${size.label}-${theme === "dark" ? "night" : "day"}`;
          await page.screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
          // The whole screen: a viewport tall enough to hold all of it (the app scrolls an inner frame).
          const height = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return el ? Math.ceil(el.getBoundingClientRect().bottom + 48) : 0;
          }, GATE);
          if (height > size.viewport.height) {
            await page.setViewportSize({ width: size.viewport.width, height });
            await wait(300);
            await page.screenshot({ path: path.join(SHOTS_DIR, `${name}-full.png`) });
          }
          check(`shot ${name}`, seen === "gate");
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}

const deadline = setTimeout(() => {
  console.log(`FAIL  - the check took longer than ${DEADLINE_MS / 1000}s`);
  stopVite();
  process.exit(1);
}, DEADLINE_MS);

try {
  await run();
} catch (err) {
  failed += 1;
  console.log(`FAIL  - ${err?.stack || err}`);
} finally {
  clearTimeout(deadline);
  stopVite();
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
process.exit(0);
