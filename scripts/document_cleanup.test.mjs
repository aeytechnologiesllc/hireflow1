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
 *     answers as 20261025620000 does; the SQL itself is proved in
 *     launch_locks_behaviour, sections 14 and 15): one person's 450 notes
 *     never keep another's out of the run (the eighth security review);
 *     the backlog alert says how to tell one account from many (the tenth),
 *     and how long a real withdrawal waits when each person's turn can be
 *     a withdrawal's worth (the eleventh);
 *   - exact paths go in one remove() a bucket for up to 1,000; a batch
 *     storage refuses is tried one path at a time, so one refused path keeps
 *     only its own note, and storage refusing everything costs three more
 *     calls, not a thousand; a path that is not plain is never removed, and
 *     its note goes rather than failing every hour (the ninth security
 *     review);
 *   - the ID papers that are due, and the papers of deleted requests, are
 *     read through document_requests_due_pick and document_file_trash_fair_pick
 *     (the stand-ins below answer as 20261025610000 does; the SQL is proved
 *     in launch_locks_behaviour, section 16): which kinds go and after how
 *     long (the twelfth Phase 5 review: dropping the kinds, the
 *     never-marked-sent read or the 7-day read passed every test), one
 *     business's 5,000 never keep a real ID out of the next run, a refused
 *     note waits out a back-off, and both backlogs are told once a day;
 *   - only ever a file in the request's own folder, <applicant>/<request>/:
 *     a due paper or a queued note pointing at another request's file never
 *     deletes it (the thirteenth Phase 5 review); a file sent again on a
 *     request still open (queued by the database, 20261025640000) goes alone,
 *     never the request's folder or the file it links now; and when it cannot
 *     tell which requests are open, it touches none and tells the admins;
 *   - a pick the database stops at its time limit is told as such, with who
 *     to look for, never only "it tries again every hour" (the twelfth
 *     security review: ranking the whole queue, the pick timed out on every
 *     run from about 700,000 notes on);
 *   - the look for ID photos an open request never linked is its own call
 *     (document_requests_sweep_strays, 20261025660000), with the ID kinds
 *     and the 7-day cutoff: when it times out the due IDs and the deleted
 *     requests' files still go, and the alert names the look, the bucket it
 *     reads and its mark, never the due pick (the thirteenth security
 *     review: inside the due pick, it stopped every due ID).
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
    // Tables whose reads fail (a select), for a failed read.
    failRead: new Set(),
    removeCalls: [],
    claims: new Set(),
    // storage_file_trash_served: when the pick last took each person, by kind of note.
    served: new Map(),
    // document_cleanup_served: when the ID-paper picks last took each business ('due' or 'deleted').
    docServed: new Map(),
    dueArgs: [],
    sweepArgs: [],
    // An error a pick answers with instead of its rows, by function name.
    rpcError: {},
    // What a function answers instead of its own answer (an answer of null: storage could not be read).
    rpcAnswer: {},
    // The ID requests with no link the sweep has looked at (document_requests_swept).
    swept: new Set(),
  };
}

/**
 * document_requests_due_pick as 20261025610000 makes it: a request of one of
 * p_kinds with a file, opened before p_opened_before, or never opened and
 * sent before p_sent_before, or never opened, never marked sent and asked
 * for before p_sent_before; each business's longest-due paper first,
 * businesses in turn (by when they were last taken or it became due,
 * whichever is later), then the businesses with the fewest due first; 200 a
 * run. It records whom it took. (Since 20261025660000 it no longer looks for
 * unlinked photos first: sweepStrays below is its own call.)
 */
function duePick(args) {
  world.dueArgs.push(args);
  const now = Date.now();
  const opened = Date.parse(args?.p_opened_before);
  const sent = Date.parse(args?.p_sent_before);
  const kinds = Array.isArray(args?.p_kinds) ? args.p_kinds : [];
  const at = (v) => (v == null ? NaN : Date.parse(v));
  const rows = world.tables.document_requests.filter((r) =>
    r.file_url != null && kinds.includes(r.document_type) &&
    ((r.team_opened_at != null && at(r.team_opened_at) <= opened) ||
      (r.team_opened_at == null && r.submitted_at != null && at(r.submitted_at) <= sent) ||
      (r.team_opened_at == null && r.submitted_at == null && at(r.created_at) <= sent)));
  const dueAt = (r) => (r.team_opened_at != null ? at(r.team_opened_at) + (now - opened) : r.submitted_at != null ? at(r.submitted_at) + (now - sent) : at(r.created_at) + (now - sent));
  const groups = new Map();
  for (const r of rows) {
    const who = r.employer_id ?? r.candidate_id;
    groups.set(who, [...(groups.get(who) ?? []), r]);
  }
  const ranked = [];
  for (const [who, list] of groups) {
    list.sort((a, b) => dueAt(a) - dueAt(b) || order(a.id, b.id));
    list.forEach((r, i) => ranked.push({ r, who, nth: i + 1, waiting: list.length, due: dueAt(r) }));
  }
  const turn = (x) => Math.max(world.docServed.get(`due:${x.who}`) ?? -Infinity, x.due);
  const picked = ranked
    .sort((a, b) => (a.nth > 1) - (b.nth > 1) || (a.nth === 1 ? turn(a) - turn(b) : 0) || a.waiting - b.waiting || a.nth - b.nth || a.due - b.due || order(a.r.id, b.r.id))
    .slice(0, 200);
  for (const x of picked) world.docServed.set(`due:${x.who}`, now);
  return picked.map(({ r }) => ({ id: r.id, candidate_id: r.candidate_id, file_url: r.file_url, status: r.status }));
}

