/**
 * The full job post (src/lib/jobPost.ts) and the Share Kit's two posts.
 *
 * The owner, 2026-10-11: "give them options to copy job full post so they can
 * simply paste on job posts and won't have to change anything". So:
 *   - the whole job, from its own fields, in plain text (no markdown), with
 *     the business, place, type and pay up top and the apply link at the end;
 *   - lines written as bullets, dashes, numbers or none all become "•";
 *   - empty parts are left out, never printed as "null" or an empty heading;
 *   - pay reads as the job states it ("USD 500 a month"), never the old
 *     "$500 – $500 / hr";
 *   - the Share Kit offers Short post and Full job post, and copies the one
 *     shown.
 */
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(resolve(tmpdir(), "full-job-post-"));
const outfile = resolve(dir, "jobPost.mjs");
await build({ entryPoints: [resolve(root, "src/lib/jobPost.ts")], bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent" });
const lib = await import(pathToFileURL(outfile).href);
rmSync(dir, { recursive: true, force: true });
const read = (p) => readFileSync(resolve(root, p), "utf8");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) passed += 1;
  else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ""}`);
  }
}
const eq = (name, got, want) => check(name, got === want, `got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);

const LINK = "https://hireflownow.com/c/zulu-support-team/team-lead";
const LEAD = "It's all online, on your computer. Apply here:";

// --- pay, as the job states it ------------------------------------------------
eq("a monthly figure", lib.payWords({ salary_min: 500, salary_max: 500, salary_currency: "USD", salary_period: "MONTH" }), "USD 500 a month");
eq("a range", lib.payWords({ salary_min: 20000, salary_max: 25000, salary_currency: "php", salary_period: "MONTH" }), "PHP 20,000 to 25,000 a month");
eq("from", lib.payWords({ salary_min: 5, salary_currency: "USD", salary_period: "HOUR" }), "From USD 5 an hour");
// The Phase 7 product audit: cents kept, no currency guessed.
eq("an hourly rate keeps its cents", lib.payWords({ salary_min: 18.5, salary_max: 18.5, salary_currency: "USD", salary_period: "HOUR" }), "USD 18.50 an hour");
eq("no currency named: the figure alone, never USD", lib.payWords({ salary_min: 20000, salary_max: 20000, salary_period: "MONTH" }), "20,000 a month");
eq("a numeric column read as text still counts", lib.payWords({ salary_min: "18.50", salary_max: "18.50", salary_currency: "USD", salary_period: "HOUR" }), "USD 18.50 an hour");
eq("up to", lib.payWords({ salary_max: 900, salary_currency: "USD", salary_period: "MONTH" }), "Up to USD 900 a month");
eq("no pay named", lib.payWords({}), null);
eq("job type words", [lib.jobTypeWords("full-time"), lib.jobTypeWords("part_time"), lib.jobTypeWords(""), lib.jobTypeWords(null)].join("|"), "Full-time|Part-time||");

// --- bullets --------------------------------------------------------------------
eq(
  "bullets, dashes, numbers and bare lines all become •",
  lib.bulletLines("• one\n- two\n* three\n1. four\n2) five\nsix\n\n").join("|"),
  "• one|• two|• three|• four|• five|• six",
);
eq("markdown is taken out", lib.bulletLines("**Bold** line\n## Heading").join("|"), "• Bold line|• Heading");

