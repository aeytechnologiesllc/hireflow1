#!/usr/bin/env node
/**
 * Guided tips (the 2026-10-11 "Guided start" mock-up): the rules in
 * src/cockpit/tips/tipRules.ts, the table that remembers them
 * (supabase/migrations/*_guided_tips.sql, in PGlite), and where they are
 * mounted.
 *
 *   - only businesses and team members made from the day tips shipped, never
 *     the platform's own account or an applicant;
 *   - each page's tips, in order, one at a time; "No more tips" stops them all;
 *   - the card sits beside what it explains, never off the screen;
 *   - a person reads and writes only their own tip rows;
 *   - the words never promise what the app doesn't do.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    passed++;
    console.log(`  ok  - ${name}`);
  } else {
    failed++;
    console.log(`FAIL  - ${name}${detail ? `  (${detail})` : ""}`);
  }
};
const show = (v) => JSON.stringify(v);
const read = (p) => readFile(path.join(ROOT, p), "utf8");

const T = await import(pathToFileURL(path.join(ROOT, "src/cockpit/tips/tipRules.ts")).href);

// Who sees them ──────────────────────────────────────────────────────────────
const after = "2026-10-12T09:00:00Z";
const before = "2026-09-01T09:00:00Z";
check("a business that signs up now sees tips", T.tipsEligible({ createdAt: after, isPlatformAdmin: false, role: "employer", isTeamMember: false }));
check("a team member who joins now sees tips", T.tipsEligible({ createdAt: after, isPlatformAdmin: false, role: "team_member", isTeamMember: true }));
check("an account from before never does (Zack, the test accounts)", !T.tipsEligible({ createdAt: before, isPlatformAdmin: false, role: "employer", isTeamMember: false }));
check("the platform's own account never does, however new", !T.tipsEligible({ createdAt: after, isPlatformAdmin: true, role: "employer", isTeamMember: false, forced: true }));
check("an applicant never does", !T.tipsEligible({ createdAt: after, isPlatformAdmin: false, role: "candidate", isTeamMember: false, forced: true }));
check("no sign-up date: no tips", !T.tipsEligible({ createdAt: null, isPlatformAdmin: false, role: "employer", isTeamMember: false }));
check("the offline preview can switch them on", T.tipsEligible({ createdAt: null, isPlatformAdmin: false, role: "employer", isTeamMember: false, forced: true }));

// Which tip, where ─────────────────────────────────────────────────────────────
const owner = { canAskForPapers: true };
const keys = (p, o = owner) => T.tipsForPage(p, o).map((t) => t.key);
check("Jobs: the live job's Share link", show(keys("/jobs")) === show(["jobs_share"]));
check("Applicants: the first applicant", show(keys("/applicants")) === show(["applicants_first"]));
check("An applicant: two tips, the rail and then the decision", show(keys("/applicants/abc-123")) === show(["applicant_rail", "applicant_decide"]));
check("Messages and Documents: one each", show(keys("/messages")) === show(["messages_first"]) && show(keys("/documents/")) === show(["documents_first"]));
check("Dashboard, Settings, Help: none (the dashboard has its first steps)", keys("/dashboard").length === 0 && keys("/settings").length === 0 && keys("/help").length === 0);
check("only the first of two says Next", T.tipsForPage("/applicants/x", owner)[0].next === true && !T.tipsForPage("/applicants/x", owner)[1].next);
check("every tip key is listed once", new Set(T.ALL_TIP_KEYS).size === 6 && ["/jobs", "/applicants", "/applicants/x", "/messages", "/documents"].flatMap((p) => keys(p)).every((k) => T.ALL_TIP_KEYS.includes(k)));

const pair = T.tipsForPage("/applicants/x", owner);
check("one at a time: the first unseen", T.nextTip(pair, new Set())?.key === "applicant_rail" && T.nextTip(pair, new Set(["applicant_rail"]))?.key === "applicant_decide");
check("once both are seen, nothing", T.nextTip(pair, new Set(["applicant_rail", "applicant_decide"])) === null);
check("\"No more tips\" stops every tip", T.nextTip(pair, new Set([T.TIPS_OFF])) === null && T.nextTip(T.tipsForPage("/jobs", owner), new Set([T.TIPS_OFF])) === null);

// The words ──────────────────────────────────────────────────────────────────
const all = ["/jobs", "/applicants", "/applicants/x", "/messages", "/documents"].flatMap((p) => T.tipsForPage(p, owner));
const team = T.tipsForPage("/documents", { canAskForPapers: false })[0];
check("Documents: the owner hears about ID papers; a team member (who can't ask) doesn't", /ask for an ID/.test(T.tipsForPage("/documents", owner)[0].body) && !/ID/.test(team.body));
check("the Jobs tip names the button by its own words (Share link)", /^Share link /.test(T.tipsForPage("/jobs", owner)[0].body));
check("no tip promises the rail can be tapped, or that applicants never see scores", all.every((t) => !/\bTap\b/.test(t.body) && !/never see scores/i.test(t.body)));
check("every tip is short: a title and at most two sentences", all.every((t) => t.title.length <= 45 && t.body.split(/[.!?](\s|$)/).filter((s) => s && s.trim()).length <= 2));
check("no tip names Zulu", all.every((t) => !/Zulu/i.test(t.title + t.body)));

// The card beside its anchor ──────────────────────────────────────────────────
const vp = { width: 1280, height: 800 };
const card = { width: 320, height: 150 };
const a = T.placeTip({ top: 200, left: 600, width: 80, height: 32 }, card, vp);
check("room below: under the thing, its arrow at the thing's middle", a.side === "below" && a.top === 244 && a.left + a.arrowX === 640, show(a));
const b = T.placeTip({ top: 720, left: 600, width: 80, height: 32 }, card, vp);
check("near the bottom: above it", b.side === "above" && b.top + card.height <= 720, show(b));
const c = T.placeTip({ top: 200, left: 1240, width: 30, height: 30 }, card, vp);
check("at the right edge: kept on screen, arrow still pointing at it", c.left + card.width <= vp.width - 12 && Math.abs(c.left + c.arrowX - 1255) <= 22, show(c));
const d = T.placeTip({ top: 200, left: 2, width: 20, height: 20 }, card, vp);
check("at the left edge: kept on screen", d.left >= 12, show(d));
const e = T.placeTip({ top: -300, left: 600, width: 80, height: 1400 }, card, { width: 1280, height: 800 });
check("a huge anchor: still on screen", e.top >= 12 && e.top + card.height <= 800 - 12, show(e));

// The table ──────────────────────────────────────────────────────────────────
const names = (await readdir(path.join(ROOT, "supabase/migrations"))).filter((n) => /_guided_tips\.sql$/.test(n));
check("the migration exists once", names.length === 1);
const db = new PGlite();
await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin; create role authenticated nologin;
  grant anon to postgres; grant authenticated to postgres;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  insert into auth.users values ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
`);
const sql = await read(`supabase/migrations/${names[0]}`);
let applied = true;
try {
  await db.exec(sql);
  await db.exec(sql);
} catch (err) {
  applied = false;
  console.log(err.message);
}
check("it applies, and applies again", applied);
const MARIA = "10000000-0000-4000-8000-000000000001";
const RICO = "10000000-0000-4000-8000-000000000002";
async function as(uid, role, q, params = []) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ""}', false); set role ${role};`);
  try {
    return { ok: true, rows: (await db.query(q, params)).rows };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}
check("a person puts a tip away", (await as(MARIA, "authenticated", `insert into public.ui_tips_seen (user_id, tip) values ($1, 'jobs_share')`, [MARIA])).ok);
check("…and \"No more tips\"", (await as(MARIA, "authenticated", `insert into public.ui_tips_seen (user_id, tip) values ($1, 'all_off')`, [MARIA])).ok);
const twice = await as(MARIA, "authenticated", `insert into public.ui_tips_seen (user_id, tip) values ($1, 'jobs_share') on conflict (user_id, tip) do nothing`, [MARIA]);
check("putting it away twice is harmless", twice.ok);
check("nobody puts away a tip for someone else", !(await as(RICO, "authenticated", `insert into public.ui_tips_seen (user_id, tip) values ($1, 'jobs_share')`, [MARIA])).ok);
const ricoReads = await as(RICO, "authenticated", `select tip from public.ui_tips_seen`);
check("nobody reads someone else's tips", ricoReads.ok && ricoReads.rows.length === 0, show(ricoReads));
const mariaReads = await as(MARIA, "authenticated", `select tip from public.ui_tips_seen order by tip`);
check("a person reads their own", mariaReads.ok && show(mariaReads.rows.map((r) => r.tip)) === show(["all_off", "jobs_share"]), show(mariaReads));
const ricoDeletes = await as(RICO, "authenticated", `delete from public.ui_tips_seen where user_id = $1 returning tip`, [MARIA]);
check("nobody turns someone else's tips back on", !ricoDeletes.ok || ricoDeletes.rows.length === 0, show(ricoDeletes));
const back = await as(MARIA, "authenticated", `delete from public.ui_tips_seen where user_id = $1 and tip = 'all_off' returning tip`, [MARIA]);
check("Settings turns them back on (and the seen one stays seen)", back.ok && back.rows.length === 1 && (await as(MARIA, "authenticated", `select tip from public.ui_tips_seen`)).rows.length === 1, show(back));
check("no updates at all", !(await as(MARIA, "authenticated", `update public.ui_tips_seen set tip = 'x' where user_id = $1`, [MARIA])).ok);
check("signed out: nothing", !(await as(null, "anon", `select tip from public.ui_tips_seen`)).ok);
check("only tip-shaped names", !(await as(MARIA, "authenticated", `insert into public.ui_tips_seen (user_id, tip) values ($1, '<script>')`, [MARIA])).ok);

// Mounted, anchored, switchable ──────────────────────────────────────────────────
const layout = await read("src/components/AppLayout.tsx");
check("mounted in the owner's layout and the team member's", (layout.match(/<GuidedTips \/>/g) ?? []).length === 2);
const jobs = await read("src/cockpit/pages/Jobs.tsx");
check("the Share link carries its anchor", /data-tip-anchor="share"/.test(jobs));
check("the Messages heading carries its anchor", /data-tip-anchor="messages"/.test(await read("src/cockpit/pages/Messages.tsx")));
const profile = await read("src/cockpit/pages/CandidateDetail.tsx");
check("the applicant page's rail and decision card keep the classes the tips find", /className="ckp-journey"/.test(profile) && /className="ckp-decide"/.test(await read("src/cockpit/components/ApplicantDecisionCard.tsx")));
check("…and on a phone: the \"Where they are\" card and the decision bar along the bottom", /aria-labelledby="ck-journey-label"/.test(profile) && /"fixed inset-x-0 z-30 /.test(profile));
check("the Documents page's Offer letter button keeps its anchor", /data-offer-open/.test(await read("src/cockpit/pages/Documents.tsx")));
check("Settings has the switch", /<TipsSettingCard \/>/.test(await read("src/pages/Settings.tsx")));
const css = await read("src/cockpit/tips/tips.css");
check("it rises once and never loops; reduced motion turns it off", /animation: ck-tip-rise 0\.42s/.test(css) && !/infinite/.test(css) && /prefers-reduced-motion/.test(css));

console.log(`\nguided tips: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