/**
 * document_requests_sweep_strays as 20261025630000 and 20261025660000 make
 * it, document-cleanup's own call: it looks once at each ID request with no
 * link asked for before p_sent_before and queues each file in its own folder
 * in document_file_trash, naming the business. It answers how many it queued.
 */
function sweepStrays(args) {
  world.sweepArgs.push(args);
  const now = Date.now();
  const sent = Date.parse(args?.p_sent_before);
  const kinds = Array.isArray(args?.p_kinds) ? args.p_kinds : [];
  const at = (v) => (v == null ? NaN : Date.parse(v));
  let queued = 0;
  for (const r of world.tables.document_requests) {
    if (r.file_url != null || !["government_id", "nbi_clearance", "proof_of_address"].includes(r.document_type) || !kinds.includes(r.document_type) || !(at(r.created_at) <= sent) || world.swept.has(r.id)) continue;
    world.swept.add(r.id);
    for (const name of [...world.storage["requested-documents"]].filter((p) => p.startsWith(`${r.candidate_id}/${r.id}/`)).sort()) {
      if (!world.tables.document_file_trash.some((t) => t.request_id === r.id && t.file_url === name)) {
        world.tables.document_file_trash.push({ id: `stray-${world.tables.document_file_trash.length + 1}`, candidate_id: r.candidate_id, request_id: r.id, file_url: name, employer_id: r.employer_id, attempts: 0, last_tried_at: null, queued_at: new Date(now).toISOString() });
        queued += 1;
      }
    }
  }
  return queued;
}

/**
 * document_file_trash_fair_pick as 20261025610000 makes it: a note that
 * failed waits behind every note that is due for an hour a try (up to a day)
 * and half an hour more; each business's fewest-tries, oldest note first,
 * businesses in turn; then the rest, the businesses with the fewest waiting
 * first; 200 a run. A note without a business is its applicant's.
 */
function trashPick() {
  const now = Date.now();
  const queuedAt = (r) => Date.parse(r.queued_at ?? "2026-01-01T00:00:00Z");
  const tries = (r) => Number(r.attempts ?? 0);
  const due = (r) => (tries(r) > 0 ? Date.parse(r.last_tried_at ?? r.queued_at ?? "2026-01-01T00:00:00Z") + (Math.min(tries(r), 24) + 0.5) * 3_600_000 : queuedAt(r));
  const groups = new Map();
  for (const r of world.tables.document_file_trash) {
    const who = r.employer_id ?? r.candidate_id;
    groups.set(who, [...(groups.get(who) ?? []), r]);
  }
  const ranked = [];
  for (const [who, list] of groups) {
    list.sort((a, b) => tries(a) - tries(b) || queuedAt(a) - queuedAt(b) || order(a.id, b.id));
    list.forEach((r, i) => ranked.push({ r, who, nth: i + 1, waiting: list.length, due: due(r) }));
  }
  const turn = (x) => Math.max(world.docServed.get(`deleted:${x.who}`) ?? -Infinity, x.due);
  const picked = ranked
    .sort((a, b) =>
      (a.due > now) - (b.due > now) ||
      (a.nth > 1) - (b.nth > 1) ||
      (a.nth === 1 ? turn(a) - turn(b) : 0) ||
      a.waiting - b.waiting || a.nth - b.nth || tries(a.r) - tries(b.r) || queuedAt(a.r) - queuedAt(b.r) || order(a.r.id, b.r.id))
    .slice(0, 200);
  for (const x of picked) world.docServed.set(`deleted:${x.who}`, now);
  return picked.map((x) => ({ ...x.r }));
}

const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/**
 * storage_file_trash_fair_pick as 20261025620000 makes it: the folders
 * (exact false, 200, 6 from one person) or the exact paths (exact true,
 * 1,000, 40 from one person); a note that failed waits behind every note that
 * is due for an hour a try (up to a day) and half an hour more; each person's
 * turn (their fewest-tries, oldest note, or all of their notes when they hold
 * no more than 3 folders or 6 exact paths, or up to that many in a later
 * turn while they hold no more than twice that), people in turn (by when
 * they were last taken or their first note became due, whichever is later;
 * the fewest waiting first among turns that come at once), each turn whole
 * or not at all; then the rest, the people with the fewest waiting first. It
 * records whom it took.
 */
