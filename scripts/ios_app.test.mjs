#!/usr/bin/env node
/**
 * The HireFlow iPhone app (ios/, Capacitor; docs/IOS-APP.md). The owner,
 * 2026-11-04: build HireFlow as a real iPhone app "the FairFix way", with
 * notifications straight from Apple and no OneSignal.
 *
 * Checked in the iPhone Simulator the same day: the app opens the staff site
 * below the clock, iOS asks to allow notifications right after sign-in, Apple
 * gives the phone its address, a notification shows with the seal and a tap
 * opens its page. This test holds what made that work.
 *
 * Run with: node scripts/ios_app.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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

// ── The app's own settings ─────────────────────────────────────────────────
const config = JSON.parse(await read("capacitor.config.json"));
check("the app is com.aeytechnologies.hireflow, named HireFlow", config.appId === "com.aeytechnologies.hireflow" && config.appName === "HireFlow");
check("it opens the live staff site, so every push to main reaches it with no App Store update", config.server?.url === "https://staff.hireflownow.com");
check("it says it is the app in its user agent (what the page reads)", config.ios?.appendUserAgent === "HireFlowApp/1");
check("no connection: its own page with Try again, not a blank screen", config.server?.errorPath === "offline.html" && /Try again/.test(await read("native/shell/offline.html")));

const plist = await read("ios/App/App/Info.plist");
check("camera and microphone are asked for in words (interviews)", /NSCameraUsageDescription<\/key>\s*<string>HireFlow uses the camera for video interviews/.test(plist) && /NSMicrophoneUsageDescription<\/key>/.test(plist));
check("the name on the Home Screen is HireFlow", /CFBundleDisplayName<\/key>\s*<string>HireFlow<\/string>/.test(plist));
check("no export-compliance question at every upload", /ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(plist));
const entitlements = await read("ios/App/App/App.entitlements");
const pbx = await read("ios/App/App.xcodeproj/project.pbxproj");
check("it may receive notifications (aps-environment), and the project signs with it", /aps-environment/.test(entitlements) && /CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/.test(pbx));
check("iPhone only (an iPad build needs its own screenshots and review)", /TARGETED_DEVICE_FAMILY = 1;/.test(pbx) && !/TARGETED_DEVICE_FAMILY = "1,2";/.test(pbx));
const delegate = await read("ios/App/App/AppDelegate.swift");
check("the phone's push address from Apple reaches the plugin", /didRegisterForRemoteNotificationsWithDeviceToken/.test(delegate) && /capacitorDidRegisterForRemoteNotifications/.test(delegate) && /capacitorDidFailToRegisterForRemoteNotifications/.test(delegate));

// ── The page inside the app ────────────────────────────────────────────────
const push = await read("src/lib/nativePush.ts");
const pushCode = code(push);
check("the page knows it is in the app by the user agent the app adds", /\/HireFlowApp\\\/\\d\/\.test\(navigator\.userAgent\)/.test(pushCode));
check("the plugin is never handed through a promise (it answers to \"then\" and hangs one)", !/Promise\.resolve\([^)]*PushNotifications/.test(pushCode) && !/=>\s*m\.PushNotifications/.test(pushCode) && /function plugin\(\): PushPlugin \| null \{/.test(pushCode) && /async function listen\(open: \(path: string\) => void\): Promise<boolean>/.test(pushCode));
check("one ask at a time (two together got 'denied' while iOS still showed the first)", /turningOn \?\?= askAndRegister\(open\)/.test(pushCode));
check("iOS asks once; after that it answers from Settings", /permission\.receive === "prompt" \|\| permission\.receive === "prompt-with-rationale"/.test(pushCode) && /await push\.register\(\);/.test(pushCode));
check("the phone's address is saved for whoever is signed in (the server function, never a table write)", /supabase\.rpc\("save_native_push_token"/.test(pushCode) && !/from\("push_subscriptions"\)/.test(pushCode));
check("a tapped notification opens only an in-app page", /inAppPath\(/.test(pushCode) && /pushNotificationActionPerformed/.test(pushCode));
const app = await read("src/App.tsx");
check("after sign-in the app asks iOS and listens for taps", /function NativeAppBridge\(\)/.test(app) && /<NativeAppBridge \/>/.test(app) && /void turnOnNativePush\(\(path\) => navigate\(path\)\);/.test(app));
const webPush = await read("src/lib/webPush.ts");
check("signing out removes this phone's address first", /removeThisDeviceBeforeSignOut\(\): Promise<void> \{\s*\/\/[^\n]*\n\s*await removeNativePushBeforeSignOut\(\);/.test(webPush));
check("Settings and the first-time card use the app's own permission", /insideHireFlowApp\(\)\)/.test(webPush) && /if \(insideHireFlowApp\(\)\) return nativePushGranted\(\);/.test(await read("src/hooks/usePushNotifications.ts")));
const auth = await read("src/pages/Auth.tsx");
check("the sign-in page sits below the clock and has no link out to the website in the app", /env\(safe-area-inset-top, 0px\)/.test(auth) && /insideHireFlowApp\(\) \? null : !isStaffHost\(\)/.test(auth));

// ── Nothing bought inside the app ──────────────────────────────────────────
const billing = await read("src/lib/billingApi.ts");
check("no checkout or plan change from the app", /if \(insideHireFlowApp\(\)\) return \{ kind: "failed", message: NATIVE_APP_BILLING_WORDS \};/.test(billing));
check("…and its words name no other place to buy", /NATIVE_APP_BILLING_WORDS = "Plans and payments can't be changed in the iPhone app\."/.test(billing) && !/NATIVE_APP_BILLING_WORDS = "[^"]*(website|hireflownow|\.com)/.test(billing));
check("the plan card and the publish dialog hide their pay buttons in the app", /!insideHireFlowApp\(\) && \(card\.canGoUnlimited \|\| card\.canManage\)/.test(await read("src/components/billing/BillingCard.tsx")) && /insideHireFlowApp\(\) \? "hidden" : ""/.test(await read("src/components/billing/PublishPaymentDialog.tsx")));

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
