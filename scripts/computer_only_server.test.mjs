#!/usr/bin/env node
/**
 * The server half of docs/COMPUTER-ONLY-TESTS.md: plain assertions, no
 * framework, against the REAL server files (no copy), the way
 * scripts/trusted_results_logic.test.mjs imports _shared files.
 *
 *   1. supabase/functions/_shared/deviceKind.ts decides phone / tablet /
 *      computer / unknown from real User-Agent strings and client hints.
 *   2. It agrees with the page's own rule (deviceKindOf / readDevice in
 *      src/lib/connectionTest.ts, read here, never edited) for the same
 *      devices, except the documented server-blind cases (a desktop-site
 *      request from a phone or an iPad sends a computer's headers), which
 *      the page's own reading in the body (`deviceKind`) closes.
 *   3. stepNeedsComputer puts the right steps on a computer, and
 *      computerOnlyGate (_shared/assessmentSession.ts) lets a phone or tablet
 *      go on ONLY on a step the rule leaves open, or to continue an attempt a
 *      COMPUTER started; it never opens anything and answers a stranger the
 *      same refusal whatever the attempt.
 *   4. Each gated function calls the gate before it opens an attempt.
 *
 * Run with: node scripts/computer_only_server.test.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bodyDeviceKind,
  chMobileFlag,
  combinedDeviceKind,
  COMPUTER_REQUIRED_CODE,
  computerRequiredBody,
  deviceKindFromSignals,
  deviceKindOfRequest,
  deviceSignalsFrom,
  needsComputer,
  osFromChPlatform,
  requestDeviceKind,
  startedOnComputer,
  stepNeedsComputer,
  TESTS_THAT_MATTER,
} from "../supabase/functions/_shared/deviceKind.ts";
import { COMPUTER_STEP_TYPES } from "../supabase/functions/_shared/candidateJourney.ts";
import { computerGateForAttempt, computerOnlyGate, stepAccessFor } from "../supabase/functions/_shared/assessmentSession.ts";
import { readDevice } from "../src/lib/connectionTest.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

/** A Request the way Deno hands one to an edge function. */
function request(headers) {
  return new Request("https://example.supabase.co/functions/v1/x", { method: "POST", headers });
}

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidChromePhone: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  androidFirefoxTablet: "Mozilla/5.0 (Android 14; Tablet; rv:131.0) Gecko/131.0 Firefox/131.0",
  ipadOld: "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  ipadAsMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  windowsFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  chromeOS: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  linuxFirefox: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
  // "Desktop site" on a phone: Chromium on Android (and WebView) rewrites the
  // User-Agent AND the client hints; iOS Safari and Chrome on iOS send a Mac UA.
  androidDesktopMode: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  iphoneDesktopSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  iphoneDesktopChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Safari/604.1",
};

// ============================================================================
// 1. The decision, from real requests
// ============================================================================
console.log("1. The device kind from a request's own headers:\n");

