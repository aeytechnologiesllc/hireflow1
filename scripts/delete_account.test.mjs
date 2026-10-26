#!/usr/bin/env node
/**
 * delete-account, the function itself (the twelfth Phase 5 review).
 *
 * Nothing ran delete-account: the review removed 'resumes' or
 * 'requested-documents' from the buckets it empties and every test passed,
 * so Delete Account could have left the profile resume, every upload no
 * application lists, or a paper not tied to a request, against "your files
 * are deleted with it". And its purge of the signing record
 * (document_audit_logs) failed for everyone who had signed something, since
 * prevent_audit_delete refuses any delete, and logged a "still hold their
 * data" error with each such deletion.
 *
 * The real supabase/functions/delete-account/index.ts is bundled with the
 * database client replaced by a stand-in (tables in memory, storage as a set
 * of buckets, document_audit_logs refusing a delete as its trigger does) and
 * called as Settings calls it. No network. It proves:
 *   - without the account's password nothing is deleted;
 *   - every file in the person's own folder of every bucket goes (resumes and
 *     requested-documents included), and nobody else's;
 *   - the signing record stays, and no delete of it is even tried, so the
 *     deletion ends with no "still hold their data" error;
 *   - a team member's chats and sent documents go to the business's owner,
 *     and the business's documents and message attachments stay.
 *
 * Run with: node scripts/delete_account.test.mjs
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
  stdin: { contents: 'import "./supabase/functions/delete-account/index.ts";\n', resolveDir: ROOT, loader: "ts" },
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
          if (/deno\.land\/std@[\d.]+\/http\/server\.ts$/.test(args.path)) return { path: "serve", namespace: "stub" };
          throw new Error(`the function imports something this test has no stand-in for: ${args.path}`);
        });
        b.onLoad({ filter: /^supabase$/, namespace: "stub" }, () => ({ contents: "export const createClient = (url, key) => globalThis.__world.client(key);", loader: "js" }));
        b.onLoad({ filter: /^serve$/, namespace: "stub" }, () => ({ contents: "export const serve = (handler) => { globalThis.__deleteAccount = handler; };", loader: "js" }));
      },
    },
  ],
});

const ENV = { SUPABASE_URL: "http://database.stand-in", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
globalThis.Deno = { env: { get: (key) => ENV[key] } };

const id = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const ANA = id(1); // an applicant who signed an offer letter
const BEN = id(2); // someone else
const OWNER = id(3); // a business
const TM = id(4); // on OWNER's team
const BUCKETS = ["avatars", "resumes", "portfolios", "videos", "message-attachments", "documents", "requested-documents"];

let world;
function freshWorld() {
  return {
    tables: {
      user_roles: [], team_members: [], jobs: [], applications: [], messages: [], documents: [], document_requests: [],
      document_audit_logs: [], profiles: [], notifications: [], push_subscriptions: [], interviews: [], document_packages: [],
    },
    storage: Object.fromEntries(BUCKETS.map((b) => [b, new Set()])),
    sessions: { "ana-token": { id: ANA, email: "ana@example.test" }, "tm-token": { id: TM, email: "tm@example.test" } },
    passwords: { "ana@example.test": "ana-password", "tm@example.test": "tm-password" },
    deletedUsers: [],
    auditDeletesTried: 0,
  };
}

/** The query shapes the function uses, over the world's tables. */
function query(table) {
  const filters = [];
  let mode = "select";
  let patch = null;
  let range = null;
  let cap = null;
  const rows = () => (world.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (mode === "delete") {
      const gone = rows();
      // As prevent_audit_delete: "Audit logs cannot be modified or deleted for compliance reasons".
      if (table === "document_audit_logs") {
        world.auditDeletesTried += 1;
        if (gone.length) return { data: null, error: { message: "Audit logs cannot be modified or deleted for compliance reasons" } };
      }
      world.tables[table] = (world.tables[table] ?? []).filter((r) => !gone.includes(r));
      return { data: null, error: null };
    }
    if (mode === "update") {
      for (const r of rows()) Object.assign(r, patch);
      return { data: null, error: null };
    }
    let out = rows();
    if (range) out = out.slice(range[0], range[1] + 1);
    if (cap != null) out = out.slice(0, cap);
    return { data: out.map((r) => ({ ...r })), error: null };
  };
  const q = {
    select: () => q,
    eq: (col, value) => (filters.push((r) => r[col] === value), q),
    in: (col, values) => (filters.push((r) => values.includes(r[col])), q),
    order: () => q,
    range: (a, b) => ((range = [a, b]), q),
    limit: (n) => ((cap = n), q),
    update: (p) => ((mode = "update"), (patch = p), q),
    delete: () => ((mode = "delete"), q),
    then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
  };
  return q;
}