function fairPick(exact) {
  const person = (r) => r.candidate_id ?? r.application_id ?? `${r.bucket}:${r.path ?? r.folder}`;
  const now = Date.now();
  const due = (r) => (r.attempts > 0 ? Date.parse(r.last_tried_at ?? r.queued_at) + (Math.min(r.attempts, 24) + 0.5) * 3_600_000 : Date.parse(r.queued_at));
  const groups = new Map();
  for (const r of world.tables.storage_file_trash.filter((r) => (r.path != null) === exact)) groups.set(person(r), [...(groups.get(person(r)) ?? []), r]);
  const ranked = [];
  for (const [who, rows] of groups) {
    rows.sort((a, b) => a.attempts - b.attempts || order(a.queued_at, b.queued_at) || order(a.id, b.id));
    const firstDue = due(rows[0]);
    // Up to a withdrawal's worth in a later turn, for someone holding no more than two (20261025620000).
    const oldest = Math.min(...rows.map((r) => Date.parse(r.queued_at)));
    const later = rows.length <= (exact ? 12 : 6) && (world.served.get(`${exact}:${who}`) ?? -Infinity) >= oldest;
    rows.forEach((r, i) => ranked.push({ r, who, nth: i + 1, waiting: rows.length, due: due(r), firstDue, inTurn: i === 0 || rows.length <= (exact ? 6 : 3) || (later && i < (exact ? 6 : 3)) }));
  }
  const turn = (x) => Math.max(world.served.get(`${exact}:${x.who}`) ?? -Infinity, x.firstDue);
  const placed = ranked
    .filter((x) => x.nth <= (exact ? 40 : 6))
    .sort((a, b) =>
      (a.due > now) - (b.due > now) ||
      (!a.inTurn) - (!b.inTurn) ||
      (a.inTurn ? turn(a) - turn(b) : 0) ||
      a.waiting - b.waiting ||
      (a.inTurn ? order(a.who, b.who) : 0) ||
      a.nth - b.nth || a.r.attempts - b.r.attempts || order(a.r.queued_at, b.r.queued_at) || order(a.r.id, b.r.id));
  // A turn is taken whole or not at all: by the place of its last note.
  const turnEnds = new Map();
  placed.forEach((x, i) => {
    if (x.inTurn) turnEnds.set(`${x.who}:${x.due > now}`, i + 1);
  });
  const picked = placed.filter((x, i) => (x.inTurn ? turnEnds.get(`${x.who}:${x.due > now}`) : i + 1) <= (exact ? 1000 : 200));
  for (const x of picked) world.served.set(`${exact}:${x.who}`, now);
  return picked.map((x) => ({ ...x.r }));
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
    if (world.failRead.has(table)) return { data: null, error: { message: `stand-in: could not read ${table}` } };
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
      if (world.rpcError[fn]) return { data: null, error: world.rpcError[fn] };
      if (fn in world.rpcAnswer) return { data: world.rpcAnswer[fn], error: null };
      if (fn === "document_requests_due_pick") return { data: duePick(args), error: null };
      if (fn === "document_requests_sweep_strays") return { data: sweepStrays(args), error: null };
      if (fn === "document_file_trash_fair_pick") return { data: trashPick(), error: null };
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
  check("…in plain words: how many, since when, how fast it clears and how long a real removal waits", /^250 files are waiting in the removal queue/.test(card?.message ?? "") && /, the oldest since \d{4}-\d\d-\d\d \d\d:\d\d UTC\./.test(card?.message ?? "") && /deletes up to 200 folders and 1,000 files an hour, people in turn: all of a person's files at once when they are no more than one withdrawal's worth \(3 folders, 6 files\), else one a turn, and up to that many in each later turn while they hold no more than two withdrawals' worth \(6 folders, 12 files\)\. So a real withdrawal goes in one run, after about an hour for every 66 people with files queued before it; a Delete Account with two applications goes in three turns, and a larger removal gives one file a turn until it is down to that, each turn behind everyone who queued in the meantime\./.test(card?.message ?? ""), card?.message);
  // The eleventh security review: "about an hour for every 200 people with
  // files ahead of it" undercounted a stream of new accounts; each person
  // queued before a real withdrawal now takes up to three folders in their
  // turn, and a run may end two short of 200 rather than split one.
  // The tenth security review: "one candidate_id on many rows" described one
  // account, never many throwaway accounts with a few rows each.
  check("…and how to see who fills it: rows by candidate_id, one account or many", /To see who fills it, count storage_file_trash's rows by candidate_id: one account is one candidate_id with many rows; many throwaway accounts are many candidate_ids with a few rows each\.$/.test(card?.message ?? ""), card?.message);
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
      { id: "x4", bucket: "resumes", path: `${ANA}/.`, folder: null, starts_with: null, candidate_id: ANA, application_id: null, attempts: 0, queued_at: hoursAgo(1) },
    );
    w.storage.resumes.add(`${ANA}/.x`);
    w.storage.resumes.add(`${other}/cv.pdf`);
  });
  const notPlain = await runIt();
  check("a path that is not plain (\"%2e%2e\", \"..\", a backslash, a \".\" part) is never sent to storage", world.removeCalls.length === 0 && world.storage.resumes.has(`${id(9001)}/cv.pdf`), show(world.removeCalls));
  // The ninth security review: such a note was marked failed and tried again
  // every hour, for good; a thousand accounts' "<uid>/." notes held the front
  // of every run.
  check("…and its note goes, never tried again every hour (counted as dropped, not removed or failed)", world.tables.storage_file_trash.length === 0 && notPlain.body?.leftoversDropped === 4 && notPlain.body?.leftoversRemoved === 0 && notPlain.body?.leftoversFailed === 0, show({ left: world.tables.storage_file_trash, body: notPlain.body }));
  check("…with no alert that files were left (nothing storage holds is named by it)", told("Files queued for removal are not all deleted") === 0);
}