/** Each device: the headers its browser really sends, the server's answer, and how the page reads the same device. */
const DEVICES = [
  {
    name: "iPhone Safari (no client hints)",
    headers: { "user-agent": UA.iphoneSafari },
    expect: "phone",
    page: { userAgent: UA.iphoneSafari, userAgentData: null, screenWidth: 390, screenHeight: 844, maxTouchPoints: 5 },
  },
  {
    name: "Android Chrome phone (reduced UA + Sec-CH-UA-Mobile ?1, platform Android)",
    headers: { "user-agent": UA.androidChromePhone, "sec-ch-ua-mobile": "?1", "sec-ch-ua-platform": '"Android"' },
    expect: "phone",
    page: { userAgent: UA.androidChromePhone, userAgentData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "Android", mobile: true }, screenWidth: 412, screenHeight: 915, maxTouchPoints: 5 },
  },
  {
    name: "Android tablet Chrome (UA without Mobile, Sec-CH-UA-Mobile ?0)",
    headers: { "user-agent": UA.androidTablet, "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Android"' },
    expect: "tablet",
    page: { userAgent: UA.androidTablet, userAgentData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "Android", mobile: false }, screenWidth: 1600, screenHeight: 2560, maxTouchPoints: 10 },
  },
  {
    name: "Android tablet Firefox (no client hints, the UA says Tablet)",
    headers: { "user-agent": UA.androidFirefoxTablet },
    expect: "tablet",
    page: { userAgent: UA.androidFirefoxTablet, userAgentData: null, screenWidth: 1600, screenHeight: 2560, maxTouchPoints: 10 },
  },
  {
    name: "Android Chrome phone asking for the desktop site (X11 Linux UA, ?0, platform Linux): SERVER-BLIND",
    headers: { "user-agent": UA.androidDesktopMode, "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Linux"' },
    expect: "computer",
    page: { userAgent: UA.androidDesktopMode, userAgentData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "Linux", mobile: false }, screenWidth: 412, screenHeight: 915, maxTouchPoints: 5 },
    pageDiffers: "phone",
  },
  {
    // Review 2026-10-06, finding 1: Chrome's default on Android tablets of 10
    // inches or more. The page used to read this as a computer too.
    name: "Android tablet on Chrome's default desktop site (X11 Linux UA, ?0, platform Linux, touch, 1280×800, a finger): SERVER-BLIND",
    headers: { "user-agent": UA.androidDesktopMode, "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Linux"' },
    expect: "computer",
    page: { userAgent: UA.androidDesktopMode, userAgentData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "Linux", mobile: false }, screenWidth: 1280, screenHeight: 800, maxTouchPoints: 10, finePointer: false },
    pageDiffers: "tablet",
  },
  {
    name: "…the same tablet with a trackpad keyboard cover (a fine pointer, an ARM navigator.platform): SERVER-BLIND",
    headers: { "user-agent": UA.androidDesktopMode, "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Linux"' },
    expect: "computer",
    page: { userAgent: UA.androidDesktopMode, userAgentData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "Linux", mobile: false }, screenWidth: 1280, screenHeight: 800, maxTouchPoints: 10, finePointer: true, platform: "Linux armv81" },
    pageDiffers: "tablet",
  },
  {
    name: "iPhone Safari Request Desktop Website (Mac UA, no client hints): SERVER-BLIND",
    headers: { "user-agent": UA.iphoneDesktopSafari },
    expect: "computer",
    page: { userAgent: UA.iphoneDesktopSafari, userAgentData: null, screenWidth: 390, screenHeight: 844, maxTouchPoints: 5 },
    // A Mac with touch and an iPhone-sized screen: a phone (review 2026-10-06, finding 6; it read "tablet").
    pageDiffers: "phone",
  },
  {
    name: "Chrome on iPhone asking for the desktop site (Mac UA, no client hints): SERVER-BLIND",
    headers: { "user-agent": UA.iphoneDesktopChrome },
    expect: "computer",
    page: { userAgent: UA.iphoneDesktopChrome, userAgentData: null, screenWidth: 390, screenHeight: 844, maxTouchPoints: 5 },
    pageDiffers: "phone",
  },
  {
    name: "iPad, older iPadOS / iPad Chrome (the UA names iPad)",
    headers: { "user-agent": UA.ipadOld },
    expect: "tablet",
    page: { userAgent: UA.ipadOld, userAgentData: null, screenWidth: 820, screenHeight: 1180, maxTouchPoints: 5 },
  },
  {
    name: "iPad, iPadOS Safari (desktop Mac UA): SERVER-BLIND, the page sees touch on a Mac",
    headers: { "user-agent": UA.ipadAsMac },
    expect: "computer",
    page: { userAgent: UA.ipadAsMac, userAgentData: null, screenWidth: 1180, screenHeight: 820, maxTouchPoints: 5 },
    pageDiffers: "tablet",
  },
  {
    name: "Windows Chrome (Sec-CH-UA-Mobile ?0, platform Windows)",
    headers: { "user-agent": UA.windowsChrome, "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Windows"' },
    expect: "computer",
    page: { userAgent: UA.windowsChrome, userAgentData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "Windows", mobile: false }, screenWidth: 1920, screenHeight: 1080, maxTouchPoints: 0 },
  },
  {
    name: "Windows touch laptop / 2-in-1 at 150% (Edge, ?0, ten touch points, 1280×720)",
    headers: { "user-agent": `${UA.windowsChrome} Edg/131.0.2903.70`, "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Windows"' },
    expect: "computer",
    page: { userAgent: `${UA.windowsChrome} Edg/131.0.2903.70`, userAgentData: { brands: [{ brand: "Microsoft Edge", version: "131" }], platform: "Windows", mobile: false }, screenWidth: 1280, screenHeight: 720, maxTouchPoints: 10 },
  },
  {
    name: "Windows touch laptop in Firefox (no client hints, touch, 1280×720)",
    headers: { "user-agent": UA.windowsFirefox },
    expect: "computer",
    page: { userAgent: UA.windowsFirefox, userAgentData: null, screenWidth: 1280, screenHeight: 720, maxTouchPoints: 10 },
  },
  {
    name: "Mac Safari",
    headers: { "user-agent": UA.macSafari },
    expect: "computer",
    page: { userAgent: UA.macSafari, userAgentData: null, screenWidth: 1512, screenHeight: 982, maxTouchPoints: 0 },
  },
  {
    name: "ChromeOS Chromebook (?0, platform Chrome OS)",
    headers: { "user-agent": UA.chromeOS, "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Chrome OS"' },
    expect: "computer",
    page: { userAgent: UA.chromeOS, userAgentData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "Chrome OS", mobile: false }, screenWidth: 1366, screenHeight: 768, maxTouchPoints: 10 },
  },
  {
    name: "Linux Firefox",
    headers: { "user-agent": UA.linuxFirefox },
    expect: "computer",
    page: { userAgent: UA.linuxFirefox, userAgentData: null, screenWidth: 1920, screenHeight: 1080, maxTouchPoints: 0 },
  },
];

for (const device of DEVICES) {
  const kind = requestDeviceKind(request(device.headers));
  check(`${device.name} → ${device.expect}`, kind === device.expect, `got ${kind}`);
}

