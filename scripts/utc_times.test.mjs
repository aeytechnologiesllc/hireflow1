#!/usr/bin/env node
/**
 * Times on the signing record are UTC for real (the eighth product review).
 *
 * Every time on the record was the viewer's own clock with "UTC" printed
 * after it (date-fns' format() reads the browser's zone): the applicant in
 * Manila saw "Oct 26, 6:46 AM UTC" and the owner in New York "Oct 25, 6:46 PM
 * UTC" for one signature. src/lib/utcTime.ts reads the instant's UTC parts.
 *
 * This runs the real helpers, and the PDFs the browser makes with them (the
 * certificate and the audit trail), in two child processes, one in Manila
 * and one in New York, and checks both print the same, true UTC text, word
 * for word what the server's final PDF prints (utcStamp in
 * supabase/functions/_shared/renderFinalPdf.ts, run here from its own
 * source). It also checks that no screen or PDF of the record goes back to
 * date-fns with a "UTC" label.
 *
 * Run with: node scripts/utc_times.test.mjs
 */
import { build, transform } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);

// The instants: the server test's own, a few minutes past midnight UTC, and
// the review's signature (22:46Z: already the next morning in Manila).
const AT = ["2026-10-10T19:00:13.875+00:00", "2026-10-10T00:05:00Z", "2026-10-25T22:46:19.120Z", "2026-12-31T23:59:59Z"];

