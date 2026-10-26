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
 *   - the removal queue: 200 folders a run, a note dropped once storage holds
 *     nothing there; a backlog (a run's worth still waiting, or a note
 *     waiting over three hours) is told to the admins once a day, through
 *     claim_daily_alert; a short queue is not;
 *   - it is read through storage_file_trash_fair_pick (the stand-in below
 *     answers as 20261025560000 does; the SQL itself is proved in
 *     launch_locks_behaviour, section 14): one person's 450 notes never keep
 *     another's out of the run (the eighth security review);
 *   - exact paths go in one remove() a bucket for up to 1,000; a batch
 *     storage refuses is tried one path at a time, so one refused path keeps
 *     only its own note, and storage refusing everything costs three more
 *     calls, not a thousand; a path that is not plain is never removed.
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
    refuseAll: false,
    removeCalls: [],
    claims: new Set(),
  };
}

const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/**
 * storage_file_trash_fair_pick as 20261025560000 makes it: the folders
 * (exact false, 200, 6 from one person) or the exact paths (exact true,
 * 1,000, 40 from one person); in rounds, each person's fewest-tries, oldest
 * note first; in each round the people with the fewest waiting first.
 */
function fairPick(exact) {
  const person = (r) => r.candidate_id ?? r.application_id ?? `${r.bucket}:${r.path ?? r.folder}`;
  const groups = new Map();
  for (const r of world.tables.storage_file_trash.filter((r) => (r.path != null) === exact)) groups.set(person(r), [...(groups.get(person(r)) ?? []), r]);
  const ranked = [];
  for (const rows of groups.values()) {
    rows.sort((a, b) => a.attempts - b.attempts || order(a.queued_at, b.queued_at) || order(a.id, b.id));
    rows.forEach((r, i) => ranked.push({ r, nth: i + 1, waiting: rows.length }));
  }
  return ranked
    .filter((x) => x.nth <= (exact ? 40 : 6))
    .sort((a, b) => a.nth - b.nth || a.waiting - b.waiting || a.r.attempts - b.r.attempts || order(a.r.queued_at, b.r.queued_at) || order(a.r.id, b.r.id))
    .slice(0, exact ? 1000 : 200)
    .map((x) => ({ ...x.r }));
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
      if (fn === "storage_file_trash_fair_pick") return { data: fairPick(args.p_exact === true), error: null };
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
          world.removeCalls.push({ bucket, n: paths.length });
          if (paths.length > 1000) return { data: null, error: { message: "stand-in: at most 1,000 names a call" } };
          if (world.refuseAll || paths.some((p) => world.refuseRemove.has(p))) return { data: null, error: { message: "stand-in: storage is busy" } };
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
  // Each note one person's (a video introduction's folder), unless the case says otherwise.
  const note = (n, h, extra = {}) => ({ id: `q${n}`, bucket: "videos", folder: id(2000 + n), starts_with: `${id(600 + n)}-`, path: null, candidate_id: id(2000 + n), application_id: id(600 + n), attempts: 0, queued_at: hoursAgo(h), ...extra });
  reset((w) => {
    for (let n = 0; n < 450; n += 1) w.tables.storage_file_trash.push(note(n, 1 - n / 1000));
    w.storage.videos.add(`${id(2000)}/${id(600)}-intro.webm`);
  });
  const r = await runIt();
  check("a run takes 200 folder notes, oldest first: their files go, then the notes", r.status === 200 && r.body?.leftoversRemoved === 200 && world.tables.storage_file_trash.length === 250 && !world.storage.videos.has(`${id(2000)}/${id(600)}-intro.webm`), show(r.body));
  check("…250 still waiting is a backlog: the admins are told", r.body?.leftoversWaiting === 250 && told("Files queued for removal are backing up") === 1, show(r.body));
  const card = world.tables.notifications.find((n) => n.title === "Files queued for removal are backing up");
  check("…in plain words: how many, since when, how fast it clears and that one account holds up only itself", /^250 files are waiting in the removal queue/.test(card?.message ?? "") && /deletes up to 200 folders and 1,000 files an hour, a few from each person at a time, so one account filling it holds up only itself/.test(card?.message ?? ""), card?.message);
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

console.log("\nOne account's flood holds up only itself; exact paths go in bulk (the eighth security review)\n");
{
  const FLOOD = id(3001);
  const REAL = id(3002);
  const folderNote = (key, who, n, h) => ({ id: key, bucket: "videos", folder: who, starts_with: `${id(4000 + n)}-`, path: null, candidate_id: who, application_id: id(4000 + n), attempts: 0, queued_at: hoursAgo(h) });
  reset((w) => {
    // The review's flood: one account's folders, all older than a real withdrawal's.
    for (let n = 0; n < 450; n += 1) w.tables.storage_file_trash.push(folderNote(`f${n}`, FLOOD, n, 2 - n / 1000));
    for (let n = 0; n < 3; n += 1) {
      w.tables.storage_file_trash.push(folderNote(`r${n}`, REAL, 900 + n, 0.1));
      w.storage.videos.add(`${REAL}/${id(4900 + n)}-intro.webm`);
    }
  });
  const flood = await runIt();
  check("a real withdrawal queued after one account's 450 notes is cleared in the next run", flood.status === 200 && ![...world.storage.videos].some((p) => p.startsWith(`${REAL}/`)) && !world.tables.storage_file_trash.some((q) => q.candidate_id === REAL), show(flood.body));
  check("…while the run takes at most 6 of that account's folders", world.tables.storage_file_trash.filter((q) => q.candidate_id === FLOOD).length === 444 && flood.body?.leftoversRemoved === 9, show(flood.body));

  const resume = (who, n) => `${who}/17290000${String(n).padStart(5, "0")}.pdf`;
  reset((w) => {
    // 25 people's form files (40 each, as many as one deleted application
    // queues) and one person's portfolio leftovers: 1,000 exact paths.
    let k = 0;
    for (let p = 0; p < 25; p += 1) {
      for (let n = 0; n < 40; n += 1) {
        const who = id(5000 + p);
        const bucket = p === 24 ? "portfolios" : "resumes";
        w.tables.storage_file_trash.push({ id: `p${k}`, bucket, path: resume(who, n), folder: null, starts_with: null, candidate_id: who, application_id: id(6000 + p), attempts: 0, queued_at: hoursAgo(1 - k / 10000) });
        w.storage[bucket].add(resume(who, n));
        k += 1;
      }
    }
  });
  const bulk = await runIt();
  check("1,000 exact paths in a run, one remove() a bucket (never one a path)", bulk.status === 200 && JSON.stringify(world.removeCalls.map((c) => [c.bucket, c.n]).sort()) === JSON.stringify([["portfolios", 40], ["resumes", 960]]), show(world.removeCalls));
  check("…their files gone, then their notes", bulk.body?.leftoversRemoved === 1000 && world.tables.storage_file_trash.length === 0 && world.storage.resumes.size === 0 && world.storage.portfolios.size === 0, show(bulk.body));

  reset((w) => {
    // One person with 100 exact paths and another with 5, queued after.
    for (const [who, many, h] of [[id(5100), 100, 3], [id(5101), 5, 0.1]]) {
      for (let n = 0; n < many; n += 1) {
        w.tables.storage_file_trash.push({ id: `m${who.slice(4, 8)}${n}`, bucket: "resumes", path: resume(who, n), folder: null, starts_with: null, candidate_id: who, application_id: null, attempts: 0, queued_at: hoursAgo(h) });
        w.storage.resumes.add(resume(who, n));
      }
    }
  });
  const each = await runIt();
  check("…at most 40 of one person's exact paths a run, and the other person's all", each.body?.leftoversRemoved === 45 && world.tables.storage_file_trash.length === 60 && world.tables.storage_file_trash.every((q) => q.candidate_id === id(5100)), show(each.body));

  reset((w) => {
    for (let n = 0; n < 50; n += 1) {
      const who = id(7000 + n);
      w.tables.storage_file_trash.push({ id: `b${n}`, bucket: "resumes", path: resume(who, 0), folder: null, starts_with: null, candidate_id: who, application_id: id(7100 + n), attempts: 0, queued_at: hoursAgo(1) });
      w.storage.resumes.add(resume(who, 0));
    }
    w.refuseRemove.add(resume(id(7007), 0));
  });
  const one = await runIt();
  const refused = world.tables.storage_file_trash;
  check("a path storage refuses keeps only its own note: the batch is tried one path at a time", refused.length === 1 && refused[0].id === "b7" && refused[0].attempts === 1 && world.storage.resumes.size === 1 && one.body?.leftoversRemoved === 49 && one.body?.leftoversFailed === 1, show({ refused, body: one.body }));
  check("…and the admins are told", told("Files queued for removal are not all deleted") === 1);

  reset((w) => {
    for (let n = 0; n < 500; n += 1) {
      const who = id(8000 + n);
      w.tables.storage_file_trash.push({ id: `d${n}`, bucket: "resumes", path: resume(who, 0), folder: null, starts_with: null, candidate_id: who, application_id: null, attempts: 0, queued_at: hoursAgo(1) });
      w.storage.resumes.add(resume(who, 0));
    }
    w.refuseAll = true;
  });
  const down = await runIt();
  check("storage refusing everything costs the batch and three single tries, not 500", world.removeCalls.filter((c) => c.bucket === "resumes").length === 4, show(world.removeCalls.length));
  check("…and every note stays, its tries up by one, for the next hour", world.tables.storage_file_trash.length === 500 && world.tables.storage_file_trash.every((q) => q.attempts === 1) && down.body?.leftoversFailed === 500, show(down.body));

  reset((w) => {
    const other = id(9001);
    w.tables.storage_file_trash.push(
      { id: "x1", bucket: "resumes", path: `${ANA}/%2e%2e/${other}/cv.pdf`, folder: null, starts_with: null, candidate_id: ANA, application_id: null, attempts: 0, queued_at: hoursAgo(1) },
      { id: "x2", bucket: "resumes", path: `${ANA}/../${other}/cv.pdf`, folder: null, starts_with: null, candidate_id: ANA, application_id: null, attempts: 0, queued_at: hoursAgo(1) },
      { id: "x3", bucket: "resumes", path: `${ANA}/cv\\x.pdf`, folder: null, starts_with: null, candidate_id: ANA, application_id: null, attempts: 0, queued_at: hoursAgo(1) },
    );
    w.storage.resumes.add(`${other}/cv.pdf`);
  });
  await runIt();
  check("a path that is not plain (\"%2e%2e\", \"..\", a backslash) is never sent to storage", world.removeCalls.length === 0 && world.storage.resumes.has(`${id(9001)}/cv.pdf`), show(world.removeCalls));
  check("…and its note sinks behind the ones never tried", world.tables.storage_file_trash.every((q) => q.attempts === 1), show(world.tables.storage_file_trash));
}

globalThis.fetch = realFetch;
console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
