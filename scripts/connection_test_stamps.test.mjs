#!/usr/bin/env node
/**
 * Proof for supabase/functions/_shared/connectionStamps.ts (docs/EQUIPMENT-CHECK.md
 * §4 and §7): the signed stamps of the computer and connection check and the
 * three figures `record` computes from a chain of them. Plain assertions, no
 * framework, the REAL module (no copy), the way trusted_results_logic.test.mjs
 * imports trustedResults.ts.
 *
 *   - stamps sign and verify; an edited field, another secret, a tail that
 *     does not fit, all refused;
 *   - a chain is one chain: a forged, stale, future, foreign, reordered,
 *     reused, start-less, out-of-order (not ping → download → upload) or
 *     header-copy stamp breaks it, and so does a second browser; the refusal
 *     names the first thing wrong;
 *   - a chain with too few pings, downloads or uploads is refused;
 *   - the three figures come from the stamps alone: a worked chain with known
 *     times gives known Mbps (to 0.1) and a known latency and jitter, and
 *     `record` in connection-test reads no figure from the request body;
 *   - only proven intervals count: an upload is timed from the previous
 *     upload's `at` whatever its stream/chain label says (a buffering
 *     gateway's handoff is never the applicant's line), the first upload
 *     closes the downloads and is not counted, and a 0 ms or negative
 *     interval drops that step's bytes with its time;
 *   - where the test ran: every stamp carries the address and a User-Agent
 *     hash, and `record` compares them with its own request (flags, never a
 *     refusal);
 *   - the result shape (§5): bars, meetsBars, below, the device facts kept to
 *     the known keys, the one-line evidence (§6) and the staff flags.
 *
 * Run with: node scripts/connection_test_stamps.test.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  barsBelow,
  buildEquipmentCheckResult,
  chainRefusalText,
  cleanAddress,
  cleanConnectionMarker,
  cleanDevice,
  cleanDeviceKind,
  cleanUsingThisComputer,
  connectionBars,
  connectionEvidenceLine,
  connectionFlags,
  connectionSource,
  decodeStamp,
  DEFAULT_BARS,
  encodeStamp,
  figuresFromChain,
  isStampShape,
  makeNonce,
  makeSecret,
  mbps,
  MIN_STEPS,
  readEquipmentCheckResult,
  readStampTail,
  recordedEquipmentCheck,
  runsFinished,
  sentRunNumber,
  signStamp,
  STAMP_MAX_AGE_MS,
  STAMP_TAIL_BYTES,
  stampTail,
  uploadTiming,
  userAgentHash,
  verifyChain,
  verifyStamp,
} from "../supabase/functions/_shared/connectionStamps.ts";

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

const CANDIDATE = "20000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";
const MB3 = 3 * 1024 * 1024;
const MB1_5 = Math.round(1.5 * 1024 * 1024);

const secret = await makeSecret("service-role-key-for-the-test-only-0000000000");
const otherSecret = await makeSecret("another-service-role-key-000000000000000000");
const HOME_UA = await userAgentHash("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36");
const SCRIPT_UA = await userAgentHash("python-requests/2.32");
const HOME_IP = "112.198.0.17";
const VPS_IP = "2600:1f18:abcd:ef01:2345:6789:abcd:ef01";
/** Every stamp of a chain carries the address and browser it came from, unless a step says otherwise. */
const SOURCE = { ip: HOME_IP, ua: HOME_UA };

/**
 * A chain signed with `secret`, from a timeline of steps, each one
 * `{kind, at, received, bytes?, timing?}` where `received` is when the
 * request that hands back the previous stamp arrived (prev_at).
 */
async function makeChain(steps, candidate = CANDIDATE, key = secret) {
  // `candidate: null` leaves the stamps bound to nobody.
  const chain = [];
  for (const step of steps) {
    const prev = chain[chain.length - 1] ?? null;
    const fields = {
      kind: step.kind,
      nonce: step.nonce ?? makeNonce(),
      at: step.at,
      bytes: step.bytes ?? 0,
      prev_nonce: step.prev_nonce === undefined ? (prev ? prev.nonce : null) : step.prev_nonce,
      prev_at: step.received,
    };
    if (candidate != null) fields.candidate = candidate;
    if (step.timing) fields.timing = step.timing;
    if (step.head) fields.head = true;
    const ip = step.ip === undefined ? SOURCE.ip : step.ip;
    const ua = step.ua === undefined ? SOURCE.ua : step.ua;
    if (ip) fields.ip = ip;
    if (ua) fields.ua = ua;
    chain.push(await signStamp(key, fields));
  }
  return chain;
}

