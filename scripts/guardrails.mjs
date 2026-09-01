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
    id: "every-internal-link-has-a-route",
    why:
      "/candidate/continue was linked from EIGHT places across four files — the candidate portal " +
      "landing, the public job page, the save-progress prompt and the apply form — and was never " +
      "registered as a route. Every one of them fell through to the catch-all and rendered " +
      "'404 Oops! Page not found' on production. The page existed; it was simply never mounted. " +
      "A link to a route that does not exist is a dead end for a real person, so it fails the build.",
    async run() {
      const app = await read("src/App.tsx");
      if (app == null) return { ok: false, detail: ["src/App.tsx is missing"] };

      // Every registered path, with :params turned into a wildcard segment.
      // The catch-all is deliberately EXCLUDED: `path="*"` would compile to
      // ^.*$ and match every destination, which would make this guard pass
      // unconditionally — and the catch-all is precisely what renders the 404
      // this guard exists to prevent.
      const routes = [...app.matchAll(/path="([^"]+)"/g)]
        .map((m) => m[1])
        .filter((r) => r !== "*" && r !== "/*");
      const matchers = routes.map((r) =>
        new RegExp("^" + r.replace(/:[^/]+/g, "[^/]+") + "$")
      );
      const isRouted = (p) => matchers.some((re) => re.test(p));

      // Every internal destination the app navigates to.
      const files = await sources([".ts", ".tsx"]);
      const bad = [];
      const seen = new Set();
      for (const { rel, text } of files) {
        const targets = [
          ...text.matchAll(/navigate\(\s*["'](\/[^"'`?#]*)/g),
          ...text.matchAll(/\bto=["'](\/[^"'`?#]*)/g),
        ];
        for (const m of targets) {
          let path = m[1].replace(/\/+$/, "") || "/";
          // Skip anything built from a variable or a template literal — this
          // guard only judges destinations written as plain literals.
          if (path.includes("${") || path.length < 2) continue;
          const key = `${rel}→${path}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (!isRouted(path)) bad.push(`${rel} links to ${path} — no <Route path> matches it`);
        }
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

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
    id: "job-pages-do-not-invent-an-expiry",
    why:
      "The prerender used to invent validThrough = created_at + 60 days, then the " +
      "indexable gate compared that invented date against now() and stamped the page " +
      "noindex. Every job silently de-indexed itself on day 60 while still published " +
      "and still submitted in the sitemap — Google for Jobs saw nothing.",
    async run() {
      const src = (await read("api/job-prerender.mjs")) || "";
      const bad = [];
      if (/86400000/.test(src) && /validThrough/.test(src)) {
        bad.push("api/job-prerender.mjs synthesizes a validThrough again");
      }
      if (!/!schema\.validThrough\s*\|\|/.test(src)) {
        bad.push("the indexable gate no longer tolerates a missing validThrough");
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

  {
    id: "subscription-and-notification-writes-locked",
    why:
      "'System can insert/update subscriptions', 'System can insert/update usage' and " +
      "'System can insert notifications' all had USING/WITH CHECK (true) with no `TO` " +
      "clause — any anon or authenticated caller could rewrite someone else's plan or " +
      "spoof a notification to any user_id. The two lockdown migrations close that; " +
      "nothing may ever bring those permissive policies back.",
    async run() {
      const SUB_MIGRATION = "supabase/migrations/20260827210000_lockdown_subscription_writes.sql";
      const NOTIF_MIGRATION = "supabase/migrations/20260827211000_lockdown_notification_inserts.sql";
      const bad = [];

      if ((await read(SUB_MIGRATION)) == null) bad.push(`${SUB_MIGRATION} is missing`);
      if ((await read(NOTIF_MIGRATION)) == null) bad.push(`${NOTIF_MIGRATION} is missing`);

      const migrationFiles = (await readdir(path.join(ROOT, "supabase/migrations")).catch(() => []))
        .filter((f) => f.endsWith(".sql"))
        .sort();

      // A recreation only matters if it actually brings the policy back with
      // CREATE POLICY — a defensive `DROP POLICY IF EXISTS "System can ..."`
      // in some later migration is not a regression and must not fail this.
      const recreates = /CREATE\s+POLICY\s+"System can (insert|update) (subscriptions|usage|notifications)"/i;

      for (const [migrationRel, label] of [
        [SUB_MIGRATION, "subscription"],
        [NOTIF_MIGRATION, "notification"],
      ]) {
        const name = path.basename(migrationRel);
        const later = migrationFiles.filter((f) => f > name);
        for (const f of later) {
          const text = await read(`supabase/migrations/${f}`);
          if (text && recreates.test(text)) {
            bad.push(`supabase/migrations/${f} recreates a permissive "System can ..." ${label} policy`);
          }
        }
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "scoring-is-pure-function",
    why:
      "The LLM judge's own holistic overallScore was leaking straight through as the " +
      "persisted ai_score — nondeterministic (±3 across identical reruns) and too soft " +
      "to separate a clean resume from the same resume riddled with typos (~14pt gap vs " +
      "the ~24pt the sub-scores actually support). The fix: trigger-ava-analysis must " +
      "compute the resume score via computeJudgmentScore (deterministic arithmetic over " +
      "the sub-scores, in _shared/autopilot.ts) and persist ai_score from " +
      "scorecard.overallScore, never from structuredScore.overallScore directly. " +
      "applications.ai_scorecard must keep existing, or the whole update silently fails.",
    async run() {
      const FN = "supabase/functions/trigger-ava-analysis/index.ts";
      const SCORECARD_MIGRATION = "supabase/migrations/20260827205000_add_ai_scorecard_column.sql";
      const bad = [];

      const src = await read(FN);
      if (src == null) {
        bad.push(`${FN} is missing`);
      } else {
        // The LLM's raw holistic number must never be assigned to the score the
        // pipeline goes on to persist.
        if (/newScore\s*=\s*structuredScore\??\.overallScore/.test(src)) {
          bad.push(`${FN} assigns newScore from structuredScore.overallScore — the LLM's raw score is leaking through again`);
        }

        // The deterministic aggregator must actually be in the call path.
        if (!/\bcomputeJudgmentScore\s*\(/.test(src)) {
          bad.push(`${FN} no longer calls computeJudgmentScore — the resume score isn't going through the pure aggregator`);
        }
        if (!/computeJudgmentScore/.test(src) || !src.includes('from "../_shared/autopilot.ts"')) {
          bad.push(`${FN} doesn't import from _shared/autopilot.ts`);
        }

        // The persisted ai_score column must come from the scorecard the pure builder
        // returned, not from a caller-side number computed outside it.
        if (!/ai_score:\s*typeof\s+scorecard\?\.overallScore/.test(src)) {
          bad.push(`${FN} doesn't persist ai_score from scorecard.overallScore — check the applications.update() call`);
        }

        // buildAvaScorecard must still be the thing that produces the persisted scorecard.
        if (!/const\s+scorecard\s*=\s*buildAvaScorecard\(/.test(src)) {
          bad.push(`${FN} no longer builds the scorecard via buildAvaScorecard`);
        }
      }

      // Pin the migration that actually creates the column both of the above write to —
      // without it the entire applications.update() 42703s and nothing persists at all.
      const migration = await read(SCORECARD_MIGRATION);
      if (migration == null) {
        bad.push(`${SCORECARD_MIGRATION} is missing`);
      } else if (!/ai_scorecard/.test(migration)) {
        bad.push(`${SCORECARD_MIGRATION} no longer mentions ai_scorecard`);
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "brand-glyphs-carry-identity",
    why:
      "The create-job flow ran on stock lucide icons (ClipboardList, FileText, Timer, Camera, " +
      "Trophy) while the candidate side had a hand-drawn kit. The owner's read was 'all the icons " +
      "feel very generic, very AI', and candidate/glyphs.tsx already banned exactly this. The plan " +
      "cards and the step rail now resolve their marks through glyphForKind()/STEP_GLYPHS against " +
      "the brand kits, and must never fall back to lucide for a mark that carries identity.",
    async run() {
      const bad = [];
      const shared = await read("src/components/ava/createFlow/shared.tsx");
      const kit = await read("src/components/ava/employerGlyphs.tsx");
      if (kit == null) return { ok: false, detail: ["src/components/ava/employerGlyphs.tsx is missing"] };
      if (shared == null) return { ok: false, detail: ["createFlow/shared.tsx is missing"] };

      if (!/export function glyphForKind\(/.test(shared)) {
        bad.push("createFlow/shared.tsx no longer exports glyphForKind() — plan cards have lost their brand marks");
      }
      // The identity marks must come from a kit, not lucide.
      for (const [label, re] of [
        ["glyphForKind", /export function glyphForKind\([\s\S]*?\n\}/],
        ["STEP_GLYPHS", /const STEP_GLYPHS = \{[\s\S]*?\}/],
      ]) {
        const block = shared.match(re)?.[0] ?? "";
        const stock = block.match(/\b(ClipboardList|ClipboardCheck|FileText|Timer|Camera|Video|Mic|Trophy|Keyboard|Workflow|SlidersHorizontal|MessagesSquare)\b/g);
        if (stock) bad.push(`createFlow/shared.tsx: ${label} resolves to stock lucide icons: ${[...new Set(stock)].join(", ")}`);
      }
      // Family law: the kit draws on one grid, in one voice.
      if (!/viewBox="0 0 24 24"/.test(kit)) bad.push("employerGlyphs.tsx left the 24x24 grid");
      if (!/stroke="currentColor"/.test(kit)) bad.push("employerGlyphs.tsx stopped using currentColor");
      const count = (kit.match(/export function Glyph/g) || []).length;
      if (count < 8) bad.push(`employerGlyphs.tsx only exports ${count} marks — the flow needs the full set`);
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "orb-stays-retired",
    why:
      "The Ava orb is retired — the mark is the wax seal. The orb nevertheless kept " +
      "rendering at 240-248px through the whole employer create-job flow, where it read " +
      "as a black hole punched into the ivory paper, and it dragged a 458 KB Three.js " +
      "chunk into the bundle. Its QA pages (/orb-audit, /orb-preview) were also public on " +
      "hireflownow.com, so a stranger could land on a page auditing a mark the product no " +
      "longer uses. The create-job flow now carries the Gemline rail instead, and voice " +
      "mode uses AvaVoicePulse. None of it may come back.",
    async run() {
      const bad = [];

      // The component and its QA pages must stay deleted.
      for (const gone of [
        "src/components/ava/AvaOrb.tsx",
        "src/components/ava/orbSizes.ts",
        "src/pages/OrbAudit.tsx",
        "src/pages/OrbPreview.tsx",
      ]) {
        if ((await read(gone)) != null) bad.push(`${gone} is back — the orb is retired`);
      }

      // Nothing may render or import it. Comments are fine; JSX and imports are not.
      const files = await sources([".ts", ".tsx"]);
      bad.push(...hits(files, /<AvaOrb[\s/>]/));
      bad.push(...hits(files, /from\s+["'][^"']*\/(AvaOrb|orbSizes)["']/));

      // And the routes that served the QA pages must stay gone.
      const app = await read("src/App.tsx");
      if (app && /path="\/orb-(audit|preview)"/.test(app)) {
        bad.push("src/App.tsx still registers an /orb-audit or /orb-preview route");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "create-flow-uses-the-gemline-rail",
    why:
      "The create-job flow's progress rail is the same Gemline rail as the landing hero " +
      "and the Applicants JourneyStrip — one visual, three places, sharing ck-rail-* in " +
      "cockpit.css and gemPosition() in lib/gemRail.ts. It replaced both a plain pill " +
      "stepper and the orb above it, so the chrome the screen already needed carries the " +
      "brand moment. If StepRail stops using GemRail, that convergence has been undone.",
    async run() {
      const bad = [];
      const shared = await read("src/components/ava/createFlow/shared.tsx");
      if (shared == null) return { ok: false, detail: ["createFlow/shared.tsx is missing"] };
      if (!/<GemRail/.test(shared)) {
        bad.push("createFlow/shared.tsx: StepRail no longer renders <GemRail>");
      }
      const rail = await read("src/components/rail/GemRail.tsx");
      if (rail == null) {
        bad.push("src/components/rail/GemRail.tsx is missing");
      } else {
        if (!/gemPosition/.test(rail)) bad.push("GemRail no longer uses gemPosition() — the gem spectrum has forked");
        if (!/ck-rail-/.test(rail)) bad.push("GemRail no longer uses the ck-rail-* styles — the rail has forked from the cockpit's");
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "account-deletion-removes-auth-user-first",
    why:
      "delete-account purged profiles/user_roles FIRST and called deleteUser() LAST, so a " +
      "failure on that last call left a signed-in auth user with no profile and no role — a " +
      "zombie account its owner could log into but do nothing with, and whose jobs were " +
      "silently dropped from the feed for having no company name. No foreign key references " +
      "auth.users, so nothing forces that order. Auth deletion must come first, which makes " +
      "the failure non-destructive.",
    async run() {
      const FN = "supabase/functions/delete-account/index.ts";
      const src = await read(FN);
      if (src == null) return { ok: false, detail: [`${FN} is missing`] };
      const bad = [];

      const authDelete = src.indexOf("auth.admin.deleteUser");
      const rowPurge = src.indexOf("for (const operation of deleteOperations)");
      if (authDelete === -1) {
        bad.push(`${FN} no longer calls auth.admin.deleteUser`);
      } else if (rowPurge === -1) {
        bad.push(`${FN} no longer purges deleteOperations — check this guard still matches the code`);
      } else if (authDelete > rowPurge) {
        bad.push(
          `${FN} deletes app rows before the auth user again — a failed deleteUser() will strand the account`
        );
      }

      // The residue failures must stay loud; a console.log buries a data-retention bug.
      if (/console\.log\(`Note: Could not delete from/.test(src)) {
        bad.push(`${FN} swallows row-deletion failures into console.log — they must be collected and reported`);
      }
      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },

  {
    id: "architecture-doc-names-the-live-schema",
    why:
      "docs/ARCHITECTURE.md claimed in bold that showcase (roles/candidates) was canonical " +
      "for yqklrkpptnhubsnijqze and that the jobs table was absent. The live database is the " +
      "opposite: jobs and applications exist, roles and candidates do not. Because " +
      "detectSchemaMode() falls back rather than throwing, code written from that doc takes " +
      "the wrong branch silently — the same trap as the dead project ref in CLAUDE.md.",
    async run() {
      const doc = await read("docs/ARCHITECTURE.md");
      if (doc == null) return { ok: false, detail: ["docs/ARCHITECTURE.md is missing"] };
      const bad = [];
      if (/The `jobs` table is absent on this project/.test(doc)) {
        bad.push("docs/ARCHITECTURE.md still claims the jobs table is absent — it exists; roles/candidates do not");
      }
      if (!/\*\*Canonical for project `yqklrkpptnhubsnijqze`:\*\* \*\*hireflow1\*\*/.test(doc)) {
        bad.push("docs/ARCHITECTURE.md no longer names hireflow1 as the canonical schema for the live project");
      }
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
