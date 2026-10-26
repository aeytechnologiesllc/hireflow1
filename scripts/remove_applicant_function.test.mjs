#!/usr/bin/env node
/**
 * remove-applicant, the function itself (the eleventh Phase 5 review,
 * finding 2). scripts/remove_applicant.pglite.test.mjs proves the database's
 * half (public.remove_applicant) and runs files.ts; this file was missing,
 * so emptying the loop that deletes the resume and the form's files
 * (`resumeFiles.slice(0, 0)` in index.ts) passed every test.
 *
 * The real supabase/functions/remove-applicant/index.ts is bundled with its
 * two outside modules replaced by stand-ins (the HTTP server and the
 * database client, whose storage is a small world of buckets) and driven
 * request by request, as scripts/notification_access.test.mjs does for
 * send-notification-email. No network. It proves:
 *   - nobody without a sign-in removes anything, and the database's "not
 *     allowed" is the answer the business gets;
 *   - for an allowed removal: the application's video introduction, work
 *     samples, recordings and its documents' kept copies are deleted, and so
 *     are the resume and the form's files (and their page images) it lists,
 *     never one another application of theirs or their profile still lists,
 *     and nothing of another application;
 *   - a file storage refuses now is queued in storage_file_trash for the
 *     hourly retry, the others are still deleted.
 *
 * Run with: node scripts/remove_applicant_function.test.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  ok  - ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  - ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}
const show = (v) => JSON.stringify(v);

const STUBS = {
  server: "export const serve = (handler) => { globalThis.__removeApplicant = handler; };",
  supabase: "export const createClient = (url, key, options) => globalThis.__world.client(url, key, options);",
};
const bundle = await build({
  stdin: { contents: 'import "./supabase/functions/remove-applicant/index.ts";\n', resolveDir: ROOT, loader: "ts" },
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  logLevel: "silent",
  plugins: [
    {
      name: "outside-modules",
      setup(b) {
        b.onResolve({ filter: /^https:\/\// }, (args) => {
          if (/deno\.land\/std@[^/]+\/http\/server\.ts$/.test(args.path)) return { path: "server", namespace: "stub" };
          if (/esm\.sh\/@supabase\/supabase-js@/.test(args.path)) return { path: "supabase", namespace: "stub" };
          throw new Error(`the function imports something this test has no stand-in for: ${args.path}`);
        });
        b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({ contents: STUBS[args.path], loader: "js" }));
      },
    },
  ],
});

const SERVICE_KEY = "service-key-of-this-project";
const ANON_KEY = "public-key-of-this-project";
const ENV = { SUPABASE_URL: "http://database.stand-in", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, SUPABASE_ANON_KEY: ANON_KEY };
globalThis.Deno = { env: { get: (key) => ENV[key] } };

const id = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const OWNER = id(1);
const STRANGER = id(2);
const ANA = id(11);
const APP = id(101); // the application removed
const OTHER_APP = id(102); // another application of Ana's
const DOC = id(201);

const RESUME = `${ANA}/1729000000000.pdf`;
const RESUME_PAGE = `${ANA}/1729000000001_page1.png`;
const FORM_FILE = `${ANA}/1729000000002_q1.pdf`;
const FORM_PAGE = `${ANA}/1729000000003_q1_page1.png`;
const SHARED = `${ANA}/1729000000009_cv.pdf`; // also the other application's resume
const UNRELATED = `${ANA}/1729000000010.pdf`; // listed by nothing here

function freshWorld() {
  return {
    tokens: { "tok-owner": OWNER, "tok-stranger": STRANGER },
    storage: {
      resumes: new Set([RESUME, RESUME_PAGE, FORM_FILE, FORM_PAGE, SHARED, UNRELATED]),
      videos: new Set([`${ANA}/${APP}-intro.webm`, `${ANA}/${OTHER_APP}-intro.webm`]),
      portfolios: new Set([`${ANA}/${APP}-sample.pdf`, `${ANA}/${OTHER_APP}-sample.pdf`]),
      "voice-interview-recordings": new Set([`${APP}/interview-1.webm`, `${OTHER_APP}/interview-1.webm`]),
      documents: new Set([`documents/${DOC}/original.pdf`, `documents/${DOC}/final.pdf`, `documents/${id(202)}/original.pdf`]),
    },
    refuseRemove: new Set(),
    queued: [],
    removals: [],
  };
}
let world = freshWorld();

/** What public.remove_applicant answers (scripts/remove_applicant.pglite.test.mjs proves the database's side). */
function removeApplicant({ p_application, p_actor }) {
  if (p_actor !== OWNER) return { ok: false, reason: "not_allowed" };
  if (p_application !== APP || world.removals.length > 0) return { ok: false, reason: "not_found" };
  world.removals.push({ p_application, p_actor });
  return {
    ok: true,
    application_id: APP,
    candidate_id: ANA,
    documents: [{ id: DOC }],
    resume_url: RESUME,
    notes: JSON.stringify({
      resumeImageUrls: [RESUME_PAGE],
      fileUploads: { q1: { url: FORM_FILE, imageUrls: [FORM_PAGE], isResume: false }, q2: { url: SHARED, isResume: true } },
    }),
    other_refs: `${SHARED} {"applicationAnswers":[]}`,
  };
}

