#!/usr/bin/env node
/**
 * A business's careers address from its name, readably (2026-10-11): the
 * database (slugify_business, supabase/migrations/*_business_names_to_addresses.sql)
 * and the sign-up screen's preview (cleanAddress) make the same address.
 * "Maria's Café" is "marias-cafe", not "maria-s-caf".
 */
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";
import { readdir, readFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => (ok ? passed++ : (failed++, console.log(`FAIL ${name}${detail ? `  (${detail})` : ""}`)));

const names = (await readdir(path.join(ROOT, "supabase/migrations"))).filter((n) => /_business_names_to_addresses\.sql$/.test(n));
check("the migration exists once", names.length === 1);
const db = new PGlite();
await db.exec(await readFile(path.join(ROOT, "supabase/migrations", names[0]), "utf8"));
// The later fix (20261011184000): never a dash at the end after the cut.
const tidy = (await readdir(path.join(ROOT, "supabase/migrations"))).filter((n) => /_business_addresses_tidy\.sql$/.test(n));
check("the tidy migration exists once", tidy.length === 1);
{
  const sql = await readFile(path.join(ROOT, "supabase/migrations", tidy[0]), "utf8");
  // Only the address function here; business_page_for needs auth.users (job_links_per_business test).
  await db.exec(sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.slugify_business"), sql.indexOf("CREATE OR REPLACE FUNCTION public.business_page_for")));
}
const slug = async (name) => (await db.query("select public.slugify_business($1) s", [name])).rows[0].s;

const dir = mkdtempSync(path.join(tmpdir(), "address-names-"));
const outfile = path.join(dir, "card.mjs");
await build({
  entryPoints: [path.join(ROOT, "src/components/business/CareersPageCard.tsx")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  logLevel: "silent",
  external: ["react", "react/*", "react-dom", "@tanstack/*", "lucide-react", "sonner", "@radix-ui/*", "@supabase/*"],
  alias: { "@": path.join(ROOT, "src") },
  jsx: "automatic",
});
let cleanAddress = null;
try {
  ({ cleanAddress } = await import(pathToFileURL(outfile).href));
} catch {
  // The card imports the app's client; read the function's own source instead.
}
rmSync(dir, { recursive: true, force: true });
if (!cleanAddress) {
  const src = await readFile(path.join(ROOT, "src/components/business/CareersPageCard.tsx"), "utf8");
  // From the letter table it uses down to the next function.
  const body = src.slice(src.indexOf("const ACCENTED"), src.indexOf("/** A refusal from the database"));
  cleanAddress = new Function(`${body.replace("export function cleanAddress(raw: string): string", "return function cleanAddress(raw)")}`)();
}
const preview = (name) => cleanAddress(name).replace(/-+$/, "");

for (const [name, want] of [
  ["Zulu Support Team", "zulu-support-team"],
  ["Maria's Café", "marias-cafe"],
  ["Maria’s Café", "marias-cafe"],
  ["Ünïcödé Jöb!!", "unicode-job"],
  ["Lucky Star Support, Inc.", "lucky-star-support-inc"],
  ["  Night   Owl  ", "night-owl"],
  ["Ñandú Señora & Co", "nandu-senora-co"],
  ["!!!", ""],
  // The reviewer's cases: the cut never leaves a dash, and the letters NFKD
  // can't take apart match the database.
  ["Bright Horizons Online Customer Support and Sales Team Inc", "bright-horizons-online-customer-support-and-sales"],
  ["Ørsted", "orsted"],
  ["Łódź Đorđe Straße", "lodz-dorde-strase"],
]) {
  const got = await slug(name);
  check(`database: ${JSON.stringify(name)} → ${want}`, got === want, got);
  check(`sign-up preview: ${JSON.stringify(name)} → ${want}`, preview(name) === want, preview(name));
}
check("database: 50 characters at most", (await slug("a".repeat(80))).length === 50);
for (const name of ["Bright Horizons Online Customer Support and Sales Team Inc", "a".repeat(49) + " b", "x ".repeat(40)]) {
  const got = await slug(name);
  check(`database: ${JSON.stringify(name.slice(0, 30))}… is a working address`, /^[a-z0-9]+(-[a-z0-9]+)*$/.test(got), got);
  check(`sign-up preview matches the database for ${JSON.stringify(name.slice(0, 30))}…`, preview(name) === got, `${preview(name)} vs ${got}`);
}

console.log(`business address names: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