function client(key) {
  return {
    auth: {
      getUser: async (token) => {
        const user = world.sessions[token];
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "bad token" } };
      },
      signInWithPassword: async ({ email, password }) => (world.passwords[email] === password ? { data: {}, error: null } : { data: null, error: { message: "Invalid login credentials" } }),
      admin: {
        deleteUser: async (userId) => {
          if (key !== ENV.SUPABASE_SERVICE_ROLE_KEY) return { error: { message: "not the service role" } };
          world.deletedUsers.push(userId);
          return { error: null };
        },
      },
    },
    from: query,
    storage: {
      from: (bucket) => ({
        listV2: async ({ prefix, limit }) => {
          const keys = [...world.storage[bucket]].filter((k) => k.startsWith(prefix)).slice(0, limit);
          return { data: { objects: keys.map((k) => ({ key: k })), hasNext: false }, error: null };
        },
        remove: async (paths) => {
          for (const p of paths) world.storage[bucket].delete(p);
          return { data: paths.map((name) => ({ name })), error: null };
        },
      }),
    },
  };
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  throw new Error(`the function reached outside: ${typeof input === "string" ? input : input.url}`);
};
const errors = [];
const realError = console.error;
const realLog = console.log;
console.error = (...args) => errors.push(args.map(String).join(" "));

function reset(change) {
  world = freshWorld();
  world.client = client;
  globalThis.__world = world;
  errors.length = 0;
  change?.(world);
}
reset();
await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const handler = globalThis.__deleteAccount;
check("the real function loaded, with only the database client replaced", typeof handler === "function");
const call = async (token, password) => {
  console.log = () => {};
  try {
    const res = await handler(new Request("http://fn.stand-in/delete-account", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ password }) }));
    return { status: res.status, body: await res.json().catch(() => null) };
  } finally {
    console.log = realLog;
  }
};

