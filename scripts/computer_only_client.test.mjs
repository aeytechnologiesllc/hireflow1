#!/usr/bin/env node
/**
 * The screen half of docs/COMPUTER-ONLY-TESTS.md: plain assertions, no
 * framework, against the REAL modules (no copy).
 *
 *   1. Which steps: stepNeedsComputer (src/lib/deviceGate.ts) for every step
 *      of jobs with and without a connection check, every step type, and
 *      the same answer as the server's own rule
 *      (supabase/functions/_shared/deviceKind.ts) for every step of every job.
 *   2. Which devices: thisDeviceNeedsComputer, through the connection check's
 *      own reader, for every user agent in the table
 *      scripts/connection_check_client.test.mjs keeps (read from that file,
 *      not copied), plus the Linux touch laptop (contract finding 7) and an
 *      iPad with a trackpad.
 *   3. The page's side of the contract: the body carries `deviceKind`, the
 *      400 `computer_required` is recognised (and nothing else is), the
 *      connection check's markers carry the reading and report the refusal.
 *   4. The wiring, read from the source: the gate decides before the step
 *      page mounts; the screen opens nothing and never names a machine; each
 *      gated page hands a refusal to the screen; a phone has no "run it here
 *      anyway"; the voice interview sends its step; a closed application gets
 *      the decision card; the integrity monitor records no "left the test
 *      page" when the gate takes the page away.
 *   5. The screen's promise ("go to <site>/applications, sign in, you will be
 *      taken straight to this step"): stepWaitingOnComputer and the fresh
 *      arrival it is offered on; the applications list's buttons through the
 *      one step-to-route map.
 *
 * Run with: node scripts/computer_only_client.test.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMPUTER_REQUIRED_CODE,
  ComputerRequiredError,
  computerPartStartsAt,
  isComputerRequired,
  kindNeedsComputer,
  readThisDevice,
  refusedDeviceKind,
  stepNeedsComputer,
  TESTS_THAT_MATTER,
  thisDeviceKind,
  thisDeviceNeedsComputer,
  throwIfComputerRequired,
  withDeviceKind,
} from "../src/lib/deviceGate.ts";
import { buildCandidateJourney, COMPUTER_STEP_TYPES } from "../src/lib/candidateJourney.ts";
import { createMarkerSender, deviceKindOf, isArmDevice } from "../src/lib/connectionTest.ts";
import { arrivedFromSignIn, AFTER_SIGN_IN_STATE, isFreshArrival, stepWaitingOnComputer } from "../src/lib/resumeOnComputer.ts";
import {
  COMPUTER_REQUIRED_CODE as SERVER_CODE,
  computerRequiredBody,
  stepNeedsComputer as serverStepNeedsComputer,
  TESTS_THAT_MATTER as SERVER_TESTS_THAT_MATTER,
} from "../supabase/functions/_shared/deviceKind.ts";

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

const read = (rel) => readFile(path.join(ROOT, rel), "utf8");

/** The journey a job's own steps make (application, quiz when it has one, its steps, decision). */
const journey = (types, hasQuiz = true) =>
  buildCandidateJourney(types.map((type, i) => ({ id: `s${i}-${type}`, type, title: null })), { hasQuiz });

/** Which steps of a journey the rule gates, by type, in order. */
const gatedTypes = (steps) => steps.filter((s) => stepNeedsComputer(steps, s.id)).map((s) => s.type);
const openTypes = (steps) => steps.filter((s) => !stepNeedsComputer(steps, s.id)).map((s) => s.type);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ----------------------------------------------------------- which steps */
console.log("Which steps — the job's first connection check and every step after it:\n");

const EVERY_TYPE = [
  "video_intro",
  "equipment_check",
  "typing_test",
  "chat_simulation",
  "chat_interview",
  "sales_simulation",
  "voice_interview",
  "portfolio_upload",
];