// --- the owner's real job, word for word --------------------------------------------
const zulu = {
  title: "Chat Support Team Leader (Zulu Royal & Zulu Rush)",
  job_type: "full-time",
  location: "Remote (worldwide)",
  is_remote: true,
  salary_min: 500,
  salary_max: 500,
  salary_currency: "USD",
  salary_period: "MONTH",
  description: "We're hiring an experienced Team Leader.\r\n\r\n\r\nThis is a working team lead role.",
  responsibilities: "• Lead a team of six chat agents\n• Take the hardest chats",
  requirements: "• At least 2 years of chat support\n• Typing speed of at least 45 words a minute",
  benefits: ["Fully remote", "One fixed shift", "Paid training on our games and tools", "A team of six to lead"],
  application_deadline: null,
};
const post = lib.buildFullJobPost(zulu, { company: "Zulu Support Team", applyUrl: LINK, applyLead: LEAD });
eq(
  "the whole post, exactly",
  post,
  [
    "We're hiring: Chat Support Team Leader (Zulu Royal & Zulu Rush)",
    "Zulu Support Team · Remote (worldwide) · Full-time · USD 500 a month",
    "",
    "We're hiring an experienced Team Leader.",
    "",
    "This is a working team lead role.",
    "",
    "WHAT YOU'LL DO",
    "• Lead a team of six chat agents",
    "• Take the hardest chats",
    "",
    "WHAT WE'RE LOOKING FOR",
    "• At least 2 years of chat support",
    "• Typing speed of at least 45 words a minute",
    "",
    "WHAT YOU GET",
    "• Fully remote",
    "• One fixed shift",
    "• Paid training on our games and tools",
    "• A team of six to lead",
    "",
    "HOW TO APPLY",
    LEAD,
    LINK,
  ].join("\n"),
);
check("it ends with the job's own link", post.endsWith(`\n${LINK}`));

// --- parts that are missing are left out --------------------------------------------
const bare = lib.buildFullJobPost({ title: "Night agent", description: "", responsibilities: null, requirements: "  ", benefits: null }, { company: null, applyUrl: LINK, applyLead: "Apply here:" });
eq("a job with only a title: heading, place, how to apply", bare, ["We're hiring: Night agent", "Remote", "", "HOW TO APPLY", "Apply here:", LINK].join("\n"));
check("never 'null', 'undefined' or an empty heading", !/null|undefined|WHAT YOU'LL DO\n\n|WHAT YOU GET\n\n/.test(bare));
const onsite = lib.buildFullJobPost({ title: "Barista", is_remote: false, location: "" }, { applyUrl: LINK, applyLead: "Apply here:" });
check("an on-site job with no place says no place (never 'Remote')", !/Remote/.test(onsite), onsite);
const dated = lib.buildFullJobPost({ title: "Agent", application_deadline: "2026-10-31T00:00:00Z" }, { applyUrl: LINK, applyLead: "Apply here:" });
check("an apply-by date is said once, before the link", /HOW TO APPLY\nApply by Saturday, October 31, 2026\.\nApply here:\n/.test(dated), dated);
const textBenefits = lib.buildFullJobPost({ title: "Agent", benefits: "- Remote\n- Paid training" }, { applyUrl: LINK, applyLead: "Apply here:" });
check("benefits written as text become bullets too", /WHAT YOU GET\n• Remote\n• Paid training/.test(textBenefits), textBenefits);

// --- the cards, the post and the flyer read the pay right ------------------------------
{
  const mappers = read("src/cockpit/lib/mappers.ts");
  check("the job cards use the same pay words (never '/ hr' for every job)", /return payWords\(job\) \?\?/.test(mappers) && !/\/ hr`/.test(mappers));
}

// --- the Share Kit --------------------------------------------------------------------
{
  const kit = read("src/cockpit/components/ShareKitDialog.tsx");
  check("the kit offers Short post and Full job post", /"Short post" : "Full job post"/.test(kit) && /data-post-kind=\{kind\}/.test(kit));
  check("the full post is built from the job's own fields and the business's name", /buildFullJobPost\(fullSource\.job, \{ company: fullSource\.company, applyUrl/.test(kit) && /\.from\("jobs"\)/.test(kit) && /employer_public_branding/.test(kit));
  check("…with the same link as the QR code and the flyer", /const applyUrl = shortLinkFor\(job\) \? jobShareUrl\(job\) : callerUrl;/.test(kit));
  check("the copy button copies the post shown", /onClick=\{\(\) => void copy\(shownText, "post"\)\}/.test(kit) && /"Copy full post" : "Copy"/.test(kit));
  check("a job whose full post cannot be read says so, and the short post still works", /data-post-full-missing/.test(kit));
  check("it opens on the full post", /useState<"full" \| "short">\("full"\)/.test(kit));
  check("it still never links to an outside board", !/indeed\.com|linkedin\.com|ziprecruiter\.com|monster\.com|facebook\.com\/sharer/i.test(kit));
}

console.log(`full job post: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
