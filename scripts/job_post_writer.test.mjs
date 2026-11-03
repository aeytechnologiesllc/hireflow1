#!/usr/bin/env node
/**
 * The free job post writer (public/job-post-writer.js, its page from
 * scripts/build-blog.mjs's toolPage; docs/MARKETING.md): the shift in
 * Philippine time is right in both halves of the year, the post never asks
 * for age or a birth date, and the page is built, listed and sends nothing.
 *
 * Run with: node scripts/job_post_writer.test.mjs
 */
import path from "node:path";
import os from "node:os";
import { mkdtempSync, readFileSync } from "node:fs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
await import(path.join(ROOT, "public/job-post-writer.js"));
const J = globalThis.HFJobPost;
const B = await import(path.join(ROOT, "scripts/build-blog.mjs"));

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

const ny = J.manilaHours("America/New_York", "09:00", "17:00", 2026);
check("US Eastern 9 to 5 is 10 p.m. to 6 a.m. in Manila on standard time, 9 p.m. to 5 a.m. on daylight time", ny && !ny.same && ny.std === "10:00 PM to 6:00 AM" && ny.dst === "9:00 PM to 5:00 AM", JSON.stringify(ny));
const az = J.manilaHours("America/Phoenix", "09:00", "17:00", 2026);
check("Arizona never changes its clocks: one Philippine time all year", az && az.same && az.ph === "12:00 AM to 8:00 AM", JSON.stringify(az));
const syd = J.manilaHours("Australia/Sydney", "09:00", "17:00", 2026);
check("Sydney's daylight time is in January: 6 a.m. then, 7 a.m. in July", syd && !syd.same && syd.dst === "6:00 AM to 2:00 PM" && syd.std === "7:00 AM to 3:00 PM", JSON.stringify(syd));
const night = J.manilaHours("America/New_York", "22:00", "06:00", 2026);
check("a shift past midnight ends the next day", night && night.own === "10:00 PM to 6:00 AM" && night.std === "11:00 AM to 7:00 PM", JSON.stringify(night));
const mnl = J.manilaHours("Asia/Manila", "08:00", "16:00", 2026);
check("a business in the Philippines keeps its own hours", mnl && mnl.same && mnl.own === "8:00 AM to 4:00 PM");
check("a missing time gives no hours, not a wrong one", J.manilaHours("America/New_York", "", "17:00", 2026) === null);

const base = { kind: "dental", business: "Bright Smile Dental", channel: "both", chats: "3", tz: "America/New_York", start: "09:00", end: "17:00", days: "Monday to Friday", schedule: "full", pay: "600", currency: "USD", period: "month", experience: "2", tools: "Zendesk", where: "ph", privateInfo: "patient" };
const post = J.buildPost(base, 2026);
check("the title names the channel and remote", post.startsWith("Customer Service Representative (Chat and Email), Remote, Full Time"));
check("the shift is in both time zones, with the clock change explained", post.includes("9:00 AM to 5:00 PM US Eastern time") && post.includes("10:00 PM to 6:00 AM Philippine time while our clocks are on standard time") && post.includes("does not change its clocks"));
check("chats at once and email both appear for chat and email", post.includes("up to 3 chats at a time") && post.includes("Answer customer emails"));
check("the private details are named", post.includes("You will see patient records"));
check("the pay is stated as given", post.includes("USD 600 a month."));
const variants = [post, J.buildPost({ ...base, channel: "email", pay: "", where: "anywhere", kind: "other", kindText: "a travel agency" }, 2026), J.buildPost({}, 2026)];
check("no post ever asks for age, a birth date or an age bracket (RA 10911)", variants.every((p) => !/\b(age|aged|birth|years old|fresh graduate|below \d|under \d)\b/i.test(p)), variants.find((p) => /\bage\b/i.test(p)) || "");
check("an email-only post has no live chat line", !variants[1].includes("live chat,") && !variants[1].includes("chats at a time"));
check("an empty form still gives a whole post with gaps to fill", variants[2].includes("ABOUT US") === true && variants[2].includes("(Add the pay") && variants[2].includes("HOW TO APPLY"));
check("text typed in is kept on one line and cut to size", !J.buildPost({ ...base, business: "A\nB\u0007C" + "x".repeat(300) }, 2026).includes("\u0007") && J.buildPost({ ...base, business: "x".repeat(300) }, 2026).split("\n")[3].length < 140);

const src = readFileSync(path.join(ROOT, "public/job-post-writer.js"), "utf8");
check("the writer sends nothing anywhere (no fetch, beacon, XHR or form post)", !/\bfetch\(|sendBeacon|XMLHttpRequest|\.submit\(\)|new Image\(/.test(src));

const out = mkdtempSync(path.join(os.tmpdir(), "jpw-"));
B.buildBlog({ outDir: out });
const page = readFileSync(path.join(out, "blog", B.TOOL_SLUG, "index.html"), "utf8");
check("the page is built under the guides, with its own canonical", page.includes(`<link rel="canonical" href="https://hireflownow.com/blog/${B.TOOL_SLUG}">`));
check("it loads the writer as a file (no inline script: the CSP needs no new hash)", page.includes('<script src="/job-post-writer.js" defer></script>') && !/<script>(?!\s*<\/script>)/.test(page));
check("it carries the page counter and the sign-up tags", page.includes('<script src="/beacon.js" defer></script>') && page.includes(`utm_campaign=${B.TOOL_SLUG}`));
check("its form asks nothing about age", !/name="(age|dob|birth)/i.test(page) && !/date of birth/i.test(page.replace(/Collect the date of birth after the hire/g, "")));
check("the blog sitemap and the list both link it", readFileSync(path.join(out, "blog-sitemap.xml"), "utf8").includes(`/blog/${B.TOOL_SLUG}</loc>`) && readFileSync(path.join(out, "blog", "index.html"), "utf8").includes(`href="/blog/${B.TOOL_SLUG}"`));

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
