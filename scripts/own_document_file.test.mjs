#!/usr/bin/env node
/**
 * An uploaded document's file only from this project's own documents bucket
 * (supabase/functions/_shared/ownDocumentFile.ts and its page copy
 * src/lib/ownDocumentFile.ts; the Phase 7 security review, round 2, H2): the
 * countersign reads the file from storage and checks it against v1_hash, and
 * the signing view frames nothing else.
 *
 * Run with: node scripts/own_document_file.test.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const { ownDocumentsPath } = await import("../supabase/functions/_shared/ownDocumentFile.ts");

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

const P = "https://yqklrkpptnhubsnijqze.supabase.co";
for (const [url, want] of [
  [`${P}/storage/v1/object/sign/documents/u1/1700000000_offer.pdf?token=abc`, "u1/1700000000_offer.pdf"],
  [`${P}/storage/v1/object/public/documents/u1/a%20b.pdf`, "u1/a b.pdf"],
  [`${P}/storage/v1/object/authenticated/documents/u1/x.pdf`, "u1/x.pdf"],
  [`${P}/storage/v1/object/sign/resumes/u1/x.pdf?token=a`, null],
  [`https://evil.example/storage/v1/object/sign/documents/u1/x.pdf`, null],
  [`${P}.evil.example/storage/v1/object/sign/documents/u1/x.pdf`, null],
  // The address is resolved as a browser would: ".." inside the bucket stays a file in it…
  [`${P}/storage/v1/object/sign/documents/u1/../u2/x.pdf`, "u2/x.pdf"],
  // …and climbing out of it is no documents file at all.
  [`${P}/storage/v1/object/sign/documents/../resumes/u1/x.pdf`, null],
  [`${P}/storage/v1/object/sign/documents/%2e%2e%2fresumes/x.pdf`, null],
  ["javascript:alert(1)", null],
  ["", null],
  [null, null],
]) {
  const got = ownDocumentsPath(url, P);
  check(`${JSON.stringify(url)} → ${JSON.stringify(want)}`, got === want, JSON.stringify(got));
}
check("the page's copy is the server's, byte for byte", read("src/lib/ownDocumentFile.ts") === read("supabase/functions/_shared/ownDocumentFile.ts"));

const signing = read("supabase/functions/document-signing/index.ts");
check("countersign never fetches the sender's address itself", !/fetch\(contentData\.uploadedFileUrl\)/.test(signing));
// The third Phase 7 security review: v1 is the server's, fixed when the applicant signs.
check("signing reads the sender's own upload from the documents bucket by its own path", /const ownPath = ownDocumentsPath\(shownBody\.uploadedFileUrl, Deno\.env\.get\("SUPABASE_URL"\) \?\? ""\);\s*if \(!ownPath \|\| !document\.sender_id \|\| !ownPath\.startsWith\(`\$\{document\.sender_id\}\/`\)\)/.test(signing) && /admin\.storage\.from\("documents"\)\.download\(ownPath\)/.test(signing));
check("…refuses unless the applicant's screen hashed the same thing, and makes that hash v1", /if \(!shownMatches\(payload\.viewedHash, shownHash\)\) \{\s*return errorResponse\("document_changed"/.test(signing) && /v1Hash: shownHash,/.test(signing) && /file_url: document\.file_url,\s*v1_hash: shownHash,/.test(signing));
check("…and keeps a copy of an uploaded file where only the server writes", /\.upload\(sealedOriginalPath\(documentId\), shownBytes/.test(signing));
check("countersign reads only that copy, never the sender's folder, and refuses one that does not hash to v1", /\.download\(sealedOriginalPath\(documentId\)\)/.test(signing) && !/download\(ownPath\)[\s\S]*renderSignedUploadedPdf/.test(signing.slice(signing.indexOf('action === "countersign"'))) && /if \(\(await sha256HexOfBytes\(new Uint8Array\(originalBytes\)\)\) !== reserved\.v1_hash\) \{\s*throw new ChainReconciliationError\(/.test(signing));
check("…and a written letter must still hash to v1", /if \(\(await writtenDocumentHash\(contentData\.content \?\? ""\)\) !== reserved\.v1_hash\) \{\s*throw new ChainReconciliationError\(/.test(signing));
const viewer = read("src/components/documents/SignedDocumentViewer.tsx");
check("the signing view keeps an uploaded address only when it is this project's documents file", /parsed\.uploadedFileUrl && !ownDocumentsPath\(parsed\.uploadedFileUrl, SUPABASE_URL\)\s*\?\s*\{ \.\.\.parsed, uploadedFileUrl: undefined \}/.test(viewer));

const sheet = read("src/components/documents/ApplicantDocumentSheet.tsx");
const panel = read("src/components/documents/DocumentSigningPanel.tsx");
check("the letter screen signs with the hash of the letter it shows", /const viewedHash = await generateV1Hash\(body\?\.content \?\? ""\);/.test(sheet) && /action: "sign",[^}]*\},\s*signerContext, viewedHash \}/.test(sheet));
check("the file screen frames the very bytes it hashed, and the panel signs with that hash", /setShownPdf\(\{ src: blobUrl, hash \}\)/.test(viewer) && /src=\{shownPdf\.src\}/.test(viewer) && !/src=\{uploadedSrc\}/.test(viewer) && /viewedHash=\{viewedHash\}/.test(viewer) && /\{ viewedHash \}\),/.test(panel) && /mode === "sign" \? !!viewedHash/.test(panel));
const verify = read("supabase/functions/verify-document/index.ts");
check("/verify says verified only for a document signed by both and finalized (locked, final PDF and v3 hashes), never pending or declined", /const isComplete = document\.status === 'signed' && document\.is_locked === true && !!document\.final_pdf_hash && !!document\.v3_hash;\s*const verified = isComplete && !document\.is_voided;/.test(verify) && /This document has not been signed by everyone yet\./.test(verify) && /This document was declined\./.test(verify));

// The server's hash of a written letter is the browser's generateV1Hash, so an
// honest letter's v1 is unchanged by the signing and the applicant's screen
// agrees with the server (_shared/documentShown.ts).
{
  const { build } = await import("esbuild");
  const out = await build({
    stdin: { contents: 'export { generateV1Hash } from "./src/lib/documentHash.ts"; export { writtenDocumentHash, shownMatches, sealedOriginalPath } from "./supabase/functions/_shared/documentShown.ts";', resolveDir: ROOT, loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent",
    // documentHash.ts imports the app's Supabase client for its other helpers.
    plugins: [{ name: "no-client", setup(b) {
      b.onResolve({ filter: /^@\/integrations\/supabase\/client$/ }, () => ({ path: "client", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const SUPABASE_URL = ''; export const SUPABASE_ANON_KEY = ''; export const supabase = {};", loader: "js" }));
    } }],
  });
  const H = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
  const letters = ["Dear Ana,\n\nWe are pleased to offer you the role.", "Salary: ₱25,000 a month — start Monday. “Welcome”, Ñoño!", ""];
  const same = await Promise.all(letters.map(async (t) => (await H.generateV1Hash(t)) === (await H.writtenDocumentHash(t))));
  check("the server's hash of a letter is the browser's v1 (peso sign, curly quotes, ñ, empty)", same.every(Boolean), JSON.stringify(same));
  const h = await H.writtenDocumentHash("x");
  check("…the screen's hash must match exactly (any case), and nothing else passes", H.shownMatches(h, h) && H.shownMatches(h.toUpperCase(), h) && !H.shownMatches(undefined, h) && !H.shownMatches("", h) && !H.shownMatches(h.slice(1), h) && !H.shownMatches({ toString: () => h }, h));
  check("…and the kept copy lives under documents/<id>/, which no business's own folder reaches", H.sealedOriginalPath("abc") === "documents/abc/original.pdf");
}

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