function client(url, key, options) {
  const authHeader = options?.global?.headers?.Authorization ?? "";
  const bucket = (name) => ({
    list: async (folder, opts = {}) => {
      const names = [...(world.storage[name] ?? [])]
        .filter((p) => p.startsWith(`${folder}/`) && !p.slice(folder.length + 1).includes("/"))
        .map((p) => p.slice(folder.length + 1))
        .filter((n) => !opts.search || n.startsWith(opts.search))
        .slice(0, opts.limit ?? 100);
      return { data: names.map((n) => ({ name: n, id: `obj-${n}` })), error: null };
    },
    remove: async (paths) => {
      if (key !== SERVICE_KEY) return { data: null, error: { message: "stand-in: not the service key" } };
      if (paths.some((p) => world.refuseRemove.has(p))) return { data: null, error: { message: "stand-in: storage is busy" } };
      const gone = paths.filter((p) => world.storage[name]?.delete(p));
      return { data: gone.map((p) => ({ name: p })), error: null };
    },
  });
  return {
    auth: {
      getUser: async () => {
        const token = authHeader.replace(/^Bearer\s+/i, "");
        const userId = key === ANON_KEY ? world.tokens[token] : null;
        return userId ? { data: { user: { id: userId } }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
      },
    },
    rpc: async (fn, args) => {
      if (key !== SERVICE_KEY) return { data: null, error: { message: "permission denied" } };
      if (fn !== "remove_applicant") return { data: null, error: { message: `stand-in: no ${fn}` } };
      return { data: removeApplicant(args), error: null };
    },
    from: (table) => ({
      insert: async (row) => {
        if (table !== "storage_file_trash" || key !== SERVICE_KEY) return { error: { message: "stand-in: not allowed" } };
        world.queued.push(row);
        return { error: null };
      },
    }),
    storage: { from: bucket },
  };
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  throw new Error(`the function reached outside: ${typeof input === "string" ? input : input.url}`);
};

function reset(change) {
  world = freshWorld();
  world.client = client;
  globalThis.__world = world;
  change?.(world);
}
reset();
await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const removeFunction = globalThis.__removeApplicant;
check("the real function loaded, with only its two outside modules replaced", typeof removeFunction === "function");

async function ask(token, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await removeFunction(new Request("http://fn.stand-in/remove-applicant", { method: "POST", headers, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json().catch(() => null) };
}
const has = (bucket, p) => world.storage[bucket].has(p);

console.log("\nWho may ask\n");
{
  reset();
  const anon = await ask(null, { applicationId: APP });
  check("no sign-in: 401, nothing removed", anon.status === 401 && world.removals.length === 0 && has("resumes", RESUME), show(anon));
  const stranger = await ask("tok-stranger", { applicationId: APP });
  check("another business: the database's \"not allowed\", 403, nothing removed", stranger.status === 403 && stranger.body?.code === "not_allowed" && has("resumes", RESUME) && has("videos", `${ANA}/${APP}-intro.webm`), show(stranger));
}

console.log("\nAn allowed removal deletes the application's files\n");
{
  reset();
  const r = await ask("tok-owner", { applicationId: APP, reason: "asked by email" });
  check("the owner removes the applicant", r.status === 200 && r.body?.ok === true && world.removals.length === 1, show(r));
  check("…the resume it lists is deleted", !has("resumes", RESUME), show([...world.storage.resumes]));
  check("…and the resume's page images", !has("resumes", RESUME_PAGE));
  check("…and the form's file and its page images", !has("resumes", FORM_FILE) && !has("resumes", FORM_PAGE));
  check("…never a file another application of theirs still lists", has("resumes", SHARED));
  check("…nor one this application does not list", has("resumes", UNRELATED));
  check("…its video introduction and work samples, not the other application's", !has("videos", `${ANA}/${APP}-intro.webm`) && !has("portfolios", `${ANA}/${APP}-sample.pdf`) && has("videos", `${ANA}/${OTHER_APP}-intro.webm`) && has("portfolios", `${ANA}/${OTHER_APP}-sample.pdf`));
  check("…its recordings, not the other application's", !has("voice-interview-recordings", `${APP}/interview-1.webm`) && has("voice-interview-recordings", `${OTHER_APP}/interview-1.webm`));
  check("…and its document's kept copies, nothing of another document", !has("documents", `documents/${DOC}/original.pdf`) && !has("documents", `documents/${DOC}/final.pdf`) && has("documents", `documents/${id(202)}/original.pdf`));
  check("…the answer counts them (4 form files, 2 step files, 1 recording, 2 copies) and nothing is left", r.body?.removedFiles === 9 && r.body?.filesLeft === 0 && world.queued.length === 0, show(r.body));
}

console.log("\nA file storage refuses now is queued for the hourly retry\n");
{
  reset((w) => w.refuseRemove.add(FORM_FILE));
  const r = await ask("tok-owner", { applicationId: APP });
  check("the removal still answers ok, saying one file is left", r.status === 200 && r.body?.ok === true && r.body?.filesLeft === 1 && r.body?.filesQueued === 1, show(r.body));
  check("…that file is queued by its exact path, with the application", show(world.queued) === show([{ bucket: "resumes", path: FORM_FILE, application_id: APP }]), show(world.queued));
  check("…and the others are deleted all the same", !has("resumes", RESUME) && !has("resumes", FORM_PAGE) && !has("videos", `${ANA}/${APP}-intro.webm`));
}

globalThis.fetch = realFetch;
console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