console.log("\nAn applicant deletes their account\n");
{
  const filled = (w) => {
    w.tables.user_roles.push({ user_id: ANA, role: "candidate" }, { user_id: OWNER, role: "employer" });
    w.tables.profiles.push({ id: "p1", user_id: ANA, resume_url: `${ANA}/1729000000000_profile.pdf` }, { id: "p2", user_id: BEN });
    w.tables.jobs.push({ id: "job1", employer_id: OWNER });
    w.tables.applications.push({ id: "app1", job_id: "job1", candidate_id: ANA });
    w.tables.messages.push({ id: "m1", sender_id: OWNER, receiver_id: ANA, application_id: "app1" });
    w.tables.documents.push({ id: "d1", sender_id: OWNER, recipient_id: ANA, application_id: "app1" });
    // The signing record of the offer letter Ana signed.
    w.tables.document_audit_logs.push({ id: "log1", document_id: "d1", user_id: ANA, action: "signed", ip_address: "203.0.113.7" });
    for (const bucket of BUCKETS) {
      w.storage[bucket].add(`${ANA}/1729000000000_${bucket}.bin`);
      w.storage[bucket].add(`${BEN}/1729000000000_${bucket}.bin`);
    }
    // A profile resume no application lists, and a paper not tied to a request.
    w.storage.resumes.add(`${ANA}/1729000000000_profile.pdf`);
    w.storage["requested-documents"].add(`${ANA}/loose/1729000000000.jpg`);
  };
  reset(filled);
  const wrong = await call("ana-token", "not-it");
  check("a wrong password: 401, and nothing is deleted", wrong.status === 401 && world.deletedUsers.length === 0 && world.storage.resumes.has(`${ANA}/1729000000000_profile.pdf`), show(wrong));

  reset(filled);
  const r = await call("ana-token", "ana-password");
  check("with the password: deleted", r.status === 200 && r.body?.success === true && world.deletedUsers.includes(ANA), show(r));
  for (const bucket of BUCKETS) {
    check(`…every file in their own folder of ${bucket} goes`, ![...world.storage[bucket]].some((k) => k.startsWith(`${ANA}/`)), show([...world.storage[bucket]]));
  }
  check("…the profile resume no application lists and a paper not tied to a request included (the review's T3, T4)", !world.storage.resumes.has(`${ANA}/1729000000000_profile.pdf`) && !world.storage["requested-documents"].has(`${ANA}/loose/1729000000000.jpg`));
  check("…nobody else's", BUCKETS.every((bucket) => world.storage[bucket].has(`${BEN}/1729000000000_${bucket}.bin`)));
  check("…their profile, application and messages go", !world.tables.profiles.some((p) => p.user_id === ANA) && world.tables.applications.length === 0 && world.tables.messages.length === 0);
  check("the signing record stays, as the Privacy Policy and the confirm say: proof of the signature", world.tables.document_audit_logs.length === 1 && world.tables.document_audit_logs[0].user_id === ANA);
  check("…and no delete of it is tried, so the deletion logs no \"still hold their data\" error", world.auditDeletesTried === 0 && !errors.some((e) => /still hold their data/.test(e)), show(errors));
}

console.log("\nA team member deletes their account\n");
{
  reset((w) => {
    w.tables.user_roles.push({ user_id: TM, role: "team_member" }, { user_id: OWNER, role: "employer" });
    w.tables.team_members.push({ id: "t1", user_id: TM, employer_id: OWNER, created_at: "2026-10-01" });
    w.tables.profiles.push({ id: "p3", user_id: TM });
    w.tables.jobs.push({ id: "job1", employer_id: OWNER });
    w.tables.applications.push({ id: "app1", job_id: "job1", candidate_id: ANA });
    w.tables.messages.push({ id: "m1", sender_id: TM, receiver_id: ANA, application_id: "app1" });
    w.tables.documents.push({ id: "d1", sender_id: TM, recipient_id: ANA, application_id: "app1" });
    w.tables.document_audit_logs.push({ id: "log1", document_id: "d1", user_id: TM, action: "countersigned" });
    for (const bucket of BUCKETS) w.storage[bucket].add(`${TM}/1729000000000_${bucket}.bin`);
  });
  const r = await call("tm-token", "tm-password");
  check("deleted", r.status === 200 && world.deletedUsers.includes(TM), show(r));
  check("…their chats with applicants and the documents they sent go to the business's owner, as the confirm says", world.tables.messages[0]?.sender_id === OWNER && world.tables.documents[0]?.sender_id === OWNER, show({ m: world.tables.messages, d: world.tables.documents }));
  check("…the business's documents and message attachments stay; their other files go", world.storage.documents.has(`${TM}/1729000000000_documents.bin`) && world.storage["message-attachments"].has(`${TM}/1729000000000_message-attachments.bin`) && !world.storage.resumes.has(`${TM}/1729000000000_resumes.bin`) && !world.storage.avatars.has(`${TM}/1729000000000_avatars.bin`));
  check("…and the signing record stays", world.tables.document_audit_logs.length === 1 && world.auditDeletesTried === 0 && !errors.some((e) => /still hold their data/.test(e)), show(errors));
}

console.error = realError;
globalThis.fetch = realFetch;
console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
