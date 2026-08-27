/**
 * Guardrails — one permanent check per shipped fix.
 *
 * Every repair that lands in this repo gets a guard here, so the same mistake
 * cannot come back quietly. These are static checks over the source tree: they
 * need no server, no database and no keys, and they run in about a second.
 *
 *   node scripts/guardrails.mjs          # all guards
 *   node scripts/guardrails.mjs --list   # names only
 *
 * Exit code 0 = every guard passed. Non-zero = something regressed.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

/* ------------------------------------------------------------------ helpers */

const cache = new Map();

async function read(rel) {
  if (!cache.has(rel)) {
    cache.set(rel, await readFile(path.join(ROOT, rel), "utf8").catch(() => null));
  }
  return cache.get(rel);
}

async function walk(rel, exts) {
  const out = [];
  const dir = path.join(ROOT, rel);
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".git", "screenshots-verify", "output"].includes(entry.name)) continue;
      out.push(...(await walk(child, exts)));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(child);
    }
  }
  return out;
}

/** Every source file that ships to a user, with its text. */
async function sources(exts = [".ts", ".tsx", ".mjs", ".js", ".html"]) {
  const rels = [
    ...(await walk("src", exts)),
    ...(await walk("api", exts)),
    ...(await walk("supabase/functions", exts)),
    "index.html",
    "public/landing.html",
  ];
  const files = [];
  for (const rel of rels) {
    const text = await read(rel);
    if (text != null) files.push({ rel, text });
  }
  return files;
}

/** Report every line matching `re`, so a failure names the exact place. */
function hits(files, re, skip = () => false) {
  const found = [];
  for (const { rel, text } of files) {
    if (skip(rel)) continue;
    text.split("\n").forEach((line, i) => {
      re.lastIndex = 0;
      if (re.test(line)) found.push(`${rel}:${i + 1}  ${line.trim().slice(0, 120)}`);
    });
  }
  return found;
}

/* ------------------------------------------------------------------- guards */