async function loadClient() {
  const bundle = await build({
    stdin: {
      contents:
        'export * from "./src/lib/utcTime.ts";\n' +
        'export { formatAuditTimestamp, formatAuditTimestampTechnical } from "./src/lib/auditFormatting.ts";\n' +
        'export { exportAuditTrailJSON, generateAuditTrailPDF } from "./src/lib/auditExport.ts";\n' +
        'export { generateCertificatePDF } from "./src/lib/certificatePDF.ts";\n' +
        'export { format as dateFnsFormat } from "date-fns";\n',
      resolveDir: ROOT,
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    packages: "external",
    logLevel: "silent",
    plugins: [
      {
        name: "aliases",
        setup(b) {
          b.onResolve({ filter: /^@\// }, async (args) => {
            if (args.path.startsWith("@/integrations/")) return { path: args.path, namespace: "stub" };
            const base = path.join(ROOT, "src", args.path.slice(2));
            for (const suffix of [".ts", ".tsx", "/index.ts"]) {
              const r = await b.resolve(base + suffix, { kind: args.kind, resolveDir: ROOT });
              if (!r.errors.length) return { path: r.path };
            }
            throw new Error(`cannot resolve ${args.path}`);
          });
          b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const supabase = {};", loader: "js" }));
        },
      },
    ],
  });
  // Written next to the repo's node_modules so the external packages resolve.
  const { writeFileSync, rmSync } = await import("node:fs");
  const file = path.join(ROOT, "scripts", `.utc_times.${process.pid}.mjs`);
  writeFileSync(file, bundle.outputFiles[0].text);
  try {
    return await import(file);
  } finally {
    rmSync(file, { force: true });
  }
}

/** The server's own utcStamp, read from its source (the file itself imports pdf-lib from esm.sh). */
async function loadServerStamp() {
  const src = readFileSync(path.join(ROOT, "supabase/functions/_shared/renderFinalPdf.ts"), "utf8");
  const start = src.indexOf("const MONTHS");
  const fnStart = src.indexOf("export function utcStamp(");
  const end = src.indexOf("\n}\n", fnStart) + 3;
  if (start === -1 || fnStart === -1 || end < fnStart) throw new Error("utcStamp not found in renderFinalPdf.ts");
  const { code } = await transform(`${src.slice(start, src.indexOf("\n", start))}\n${src.slice(fnStart, end)}`, { loader: "ts", format: "esm" });
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`)).utcStamp;
}

/** What this process prints, in its own zone. */
async function printed() {
  const lib = await loadClient();
  const serverStamp = await loadServerStamp();
  const out = { zone: Intl.DateTimeFormat().resolvedOptions().timeZone, rows: [] };
  for (const at of AT) {
    out.rows.push({
      at,
      stamp: lib.utcStamp(at),
      stampShort: lib.utcStamp(at, false),
      day: lib.utcDay(at),
      time: lib.utcTime(at),
      technical: lib.utcTechnical(at),
      audit: lib.formatAuditTimestamp(at),
      auditTechnical: lib.formatAuditTimestampTechnical(at),
      server: serverStamp(at),
      serverShort: serverStamp(at, false),
      // The old way, to prove the two zones really differ here.
      dateFns: lib.dateFnsFormat(new Date(at), "PPpp"),
    });
  }
  const at = AT[2];
  const json = JSON.parse(
    lib.exportAuditTrailJSON({
      documentId: "d1", documentCode: "DOC-1", documentName: "Offer", documentType: "offer_letter", status: "signed", completedAt: at,
      v1Hash: null, v2Hash: null, v3Hash: null, finalHash: null,
      entries: [{ id: "e1", action: "candidate_signed", created_at: at }],
    }),
  );
  out.jsonTimestamp = json.auditTrail[0].timestampUTC;
  const auditPdf = lib
    .generateAuditTrailPDF({
      documentId: "d1", documentCode: "DOC-1", documentName: "Offer", documentType: "offer_letter", status: "signed", completedAt: at,
      v1Hash: null, v2Hash: null, v3Hash: null, finalHash: null,
      entries: [{ id: "e1", action: "candidate_signed", created_at: at }],
    })
    .output();
  out.auditPdf = { completed: auditPdf.includes(`(Completed: ${lib.utcStamp(at)})`), row: auditPdf.includes(`(${lib.utcTechnical(at)})`) };
  const cert = await lib.generateCertificatePDF(
    {
      certificate_id: "CERT-1", document_id: "d1", document_name: "Offer", document_type: "offer_letter",
      version_history: { v1: null, v2: null, v3: null },
      candidate_signature: { name: "Ana", email: "ana@example.com", timestamp_utc: at, ip_address: "1.2.3.4", location: { city: "Manila", region: "NCR", country: "PH" }, signature_hash: "h", consent_confirmed_at: at, signing_order_position: 1 },
      employer_signature: { name: "Maria", email: "m@example.com", timestamp_utc: AT[3], signature_hash: "h", consent_confirmed_at: AT[3], review_confirmed_at: AT[3], signing_order_position: 2 },
      signing_order: "candidate_first", signing_order_verified: true,
      final_document_hash: "f", completion_timestamp_utc: AT[3], audit_trail_hash: "a", audit_entries_count: 3, compliance_statement: "c",
    },
    "DOC-1",
  );
  const certText = cert.output();
  out.certificate = {
    completion: certText.includes(`(Completion: ${lib.utcStamp(AT[3])})`),
    applicant: certText.includes(`(Signed: ${lib.utcStamp(at)})`),
    team: certText.includes(`(Signed: ${lib.utcStamp(AT[3])})`),
  };
  return out;
}

if (process.argv[2] === "--child") {
  process.stdout.write(JSON.stringify(await printed()));
  process.exit(0);
}

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) passed += 1;
  else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ""}`);
  }
}
const run = (zone) => JSON.parse(execFileSync(process.execPath, [SELF, "--child"], { cwd: ROOT, env: { ...process.env, TZ: zone }, encoding: "utf8" }));
const manila = run("Asia/Manila");
const newYork = run("America/New_York");

check("the children really ran in Manila and New York", manila.zone === "Asia/Manila" && newYork.zone === "America/New_York", `${manila.zone} / ${newYork.zone}`);
check(
  "…where the old way (date-fns) prints different times for the same instant",
  manila.rows.every((row, i) => row.dateFns !== newYork.rows[i].dateFns),
  manila.rows.map((r, i) => `${r.dateFns} / ${newYork.rows[i].dateFns}`).join("; "),
);

