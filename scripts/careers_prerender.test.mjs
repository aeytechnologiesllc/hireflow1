/**
 * api/careers-prerender.mjs: the server-side head of a careers page,
 * hireflownow.com/careers (the home business) and hireflownow.com/c/<business>
 * (docs/BUSINESS-TRUST.md, "Each business its own"). Run against a stand-in
 * for the database and the app's shell: no network.
 *
 *   - /careers names the home business (Zulu Support Team), with its own
 *     picture and /careers as its one address;
 *   - /c/<business> names that business and its open roles, with the plain
 *     "Now hiring" picture and /c/<business> as its address;
 *   - an unknown or malformed business is the plain shell (the app says the
 *     page does not exist), never another business's head;
 *   - any failure is the plain shell, so a visitor's page never breaks;
 *   - vercel.json sends both addresses here.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import handler, { careersHead, rolesLine } from "../api/careers-prerender.mjs";

const SHELL =
  '<!doctype html><html><head><title>HireFlow</title><meta name="description" content="x" />' +
  '<meta property="og:title" content="HireFlow: apply online" /><meta property="og:image" content="https://hireflownow.com/share/careers.jpg" />' +
  '</head><body><div id="root"></div></body></html>';
const ZULU = "10000000-0000-4000-8000-000000000001";
const LUCKY = "10000000-0000-4000-8000-000000000002";

function stub({ pages = [], brands = {}, jobs = {}, failJobs = false, failShell = false } = {}) {
  const asked = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    asked.push(u);
    if (u === "https://hireflownow.com/index.html") return failShell ? new Response("", { status: 500 }) : new Response(SHELL, { status: 200 });
    if (u.includes("/business_pages?")) {
      const bySlug = /slug=eq\.([^&]+)/.exec(u);
      const rows = u.includes("home_alias=eq.true") ? pages.filter((p) => p.home_alias) : pages.filter((p) => bySlug && p.slug === decodeURIComponent(bySlug[1]));
      return new Response(JSON.stringify(rows), { status: 200 });
    }
    if (u.includes("/employer_public_branding?")) {
      const id = /user_id=eq\.([^&]+)/.exec(u)[1];
      return new Response(JSON.stringify(brands[id] ? [{ company_name: brands[id] }] : []), { status: 200 });
    }
    if (u.includes("/published_jobs_public?")) {
      if (failJobs) return new Response("down", { status: 500 });
      const id = /employer_id=eq\.([^&]+)/.exec(u)[1];
      return new Response(JSON.stringify((jobs[id] ?? []).map((title) => ({ title }))), { status: 200 });
    }
    throw new Error(`unexpected fetch ${u}`);
  };
  return asked;
}
async function run(query) {
  const headers = {};
  const res = { statusCode: 0, body: "", setHeader(k, v) { headers[k.toLowerCase()] = v; }, end(b) { this.body = String(b ?? ""); } };
  await handler({ query }, res);
  return { status: res.statusCode, headers, body: res.body };
}
const world = {
  pages: [
    { employer_id: ZULU, slug: "zulu-support-team", home_alias: true },
    { employer_id: LUCKY, slug: "lucky-star-support", home_alias: false },
  ],
  brands: { [ZULU]: "Zulu Support Team", [LUCKY]: "Lucky Star Support" },
  jobs: { [ZULU]: ["Chat Support Team Leader"], [LUCKY]: ["Night shift chat agent", "Team leader", "QA lead"] },
};

// The words.
assert.equal(rolesLine([]), "");
assert.equal(rolesLine(["A"]), "A");
assert.equal(rolesLine(["A", "B"]), "A and B");
assert.equal(rolesLine(["A", "B", "C"]), "A and 2 more");
assert.equal(careersHead({ company: "", titles: [], home: false, slug: "x" }).title, "HireFlow — Careers");

// 1. /careers: the home business.
stub(world);
{
  const r = await run({ home: "1" });
  assert.equal(r.status, 200);
  assert.match(r.body, /<title>Zulu Support Team — Careers<\/title>/);
  assert.ok(r.body.includes('<link rel="canonical" href="https://hireflownow.com/careers" />'));
  assert.ok(r.body.includes('content="https://hireflownow.com/share/zulu-careers.jpg"'), "the home business keeps its own picture");
  assert.equal((r.body.match(/property="og:image"/g) ?? []).length, 1, "the shell's picture is replaced, not doubled");
  assert.equal((r.body.match(/<title>/g) ?? []).length, 1);
}
// 2. /c/<business>: that business, its roles, the plain picture.
stub(world);
{
  const r = await run({ slug: "lucky-star-support" });
  assert.equal(r.status, 200);
  assert.match(r.body, /<title>Lucky Star Support — Careers<\/title>/);
  assert.match(r.body, /Open roles at Lucky Star Support: Night shift chat agent and 2 more\./);
  assert.ok(r.body.includes('<link rel="canonical" href="https://hireflownow.com/c/lucky-star-support" />'));
  assert.ok(r.body.includes('content="https://hireflownow.com/share/careers.jpg"'));
  assert.ok(!/Zulu/.test(r.body), "another business's page never says Zulu");
}
// The home business at /c/<its name>: the same page as /careers.
stub(world);
{
  const r = await run({ slug: "zulu-support-team" });
  assert.ok(r.body.includes('<link rel="canonical" href="https://hireflownow.com/careers" />'), "one address for the home business's page");
  assert.ok(r.body.includes('content="https://hireflownow.com/share/zulu-careers.jpg"'));
}
// A name typed in capitals is the same business.
stub(world);
{
  const r = await run({ slug: "Lucky-Star-Support" });
  assert.match(r.body, /<title>Lucky Star Support — Careers<\/title>/);
}
// 3. Unknown or malformed: the plain shell.
stub(world);
{
  const r = await run({ slug: "nobody-here" });
  assert.equal(r.status, 200);
  assert.equal(r.body, SHELL);
}
{
  const asked = stub(world);
  const r = await run({ slug: "../evil" });
  assert.equal(r.body, SHELL);
  assert.ok(!asked.some((u) => u.includes("/business_pages?")), "a malformed name is never looked up");
}
// 4. Failures: the plain shell, never a broken page.
stub({ ...world, failJobs: true });
{
  const r = await run({ slug: "lucky-star-support" });
  assert.equal(r.status, 200);
  assert.match(r.body, /<title>Lucky Star Support — Careers<\/title>/, "no roles line, still the business's head");
}
stub({ ...world, failShell: true });
{
  const r = await run({ slug: "lucky-star-support" });
  assert.equal(r.status, 200);
  assert.match(r.body, /<title>HireFlow<\/title>/);
}
// 5. vercel.json sends both addresses here, before the catch-all.
{
  const rules = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).rewrites;
  const home = rules.findIndex((r) => r.source === "/careers");
  const biz = rules.findIndex((r) => r.source === "/c/:slug");
  const end = rules.findIndex((r) => r.source === "/:path+");
  assert.equal(rules[home]?.destination, "/api/careers-prerender?home=1");
  assert.equal(rules[biz]?.destination, "/api/careers-prerender?slug=:slug");
  assert.ok(home < end && biz < end);
}

console.log("careers_prerender: 6 scenarios passed");
