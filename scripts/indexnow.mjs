#!/usr/bin/env node
/**
 * Tells Bing (and the other IndexNow engines: Yandex, Naver, Seznam) about every
 * page of the public site: the front page, the articles, Open jobs, Careers,
 * Privacy and Terms. Run it after publishing or changing an article.
 *
 * Job pages and careers pages (/candidate/job/…, /c/…) are left out: the ping on
 * every publish and close went with Google Jobs on 2026-10-05 (87f7628), and
 * search engines still find job pages through the sitemap.
 *
 * Google takes no ping: its pages are asked for in Search Console (docs/SEO.md).
 *
 * Run with: node scripts/indexnow.mjs            (sends)
 *           node scripts/indexnow.mjs --dry-run  (lists what it would send)
 */
const SITE = "https://hireflownow.com";
// Served from public/<key>.txt, which holds the key itself.
const KEY = "8f1bfc75cd683af0c7f05fe79664ec51";
const dryRun = process.argv.includes("--dry-run");

async function locs(sitemapPath) {
  const res = await fetch(`${SITE}${sitemapPath}`);
  if (!res.ok) throw new Error(`${sitemapPath}: HTTP ${res.status}`);
  return [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

const urls = [...new Set([...(await locs("/sitemap.xml")), ...(await locs("/blog-sitemap.xml"))])].filter((u) => {
  const path = new URL(u).pathname;
  return !path.startsWith("/candidate/job/") && !path.startsWith("/c/");
});

console.log(`${urls.length} pages:\n  ${urls.join("\n  ")}`);
if (dryRun) process.exit(0);

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(SITE).host, key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList: urls }),
});
// 200: taken. 202: taken, the key is still being checked. Anything else is refused.
console.log(`IndexNow answered ${res.status} ${res.statusText}${res.ok ? "" : `: ${await res.text()}`}`);
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