const guards = [
  {
    id: "no-dead-project-ref",
    why:
      "kcotpxlggfvgclwksmhl is a dead Supabase project. It was copied out of CLAUDE.md " +
      "into a database trigger and silently broke every push notification.",
    async run() {
      const found = hits(await sources([".ts", ".tsx", ".mjs", ".js", ".html", ".sql", ".md"]), /kcotpxlggfvgclwksmhl/,
        (rel) => rel.startsWith("supabase/migrations/"));
      return found.length ? { ok: false, detail: found } : { ok: true };
    },
  },

  {
    id: "vercel-api-self-contained",
    why:
      "Files in api/ are Vercel serverless functions. An import from ../src or a bare npm " +
      "specifier crashes them at load with no logs — it 500'd every live job page once.",
    async run() {
      const files = [];
      for (const rel of await walk("api", [".mjs", ".js"])) files.push({ rel, text: await read(rel) });
      const bad = hits(files, /^\s*import\s[^"']*["'](?!node:|\.\/)([^"']+)["']/);
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "stripe-key-fails-loudly",
    why:
      "A hardcoded pk_test_ fallback silently dropped PRODUCTION into Stripe test mode: " +
      "checkout opened, looked right, and could never take real money.",
    async run() {
      const bad = hits(await sources([".ts", ".tsx"]), /pk_test_[A-Za-z0-9]/);
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "no-email-enumeration-endpoint",
    why:
      "check-email-exists answered, with no login, whether any address had an account. " +
      "It is retired (410) and must stay retired; the email_exists RPC was revoked too.",
    async run() {
      const fn = await read("supabase/functions/check-email-exists/index.ts");
      if (!fn) return { ok: true };
      if (!/\b410\b/.test(fn)) {
        return { ok: false, detail: ["supabase/functions/check-email-exists/index.ts no longer returns 410"] };
      }
      const callers = hits(await sources([".ts", ".tsx"]), /rpc\(\s*["']email_exists["']/);
      return callers.length ? { ok: false, detail: callers } : { ok: true };
    },
  },

  {
    id: "no-generic-ai-icons",
    why:
      "Standing brand rule: no sparkle/star/wand/robot/brain iconography anywhere. Ava's " +
      "mark is her own, never a stock 'AI' glyph.",
    async run() {
      const files = await sources([".ts", ".tsx"]);
      const bad = hits(files, /\b(Sparkles?|Wand2?|Bot|BrainCircuit|Brain)\b\s*[,}]/, (rel) =>
        rel.includes("/ui/"));
      const onlyImports = bad.filter((line) => /lucide-react|from ["']lucide/.test(line) || /^\s/.test(line));
      return bad.length ? { ok: false, detail: onlyImports.length ? onlyImports : bad } : { ok: true };
    },
  },

  {
    id: "no-fabricated-proof",
    why:
      "Owner decision, 16 Jul 2026: no invented customer counts, testimonials, ratings or " +
      "certifications on any public page. The live site claimed SOC 2 it does not hold.",
    async run() {
      const marketing = [];
      for (const rel of ["public/landing.html", "index.html", ...(await walk("src/pages", [".tsx"]))]) {
        const text = await read(rel);
        if (text) marketing.push({ rel, text });
      }
      const bad = hits(
        marketing,
        /(SOC\s*2|ISO\s*27001|[0-9][0-9,]{2,}\+?\s*(businesses|hires|companies|employers|screened)|\b4\.[0-9]\s*(\/\s*5|stars?|rating))/i
      );
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "node-runtime-pinned",
    why: "Vercel disables Node 20 on 1 Oct 2026. package.json must pin a supported runtime.",
    async run() {
      const pkg = JSON.parse((await read("package.json")) || "{}");
      const node = pkg.engines && pkg.engines.node;
      return node && !/^2[0-2]/.test(node)
        ? { ok: true }
        : { ok: false, detail: [`package.json engines.node = ${node || "(unset)"}`] };
    },
  },

  {
    id: "ai-models-come-from-env",
    why:
      "gpt-4.1 and gemini-2.5-flash retire in Oct 2026. Model names must be swappable from " +
      "the dashboard, so a retirement is a config change and not an emergency deploy.",
    async run() {
      const files = [];
      for (const rel of await walk("supabase/functions", [".ts"])) {
        if (rel.endsWith(".test.ts")) continue;
        files.push({ rel, text: await read(rel) });
      }
      // A model name is fine as the default of an env lookup; it is not fine on its own.
      const bad = hits(files, /["'](gpt-4\.1|gpt-4o(?!-)|gemini-2\.5-flash)["']/).filter(
        (line) => !/env\.get\(|process\.env|MODEL\s*\|\|/.test(line)
      );
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "ava-never-auto-rejects",
    why:
      "Ava scores and shortlists; a human makes every reject call. Every write of a " +
      "rejected status must be stamped as the employer's own decision (rejected_by_type " +
      "'user' plus their id), never Ava's.",
    async run() {
      const bad = [];
      for (const rel of await walk("supabase/functions", [".ts"])) {
        if (rel.endsWith(".test.ts")) continue;
        const lines = ((await read(rel)) || "").split("\n");
        lines.forEach((line, i) => {
          if (/^\s*(\/\/|\*)/.test(line)) return; // a comment is not a write
          if (!/status["']?\s*:\s*["']rejected["']/.test(line)) return;
          // The stamp must sit in the same update object.
          const near = lines.slice(Math.max(0, i - 6), i + 8).join("\n");
          if (!/rejected_by_type\s*:\s*["']user["']/.test(near) || !/rejected_by\s*:/.test(near)) {
            bad.push(`${rel}:${i + 1}  ${line.trim().slice(0, 110)}`);
          }
        });
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "resumes-bucket-not-public",
    why: "Resumes are personal data. The bucket must stay private and be read via signed URLs.",
    async run() {
      const bad = hits(await sources([".ts", ".tsx"]), /getPublicUrl\(\s*[^)]*resume/i);
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];

/* --------------------------------------------------------------------- main */

async function main() {
  if (process.argv.includes("--list")) {
    guards.forEach((g) => console.log(g.id));
    return 0;
  }

  let failed = 0;
  for (const guard of guards) {
    let result;
    try {
      result = await guard.run();
    } catch (err) {
      result = { ok: false, detail: [`guard threw: ${err.message}`] };
    }
    if (result.ok) {
      console.log(`  ok    ${guard.id}`);
    } else {
      failed += 1;
      console.log(`  FAIL  ${guard.id}`);
      console.log(`        ${guard.why}`);
      for (const line of result.detail.slice(0, 12)) console.log(`        - ${line}`);
      if (result.detail.length > 12) console.log(`        - ...and ${result.detail.length - 12} more`);
    }
  }

  console.log(
    failed
      ? `\n${failed} of ${guards.length} guards failed.`
      : `\nAll ${guards.length} guards passed.`
  );
  return failed ? 1 : 0;
}

main().then((code) => process.exit(code));
