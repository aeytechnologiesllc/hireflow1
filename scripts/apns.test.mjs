#!/usr/bin/env node
/**
 * The iPhone app's notifications, straight to Apple (supabase/functions/_shared/apns.ts;
 * docs/PUSH-NOTIFICATIONS.md, "The iPhone app"). The owner, 2026-11-04:
 * build HireFlow as a real iPhone app "the FairFix way", no OneSignal.
 *
 * Run with: node scripts/apns.test.mjs
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFile(path.join(ROOT, rel), "utf8");
const A = await import(pathToFileURL(path.join(ROOT, "supabase/functions/_shared/apns.ts")).href);

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

// A real P-256 key, as Apple's .p8 file holds one.
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString("base64").match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----`;
const env = { APNS_KEY_ID: "ABC123DEFG", APNS_TEAM_ID: "8M67RVJS7T", APNS_PRIVATE_KEY: pem };

// ── The secrets ────────────────────────────────────────────────────────────
check("no secrets: nothing is sent (null)", A.apnsConfigFrom(() => undefined) === null);
check("a key id that is not Apple's 10 characters: null", A.apnsConfigFrom((n) => ({ ...env, APNS_KEY_ID: "abc" })[n]) === null);
const config = A.apnsConfigFrom((n) => env[n]);
check("all three set: the config, with the app's bundle id", config?.teamId === "8M67RVJS7T" && config?.bundleId === "com.aeytechnologies.hireflow");
check("a key pasted on one line with \\n still reads", A.apnsConfigFrom((n) => ({ ...env, APNS_PRIVATE_KEY: pem.replace(/\n/g, "\\n") })[n])?.privateKeyPem.includes("\n"));

// ── The provider token ─────────────────────────────────────────────────────
const now = Date.UTC(2026, 10, 4, 20, 0, 0);
const jwt = await A.providerToken(config, now);
const [h, c, sig] = jwt.split(".");
const dec = (s) => JSON.parse(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
check("ES256, with the key id", dec(h).alg === "ES256" && dec(h).kid === "ABC123DEFG");
check("issued by the team, now", dec(c).iss === "8M67RVJS7T" && dec(c).iat === Math.floor(now / 1000));
const verified = await crypto.subtle.verify(
  { name: "ECDSA", hash: "SHA-256" },
  pair.publicKey,
  Buffer.from(sig.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
  new TextEncoder().encode(`${h}.${c}`),
);
check("signed with the .p8 key (Apple can check it)", verified);
check("kept for 50 minutes, then made again", (await A.providerToken(config, now + 49 * 60_000)) === jwt && (await A.providerToken(config, now + 51 * 60_000)) !== jwt);

// ── Sending ────────────────────────────────────────────────────────────────
const TOKEN = "a".repeat(64);
function world(answers) {
  const calls = [];
  const removed = [];
  const envs = [];
  return {
    calls,
    removed,
    envs,
    deps: {
      now: () => now,
      fetch: async (url, init) => {
        calls.push({ url, init });
        const host = url.includes("sandbox") ? "sandbox" : "production";
        const [status, reason] = answers[host] ?? [200, null];
        return new Response(status === 200 ? "" : JSON.stringify({ reason }), { status });
      },
      removeDevice: async (id) => removed.push(id),
      setEnvironment: async (id, e) => envs.push([id, e]),
    },
  };
}
const message = { title: "New applicant", body: "Maria applied for Chat Support Agent.", url: "https://staff.hireflownow.com/applicants/1", tag: "11111111-2222-3333-4444-555555555555" };

{
  const w = world({ production: [200, null] });
  const r = await A.pushToApns([{ id: "d1", apns_token: TOKEN, apns_environment: null }], message, config, w.deps);
  const call = w.calls[0];
  check("one phone: sent on production", r.sent === 1 && call.url === `https://api.push.apple.com/3/device/${TOKEN}`);
  check("…as an alert for the app's topic, with Apple's token", call.init.headers["apns-topic"] === "com.aeytechnologies.hireflow" && call.init.headers["apns-push-type"] === "alert" && call.init.headers.authorization.startsWith("bearer "));
  const body = JSON.parse(call.init.body);
  check("…the title, the words and the address a tap opens", body.aps.alert.title === "New applicant" && body.aps.alert.body.startsWith("Maria") && body.url === message.url && body.aps.sound === "default");
  check("…the notification's id, so a repeat replaces it", call.init.headers["apns-collapse-id"] === message.tag);
  check("…and the phone is remembered as a production one", w.envs.length === 1 && w.envs[0][1] === "production");
}
{
  const w = world({ production: [400, "BadDeviceToken"], sandbox: [200, null] });
  const r = await A.pushToApns([{ id: "d2", apns_token: TOKEN, apns_environment: null }], message, config, w.deps);
  check("a build from Xcode: production refuses, the sandbox takes it", r.sent === 1 && w.calls.length === 2 && w.calls[1].url.startsWith("https://api.sandbox.push.apple.com/"));
  check("…and the phone is remembered as a sandbox one", w.envs[0]?.[1] === "sandbox" && r.removed === 0);
}
{
  const w = world({ sandbox: [200, null] });
  await A.pushToApns([{ id: "d3", apns_token: TOKEN, apns_environment: "sandbox" }], message, config, w.deps);
  check("a known sandbox phone goes straight to the sandbox", w.calls.length === 1 && w.calls[0].url.includes("sandbox") && w.envs.length === 0);
}
{
  const w = world({ production: [410, "Unregistered"] });
  const r = await A.pushToApns([{ id: "d4", apns_token: TOKEN, apns_environment: "production" }], message, config, w.deps);
  check("Apple says the app is gone (410): the phone is removed", r.removed === 1 && w.removed[0] === "d4");
}
{
  const w = world({ production: [400, "BadDeviceToken"], sandbox: [400, "BadDeviceToken"] });
  const r = await A.pushToApns([{ id: "d5", apns_token: TOKEN, apns_environment: null }], message, config, w.deps);
  check("neither side knows the token: removed", r.removed === 1 && w.removed[0] === "d5");
}
{
  const w = world({ production: [500, "InternalServerError"] });
  const r = await A.pushToApns([{ id: "d6", apns_token: TOKEN, apns_environment: "production" }], message, config, w.deps);
  check("Apple has a bad moment: counted as failed, the phone kept", r.failed === 1 && w.removed.length === 0);
}
{
  const w = world({});
  const r = await A.pushToApns([{ id: "d7", apns_token: "not-a-token", apns_environment: null }], message, config, w.deps);
  check("something that is not a token is never sent", w.calls.length === 0 && r.sent === 0);
}

// ── Where it is used ───────────────────────────────────────────────────────
const sender = await read("supabase/functions/send-push-notification/index.ts");
check("send-push-notification sends to the iPhone app's phones when APNS_* is set", /apnsConfigFrom\(/.test(sender) && /pushToApns\(appleDevices,/.test(sender) && /apns_token, apns_environment/.test(sender));
const test = await read("supabase/functions/send-test-push/index.ts");
check("Settings' test reaches the iPhone app too", /pushToApns\(\s*appleDevices,/.test(test));
const migration = await read("supabase/migrations/20261104200000_native_push_apns.sql");
check("a phone's address is saved for the caller only, and a hex token only", /caller uuid := auth\.uid\(\)/.test(migration) && /\^\[0-9a-f\]\{64,200\}\$/.test(migration) && /GRANT EXECUTE ON FUNCTION public\.save_native_push_token\(text\) TO authenticated;/.test(migration) && /REVOKE ALL ON FUNCTION public\.save_native_push_token\(text\) FROM PUBLIC, anon;/.test(migration));

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
