#!/usr/bin/env node
/**
 * Proof for src/lib/connectionTest.ts (docs/EQUIPMENT-CHECK.md §3 and §7): the
 * browser side of the computer and connection check, the REAL module (no
 * copy; it is import-free, so plain Node loads it the way
 * connection_test_stamps.test.mjs loads connectionStamps.ts).
 *
 *   - the download stamp is read from the body's last 512 bytes, never the
 *     header copy, never from a short body;
 *   - the chain runs in order (8 pings, 3 downloads, 4 uploads), hands every
 *     previous stamp back, retries a failed request ONCE with the same
 *     previous stamp, stops on a refusal, and reports a running estimate;
 *   - every download and upload after the first is sized from the one before
 *     it, so a line far too slow for 3 MB still finishes every request
 *     inside its time limit (a run that can never finish parks the applicant);
 *   - a refusal's words are the server's only when it wrote them for the
 *     page (a `code`): a bare "Unauthorized" is never shown;
 *   - the running estimate's maths: median round trip, total bytes over
 *     total time, one decimal, the same way the server figures its own;
 *   - the device: userAgentData (with and without the high-entropy values)
 *     and the UA string for Windows, Mac, Android, iPhone and iPad;
 *     phone / tablet / computer per the contract;
 *   - the bars from a step's config, and which ones an estimate misses;
 *   - the markers (connection-test?op=event): the body each one sends, the
 *     server's figures for a finished run read from the reply, and a refusal,
 *     an error or a slow answer read as "no figures", never thrown.
 *
 * Run with: node scripts/connection_check_client.test.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  barsBelow,
  barsFromConfig,
  CHAIN_STEPS,
  ConnectionRequestError,
  createInvokeTransport,
  createMarkerSender,
  DEFAULT_BARS,
  describeDevice,
  deviceFromUserAgent,
  deviceFromUserAgentData,
  deviceKindOf,
  DOWNLOAD_BYTES,
  DOWNLOAD_COUNT,
  FIRST_DOWNLOAD_BYTES,
  FIRST_UPLOAD_BYTES,
  MAX_RUNS,
  MIN_DOWNLOAD_BYTES,
  MIN_UPLOAD_BYTES,
  nextRequestBytes,
  REQUEST_TIMEOUT_MS,
  mbps,
  osVersionFromPlatformVersion,
  parseStampText,
  parseUserAgent,
  PING_COUNT,
  randomUploadBody,
  readDevice,
  readStampTail,
  runConnectionChain,
  runningEstimate,
  serverFiguresFromReply,
  STAMP_TAIL_BYTES,
  stampFromReply,
  UPLOAD_BYTES,
  UPLOAD_COUNT,
} from "../src/lib/connectionTest.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

/* ------------------------------------------------------------ stamps */
console.log("\nStamps — the text the page hands back:\n");

let counter = 0;
const nonce = () => (0x1000000000000000n + BigInt(++counter)).toString(16).slice(-16);
const SIG = "A".repeat(43);
const stampJson = (kind, extra = {}) =>
  JSON.stringify({ kind, nonce: nonce(), at: 1_700_000_000_000 + counter, bytes: 0, prev_nonce: null, prev_at: 1_700_000_000_000, candidate: "c1", ...extra, sig: SIG });

{
  const text = stampJson("ping");
  check("a ping stamp's JSON parses to its shape", parseStampText(text)?.kind === "ping");
  check("a stamp with a bad nonce is not a stamp", parseStampText(text.replace(/"nonce":"[0-9a-f]+"/, '"nonce":"xyz"')) === null);
  check("a stamp without a signature is not a stamp", parseStampText(text.replace(/,"sig":"A+"/, "")) === null);
  check("prose is not a stamp", parseStampText("not a stamp") === null && parseStampText(42) === null);
  check("stampFromReply reads { stamp } for the right kind", stampFromReply({ stamp: text }, "ping") === text);
  check("stampFromReply refuses the wrong kind", stampFromReply({ stamp: text }, "upload") === null);
  check("stampFromReply refuses a reply without a stamp", stampFromReply({}, "ping") === null && stampFromReply(null, "ping") === null);
}

function downloadBody(bytes, stampText) {
  const body = new Uint8Array(bytes);
  for (let i = 0; i < bytes - STAMP_TAIL_BYTES; i++) body[i] = (i * 31) & 0xff;
  body.fill(0x20, bytes - STAMP_TAIL_BYTES);
  body.set(new TextEncoder().encode(stampText), bytes - STAMP_TAIL_BYTES);
  return body;
}

{
  const text = stampJson("download", { bytes: 4096 });
  const body = downloadBody(4096, text);
  check(`the download stamp is read from the last ${STAMP_TAIL_BYTES} bytes, trimmed`, STAMP_TAIL_BYTES === 512 && readStampTail(body) === text);
  check("the padding is spaces (a client that trims must not change the JSON)", body[4096 - 1] === 0x20 && body.subarray(4096 - STAMP_TAIL_BYTES, 4096 - STAMP_TAIL_BYTES + 1)[0] === 0x7b);
  check("a body shorter than the tail has no stamp", readStampTail(body.subarray(0, 200)) === null);
  check("a body cut short (the tail missing) has no stamp", readStampTail(body.subarray(0, 4000)) === null);
  const head = downloadBody(4096, stampJson("download", { bytes: 4096, head: true }));
  check("the header copy (head: true) is never read as a chain link", readStampTail(head) === null);
  const ping = downloadBody(4096, stampJson("ping"));
  check("a ping stamp at the end of a body is not a download stamp", readStampTail(ping) === null);
}