console.log("\nWhich ID papers are due, and one business's flood of them (the twelfth Phase 5 review)\n");
{
  // The review's weakenings T1, T2 and T8 passed every test: the kinds read,
  // the never-marked-sent read and the 7-day read were held only by regexes.
  // Each request here is the real BIZ's unless it says otherwise.
  const BIZ = id(21);
  const req = (n, extra) => ({ id: id(700 + n), candidate_id: ANA, employer_id: BIZ, document_type: "government_id", file_url: `${ANA}/${id(700 + n)}/1.jpg`, status: "submitted", team_opened_at: null, submitted_at: null, created_at: hoursAgo(24 * 30), ...extra });
  const cases = [
    ["an ID opened 25 hours ago", req(1, { team_opened_at: hoursAgo(25), submitted_at: hoursAgo(30) }), true],
    ["a paper named under \"Something else\" (a passport), opened 25 hours ago", req(2, { document_type: "custom", custom_document_name: "Passport", team_opened_at: hoursAgo(25), submitted_at: hoursAgo(30) }), false],
    ["a TIN typed in, opened 25 hours ago", req(3, { document_type: "tin", team_opened_at: hoursAgo(25), submitted_at: hoursAgo(30) }), false],
    ["an ID sent 8 days ago that nobody opened", req(4, { submitted_at: hoursAgo(24 * 8) }), true],
    ["an ID sent 6 days ago that nobody opened", req(5, { submitted_at: hoursAgo(24 * 6) }), false],
    ["an ID put there 8 days after it was asked for, never marked sent", req(6, { created_at: hoursAgo(24 * 8) }), true],
    ["an ID asked for 6 days ago, put there and never marked sent", req(7, { created_at: hoursAgo(24 * 6) }), false],
    ["an ID opened 23 hours ago", req(8, { team_opened_at: hoursAgo(23), submitted_at: hoursAgo(30) }), false],
  ];
  reset((w) => {
    for (const [, r] of cases) {
      w.tables.document_requests.push(r);
      w.storage["requested-documents"].add(r.file_url);
    }
  });
  const r = await runIt();
  for (const [what, request, goes] of cases) {
    const gone = !world.storage["requested-documents"].has(request.file_url);
    check(`${what}: ${goes ? "deleted" : "kept"}`, r.status === 200 && gone === goes && (world.tables.document_requests.find((q) => q.id === request.id).file_url === null) === goes, show({ gone, body: r.body }));
  }
  const asked = world.dueArgs[0] ?? {};
  check("…read through document_requests_due_pick with the three ID kinds and the 24-hour and 7-day cutoffs", JSON.stringify(asked.p_kinds) === JSON.stringify(["government_id", "nbi_clearance", "proof_of_address"]) && Math.abs(Date.now() - Date.parse(asked.p_opened_before) - 24 * 3_600_000) < 60_000 && Math.abs(Date.now() - Date.parse(asked.p_sent_before) - 7 * 86_400_000) < 60_000, show(asked));

  // One business's 5,000 ID papers, all due before a real one (opened 26
  // hours ago, the real one 25): read 200 at a time with no order, the real
  // one waited for as many runs as the flood had papers to spare.
  const FLOOD_BIZ = id(22);
  const REAL = req(9, { team_opened_at: hoursAgo(25), submitted_at: hoursAgo(30) });
  reset((w) => {
    for (let n = 0; n < 5000; n += 1) {
      const rid = id(100000 + n);
      w.tables.document_requests.push({ id: rid, candidate_id: id(31), employer_id: FLOOD_BIZ, document_type: "government_id", file_url: `${id(31)}/${rid}/1.jpg`, status: "submitted", team_opened_at: hoursAgo(26), submitted_at: hoursAgo(30), created_at: hoursAgo(40) });
      w.storage["requested-documents"].add(`${id(31)}/${rid}/1.jpg`);
    }
    w.tables.document_requests.push(REAL);
    w.storage["requested-documents"].add(REAL.file_url);
  });
  const flood = await runIt();
  check("a real ID due after one business's 5,000 is deleted in the next run", flood.status === 200 && !world.storage["requested-documents"].has(REAL.file_url), show(flood.body));
  check("…in a run of 200", flood.body?.deleted === 200, show(flood.body));
  const dueCard = world.tables.notifications.find((n) => n.title === "ID papers are waiting past their time");
  check("…and a full run is told to the admins, saying who to look for", told("ID papers are waiting past their time") === 1 && /^At least 200 ID papers were due for deletion this run \(24 hours after the hiring side first opened them, or 7 days after they were sent\)\. document-cleanup deletes up to 200 an hour, each business's in turn, and the rest wait for the next run\. To see who holds them, count document_requests' rows that still have a file, by employer_id\.$/.test(dueCard?.message ?? ""), dueCard?.message);
  await runIt();
  check("…once a day (claim_daily_alert)", told("ID papers are waiting past their time") === 1 && world.claims.has("cleanup:due-backlog"));
}