// The worked chain (docs/EQUIPMENT-CHECK.md §4), one minute old:
//   4 pings with round trips 40, 50, 30, 40 ms (median 40, deviations 0, 10, 10, 0: jitter 5),
//   2 downloads of 3 MB taking 1000 ms each: 6,291,456 B × 8 / 2,000,000 µs = 25.165… → 25.2 Mbps,
//   3 uploads: the first (64 KB) closes the last download and is not counted; then
//   two of 1.5 MB, each timed from the PREVIOUS upload's at (600 ms and 900 ms,
//   whatever their stream/chain label says): 3,145,728 B × 8 / 1,500,000 µs = 16.777… → 16.8 Mbps.
const T = Date.now() - 60_000;
const KB64 = 64 * 1024;
const WORKED = [
  { kind: "ping", at: T + 0, received: T - 10 },
  { kind: "ping", at: T + 45, received: T + 40 }, //   ping 1 round trip: (T+40) − (T+0)   = 40
  { kind: "ping", at: T + 100, received: T + 95 }, //  ping 2 round trip: (T+95) − (T+45)  = 50
  { kind: "ping", at: T + 135, received: T + 130 }, // ping 3 round trip: (T+130) − (T+100) = 30
  { kind: "download", at: T + 180, received: T + 175, bytes: MB3 }, // ping 4: (T+175) − (T+135) = 40
  { kind: "download", at: T + 1185, received: T + 1180, bytes: MB3 }, // download 1: (T+1180) − (T+180) = 1000
  { kind: "upload", at: T + 2200, received: T + 2185, bytes: KB64, timing: "stream" }, // download 2: (T+2185) − (T+1185) = 1000; this upload closes it, not counted
  { kind: "upload", at: T + 2800, received: T + 2795, bytes: MB1_5, timing: "chain" }, // upload 1: 2800 − 2200 (previous upload's at) = 600
  { kind: "upload", at: T + 3700, received: T + 3690, bytes: MB1_5, timing: "stream" }, // upload 2: 3700 − 2800 = 900 (the 10 ms since arrival is never used)
];

// ============================================================================
console.log("Stamps sign and verify:\n");
{
  const chain = await makeChain(WORKED);
  check("a stamp has the contract's shape", isStampShape(chain[0]) && chain[0].prev_nonce === null && chain[0].candidate === CANDIDATE);
  check("every stamp of the chain verifies", (await Promise.all(chain.map((s) => verifyStamp(secret, s)))).every(Boolean));
  check("nonces are 16 hex characters and fresh", chain.every((s) => /^[0-9a-f]{16}$/.test(s.nonce)) && new Set(chain.map((s) => s.nonce)).size === chain.length);
  check("the signature is 43 characters of base64url", chain.every((s) => /^[A-Za-z0-9_-]{43}$/.test(s.sig)));
  const edited = { ...chain[4], bytes: chain[4].bytes * 10 };
  check("an edited field (more bytes) fails to verify", !(await verifyStamp(secret, edited)));
  const movedAt = { ...chain[0], at: chain[0].at - 1 };
  check("an edited time fails to verify", !(await verifyStamp(secret, movedAt)));
  const otherCandidate = { ...chain[0], candidate: OTHER };
  check("an edited candidate fails to verify", !(await verifyStamp(secret, otherCandidate)));
  check("another secret does not verify it", !(await verifyStamp(otherSecret, chain[0])));
  check("a stamp with a mangled signature is refused", !(await verifyStamp(secret, { ...chain[0], sig: "A".repeat(43) })));
  check("not a stamp at all: false, no throw", !(await verifyStamp(secret, { kind: "ping" })) && !(await verifyStamp(secret, null)));
  const text = encodeStamp(chain[6]);
  const back = decodeStamp(text);
  check("encode → decode keeps every field, timing included", back && back.nonce === chain[6].nonce && back.timing === "stream" && back.sig === chain[6].sig && (await verifyStamp(secret, back)));
  check("a JSON that is not a stamp decodes to null", decodeStamp('{"kind":"ping"}') === null && decodeStamp("nope") === null && decodeStamp(42) === null);
  const tail = stampTail(chain[4]);
  check(`the body tail is exactly ${STAMP_TAIL_BYTES} bytes, JSON then spaces`, tail.length === STAMP_TAIL_BYTES && tail[tail.length - 1] === 0x20);
  check("the tail reads back as the same stamp", readStampTail(tail)?.nonce === chain[4].nonce && (await verifyStamp(secret, readStampTail(tail))));
  const body = new Uint8Array(1000);
  body.set(tail, body.length - tail.length);
  check("…from the end of a longer body too", readStampTail(body)?.nonce === chain[4].nonce);
  check("a body shorter than the tail has no stamp", readStampTail(new Uint8Array(100)) === null);
  const [head] = await makeChain([{ kind: "download", at: T, received: T - 5, bytes: MB3, head: true }]);
  check("a download's header copy carries head: true and verifies on its own", head.head === true && (await verifyStamp(secret, head)));
  check("the longest real stamp still fits the tail (an IPv6 address and the browser hash included)", (() => {
    try {
      stampTail({ ...chain[4], candidate: "x".repeat(36), prev_nonce: "f".repeat(16), at: 9_999_999_999_999, prev_at: 9_999_999_999_999, bytes: 99_999_999, ip: "ffff:ffff:ffff:ffff:ffff:ffff:255.255.255.255", ua: "f".repeat(16) });
      return true;
    } catch {
      return false;
    }
  })());
  check("every stamp carries the address and the browser hash, and both are signed", chain.every((st) => st.ip === HOME_IP && st.ua === HOME_UA) && !(await verifyStamp(secret, { ...chain[0], ip: VPS_IP })) && !(await verifyStamp(secret, { ...chain[0], ua: SCRIPT_UA })));
  check("the browser hash is 16 hex characters, the same for the same User-Agent", /^[0-9a-f]{16}$/.test(HOME_UA) && HOME_UA === (await userAgentHash("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")) && HOME_UA !== SCRIPT_UA);
  check("an address is kept only when it looks like one ('unknown', prose and long strings are none)", cleanAddress(" 112.198.0.17 ") === "112.198.0.17" && cleanAddress(VPS_IP) === VPS_IP && cleanAddress("unknown") === null && cleanAddress("<script>") === null && cleanAddress("1".repeat(65)) === null && cleanAddress(7) === null);
  check("uploadTiming is a label: under 5 ms from arrival reads 'chain', else 'stream'", uploadTiming(1000, 1004) === "chain" && uploadTiming(1000, 1005) === "stream");
}

