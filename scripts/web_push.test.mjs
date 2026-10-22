#!/usr/bin/env node
/**
 * Web Push, proven (2026-10-21; supabase/functions/_shared/webPushCrypto.ts
 * and webPush.ts, docs/PUSH-NOTIFICATIONS.md).
 *
 * The same TypeScript the edge functions run is imported here, and checked
 * three independent ways:
 *
 *   1. The worked example in RFC 8291 section 5: fixed keys, fixed salt, and
 *      the exact bytes the RFC says come out.
 *   2. A round trip through a SEPARATE implementation: the "phone" side below
 *      is written with node:crypto (createECDH, hand-built HKDF from HMAC,
 *      aes-128-gcm), not WebCrypto, so a mistake in how the sender chains
 *      HKDF would not cancel out. It decrypts what encryptPayload produced
 *      for a freshly generated device key pair.
 *   3. The VAPID token (RFC 8292): header, claims and the ES256 signature
 *      are verified against the public key we publish.
 *
 * Then the sending around it: headers, retries, which answers delete a
 * device, refusing an address that is not a browser push service, and the
 * once-only creation of the sender key pair.
 *
 * Run with: node scripts/web_push.test.mjs
 */
import { createECDH, createHmac, createDecipheriv, verify as nodeVerify } from "node:crypto";
import {
  b64urlDecode,
  b64urlEncode,
  encryptPayload,
  generateVapidKeyPair,
  isAllowedPushEndpoint,
  MAX_PAYLOAD_BYTES,
  sendWebPush,
  vapidAuthorization,
} from "../supabase/functions/_shared/webPushCrypto.ts";
import { getVapidKeys, pushPayload, pushToDevices, VAPID_SUBJECT } from "../supabase/functions/_shared/webPush.ts";

let passed = 0;
let failed = 0;
function check(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
const text = (bytes) => new TextDecoder().decode(bytes);
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/* ------------------------------------------------ 1. the RFC 8291 example */

console.log("-- RFC 8291 section 5 worked example --");
{
  const rfc = {
    plaintext: "When I grow up, I want to be a watermelon",
    asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
    asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
    uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    auth: "BTBZMqHH6r4Tts7J_aSIgg",
    salt: "DGv6ra1nlYgDCS1FRnbzlw",
    body:
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
  };
  const asPublic = b64urlDecode(rfc.asPublic);
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: rfc.asPrivate, x: b64urlEncode(asPublic.slice(1, 33)), y: b64urlEncode(asPublic.slice(33, 65)) },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const body = await encryptPayload(new TextEncoder().encode(rfc.plaintext), { p256dh: rfc.uaPublic, auth: rfc.auth }, {
    salt: b64urlDecode(rfc.salt),
    ephemeral: { privateKey, publicKeyRaw: asPublic },
  });
  check("the encrypted body is byte for byte the RFC's", b64urlEncode(body) === rfc.body, b64urlEncode(body));
}

/* --------------------------------- 2. round trip through a second maker */

console.log("-- round trip (node:crypto phone) --");

function hkdfExtract(salt, ikm) {
  return createHmac("sha256", salt).update(ikm).digest();
}
function hkdfExpand(prk, info, length) {
  let out = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  for (let i = 1; out.length < length; i++) {
    block = createHmac("sha256", prk).update(Buffer.concat([block, info, Buffer.from([i])])).digest();
    out = Buffer.concat([out, block]);
  }
  return out.subarray(0, length);
}

/** What a browser does with a push message: RFC 8188 + 8291 section 4, from the phone's side. */
function phoneDecrypt(body, phone) {
  const salt = Buffer.from(body.subarray(0, 16));
  const recordSize = Buffer.from(body.subarray(16, 20)).readUInt32BE(0);
  const idLen = body[20];
  const asPublic = Buffer.from(body.subarray(21, 21 + idLen));
  const ciphertext = Buffer.from(body.subarray(21 + idLen));
  const ecdhSecret = phone.ecdh.computeSecret(asPublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), phone.ecdh.getPublicKey(), asPublic]);
  const ikm = hkdfExpand(hkdfExtract(phone.auth, ecdhSecret), keyInfo, 32);
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdfExpand(prk, Buffer.from("Content-Encoding: nonce\0"), 12);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const record = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  // Strip padding: everything after the last 0x02 or 0x01 delimiter.
  let end = record.length - 1;
  while (end >= 0 && record[end] === 0) end--;
  return { recordSize, idLen, delimiter: record[end], message: record.subarray(0, end).toString("utf8") };
}