/* ------------------------------------------------------ the estimate */
console.log("\nRunning estimate — the gauge's maths:\n");

check("mbps: 3 MB in 1 s ≈ 25.2 Mbps", mbps(3 * 1024 * 1024, 1000) === 25.2);
check("mbps: nothing moved or no time → null", mbps(0, 100) === null && mbps(100, 0) === null);
{
  const est = runningEstimate({ pings: [40, 44, 38, 120, 41], downloads: [], uploads: [] });
  check("latency is the MEDIAN round trip (one slow ping does not move it)", est.latencyMs === 41, String(est.latencyMs));
  check("nothing downloaded yet → null, never 0 or Infinity", est.downloadMbps === null && est.uploadMbps === null);
}
{
  const est = runningEstimate({
    pings: [50, 52],
    downloads: [{ bytes: DOWNLOAD_BYTES, ms: 1000 }, { bytes: DOWNLOAD_BYTES, ms: 500 }],
    uploads: [{ bytes: UPLOAD_BYTES, ms: 2000 }],
  });
  check("download Mbps is total bytes over total ms, one decimal", est.downloadMbps === 33.6, String(est.downloadMbps));
  check("upload Mbps likewise", est.uploadMbps === 6.3, String(est.uploadMbps));
  check("latency: median of two is their mean, rounded", est.latencyMs === 51);
}

/* ------------------------------------------------------------ the chain */
console.log("\nThe chain — order, previous stamps, one retry, refusals:\n");

/** A fake server: stamps every op, remembers what it was handed, fails on cue. */
function fakeTransport(opts = {}) {
  const calls = [];
  const fails = { ...(opts.fail ?? {}) };
  // Keyed by STEP (successes so far), so `{ 2: 1 }` fails the third step's
  // first attempt and `{ 8: 2 }` fails the first download and its retry.
  let successes = 0;
  const maybeFail = () => {
    const n = fails[successes] ?? 0;
    if (n > 0) {
      fails[successes] = n - 1;
      throw new ConnectionRequestError(opts.refuse ? "Refused by the fake." : "No answer.", {
        retryable: !opts.refuse,
        code: opts.refuse ? "bad_stamp" : null,
        status: opts.refuse ? 400 : null,
      });
    }
  };
  return {
    calls,
    transport: {
      async ping(prev, signal) {
        calls.push({ kind: "ping", prev, aborted: signal.aborted });
        maybeFail();
        successes += 1;
        return stampJson("ping", { prev_nonce: prev ? JSON.parse(prev).nonce : null });
      },
      async download(prev, bytes, signal) {
        calls.push({ kind: "download", prev, bytes, aborted: signal.aborted });
        maybeFail();
        successes += 1;
        return stampJson("download", { bytes, prev_nonce: JSON.parse(prev).nonce });
      },
      async upload(prev, body, signal) {
        calls.push({ kind: "upload", prev, bytes: body.byteLength, aborted: signal.aborted });
        maybeFail();
        successes += 1;
        return stampJson("upload", { bytes: body.byteLength, prev_nonce: JSON.parse(prev).nonce, timing: "stream" });
      },
    },
  };
}

{
  const { calls, transport } = fakeTransport();
  const progress = [];
  let clock = 0;
  const outcome = await runConnectionChain(transport, { now: () => (clock += 25), onProgress: (p) => progress.push(p) });
  check("a clean chain finishes", outcome.ok === true);
  check(`${CHAIN_STEPS} requests: ${PING_COUNT} pings, ${DOWNLOAD_COUNT} downloads, ${UPLOAD_COUNT} uploads, in that order`,
    calls.map((c) => c.kind).join(",") === [...Array(PING_COUNT).fill("ping"), ...Array(DOWNLOAD_COUNT).fill("download"), ...Array(UPLOAD_COUNT).fill("upload")].join(","),
    calls.map((c) => c.kind).join(","));
  check("the first request hands nothing back", calls[0].prev === null);
  check("every later request hands back the stamp the previous response carried",
    outcome.ok && calls.slice(1).every((c, i) => c.prev === outcome.stamps[i]));
  check("the first download asks for 512 KB and the first upload carries 64 KB; on a fast line every later one is the cap (3 MB, 1.5 MB)",
    JSON.stringify(calls.filter((c) => c.kind === "download").map((c) => c.bytes)) === JSON.stringify([FIRST_DOWNLOAD_BYTES, DOWNLOAD_BYTES, DOWNLOAD_BYTES]) &&
      JSON.stringify(calls.filter((c) => c.kind === "upload").map((c) => c.bytes)) === JSON.stringify([FIRST_UPLOAD_BYTES, UPLOAD_BYTES, UPLOAD_BYTES, UPLOAD_BYTES]),
    JSON.stringify(calls.filter((c) => c.kind !== "ping").map((c) => c.bytes)));
  check("the samples record the bytes each request really moved", outcome.ok && outcome.samples.downloads[0].bytes === FIRST_DOWNLOAD_BYTES && outcome.samples.uploads[0].bytes === FIRST_UPLOAD_BYTES);
  check("the stamps come back in chain order, as text", outcome.ok && outcome.stamps.length === CHAIN_STEPS && outcome.stamps.every((s) => typeof s === "string"));
  check("each stamp names its predecessor", outcome.ok && outcome.stamps.slice(1).every((s, i) => JSON.parse(s).prev_nonce === JSON.parse(outcome.stamps[i]).nonce));
  check("progress is reported before and after each step, never retrying", progress.length === CHAIN_STEPS * 2 && progress.every((p) => !p.retrying) && progress.at(-1).step === CHAIN_STEPS);
  check("the running estimate grows with the chain: latency after the pings, download after the downloads",
    progress[PING_COUNT * 2 - 1].estimate.latencyMs !== null && progress[PING_COUNT * 2 - 1].estimate.downloadMbps === null &&
      progress.at(-1).estimate.downloadMbps !== null && progress.at(-1).estimate.uploadMbps !== null);
  check("the estimate times each request with the clock handed in (25 ms a request)", outcome.ok && outcome.estimate.latencyMs === 25 && outcome.samples.downloads.every((d) => d.ms === 25));
}

