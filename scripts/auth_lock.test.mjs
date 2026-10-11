#!/usr/bin/env node
/**
 * The sign-in lock never waits forever (src/lib/authLock.ts, 2026-10-11).
 *
 * The owner's installed phone app hung on "loading", took his password twice
 * and hung again: another open copy of the app held Supabase's shared
 * sign-in lock, and every sign-in step waits for it forever. Now a step that
 * would wait forever waits AUTH_LOCK_WAIT_MS and takes the lock over.
 *
 * Runs against Node's own navigator.locks (the same Web Locks API a browser
 * has), with a second "copy of the app" that takes the lock and never lets go.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed++;
    console.log(`  ok  - ${name}`);
  } else {
    failed++;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
};

check("this Node has the browser's shared locks", typeof globalThis.navigator?.locks?.request === "function");
const L = await import(pathToFileURL(path.join(ROOT, "src/lib/authLock.ts")).href);
check("a step waits 5 seconds at most", L.AUTH_LOCK_WAIT_MS === 5000);

const takeovers = [];
L.whenAuthLockTakenOver((name) => takeovers.push(name));

// 1. Nobody else holds it: the step runs straight away.
{
  let runs = 0;
  const t0 = Date.now();
  const value = await L.authLock("lock:free", -1, async () => {
    runs++;
    return "session";
  });
  check("a free lock: the step runs at once and returns its answer", value === "session" && runs === 1 && Date.now() - t0 < 500 && takeovers.length === 0);
}

// 2. Another copy holds it and never lets go: taken over after the wait.
{
  let holderLost = null;
  const holder = navigator.locks.request("lock:held", { mode: "exclusive" }, () => new Promise(() => {}));
  holder.catch((e) => {
    holderLost = e?.name ?? String(e);
  });
  await new Promise((r) => setTimeout(r, 50));
  let runs = 0;
  const t0 = Date.now();
  const value = await L.authLock("lock:held", -1, async () => {
    runs++;
    return "signed in";
  });
  const waited = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 50));
  check("held forever elsewhere: the step still runs (no endless loading)", value === "signed in" && runs === 1, `runs=${runs}`);
  check("...after about 5 seconds, not before", waited >= 4900 && waited < 7000, `${waited}ms`);
  check("...and the copy that held it lets go (its lock was taken over)", holderLost === "AbortError", String(holderLost));
  check("...and the takeover is reported once", takeovers.length === 1 && takeovers[0] === "lock:held", JSON.stringify(takeovers));
}

// 3. Held only briefly: waits its turn, no takeover.
{
  const holder = navigator.locks.request("lock:brief", { mode: "exclusive" }, () => new Promise((r) => setTimeout(r, 300)));
  await new Promise((r) => setTimeout(r, 20));
  const before = takeovers.length;
  const t0 = Date.now();
  const value = await L.authLock("lock:brief", -1, async () => "after you");
  await holder;
  check("held briefly: the step waits its turn and nothing is taken over", value === "after you" && Date.now() - t0 >= 250 && takeovers.length === before);
}

// 4. The step itself fails: the failure goes back as ever, and it never runs twice.
{
  let runs = 0;
  let caught = null;
  try {
    await L.authLock("lock:fails", -1, async () => {
      runs++;
      throw Object.assign(new Error("Invalid login credentials"), { status: 400 });
    });
  } catch (e) {
    caught = e;
  }
  check("a step that fails (a wrong password) fails as before, once", caught?.message === "Invalid login credentials" && runs === 1);
}
{
  let runs = 0;
  let caught = null;
  try {
    await L.authLock("lock:aborts", -1, async () => {
      runs++;
      const e = new Error("The operation was aborted");
      e.name = "AbortError";
      throw e;
    });
  } catch (e) {
    caught = e;
  }
  check("a step's own abort (a cancelled request) is not mistaken for a busy lock", caught?.name === "AbortError" && runs === 1, `runs=${runs}`);
}

// 5. "Only if free" (Supabase's background refresh tick): unchanged.
{
  const holder = navigator.locks.request("lock:tick", { mode: "exclusive" }, () => new Promise((r) => setTimeout(r, 400)));
  await new Promise((r) => setTimeout(r, 20));
  let runs = 0;
  let caught = null;
  try {
    await L.authLock("lock:tick", 0, async () => {
      runs++;
    });
  } catch (e) {
    caught = e;
  }
  await holder;
  check("'only if free' still gives up at once when busy (as Supabase expects)", caught?.isAcquireTimeout === true && runs === 0);
}

// 6. Wired in.
const client = await readFile(path.join(ROOT, "src/integrations/supabase/client.ts"), "utf8");
check("the app's Supabase client uses this lock", /import \{ authLock \} from '@\/lib\/authLock';/.test(client) && /lock: authLock,/.test(client));
const reporter = await readFile(path.join(ROOT, "src/lib/crashReporter.ts"), "utf8");
check("a takeover shows up in the crash reports", /whenAuthLockTakenOver\(\(\) => reportError\(/.test(reporter));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
