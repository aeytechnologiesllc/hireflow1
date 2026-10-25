// Which edge functions reach a changed file through relative imports.
// Usage: node scripts/ops/deps.mjs <changed file>...   (paths relative to the repo root)
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const FN = path.join(ROOT, "supabase/functions");
const changed = new Set(process.argv.slice(2).map((p) => path.resolve(ROOT, p)));
const reach = (file, seen = new Set()) => {
  if (seen.has(file) || !existsSync(file)) return seen;
  seen.add(file);
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) reach(path.resolve(path.dirname(file), m[1]), seen);
  return seen;
};
const out = [];
for (const name of readdirSync(FN)) {
  if (name.startsWith("_") || !statSync(path.join(FN, name)).isDirectory()) continue;
  const entry = path.join(FN, name, "index.ts");
  if (!existsSync(entry)) continue;
  const files = reach(entry);
  // every file in the function's own folder counts too
  for (const f of readdirSync(path.join(FN, name))) files.add(path.join(FN, name, f));
  if ([...files].some((f) => changed.has(f))) out.push(name);
}
console.log(out.sort().join(" "));
