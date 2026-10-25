/**
 * The Privacy Policy and the Terms and Conditions (src/content/legal.ts;
 * docs/LEGAL-PAGES.md).
 *
 * Holds the owner's rule (the company named, Southern Digital Technologies LLC; no address, no email address, the
 * way to reach us is Messages) and the statements that must stay true of the
 * site. If one of these fails because the site changed, change the words in
 * legal.ts to match the site: never the other way round.
 */
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(resolve(tmpdir(), "legal-pages-"));
const outfile = resolve(dir, "legal.mjs");
await build({ entryPoints: [resolve(root, "src/content/legal.ts")], bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent" });
const { PRIVACY_POLICY, TERMS, LEGAL_UPDATED } = await import(pathToFileURL(outfile).href);
rmSync(dir, { recursive: true, force: true });
const read = (path) => readFileSync(resolve(root, path), "utf8");

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) passed += 1;
  else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ""}`);
  }
}

const textOf = (doc) =>
  [doc.title, ...doc.intro, ...doc.sections.flatMap((s) => [s.title, ...s.body.flatMap((b) => (typeof b === "string" ? [b] : "sub" in b ? [b.sub] : b.list))])].join("\n");
const privacy = textOf(PRIVACY_POLICY);
const terms = textOf(TERMS);

for (const [name, doc, text] of [["privacy policy", PRIVACY_POLICY, privacy], ["terms", TERMS, terms]]) {
  // --- the owner's rule -----------------------------------------------------------
  // The company is named (the owner, 2026-10-24): Southern Digital Technologies LLC, and no other.
  check(`${name}: names the company that runs it, in its opening`, doc.intro.join(" ").includes("Southern Digital Technologies LLC"));
  const others = text.replace(/Southern Digital Technologies LLC/g, "");
  check(`${name}: no other company name`, !/\b(LLC|L\.L\.C|Inc\.?|Ltd\.?|Limited|Corp\.?|Corporation|GmbH|AEY|Zulu|HireFlow)\b/.test(others), (others.match(/\b(LLC|Inc\.?|Ltd\.?|AEY|Zulu|HireFlow)\b/) ?? [""])[0]);
  check(`${name}: no postal address`, !/\b\d{1,5}\s+[A-Z][a-z]+\s+(Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Suite)\b/.test(text) && !/\bP\.?\s?O\.?\s+Box\b/i.test(text));
  check(`${name}: no email address and no phone number to write to`, !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text) && !/\+?\d[\d\s().-]{8,}\d/.test(text));
  // The company, not the hiring business (the Phase 5 review: "write to the hiring team" reached the business).
  check(`${name}: the way to reach us is Contact us (an applicant) or Help (a hiring team), never Messages to the hiring team`, /Write to us, Southern Digital Technologies LLC, from your account: an applicant opens the account menu and chooses Contact us; a hiring team opens Help\./.test(doc.sections.at(-1).body.join(" ")) && !/write to the hiring team|message us in your account/i.test(text) && doc.sections.at(-1).id === "contact");
  // --- the page can be built and linked to ------------------------------------------
  check(`${name}: dated, and dated the same as the other`, doc.updated === LEGAL_UPDATED && /^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(doc.updated));
  const ids = doc.sections.map((s) => s.id);
  check(`${name}: every section can be jumped to by its own name`, new Set(ids).size === ids.length && ids.every((id) => /^[a-z]+$/.test(id)));
  check(`${name}: no section is empty and nothing is left to fill in`, doc.sections.every((s) => s.body.length > 0 && s.title.trim()) && !/\[[^\]]*\]|TODO|TBD|lorem|XX+/i.test(text));
  check(`${name}: plain sentences (none over 60 words)`, text.split(/(?<=[.!?])\s+|\n/).every((sentence) => sentence.split(/\s+/).length <= 60), text.split(/(?<=[.!?])\s+|\n/).filter((x) => x.split(/\s+/).length > 60)[0]?.slice(0, 80));
  check(`${name}: adults only`, /18 or older/.test(text));
}

// --- what the privacy policy says must be true of the site ----------------------------
check("it says a person, not software, declines an application", /No application is declined by software alone\. A person on the hiring team makes that decision\./.test(privacy));
{
  const scoring = read("supabase/functions/trigger-ava-analysis/index.ts");
  const code = scoring.split("\n").filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*")).join("\n");
  check("…and the scoring code still never declines anyone itself: it only recommends", !/status:\s*["']rejected["']/.test(code) && !/rejected_by_type:\s*["']ava["']/.test(code) && /NEVER auto-rejects/.test(scoring));
}
check("it says what the fairness checks record, that the screen is not recorded, and when the camera is (a job's video introduction, and the spoken interview from start to end; the seventh and eighth Phase 5 reviews)", /We do not record your screen\. We record your camera and microphone only in a video introduction, while you record it, and in a spoken interview, if a job has one, from when it starts until it ends\./.test(privacy) && /it records your camera and microphone, what you say is turned into text, and the text, the audio and the video may be stored/.test(privacy) && /Video introduction, if a job asks for one/.test(privacy) && /leaving the tab or window/.test(privacy) && /developer tools/.test(privacy));
check("…which is what the integrity hook records", ["paste", "contextmenu", "visibilitychange"].every((word) => read("src/hooks/useTestIntegrity.ts").includes(word)));
check("it says the connection check keeps IP addresses and device details", /the IP addresses seen during the check/.test(privacy) && /operating system, browser, screen size/.test(privacy));
check("it says signing keeps the IP address and browser", /your IP address and your browser type/.test(privacy));
check(
  "it says signing keeps the approximate place and the device, which the signing record does (2026-10-11)",
  /the approximate place your internet connection is in/.test(privacy) && /an ID your browser keeps for this site/.test(privacy) &&
    /location_city: entry\.place\?\.city/.test(read("supabase/functions/document-signing/index.ts")) && /hf-device-id/.test(read("src/lib/signerContext.ts")),
);
check("it says a new account (any kind: an applicant's sign-up keeps them too, the Phase 5 review) keeps the campaign tags and the site it came from", /When you make an account: the campaign tags of the link that brought you to the site/.test(privacy) && !/When you make a hiring account/.test(privacy) && /signup_source/.test(read("src/hooks/useAuth.tsx")));
check("it says the page counter uses no cookie and honours Do Not Track", /no cookie and no visitor number, stores no IP address/.test(privacy) && /Do Not Track or Global Privacy Control/.test(privacy));
check("…which the beacon still does", /doNotTrack/.test(read("public/beacon.js")) && /globalPrivacyControl/.test(read("public/beacon.js")) && !/document\.cookie\s*=/.test(read("public/beacon.js")));
check("it says most things are not deleted on a timer, and names what stays after an account is deleted", /Most things are not deleted on a timer\./.test(privacy) && /a count of your test attempts, a block-list entry/.test(privacy) && /how many minutes a spoken interview used/.test(privacy) &&
  // Typing-test starts go with the applications (ON DELETE CASCADE): the tenth Phase 5 review.
  !/start times of typing tests/.test(privacy));
// Only the three ID choices are deleted after opening; a paper the team names is kept, and the Terms and the request screen say so (the tenth Phase 5 review).
check("the Terms say which papers are deleted after opening, and that a named one is kept", /A government ID, NBI clearance or proof of address asked for with its own choice is deleted 24 hours after you first open it\. A paper you name yourself/.test(read("src/content/legal.ts")) && !/ID papers are deleted 24 hours after you first open them\./.test(read("src/content/legal.ts")));
check("…and so does the request screen, with a warning when the named paper is an ID", /The ID papers above \(government ID, NBI clearance, proof of address\) are deleted/.test(read("src/cockpit/components/RequestDocumentsDialog.tsx")) && /\{looksLikeAnId\(other\) && \(/.test(read("src/cockpit/components/RequestDocumentsDialog.tsx")));
{
  // The sixth product review: "kept until you delete it" promised a control
  // that does not exist. A request can be deleted only while nothing has been
  // sent (the live policy, 20261011140000_cancel_only_unanswered_requests.sql);
  // after that only Delete their information (the whole application) or a
  // deleted account removes the file.
  const legal = read("src/content/legal.ts");
  const dialog = read("src/cockpit/components/RequestDocumentsDialog.tsx");
  const cancel = read("supabase/migrations/20261011140000_cancel_only_unanswered_requests.sql");
  check(
    "…and neither promises a deletion the business cannot do: a named paper is kept until the application or the account is deleted (the sixth product review)",
    !/kept until you delete|until you delete it\b|kept until it, the application/i.test(legal + dialog) &&
      /A paper you name yourself \(under \\"Something else\\"\) is kept, even if it is an ID, until the application is deleted \(Delete their information, in the applicant's ⋯ menu\) or the applicant's account is\./.test(legal) &&
      /Any other paper the team asks for by its own name is kept until the application or your account is deleted\./.test(legal) &&
      (dialog.match(/is kept until their application is deleted \(⋯ → Delete their information\) or their account is\./g) ?? []).length === 2,
  );
  check("…which is what the database allows: a request is deleted only while it holds no file and no typed answer", /file_url is null/i.test(cancel) && /answer_text is null/i.test(cancel));
}
{
  // The one timer (docs/DOCUMENT-REQUESTS.md): identity papers, deleted by the
  // document-cleanup function. The page's number and kinds must be the code's.
  const kinds = read("src/lib/documentRequests.ts");
  const cleanup = read("supabase/functions/document-cleanup/index.ts");
  // Since 2026-10-10 (the owner): 24 hours after the team first opens it, or
  // 7 days after it is sent if nobody does.
  const hours = Number((kinds.match(/export const ID_DELETE_HOURS_AFTER_OPENED = (\d+);/) ?? [])[1]);
  const days = Number((kinds.match(/export const ID_DELETE_DAYS_UNOPENED = (\d+);/) ?? [])[1]);
  check(
    "it says identity papers are deleted when the cleanup function deletes them",
    hours > 0 &&
      days > 0 &&
      new RegExp(`is deleted ${hours} hours after someone on the hiring team first opens it, or ${days} days after you send it if nobody opens it`).test(privacy) &&
      new RegExp(`const HOURS_AFTER_OPENED = ${hours};`).test(cleanup) &&
      new RegExp(`const DAYS_UNOPENED = ${days};`).test(cleanup) &&
      /government ID, NBI clearance or proof of address/.test(privacy) &&
      /\["government_id", "nbi_clearance", "proof_of_address"\]/.test(cleanup),
  );
  check("…and that a copy the team downloads is theirs to look after", /A copy they keep is theirs to look after/.test(privacy));
  check("it says opening a requested file is recorded, which the function does", /we record who opened it and when/.test(privacy) && /action: "opened"/.test(read("supabase/functions/requested-document-url/index.ts")));
}
check("it tells people how to delete their account, by the button's own name", /open Settings and choose Delete Account/.test(privacy) && /Delete Account/.test(read("src/pages/Settings.tsx")));
check("it says a profile photo sits at a public address", /A photo you add is stored at a public web address/.test(privacy));
check("it names the companies that handle the information", ["Supabase", "Vercel", "OpenAI", "Resend", "Google Fonts"].every((name) => privacy.includes(name)));
// Notifications go through the browser's own push service (20261021220000_web_push.sql); OneSignal keys were never set.
check("notifications: the browser's push service, not OneSignal (never configured)", /Your browser's own push service/.test(privacy) && !/OneSignal/.test(privacy));
check("it does not claim a provider the site does not use", !/Stripe|ElevenLabs|Google Analytics|Facebook|Meta Pixel|Mixpanel|Segment/.test(privacy));
check("it says we do not sell information and show no advertising", /We do not sell your information\. We do not use it for advertising\./.test(privacy) && /no advertising cookies/.test(privacy));
check(
  "it does not promise a retention period or a security guarantee the site cannot keep (the identity-paper timer, checked above, is the only one)",
  !/\b\d+\s+(days|months|years)\b/.test(privacy.replace(/is deleted \d+ hours after someone on the hiring team first opens it, or \d+ days after you send it if nobody opens it/g, "")) && !/guarantee|100%|completely secure|never be/i.test(privacy),
);

// --- the terms -------------------------------------------------------------------------
check("applying promises nothing, and the hiring team decides", /Applying does not guarantee an interview, an offer or a job\./.test(terms) && /made by the hiring team for that job/.test(terms));
check("an applicant must do their own work", /Your answers must be your own/.test(terms) && /Do not use AI tools, scripts or copied answers/.test(terms));
check("an offer is only an offer in writing", /An offer is only an offer when the hiring team sends it to you in writing\./.test(terms));
check("a hiring team's decisions are its own, and AI is not to be relied on alone", /you must review each applicant and decide yourself/.test(terms) && /must not rely on them alone/.test(terms));
check("no price is charged, and none without agreement", /free at the moment/.test(terms) && /nothing will be charged without your agreement/.test(terms) && !/\$\s?\d|USD\s?\d|per month|subscription/i.test(terms));
check("signing electronically is explained, and can be declined", /typing or drawing your name/.test(terms) && /You can decline to sign\./.test(terms));
check("it takes away no right the law protects", /Nothing in these terms takes away a right the law gives you that cannot be taken away\./.test(terms));
check("it names no governing law or court (there is no company named to hang one on yet)", !/governed by|jurisdiction|courts? of|arbitrat/i.test(terms));

// --- the pages ---------------------------------------------------------------------------
const page = read("src/components/LegalPage.tsx");
check("each page is its words and nothing else: no logo, no brand name in the frame", !/HireFlow|Zulu|favicon|<img/.test(page.replace(/\/\*[\s\S]*?\*\//g, "")));
check("the two pages show the two documents and link to each other", /PRIVACY_POLICY/.test(read("src/pages/Privacy.tsx")) && /to: "\/terms"/.test(read("src/pages/Privacy.tsx")) && /TERMS/.test(read("src/pages/Terms.tsx")) && /to: "\/privacy"/.test(read("src/pages/Terms.tsx")));
check("docs/LEGAL-PAGES.md says where each statement was checked and what is still to add", /Where each statement was checked/.test(read("docs/LEGAL-PAGES.md")) && /Still to add/.test(read("docs/LEGAL-PAGES.md")));

console.log(`legal pages: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