function newPhone() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16)));
  return { ecdh, auth, target: { p256dh: b64urlEncode(ecdh.getPublicKey()), auth: b64urlEncode(auth) } };
}

{
  const phone = newPhone();
  const message = JSON.stringify({ title: "New applicant", body: "Maria finished the typing test — é你好 🚀", url: "https://hireflownow.com/applicants/abc", tag: "n-1" });
  const body = await encryptPayload(new TextEncoder().encode(message), phone.target);
  const got = phoneDecrypt(body, phone);
  check("the phone reads back exactly what was sent (with accents and an emoji)", got.message === message);
  check("one record, delimiter 0x02, record size 4096, sender key 65 bytes", got.delimiter === 2 && got.recordSize === 4096 && got.idLen === 65);
  check("body is salt+header+key+message+1+16", body.length === 16 + 4 + 1 + 65 + new TextEncoder().encode(message).length + 1 + 16);

  const again = await encryptPayload(new TextEncoder().encode(message), phone.target);
  check("a second send uses a fresh salt and sender key", b64urlEncode(again) !== b64urlEncode(body) && !same(again.slice(0, 16), body.slice(0, 16)) && !same(again.slice(21, 86), body.slice(21, 86)));
  check("and still decrypts", phoneDecrypt(again, phone).message === message);

  const other = newPhone();
  let leaked = true;
  try {
    phoneDecrypt(body, other);
  } catch {
    leaked = false;
  }
  check("another device cannot read it", !leaked);

  const biggest = "x".repeat(MAX_PAYLOAD_BYTES);
  const full = await encryptPayload(new TextEncoder().encode(biggest), phone.target);
  check(`the largest message (${MAX_PAYLOAD_BYTES} bytes) fits a 4096-byte body and decrypts`, full.length === 4096 && phoneDecrypt(full, phone).message === biggest, String(full.length));
  let tooBig = false;
  try {
    await encryptPayload(new TextEncoder().encode("x".repeat(MAX_PAYLOAD_BYTES + 1)), phone.target);
  } catch {
    tooBig = true;
  }
  check("one byte more is refused rather than sent truncated", tooBig);

  for (const [label, target] of [
    ["a short p256dh", { p256dh: b64urlEncode(new Uint8Array(33)), auth: phone.target.auth }],
    ["a p256dh that is not an uncompressed point", { p256dh: b64urlEncode(new Uint8Array(65)), auth: phone.target.auth }],
    ["a 15-byte auth secret", { p256dh: phone.target.p256dh, auth: b64urlEncode(new Uint8Array(15)) }],
    ["garbage instead of base64", { p256dh: "***", auth: phone.target.auth }],
  ]) {
    let refused = false;
    try {
      await encryptPayload(new TextEncoder().encode("x"), target);
    } catch {
      refused = true;
    }
    check(`refused: ${label}`, refused);
  }
}

/* -------------------------------------------------------- 3. the VAPID token */