console.log("\nThe papers of deleted requests, one business's flood (the twelfth Phase 5 review)\n");
{
  // The review's proof: one business asked one throwaway applicant for 5,000
  // papers and the applicant withdrew; read 200 a run with no order, a real
  // ID removed through Delete their information afterwards was first read in
  // run 26.
  const FLOOD_BIZ = id(41);
  const REAL_BIZ = id(42);
  const ATT = id(43);
  const VICTIM = id(44);
  const VICTIM_REQ = id(45);
  const note = (n, h) => ({ id: `f${n}`, candidate_id: ATT, employer_id: FLOOD_BIZ, request_id: id(200000 + n), file_url: `${ATT}/${id(200000 + n)}/1.jpg`, attempts: 0, last_tried_at: null, queued_at: hoursAgo(h) });
  const victimFile = `${VICTIM}/${VICTIM_REQ}/1729000000000.jpg`;
  reset((w) => {
    for (let n = 0; n < 5000; n += 1) {
      w.tables.document_file_trash.push(note(n, 2 - n / 100000));
      w.storage["requested-documents"].add(`${ATT}/${id(200000 + n)}/1.jpg`);
    }
    w.tables.document_file_trash.push({ id: "victim", candidate_id: VICTIM, employer_id: REAL_BIZ, request_id: VICTIM_REQ, file_url: victimFile, attempts: 0, last_tried_at: null, queued_at: hoursAgo(0.5) });
    w.storage["requested-documents"].add(victimFile);
  });
  const r = await runIt();
  check("a real ID removed after one business's 5,000 deleted requests goes in the next run", r.status === 200 && !world.storage["requested-documents"].has(victimFile) && !world.tables.document_file_trash.some((t) => t.id === "victim"), show(r.body));
  check("…in a run of 200 (the flood's own 199 with it)", r.body?.orphans === 200 && world.tables.document_file_trash.length === 4801, show(r.body));
  const card = world.tables.notifications.find((n) => n.title === "Files of deleted requests are backing up");
  check(
    "…and the backlog is told to the admins: how many, since when, how fast it clears, and how to see who fills it",
    told("Files of deleted requests are backing up") === 1 &&
      /^4801 files are waiting to be deleted from requests that are gone \(ID papers and other papers applicants sent, after a withdrawal, Delete their information, Delete Account or a deleted job; document_file_trash\), the oldest since \d{4}-\d\d-\d\d \d\d:\d\d UTC\. document-cleanup deletes up to 200 an hour, each business's in turn, so one business's papers wait about an hour for every 200 businesses with papers ahead of them\. To see who fills it, count document_file_trash's rows by employer_id\.$/.test(card?.message ?? ""),
    card?.message,
  );
  await runIt();
  check("…once a day (claim_daily_alert)", told("Files of deleted requests are backing up") === 1 && world.claims.has("cleanup:deleted-requests-backlog"));

  // A note storage refuses waits out a back-off, so it never holds the front
  // of the run, and is tried again after it.
  reset((w) => {
    w.tables.document_file_trash.push({ id: "busy", candidate_id: VICTIM, employer_id: REAL_BIZ, request_id: VICTIM_REQ, file_url: victimFile, attempts: 0, last_tried_at: null, queued_at: hoursAgo(1) });
    w.storage["requested-documents"].add(victimFile);
    w.refuseRemove.add(victimFile);
  });
  await runIt();
  const busy = world.tables.document_file_trash.find((t) => t.id === "busy");
  check("a note storage refuses keeps its place for later, its tries up by one", busy?.attempts === 1 && typeof busy?.last_tried_at === "string", show(busy));
  world.refuseRemove.clear();
  // A full run of other businesses' notes, queued after it.
  for (let n = 0; n < 200; n += 1) {
    world.tables.document_file_trash.push({ id: `o${n}`, candidate_id: id(9000 + n), employer_id: id(9500 + n), request_id: id(9800 + n), file_url: null, attempts: 0, last_tried_at: null, queued_at: hoursAgo(0.1) });
  }
  await runIt();
  check("…and, until its back-off ends, waits behind every note that is due: a full run of others goes first", world.storage["requested-documents"].has(victimFile) && world.tables.document_file_trash.length === 1);
  await runIt();
  check("…then it is tried again, and goes", !world.storage["requested-documents"].has(victimFile) && world.tables.document_file_trash.length === 0);

  reset((w) => {
    for (let n = 0; n < 150; n += 1) w.tables.document_file_trash.push(note(n, 0.5));
  });
  await runIt();
  check("a queue a run clears is no backlog", told("Files of deleted requests are backing up") === 0 && world.tables.document_file_trash.length === 0);
}

