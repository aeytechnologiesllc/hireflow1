#!/usr/bin/env node
/**
 * How the emails look (supabase/functions/_shared/emailLayout.ts, 2026-11-01):
 * the green seal as a hosted PNG (never an SVG, which mail apps drop), sage
 * paper, the app's jade for the button and links, system fonts, and a dark
 * mode for mail apps that ask for one. Presentation only: who may send which
 * email is scripts/notification_access.test.mjs, which runs the real function
 * and reads every email's words (heading first, signature last).
 *
 * Run with: node scripts/email_layout.test.mjs
 */
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const bundle = await build({
  stdin: { contents: 'export * from "./supabase/functions/_shared/emailLayout.ts";\n', resolveDir: ROOT, loader: "ts" },
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  logLevel: "silent",
});
const L = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

// The words as a reader sees them: tags out, entities read (as notification_access reads them).
const textOf = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const html = L.emailShell({
  title: "An update from Zulu Support Team",
  content: `<p>Thank you for applying.</p><p ${L.EMAIL_ATTR.muted}>A quieter line.</p>`,
  button: L.emailButton("View your applications", "https://hireflownow.com/candidate/auth?redirect=%2Fapplications"),
  note: L.emailNote(`<strong>Have a question?</strong> <a href="https://hireflownow.com/x" ${L.EMAIL_ATTR.link}>Message us</a>`),
  signature: "— The Zulu Support Team",
});

{
  check("a whole document that says it reads in light and dark", /^<!doctype html>/.test(html) && /<meta name="color-scheme" content="light dark">/.test(html) && /<meta name="supported-color-schemes" content="light dark">/.test(html));
  const seals = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  check("one image: the seal, a PNG on hireflownow.com, on the icon links' version", seals.length === 1 && /src="https:\/\/hireflownow\.com\/icon-192\.png\?v=9"/.test(seals[0]) && /alt="HireFlow"/.test(seals[0]) && /width="44" height="44"/.test(seals[0]));
  check("…the PNG is the app's own icon in the repo, and no email links an SVG", L.EMAIL_SEAL_URL.endsWith("/icon-192.png?v=9") && readFileSync(path.join(ROOT, "public/icon-192.png")).subarray(1, 4).toString() === "PNG" && !/\.svg/i.test(html));
  check("…and it is the version index.html's icon links carry", new RegExp(`\\?v=${/\?v=(\d+)/.exec(L.EMAIL_SEAL_URL)?.[1]}"`).test(read("index.html")));
  check("the seal comes before the words", html.indexOf("<img") < html.indexOf("<h1"));
  check("the words start with the heading and end with the signature", textOf(html).startsWith("An update from Zulu Support Team") && textOf(html).endsWith("— The Zulu Support Team"), textOf(html).slice(0, 60));
  const style = /<style type="text\/css"><!--([\s\S]*?)--><\/style>/.exec(html)?.[1] ?? null;
  check("the rules sit in a comment with no \">\" in them, so no reader prints them", style !== null && !style.includes(">") && !/<[^>]*$/.test(html.slice(0, html.indexOf("<h1"))));
  check("sage ground, paper card, green ink (the app's Day tokens)", /background:#DEE3D5/.test(html) && /class="hf-card"[^>]*background:#F5F1E6/.test(html) && /color:#1D3329/.test(html));
  check("the button and the links are the jade, the button's words ivory", /class="hf-btn" style="border-radius:10px;background:#0F6B4F;"/.test(html) && /<a href="[^"]+" class="hf-btn"[^>]*color:#F3EFE4/.test(html) && /class="hf-link" style="color:#0F6B4F;/.test(html));
  check("the button is a table cell, so Outlook draws its colour", /<td class="hf-btn"[^>]*>\s*<a href=/.test(html));
  check("system fonts, a serif heading", /font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif/.test(html) && /<h1 style="[^"]*font-family:Georgia/.test(html));
  check("no brass and none of the old ink look in an email", !/#E0B96A|#C9A45E|#14120E;|#FAF7F1|Arial, sans-serif;/.test(html.replace(/@media[\s\S]*$/, "")));
  check("dark mode for a mail app that asks: warm ink grounds, ivory words, the bright jade", /@media \(prefers-color-scheme: dark\)/.test(html) && /\.hf-card \{ background: #221D17 !important;/.test(html) && /\.hf-card \.hf-btn \{ background: #4FBF95 !important; color: #17140F !important; \}/.test(html) && /\[data-ogsc\] \.hf-card/.test(html));
  check("…and every quiet piece is found by its class there", ["hf-muted", "hf-quote", "hf-alert", "hf-note", "hf-link", "hf-sign"].every((c) => new RegExp(`\\.${c}\\b[^{]*\\{[^}]*!important`).test(html)));
  check("the note and the signature come after the button, the signature last", html.indexOf('class="hf-btn"') < html.indexOf('class="hf-note"') && html.indexOf('class="hf-note"') < html.indexOf('class="hf-sign"'));
}

{
  const bare = L.emailShell({ title: "Your code", content: "<p>Here it is.</p>", signature: "— The HireFlow Team" });
  check("no button and no note when there is none", !/hf-btn"|hf-note"/.test(bare.replace(/<style[\s\S]*<\/style>/, "")) && textOf(bare) === "Your code Here it is. — The HireFlow Team");
}

{
  const fn = read("supabase/functions/send-notification-email/index.ts");
  check("the function builds every email through the layout", /import \{ EMAIL_ATTR as A, emailButton, emailNote, emailShell \} from "\.\.\/_shared\/emailLayout\.ts";/.test(fn) && /emailShell\(\{/.test(fn) && (fn.match(/wrapEmail\(/g) ?? []).length >= 28);
  check("…and keeps no colour of its own in a template", !/style="/.test(fn) && !/#666|#333|#111|#14120E|#dc2626/.test(fn));
}

console.log(`\nemail layout: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