console.log("-- VAPID (RFC 8292) --");
{
  const keys = await generateVapidKeyPair();
  const raw = b64urlDecode(keys.publicKey);
  check("the public key is a 65-byte uncompressed P-256 point", raw.length === 65 && raw[0] === 4);
  check("the stored private key carries only kty, crv, x, y, d", Object.keys(keys.privateJwk).sort().join() === "crv,d,kty,x,y");

  const endpoint = "https://fcm.googleapis.com/fcm/send/abc123";
  const now = Date.UTC(2026, 9, 21, 12, 0, 0);
  const header = await vapidAuthorization(endpoint, keys, VAPID_SUBJECT, now);
  const match = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
  check("the header is `vapid t=<jwt>, k=<key>`", !!match, header.slice(0, 60));
  const [, h, c, s, k] = match;
  const jwtHeader = JSON.parse(text(b64urlDecode(h)));
  const claims = JSON.parse(text(b64urlDecode(c)));
  check("JWT header is {typ: JWT, alg: ES256}", jwtHeader.typ === "JWT" && jwtHeader.alg === "ES256" && Object.keys(jwtHeader).length === 2);
  check("aud is the push service's origin, not the full address", claims.aud === "https://fcm.googleapis.com");
  check("sub is the contact address", claims.sub === "mailto:notifications@hireflownow.com");
  check("exp is within 24 hours and in the future", claims.exp > now / 1000 && claims.exp - now / 1000 <= 24 * 3600, String(claims.exp - now / 1000));
  check("k is our published public key", k === keys.publicKey);
  const sig = Buffer.from(b64urlDecode(s));
  check("the signature is 64 bytes (r||s, as a JWS wants)", sig.length === 64);
  const publicJwk = { kty: "EC", crv: "P-256", x: keys.privateJwk.x, y: keys.privateJwk.y };
  const good = nodeVerify("sha256", Buffer.from(`${h}.${c}`), { key: publicJwk, format: "jwk", dsaEncoding: "ieee-p1363" }, sig);
  check("the ES256 signature verifies against the public key (node:crypto)", good);
  const tampered = nodeVerify("sha256", Buffer.from(`${h}.${c}x`), { key: publicJwk, format: "jwk", dsaEncoding: "ieee-p1363" }, sig);
  check("and fails if a claim is changed", !tampered);
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(b64urlDecode(keys.privateJwk.x)), Buffer.from(b64urlDecode(keys.privateJwk.y))]);
  check("the published key is the private key's own point", same(point, raw));
  const mozilla = await vapidAuthorization("https://updates.push.services.mozilla.com/wpush/v2/xyz", keys, VAPID_SUBJECT, now);
  const mozClaims = JSON.parse(text(b64urlDecode(/t=[\w-]+\.([\w-]+)\./.exec(mozilla)[1])));
  check("each push service gets a token for its own origin", mozClaims.aud === "https://updates.push.services.mozilla.com");
}

/* ------------------------------------------------------------- endpoints */

console.log("-- which addresses may be called --");
for (const ok of [
  "https://fcm.googleapis.com/fcm/send/abc",
  "https://fcm.googleapis.com/wp/abc",
  "https://updates.push.services.mozilla.com/wpush/v2/abc",
  "https://web.push.apple.com/QGx",
  "https://wns2-par02p.notify.windows.com/w/?token=abc",
]) check(`allowed: ${ok.slice(8, 50)}`, isAllowedPushEndpoint(ok));
for (const bad of [
  "http://fcm.googleapis.com/fcm/send/abc",
  "https://fcm.googleapis.com.evil.example/x",
  "https://evil.example/fcm.googleapis.com",
  "https://notify.windows.com/x",
  "https://169.254.169.254/latest/meta-data/",
  "https://localhost/x",
  "https://user:pw@fcm.googleapis.com/x",
  "https://fcm.googleapis.com:8443/x",
  "https://web.push.apple.com.attacker.io/x",
  "javascript:alert(1)",
  "",
  null,
  undefined,
  42,
  "https://fcm.googleapis.com/" + "a".repeat(2100),
]) check(`refused: ${JSON.stringify(bad)?.slice(0, 50)}`, !isAllowedPushEndpoint(bad));

/* ------------------------------------------------------------- sendWebPush */