console.log("\nOnly the request's own folder, and a paper sent again (the thirteenth Phase 5 review)\n");
{
  // The applicant's own folder holds every business's papers for them: an
  // applicant of two businesses has the first's ID in it. The checks were
  // "in the applicant's folder", so one slip in the database's guard (the
  // review's K7 or K8: a request pointing at another request's file) would
  // have deleted the first business's copy through the second's request.
  const BIZ = id(51);
  const OTHER_BIZ = id(52);
  const ID_REQ = id(53); // BIZ's ID request, still open
  const POINTER = id(54); // OTHER_BIZ's request, pointing at BIZ's copy
  const GONE = id(55); // a deleted request whose note points at BIZ's copy
  const idFile = `${ANA}/${ID_REQ}/1729000000000.jpg`;
  const open = (extra) => ({ candidate_id: ANA, document_type: "government_id", status: "submitted", submitted_at: hoursAgo(30), created_at: hoursAgo(40), ...extra });
  reset((w) => {
    w.tables.document_requests.push(
      open({ id: ID_REQ, employer_id: BIZ, file_url: idFile, team_opened_at: hoursAgo(1) }),
      open({ id: POINTER, employer_id: OTHER_BIZ, file_url: idFile, team_opened_at: hoursAgo(25) }),
    );
    w.tables.document_file_trash.push({ id: "pointer", candidate_id: ANA, employer_id: OTHER_BIZ, request_id: GONE, file_url: idFile, attempts: 0, last_tried_at: null, queued_at: hoursAgo(1) });
    for (const p of [idFile, `${ANA}/${GONE}/1729000000000.jpg`]) w.storage["requested-documents"].add(p);
  });
  const r = await runIt();
  check("a due paper whose link is another request's file never deletes it (it is counted as not deleted, and the admins are told)", world.storage["requested-documents"].has(idFile) && r.body?.failed === 1 && told("ID papers were not deleted on time") === 1, show(r.body));
  check("…nor does a deleted request's note that points at it, while its own folder still goes", world.storage["requested-documents"].has(idFile) && !world.storage["requested-documents"].has(`${ANA}/${GONE}/1729000000000.jpg`) && !world.tables.document_file_trash.some((t) => t.id === "pointer"), show([...world.storage["requested-documents"]]));
  check("…and the first business's request keeps its link", world.tables.document_requests.find((q) => q.id === ID_REQ).file_url === idFile);

  // A paper sent again on a request still open: the database queued the
  // earlier file (document_requests_guard_update, 20261025640000). Only that
  // file goes; the copy sent in its place, in the same folder, stays.
  const RESENT = id(56);
  const earlier = `${ANA}/${RESENT}/1729000000000.jpg`;
  const now = `${ANA}/${RESENT}/1729000000001.jpg`;
  const alsoThere = `${ANA}/${RESENT}/1729000000002.jpg`;
  reset((w) => {
    w.tables.document_requests.push(open({ id: RESENT, employer_id: BIZ, file_url: now, team_opened_at: null, submitted_at: hoursAgo(0.5) }));
    w.tables.document_file_trash.push({ id: "earlier", candidate_id: ANA, employer_id: BIZ, request_id: RESENT, file_url: earlier, attempts: 0, last_tried_at: null, queued_at: hoursAgo(0.5) });
    for (const p of [earlier, now, alsoThere]) w.storage["requested-documents"].add(p);
  });
  const resent = await runIt();
  check("a file sent again goes in the next run, and its note with it", resent.status === 200 && !world.storage["requested-documents"].has(earlier) && world.tables.document_file_trash.length === 0 && resent.body?.orphans === 1, show(resent.body));
  check("…never the copy sent in its place, nor anything else in that request's folder", world.storage["requested-documents"].has(now) && world.storage["requested-documents"].has(alsoThere) && world.tables.document_requests.find((q) => q.id === RESENT).file_url === now, show([...world.storage["requested-documents"]]));

  // Sent again, and the applicant linked the earlier file once more: it is
  // the request's file now, so it stays; the note goes.
  reset((w) => {
    w.tables.document_requests.push(open({ id: RESENT, employer_id: BIZ, file_url: earlier, team_opened_at: null }));
    w.tables.document_file_trash.push({ id: "relinked", candidate_id: ANA, employer_id: BIZ, request_id: RESENT, file_url: earlier, attempts: 0, last_tried_at: null, queued_at: hoursAgo(0.5) });
    w.storage["requested-documents"].add(earlier);
  });
  await runIt();
  check("a queued file the request links again stays, and its note goes", world.storage["requested-documents"].has(earlier) && world.tables.document_file_trash.length === 0);

  // Not knowing which requests are still open, none of the notes is touched
  // (a folder swept for an open request would take the copy sent in its
  // place), and the admins are told the list could not be read.
  reset((w) => {
    w.tables.document_requests.push(open({ id: RESENT, employer_id: BIZ, file_url: now }));
    w.tables.document_file_trash.push({ id: "earlier", candidate_id: ANA, employer_id: BIZ, request_id: RESENT, file_url: earlier, attempts: 0, last_tried_at: null, queued_at: hoursAgo(0.5) });
    for (const p of [earlier, now]) w.storage["requested-documents"].add(p);
    w.failRead.add("document_requests");
  });
  const blind = await runIt();
  check("when it cannot read which requests are open, it deletes nothing of the queue and keeps every note as it was", world.storage["requested-documents"].has(now) && world.storage["requested-documents"].has(earlier) && world.tables.document_file_trash.length === 1 && world.tables.document_file_trash[0].attempts === 0, show(blind.body));
  check("…answers as a failed read, and the admins are told", blind.status === 500 && blind.body?.error === "read_failed" && told("Files of deleted requests are not being deleted") === 1, show(blind));
}