{
  // The 3rd ping fails once: sent again with the SAME previous stamp.
  const { calls, transport } = fakeTransport({ fail: { 2: 1 } });
  const progress = [];
  const outcome = await runConnectionChain(transport, { now: () => 0, onProgress: (p) => progress.push(p) });
  check("a request that fails once is sent again and the chain finishes", outcome.ok === true);
  check("the retry carries the SAME previous stamp", calls[2].kind === "ping" && calls[3].kind === "ping" && calls[2].prev === calls[3].prev);
  check("one extra request in all", calls.length === CHAIN_STEPS + 1);
  check("the retry is reported as such, once", progress.filter((p) => p.retrying).length === 1);
  check("the retried stamp (not the lost one) is in the chain", outcome.ok && outcome.stamps.length === CHAIN_STEPS);
}

{
  // The 1st download fails twice: the chain stops there, unreachable.
  const { calls, transport } = fakeTransport({ fail: { [PING_COUNT]: 2 } });
  const outcome = await runConnectionChain(transport, { now: () => 0 });
  check("a request that fails twice ends the chain", outcome.ok === false && outcome.reason === "unreachable");
  check("it says where it stopped", outcome.ok === false && outcome.step === PING_COUNT && outcome.phase === "download");
  check("only one retry was ever sent", calls.length === PING_COUNT + 2);
  check("the stamps so far come back (for the record of what happened)", outcome.ok === false && outcome.stamps.length === PING_COUNT);
  check("the message is plain words", outcome.ok === false && /did not finish/.test(outcome.message));
}

{
  // A refusal (400 with a code) is never retried: a fresh chain is the only way on.
  const { calls, transport } = fakeTransport({ fail: { 4: 1 }, refuse: true });
  const outcome = await runConnectionChain(transport, { now: () => 0 });
  check("a refused request is not sent again", outcome.ok === false && outcome.reason === "refused" && calls.length === 5);
  check("the server's words are shown", outcome.ok === false && outcome.message === "Refused by the fake.");
}

{
  // Stopped by the caller mid-chain.
  const controller = new AbortController();
  const { transport } = fakeTransport();
  const slow = {
    ...transport,
    async ping(prev, signal) {
      if (prev) controller.abort();
      return transport.ping(prev, signal);
    },
  };
  const outcome = await runConnectionChain(slow, { now: () => 0, signal: controller.signal });
  check("an aborted chain says so and nothing else", outcome.ok === false && outcome.reason === "aborted");
}

{
  // A line far too slow for 3 MB (0.15 Mbps down, 0.08 up, 600 ms round
  // trip): the old fixed sizes took 168 s and 157 s a request, past the 90 s
  // limit twice, so no run could ever finish and the applicant was parked
  // for good. Sized from the one before, every request fits.
  let clock = 0;
  const RTT = 600;
  const msFor = (bytes, mbit) => (bytes * 8) / (mbit * 1000);
  const slow = fakeTransport();
  const timed = {
    async ping(prev, signal) { clock += RTT; return slow.transport.ping(prev, signal); },
    async download(prev, bytes, signal) { clock += RTT + msFor(bytes, 0.15); return slow.transport.download(prev, bytes, signal); },
    async upload(prev, body, signal) { clock += RTT + msFor(body.byteLength, 0.08); return slow.transport.upload(prev, body, signal); },
  };
  const outcome = await runConnectionChain(timed, { now: () => clock });
  const longest = (kind) => Math.max(...outcome.samples[kind].map((x) => x.ms));
  check(
    "a 0.15 / 0.08 Mbps line finishes: every request inside its 90 s limit",
    outcome.ok && longest("downloads") < REQUEST_TIMEOUT_MS.download && longest("uploads") < REQUEST_TIMEOUT_MS.upload,
    outcome.ok ? JSON.stringify([longest("downloads"), longest("uploads")]) : outcome.message,
  );
  check(
    "…the later ones shrink to fit (never under the floor), and the estimate reads the line as it is",
    outcome.ok && outcome.samples.downloads.slice(1).every((d) => d.bytes < FIRST_DOWNLOAD_BYTES && d.bytes >= MIN_DOWNLOAD_BYTES) &&
      outcome.samples.uploads.slice(1).every((u) => u.bytes < FIRST_UPLOAD_BYTES * 4 && u.bytes >= MIN_UPLOAD_BYTES) &&
      // one decimal: never above the line's own rate rounded up
      outcome.estimate.downloadMbps <= 0.2 && outcome.estimate.uploadMbps <= 0.1,
    outcome.ok ? JSON.stringify({ d: outcome.samples.downloads.map((d) => d.bytes), u: outcome.samples.uploads.map((u) => u.bytes), e: outcome.estimate }) : "",
  );
  check("nextRequestBytes: the first is the small one, a later one is ~2.5 s at the last one's pace, minus the round trip",
    nextRequestBytes("download", { pings: [], downloads: [], uploads: [] }) === FIRST_DOWNLOAD_BYTES &&
      nextRequestBytes("download", { pings: [100], downloads: [{ bytes: 1_000_000, ms: 1_100 }], uploads: [] }) === 2_500_000 &&
      nextRequestBytes("upload", { pings: [100], downloads: [], uploads: [{ bytes: 64 * 1024, ms: 60 }] }) === UPLOAD_BYTES &&
      nextRequestBytes("upload", { pings: [], downloads: [], uploads: [{ bytes: 1000, ms: 100_000 }] }) === MIN_UPLOAD_BYTES);
  const fixedSizes = fakeTransport();
  await runConnectionChain(fixedSizes.transport, { now: () => 0, sizes: { download: 4096, upload: 2048 } });
  check("fixed sizes (the tests' option) override the sizing", fixedSizes.calls.filter((c) => c.kind === "download").every((c) => c.bytes === 4096) && fixedSizes.calls.filter((c) => c.kind === "upload").every((c) => c.bytes === 2048));
}