const WANT = [
  { stamp: "October 10, 2026 at 7:00:13 PM UTC", stampShort: "October 10, 2026 at 7:00 PM UTC", day: "October 10, 2026", time: "7:00:13 PM UTC", technical: "2026-10-10 19:00:13 UTC" },
  { stamp: "October 10, 2026 at 12:05:00 AM UTC", stampShort: "October 10, 2026 at 12:05 AM UTC", day: "October 10, 2026", time: "12:05:00 AM UTC", technical: "2026-10-10 00:05:00 UTC" },
  { stamp: "October 25, 2026 at 10:46:19 PM UTC", stampShort: "October 25, 2026 at 10:46 PM UTC", day: "October 25, 2026", time: "10:46:19 PM UTC", technical: "2026-10-25 22:46:19 UTC" },
  { stamp: "December 31, 2026 at 11:59:59 PM UTC", stampShort: "December 31, 2026 at 11:59 PM UTC", day: "December 31, 2026", time: "11:59:59 PM UTC", technical: "2026-12-31 23:59:59 UTC" },
];
for (const [label, out] of [["Manila", manila], ["New York", newYork]]) {
  out.rows.forEach((row, i) => {
    const want = WANT[i];
    for (const key of Object.keys(want)) check(`${label}: ${key} for ${row.at}`, row[key] === want[key], `got  ${JSON.stringify(row[key])}\n     want ${JSON.stringify(want[key])}`);
    check(`${label}: the signing record's long form is the stamp`, row.audit === want.stamp, row.audit);
    check(`${label}: the technical form under "Timestamp (UTC)"`, row.auditTechnical === want.technical, row.auditTechnical);
    check(`${label}: word for word the server's utcStamp (the final PDF)`, row.stamp === row.server && row.stampShort === row.serverShort, `${row.stamp} / ${row.server}`);
  });
  check(`${label}: the exported audit trail's timestampUTC`, out.jsonTimestamp === "2026-10-25 22:46:19 UTC", out.jsonTimestamp);
  check(`${label}: the audit PDF's "Completed" line and its row`, out.auditPdf.completed && out.auditPdf.row, JSON.stringify(out.auditPdf));
  check(`${label}: the certificate PDF's completion and both signatures`, out.certificate.completion && out.certificate.applicant && out.certificate.team, JSON.stringify(out.certificate));
}
check("Manila and New York print the same words", JSON.stringify(manila.rows.map(({ dateFns, ...rest }) => rest)) === JSON.stringify(newYork.rows.map(({ dateFns, ...rest }) => rest)));

// No screen or PDF of the record goes back to date-fns with a "UTC" label,
// and each one reads its times from utcTime.
const RECORD = [
  "src/components/documents/SignedDocumentViewer.tsx",
  "src/components/documents/EmployerReviewPanel.tsx",
  "src/lib/auditExport.ts",
  "src/lib/auditFormatting.ts",
  "src/lib/certificatePDF.ts",
  "src/lib/pdfSignatureBurner.ts",
  "src/pages/VerifyDocument.tsx",
];
for (const rel of RECORD) {
  const src = readFileSync(path.join(ROOT, rel), "utf8");
  check(`${rel}: reads its times from utcTime`, /from ["'](@\/lib|\.)\/utcTime["']/.test(src));
  check(`${rel}: no date-fns format with a "UTC" label`, !/format\([^;\n]*'UTC'/.test(src) && !/format\([^)]*\)\}?\s*\(UTC\)/.test(src));
}
const viewer = readFileSync(path.join(ROOT, "src/components/documents/SignedDocumentViewer.tsx"), "utf8");
check("the viewer formats no time with date-fns at all (every time on it is the record's)", !/from "date-fns"/.test(viewer) && !/\bformat\(new Date/.test(viewer));

console.log(`utc times: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