{
  // The fixture Barista job's shape: the check first, everything after it.
  const steps = journey(["equipment_check", "typing_test", "video_intro", "chat_simulation", "chat_interview", "sales_simulation", "voice_interview", "portfolio_upload"]);
  check(
    "check first: the form and the skills check stay open, the check and every step after it (each type) are on a computer",
    same(openTypes(steps), ["application", "quiz"]) &&
      same(gatedTypes(steps), ["equipment_check", "typing_test", "video_intro", "chat_simulation", "chat_interview", "sales_simulation", "voice_interview", "portfolio_upload", "decision"]),
    JSON.stringify({ open: openTypes(steps), gated: gatedTypes(steps) }),
  );
}
{
  const steps = journey(["video_intro", "portfolio_upload", "equipment_check", "typing_test", "chat_interview"]);
  check(
    "check in the middle: a video intro and a portfolio placed before it stay open; the check and after are gated",
    same(openTypes(steps), ["application", "quiz", "video_intro", "portfolio_upload"]) &&
      same(gatedTypes(steps), ["equipment_check", "typing_test", "chat_interview", "decision"]),
    JSON.stringify({ open: openTypes(steps), gated: gatedTypes(steps) }),
  );
}
{
  // The contract: "A test placed before the check stays open."
  const steps = journey(["typing_test", "sales_simulation", "equipment_check", "chat_simulation"]);
  check(
    "a test placed BEFORE the check stays open (the check decides when there is one)",
    same(openTypes(steps), ["application", "quiz", "typing_test", "sales_simulation"]) && same(gatedTypes(steps), ["equipment_check", "chat_simulation", "decision"]),
    JSON.stringify({ open: openTypes(steps), gated: gatedTypes(steps) }),
  );
}
{
  const steps = journey(["equipment_check", "typing_test", "equipment_check", "chat_interview"]);
  check("two checks: the FIRST one starts the computer-only part", computerPartStartsAt(steps) === 2 && same(gatedTypes(steps), ["equipment_check", "typing_test", "equipment_check", "chat_interview", "decision"]));
}
for (const test of TESTS_THAT_MATTER) {
  const steps = journey(["video_intro", test, "portfolio_upload"], false);
  check(
    `no check, first test that matters is ${test}: it and every step after it are gated, the video intro before it is not`,
    same(openTypes(steps), ["application", "video_intro"]) && same(gatedTypes(steps), [test, "portfolio_upload", "decision"]),
    JSON.stringify({ open: openTypes(steps), gated: gatedTypes(steps) }),
  );
}
{
  const steps = journey(["video_intro", "portfolio_upload"]);
  check("a job with no check and no test that matters gates nothing", gatedTypes(steps).length === 0 && computerPartStartsAt(steps) === -1);
  check("…and a job with no steps at all gates nothing", gatedTypes(journey([], false)).length === 0);
}
{
  const steps = journey(["equipment_check", "typing_test"]);
  check("the application form is never gated, even asked by its own id", stepNeedsComputer(steps, "application") === false);
  check("the skills check is never gated", stepNeedsComputer(steps, "quiz") === false);
  // A malformed job that lists them inside workflow_steps after a check.
  const odd = [{ id: "c", type: "equipment_check" }, { id: "form2", type: "application" }, { id: "quiz2", type: "quiz" }, { id: "t", type: "typing_test" }];
  check("…even when a malformed list puts them after a check", stepNeedsComputer(odd, "form2") === false && stepNeedsComputer(odd, "quiz2") === false && stepNeedsComputer(odd, "t") === true);
  check("a step id the journey does not have answers false (the step gate already refused it)", stepNeedsComputer(steps, "nope") === false && stepNeedsComputer(steps, "") === false && stepNeedsComputer(steps, undefined) === false);
  check("broken input never throws", stepNeedsComputer(null, "x") === false && stepNeedsComputer([null, {}, { id: 3, type: "typing_test" }], "x") === false);
}
{
  // The same rule as the server, for every step of every job above.
  const jobs = [
    ["equipment_check", "typing_test", "video_intro", "chat_simulation", "chat_interview", "sales_simulation", "voice_interview", "portfolio_upload"],
    ["video_intro", "portfolio_upload", "equipment_check", "typing_test", "chat_interview"],
    ["typing_test", "sales_simulation", "equipment_check", "chat_simulation"],
    ["video_intro", "portfolio_upload"],
    ...TESTS_THAT_MATTER.map((t) => ["video_intro", t, "portfolio_upload"]),
    ...EVERY_TYPE.map((t) => [t]),
  ];
  const disagree = [];
  for (const types of jobs) {
    for (const hasQuiz of [true, false]) {
      const steps = journey(types, hasQuiz);
      for (const s of steps) {
        if (stepNeedsComputer(steps, s.id) !== (serverStepNeedsComputer(steps, s.id) === true)) disagree.push(`${types.join(",")}:${s.type}`);
      }
    }
  }
  check("the page and the server put exactly the same steps on a computer, for every step of every job", disagree.length === 0, disagree.join(" "));
  check("the page's and the server's 'tests that matter' are the same list", same([...TESTS_THAT_MATTER].sort(), [...SERVER_TESTS_THAT_MATTER].sort()));
  check("…and both sit inside the Share Kit's 'done at a computer' types", [...TESTS_THAT_MATTER, "equipment_check"].every((t) => COMPUTER_STEP_TYPES.has(t)));
}