{
  const body = randomUploadBody(UPLOAD_BYTES);
  const view = new Uint8Array(body);
  const distinct = new Set(view.subarray(0, 4096)).size;
  check("the upload body is 1.5 MB of random bytes (incompressible)", body.byteLength === UPLOAD_BYTES && distinct > 200, String(distinct));
}

/* ------------------------------------------------- the invoke transport */
console.log("\nThe invoke transport — what goes over supabase.functions.invoke:\n");

{
  const seen = [];
  const prevStamp = stampJson("ping");
  const dl = stampJson("download", { bytes: 2048 });
  const invoke = async (name, options) => {
    seen.push({ name, options });
    if (name.endsWith("op=ping")) return { data: { stamp: stampJson("ping") }, error: null };
    if (name.includes("op=download")) return { data: new Blob([downloadBody(2048, dl)]), error: null };
    if (name.endsWith("op=upload")) return { data: { stamp: stampJson("upload", { bytes: 10, timing: "chain" }), bytes: 10, timing: "chain" }, error: null };
    return { data: null, error: null };
  };
  const t = createInvokeTransport(invoke);
  const signal = new AbortController().signal;
  await t.ping(null, signal);
  check("ping: GET connection-test?op=ping, no previous stamp on the first request",
    seen[0].name === "connection-test?op=ping" && seen[0].options.method === "GET" && !("x-prev-stamp" in (seen[0].options.headers ?? {})));
  const got = await t.download(prevStamp, 2048, signal);
  check("download: GET with &bytes=N and the previous stamp in x-prev-stamp (never the query string)",
    seen[1].name === "connection-test?op=download&bytes=2048" && seen[1].options.headers["x-prev-stamp"] === prevStamp && !seen[1].name.includes("prev="));
  check("download: the stamp is the body's tail, not a header", got === dl);
  await t.upload(prevStamp, new ArrayBuffer(10), signal);
  check("upload: POST with the raw bytes as the body", seen[2].options.method === "POST" && seen[2].options.body instanceof ArrayBuffer && seen[2].options.headers["x-prev-stamp"] === prevStamp);
}

{
  // A short download body (the tail does not say the body's length) is retryable.
  const dl = stampJson("download", { bytes: 2048 });
  const t = createInvokeTransport(async () => ({ data: new Blob([downloadBody(1024, dl)]), error: null }));
  let err = null;
  try {
    await t.download(null, 2048, new AbortController().signal);
  } catch (e) {
    err = e;
  }
  check("a download whose tail says more bytes than arrived is refused as short, retryable", err instanceof ConnectionRequestError && err.code === "short_download" && err.retryable);
}

{
  // The function's 400 with a code: not retryable, its words kept.
  const response = { status: 400, clone: () => ({ json: async () => ({ error: "The previous step's record did not add up. Run the test again.", code: "bad_stamp" }) }) };
  const t = createInvokeTransport(async () => ({ data: null, error: { name: "FunctionsHttpError", context: response } }));
  let err = null;
  try {
    await t.ping("x", new AbortController().signal);
  } catch (e) {
    err = e;
  }
  check("a 400 with a code is a refusal: not retryable, the server's words", err instanceof ConnectionRequestError && !err.retryable && err.code === "bad_stamp" && /did not add up/.test(err.message));
  const t2 = createInvokeTransport(async () => ({ data: null, error: { name: "FunctionsFetchError" } }));
  let err2 = null;
  try {
    await t2.ping(null, new AbortController().signal);
  } catch (e) {
    err2 = e;
  }
  check("no answer at all is retryable", err2 instanceof ConnectionRequestError && err2.retryable);

  // A 4xx with no code was never written for an applicant: our own words.
  const bare = (status, body) => createInvokeTransport(async () => ({ data: null, error: { name: "FunctionsHttpError", context: { status, clone: () => ({ json: async () => body }) } } }));
  const caught = async (t) => {
    try {
      await t.ping("x", new AbortController().signal);
    } catch (e) {
      return e;
    }
    return null;
  };
  const unauthorized = await caught(bare(401, { error: "Unauthorized" }));
  check("a 401 'Unauthorized' (the anon key after a lost session) asks them to sign in again, never says 'Unauthorized'", unauthorized instanceof ConnectionRequestError && !/Unauthorized/.test(unauthorized.message) && /Sign in again/.test(unauthorized.message) && !unauthorized.retryable, unauthorized?.message);
  const unknownOp = await caught(bare(400, { error: "Unknown op" }));
  check("a 400 'Unknown op' with no code reads 'The ping was refused.'", unknownOp instanceof ConnectionRequestError && unknownOp.message === "The ping was refused." && !unknownOp.retryable, unknownOp?.message);
}

