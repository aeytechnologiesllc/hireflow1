#!/usr/bin/env node
/**
 * A job's place decides remote work too (the second Phase 7 product audit):
 * the builder's Type field starts on "Full-time · On-site", and a store that
 * typed only "Remote" as its location got an on-site job with no connection
 * check (src/lib/avaEngine/playbook.ts briefFromForm). And "Manila,
 * Philippines" had no country (src/lib/jobLocation.ts), so the job left the
 * feeds and got no currency. "Edit job" re-decided remote work from the
 * description too, where "our dental office" made a remote job on-site
 * (src/lib/jobLocation.ts isFullyRemoteText).
 *
 * Run with: node scripts/remote_from_location.test.mjs
 */
import { build } from "esbuild";
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

const bundle = await build({
  stdin: {
    contents:
      'export { briefFromForm } from "./src/lib/avaEngine/playbook.ts";\n' +
      'export { inferCountryCode, isFullyRemoteText, placeLine, placeSaysRemote, remoteAfterPlaceEdit } from "./src/lib/jobLocation.ts";\n',
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  alias: { "@": path.join(ROOT, "src") },
  logLevel: "silent",
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

const brief = (location, type = "Full-time · On-site", workMode) =>
  M.briefFromForm({ role: "Customer Support Agent", location, type, workMode, pay: "$15/hr", start: "ASAP", work: "Answer customer chats for our dental office" });
check("Location \"Remote\" with the Type field left on On-site is a remote job", brief("Remote").workMode === "remote");
check("…and \"Work from home (Philippines)\", \"Fully remote\", \"WFH\"", ["Work from home (Philippines)", "Fully remote", "WFH - any timezone"].every((l) => brief(l).workMode === "remote"));
check("a place that says hybrid is hybrid, never remote", brief("Remote / hybrid in Makati").workMode === "hybrid" && brief("Makati", "Full-time · Hybrid").workMode === "hybrid");
check("an office place stays on-site", brief("Austin, TX").workMode === "onsite");
check("the Type field still decides when it says remote", brief("Austin, TX", "Full-time · Remote").workMode === "remote");
for (const [text, code] of [["Manila, Philippines", "PH"], ["Makati City", "PH"], ["Cebu", "PH"], ["Quezon City, Metro Manila", "PH"], ["Singapore", "SG"], ["Austin, TX", "US"], ["Lahore, Pakistan", "PK"]]) {
  check(`${JSON.stringify(text)} is in ${code}`, M.inferCountryCode(text) === code, String(M.inferCountryCode(text)));
}

const R = M.isFullyRemoteText;
check("place \"Remote\" with \"dental office\" in the description stays remote", R("Remote", "full-time", "Answer calls and chats for our dental office.") === true);
check("…and \"Work from home\" with \"office manager\" in it", R("Work from home (Philippines)", "full-time", "Support our office manager with patient emails.") === true);
check("a description that puts the work in the office makes it not remote", R("Remote", "full-time", "You will work in our office in Makati three days a week.") === false && R("Remote", "full-time", "This is a hybrid role.") === false);
check("an office place is not remote", R("Austin, TX", "full-time", "Answer customer chats.") === false && R("Makati office", "full-time", "") === false);
check("a description that says work from home makes an unplaced job remote", R("Philippines", "full-time", "Fully remote, work from home.") === true);
check("hybrid in the place is never fully remote", R("Remote / hybrid in Makati", "full-time", "") === false && R("Work from home, hybrid", "full-time", "") === false);
check("nothing written is not remote", R("", "", "") === false);

// The third Phase 7 product audit: the common Philippine ways of saying it.
for (const place of ["Home-based, Philippines", "Philippines (Remote)", "Anywhere", "Worldwide", "100% Remote", "Makati (WFH)", "Telecommute", "Manila - Remote", "Work-from-home", "Remote (worldwide)"]) {
  check(`place ${JSON.stringify(place)} is a remote job`, brief(place).workMode === "remote", brief(place).workMode);
}
for (const type of ["Work from home", "WFH", "Full-time · Remote", "Part-time · Work from home"]) {
  check(`Type ${JSON.stringify(type)} is a remote job`, brief("Cebu", type).workMode === "remote", brief("Cebu", type).workMode);
}
for (const place of ["Makati office", "On-site, Pasig", "Remote-friendly, Austin", "Not remote - Cebu", "Hybrid (Taguig)"]) {
  check(`place ${JSON.stringify(place)} is not a remote job`, brief(place).workMode !== "remote", brief(place).workMode);
}
check("placeSaysRemote: remote / not_remote / neither", R && M.placeSaysRemote("Home-based") === "remote" && M.placeSaysRemote("No remote work") === "not_remote" && M.placeSaysRemote("Cebu") === null && M.placeSaysRemote("") === null);
check("a description's \"on-site\" work is not where the agent sits (book on-site repair visits)", R("Work from home", "full-time", "Schedule on-site visits for our technicians and book on-site repair visits.") === true && R("100% remote", "full-time", "No onsite work.") === true && R("Remote", "full-time", "This is not an on-site role.") === true);
check("…but an on-site role in the description is", R("Remote", "full-time", "This is an on-site role in Makati.") === false && R("Remote", "full-time", "You will work on-site three days a week.") === false);
check("Edit job: a city edit keeps a remote job remote (made remote by the Type field)", M.remoteAfterPlaceEdit(true, "Cebu", "full-time", "Answer chats.") === true);
check("…an on-site job stays on-site", M.remoteAfterPlaceEdit(false, "Cebu", "full-time", "") === false);
check("…a place that says remote or office decides", M.remoteAfterPlaceEdit(false, "Remote (Philippines)", "full-time", "") === true && M.remoteAfterPlaceEdit(true, "Makati office", "full-time", "") === false);
check("…a new job with no history reads the text", M.remoteAfterPlaceEdit(null, "Austin, TX", "full-time", "") === false);
for (const [text, code] of [["Laguna Beach, CA", "US"], ["Laguna Niguel, California, USA", "US"], ["Laguna Hills", null], ["Santa Rosa, Laguna", "PH"], ["Albuquerque, New Mexico", "US"], ["Mexico City", "MX"], ["Makati, Metro Manila", "PH"]]) {
  check(`${JSON.stringify(text)} is in ${code}`, M.inferCountryCode(text) === code, String(M.inferCountryCode(text)));
}

// The fourth product audit and the eleventh Phase 4 review.
for (const place of ["Remote (home office required)", "Remote, US office hours", "Fully remote (no office)", "Remote - back office support", "Work at home", "Telework", "Virtual", "WFH - US office hours", "Remote (US office hours)"]) {
  check(`place ${JSON.stringify(place)} is a remote job`, brief(place).workMode === "remote" && R(place, "full-time", "") === true, brief(place).workMode);
}
for (const place of ["Makati City (Not WFH)", "Ortigas (No WFH)", "Anywhere in Metro Manila", "Makati office"]) {
  check(`place ${JSON.stringify(place)} is not a remote job`, brief(place).workMode !== "remote", brief(place).workMode);
}
check("Type \"Full-time · No WFH\" is not remote", brief("Cebu", "Full-time · No WFH").workMode !== "remote");
check("a description's in-office appointments and office manager are not where the agent sits", R("Remote", "full-time", "Book in-office appointments for our dentists and report to our office manager.") === true);
for (const [text, code] of [["Makati City (US Account)", "PH"], ["Cebu City (US Shift)", "PH"], ["Quezon City - UK Account", "PH"], ["Makati (Canada account)", "PH"], ["Pasig, Mandaluyong, or Makati", "PH"], ["Portland, OR", "US"], ["Remote (US only)", "US"]]) {
  check(`${JSON.stringify(text)} is in ${code}`, M.inferCountryCode(text) === code, String(M.inferCountryCode(text)));
}

// The fifth product review and the twelfth Phase 4 review: a negated on-site, office or hybrid word says remote; "Online" is
// remote; anywhere in a country is remote, anywhere in a city is not; a place partly at home is hybrid.
for (const place of ["Remote (no onsite)", "Remote; not on-site", "Remote — never on-site", "Fully remote - non-office based", "Remote, no on-site visits", "100% remote - not office based", "Remote (100%, no hybrid)", "Online", "Philippines (online)", "Anywhere in the Philippines", "Anywhere in the US"]) {
  check(`place ${JSON.stringify(place)} is a remote job`, brief(place).workMode === "remote" && R(place, "full-time", "") === true, `${brief(place).workMode} ${R(place, "full-time", "")}`);
}
for (const place of ["Remote with occasional onsite", "WFH or Onsite (Makati)"]) {
  check(`place ${JSON.stringify(place)} is a hybrid job, not a remote or an on-site one`, brief(place).workMode === "hybrid" && R(place, "full-time", "") === false, brief(place).workMode);
}
for (const place of ["Onsite (no WFH)", "Pasig (Onsite, no remote)", "Not remote - Cebu"]) {
  check(`place ${JSON.stringify(place)} is still an on-site job`, brief(place).workMode === "onsite", brief(place).workMode);
}
check("a negated on-site word keeps an edited job remote", M.remoteAfterPlaceEdit(false, "Remote (no onsite)", "full-time", "") === true && M.placeSaysRemote("Remote — never on-site") === "remote");
// Words about the clients or the hours never pick the country, and "PH", BGC and Ortigas are the Philippines.
for (const [text, code] of [["Makati (US-based clients)", "PH"], ["Cebu - US healthcare account", "PH"], ["Quezon City (US Mortgage Account)", "PH"], ["Remote, US office hours", null], ["BGC (U.S. client)", "PH"], ["Remote, PH", "PH"], ["Iloilo (US healthcare)", "PH"], ["Makati, US-based company", "PH"], ["Ortigas (USA account)", "PH"], ["Remote - US", "US"], ["United States", "US"], ["Phoenix, AZ", "US"]]) {
  check(`${JSON.stringify(text)} is in ${code}`, M.inferCountryCode(text) === code, String(M.inferCountryCode(text)));
}

// The thirteenth Phase 4 review: "-based" is a client's only before a client word, so where the people are picks the country
// ("US-based applicants only"); a negation reaches the next word in a list ("no hybrid or onsite"), never past a comma.
for (const [text, code] of [["Remote (US-based applicants only)", "US"], ["Remote, US-based candidates only", "US"], ["US-based remote", "US"], ["Remote — US-based team", "US"], ["Remote, USA-based only", "US"], ["Remote (Canada-based employees only)", "CA"], ["Remote - UK-based applicants", "GB"], ["Remote (Australia-based candidates)", "AU"], ["Makati (US-based clients)", "PH"], ["Makati, US-based company", "PH"]]) {
  check(`${JSON.stringify(text)} is in ${code}`, M.inferCountryCode(text) === code, String(M.inferCountryCode(text)));
}
for (const place of ["Remote (no hybrid or onsite)", "Remote, never onsite or hybrid", "Remote - no hybrid/onsite"]) {
  check(`place ${JSON.stringify(place)} is a remote job`, brief(place, "Full-time").workMode === "remote" && R(place, "full-time", "") === true, `${brief(place, "Full-time").workMode} ${R(place, "full-time", "")}`);
}
check("…while \"No hybrid, onsite only\" is still on-site", brief("No hybrid, onsite only", "Full-time").workMode === "onsite");

{
  const editor = (await import("node:fs")).readFileSync(path.join(ROOT, "src/pages/CreateJob.tsx"), "utf8");
  check("Edit job: remote work is the business's own switch, shown beside the place, never re-worked unseen", /isEditMode && existingJob\s*\? formData\.is_remote === true/.test(editor) && /data-edit-remote/.test(editor) && /handleChange\("is_remote", remoteAfterPlaceEdit\(/.test(editor));
}

check("lists show a remote job's own place, never just \"Remote\"", M.placeLine("Remote (US only)", true) === "Remote (US only)" && M.placeLine("Philippines", true) === "Remote · Philippines" && M.placeLine("", true) === "Remote" && M.placeLine("Makati", false) === "Makati" && M.placeLine("", false) === null);

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