console.log("-- sending --");
{
  const keys = await generateVapidKeyPair();
  const phone = newPhone();
  const endpoint = "https://web.push.apple.com/QGxyz";
  const target = { endpoint, ...phone.target };
  const calls = [];
  const replyWith = (...statuses) => async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status: statuses[Math.min(calls.length - 1, statuses.length - 1)] });
  };

  const status = await sendWebPush(target, { title: "Hi", body: "There" }, keys, VAPID_SUBJECT, { fetchImpl: replyWith(201) });
  const call = calls[0];
  check("returns the push service's status (201)", status === 201);
  check("POSTs to the subscription's address", call.url === endpoint && call.init.method === "POST");
  check("Content-Encoding is aes128gcm", call.init.headers["Content-Encoding"] === "aes128gcm");
  check("TTL is a day and urgency is high", call.init.headers.TTL === "86400" && call.init.headers.Urgency === "high");
  check("Authorization is a VAPID header for this origin", /^vapid t=.+, k=.+$/.test(call.init.headers.Authorization));
  check("redirects are not followed", call.init.redirect === "manual");
  check("the body is the encrypted message and the phone reads it", phoneDecrypt(call.init.body, phone).message === JSON.stringify({ title: "Hi", body: "There" }));

  calls.length = 0;
  check("410 is returned as 410 (the caller deletes the device)", (await sendWebPush(target, "x", keys, VAPID_SUBJECT, { fetchImpl: replyWith(410) })) === 410 && calls.length === 1);
  calls.length = 0;
  check("404 is returned as 404", (await sendWebPush(target, "x", keys, VAPID_SUBJECT, { fetchImpl: replyWith(404) })) === 404 && calls.length === 1);
  calls.length = 0;
  check("403 (a rejected sender) is returned and not retried", (await sendWebPush(target, "x", keys, VAPID_SUBJECT, { fetchImpl: replyWith(403) })) === 403 && calls.length === 1);
  calls.length = 0;
  check("a 503 is tried once more and the second answer is returned", (await sendWebPush(target, "x", keys, VAPID_SUBJECT, { fetchImpl: replyWith(503, 201) })) === 201 && calls.length === 2);
  calls.length = 0;
  check("two 503s give up with 503", (await sendWebPush(target, "x", keys, VAPID_SUBJECT, { fetchImpl: replyWith(503, 503) })) === 503 && calls.length === 2);
  calls.length = 0;
  const unreachable = async () => {
    calls.push(1);
    throw new Error("network down");
  };
  check("no answer at all is 0, after one retry", (await sendWebPush(target, "x", keys, VAPID_SUBJECT, { fetchImpl: unreachable })) === 0 && calls.length === 2);
  calls.length = 0;
  check("an address that is not a push service is 400 and never fetched", (await sendWebPush({ ...target, endpoint: "https://169.254.169.254/x" }, "x", keys, VAPID_SUBJECT, { fetchImpl: replyWith(201) })) === 400 && calls.length === 0);
}

/* ------------------------------------------ the sender key pair, once only */

console.log("-- the sender key pair (getVapidKeys) --");

/** A one-table stand-in for the service-role client: select().eq().maybeSingle(), upsert(ignoreDuplicates), update().in(), delete().in(). */
function fakeAdmin(seed = {}) {
  const tables = { push_vapid_keys: [], push_subscriptions: [], ...seed };
  const log = { upserts: 0, deletes: [], updates: [] };
  return {
    tables,
    log,
    from(name) {
      const rows = (tables[name] ??= []);
      const q = {
        _filter: [],
        select() {
          return q;
        },
        eq(col, val) {
          q._filter.push([col, val]);
          return q;
        },
        in(col, vals) {
          q._filter.push([col, vals]);
          return q._run();
        },
        _match(row) {
          return q._filter.every(([c, v]) => (Array.isArray(v) ? v.includes(row[c]) : row[c] === v));
        },
        _run() {
          if (q._op === "delete") {
            const gone = rows.filter(q._match);
            log.deletes.push(...gone.map((r) => r.id));
            tables[name] = rows.filter((r) => !gone.includes(r));
          } else if (q._op === "update") {
            const hit = rows.filter(q._match);
            hit.forEach((r) => Object.assign(r, q._patch));
            log.updates.push(...hit.map((r) => r.id));
          }
          return Promise.resolve({ error: null });
        },
        async maybeSingle() {
          await new Promise((r) => setTimeout(r, 2)); // let racing callers interleave
          return { data: rows.find(q._match) ?? null, error: null };
        },
        async upsert(row, opts) {
          await new Promise((r) => setTimeout(r, 2));
          log.upserts++;
          const exists = rows.some((r) => r.id === row.id);
          if (!exists) rows.push({ ...row });
          else if (!opts?.ignoreDuplicates) Object.assign(rows.find((r) => r.id === row.id), row);
          return { error: null };
        },
        update(patch) {
          q._op = "update";
          q._patch = patch;
          return q;
        },
        delete() {
          q._op = "delete";
          return q;
        },
      };
      return q;
    },
  };
}

{
  const admin = fakeAdmin();
  const [a, b, c] = await Promise.all([getVapidKeys(admin), getVapidKeys(admin), getVapidKeys(admin)]);
  check("three simultaneous first calls all get the SAME key pair", a.publicKey === b.publicKey && b.publicKey === c.publicKey && a.privateJwk.d === c.privateJwk.d);
  check("exactly one pair is stored", admin.tables.push_vapid_keys.length === 1 && admin.tables.push_vapid_keys[0].id === 1);
  check("the stored public key is the one handed out", admin.tables.push_vapid_keys[0].public_key === a.publicKey);
  const later = await getVapidKeys(admin);
  check("a later call reads the stored pair and creates nothing", later.publicKey === a.publicKey && admin.log.upserts === 3, String(admin.log.upserts));
  const jwtOk = (await vapidAuthorization("https://fcm.googleapis.com/x", later, VAPID_SUBJECT)).startsWith("vapid t=");
  check("the stored private key signs", jwtOk);

  const broken = fakeAdmin();
  broken.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'relation "push_vapid_keys" does not exist' } }) }) }) });
  let message = "";
  try {
    await getVapidKeys(broken);
  } catch (e) {
    message = e.message;
  }
  check("a missing table is an error the caller can log, not a silent empty key", /could not read the sender keys/.test(message), message);
}

