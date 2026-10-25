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
check("…reads it from the documents bucket by its own path", /const ownPath = ownDocumentsPath\(contentData\.uploadedFileUrl, Deno\.env\.get\("SUPABASE_URL"\) \?\? ""\);\s*if \(!ownPath\) throw new ChainReconciliationError\(/.test(signing) && /admin\.storage\.from\("documents"\)\.download\(ownPath\)/.test(signing));
check("…only the sender's own upload, with a hash fixed when it was sent", /if \(!reserved\.sender_id \|\| !ownPath\.startsWith\(`\$\{reserved\.sender_id\}\/`\)\) \{\s*throw new ChainReconciliationError\(/.test(signing) && /if \(!reserved\.v1_hash\) throw new ChainReconciliationError\(/.test(signing));
check("…and refuses a file that does not hash to v1", /if \(\(await sha256HexOfBytes\(new Uint8Array\(originalBytes\)\)\) !== reserved\.v1_hash\) \{\s*throw new ChainReconciliationError\(/.test(signing));
const viewer = read("src/components/documents/SignedDocumentViewer.tsx");
check("the signing view keeps an uploaded address only when it is this project's documents file", /parsed\.uploadedFileUrl && !ownDocumentsPath\(parsed\.uploadedFileUrl, SUPABASE_URL\)\s*\?\s*\{ \.\.\.parsed, uploadedFileUrl: undefined \}/.test(viewer));

const verify = read("supabase/functions/verify-document/index.ts");
check("/verify says verified only for a document signed by both and finalized (locked, final PDF and v3 hashes), never pending or declined", /const isComplete = document\.status === 'signed' && document\.is_locked === true && !!document\.final_pdf_hash && !!document\.v3_hash;\s*const verified = isComplete && !document\.is_voided;/.test(verify) && /This document has not been signed by everyone yet\./.test(verify) && /This document was declined\./.test(verify));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