check("no User-Agent and no client hints → unknown (allowed)", requestDeviceKind(request({})) === "unknown");
check("an empty User-Agent → unknown (allowed)", deviceKindFromSignals({ userAgent: "", chMobile: null, chPlatform: null }) === "unknown");
check("a UA that names no OS (curl) → unknown (allowed)", requestDeviceKind(request({ "user-agent": "curl/8.7.1" })) === "unknown");
check("a missing request → unknown, never a throw", requestDeviceKind(undefined) === "unknown" && requestDeviceKind(null) === "unknown" && requestDeviceKind({}) === "unknown");
check("Sec-CH-UA-Mobile ?1 alone (no UA) → phone", requestDeviceKind(request({ "sec-ch-ua-mobile": "?1" })) === "phone");
check("Sec-CH-UA-Mobile ?0 + Windows alone (no UA) → computer", requestDeviceKind(request({ "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Windows"' })) === "computer");
check(
  "Windows that reports mobile (?1) → phone, exactly as the page (mobile is tested first)",
  requestDeviceKind(request({ "user-agent": UA.windowsChrome, "sec-ch-ua-mobile": "?1", "sec-ch-ua-platform": '"Windows"' })) === "phone",
);
check(
  "ChromeOS with a touchscreen and ?0 → computer (a Chromebook is the computer they work from)",
  requestDeviceKind(request({ "user-agent": UA.chromeOS, "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Chrome OS"' })) === "computer",
);
check(
  "Sec-CH-UA-Mobile wins over the UA word, as userAgentData.mobile does on the page (?0 on a UA saying Mobile)",
  requestDeviceKind(request({ "user-agent": UA.androidChromePhone, "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Android"' })) === "tablet",
);
check("chMobileFlag reads ?1 / ?0 and nothing else", chMobileFlag("?1") === true && chMobileFlag("?0") === false && chMobileFlag("1") === null && chMobileFlag(null) === null);
check(
  "osFromChPlatform strips the quotes and speaks the page's words",
  osFromChPlatform('"Windows"') === "Windows" && osFromChPlatform('"Chrome OS"') === "ChromeOS" && osFromChPlatform('"macOS"') === "macOS" && osFromChPlatform('"Unknown"') === null && osFromChPlatform('""') === null,
);
check(
  "deviceSignalsFrom a plain headers object (any get())",
  JSON.stringify(deviceSignalsFrom({ get: (n) => ({ "user-agent": "UA", "sec-ch-ua-mobile": "?1" })[n] ?? null })) === JSON.stringify({ userAgent: "UA", chMobile: "?1", chPlatform: null }),
);
check("deviceSignalsFrom a headers object that throws → all null, never a throw", deviceSignalsFrom({ get: () => { throw new Error("x"); } }).userAgent === null);
check("needsComputer: phone and tablet only", needsComputer("phone") && needsComputer("tablet") && !needsComputer("computer") && !needsComputer("unknown") && !needsComputer(null));
const body = computerRequiredBody("phone");
check(
  "the refusal body: code computer_required, a plain-words error, and the device kind",
  body.code === "computer_required" && COMPUTER_REQUIRED_CODE === "computer_required" && body.deviceKind === "phone" && /computer you will work on/.test(body.error) && /same email/.test(body.error) && /saved/.test(body.error),
  JSON.stringify(body),
);

console.log("\n1b. The page's own reading in the body closes the server-blind cases:\n");

check("bodyDeviceKind reads deviceKind", bodyDeviceKind({ deviceKind: "phone" }) === "phone" && bodyDeviceKind({ deviceKind: "Tablet " }) === "tablet" && bodyDeviceKind({ deviceKind: "computer" }) === "computer");
check("bodyDeviceKind reads device_kind (connection-test's record)", bodyDeviceKind({ device_kind: "phone" }) === "phone");
check("bodyDeviceKind ignores anything else", bodyDeviceKind({ deviceKind: "watch" }) === null && bodyDeviceKind({}) === null && bodyDeviceKind(null) === null && bodyDeviceKind("phone") === null && bodyDeviceKind([]) === null);
check(
  "combinedDeviceKind: either one saying phone decides, then tablet, then computer, else unknown",
  combinedDeviceKind("computer", "phone") === "phone" && combinedDeviceKind("phone", "computer") === "phone" && combinedDeviceKind("computer", "tablet") === "tablet" &&
    combinedDeviceKind("tablet", "phone") === "phone" && combinedDeviceKind("unknown", "computer") === "computer" && combinedDeviceKind("computer", null) === "computer" &&
    combinedDeviceKind("unknown", null) === "unknown",
);
for (const device of DEVICES.filter((d) => d.pageDiffers)) {
  const kind = deviceKindOfRequest(request(device.headers), { deviceKind: device.pageDiffers });
  check(`${device.name}, with the page's own reading in the body → ${device.pageDiffers}`, kind === device.pageDiffers, `got ${kind}`);
}
check(
  "a computer whose page says computer stays a computer (desktop headers + deviceKind computer)",
  deviceKindOfRequest(request({ "user-agent": UA.windowsChrome, "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"Windows"' }), { deviceKind: "computer" }) === "computer",
);
check(
  "a page on the previous build (no deviceKind) is judged by its headers alone",
  deviceKindOfRequest(request({ "user-agent": UA.iphoneSafari }), { mode: "start" }) === "phone" &&
    deviceKindOfRequest(request({ "user-agent": UA.macSafari }), {}) === "computer",
);

// ============================================================================
// 2. The same devices through the page's own reading
// ============================================================================
console.log("\n2. The server agrees with the page's deviceKindOf (src/lib/connectionTest.ts):\n");

for (const device of DEVICES) {
  const reading = await readDevice(device.page);
  const server = requestDeviceKind(request(device.headers));
  if (device.pageDiffers) {
    check(
      `${device.name}: page says ${device.pageDiffers}, headers say ${server} (server-blind; the body's deviceKind closes it)`,
      reading.kind === device.pageDiffers && server === device.expect,
      `page ${reading.kind}, server ${server}`,
    );
  } else {
    check(`${device.name}: page and server both say ${server}`, reading.kind === server, `page ${reading.kind}, server ${server}`);
  }
}

// ============================================================================
// 3. Which steps need a computer, and computerOnlyGate
// ============================================================================
console.log("\n3. stepNeedsComputer and computerOnlyGate (_shared/assessmentSession.ts):\n");

/** A job's steps in order, the way buildCandidateJourney lays them out. */
const JOB_WITH_CHECK = [
  { id: "application", type: "application" },
  { id: "quiz", type: "quiz" },
  { id: "wf-chat-early", type: "chat_simulation" },
  { id: "wf-check", type: "equipment_check" },
  { id: "wf-typing", type: "typing_test" },
  { id: "wf-video", type: "video_intro" },
  { id: "wf-check-2", type: "equipment_check" },
  { id: "decision", type: "decision" },
];
const JOB_NO_CHECK = [
  { id: "application", type: "application" },
  { id: "wf-video", type: "video_intro" },
  { id: "wf-sales", type: "sales_simulation" },
  { id: "wf-portfolio", type: "portfolio_upload" },
  { id: "wf-voice", type: "voice_interview" },
];
const JOB_NO_TESTS = [{ id: "application", type: "application" }, { id: "wf-video", type: "video_intro" }];

check("with a check: the application and the skills check stay open", stepNeedsComputer(JOB_WITH_CHECK, "application") === false && stepNeedsComputer(JOB_WITH_CHECK, "quiz") === false);
check("with a check: a test placed BEFORE the check stays open (the doc's rule is the position)", stepNeedsComputer(JOB_WITH_CHECK, "wf-chat-early") === false);
check("with a check: the first check itself needs a computer", stepNeedsComputer(JOB_WITH_CHECK, "wf-check") === true);
check(
  "with a check: every step after it needs a computer (a test, a video, a second check)",
  stepNeedsComputer(JOB_WITH_CHECK, "wf-typing") === true && stepNeedsComputer(JOB_WITH_CHECK, "wf-video") === true && stepNeedsComputer(JOB_WITH_CHECK, "wf-check-2") === true,
);
check("with no check: a video intro before the first test stays open", stepNeedsComputer(JOB_NO_CHECK, "wf-video") === false);
check(
  "with no check: the first test that matters and every step after it need a computer",
  stepNeedsComputer(JOB_NO_CHECK, "wf-sales") === true && stepNeedsComputer(JOB_NO_CHECK, "wf-portfolio") === true && stepNeedsComputer(JOB_NO_CHECK, "wf-voice") === true,
);
check(
  "the gate's step types are the journey's COMPUTER_STEP_TYPES (the check plus the tests that matter), one list",
  COMPUTER_STEP_TYPES.size === TESTS_THAT_MATTER.length + 1 && COMPUTER_STEP_TYPES.has("equipment_check") && TESTS_THAT_MATTER.every((t) => COMPUTER_STEP_TYPES.has(t)),
);
check("a job with no check and no test puts nothing on a computer", stepNeedsComputer(JOB_NO_TESTS, "wf-video") === false);
check("a step not in the journey → null (callers treat it as gated)", stepNeedsComputer(JOB_WITH_CHECK, "wf-nope") === null && stepNeedsComputer(null, "wf-typing") === null);
check("the job's raw workflow_steps give the same answer (the stages the journey adds are never gated)", stepNeedsComputer(JOB_WITH_CHECK.slice(2, 7), "wf-typing") === true && stepNeedsComputer(JOB_WITH_CHECK.slice(2, 7), "wf-chat-early") === false);
check(
  "startedOnComputer: computer and unknown count, phone/tablet/missing do not",
  startedOnComputer("computer") && startedOnComputer("unknown") && !startedOnComputer("phone") && !startedOnComputer("tablet") && !startedOnComputer(undefined) && !startedOnComputer(""),
);

const OPEN = { finished: false, reopened: false };
const at = (status, started) => ({ status, context: started === undefined ? {} : { started_device_kind: started } });
check("decision: the mount's attempt (active, no start device) → refuse: a phone never starts the test on it", computerGateForAttempt(at("active"), OPEN, "turns") === "refuse" && computerGateForAttempt(at("active"), OPEN, "submit") === "refuse");
check("decision: no attempt at all → refuse", computerGateForAttempt(null, OPEN, "turns") === "refuse");
check("decision: an attempt a phone started → refuse", computerGateForAttempt(at("active", "phone"), OPEN, "turns") === "refuse" && computerGateForAttempt(at("active", "tablet"), OPEN, "submit") === "refuse");
check("decision: active, started on a computer → go (a reload or an answer after moving to the phone)", computerGateForAttempt(at("active", "computer"), OPEN, "turns") === "go");
check("decision: abandoned (the computer tab went quiet), started on a computer → go: the SAME attempt is revived", computerGateForAttempt(at("abandoned", "computer"), OPEN, "turns") === "go");
check("decision: grading, started on a computer → go for a turn (session_busy follows) and a submit (waits)", computerGateForAttempt(at("grading", "computer"), OPEN, "turns") === "go" && computerGateForAttempt(at("grading", "computer"), OPEN, "submit") === "go");
check("decision: failed, started on a computer → go (the result is still owed on that attempt)", computerGateForAttempt(at("failed", "computer"), OPEN, "submit") === "go");
check("decision: failed but staff reopened the step → refuse (a new attempt would open)", computerGateForAttempt(at("failed", "computer"), { finished: false, reopened: true }, "submit") === "refuse");
check("decision: completed and reopened by staff → refuse (a phone never opens attempt n+1)", computerGateForAttempt(at("completed", "computer"), { finished: false, reopened: true }, "submit") === "refuse");
check("decision: a finished step, submit → go (the result on file is answered back, nothing opens)", computerGateForAttempt(at("completed"), { finished: true, reopened: false }, "submit") === "go");
check("decision: a finished step, a turn → refuse", computerGateForAttempt(at("completed", "computer"), { finished: true, reopened: false }, "turns") === "refuse");

const USER = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";
const APP = "11111111-1111-4111-8111-111111111111";

/**
 * A fake service-role client: the application (whose candidate, which
 * steps), assessment_step_access for the caller, the latest attempt, and
 * every call it saw.
 */
function fakeAdmin({
  latest = null,
  started,
  access = OPEN,
  accessError = null,
  owner = USER,
  steps = JOB_WITH_CHECK,
  sessionsError = false,
} = {}) {
  const calls = [];
  const query = (table) => {
    const chain = {
      select(columns) { calls.push({ kind: "select", table, columns }); return chain; },
      eq(column, value) { calls.push({ kind: "eq", table, column, value }); return chain; },
      in() { return chain; },
      lt() { return chain; },
      order() { return chain; },
      limit() { return chain; },
      maybeSingle() {
        if (table === "applications") return Promise.resolve({ data: { candidate_id: owner, jobs: { workflow_steps: steps.filter((s) => s.id.startsWith("wf-")) } }, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve, reject) {
        const result = sessionsError
          ? { data: null, error: { code: "57014", message: "timeout" } }
          : { data: latest ? [at(latest, started)] : [], error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return chain;
  };
  return {
    calls,
    from(table) {
      return {
        select: (columns) => query(table).select(columns),
        insert: (values) => { calls.push({ kind: "insert", table, values }); return query(table); },
        update: (values) => { calls.push({ kind: "update", table, values }); return query(table); },
      };
    },
    rpc(fn, args) {
      calls.push({ kind: "rpc", fn, args });
      if (fn !== "assessment_step_access") return Promise.resolve({ data: null, error: { code: "XX000", message: "unexpected rpc" } });
      if (accessError) return Promise.resolve({ data: null, error: accessError });
      const caller = args.p_caller;
      if (caller !== owner) return Promise.resolve({ data: null, error: { code: "42501", message: "not your application" } });
      return Promise.resolve({ data: { step_type: "typing_test", step_title: null, ...access }, error: null });
    },
  };
}
/** Only reads: no attempt opened (open_assessment_session), nothing inserted or updated. */
const opensNothing = (admin) => !admin.calls.some((c) => (c.kind === "rpc" && c.fn !== "assessment_step_access") || c.kind === "insert" || c.kind === "update");
const gated = { applicationId: APP, stepId: "wf-typing", userId: USER, purpose: "turns" };

{
  const admin = fakeAdmin({ latest: "active" });
  const verdict = await computerOnlyGate(admin, "phone", gated);
  check("FINDING 1: a phone on the attempt the page's mount opened (active, no start device) → refuse", verdict === "refuse");
  check("…and nothing was opened (only reads: no attempt, no timer, no event)", opensNothing(admin), JSON.stringify(admin.calls));
}
{
  const admin = fakeAdmin({ latest: "active" });
  check("FINDING 1: the same for a grading submit (evaluate / submit / sales submit) → refuse", (await computerOnlyGate(admin, "phone", { ...gated, purpose: "submit" })) === "refuse" && opensNothing(admin));
}
{
  const admin = fakeAdmin({ latest: null });
  check("a tablet with no attempt yet → refuse, opening nothing", (await computerOnlyGate(admin, "tablet", gated)) === "refuse" && opensNothing(admin));
}
{
  const admin = fakeAdmin({ latest: "active", started: "computer" });
  check("a phone on an attempt a COMPUTER started (active) → go: never broken", (await computerOnlyGate(admin, "phone", gated)) === "go" && opensNothing(admin));
}
{
  const admin = fakeAdmin({ latest: "abandoned", started: "computer" });
  check("FINDING 5: a phone after the computer tab went quiet (abandoned, computer start) → go: the same attempt is revived", (await computerOnlyGate(admin, "phone", gated)) === "go" && opensNothing(admin));
}
{
  const admin = fakeAdmin({ latest: "grading", started: "computer" });
  check("FINDING 5: a phone reload while the computer's submit is graded → go (session_busy / resume follows)", (await computerOnlyGate(admin, "phone", gated)) === "go");
}
{
  const admin = fakeAdmin({ latest: "completed", started: "computer", access: { finished: true, reopened: false } });
  check("FINDING 5: a retried submit on a finished step → go (alreadyRecorded follows, not computer_required)", (await computerOnlyGate(admin, "phone", { ...gated, purpose: "submit" })) === "go" && opensNothing(admin));
}
{
  const admin = fakeAdmin({ latest: "completed", started: "computer", access: { finished: false, reopened: true } });
  check("FINDING 4: staff reopened a finished step; a phone submit would open attempt n+1 → refuse", (await computerOnlyGate(admin, "phone", { ...gated, purpose: "submit" })) === "refuse" && opensNothing(admin));
}
{
  const admin = fakeAdmin({ latest: "active", started: "phone" });
  check("an attempt a phone started (a step that was not gated then) → refuse on a gated step", (await computerOnlyGate(admin, "phone", gated)) === "refuse");
}
{
  const admin = fakeAdmin({ latest: "active", started: "computer" });
  check("a new run (the typing start) or a practice with no attempt (the sales chat) → refuse even on a computer's attempt", (await computerOnlyGate(admin, "phone", { ...gated, purpose: "submit", continuable: false })) === "refuse");
}
{
  const admin = fakeAdmin({ latest: null });
  check("FINDING 6: a test placed BEFORE the job's check → go for a phone, without reading the attempt", (await computerOnlyGate(admin, "phone", { ...gated, stepId: "wf-chat-early", continuable: false })) === "go" && !admin.calls.some((c) => c.table === "assessment_sessions"));
}
{
  const admin = fakeAdmin({ latest: "active", started: "computer", steps: JOB_NO_CHECK });
  check("FINDING 6: with no check, the first test is gated", (await computerOnlyGate(admin, "phone", { ...gated, stepId: "wf-sales", continuable: false })) === "refuse");
}
{
  const admin = fakeAdmin({ latest: "active", started: "computer", owner: STRANGER });
  const verdict = await computerOnlyGate(admin, "phone", gated);
  check("FINDING 8: a phone naming SOMEONE ELSE's application with a live computer attempt → refuse", verdict === "refuse");
  check("…and the attempt was never read (the same refusal whatever its state: no oracle)", !admin.calls.some((c) => c.table === "assessment_sessions"));
}
{
  const admin = fakeAdmin({ latest: "active", started: "computer" });
  check("FINDING 8: a phone with no signed-in caller → refuse, without reading anything", (await computerOnlyGate(admin, "phone", { ...gated, userId: null })) === "refuse" && admin.calls.length === 0);
}
{
  const admin = fakeAdmin({ latest: "active", started: "computer", owner: STRANGER });
  check("a journey the caller already verified (steps passed in) skips the application read", (await computerOnlyGate(admin, "phone", { ...gated, userId: STRANGER, steps: JOB_WITH_CHECK })) === "go" && !admin.calls.some((c) => c.table === "applications"));
}
{
  const admin = fakeAdmin({ latest: "active", started: "computer", accessError: { code: "HF001", message: "closed" } });
  check("a phone on a closed application (access refused) → refuse", (await computerOnlyGate(admin, "phone", gated)) === "refuse");
}
{
  const admin = fakeAdmin({ sessionsError: true });
  check("a phone whose attempts cannot be read → refuse (it is still a phone)", (await computerOnlyGate(admin, "phone", gated)) === "refuse");
}
{
  const admin = fakeAdmin({ latest: null });
  check("a computer → go, without reading anything", (await computerOnlyGate(admin, "computer", gated)) === "go" && admin.calls.length === 0);
  check("an unknown device → go, without reading anything (never block on a missing header)", (await computerOnlyGate(fakeAdmin(), "unknown", gated)) === "go");
}
check("a phone with nothing to record against (no application) → refuse", (await computerOnlyGate(null, "phone", null)) === "refuse");
check("an unknown device with nothing to record against → go", (await computerOnlyGate(null, "unknown", null)) === "go");
{
  const access = await stepAccessFor(fakeAdmin({ access: { finished: true, reopened: false } }), { applicationId: APP, stepId: "wf-check", userId: USER });
  check("stepAccessFor reads finished/reopened for the caller", access?.finished === true && access?.reopened === false);
  check("stepAccessFor → null for someone else's application", (await stepAccessFor(fakeAdmin({ owner: STRANGER }), { applicationId: APP, stepId: "wf-check", userId: USER })) === null);
}

// ============================================================================
// 4. Every gated function calls the gate before it opens an attempt
// ============================================================================
console.log("\n4. The gate sits before the attempt is opened, in every gated function:\n");

const source = async (name) => readFile(path.join(ROOT, "supabase/functions", name, "index.ts"), "utf8");
/** `first` appears, and before `then` (both searched from `from`). */
function before(text, first, then, from = 0) {
  const a = text.indexOf(first, from);
  const b = text.indexOf(then, from);
  return a !== -1 && b !== -1 && a < b;
}
/** The request's headers AND the page's own reading decide the device. */
const importsGate = (text) => /from "\.\.\/_shared\/deviceKind\.ts"/.test(text) && text.includes("deviceKindOfRequest(req, ") && text.includes("computerRequiredBody(");

{
  const text = await source("connection-test");
  check("connection-test reads the headers and the page's reading", importsGate(text));
  const recordFrom = text.indexOf("const deviceKind = cleanDeviceKind(");
  check(
    "connection-test record: the page's device_kind AND the headers decide, refused before the attempt is resolved or claimed",
    recordFrom !== -1 && text.includes("combinedDeviceKind(requestDeviceKind(req), deviceKind)") && before(text, "if (needsComputer(recordDevice)) {", "const resolved = await resolveRecord();", recordFrom),
  );
  check(
    "connection-test record: FINDING 7, a finished step answers its result back before the refusal",
    recordFrom !== -1 && before(text, "if (access?.finished) {", "return jsonResponse(computerRequiredBody(recordDevice), 400);", recordFrom),
  );
  const eventFrom = text.indexOf('if (op === "event") {');
  check(
    "connection-test event: the gate (for THIS caller) runs before resolveSession",
    eventFrom !== -1 && before(text, "computerOnlyGate(record, eventDevice, { applicationId, stepId, userId: user.id", "resolveSession(record, {", eventFrom),
  );
  check("connection-test event: the first marker records the device the check started on", eventFrom !== -1 && before(text, "recordStartDevice(record, session, eventDevice)", "insertEvent(record, { sessionId: session.id, kind: \"system\", clientMsgId, detail: marker.detail })", eventFrom));
  const bytesFrom = text.indexOf('if (op === "ping" || op === "download" || op === "upload") {');
  const bytesEnd = text.indexOf("const supabaseUser = createClient(", bytesFrom);
  check("connection-test ping/download/upload stay open (no gate in the byte ops)", bytesFrom !== -1 && !text.slice(bytesFrom, bytesEnd).includes("needsComputer"));
}
{
  const text = await source("submit-typing-test");
  check("submit-typing-test reads the headers and the page's reading", importsGate(text) && text.includes("deviceKindOfRequest(req, payload)"));
  check("submit-typing-test: the gate is for THIS caller, with the journey it already loaded", text.includes("computerOnlyGate(record, requestDevice, { applicationId, stepId, userId: user.id, purpose: \"submit\", steps, continuable })"));
  const startFrom = text.indexOf('if (payload.action === "start") {');
  check("submit-typing-test start: a new run (continuable false), refused before the attempt is resolved", startFrom !== -1 && before(text, "await phoneRefused(false)", "await resolveRecord()", startFrom));
  check("submit-typing-test start: refused before the start row (the timer) is written", startFrom !== -1 && before(text, "await phoneRefused(false)", '.from("typing_test_starts")', startFrom));
  check("submit-typing-test start: the attempt records the device it started on", text.includes("started_device_kind: requestDevice"));
  const snapFrom = text.indexOf('if (payload.action === "snapshot") {');
  check("submit-typing-test snapshot: gated before openRecord (a snapshot never opens an attempt from a phone)", snapFrom !== -1 && before(text, "await phoneRefused(true)", "await openRecord()", snapFrom));
  const completeFrom = text.indexOf('if (payload.action === "complete") {');
  check("submit-typing-test complete: FINDING 4, gated before ended_at is stamped and before openRecord", completeFrom !== -1 && before(text, "await phoneRefused(true)", '.from("typing_test_starts")', completeFrom) && before(text, "await phoneRefused(true)", "await openRecord()", completeFrom));
  const submitFrom = text.indexOf('if (payload.action === "submit") {');
  check("submit-typing-test submit: FINDING 4, gated before resolveRecord", submitFrom !== -1 && before(text, "await phoneRefused(true)", "await resolveRecord()", submitFrom));
}
{
  const text = await source("ai-chat-simulation");
  check("ai-chat-simulation reads the headers and the page's reading", importsGate(text));
  check(
    "ai-chat-simulation: FINDING 8, the caller is resolved BEFORE the gate, and the gate is for that caller",
    before(text, "const callerId = target ? await resolveCallerId(req) : null;", "computerOnlyGate(target ? recordClient() : null, requestDevice, target ? { ...target, userId: callerId, purpose: \"turns\" } : null)"),
  );
  check(
    "ai-chat-simulation: FINDING 3, every start AND reply from a phone is gated (a reply without an application is refused)",
    text.includes("if (needsComputer(requestDevice)) {\n      const gate = await computerOnlyGate(target ? recordClient() : null"),
  );
  check(
    "ai-chat-simulation start/respond: the gate runs before the turn record's resolveSession (which opens the attempt)",
    before(text, "computerOnlyGate(target ? recordClient() : null, requestDevice", 'resolveSession(admin, { ...target, userId, stepType: "chat_simulation"'),
  );
  const evalFrom = text.indexOf('if (mode === "evaluate") {');
  check(
    "ai-chat-simulation evaluate: a phone is gated (for this caller) before resolveSession",
    evalFrom !== -1 && before(text, 'computerOnlyGate(record, requestDevice, { applicationId, stepId, userId: callerUserId, purpose: "submit" })', "resolveSession(record, {", evalFrom),
  );
  check("ai-chat-simulation start: the attempt records its start device before the opener", before(text, "await recordStartDevice(admin, session, requestDevice);", "askForOpener(admin, session.id)"));
}
{
  const text = await source("ai-chat-interview");
  check("ai-chat-interview reads the headers and the page's reading", importsGate(text));
  check(
    "ai-chat-interview: FINDING 8, the caller is resolved BEFORE the gate, and the gate is for that caller",
    before(text, "const callerId = target ? await resolveCallerId(req) : null;", "computerOnlyGate(target ? recordClient() : null, requestDevice, target ? { ...target, userId: callerId, purpose: \"turns\" } : null)"),
  );
  check("ai-chat-interview: FINDING 3, every start AND answer from a phone is gated", text.includes('if (needsComputer(requestDevice) && (mode === "start" || mode === "respond")) {'));
  check(
    "ai-chat-interview start/respond: the gate runs before the turn record's resolveSession",
    before(text, "computerOnlyGate(target ? recordClient() : null, requestDevice", 'resolveSession(admin, { ...target, userId, stepType: "chat_interview"'),
  );
  check(
    "ai-chat-interview submit: gated (for this caller) before the submit's resolveSession and before anything is spent",
    before(text, "userId: submitCallerUserId,", 'stepType: "chat_interview",\n        purpose: "submit"') &&
      before(text, "computerOnlyGate(supabaseAdmin as unknown as AssessmentAdmin, requestDevice", "streamOpenAIChatCompletion("),
  );
  check("ai-chat-interview start: the attempt records its start device before the greeting", before(text, "await recordStartDevice(admin, session, requestDevice);", "askForOpener(admin, session.id)"));
}
{
  const text = await source("submit-sales-simulation");
  check("submit-sales-simulation reads the headers and the page's reading", importsGate(text));
  check(
    "submit-sales-simulation: a phone is gated (for this caller) before resolveSession",
    before(text, 'computerOnlyGate(record, requestDevice, { applicationId, stepId, userId: callerId, purpose: "submit" })', "resolveSession(record, {"),
  );
  check("submit-sales-simulation: the submit records the device the practice was taken on, before grading", before(text, "recordStartDevice(record, session, requestDevice)", "gateGrading(record, session"));
}
{
  const text = await source("ai-sales-simulation");
  check("ai-sales-simulation reads the headers and the page's reading", importsGate(text));
  check("ai-sales-simulation: FINDING 3, a phone is gated on EVERY mode (start and reply), not only the start", !text.includes('mode === "start" && needsComputer') && text.includes("if (needsComputer(requestDevice)) {"));
  check("ai-sales-simulation: nothing marks a practice, so the gate never continues one (continuable false)", text.includes('purpose: "turns", continuable: false'));
  check("ai-sales-simulation: refused before anything is asked of the model", before(text, "if (needsComputer(requestDevice)) {", "streamOpenAIChatCompletion("));
}
{
  const text = await source("ava-voice-session");
  check("ava-voice-session reads the headers and the page's reading", importsGate(text));
  check(
    "ava-voice-session: FINDING 6, a phone interview start on a gated voice step is refused before any session is minted",
    before(text, "stepNeedsComputer(interviewWorkflowSteps, voiceStepId) !== false", "hasSubscriptionBypassForUser(") && before(text, "computerRequiredBody(voiceDevice)", "voiceOwnerUserId = (interviewApplication.jobs"),
  );
}
{
  const text = await readFile(path.join(ROOT, "supabase/functions/_shared/deviceKind.ts"), "utf8");
  check("_shared/deviceKind.ts is import-free (Deno and Node both load it)", !/^\s*import\s/m.test(text) && !/\bfrom\s+["']/.test(text));
  check("FINDING 2: the comment no longer claims a desktop-site Android request still sends ?1", !/still sends Sec-CH-UA-Mobile \?1/.test(text));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
