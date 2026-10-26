#!/usr/bin/env node
/**
 * requested-document-url, the function itself (the thirteenth Phase 5
 * review, finding 1).
 *
 * The other tests read its text and run ownFolder.ts on its own. The review
 * showed what one slip in the database's guard would have let through here:
 * an applicant who applied to two businesses has both businesses' papers in
 * their own folder, and the check was "in the applicant's folder", so a
 * request of the second business pointing at the first's copy of their ID
 * (its weakenings K7 and K8) would have been signed for the second.
 *
 * The real supabase/functions/requested-document-url/index.ts is bundled
 * with the database client replaced by a stand-in (the request rows, the two
 * access RPCs, storage signing) and the rate limit's call answered "allowed".
 * No network. It proves:
 *   - a request's own file (<applicant>/<request>/<name>) is signed for the
 *     applicant and for the job's owner, and the owner's first look is
 *     recorded;
 *   - a request whose stored link is another request's file, in the same
 *     applicant's folder, is answered "Nothing has been sent" and nothing is
 *     signed or recorded, for the business that asked and for the applicant;
 *   - a file straight in the applicant's folder is not signed either;
 *   - someone who is neither the applicant nor on the job is refused;
 *   - the 24-hour clock of an ID paper (team_opened_at) starts at the hiring
 *     side's first opening, "Download a copy" included, never at the
 *     applicant's own, and a second opening does not move it (the fourteenth
 *     Phase 5 review, finding 2: the download rule was held by nothing, the
 *     other two only by a regex in document_requests.test.mjs).
 *
 * Run with: node scripts/requested_document_url.test.mjs
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
  stdin: { contents: 'import "./supabase/functions/requested-document-url/index.ts";\n', resolveDir: ROOT, loader: "ts" },
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
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const createClient = (url, key, opts) => globalThis.__world.client(key, opts);", loader: "js" }));
      },
    },
  ],
});

const ENV = { SUPABASE_URL: "http://database.stand-in", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-key" };
globalThis.Deno = { env: { get: (key) => ENV[key] }, serve: (handler) => { globalThis.__fn = handler; } };

const id = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const ANA = id(1); // applied to CLINIC and to SHOP
const CLINIC = id(2); // asked for her ID, and she sent it
const SHOP = id(3); // another business she applied to
const NOBODY = id(4);
const JOB_CLINIC = id(10);
const JOB_SHOP = id(11);
const ID_REQ = id(20); // CLINIC's request for her ID
const POINTER = id(21); // SHOP's request, its link pointing at CLINIC's copy
const LOOSE = id(22); // SHOP's request, its link a file straight in her folder
const idFile = `${ANA}/${ID_REQ}/1729000000000.jpg`;

let world;
function reset() {
  world = {
    requests: [
      { id: ID_REQ, application_id: id(30), candidate_id: ANA, file_url: idFile, file_name: "ID.jpg", file_deleted_at: null, team_opened_at: null, applications: { job_id: JOB_CLINIC } },
      { id: POINTER, application_id: id(31), candidate_id: ANA, file_url: idFile, file_name: "ID.jpg", file_deleted_at: null, team_opened_at: null, applications: { job_id: JOB_SHOP } },
      { id: LOOSE, application_id: id(31), candidate_id: ANA, file_url: `${ANA}/1729000000000.jpg`, file_name: "ID.jpg", file_deleted_at: null, team_opened_at: null, applications: { job_id: JOB_SHOP } },
    ],
    owners: { [JOB_CLINIC]: CLINIC, [JOB_SHOP]: SHOP },
    signed: [],
    events: [],
    stamped: [],
    client,
  };
  globalThis.__world = world;
}

/** The one caller's client (the anon key with their sign-in) or the server's (the service key). */
function client(key, opts) {
  const bearer = opts?.global?.headers?.Authorization ?? "";
  const caller = bearer.replace(/^Bearer /, "");
  if (key === "anon-key") {
    return {
      auth: { getUser: async () => (caller ? { data: { user: { id: caller } }, error: null } : { data: { user: null }, error: { message: "no user" } }) },
      rpc: async (fn, args) => {
        if (fn === "is_job_owner") return { data: world.owners[args.p_job_id] === args.p_user_id && args.p_user_id === caller, error: null };
        if (fn === "is_active_team_member_for_job") return { data: false, error: null };
        return { data: null, error: { message: `stand-in: no ${fn}` } };
      },
    };
  }
  return {
    from: (table) => {
      const filters = [];
      let patch = null;
      const q = {
        select: () => q,
        eq: (col, value) => (filters.push((r) => r[col] === value), q),
        is: (col, value) => (filters.push((r) => (value === null ? r[col] == null : r[col] === value)), q),
        update: (p) => ((patch = p), q),
        insert: async (row) => {
          if (table === "document_request_events") world.events.push(row);
          return { error: null };
        },
        maybeSingle: async () => {
          const r = world.requests.find((x) => filters.every((f) => f(x)));
          return { data: r ? { ...r } : null, error: null };
        },
        then: (resolve, reject) => {
          const rows = world.requests.filter((x) => filters.every((f) => f(x)));
          if (patch) for (const r of rows) {
            Object.assign(r, patch);
            world.stamped.push(r.id);
          }
          return Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }).then(resolve, reject);
        },
      };
      return q;
    },
    storage: {
      from: (bucket) => ({
        createSignedUrl: async (p, seconds, options) => {
          world.signed.push({ bucket, path: p, download: options?.download ?? null });
          return { data: { signedUrl: `https://storage.stand-in/${bucket}/${p}?expires=${seconds}` }, error: null };
        },
      }),
    },
  };
}