/* --------------------------------------------------------- which devices */
console.log("\nWhich devices — the connection check's own reading, the UA table it is tested with:\n");

// The UA table scripts/connection_check_client.test.mjs keeps, read from it (never copied here).
const clientTest = await read("scripts/connection_check_client.test.mjs");
const tableText = /const UA = (\{[\s\S]*?\n\});/.exec(clientTest)?.[1];
const UA = tableText ? new Function(`return ${tableText};`)() : null;
check("the UA table was read from scripts/connection_check_client.test.mjs", !!UA && Object.keys(UA).length >= 10, tableText ? "" : "not found");

/** What each device in that table really is, with the screen and touch it has. */
const DEVICES = {
  windowsChrome: { screen: [1920, 1080], touch: 0, uaData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "Windows", mobile: false }, want: "computer" },
  windowsEdge: { screen: [1280, 720], touch: 10, uaData: { brands: [{ brand: "Microsoft Edge", version: "131" }], platform: "Windows", mobile: false }, want: "computer" },
  macSafari: { screen: [1512, 982], touch: 0, want: "computer" },
  macFirefox: { screen: [1440, 900], touch: 0, want: "computer" },
  androidChrome: { screen: [412, 915], touch: 5, uaData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "Android", mobile: true }, want: "phone" },
  androidTablet: { screen: [1600, 2560], touch: 10, uaData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "Android", mobile: false }, want: "tablet" },
  iphone: { screen: [390, 844], touch: 5, want: "phone" },
  ipad: { screen: [834, 1194], touch: 5, want: "tablet" },
  ipadAsMac: { screen: [1180, 820], touch: 5, want: "tablet" },
  linuxChrome: { screen: [1920, 1080], touch: 0, uaData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "Linux", mobile: false }, want: "computer" },
};
const sourcesFor = (name, extra = {}) => {
  const d = DEVICES[name];
  return { userAgent: UA?.[name] ?? "", userAgentData: d.uaData ?? null, screenWidth: d.screen[0], screenHeight: d.screen[1], maxTouchPoints: d.touch, ...extra };
};

