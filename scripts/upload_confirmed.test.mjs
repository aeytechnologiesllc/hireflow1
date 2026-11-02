#!/usr/bin/env node
/**
 * A storage upload a slow connection cannot turn into a false "failed"
 * (src/lib/uploadConfirmed.ts; live 2026-11-02: every profile upload from the
 * Philippines answered 504 after 60 s while the file had saved).
 *
 * Run with: node scripts/upload_confirmed.test.mjs
 */
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const U = await import(path.join(ROOT, "src/lib/uploadConfirmed.ts"));

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
}

/** A bucket whose upload answers `answer`, and whose listing shows the file from the `landsOn`th look. */
function bucket({ answer, landsOn = Infinity }) {
  const calls = { upload: 0, list: 0 };
  return {
    calls,
    upload: async () => {
      calls.upload += 1;
      return answer;
    },
    list: async (folder, opts) => {
      calls.list += 1;
      return { data: calls.list >= landsOn ? [{ name: opts.search }] : [], error: null };
    },
  };
}
const fast = { sleep: async () => {}, everyMs: 5, totalMs: 50 };
const timeout = { data: null, error: { name: "StorageUnknownError", message: "Unexpected token '<'" } };

check("a 504 or a dropped connection may hide a saved file", U.mayHaveLanded({ status: 504 }) && U.mayHaveLanded({ message: "Failed to fetch" }) && U.mayHaveLanded(timeout.error));
check("a refusal never does (too big, wrong type, not allowed)", !U.mayHaveLanded({ status: 413, message: "Payload too large" }) && !U.mayHaveLanded({ statusCode: "403" }) && !U.mayHaveLanded(null));

{
  const b = bucket({ answer: { data: { path: "u/a.pdf" }, error: null } });
  const r = await U.uploadConfirmed(b, "u/a.pdf", new Blob(["x"]), undefined, fast);
  check("a clean upload is just that: nothing looked for", !r.error && b.calls.list === 0);
}
{
  let told = 0;
  const b = bucket({ answer: timeout, landsOn: 3 });
  const r = await U.uploadConfirmed(b, "u/profile-resume-1.pdf", new Blob(["x"]), undefined, { ...fast, onWaiting: () => (told += 1) });
  check("a timed-out upload that lands is a success, said once as still saving", !r.error && r.landedLate === true && told === 1 && b.calls.list === 3, JSON.stringify({ r, told, calls: b.calls }));
}
{
  const b = bucket({ answer: timeout });
  const r = await U.uploadConfirmed(b, "u/profile-resume-2.pdf", new Blob(["x"]), undefined, fast);
  check("one that never lands keeps its error, after the whole wait", r.error === timeout.error && b.calls.list === 10, JSON.stringify(b.calls));
}
{
  const b = bucket({ answer: { data: null, error: { status: 400, message: "mime type not supported" } }, landsOn: 1 });
  const r = await U.uploadConfirmed(b, "u/x.svg", new Blob(["x"]), undefined, fast);
  check("a refusal is shown at once, never looked for", !!r.error && b.calls.list === 0);
}
{
  let folder = null;
  const b = { upload: async () => timeout, list: async (f, o) => ((folder = f), { data: [{ name: "other.pdf" }, { name: o.search }], error: null }) };
  const r = await U.uploadConfirmed(b, "user-1/sub/profile-resume-3.pdf", new Blob(["x"]), undefined, fast);
  check("it looks in the file's own folder, for its own name", !r.error && folder === "user-1/sub");
}
const profile = await (await import("node:fs/promises")).readFile(path.join(ROOT, "src/pages/Profile.tsx"), "utf8");
check("the profile's three uploads (photo, logo, resume) wait out a timeout", (profile.match(/await uploadConfirmed\(supabase\.storage\.from\("(avatars|resumes)"\)/g) ?? []).length === 3 && !/\.upload\(fileName/.test(profile));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
