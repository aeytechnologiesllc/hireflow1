#!/usr/bin/env node
/**
 * document-cleanup, the function itself (the eleventh Phase 5 review).
 *
 * The other tests read document-cleanup's text. The review changed
 * `if (paths.length > 0)` in its loop over deleted requests to never remove
 * anything (the note was still dropped, so the file was never tried again)
 * and every test passed: a government ID sent on an application that was
 * withdrawn, removed or whose job was deleted would have been kept for good,
 * against the Privacy Policy's 24 hours. And a queue backed up behind one
 * account's flood was never told to anyone.
 *
 * The real supabase/functions/document-cleanup/index.ts is bundled with the
 * database client replaced by a stand-in (tables in memory, storage as a set
 * of buckets) and run as the hourly scheduler runs it. No network. It proves:
 *   - without the scheduler's secret nothing is read;
 *   - an ID paper opened over 24 hours ago is deleted (and its folder), the
 *     request keeps when; one opened an hour ago is kept;
 *   - a deleted request's file and its folder are deleted, then its note;
 *     a file storage refuses keeps its note and tells the admins;
 *   - the removal queue: 200 a run, a note dropped once storage holds
 *     nothing there; a backlog (a run's worth still waiting, or a note
 *     waiting over three hours) is told to the admins once a day, through
 *     claim_daily_alert; a short queue is not.
 *
 * Run with: node scripts/document_cleanup.test.mjs
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

const bundle = await build({
  stdin: { contents: 'import "./supabase/functions/document-cleanup/index.ts";\n', resolveDir: ROOT, loader: "ts" },
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
          if (/esm\.sh\/@supabase\/supabase-js@/.test(args.path)) return { path: "supabase", namespace: "stub" };
          throw new Error(`the function imports something this test has no stand-in for: ${args.path}`);
        });
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const createClient = () => globalThis.__world.client();", loader: "js" }));
      },
    },
  ],
});

const SECRET = "a".repeat(40);
const ENV = { SUPABASE_URL: "http://database.stand-in", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
globalThis.Deno = { env: { get: (key) => ENV[key] }, serve: (handler) => { globalThis.__cleanup = handler; } };

const id = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const ADMIN = id(1);
const ANA = id(11);
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();

let world;
function freshWorld() {
  return {
    tables: { document_requests: [], document_request_events: [], document_file_trash: [], storage_file_trash: [], platform_admins: [{ user_id: ADMIN }], notifications: [] },
    storage: { "requested-documents": new Set(), videos: new Set(), portfolios: new Set(), resumes: new Set(), "voice-interview-recordings": new Set(), documents: new Set() },
    refuseRemove: new Set(),
    claims: new Set(),
  };
}

const compare = (a, b) => (Date.parse(a) || a) <= (Date.parse(b) || b);
/** The few query shapes the function uses, over the world's tables. */
function query(table) {
  const filters = [];
  const orders = [];
  let cap = null;
  let mode = "select";
  let patch = null;
  let countOnly = false;
  const rows = () => world.tables[table].filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (mode === "update") {
      for (const r of rows()) Object.assign(r, patch);
      return { data: null, error: null };
    }
    if (mode === "delete") {
      const gone = new Set(rows());
      world.tables[table] = world.tables[table].filter((r) => !gone.has(r));
      return { data: null, error: null };
    }
    let out = rows();
    for (const [col, ascending] of [...orders].reverse()) out = [...out].sort((a, b) => (ascending ? 1 : -1) * (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0));
    if (countOnly) return { data: null, count: out.length, error: null };
    if (cap != null) out = out.slice(0, cap);
    return { data: out.map((r) => ({ ...r })), error: null };
  };
  const q = {
    select: (_cols, opts) => ((countOnly = !!opts?.head), q),
    in: (col, values) => (filters.push((r) => values.includes(r[col])), q),
    not: (col, op, value) => (filters.push((r) => (op === "is" && value === null ? r[col] != null : true)), q),
    is: (col, value) => (filters.push((r) => (value === null ? r[col] == null : r[col] === value)), q),
    lte: (col, value) => (filters.push((r) => r[col] != null && compare(r[col], value)), q),
    eq: (col, value) => (filters.push((r) => r[col] === value), q),
    order: (col, opts) => (orders.push([col, opts?.ascending !== false]), q),
    limit: (n) => ((cap = n), q),
    update: (p) => ((mode = "update"), (patch = p), q),
    delete: () => ((mode = "delete"), q),
    insert: async (row) => {
      world.tables[table].push({ id: `row-${world.tables[table].length + 1}`, ...row });
      return { error: null };
    },
    then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
  };
  return q;
}