if (UA) {
  for (const name of Object.keys(UA)) {
    if (!DEVICES[name]) {
      check(`every device in the table is judged here (${name} has no expectation)`, false);
      continue;
    }
    const want = DEVICES[name].want;
    const kind = await thisDeviceKind(sourcesFor(name));
    const needs = await thisDeviceNeedsComputer(sourcesFor(name));
    check(`${name}: ${want}${want === "computer" ? " — takes the tests here" : " — continues on a computer"}`, kind === want && needs === (want !== "computer"), `${kind} / ${needs}`);
  }
}
{
  // Contract finding 7: a Linux touch laptop at 1280x720 is a computer when
  // its main pointer is a trackpad; an Android phone asking for the desktop
  // site (Linux, mobile:false, a finger) stays a phone.
  const laptop = { userAgent: UA?.linuxChrome ?? "", userAgentData: DEVICES.linuxChrome.uaData, screenWidth: 1280, screenHeight: 720, maxTouchPoints: 10 };
  check("a Linux touch laptop (1280×720) whose main pointer is a trackpad is a computer", (await thisDeviceKind({ ...laptop, finePointer: true })) === "computer");
  check("…the same screen with only a finger (an Android phone on the desktop site) is a phone", (await thisDeviceKind({ ...laptop, screenWidth: 412, screenHeight: 915, finePointer: false })) === "phone");
  check("…and with no pointer reading at all, the short-side rule decides as before", (await thisDeviceKind({ ...laptop, finePointer: undefined })) === "phone");
  check("an iPad on the desktop site with a trackpad attached is still a tablet (no Mac has a touch screen)", (await thisDeviceKind({ ...sourcesFor("ipadAsMac"), finePointer: true })) === "tablet");
  check("deviceKindOf: the pointer never turns a phone that SAYS mobile into a computer", deviceKindOf({ mobile: true, tablet: false, touch: true, shortSide: 412, os: "Linux", finePointer: true }) === "phone");
  check("deviceKindOf: nor a tablet the UA names", deviceKindOf({ mobile: false, tablet: true, touch: true, shortSide: 800, os: "Linux", finePointer: true }) === "tablet");
  check("kindNeedsComputer: phone and tablet only", kindNeedsComputer("phone") && kindNeedsComputer("tablet") && !kindNeedsComputer("computer") && !kindNeedsComputer(null) && !kindNeedsComputer("unknown"));
  // Review 2026-10-06, finding 1: Android tablets on Chrome's default
  // desktop site (10 inches or more; Samsung Internet, Firefox and Silk can
  // too) report Linux, mobile:false and a screen like 1280×800, which the
  // short-side rule misses. Linux with touch is decided in full.
  const androidDesktopUa = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  const androidTabletDesktop = {
    userAgent: androidDesktopUa,
    userAgentData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "Linux", mobile: false },
    screenWidth: 1280,
    screenHeight: 800,
    maxTouchPoints: 10,
    finePointer: false,
  };
  check("an Android tablet on Chrome's default desktop site (Linux, mobile:false, touch, 1280×800, a finger) is a tablet", (await thisDeviceKind(androidTabletDesktop)) === "tablet");
  check("…and continues on a computer", await thisDeviceNeedsComputer(androidTabletDesktop));
  check("…portrait (800×1280) too", (await thisDeviceKind({ ...androidTabletDesktop, screenWidth: 800, screenHeight: 1280 })) === "tablet");
  check("…with no pointer reading at all, still a tablet (never a computer by default)", (await thisDeviceKind({ ...androidTabletDesktop, finePointer: undefined })) === "tablet");
  check(
    "…with a trackpad keyboard cover (a fine pointer) on an ARM processor (navigator.platform), still a tablet",
    (await thisDeviceKind({ ...androidTabletDesktop, finePointer: true, platform: "Linux armv81" })) === "tablet" &&
      (await thisDeviceKind({ ...androidTabletDesktop, finePointer: true, platform: "Linux aarch64" })) === "tablet",
  );
  check(
    "…or an ARM processor named by the high-entropy architecture",
    (await thisDeviceKind({
      ...androidTabletDesktop,
      finePointer: true,
      userAgentData: { ...androidTabletDesktop.userAgentData, getHighEntropyValues: async () => ({ architecture: "arm", platformVersion: "" }) },
    })) === "tablet",
  );
  check("an Android phone on the desktop site with a trackpad (DeX-like, ARM, 412×915) is a phone", (await thisDeviceKind({ ...androidTabletDesktop, screenWidth: 412, screenHeight: 915, finePointer: true, platform: "Linux armv8l" })) === "phone");
  check("a Linux touch laptop (x86, a trackpad, 1280×800) stays a computer", (await thisDeviceKind({ ...androidTabletDesktop, finePointer: true, platform: "Linux x86_64" })) === "computer");
  check("a Linux laptop with no touch screen is a computer whatever its pointer", (await thisDeviceKind({ ...androidTabletDesktop, maxTouchPoints: 0, finePointer: false, platform: "Linux aarch64" })) === "computer");
  check(
    "isArmDevice: navigator.platform or the architecture; null when neither says",
    isArmDevice("Linux aarch64", null) === true && isArmDevice("Linux armv8l", null) === true && isArmDevice("Linux armv81", undefined) === true &&
      isArmDevice("Linux x86_64", "x86") === false && isArmDevice("Linux x86_64", "arm") === true && isArmDevice(null, "arm") === true &&
      isArmDevice("MacIntel", null) === false && isArmDevice(undefined, undefined) === null && isArmDevice("", "") === null,
  );
  check("deviceKindOf: Linux touch decided in full — finger → tablet at 800, phone at 412", deviceKindOf({ mobile: false, tablet: false, touch: true, shortSide: 800, os: "Linux", finePointer: false }) === "tablet" && deviceKindOf({ mobile: false, tablet: false, touch: true, shortSide: 412, os: "Linux", finePointer: false }) === "phone");
  check("deviceKindOf: Linux touch + trackpad + ARM → tablet; + trackpad, not ARM → computer", deviceKindOf({ mobile: false, tablet: false, touch: true, shortSide: 800, os: "Linux", finePointer: true, arm: true }) === "tablet" && deviceKindOf({ mobile: false, tablet: false, touch: true, shortSide: 800, os: "Linux", finePointer: true, arm: false }) === "computer");
  // Finding 6: an iPhone on "Request Desktop Website" (a Mac UA, touch, 390×844) is a phone, not a tablet.
  const iphoneDesktopUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
  check("an iPhone on Request Desktop Website (Mac UA, touch, 390×844) is a phone", (await thisDeviceKind({ userAgent: iphoneDesktopUa, userAgentData: null, screenWidth: 390, screenHeight: 844, maxTouchPoints: 5 })) === "phone");
  check("…the largest iPhone (440×956) too", (await thisDeviceKind({ userAgent: iphoneDesktopUa, userAgentData: null, screenWidth: 440, screenHeight: 956, maxTouchPoints: 5 })) === "phone");
  check("an iPad mini on the default desktop site (Mac UA, touch, 744×1133) is a tablet, not a phone", (await thisDeviceKind({ userAgent: iphoneDesktopUa, userAgentData: null, screenWidth: 744, screenHeight: 1133, maxTouchPoints: 5 })) === "tablet");
  const broken = await readThisDevice({ get userAgent() { throw new Error("no"); } });
  check("a read that fails falls back to a computer (as the connection check does; the server is the backstop)", broken.kind === "computer");
}