console.log("\nAn ID photo an open request never linked (asked of the twelfth security round)\n");
{
  // The upload went up, saving its link failed and so did the dialog's own
  // removal: the request is open with no link and its folder holds the
  // photo. Seven days after it was asked for, the run's look queues that file
  // (20261025630000; its own call since 20261025660000) and the same run
  // deletes it alone: the request stays open, with no link, and nothing
  // counts as a failure.
  const BIZ = id(61);
  const STRAY = id(62);
  const EMPTY = id(63);
  const YOUNG = id(64);
  const ask = (rid, days) => ({ id: rid, candidate_id: ANA, employer_id: BIZ, document_type: "government_id", file_url: null, status: "pending", team_opened_at: null, submitted_at: null, created_at: hoursAgo(24 * days) });
  const strayFile = `${ANA}/${STRAY}/1729000000000.jpg`;
  const youngFile = `${ANA}/${YOUNG}/1729000000000.jpg`;
  reset((w) => {
    w.tables.document_requests.push(ask(STRAY, 8), ask(EMPTY, 8), ask(YOUNG, 6));
    for (const p of [strayFile, youngFile]) w.storage["requested-documents"].add(p);
  });
  const r = await runIt();
  check("an ID request with no link, asked for 8 days ago, whose folder holds a photo: the photo is deleted in that run", r.status === 200 && !world.storage["requested-documents"].has(strayFile) && world.tables.document_file_trash.length === 0, show({ body: r.body, left: world.tables.document_file_trash }));
  check("…the request stays open, with no link, and nothing counts as a failure", world.tables.document_requests.find((q) => q.id === STRAY)?.file_url === null && r.body?.failed === 0 && r.body?.orphansFailed === 0 && told("ID papers were not deleted on time") === 0, show(r.body));
  check("…one asked for 6 days ago keeps its photo for now, and one with nothing in its folder costs nothing", world.storage["requested-documents"].has(youngFile) && r.body?.orphans === 1, show(r.body));
  check("…the look is its own call, with the ID kinds and the 7-day cutoff, and the run says how many it queued",
    world.sweepArgs.length === 1 && JSON.stringify(world.sweepArgs[0]?.p_kinds) === JSON.stringify(["government_id", "nbi_clearance", "proof_of_address"]) &&
      Math.abs(Date.parse(world.sweepArgs[0]?.p_sent_before) - (Date.now() - 7 * 86_400_000)) < 60_000 && r.body?.strays === 1,
    show({ args: world.sweepArgs, strays: r.body?.strays }));
  // Both ways: by the time the run comes, the applicant has linked that very
  // file after all; it is their paper now, deleted on its own clock.
  reset((w) => {
    w.tables.document_requests.push(ask(STRAY, 8));
    w.storage["requested-documents"].add(strayFile);
  });
  sweepStrays({ p_kinds: ["government_id", "nbi_clearance", "proof_of_address"], p_sent_before: hoursAgo(24 * 7) });
  Object.assign(world.tables.document_requests.find((q) => q.id === STRAY), { file_url: strayFile, status: "submitted", submitted_at: new Date().toISOString() });
  world.sweepArgs.length = 0;
  const relinked = await runIt();
  check("…and a photo the request links by the time of the run is kept (its note goes)", relinked.status === 200 && world.storage["requested-documents"].has(strayFile) && world.tables.document_file_trash.length === 0, show(relinked.body));
}