/* ------------------------------------------- pushToDevices bookkeeping */

console.log("-- sending to a person's devices (pushToDevices) --");
{
  const keys = await generateVapidKeyPair();
  const live = newPhone();
  const gone = newPhone();
  const flaky = newPhone();
  const row = (id, phone, endpoint) => ({ id, endpoint, p256dh: phone.target.p256dh, auth: phone.target.auth });
  const rows = [
    row("live", live, "https://fcm.googleapis.com/fcm/send/live"),
    row("gone", gone, "https://updates.push.services.mozilla.com/wpush/v2/gone"),
    row("flaky", flaky, "https://web.push.apple.com/flaky"),
    row("evil", live, "https://169.254.169.254/latest"),
    { id: "nokeys", endpoint: "https://fcm.googleapis.com/fcm/send/nokeys", p256dh: null, auth: null },
    { id: "badkey", endpoint: "https://fcm.googleapis.com/fcm/send/badkey", p256dh: "###", auth: "###" },
  ];
  const admin = fakeAdmin({ push_subscriptions: rows.map((r) => ({ ...r })) });
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init });
    if (url.endsWith("/live")) return new Response(null, { status: 201 });
    if (url.endsWith("/gone")) return new Response(null, { status: 410 });
    return new Response(null, { status: 429 });
  };
  const savedSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, _ms, ...rest) => savedSetTimeout(fn, 0, ...rest); // skip the retry pause
  let result;
  try {
    result = await pushToDevices(admin, rows, { title: "New applicant", body: "Maria applied", url: "https://hireflownow.com/applicants/1", tag: "n1" }, keys);
  } finally {
    globalThis.fetch = realFetch;
    globalThis.setTimeout = savedSetTimeout;
  }
  const left = admin.tables.push_subscriptions.map((r) => r.id).sort();
  check("one sent, one failed for now, four removed", result.sent === 1 && result.failed === 1 && result.removed === 4, JSON.stringify(result));
  check("the answered-410 device, the foreign address, and the rows with no usable keys are deleted", ["gone", "evil", "nokeys", "badkey"].every((id) => !left.includes(id)), left.join());
  check("a device that only failed for now is kept", left.includes("flaky") && left.includes("live"));
  check("a success is stamped with last_success_at", typeof admin.tables.push_subscriptions.find((r) => r.id === "live")?.last_success_at === "string");
  check("a failure is not stamped", admin.tables.push_subscriptions.find((r) => r.id === "flaky")?.last_success_at === undefined);
  check("the foreign address was never called", !seen.some((s) => s.url.includes("169.254")));
  const phoneReads = JSON.parse(phoneDecrypt(seen.find((s) => s.url.endsWith("/live")).init.body, live).message);
  check("the phone gets title, body, url and tag", phoneReads.title === "New applicant" && phoneReads.body === "Maria applied" && phoneReads.url === "https://hireflownow.com/applicants/1" && phoneReads.tag === "n1");
}

console.log("-- the message (pushPayload) --");
{
  const long = pushPayload({ title: "t".repeat(500), body: "b".repeat(5000), url: "https://hireflownow.com/x", tag: "id" });
  check("title and body are clipped so a push always fits one record", long.title.length === 120 && long.body.length === 400);
  check("a link is optional", !("url" in pushPayload({ title: "a", body: "b" })) && !("url" in pushPayload({ title: "a", body: "b", url: null })));
  check("an empty title becomes HireFlow", pushPayload({ title: "", body: "b" }).title === "HireFlow");
  const worst = new TextEncoder().encode(JSON.stringify(pushPayload({ title: "你".repeat(500), body: "🚀".repeat(500), url: "https://hireflownow.com/" + "a".repeat(600), tag: "t".repeat(100) }))).length;
  check("even the widest characters stay under the 3993-byte limit", worst <= MAX_PAYLOAD_BYTES, String(worst));
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