/* --------------------------------------------- the page's side of the contract */
console.log("\nThe page's side of the contract — deviceKind in the body, the refusal read:\n");

{
  check("the refusal code is the server's own", COMPUTER_REQUIRED_CODE === SERVER_CODE);
  const body = computerRequiredBody("phone");
  check("the server's real refusal body is recognised", isComputerRequired(400, body) && refusedDeviceKind(body) === "phone");
  check("…a tablet's too", refusedDeviceKind(computerRequiredBody("tablet")) === "tablet");
  check("only a 400 counts (a 409, a 200, a 503 carrying the code do not)", !isComputerRequired(409, body) && !isComputerRequired(200, body) && !isComputerRequired(503, body));
  check("another 400 is not it (a stale chain, turn_not_saved)", !isComputerRequired(400, { code: "stale_chain", error: "x" }) && !isComputerRequired(400, { error: "Unauthorized" }) && !isComputerRequired(400, null));
  let thrown = null;
  try {
    throwIfComputerRequired(400, body);
  } catch (e) {
    thrown = e;
  }
  check("throwIfComputerRequired throws a ComputerRequiredError naming the device", thrown instanceof ComputerRequiredError && thrown.deviceKind === "phone");
  let quiet = true;
  try {
    throwIfComputerRequired(503, { code: "turn_not_saved" });
  } catch {
    quiet = false;
  }
  check("…and is quiet for anything else", quiet);
  check("withDeviceKind adds the reading", same(withDeviceKind({ a: 1 }, "tablet"), { a: 1, deviceKind: "tablet" }));
  check("…and adds nothing while the device is unread (the server judges the headers)", same(withDeviceKind({ a: 1 }, null), { a: 1 }));
  const original = { a: 1 };
  withDeviceKind(original, "phone");
  check("…never changing the body it was given", same(original, { a: 1 }));
}
{
  // The connection check's markers (connection-test?op=event).
  const calls = [];
  const refusals = [];
  const sender = createMarkerSender(
    async (name, options) => {
      calls.push({ name, options });
      const json = computerRequiredBody("tablet");
      return { data: null, error: { name: "FunctionsHttpError", context: { status: 400, clone: () => ({ json: async () => json }) } } };
    },
    { applicationId: "app-1", stepId: "step_connection" },
    { deviceKind: () => "tablet", onRefused: (r) => refusals.push(r) },
  );
  sender.mark("device_read", { device_kind: "tablet" }, "k1");
  await new Promise((r) => setTimeout(r, 10));
  check("every marker carries the page's reading as deviceKind", calls[0]?.options.body.deviceKind === "tablet", JSON.stringify(calls[0]?.options.body));
  check("a marker refused with computer_required reaches the page (code and device)", refusals.length === 1 && refusals[0].code === "computer_required" && refusedDeviceKind(refusals[0].body) === "tablet", JSON.stringify(refusals));
  const figures = await sender.finishRun({ run: 1, estimate: { downloadMbps: 1, uploadMbps: 1, latencyMs: 1 }, stamps: ["a"], key: "k2" });
  await new Promise((r) => setTimeout(r, 10));
  check("a finished run refused the same way is no figures, and reaches the page too", figures === null && refusals.length === 2);
  const plain = createMarkerSender(async (name, options) => ({ data: { recorded: true }, error: null, _: calls.push({ name, options }) }), { applicationId: "a", stepId: "s" });
  plain.mark("test_started", { run: 1 }, "k3");
  await new Promise((r) => setTimeout(r, 0));
  check("a sender made the old way (no options) sends no deviceKind and still works", !("deviceKind" in calls[calls.length - 1].options.body));
  const named = createMarkerSender(async (name) => ({ data: null, error: null, _: calls.push({ name }) }), { applicationId: "a", stepId: "s" }, "other-fn");
  named.mark("test_started", { run: 1 }, "k4");
  await new Promise((r) => setTimeout(r, 0));
  check("…and a function name passed as before still names the function", calls[calls.length - 1].name === "other-fn?op=event");
}

/* ------------------------------------------------------------- the wiring */
console.log("\nThe wiring — read from the source:\n");