// The rate limit asks the database through fetch: always allowed here.
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url;
  if (url === `${ENV.SUPABASE_URL}/rest/v1/rpc/check_rate_limit`) return new Response(JSON.stringify({ allowed: true, hits: 1, retryAfter: 1 }), { status: 200 });
  throw new Error(`the function reached outside: ${url}`);
};

reset();
await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const fn = globalThis.__fn;
check("the real function loaded, with only the database client replaced", typeof fn === "function");

const ask = async (who, requestId, extra = {}) => {
  const res = await fn(new Request("http://fn.stand-in/requested-document-url", { method: "POST", headers: { Authorization: `Bearer ${who}`, "Content-Type": "application/json" }, body: JSON.stringify({ requestId, ...extra }) }));
  return { status: res.status, body: await res.json().catch(() => null) };
};
const stampOf = (requestId) => world.requests.find((r) => r.id === requestId)?.team_opened_at ?? null;

console.log("\nA request's own file\n");
{
  reset();
  const own = await ask(ANA, ID_REQ);
  check("the applicant opens her own ID for the request she sent it on", own.status === 200 && world.signed.length === 1 && world.signed[0].path === idFile, show(own));
  reset();
  const team = await ask(CLINIC, ID_REQ);
  check("…and the business that asked for it opens it, its first look recorded", team.status === 200 && world.signed[0]?.path === idFile && world.stamped.includes(ID_REQ) && world.events.some((e) => e.request_id === ID_REQ && e.action === "opened"), show(team));
}

console.log("\nAnother request's file (the thirteenth Phase 5 review)\n");
{
  reset();
  const pointed = await ask(SHOP, POINTER);
  check("another business's request whose link is the first business's copy of her ID is answered \"nothing sent\", and nothing is signed", pointed.status === 404 && pointed.body?.error === "Nothing has been sent for this request" && world.signed.length === 0, show(pointed));
  check("…nor is its first look recorded, so no clock starts on the first business's ID", world.stamped.length === 0 && world.events.length === 0, show({ stamped: world.stamped, events: world.events }));
  reset();
  const herself = await ask(ANA, POINTER);
  check("…the same for the applicant through that request", herself.status === 404 && world.signed.length === 0, show(herself));
  reset();
  const loose = await ask(SHOP, LOOSE);
  check("a link to a file straight in her folder, in no request's folder, is not signed either", loose.status === 404 && world.signed.length === 0, show(loose));
  reset();
  const stranger = await ask(NOBODY, ID_REQ);
  check("someone neither the applicant nor on the job is refused", stranger.status === 403 && world.signed.length === 0, show(stranger));
}

console.log("\nWhen an ID paper's 24 hours start (the fourteenth Phase 5 review)\n");
{
  // The Privacy Policy and the Terms say an ID paper is deleted 24 hours after
  // the hiring side first opens it. A team that only ever used "Download a
  // copy" would have kept it 7 days had the download not started the clock
  // (the review's U2, which passed every test); the applicant's own look
  // starting it would delete her ID before the team saw it (U3); and a clock
  // that moved with every opening would let a team keep it for good by
  // opening it daily (U5).
  reset();
  const download = await ask(CLINIC, ID_REQ, { download: true });
  check(
    "\"Download a copy\" by the business that asked is its first opening: the link saves the file, and the clock starts",
    download.status === 200 && world.signed.length === 1 && world.signed[0].download === "ID.jpg" && world.stamped.includes(ID_REQ) && stampOf(ID_REQ) !== null && download.body?.teamOpenedAt === stampOf(ID_REQ),
    show({ download, signed: world.signed, stamped: world.stamped }),
  );
  reset();
  const own = await ask(ANA, ID_REQ);
  const ownDownload = await ask(ANA, ID_REQ, { download: true });
  check(
    "the applicant opening (or downloading) her own ID starts no clock: it waits for the hiring side",
    own.status === 200 && ownDownload.status === 200 && world.signed.length === 2 && world.stamped.length === 0 && stampOf(ID_REQ) === null && own.body?.teamOpenedAt === null && ownDownload.body?.teamOpenedAt === null,
    show({ own, ownDownload, stamped: world.stamped }),
  );
  reset();
  const earlier = "2026-10-20T08:00:00.000Z";
  world.requests.find((r) => r.id === ID_REQ).team_opened_at = earlier;
  const again = await ask(CLINIC, ID_REQ);
  const againDownload = await ask(CLINIC, ID_REQ, { download: true });
  check(
    "a second opening, or a download after the first look, does not move the clock: the first look still counts",
    again.status === 200 && againDownload.status === 200 && world.signed.length === 2 && world.stamped.length === 0 && stampOf(ID_REQ) === earlier && again.body?.teamOpenedAt === earlier && againDownload.body?.teamOpenedAt === earlier,
    show({ again, againDownload, stamped: world.stamped, now: stampOf(ID_REQ) }),
  );
  check("…and every one of those openings is still recorded", world.events.filter((e) => e.request_id === ID_REQ && e.action === "opened").length === 2, show(world.events));
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
