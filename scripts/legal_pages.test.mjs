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
import { mkdtempSync, rmSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(resolve(tmpdir(), "legal-pages-"));
const outfile = resolve(dir, "legal.mjs");
await build({ entryPoints: [resolve(root, "src/content/legal.ts")], bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent" });
const { PRIVACY_POLICY, TERMS, LEGAL_UPDATED } = await import(pathToFileURL(outfile).href);
// Delete Account's confirm (the twelfth Phase 5 review), held to the policy below.
const confirmFile = resolve(dir, "deleteAccount.mjs");
await build({ entryPoints: [resolve(root, "src/content/deleteAccount.ts")], bundle: true, format: "esm", platform: "node", outfile: confirmFile, logLevel: "silent" });
const deleteAccount = await import(pathToFileURL(confirmFile).href);
rmSync(dir, { recursive: true, force: true });
const read = (path) => readFileSync(resolve(root, path), "utf8");
const show = (v) => JSON.stringify(v);

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
{
  // The twelfth Phase 5 review (finding 3): Delete Account's confirm said
  // "All your data ... will be permanently deleted", while the record of each
  // signature stays (prevent_audit_delete refuses any delete; delete-account's
  // own purge of it failed and logged an error every time), a few technical
  // records stay, and a team member's chats and sent documents go to the
  // business. The confirm's words are deleteAccountWords, held to the policy.
  const settings = read("src/pages/Settings.tsx");
  const fn = read("supabase/functions/delete-account/index.ts");
  const ops = (fn.match(/const deleteOperations = \[([\s\S]*?)\] as const;/) ?? [])[1] ?? "";
  const words = Object.fromEntries(["applicant", "business", "team"].map((who) => [who, deleteAccount.deleteAccountWords(who)]));
  check(
    "the policy says the signing record stays after Delete Account, as proof, and what it holds",
    /The record of each document you signed \(your name, email address, the time, your IP address, browser, device and approximate place\) is kept as proof of the signature, even after you delete your account\./.test(privacy) && !/Signed documents and their records may also be kept/.test(privacy),
  );
  check(
    "…and so does Delete Account's confirm, for every kind of account, with the technical records the policy lists",
    Object.values(words).every((w) => w.kept[0] === "The record of each document you signed (your name, email address, the time, your IP address, browser, device and approximate place), kept as proof of the signature." && /a count of test attempts, block-list entries and error reports/.test(w.kept[1]) && /the Privacy Policy lists/.test(w.kept[1])) &&
      /a count of your test attempts, a block-list entry if the account was blocked/.test(privacy) && /and error reports\./.test(privacy),
    show(words),
  );
  check(
    "…which is what delete-account does: it never deletes the signing record (and no longer tries)",
    ops.length > 0 && !/document_audit_logs/.test(ops) && /prevent_audit_delete refuses any delete/.test(fn) && /BEFORE DELETE ON public\.document_audit_logs/.test(read("supabase/migrations/20251215015158_dff41abe-b1cf-4851-b3ff-0665a3e61c65.sql")),
  );
  check(
    "a team member is told their chats and sent documents stay with the business, as the policy says and delete-account does",
    /Your chats with applicants and the documents you sent them stay with the business, under its owner's name\./.test(words.team.deleted) && /On a hiring team, your chats with applicants and the documents you sent them stay with the business, under its owner's name\./.test(privacy) &&
      /update\(\{ sender_id: teamOwner \}\)\.eq\('sender_id', user\.id\)/.test(fn) && /teamOwner \? \['documents', 'message-attachments'\] : \[\]/.test(fn),
  );
  check("a business is told its jobs and their applications go, as delete-account does", /your jobs and every application to them/.test(words.business.deleted) && /\{ table: 'jobs', columns: \['employer_id'\] \}/.test(ops));
  check(
    "…and Settings shows those words, by who is deleting, never \"All your data\"",
    /import \{ deleteAccountWords \} from "@\/content\/deleteAccount";/.test(settings) && /deleteAccountWords\(isEmployer \? "business" : isTeamMember \|\| role === "team_member" \? "team" : "applicant"\)/.test(settings) && /\{deleteWords\.deleted\}/.test(settings) && /deleteWords\.kept\.map\(/.test(settings) && !/All your data/.test(settings),
  );
  // The fourteenth Phase 5 review (finding 3): the Danger Zone row above the
  // button still said "Permanently delete your account and all data" (the
  // applicant's Settings) and "…and all associated data" (the hiring team's)
  // after the confirm was fixed.
  check(
    "the Delete Account row says what goes and what stays, as the confirm does, for every kind of account",
    /your applications and your files/.test(words.applicant.summary) && /The record of each document you signed and a few technical records stay\./.test(words.applicant.summary) &&
      /your jobs and every application to them/.test(words.business.summary) && /The record of each signed document and a few technical records stay\./.test(words.business.summary) &&
      /Your chats with applicants and the documents you sent them stay with the business\./.test(words.team.summary) &&
      Object.values(words).every((w) => /^Permanently delete your account\b/.test(w.summary) && !/\ball (associated )?data\b/i.test(w.summary)),
    show(Object.fromEntries(Object.entries(words).map(([who, w]) => [who, w.summary]))),
  );
  check(
    "…and both of Settings' layouts (applicant and hiring team) show that row, never \"all data\"",
    (settings.match(/\{deleteWords\.summary\}/g) ?? []).length === 2 && !/\ball (associated )?data\b/i.test(settings),
  );
  // The fourteenth Phase 5 review (finding 1): contact is recorded when it is
  // made (private.business_contacts), so a report counts after the business
  // deletes its messages or the application. The policy names that note, and
  // it goes with the account, as the table's foreign keys make it.
  const contacts = (() => {
    try {
      return read("supabase/migrations/20261025670000_contact_kept_when_made.sql");
    } catch {
      return "";
    }
  })();
  check(
    "it names the note of how each business was in touch, kept for reports, and says it goes with the account, as the record's keys make it",
    /So is a note of each business you applied to and of how it was in touch with you \(a message, a request for papers, a document or an interview\), kept so that a report you make about a business still counts if it deletes them\./.test(privacy) &&
      /employer_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/.test(contacts) && /person_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/.test(contacts),
  );
}
{
  // The twelfth Phase 5 review (finding 4): the policy said to withdraw to
  // stop a job's emails, but withdrawal ends at "reviewing" (the live delete
  // policy; Applications.tsx offers it only then).
  const apps = read("src/pages/Applications.tsx");
  check(
    "it says until when an application can be withdrawn, and what someone at a later stage can do",
    /Withdraw an application: open Applications\. You can withdraw until the hiring team invites you to an interview, offers you the job or turns you down, and while you have signed nothing for it\./.test(privacy) &&
      /Once the hiring team has invited you to an interview, offered you the job or turned you down, it can no longer be withdrawn\. Then tell the hiring team in Messages that you are no longer interested, so that they can close your application or delete your information, or write to us from Contact us and we will pass it on\./.test(privacy),
  );
  check("…which is when Applications offers Withdraw (before the interview, the offer, the hire or a decline)", /const canWithdraw = \["in_progress", "pending", "reviewing"\]\.includes\(String\(application\.status \?\? ""\)\);/.test(apps));
}
{
  // The twelfth Phase 5 review (finding 5): "the one automatic refusal" was
  // the block list, while the database also refuses an under-18 answer and a
  // re-application within 30 days of withdrawing.
  const migrations = (name) => readdirSync(resolve(root, "supabase/migrations")).filter((f) => f.endsWith(".sql")).some((f) => read(`supabase/migrations/${f}`).includes(name));
  check(
    "it names every automatic refusal: the block list, the under-18 answer and the month after withdrawing, and the hourly wait",
    /The site itself turns an application away in only three cases: the hiring team has blocked the account, the answer to "Are you 18 or older\?" is No, or the same account withdrew from that job less than a month before\. It also asks anyone who starts a great many applications in one hour to wait a little\./.test(privacy) && !/The one automatic refusal/.test(privacy),
  );
  check("…which are the database's own refusals", ["applications_refuse_blocked", "applications_refuse_under_18", "applications_refuse_recent_withdrawal", "too_many_applications"].every(migrations) && /interval '30 days'/.test(read("supabase/migrations/20261025350000_applicant_writes_round2.sql")));
}
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
{
  // The fifteenth Phase 5 review (finding 1): after a reopen the same three
  // people paused a business again, for good. Someone whose report an admin
  // closed counts again only once the business is in touch with them after
  // that (report_already_heard); the Terms say so, as the pause reads it.
  const heard = (() => {
    try {
      return read("supabase/migrations/20261025680000_reports_heard_stay_heard.sql");
    } catch {
      return "";
    }
  })();
  check(
    "the pause rule says a report already looked at counts again only after the business is in touch again, as employer_reports_auto_pause reads it",
    /When three different people the business has been in touch with \(by message, a document to sign, a request for papers, or an interview\) report it, it pauses by itself while we look/.test(terms) &&
      /Once we have looked at someone's report and closed it, a new report from them counts toward this again only if the business is in touch with them after that\./.test(terms) &&
      /AND NOT public\.report_already_heard\(NEW\.employer_id, r\.reporter_id\)/.test(heard) && /AND since\.last_at > done\.closed_at/.test(heard),
  );
}

// --- the pages ---------------------------------------------------------------------------
const page = read("src/components/LegalPage.tsx");
check("each page is its words and nothing else: no logo, no brand name in the frame", !/HireFlow|Zulu|favicon|<img/.test(page.replace(/\/\*[\s\S]*?\*\//g, "")));
check("the two pages show the two documents and link to each other", /PRIVACY_POLICY/.test(read("src/pages/Privacy.tsx")) && /to: "\/terms"/.test(read("src/pages/Privacy.tsx")) && /TERMS/.test(read("src/pages/Terms.tsx")) && /to: "\/privacy"/.test(read("src/pages/Terms.tsx")));
check("docs/LEGAL-PAGES.md says where each statement was checked and what is still to add", /Where each statement was checked/.test(read("docs/LEGAL-PAGES.md")) && /Still to add/.test(read("docs/LEGAL-PAGES.md")));

console.log(`legal pages: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