{
  const gate = await read("src/components/candidate/CandidateStepGate.tsx");
  const screen = await read("src/components/candidate/ContinueOnComputer.tsx");
  const decide = gate.indexOf("needsComputer && kindNeedsComputer(deviceKind)");
  const children = gate.lastIndexOf("{children}");
  check("the gate decides with the shared rule and the shared reading", /stepNeedsComputer\(steps, thisStep\.id\)/.test(gate) && /readThisDevice\(\)/.test(gate));
  check("…BEFORE the step page mounts (the screen is returned in place of children)", decide !== -1 && children !== -1 && decide < children && /<ContinueOnComputer\b/.test(gate));
  check("…and a gated step waits for the reading, so a phone never mounts it first", /if \(needsComputer && deviceKind === null\)/.test(gate));
  check("…a step behind them on a phone gets the live 'where things stand' card, not 'continue'", /stepBehind && !refusedHere/.test(gate) && /<NextStepCard\b/.test(gate));
  check("…and the gate is where a page's refusal lands (one provider around the step page)", /<ContinueOnComputerContext\.Provider value=\{showContinueOnComputer\}>\{children\}/.test(gate));
  // Finding 4: a closed application keeps its phase on the step the decision found it at.
  check(
    "…a closed application (rejected or hired) gets the decision card, never 'continue', even after a refusal",
    /const closed = appStatus === "rejected" \|\| appStatus === "hired";/.test(gate) && /\(closed \|\|\s*actualPosition\.index > resolution\.index/.test(gate) && /if \(closed \|\| \(stepBehind && !refusedHere\)\)/.test(gate),
  );
  // Finding 5: the swap itself is not the person leaving the test page.
  const integrity = await read("src/hooks/useTestIntegrity.ts");
  check(
    "…the gate marks the handover BEFORE the page unmounts, and the integrity monitor then records no 'left the test page'",
    /handoverRef\.current = true;\s*setRefused\(/.test(gate) && /<ComputerHandoverContext\.Provider value=\{handoverRef\}>/.test(gate) &&
      /useComputerHandover\(\)/.test(integrity) && /if \(handoverRef\.current\?\.current\) monitor\.setActive\(false\);\s*else if \(\(mountedMonitors\.get\(monitorKey\) \?\? 0\) === 0\) monitor\.leftPage\(\);/.test(integrity),
  );
  check("…and the screen does not claim nothing started when the server refused a step page that was open", /startedHere=\{!!refusedHere\}/.test(gate) && /startedHere\s*\?\s*"Your answers so far are saved\."/.test(screen));

  const machine = /\b(ava|a\.?i\.?|artificial intelligence|bot|automated|algorithm|machine|robot)\b/i;
  const visible = screen
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l) && !/^\s*import /.test(l))
    .join("\n");
  const strings = [...visible.matchAll(/>([^<>{}]+)</g), ...visible.matchAll(/"([^"\n]{6,})"/g)].map((m) => m[1]);
  const named = strings.filter((s) => machine.test(s));
  check("the screen's words never name a machine", named.length === 0, named.join(" | "));
  check("the screen says 'Continue on your computer', where to go, the same email, straight to this step, and that answers are saved",
    /Continue on your computer/.test(screen) && /Go to/.test(screen) && /Sign in with the same email/.test(screen) && /taken straight to this step/.test(screen) && /answers so far are saved/.test(screen));
  check("the screen offers this step's own address to copy", /Copy link/.test(screen) && /stepRoute\(applicationId, step\)/.test(screen));
  // Finding 3: the bare site (one open role → that role's page) and the job's link lead to the overview or a new application, never the step.
  check(
    "the screen sends them to <site>/applications (sign-in, then the step), not the bare site or the job's link",
    /const applicationsAddress = `\$\{siteName\}\/applications`;/.test(screen) && /Go to <strong className="font-semibold">\{applicationsAddress\}<\/strong>\./.test(screen) && !/jobSlug|jobLink|usableSlug/.test(screen),
  );
  // Its one write (docs/COMPUTER-ONLY-TESTS.md, "Staff"): the waiting stamp,
  // through src/lib/waitingOnComputer.ts, which calls exactly one function.
  const waitingLib = await read("src/lib/waitingOnComputer.ts");
  check(
    "the screen opens nothing but the one waiting stamp: no attempt, no other function, no integrity hook, no timer of a test",
    !/\.rpc\(|functions\.invoke|fetch\(|start_assessment_session|record_integrity_events|useAssessmentSession|useTestIntegrity|supabase/.test(screen) &&
      /useEffect\(\(\) => \{\s*void markWaitingOnComputer\(applicationId, step\.id, device\);\s*\}, \[applicationId, step\.id, device\]\);/.test(screen) &&
      (waitingLib.match(/\.rpc\(/g) ?? []).length === 1 &&
      /\.rpc\("mark_waiting_on_computer"/.test(waitingLib) &&
      !/functions\.invoke|fetch\(|start_assessment_session|open_assessment_session|record_integrity_events|useTestIntegrity/.test(waitingLib),
  );

  const conn = await read("src/pages/ConnectionCheckPhase.tsx");
  const phoneBranch = /\{looksLikePhone \? \(([\s\S]*?)\) : saidNo \? \(/.exec(conn)?.[1] ?? "";
  check("connection check: the phone branch has no 'run it here anyway'", phoneBranch.length > 0 && !/runHereAnyway|run it here anyway/i.test(phoneBranch));
  check("…the escape stays for a computer that is not their work one", /saidNo \? \([\s\S]*onClick=\{runHereAnyway\}[\s\S]*I can't right now, run it here anyway\./.test(conn));
  check("…and refuses to run on a phone or tablet whatever calls it", /const runHereAnyway = \(\) => \{\s*if \(looksLikePhone\) return;/.test(conn));
  check("…a phone that got here outside the gate is handed to the screen", /if \(reading && kindNeedsComputer\(reading\.kind\)\) showContinueOnComputer\(reading\.kind\)/.test(conn));
  check("…the record of the step never opens on a phone or tablet", /enabled: resultAtFirstLoad === false && !!reading && !kindNeedsComputer\(reading\.kind\)/.test(conn));
  check("…record's 400 computer_required shows the screen", /isComputerRequired\(reply\?\.status, reply\?\.body\)[\s\S]{0,120}showContinueOnComputer\(refusedDeviceKind\(reply\?\.body\)\)/.test(conn));
  check("…every marker carries the reading and a computer_required refusal shows the screen", /deviceKind: \(\) => readingRef\.current\?\.kind \?\? knownDeviceKind\(\)/.test(conn) && /refusal\.code !== COMPUTER_REQUIRED_CODE/.test(conn));
  check("…and the page and the gate share one reading", /readThisDevice\(\)/.test(conn) && !/\breadDevice\(\)/.test(conn));

  const pages = {
    "src/pages/TypingTestPhase.tsx": ["start", "complete", "submit", "snapshot"],
    "src/pages/ChatSimulationPhase.tsx": ["stream", "evaluate"],
    "src/pages/ChatInterviewPhase.tsx": ["stream", "submit"],
    "src/pages/SalesSimulationPhase.tsx": ["stream", "submit"],
  };
  for (const [file] of Object.entries(pages)) {
    const src = await read(file);
    const name = path.basename(file, ".tsx");
    check(`${name}: hands a computer_required refusal to the screen, not a toast`, /useShowContinueOnComputer\(\)/.test(src) && /showContinueOnComputer\(/.test(src) && /isComputerRequired\(|ComputerRequiredError/.test(src));
  }
  const typing = await read("src/pages/TypingTestPhase.tsx");
  const typingBodies = (typing.match(/withDeviceKind\(\{/g) || []).length;
  check("TypingTestPhase: start, complete (and its keepalive), snapshot and submit all carry deviceKind", typingBodies >= 5 && /withDeviceKind\(\{ action: "start"/.test(typing) && /withDeviceKind\(\{ action: "snapshot"/.test(typing), String(typingBodies));
  for (const file of ["src/pages/ChatSimulationPhase.tsx", "src/pages/ChatInterviewPhase.tsx", "src/pages/SalesSimulationPhase.tsx"]) {
    const src = await read(file);
    const name = path.basename(file, ".tsx");
    check(`${name}: the chat call and the send both carry deviceKind, and the chat reads the refusal before its own retry`,
      (src.match(/JSON\.stringify\(withDeviceKind\(\{/g) || []).length === 2 && /throwIfComputerRequired\(response\.status, errorData\);\s*if \(!isTurnNotSaved/.test(src));
  }
  const voice = await read("src/hooks/useAvaVoice.ts");
  const voicePage = await read("src/pages/VoiceInterviewPhase.tsx");
  check("voice interview: the session request carries its step and the reading, and the refusal goes to the page",
    /stepId: optionsRef\.current\.stepId/.test(voice) && /inInterviewMode \? withDeviceKind\(sessionBody\) : sessionBody/.test(voice) && /throwIfComputerRequired\(refused\?\.status, refused\?\.body\)/.test(voice) &&
      /onComputerRequired\?\.\(err\.deviceKind\)/.test(voice) && /stepId,\s*\/\/[^\n]*\n[\s\S]{0,200}onComputerRequired: showContinueOnComputer/.test(voicePage));
  const app = await read("src/App.tsx");
  const gatedRoutes = ["connection", "typing-test", "video-intro", "chat-simulation", "chat-interview", "sales-simulation", "voice-interview", "portfolio"];
  check("every step route goes through the one gate", gatedRoutes.every((seg) => new RegExp(`/applications/:id/${seg}/:stepId" element=\\{<CandidateStepGate `).test(app)));
}

/* ------------------------------------------- the screen's promise, kept */
console.log("\nThe screen's promise — <site>/applications opens the step waiting for a computer:\n");

{
  const STEPS = [
    { id: "wf-connection", type: "equipment_check", title: "Computer check" },
    { id: "wf-typing", type: "typing_test", title: "Typing test" },
    { id: "wf-chat", type: "chat_simulation", title: "Chat practice" },
  ];
  const job = { workflow_steps: STEPS, quiz_questions: [{ id: "q1" }] };
  const appAt = (id, phase, extra = {}) => ({ id, phase, status: "reviewing", notes: null, voice_interview_result: null, jobs: job, ...extra });

  const one = stepWaitingOnComputer([appAt("a1", "wf-typing")]);
  check("one application on the typing test: that step, by its own address", one?.applicationId === "a1" && one?.step.id === "wf-typing" && one?.route === "/applications/a1/typing-test/wf-typing", JSON.stringify(one));
  const check1 = stepWaitingOnComputer([appAt("a1", "wf-connection")]);
  check("…on the connection check: /applications/<id>/connection/<step>", check1?.route === "/applications/a1/connection/wf-connection", JSON.stringify(check1));
  check("…on the skills check (open on a phone): nothing to forward", stepWaitingOnComputer([appAt("a1", "quiz")]) === null);
  check("…on the form: nothing", stepWaitingOnComputer([appAt("a1", "application")]) === null);
  check("two applications each waiting on a computer step: the list decides (null)", stepWaitingOnComputer([appAt("a1", "wf-typing"), appAt("a2", "wf-chat")]) === null);
  const mixed = stepWaitingOnComputer([appAt("a1", "wf-typing"), appAt("a2", "quiz"), appAt("a3", "wf-chat", { status: "rejected" }), appAt("a4", "wf-typing", { status: "hired" })]);
  check("one waiting on a computer step beside a skills check and two closed ones: that one", mixed?.applicationId === "a1", JSON.stringify(mixed));
  const done = stepWaitingOnComputer([appAt("a1", "wf-typing", { notes: JSON.stringify({ typingTestResult: { wpm: 50 } }) })]);
  check("a step whose result is on file (waiting on the team) is not one to take", done === null, JSON.stringify(done));
  check("broken input never throws", stepWaitingOnComputer(null) === null && stepWaitingOnComputer([null, {}, { id: 3 }, { id: "x", jobs: null }]) === null);

  check("a fresh arrival: the first page of a load (key 'default')", isFreshArrival({ key: "default", state: null }) === true);
  check("…or straight from signing in (the sign-in screens' state)", isFreshArrival({ key: "k3x9", state: AFTER_SIGN_IN_STATE }) === true && arrivedFromSignIn({ afterSignIn: true }));
  check("…never a page reached inside the app (the menu, Back to your applications)", isFreshArrival({ key: "k3x9", state: null }) === false && isFreshArrival({ key: "k3x9", state: { afterSignIn: "yes" } }) === false);

  const auth = await read("src/pages/CandidateAuth.tsx");
  const callback = await read("src/pages/AuthCallback.tsx");
  check("both sign-in screens send the person on with AFTER_SIGN_IN_STATE", /navigate\(nextRoute, \{ replace: true, state: AFTER_SIGN_IN_STATE \}\)/.test(auth) && /\{ replace: true, state: AFTER_SIGN_IN_STATE \}\)/.test(callback));
  const list = await read("src/pages/Applications.tsx");
  check(
    "the applications page forwards only a fresh arrival, only on a computer, with replace",
    /isFreshArrival\(location\)/.test(list) && /stepWaitingOnComputer\(applications\)/.test(list) && /thisDeviceKind\(\)/.test(list) && /if \(kind === "computer"\) navigate\(waitingOnComputer\.route, \{ replace: true \}\)/.test(list),
  );
  // Finding 2: the card buttons for the connection check and the typing test went to a 404.
  check(
    "every card button opens its step through stepRoute (no hand-kept segment list, so the connection check and typing test are covered)",
    /const route = step \? stepRoute\(application\.id, step\) : null;/.test(list) && !/\["application", "quiz", "video-intro"/.test(list) && !/displayState\.actionRoute/.test(list),
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