// ============================================================================
console.log("\nThe figures come from the stamps alone:\n");
{
  const chain = await makeChain(WORKED);
  const f = figuresFromChain(chain);
  check("ping round trips are read off the next request's arrival", JSON.stringify(f.pings) === JSON.stringify([40, 50, 30, 40]), JSON.stringify(f.pings));
  check("latency is the median round trip (40 ms)", f.latencyMs === 40, String(f.latencyMs));
  check("jitter is the mean deviation from the median (5 ms)", f.jitterMs === 5, String(f.jitterMs));
  check("each download is timed to the next request's arrival", JSON.stringify(f.downloads.map((d) => d.ms)) === "[1000,1000]" && f.downloadBytes === 2 * MB3);
  check("download Mbps = 6,291,456 B × 8 / 2,000,000 µs = 25.2", f.downloadMbps === 25.2, String(f.downloadMbps));
  check("the first upload closes the downloads: its own bytes and time are not counted", f.uploads.length === 2 && f.uploadBytes === 2 * MB1_5);
  check("every upload is timed from the previous upload's at (600, 900 ms), its label kept only as a label", JSON.stringify(f.uploads.map((u) => u.ms)) === "[600,900]" && f.uploads[0].timing === "chain" && f.uploads[1].timing === "stream");
  check("upload Mbps = 3,145,728 B × 8 / 1,500,000 µs = 16.8", f.uploadMbps === 16.8, String(f.uploadMbps));
  check("mbps() rounds to one decimal and is null without time or bytes", mbps(1_000_000, 1000) === 8 && mbps(1_234_567, 777) === 12.7 && mbps(0, 10) === null && mbps(10, 0) === null);

  // A page that delays the next request only makes the connection look slower.
  const slower = await makeChain(WORKED.map((s, i) => (i === 5 ? { ...s, received: s.received + 2000 } : s)));
  const fs = figuresFromChain(slower);
  check("a late next request lowers the download figure, never raises it", fs.downloadMbps < f.downloadMbps, `${fs.downloadMbps} vs ${f.downloadMbps}`);

  // A trailing ping or download has nothing after it and is not counted; a trailing upload is.
  const trailing = await makeChain([...WORKED, { kind: "ping", at: T + 4000, received: T + 3990 }]);
  const ft = figuresFromChain(trailing);
  check("a ping with no request after it is not counted", ft.pings.length === 4 && ft.latencyMs === 40);
  const onlyPings = await makeChain(WORKED.slice(0, 4));
  const fp = figuresFromChain(onlyPings);
  check("no download or upload: those figures are null, not 0 or Infinity", fp.downloadMbps === null && fp.uploadMbps === null && fp.latencyMs === 40);
  const clockSkew = await makeChain(WORKED.map((s, i) => (i === 5 ? { ...s, received: s.received - 5000 } : s)));
  const fk = figuresFromChain(clockSkew);
  check(
    "a negative interval (another worker's clock) is unproven: that download's bytes go with its time, never 3 MB in 0 ms",
    fk.downloads.length === 1 && fk.downloadBytes === MB3 && fk.downloadMs === 1000 && fk.unproven === 1 && fk.downloadMbps === 25.2,
    JSON.stringify([fk.downloads, fk.unproven, fk.downloadMbps]),
  );

  // The reviewer's case: three 3 MB downloads on a real 2 Mbps link
  // (12,583 ms each), one interval skewed to 0. Keeping its bytes would read
  // 3.0 Mbps; dropping bytes and time reads the link as it is.
  const D = 12_583;
  const twoMbps = await makeChain([
    ...WORKED.slice(0, 4),
    { kind: "download", at: T + 180, received: T + 175, bytes: MB3 },
    { kind: "download", at: T + 180 + D + 5, received: T + 180 + D, bytes: MB3 },
    { kind: "download", at: T + 180 + 2 * D + 10, received: T + 180 + D + 5, bytes: MB3 }, // download 2 "took" 0 ms
    { kind: "upload", at: T + 180 + 3 * D + 30, received: T + 180 + 3 * D + 10, bytes: KB64 },
    { kind: "upload", at: T + 180 + 3 * D + 900, received: T + 180 + 3 * D + 40, bytes: MB1_5 },
  ]);
  check("…so a 2 Mbps link with one 0 ms interval still reads 2.0, not 3.0", figuresFromChain(twoMbps).downloadMbps === 2, String(figuresFromChain(twoMbps).downloadMbps));

  // A buffering gateway: the handler starts after the whole body is in, so
  // `at − received` is an internal handoff. Labelled "stream" (6 ms, 12 ms),
  // it must still never be timed as the transfer: a real 0.5 Mbps uplink
  // (25 s for 1.5 MB) reads 0.5, never 2097 or 1048.
  const UP = 25_166;
  const buffered = await makeChain([
    ...WORKED.slice(0, 6),
    { kind: "upload", at: T + 2200, received: T + 2185, bytes: KB64, timing: "chain" },
    { kind: "upload", at: T + 2200 + UP + 6, received: T + 2200 + UP, bytes: MB1_5, timing: "stream" },
    { kind: "upload", at: T + 2200 + 2 * UP + 12, received: T + 2200 + 2 * UP, bytes: MB1_5, timing: "stream" },
  ]);
  const fb = figuresFromChain(buffered);
  check("a buffered upload labelled 'stream' is timed from the previous upload, so 0.5 Mbps reads 0.5", fb.uploadMbps === 0.5 && fb.uploads.every((u) => u.ms > 25_000), JSON.stringify([fb.uploadMbps, fb.uploads]));

  const source = await readFile(path.join(ROOT, "supabase/functions/connection-test/index.ts"), "utf8");
  check(
    "connection-test `record` computes the figures from the verified chain only",
    /figuresFromChain\(verdict\.chain\)/.test(source) && !/payload\.(?:download|upload|latency|figures|results)/i.test(source),
  );
  check("…and the result it writes is the server's (buildEquipmentCheckResult over those figures)", /buildEquipmentCheckResult\(\{\s*figures:\s*\{\s*downloadMbps:\s*figures\.downloadMbps/.test(source));
  check("…with advance \"never\" (this step decides nothing; the auto-mode move is stepMoveOn's)", /advance:\s*"never"/.test(source) && /scheduleStepMoveOn\(record/.test(source));
}

// ============================================================================
console.log("\nverifyChain: one chain, this candidate, under 20 minutes, enough of each step:\n");
{
  const now = Date.now();
  const good = await makeChain(WORKED);
  const ok = await verifyChain(secret, good, { now, candidate: CANDIDATE });
  check("the worked chain verifies, with its counts", ok.ok && ok.counts.ping === 4 && ok.counts.download === 2 && ok.counts.upload === 3, JSON.stringify(ok));
  check("…and says where it came from: one address, one browser", ok.ok && JSON.stringify(ok.source) === JSON.stringify({ addresses: [HOME_IP], ua: HOME_UA }), JSON.stringify(ok.source));
  const asText = await verifyChain(secret, good.map((s) => encodeStamp(s)), { now, candidate: CANDIDATE });
  check("stamps may be sent as their JSON text", asText.ok);

  const refusal = async (stamps, options = {}) => verifyChain(secret, stamps, { now, candidate: CANDIDATE, ...options });

  let r = await refusal([]);
  check("no stamps: no_stamps", !r.ok && r.reason === "no_stamps");
  r = await refusal("not a list");
  check("not a list: no_stamps", !r.ok && r.reason === "no_stamps");
  r = await refusal([...good.slice(0, 3), { kind: "ping" }, ...good.slice(3)]);
  check("an entry that is not a stamp: not_a_stamp, at its index", !r.ok && r.reason === "not_a_stamp" && r.index === 3);
  r = await refusal(good.map((s, i) => (i === 4 ? { ...s, bytes: MB3 * 10 } : s)));
  check("an edited stamp: bad_signature, at its index", !r.ok && r.reason === "bad_signature" && r.index === 4);
  r = await verifyChain(otherSecret, good, { now, candidate: CANDIDATE });
  check("a chain signed by another server: bad_signature", !r.ok && r.reason === "bad_signature" && r.index === 0);

  const swapped = [...good];
  [swapped[1], swapped[2]] = [swapped[2], swapped[1]];
  r = await refusal(swapped);
  check("two stamps out of order: chain_broken, at the first one out of place", !r.ok && r.reason === "chain_broken" && r.index === 1);
  r = await refusal(good.filter((_, i) => i !== 5));
  check("a stamp missing from the middle (a gap): chain_broken", !r.ok && r.reason === "chain_broken" && r.index === 5);
  r = await refusal([...good, good[8]]);
  check("the last stamp sent twice: chain_broken (it does not follow itself)", !r.ok && r.reason === "chain_broken" && r.index === 9);
  const fork = await makeChain([good[0], good[0]].map((s, i) => ({ kind: "ping", at: s.at + i, received: s.prev_at })));
  r = await refusal([...good, ...fork.slice(1)]);
  check("a second chain's stamp appended: chain_broken", !r.ok && r.reason === "chain_broken");

  // A stamp whose nonce repeats an earlier one while still naming the right
  // predecessor: only someone with the secret could make it, and it is still
  // refused (nonce_reused).
  const reused = await makeChain([
    { kind: "ping", at: T, received: T - 10, nonce: "aaaaaaaaaaaaaaaa" },
    { kind: "ping", at: T + 50, received: T + 40, nonce: "aaaaaaaaaaaaaaaa" },
    ...WORKED.slice(2),
  ]);
  r = await refusal(reused);
  check("a nonce used twice: nonce_reused, at the second use", !r.ok && r.reason === "nonce_reused" && r.index === 1);

  const headFirst = await makeChain(WORKED.map((s, i) => (i === 4 ? { ...s, head: true } : s)));
  r = await refusal(headFirst);
  check("a download's header copy in the chain: head_copy (it arrives before the body)", !r.ok && r.reason === "head_copy" && r.index === 4);
  r = await refusal(good.slice(2));
  check("a chain that starts mid-way: not_a_chain_start", !r.ok && r.reason === "not_a_chain_start" && r.index === 0);

  // The contract's order: a ping first, then pings, downloads, uploads. An
  // upload placed first (no predecessor: its whole body arrived before
  // `received`), or anything placed out of order, never verifies.
  const uploadFirst = await makeChain([
    { kind: "upload", at: T + 2, received: T, bytes: MB1_5, timing: "chain" },
    { kind: "upload", at: T + 123, received: T + 120, bytes: 1, timing: "stream" },
    ...WORKED.slice(0, 6).map((st) => ({ ...st, at: st.at + 200, received: st.received + 200 })),
    { kind: "ping", at: T + 1500, received: T + 1495 },
  ]);
  r = await refusal(uploadFirst);
  check("a chain that starts with an upload: out_of_order at 0 (the reviewer's 102 Mbps on a 0.5 Mbps line never verifies)", !r.ok && r.reason === "out_of_order" && r.index === 0, JSON.stringify(r));
  const downloadFirst = await makeChain(WORKED.slice(4).map((st, i) => (i === 0 ? { ...st, received: T + 170 } : st)));
  r = await refusal(downloadFirst);
  check("a chain that starts with a download: out_of_order", !r.ok && r.reason === "out_of_order" && r.index === 0, JSON.stringify(r));
  const pingAfter = await makeChain([...WORKED, { kind: "ping", at: T + 4000, received: T + 3990 }]);
  r = await refusal(pingAfter);
  check("a ping after the uploads: out_of_order at its index", !r.ok && r.reason === "out_of_order" && r.index === 9, JSON.stringify(r));
  const uploadBetween = await makeChain([...WORKED.slice(0, 5), { kind: "upload", at: T + 1190, received: T + 1180, bytes: KB64 }, ...WORKED.slice(5).map((st) => ({ ...st, at: st.at + 20, received: st.received + 20 }))]);
  r = await refusal(uploadBetween);
  check("an upload between two downloads: out_of_order", !r.ok && r.reason === "out_of_order" && r.index === 6, JSON.stringify(r));

  // One browser throughout: two User-Agents in one chain are refused. Two
  // addresses are not (IPv4 and IPv6 can alternate mid-test); the verdict
  // names both so record can flag it.
  const twoBrowsers = await makeChain(WORKED.map((st, i) => (i >= 4 ? { ...st, ua: SCRIPT_UA } : st)));
  r = await refusal(twoBrowsers);
  check("stamps from two browsers: mixed_browsers, at the first one that differs", !r.ok && r.reason === "mixed_browsers" && r.index === 4, JSON.stringify(r));
  const twoAddresses = await makeChain(WORKED.map((st, i) => (i >= 4 ? { ...st, ip: VPS_IP } : st)));
  r = await refusal(twoAddresses);
  check("stamps from two addresses still verify, and the verdict names both", r.ok && JSON.stringify(r.source.addresses) === JSON.stringify([HOME_IP, VPS_IP]), JSON.stringify(r));
  const noAddress = await makeChain(WORKED.map((st) => ({ ...st, ip: null })));
  r = await refusal(noAddress);
  check("a platform that names no address: the chain verifies with no addresses", r.ok && r.source.addresses.length === 0);

  const old = Date.now() - STAMP_MAX_AGE_MS - 1000;
  const stale = await makeChain(WORKED.map((s) => ({ ...s, at: s.at - (T - old), received: s.received - (T - old) })));
  r = await refusal(stale);
  check("a chain older than 20 minutes: stale", !r.ok && r.reason === "stale" && r.index === 0, JSON.stringify(r));
  const staleTail = await makeChain(WORKED.map((s, i) => (i === 7 ? { ...s, at: old } : s)));
  r = await refusal(staleTail);
  check("one stale stamp among fresh ones is enough", !r.ok && r.reason === "stale" && r.index === 7);
  const justFresh = await makeChain(WORKED.map((s) => ({ ...s, at: s.at - (T - (now - STAMP_MAX_AGE_MS + 5000)), received: s.received - (T - (now - STAMP_MAX_AGE_MS + 5000)) })));
  r = await refusal(justFresh);
  check("…and 19 minutes 55 seconds old is still accepted", r.ok, JSON.stringify(r));
  const future = await makeChain(WORKED.map((s, i) => (i === 0 ? { ...s, at: now + 120_000 } : s)));
  r = await refusal(future);
  check("a stamp two minutes from the future: future", !r.ok && r.reason === "future" && r.index === 0);

  const foreign = await makeChain(WORKED, OTHER);
  r = await refusal(foreign);
  check("another candidate's chain: foreign", !r.ok && r.reason === "foreign" && r.index === 0);
  const unbound = await makeChain(WORKED, null);
  r = await refusal(unbound);
  check("a chain bound to nobody: foreign", !r.ok && r.reason === "foreign");
  const mixed = await makeChain(WORKED.slice(0, 7));
  const last = (await makeChain([WORKED[7]], OTHER))[0];
  r = await refusal([...mixed, { ...last, prev_nonce: mixed[6].nonce, sig: (await signStamp(secret, { ...last, prev_nonce: mixed[6].nonce, sig: undefined })).sig }]);
  check("one stamp bound to someone else, mid-chain: foreign, at its index", !r.ok && r.reason === "foreign" && r.index === 7);

  r = await refusal(good.slice(0, 7));
  check(`one upload only: too_few_steps (${MIN_STEPS.upload} needed)`, !r.ok && r.reason === "too_few_steps" && /upload/.test(r.detail), JSON.stringify(r));
  const threePings = await makeChain([WORKED[0], ...WORKED.slice(2)]);
  r = await refusal(threePings);
  check("three pings: too_few_steps", !r.ok && r.reason === "too_few_steps" && /ping/.test(r.detail));
  const oneDownload = await makeChain(WORKED.filter((_, i) => i !== 5));
  r = await refusal(oneDownload);
  check("one download: too_few_steps", !r.ok && r.reason === "too_few_steps" && /download/.test(r.detail));
  const tooMany = await makeChain(Array.from({ length: 65 }, (_, i) => ({ kind: "ping", at: T + i * 10, received: T + i * 10 - 5 })));
  r = await refusal(tooMany);
  check("65 stamps: too_many_steps", !r.ok && r.reason === "too_many_steps");

  check("every refusal has plain words for the page", ["no_stamps", "bad_signature", "stale", "foreign", "too_few_steps", "chain_broken"].every((reason) => /Run (?:it|the test) again/.test(chainRefusalText(reason))));
  check("the order of checks: a bad signature is named before a broken chain", (await refusal(swapped.map((s, i) => (i === 3 ? { ...s, bytes: 1 } : s)))).reason === "bad_signature");
}

// ============================================================================
console.log("\nThe result (docs/EQUIPMENT-CHECK.md §5):\n");
{
  check("the live job's bars are the defaults", DEFAULT_BARS.minDownloadMbps === 10 && DEFAULT_BARS.minUploadMbps === 3 && DEFAULT_BARS.maxLatencyMs === 200);
  const bars = connectionBars({ min_download_mbps: 25, min_upload_mbps: 5, max_latency_ms: 100 });
  check("bars read the step's config", bars.minDownloadMbps === 25 && bars.minUploadMbps === 5 && bars.maxLatencyMs === 100);
  check("a missing, zero or non-numeric bar falls back to the default, each on its own", JSON.stringify(connectionBars({ min_download_mbps: 0, min_upload_mbps: "7", max_latency_ms: 150 })) === JSON.stringify({ minDownloadMbps: 10, minUploadMbps: 3, maxLatencyMs: 150 }));
  check("no config at all: the defaults", JSON.stringify(connectionBars(null)) === JSON.stringify(DEFAULT_BARS));

  const good = { downloadMbps: 28.4, uploadMbps: 9.1, latencyMs: 42, jitterMs: 6 };
  check("meets every bar: below is empty", barsBelow(good, DEFAULT_BARS).length === 0);
  check("below: named in the fixed order download, upload, latency", JSON.stringify(barsBelow({ downloadMbps: 9.9, uploadMbps: 1.2, latencyMs: 201 }, DEFAULT_BARS)) === '["download","upload","latency"]');
  check("exactly on a bar meets it", barsBelow({ downloadMbps: 10, uploadMbps: 3, latencyMs: 200 }, DEFAULT_BARS).length === 0);

  const device = cleanDevice({
    os: "Windows", osVersion: "11", browser: "Chrome", browserVersion: "131", screen: "1920×1080", dpr: 1, cores: 8, memoryGb: 8,
    touch: false, language: "en-PH", timezone: "Asia/Manila", connectionType: "wifi", model: null,
    extra: "dropped", userAgent: "x".repeat(500),
  });
  check("device facts keep the known keys and drop the rest", device.os === "Windows" && device.cores === 8 && device.touch === false && !("extra" in device) && !("userAgent" in device));
  const messy = cleanDevice({ os: "  Win\u0000dows  ", dpr: -1, cores: 99999, memoryGb: "8", touch: "yes", screen: "a".repeat(200) });
  check("messy facts are cleaned: NUL stripped, out-of-range numbers and non-booleans dropped, text capped", messy.os === "Windows" && messy.dpr === null && messy.cores === null && messy.memoryGb === null && messy.touch === null && messy.screen.length === 80);
  check("the computer answer and the device kind accept only the contract's values", cleanUsingThisComputer("ran_here_anyway") === "ran_here_anyway" && cleanUsingThisComputer("maybe") === null && cleanDeviceKind("tablet") === "tablet" && cleanDeviceKind("desktop") === null);

  const SAME = { oneAddress: true, sameAddress: true, sameBrowser: true };
  const result = buildEquipmentCheckResult({
    figures: good, bars: DEFAULT_BARS, runs: 1, usingThisComputer: "yes", deviceKind: "computer", device, measuredAt: "2026-10-05T23:40:00Z", attempt: 1, source: SAME,
  });
  check("the result has the contract's shape", result.measuredBy === "server" && result.meetsBars === true && result.below.length === 0 && result._trusted === true && result.runs === 1 && result.attempt === 1 && result.bars.minDownloadMbps === 10 && JSON.stringify(result.source) === JSON.stringify(SAME));
  check("no `passed`: nothing here declines anyone", !("passed" in result));
  check(
    "the one-line evidence is the contract's §6 line",
    connectionEvidenceLine(result) ===
      "Connection: 28.4 Mbps down, 9.1 up, 42 ms, timed by our server; Windows 11 / Chrome on a 1920×1080 computer; says it is the computer they will use; meets the job's bar (10 down, 3 up, 200 ms).",
    connectionEvidenceLine(result),
  );
  const weak = buildEquipmentCheckResult({
    figures: { downloadMbps: 28, uploadMbps: 1.2, latencyMs: 42, jitterMs: 6 }, bars: DEFAULT_BARS, runs: 3, usingThisComputer: "ran_here_anyway", deviceKind: "phone", device: cleanDevice({ os: "Android", browser: "Chrome" }), measuredAt: "2026-10-05T23:40:00Z", attempt: 2, source: SAME,
  });
  check("below the bar: meetsBars false and the bar named", weak.meetsBars === false && JSON.stringify(weak.below) === '["upload"]');
  check("the evidence line says so, with the shortfall", /below the job's bar: upload 1\.2 Mbps \(asked for 3\)/.test(connectionEvidenceLine(weak)) && /NOT the computer they will use/.test(connectionEvidenceLine(weak)));
  check("the staff flags, one line each", JSON.stringify(connectionFlags(weak)) === JSON.stringify(["Not the computer they'll work from (ran here anyway)", "Ran on a phone", "Sent after 3 runs"]));
  check("a clean result has no flags", connectionFlags(result).length === 0);
  check("a switch to the right computer is what the page asked for: never a flag", connectionFlags({ ...result, usingThisComputer: "no_switched" }).length === 0 && /switched to the computer they will use/.test(connectionEvidenceLine({ ...result, usingThisComputer: "no_switched" })));

  // Where it ran against where it was sent from (§4): the VPS-then-home case.
  const vps = await makeChain(WORKED.map((st) => ({ ...st, ip: VPS_IP, ua: SCRIPT_UA })));
  const vpsVerdict = await verifyChain(secret, vps, { now: Date.now(), candidate: CANDIDATE });
  const fromHome = connectionSource(vpsVerdict.source, { address: HOME_IP, ua: HOME_UA });
  check("a chain run elsewhere and sent from home: different network and browser", vpsVerdict.ok && JSON.stringify(fromHome) === JSON.stringify({ oneAddress: true, sameAddress: false, sameBrowser: false }), JSON.stringify(fromHome));
  const relayed = buildEquipmentCheckResult({ figures: good, bars: DEFAULT_BARS, runs: 1, usingThisComputer: "yes", deviceKind: "computer", device, measuredAt: "2026-10-05T23:40:00Z", attempt: 1, source: fromHome });
  check(
    "…is on the record as two flags the hiring team sees, and in Ava's line",
    JSON.stringify(connectionFlags(relayed)) === JSON.stringify(["Sent from a different network than the test ran on", "Sent from a different browser than the test ran in"]) &&
      /sent from a different network than the test ran on; sent from a different browser than the test ran in\.$/.test(connectionEvidenceLine(relayed)),
    JSON.stringify([connectionFlags(relayed), connectionEvidenceLine(relayed)]),
  );
  check("the same address and browser: no flag", JSON.stringify(connectionSource({ addresses: [HOME_IP], ua: HOME_UA }, { address: HOME_IP, ua: HOME_UA })) === JSON.stringify(SAME));
  const twoNets = connectionSource({ addresses: [HOME_IP, VPS_IP], ua: HOME_UA }, { address: HOME_IP, ua: HOME_UA });
  check("a test from two networks, sent from one of them: one flag", twoNets.oneAddress === false && twoNets.sameAddress === true && JSON.stringify(connectionFlags({ ...result, source: twoNets })) === JSON.stringify(["The test ran from more than one network"]));
  check("no address known on either side: unknown, never a flag", JSON.stringify(connectionSource({ addresses: [], ua: null }, { address: null, ua: HOME_UA })) === JSON.stringify({ oneAddress: null, sameAddress: null, sameBrowser: null }));

  const read = readEquipmentCheckResult(JSON.parse(JSON.stringify(result)));
  check("a stored result reads back whole", read && read.downloadMbps === 28.4 && read.device.timezone === "Asia/Manila" && read.meetsBars === true && read.usingThisComputer === "yes" && read.source.sameAddress === true);
  check("a legacy or partial value without the three figures is not a result", readEquipmentCheckResult({ downloadMbps: 28, measuredBy: "server" }) === null && readEquipmentCheckResult("x") === null && readEquipmentCheckResult(null) === null);
  const partial = readEquipmentCheckResult({ downloadMbps: 5, uploadMbps: 9, latencyMs: 50, measuredBy: "server" });
  check("a result missing bars/below/meetsBars is judged against the defaults", partial && partial.meetsBars === false && JSON.stringify(partial.below) === '["download"]' && partial.deviceKind === "computer");
  check(
    "a value that does not say the server timed it is never turned into one",
    readEquipmentCheckResult({ downloadMbps: 500, uploadMbps: 200, latencyMs: 5 }) === null && readEquipmentCheckResult({ downloadMbps: 500, uploadMbps: 200, latencyMs: 5, measuredBy: "page" }) === null,
  );

  // A reader with the whole notes object wants the server's own marker
  // (recordStepResult's _trusted[stepId]), which no candidate write produces.
  const forgedNotes = { equipmentCheckResult: { downloadMbps: 500, uploadMbps: 200, latencyMs: 5, measuredBy: "server", meetsBars: true, below: [] } };
  check("a forged result with no server marker is not a result (no 'timed by our server' for Ava)", recordedEquipmentCheck(forgedNotes) === null && recordedEquipmentCheck({ ...forgedNotes, _trusted: { step_typing: { stepType: "typing_test" } } }) === null);
  const recordedNotes = { equipmentCheckResult: JSON.parse(JSON.stringify(result)), _trusted: { step_connection: { stepType: "equipment_check", completedAt: "2026-10-05T23:40:00Z" } } };
  check("the server's record, with its marker, reads back", recordedEquipmentCheck(recordedNotes)?.downloadMbps === 28.4 && recordedEquipmentCheck(recordedNotes, ["step_connection"])?.uploadMbps === 9.1);
  check("…and only on the job's own equipment_check step when one is named", recordedEquipmentCheck(recordedNotes, ["step_other"]) === null);
}

// ============================================================================
console.log("\nThe runs and the page's markers (§3, §5): how many, which was sent, what a marker keeps:\n");
{
  check("runs counts every finished run, the sent one included", runsFinished([{ run: 1 }, { run: 2, sent: true }]) === 2 && runsFinished([{ run: 1, sent: true }]) === 1);
  check("…a bare count is read as the count, never below 1", runsFinished(3) === 3 && runsFinished(0) === 1 && runsFinished(undefined) === 1 && runsFinished("3") === 1 && runsFinished(1e9) === 99);
  const three = [{ run: 1 }, { run: 2, sent: true }, { run: 3 }];
  check("the sent run is the one the estimate names", sentRunNumber(three, { run: 3 }, 3) === 3);
  check("…else the one marked sent, else the last", sentRunNumber(three, null, 3) === 2 && sentRunNumber([{ run: 1 }, { run: 2 }], undefined, 2) === 2);
  check("…and never outside 1..runs", sentRunNumber(three, { run: 7 }, 3) === 3 && sentRunNumber([], { run: 0 }, 1) === 1);
  const r3 = buildEquipmentCheckResult({
    figures: { downloadMbps: 28.4, uploadMbps: 9.1, latencyMs: 42, jitterMs: 6 }, bars: DEFAULT_BARS, runs: runsFinished(three), usingThisComputer: "yes", deviceKind: "computer", device: cleanDevice({}), measuredAt: "2026-10-05T23:40:00Z", attempt: 1,
    source: { oneAddress: true, sameAddress: true, sameBrowser: true },
  });
  check("three runs, the second sent: §6's 'Sent after 3 runs'", r3.runs === 3 && JSON.stringify(connectionFlags(r3)) === JSON.stringify(["Sent after 3 runs"]));

  const dev = cleanConnectionMarker("device_read", { device_kind: "computer", device: { os: "Windows", osVersion: "11", browser: "Chrome", browserVersion: "131", screen: "1920×1080", cores: 8 } });
  check(
    "device_read keeps the kind and the three facts the timeline reads, in its words",
    dev && JSON.stringify(dev.detail) === JSON.stringify({ what: "device_read", device_kind: "computer", os: "Windows 11", browser: "Chrome 131", screen: "1920×1080" }),
    JSON.stringify(dev),
  );
  check("computer_answer: the contract's three, and a plain 'no'", cleanConnectionMarker("computer_answer", { answer: "no" })?.detail.answer === "no" && cleanConnectionMarker("computer_answer", { answer: "no_switched" })?.detail.answer === "no_switched" && cleanConnectionMarker("computer_answer", { answer: "maybe" }) === null);
  check("test_started needs a run number", cleanConnectionMarker("test_started", { run: 2 })?.detail.run === 2 && cleanConnectionMarker("test_started", { run: "2" }) === null && cleanConnectionMarker("test_started", {}) === null);
  const fin = cleanConnectionMarker("test_finished", { run: 1, download_mbps: 29.04, upload_mbps: 9.44, latency_ms: 41.4, sneaky: "x" });
  check(
    "test_finished keeps the page's estimate, says it is the page's, and drops anything else",
    fin && fin.detail.download_mbps === 29 && fin.detail.upload_mbps === 9.4 && fin.detail.latency_ms === 41 && fin.detail.estimate === "page" && !("sneaky" in fin.detail),
    JSON.stringify(fin),
  );
  check("…a nonsense figure is kept as unknown, never as a number", cleanConnectionMarker("test_finished", { run: 1, download_mbps: -5, upload_mbps: "fast", latency_ms: Infinity })?.detail.download_mbps === null);
  check("anything else is not a marker (test_run, submitted and record_refused are the server's alone)", cleanConnectionMarker("test_run", {}) === null && cleanConnectionMarker("submitted", {}) === null && cleanConnectionMarker("record_refused", {}) === null && cleanConnectionMarker(undefined, {}) === null);

  const source = await readFile(path.join(ROOT, "supabase/functions/connection-test/index.ts"), "utf8");
  const eventBlock = source.slice(source.indexOf('if (op === "event")'), source.indexOf("const bars = connectionBars(stepConfig(workflowSteps, stepId));"));
  check("connection-test has an `event` op", eventBlock.length > 200);
  check("…which writes only a cleaned marker (cleanConnectionMarker)", /cleanConnectionMarker\(payload\.what, payload\.detail\)/.test(eventBlock));
  check("…never the application: no recordStepResult, no applications write", !/recordStepResult\(/.test(eventBlock) && !/from\("applications"\)/.test(eventBlock));
  check("…and a run's figures only from its verified chain", /verifyChain\(secret, payload\.stamps/.test(eventBlock) && /figuresFromChain\(runVerdict\.chain\)/.test(eventBlock));
  check("…keyed on the chain's first nonce, the same key `record` uses, so a sent run is written once", /srv:test_run:\$\{runVerdict\.chain\[0\]\.nonce\}/.test(eventBlock) && /srv:test_run:\$\{verdict\.chain\[0\]\.nonce\}/.test(source));
  check("`record` names the sent run in a `submitted` marker", /what: "submitted", run: sentRun/.test(source));
  check("`record` stores §5's runs (runsFinished), never the page's count raw", /runsFinished\(payload\.runs\)/.test(source));
  check("…and says in the grading that the page counted them", /runs_counted_by: "page"/.test(source));
  check("every stamp is signed with the request's address and browser hash", /requestSource\(req\)/.test(source) && /ip: input\.source\.ip/.test(source) && /ua: input\.source\.ua/.test(source));
  check("`record` compares them with its own request (connectionSource) and keeps the test's addresses in the grading", /connectionSource\(verdict\.source, \{ address: sender\.ip, ua: sender\.ua \}\)/.test(source) && /testIps: verdict\.source\.addresses/.test(source));
  check("a JSON body is read with a counting reader, never req.text()", /readCappedText\(req, RECORD_BODY_CAP_BYTES\)/.test(source) && !/await req\.text\(\)/.test(source));
  check(
    "with no grading claim (the attempt's record unreadable) a result already on file is answered back, never recorded again",
    /if \(gate\.claim === "none" && !session\) \{[\s\S]{0,400}readStepOnFile\(record, applicationId, stepId, "equipmentCheckResult"\)[\s\S]{0,200}reopenedForRetake/.test(source) &&
      source.indexOf('if (gate.claim === "none" && !session)') < source.indexOf("const verdict = await verifyChain(secret, payload.stamps"),
  );
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