/* --------------------------------------------------------- the device */
console.log("\nThe device — userAgentData, UA strings, phone or computer:\n");

const UA = {
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  ipadAsMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  linuxChrome: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

{
  const w = parseUserAgent(UA.windowsChrome);
  check("UA: Windows / Chrome 131 (NT 10.0 cannot tell 10 from 11)", w.os === "Windows" && w.osVersion === "10 or 11" && w.browser === "Chrome" && w.browserVersion === "131" && !w.mobile && !w.tablet, JSON.stringify(w));
  const e = parseUserAgent(UA.windowsEdge);
  check("UA: Edge wins over the Chrome token it carries", e.browser === "Edge" && e.browserVersion === "131");
  const m = parseUserAgent(UA.macSafari);
  check("UA: macOS 14.5 / Safari 17.5", m.os === "macOS" && m.osVersion === "14.5" && m.browser === "Safari" && m.browserVersion === "17.5", JSON.stringify(m));
  const f = parseUserAgent(UA.macFirefox);
  check("UA: Firefox on a Mac", f.browser === "Firefox" && f.browserVersion === "130" && f.os === "macOS");
  const a = parseUserAgent(UA.androidChrome);
  check("UA: Android 14 / Chrome, a phone", a.os === "Android" && a.osVersion === "14" && a.browser === "Chrome" && a.mobile && !a.tablet);
  const t = parseUserAgent(UA.androidTablet);
  check("UA: Android without 'Mobile' is a tablet", t.os === "Android" && t.tablet && !t.mobile);
  const i = parseUserAgent(UA.iphone);
  check("UA: iPhone → iOS 17.5 / Safari, a phone", i.os === "iOS" && i.osVersion === "17.5" && i.browser === "Safari" && i.mobile && !i.tablet, JSON.stringify(i));
  const p = parseUserAgent(UA.ipad);
  check("UA: iPad → iPadOS 16.6, a tablet", p.os === "iPadOS" && p.osVersion === "16.6" && p.tablet && !p.mobile, JSON.stringify(p));
  const l = parseUserAgent(UA.linuxChrome);
  check("UA: Linux / Chrome", l.os === "Linux" && l.browser === "Chrome");
  check("UA: an empty string parses to nothing, never throws", parseUserAgent("").os === null && parseUserAgent(undefined).browser === null);
}

const EXTRAS = { screenWidth: 1920, screenHeight: 1080, dpr: 1, cores: 8, memoryGb: 8, maxTouchPoints: 0, language: "en-PH", timezone: "Asia/Manila", connectionType: "wifi" };

{
  const uaData = { brands: [{ brand: "Chromium", version: "131" }, { brand: "Google Chrome", version: "131" }, { brand: "Not_A Brand", version: "24" }], platform: "Windows", mobile: false };
  const high = { platformVersion: "15.0.0", model: "", architecture: "x86", fullVersionList: [{ brand: "Chromium", version: "131.0.6778.86" }, { brand: "Google Chrome", version: "131.0.6778.86" }, { brand: "Not_A Brand", version: "24.0.0.0" }] };
  const d = deviceFromUserAgentData(uaData, high, EXTRAS, UA.windowsChrome);
  check("userAgentData + high entropy: Windows 11 (platformVersion 13+) / Chrome 131, the contract's example device",
    d.os === "Windows" && d.osVersion === "11" && d.browser === "Chrome" && d.browserVersion === "131" && d.screen === "1920×1080" && d.dpr === 1 && d.cores === 8 && d.memoryGb === 8 && d.touch === false && d.language === "en-PH" && d.timezone === "Asia/Manila" && d.connectionType === "wifi" && d.model === null,
    JSON.stringify(d));
  check("the 'Not A Brand' and bare Chromium entries are skipped", deviceFromUserAgentData({ brands: [{ brand: "Not;A=Brand", version: "8" }, { brand: "Chromium", version: "131" }], platform: "Linux" }, null, EXTRAS).browser === "Chromium");
  const ten = deviceFromUserAgentData(uaData, { platformVersion: "10.0.0" }, EXTRAS, UA.windowsChrome);
  check("platformVersion 1–12 is Windows 10", ten.osVersion === "10");
  check("platformVersion 0 is Windows 8 or older", osVersionFromPlatformVersion("Windows", "0.0.0") === "8 or older");
  const noHigh = deviceFromUserAgentData(uaData, null, EXTRAS, UA.windowsChrome);
  check("without the high-entropy values the UA string fills the version in", noHigh.osVersion === "10 or 11" && noHigh.browser === "Chrome");
  const edge = deviceFromUserAgentData({ brands: [{ brand: "Microsoft Edge", version: "131" }, { brand: "Chromium", version: "131" }], platform: "macOS", mobile: false }, { platformVersion: "14.5.0", model: "" }, EXTRAS);
  check("macOS 14.5 / Edge from userAgentData", edge.os === "macOS" && edge.osVersion === "14.5" && edge.browser === "Edge");
  const android = deviceFromUserAgentData({ brands: [{ brand: "Google Chrome", version: "131" }], platform: "Android", mobile: true }, { platformVersion: "14.0.0", model: "Pixel 8" }, { ...EXTRAS, maxTouchPoints: 5, screenWidth: 412, screenHeight: 915 });
  check("Android: the model is kept, touch is true", android.os === "Android" && android.osVersion === "14" && android.model === "Pixel 8" && android.touch === true && android.screen === "412×915");
}

{
  const d = deviceFromUserAgent(UA.macSafari, { ...EXTRAS, cores: null, memoryGb: null, connectionType: null, screenWidth: 1512, screenHeight: 982, dpr: 2 });
  check("UA fallback (Safari): the Safari gaps stay null, never 0", d.os === "macOS" && d.browser === "Safari" && d.cores === null && d.memoryGb === null && d.connectionType === null && d.dpr === 2 && d.screen === "1512×982");
  check("describeDevice: 'macOS 14.5 · Safari 17.5 · 1512×982'", describeDevice(d) === "macOS 14.5 · Safari 17.5 · 1512×982", describeDevice(d));
  check("describeDevice with nothing known says so", describeDevice(deviceFromUserAgent("", {})) === "This device");
}

{
  check("a computer: no mobile flag, no touch", deviceKindOf({ mobile: false, tablet: false, touch: false, shortSide: 1080, os: "Windows" }) === "computer");
  check("userAgentData.mobile → phone", deviceKindOf({ mobile: true, tablet: false, touch: true, shortSide: 412, os: "Android" }) === "phone");
  check("touch with a short side under 768 → phone (the contract's rule)", deviceKindOf({ mobile: null, tablet: false, touch: true, shortSide: 414, os: null }) === "phone");
  check("an iPad that calls itself a Mac (Mac + touch) → tablet", deviceKindOf({ mobile: false, tablet: false, touch: true, shortSide: 834, os: "macOS" }) === "tablet");
  check("the UA says iPad → tablet", deviceKindOf({ mobile: false, tablet: true, touch: true, shortSide: 834, os: "iPadOS" }) === "tablet");
  check("a touch laptop (short side 768 or more) stays a computer", deviceKindOf({ mobile: false, tablet: false, touch: true, shortSide: 768, os: "Windows" }) === "computer");
  check(
    "a Windows 2-in-1 at 150% scaling (1280×720, touch) is a computer, whatever its short side; Firefox (no userAgentData) too; ChromeOS too",
    deviceKindOf({ mobile: false, tablet: false, touch: true, shortSide: 720, os: "Windows" }) === "computer" &&
      deviceKindOf({ mobile: null, tablet: false, touch: true, shortSide: 615, os: "Windows" }) === "computer" &&
      deviceKindOf({ mobile: false, tablet: false, touch: true, shortSide: 600, os: "ChromeOS" }) === "computer",
  );
  check("…while Linux with mobile:false and a short side under 768 (an Android phone asking for the desktop site) stays a phone", deviceKindOf({ mobile: false, tablet: false, touch: true, shortSide: 412, os: "Linux" }) === "phone");
  check("a touch Android with a big screen and no Mobile token → tablet", deviceKindOf({ mobile: false, tablet: false, touch: true, shortSide: 800, os: "Android" }) === "tablet");
}

{
  // readDevice over fake sources: Chromium with high-entropy values granted.
  const r = await readDevice({
    userAgent: UA.windowsChrome,
    userAgentData: {
      brands: [{ brand: "Google Chrome", version: "131" }],
      platform: "Windows",
      mobile: false,
      getHighEntropyValues: async (hints) => (hints.includes("platformVersion") ? { platformVersion: "15.0.0", model: "" } : {}),
    },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    language: "en-PH",
    connection: { effectiveType: "4g", downlink: 10, rtt: 50, type: "wifi" },
    screenWidth: 1920,
    screenHeight: 1080,
    devicePixelRatio: 1,
    timezone: "Asia/Manila",
  });
  check("readDevice: the contract's §5 device, kind computer, the network hint kept aside",
    r.kind === "computer" && r.device.os === "Windows" && r.device.osVersion === "11" && r.device.browser === "Chrome" && r.device.connectionType === "wifi" && r.network?.effectiveType === "4g" && r.network?.rtt === 50,
    JSON.stringify(r));
  const refused = await readDevice({
    userAgent: UA.windowsChrome,
    userAgentData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "Windows", mobile: false, getHighEntropyValues: async () => { throw new Error("no"); } },
    screenWidth: 1366,
    screenHeight: 768,
    maxTouchPoints: 10,
  });
  check("readDevice: high-entropy values refused → the UA string's version; touch laptop stays a computer", refused.device.osVersion === "10 or 11" && refused.kind === "computer" && refused.device.touch === true);
  const twoInOne = await readDevice({
    userAgent: UA.windowsChrome,
    userAgentData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "Windows", mobile: false },
    screenWidth: 1280,
    screenHeight: 720,
    maxTouchPoints: 10,
  });
  const firefoxTouch = await readDevice({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0", screenWidth: 1280, screenHeight: 720, maxTouchPoints: 10 });
  const edge125 = await readDevice({ userAgent: UA.windowsEdge, userAgentData: { brands: [{ brand: "Microsoft Edge", version: "131" }], platform: "Windows", mobile: false }, screenWidth: 1093, screenHeight: 615, maxTouchPoints: 10 });
  check("readDevice on a Windows touch laptop at 150% / 125% scaling (Chrome, Firefox, Edge): a computer, never 'This looks like a phone'", twoInOne.kind === "computer" && firefoxTouch.kind === "computer" && edge125.kind === "computer", JSON.stringify([twoInOne.kind, firefoxTouch.kind, edge125.kind]));
  const phone = await readDevice({ userAgent: UA.iphone, userAgentData: null, screenWidth: 390, screenHeight: 844, maxTouchPoints: 5, devicePixelRatio: 3, language: "en-US" });
  check("readDevice on an iPhone (no userAgentData): phone, iOS 17.5, Safari", phone.kind === "phone" && phone.device.os === "iOS" && phone.device.browser === "Safari" && phone.device.dpr === 3 && phone.network === null);
  const ipad = await readDevice({ userAgent: UA.ipadAsMac, userAgentData: null, screenWidth: 1180, screenHeight: 820, maxTouchPoints: 5 });
  check("readDevice on an iPad calling itself a Mac: tablet", ipad.kind === "tablet" && ipad.device.os === "macOS");
  const tablet = await readDevice({ userAgent: UA.androidTablet, userAgentData: { brands: [{ brand: "Google Chrome", version: "131" }], platform: "Android", mobile: false }, screenWidth: 1600, screenHeight: 2560, maxTouchPoints: 10 });
  check("readDevice on an Android tablet (userAgentData mobile:false, UA without Mobile): tablet", tablet.kind === "tablet");
  const bare = await readDevice({});
  check("readDevice with nothing at all never throws: a computer with every fact null", bare.kind === "computer" && bare.device.os === null && bare.device.touch === null);
}

/* ----------------------------------------------------------- the bars */
console.log("\nThe bars — the step's config, and what an estimate misses:\n");

{
  check("the live job's defaults: 10 / 3 / 200", DEFAULT_BARS.minDownloadMbps === 10 && DEFAULT_BARS.minUploadMbps === 3 && DEFAULT_BARS.maxLatencyMs === 200);
  const b = barsFromConfig({ min_download_mbps: 25, min_upload_mbps: 10, max_latency_ms: 100 });
  check("the step's own numbers are read", b.minDownloadMbps === 25 && b.minUploadMbps === 10 && b.maxLatencyMs === 100);
  const partial = barsFromConfig({ min_download_mbps: "fast", min_upload_mbps: -1 });
  check("a missing or nonsense number falls back to the default, one by one", partial.minDownloadMbps === 10 && partial.minUploadMbps === 3 && partial.maxLatencyMs === 200);
  check("no config at all → the defaults", JSON.stringify(barsFromConfig(null)) === JSON.stringify(DEFAULT_BARS) && JSON.stringify(barsFromConfig([])) === JSON.stringify(DEFAULT_BARS));
  check("camelCase config is read too", barsFromConfig({ minDownloadMbps: 5 }).minDownloadMbps === 5);
  check("28.4 / 9.1 / 42 meets the defaults", barsBelow({ downloadMbps: 28.4, uploadMbps: 9.1, latencyMs: 42 }, DEFAULT_BARS).length === 0);
  check("18.6 / 1.2 / 74 is below on upload only", JSON.stringify(barsBelow({ downloadMbps: 18.6, uploadMbps: 1.2, latencyMs: 74 }, DEFAULT_BARS)) === '["upload"]');
  check("below on everything, in the fixed order", JSON.stringify(barsBelow({ downloadMbps: 1, uploadMbps: 1, latencyMs: 900 }, DEFAULT_BARS)) === '["download","upload","latency"]');
  check("a figure not measured yet is not judged", barsBelow({ downloadMbps: null, uploadMbps: null, latencyMs: null }, DEFAULT_BARS).length === 0);
}

/* ------------------------------------------------------------ the markers */
console.log("\nThe markers — the page's moments on the record, and a run's server figures:\n");

{
  check("the server's figures are read from the reply", JSON.stringify(serverFiguresFromReply({ recorded: true, figures: { downloadMbps: 28.4, uploadMbps: 9.1, latencyMs: 42, jitterMs: 6, meetsBars: true } })) === JSON.stringify({ downloadMbps: 28.4, uploadMbps: 9.1, latencyMs: 42, jitterMs: 6 }));
  check("…and a reply without all four is no figures", serverFiguresFromReply({ figures: null }) === null && serverFiguresFromReply({ figures: { downloadMbps: 1 } }) === null && serverFiguresFromReply(null) === null);

  const calls = [];
  const sender = createMarkerSender(async (name, options) => {
    calls.push({ name, options });
    if (options.body.what === "test_finished") return { data: { recorded: true, figures: { downloadMbps: 28.4, uploadMbps: 9.1, latencyMs: 42, jitterMs: 6 } }, error: null };
    return { data: { recorded: true }, error: null };
  }, { applicationId: "app-1", stepId: "step_connection" });
  sender.mark("computer_answer", { answer: "yes" }, "pg-1:answer:yes");
  await new Promise((r) => setTimeout(r, 0));
  const mark = calls[0];
  check(
    "a marker goes to connection-test?op=event as a POST naming the application, the step, the marker and its key",
    mark?.name === "connection-test?op=event" && mark.options.method === "POST" && mark.options.body.application_id === "app-1" &&
      mark.options.body.step_id === "step_connection" && mark.options.body.what === "computer_answer" && mark.options.body.detail.answer === "yes" &&
      mark.options.body.client_msg_id === "pg-1:answer:yes" && !("stamps" in mark.options.body),
    JSON.stringify(mark),
  );
  const figures = await sender.finishRun({ run: 2, estimate: { downloadMbps: 29, uploadMbps: 9.4, latencyMs: 41 }, stamps: ["a", "b"], key: "pg-1:2:finished" });
  const fin = calls[1];
  check(
    "a finished run sends its stamps and the page's estimate, and gets the server's figures back",
    fin.options.body.what === "test_finished" && JSON.stringify(fin.options.body.stamps) === '["a","b"]' && fin.options.body.detail.run === 2 &&
      fin.options.body.detail.download_mbps === 29 && fin.options.body.detail.latency_ms === 41 && figures?.downloadMbps === 28.4 && figures.jitterMs === 6,
    JSON.stringify(fin),
  );

  const refused = createMarkerSender(async () => ({ data: null, error: { name: "FunctionsHttpError", context: { status: 400 } } }), { applicationId: "a", stepId: "s" });
  check("a refused run is no figures, never a throw", (await refused.finishRun({ run: 1, estimate: { downloadMbps: 1, uploadMbps: 1, latencyMs: 1 }, stamps: [], key: "k" })) === null);
  const thrown = createMarkerSender(async () => { throw new Error("offline"); }, { applicationId: "a", stepId: "s" });
  check("an invoke that throws is no figures too", (await thrown.finishRun({ run: 1, estimate: { downloadMbps: 1, uploadMbps: 1, latencyMs: 1 }, stamps: [], key: "k" })) === null);
  let thrownMark = false;
  try {
    thrown.mark("test_started", { run: 1 }, "k");
    await new Promise((r) => setTimeout(r, 0));
  } catch {
    thrownMark = true;
  }
  check("…and a marker that fails never throws into the page", !thrownMark);
  let abortSeen = false;
  const slow = createMarkerSender((_name, options) => new Promise((resolve) => {
    options.signal.addEventListener("abort", () => { abortSeen = true; resolve({ data: null, error: { name: "AbortError" } }); });
  }), { applicationId: "a", stepId: "s" });
  const late = await slow.finishRun({ run: 1, estimate: { downloadMbps: 1, uploadMbps: 1, latencyMs: 1 }, stamps: [], key: "k", timeoutMs: 20 });
  check("a server that does not answer in time is no figures, and the request is stopped", late === null && abortSeen);
}

/* ------------------------------------------------------ the page source */
console.log("\nThe page keeps to the contract:\n");

{
  const page = await readFile(path.join(ROOT, "src/pages/ConnectionCheckPhase.tsx"), "utf8");
  check("the page runs the chain through the shared runner and the invoke transport", /runConnectionChain\(/.test(page) && /createInvokeTransport\(/.test(page));
  check("the page sends the chosen run through connection-test?op=record", /invoke\("connection-test\?op=record"/.test(page));
  check("the page never writes applications itself for this step", !/from\("applications"\)\s*\.(update|insert|upsert)/.test(page));
  check("the page has no anti-cheat hook (rule 5: nothing to cheat by copying)", !/useTestIntegrity/.test(page) && !/TestRulesCard/.test(page));
  check("the three answers the contract names", /"yes"/.test(page) && /"no_switched"/.test(page) && /"ran_here_anyway"/.test(page));
  check("the escape hatch is on screen", /run it here anyway/.test(page));
  check(`"Run it again" stops at ${MAX_RUNS} runs that can be sent`, /const canRunAgain = sendableRuns\.length < MAX_RUNS;/.test(page) && /\) : canRunAgain \? \(/.test(page));
  check(
    "a run the server refused is marked, never counted toward the limit, and never sent again",
    /refused: said/.test(page) && /const sendableRuns = runs\.filter\(\(r\) => !r\.refused\)/.test(page) && /!!chosen\.refused/.test(page) && /couldn't be saved/.test(page),
  );
  check("after the last run the words never offer one more", /"Pick the run to send\."/.test(page) && /"You can send it as it is — "/.test(page));
  check("a run chip showing the page's own estimate says 'about'", /const approx = r\.server \? "" : "about ";/.test(page));
  check(
    "a Yes is a switch only when an earlier No came from ANOTHER device, carried forward in the page's own hint",
    /earlierNo\.deviceSig !== thisDeviceSig/.test(page) && /prior_answer: "no"/.test(page) && /device_sig: deviceSignature\(reading\)/.test(page) &&
      /h\.device_kind === "phone" \|\| h\.device_kind === "tablet"\) && h\.answer !== "ran_here_anyway"/.test(page),
  );
  check("a No tapped by mistake can be taken back on the same page", /onClick=\{answerOnItAfterAll\}/.test(page) && /I'm on it after all/.test(page));
  check("the result screen says whose numbers these are", /this page's own numbers/.test(page) && /Timed by our server/.test(page));
  check("the result screen shows the server's figures for a run when it has them", /run\.server \?\? run\.estimate/.test(page) && /chosen\.server\s*\?/.test(page));
  check("every moment goes on the record: the device, the answer, each run started and finished", /mark\("device_read"/.test(page) && /mark\("computer_answer"/.test(page) && /mark\("test_started"/.test(page) && /finishRun\(\{/.test(page));
  check("a plain No is on the record too", /markAnswer\("no"\)/.test(page) && /onClick=\{answerNo\}/.test(page));
  check("`record` gets every finished run, the sent one marked (§5's runs counts them all)", /runs: runs\.map\(\(r\) => \(\{/.test(page) && /sent: r\.run === chosen\.run/.test(page));
  check("the realtime topic carries useId()", /channel\(`connection-phase-\$\{id\}-\$\{instanceId\}`\)/.test(page));
  check("the query key is the one useJobs.ts invalidates", /queryKey: \["connection-application", id\]/.test(page));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