function client() {
  return {
    rpc: async (fn, args) => {
      if (fn === "document_cleanup_secret_matches") return { data: args.p_given === SECRET, error: null };
      if (fn === "claim_daily_alert") {
        const first = !world.claims.has(args.p_alert);
        world.claims.add(args.p_alert);
        return { data: first, error: null };
      }
      return { data: null, error: { message: `stand-in: no ${fn}` } };
    },
    from: query,
    storage: {
      from: (bucket) => ({
        list: async (folder, opts = {}) => {
          const names = [...world.storage[bucket]]
            .filter((p) => p.startsWith(`${folder}/`) && !p.slice(folder.length + 1).includes("/"))
            .map((p) => p.slice(folder.length + 1))
            .filter((n) => !opts.search || n.startsWith(opts.search))
            .slice(0, opts.limit ?? 100);
          return { data: names.map((name) => ({ name, id: `obj-${name}` })), error: null };
        },
        remove: async (paths) => {
          if (paths.some((p) => world.refuseRemove.has(p))) return { data: null, error: { message: "stand-in: storage is busy" } };
          return { data: paths.filter((p) => world.storage[bucket].delete(p)).map((name) => ({ name })), error: null };
        },
      }),
    },
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
const cleanup = globalThis.__cleanup;
check("the real function loaded, with only the database client replaced", typeof cleanup === "function");
const runIt = async (secret = SECRET) => {
  const res = await cleanup(new Request("http://fn.stand-in/document-cleanup", { method: "POST", headers: { "x-cleanup-secret": secret } }));
  return { status: res.status, body: await res.json().catch(() => null) };
};
const told = (title) => world.tables.notifications.filter((n) => n.user_id === ADMIN && n.title === title).length;

console.log("\nOnly the scheduler\n");
{
  reset((w) => w.tables.document_file_trash.push({ id: "t1", candidate_id: ANA, request_id: id(301), file_url: `${ANA}/${id(301)}/id.jpg` }));
  const r = await runIt("b".repeat(40));
  check("a wrong secret: 401, and nothing is read or deleted", r.status === 401 && world.tables.document_file_trash.length === 1, show(r));
}

console.log("\nID papers, 24 hours after first opened\n");
{
  const OPENED = id(401);
  const FRESH = id(402);
  reset((w) => {
    w.tables.document_requests.push(
      { id: OPENED, candidate_id: ANA, document_type: "government_id", file_url: `${ANA}/${OPENED}/1.jpg`, status: "approved", team_opened_at: hoursAgo(25), submitted_at: hoursAgo(30), created_at: hoursAgo(40) },
      { id: FRESH, candidate_id: ANA, document_type: "government_id", file_url: `${ANA}/${FRESH}/1.jpg`, status: "submitted", team_opened_at: hoursAgo(1), submitted_at: hoursAgo(2), created_at: hoursAgo(3) },
    );
    for (const p of [`${ANA}/${OPENED}/1.jpg`, `${ANA}/${OPENED}/0-earlier.jpg`, `${ANA}/${FRESH}/1.jpg`]) w.storage["requested-documents"].add(p);
  });
  const r = await runIt();
  const opened = world.tables.document_requests.find((q) => q.id === OPENED);
  check("an ID opened 25 hours ago is deleted, with the rest of its request's folder", r.status === 200 && !world.storage["requested-documents"].has(`${ANA}/${OPENED}/1.jpg`) && !world.storage["requested-documents"].has(`${ANA}/${OPENED}/0-earlier.jpg`), show(r));
  check("…the request keeps when, with no file, and the deletion is recorded", opened.file_url === null && typeof opened.file_deleted_at === "string" && world.tables.document_request_events.some((e) => e.request_id === OPENED && e.action === "deleted"));
  check("an ID opened an hour ago is kept", world.storage["requested-documents"].has(`${ANA}/${FRESH}/1.jpg`) && world.tables.document_requests.find((q) => q.id === FRESH).file_url !== null);
}

console.log("\nThe papers of a deleted request\n");
{
  const GONE = id(501);
  const NEVER_SAVED = id(502);
  reset((w) => {
    w.tables.document_file_trash.push(
      { id: "t1", candidate_id: ANA, request_id: GONE, file_url: `${ANA}/${GONE}/1.jpg` },
      // A photo whose link was never saved (20261025540000): the note has no file, the folder still goes.
      { id: "t2", candidate_id: ANA, request_id: NEVER_SAVED, file_url: null },
    );
    for (const p of [`${ANA}/${GONE}/1.jpg`, `${ANA}/${GONE}/0-earlier.jpg`, `${ANA}/${NEVER_SAVED}/1.jpg`]) w.storage["requested-documents"].add(p);
  });
  const r = await runIt();
  check("a deleted request's file and the rest of its folder are deleted", ![...world.storage["requested-documents"]].some((p) => p.startsWith(`${ANA}/${GONE}/`)), show([...world.storage["requested-documents"]]));
  check("…and a photo whose link was never saved, by its folder", !world.storage["requested-documents"].has(`${ANA}/${NEVER_SAVED}/1.jpg`));
  check("…then the notes go", world.tables.document_file_trash.length === 0 && r.body?.orphans === 2, show(r.body));

  reset((w) => {
    w.tables.document_file_trash.push({ id: "t1", candidate_id: ANA, request_id: GONE, file_url: `${ANA}/${GONE}/1.jpg` });
    w.storage["requested-documents"].add(`${ANA}/${GONE}/1.jpg`);
    w.refuseRemove.add(`${ANA}/${GONE}/1.jpg`);
  });
  const busy = await runIt();
  check("a file storage refuses keeps its note for the next hour", world.tables.document_file_trash.length === 1 && busy.body?.orphansFailed === 1, show(busy.body));
  check("…and the admins are told", told("ID papers were not deleted on time") === 1);
}

console.log("\nThe removal queue, and a backlog\n");
{
  const note = (n, h, extra = {}) => ({ id: `q${n}`, bucket: "videos", folder: `${ANA}`, starts_with: `${id(600 + n)}-`, path: null, attempts: 0, queued_at: hoursAgo(h), ...extra });
  reset((w) => {
    for (let n = 0; n < 450; n += 1) w.tables.storage_file_trash.push(note(n, 1 - n / 1000));
    w.storage.videos.add(`${ANA}/${id(600)}-intro.webm`);
  });
  const r = await runIt();
  check("a run takes 200 notes, oldest first: their files go, then the notes", r.status === 200 && r.body?.leftoversRemoved === 200 && world.tables.storage_file_trash.length === 250 && !world.storage.videos.has(`${ANA}/${id(600)}-intro.webm`), show(r.body));
  check("…250 still waiting is a backlog: the admins are told", r.body?.leftoversWaiting === 250 && told("Files queued for removal are backing up") === 1, show(r.body));
  const card = world.tables.notifications.find((n) => n.title === "Files queued for removal are backing up");
  check("…in plain words: how many, since when, how fast it clears", /^250 files are waiting in the removal queue/.test(card?.message ?? "") && /deletes 200 an hour, oldest first/.test(card?.message ?? ""), card?.message);
  await runIt();
  check("…once a day (claim_daily_alert), however many runs", told("Files queued for removal are backing up") === 1 && world.claims.has("cleanup:backlog"));

  reset((w) => {
    for (let n = 0; n < 230; n += 1) w.tables.storage_file_trash.push(note(n, 0.5));
  });
  const short = await runIt();
  check("a queue a run nearly clears (30 left, all new) is no backlog", short.body?.leftoversWaiting === 30 && told("Files queued for removal are backing up") === 0, show(short.body));

  reset((w) => {
    for (let n = 0; n < 205; n += 1) w.tables.storage_file_trash.push(note(n, 5));
  });
  const stale = await runIt();
  check("a note still waiting after more than three hours is a backlog too", stale.body?.leftoversWaiting === 5 && told("Files queued for removal are backing up") === 1, show(stale.body));

  reset((w) => {
    for (let n = 0; n < 5; n += 1) w.tables.storage_file_trash.push(note(n, 30, { attempts: 4 }));
  });
  await runIt();
  check("notes that keep failing are not a backlog (they have their own alert)", told("Files queued for removal are backing up") === 0);
}

globalThis.fetch = realFetch;
console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