console.log("\nA pick the database stops at its time limit (the twelfth security review)\n");
{
  // Ranking the whole removal queue, the pick passed the API's 8-second
  // statement timeout at about 700,000 notes; every run then failed to read
  // it, the alert said only "It tries again every hour", which never helped,
  // and the backlog alert (which says how to find the accounts) stopped,
  // since it runs only after a read. The picks read only a run's worth now;
  // a read that still times out says so, and how to find who fills it.
  const TIMEOUT = { code: "57014", message: "canceling statement due to statement timeout" };
  const DUE = id(801);
  reset((w) => {
    w.rpcError.storage_file_trash_fair_pick = TIMEOUT;
    w.tables.storage_file_trash.push({ id: "q1", bucket: "videos", folder: id(2001), starts_with: `${id(601)}-`, path: null, candidate_id: id(2001), application_id: id(601), attempts: 0, queued_at: hoursAgo(5) });
    w.tables.document_requests.push({ id: DUE, candidate_id: ANA, employer_id: id(21), document_type: "government_id", file_url: `${ANA}/${DUE}/1.jpg`, status: "submitted", team_opened_at: hoursAgo(25), submitted_at: hoursAgo(30), created_at: hoursAgo(40) });
    w.storage["requested-documents"].add(`${ANA}/${DUE}/1.jpg`);
  });
  const r = await runIt();
  const card = world.tables.notifications.find((n) => n.title === "Files queued for removal are not being deleted");
  check("the removal queue's pick timed out: the run answers as a failed read, and the ID papers still go", r.status === 500 && r.body?.error === "read_failed" && !world.storage["requested-documents"].has(`${ANA}/${DUE}/1.jpg`), show(r));
  check(
    "…and the admins are told it timed out, that trying again will not help, and how to find who fills the queue",
    told("Files queued for removal are not being deleted") === 1 &&
      /took longer than the database allows and was stopped \(canceling statement due to statement timeout\): nothing in that queue is deleted until it is read in time, and trying again every hour does not help while the queue is this big\./.test(card?.message ?? "") &&
      /check that table and its triggers are there\. To see who fills the queue, count storage_file_trash's rows by candidate_id: one account is one candidate_id with many rows; many throwaway accounts are many candidate_ids with a few rows each\.$/.test(card?.message ?? ""),
    card?.message,
  );
  reset((w) => {
    w.rpcError.storage_file_trash_fair_pick = { code: "08006", message: "connection reset" };
  });
  await runIt();
  const other = world.tables.notifications.find((n) => n.title === "Files queued for removal are not being deleted");
  check("…another read failure is told as before (it tries again every hour)", /could not read the files queued for removal \(.*\) \(connection reset\)\. It tries again every hour\.$/.test(other?.message ?? "") && !/time limit|took longer/.test(other?.message ?? ""), other?.message);
  reset((w) => {
    w.rpcError.document_file_trash_fair_pick = TIMEOUT;
    w.rpcError.document_requests_due_pick = { message: "canceling statement due to statement timeout" };
  });
  await runIt();
  const trashCard = world.tables.notifications.find((n) => n.title === "Files of deleted requests are not being deleted");
  const dueCard = world.tables.notifications.find((n) => n.title === "ID papers are not being deleted");
  check("the papers' picks timed out: each is told so, with who to look for (rows by employer_id)",
    /took longer than the database allows and was stopped/.test(trashCard?.message ?? "") && /count document_file_trash's rows by employer_id\.$/.test(trashCard?.message ?? "") &&
      /took longer than the database allows and was stopped/.test(dueCard?.message ?? "") && /no ID is deleted until it is read in time/.test(dueCard?.message ?? "") && /count document_requests' rows that still have a file, by employer_id\.$/.test(dueCard?.message ?? ""),
    show({ trash: trashCard?.message, due: dueCard?.message }));

  // The look for unlinked photos timed out (the thirteenth security review:
  // run inside the due pick, it was cancelled with it, every run, and the
  // alert sent the admins to the due turns). Its own call now: the due ID
  // and a deleted request's file still go, the run answers as a failed read,
  // and the alert names the look, the bucket it reads and its mark.
  const GONE = id(802);
  reset((w) => {
    w.rpcError.document_requests_sweep_strays = TIMEOUT;
    w.tables.document_requests.push({ id: DUE, candidate_id: ANA, employer_id: id(21), document_type: "government_id", file_url: `${ANA}/${DUE}/1.jpg`, status: "submitted", team_opened_at: hoursAgo(25), submitted_at: hoursAgo(30), created_at: hoursAgo(40) });
    w.tables.document_file_trash.push({ id: "t1", candidate_id: ANA, employer_id: id(21), request_id: GONE, file_url: `${ANA}/${GONE}/1.jpg`, attempts: 0, last_tried_at: null, queued_at: hoursAgo(2) });
    for (const p of [`${ANA}/${DUE}/1.jpg`, `${ANA}/${GONE}/1.jpg`]) w.storage["requested-documents"].add(p);
  });
  const slowLook = await runIt();
  const lookCard = world.tables.notifications.find((n) => n.title === "Unlinked ID photos are not being looked for");
  check("the look for unlinked photos timed out: the due ID and the deleted request's file still go, and the run answers as a failed read",
    slowLook.status === 500 && slowLook.body?.error === "read_failed" && !world.storage["requested-documents"].has(`${ANA}/${DUE}/1.jpg`) && !world.storage["requested-documents"].has(`${ANA}/${GONE}/1.jpg`) && slowLook.body?.deleted === 1 && slowLook.body?.orphans === 1,
    show(slowLook));
  check("…and the admins are told it is the look that timed out, what it reads and why trying again repeats it, never that the ID papers are not being deleted",
    told("Unlinked ID photos are not being looked for") === 1 && told("ID papers are not being deleted") === 0 &&
      /document_requests_sweep_strays\) took longer than the database allows and was stopped/.test(lookCard?.message ?? "") && /document_requests_swept/.test(lookCard?.message ?? "") &&
      /requested-documents/.test(lookCard?.message ?? "") && /The ID papers that are due are deleted all the same\.$/.test(lookCard?.message ?? ""),
    lookCard?.message);
  reset((w) => {
    w.rpcAnswer.document_requests_sweep_strays = null;
    w.tables.document_requests.push({ id: DUE, candidate_id: ANA, employer_id: id(21), document_type: "government_id", file_url: `${ANA}/${DUE}/1.jpg`, status: "submitted", team_opened_at: hoursAgo(25), submitted_at: hoursAgo(30), created_at: hoursAgo(40) });
    w.storage["requested-documents"].add(`${ANA}/${DUE}/1.jpg`);
  });
  const blindLook = await runIt();
  check("…a look that could not read storage (it answers nothing) is logged and costs nothing else: the due ID goes, no alert", blindLook.status === 200 && !world.storage["requested-documents"].has(`${ANA}/${DUE}/1.jpg`) && world.tables.notifications.length === 0 && blindLook.body?.strays === 0, show(blindLook));
}

globalThis.fetch = realFetch;
console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
