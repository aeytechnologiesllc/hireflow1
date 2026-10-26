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
      'export { briefFromForm, DEFAULT_JOB_TYPE } from "./src/lib/avaEngine/playbook.ts";\n' +
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

// The fourteenth Phase 4 review: "-based" is an optional prefix on the kind of account, client, company, brand, business or
// startup, so a Philippine place for a US-based one stays the Philippines (it was saved as a US job paid in dollars when the
// geocoder missed), while where the people are still picks the country (above); "U.S." with its dots is the US; a list
// negation starts at remote or WFH too; and a remote word in the description is never a negated one.
for (const [text, code] of [["Makati (US-based healthcare account)", "PH"], ["Cebu City - US-based healthcare account", "PH"], ["Quezon City | UK-based e-commerce brand", "PH"], ["Taguig (Australia-based telco account)", "PH"], ["Iloilo (US-based healthcare)", "PH"], ["Davao City - US-based retail account", "PH"], ["Ortigas (US-based mortgage company)", "PH"], ["BGC Taguig - US-based tech startup", "PH"], ["Pasig | Canada-based insurance company", "PH"], ["BGC (USA-based SaaS client)", "PH"], ["Makati (U.S.-based healthcare account)", "PH"], ["Remote - U.S. only", "US"], ["Remote (U.S. only)", "US"], ["Remote — US-based team", "US"], ["Remote (US-based applicants only)", "US"]]) {
  check(`${JSON.stringify(text)} is in ${code}`, M.inferCountryCode(text) === code, String(M.inferCountryCode(text)));
}
check("place \"Anywhere in the U.S.\" is a remote job in the US", brief("Anywhere in the U.S.", "Full-time").workMode === "remote" && M.inferCountryCode("Anywhere in the U.S.") === "US", `${brief("Anywhere in the U.S.", "Full-time").workMode} ${M.inferCountryCode("Anywhere in the U.S.")}`);
for (const place of ["Onsite (no remote or hybrid)", "No WFH or hybrid. Onsite in Taguig", "Not remote or hybrid - Onsite in Cebu"]) {
  check(`place ${JSON.stringify(place)} is an on-site job, not a hybrid one`, brief(place, "Full-time").workMode === "onsite", brief(place, "Full-time").workMode);
}
check("a negated remote word in the description is no remote job (\"Onsite only, no WFH\", \"not a work from home job\")", R("Makati", "full-time", "Onsite only, no WFH. Answer customer chats.") === false && R("Cebu", "full-time", "This is not a work from home job.") === false && R("Philippines", "full-time", "Permanent work from home.") === true);
{
  const mode = (role, work) => M.briefFromForm({ role, location: "Cebu City", type: "Full-time · On-site", pay: "", start: "ASAP", work }).workMode;
  check("the title or What they do saying so makes a job remote, as Publish reads them", mode("Customer Service Representative", "Permanent work from home. Answer customer chats.") === "remote" && mode("Chat Support Agent", "This is a WFH role. Reply to customer chats.") === "remote" && mode("Work From Home Chat Support Agent", "Reply to customer chats.") === "remote");
  check("…never a negated one or a perk", mode("Customer Service Representative", "Onsite only, no WFH. Answer customer chats.") === "onsite" && mode("Customer Service Representative", "This is not a work from home job.") === "onsite" && mode("Front Desk Receptionist", "Greet visitors at our office and answer phones.\nBenefits:\n- Work from home Fridays\n- HMO") === "onsite" && mode("Chat Support Agent", "Reply to customer chats.") === "onsite");
}

// The fifteenth Phase 4 review: What they do makes a job remote only by a line or sentence that is nothing but the setup, and
// the title never when it says on site too (any other "WFH" turned on-site jobs remote, and Publish saved them is_remote with
// no currency); "-based" before any word but a person is the client's ("US-based BPO" is a client, "US-based agents" are where
// the people are); a company or a brand is a client only after "-based" ("Remote (US company)" is the US).
{
  const mode = (role, location, work) => M.briefFromForm({ role, location, type: "Full-time · On-site", pay: "", start: "ASAP", work }).workMode;
  for (const [role, location, work] of [
    ["Customer Service Representative", "Makati City", "Answer customer calls for our telco account. Work setup: Onsite. Possible WFH after regularization."],
    ["Customer Service Representative", "Makati City", "Answer customer calls. WFH is not available for this role."],
    ["Customer Service Representative", "Makati City", "Answer customer calls. Work from home: not applicable."],
    ["Customer Service Representative", "Makati City", "Answer customer calls. WFH: No"],
    ["Customer Service Representative", "Makati City", "Answer customer calls. WFH option after probation."],
    ["Customer Service Representative", "Makati City", "Answer customer calls. Must have WFH experience."],
    ["Customer Service Representative", "Cebu City", "Answer customer calls. Onsite for now; WFH after 6 months."],
    ["Customer Service Representative", "Makati City", "Help customers who work from home set up their internet."],
    ["CSR (Onsite / WFH)", "Makati", "Answer customer chats."],
  ]) check(`${JSON.stringify(role)} at ${location}, "${work}", is built on site`, mode(role, location, work) === "onsite", mode(role, location, work));
  for (const [role, location, work] of [
    ["Customer Service Representative", "Philippines", "Answer customer chats. Permanent work from home."],
    ["Chat Support Agent", "Cebu City", "This is a WFH role. Reply to customer chats."],
    ["Work From Home Chat Support Agent", "Cebu City", "Reply to customer chats."],
    ["Customer Service Representative", "Quezon City", "Answer calls. Fully remote."],
    ["Customer Service Representative", "Davao City", "Answer customer emails.\n100% remote"],
  ]) check(`${JSON.stringify(role)} at ${location}, "${work}", is built remote`, mode(role, location, work) === "remote", mode(role, location, work));
}
for (const [text, code] of [
  ["Makati (US-based BPO)", "PH"], ["Pasig (US-based BPO)", "PH"], ["Taguig (UK-based BPO)", "PH"], ["Makati (US-based firm)", "PH"], ["Makati (US-based clinic)", "PH"],
  ["Cebu City - US-based call center", "PH"], ["Quezon City (US-based agency)", "PH"], ["Clark, Pampanga | UK-based travel agency", "PH"], ["Davao City (US-based online store)", "PH"],
  ["Remote (US-based applicants only)", "US"], ["Remote — US-based team", "US"], ["Remote (Canada-based employees only)", "CA"], ["Remote (US-based agents)", "US"],
  ["Remote (US-based preferred)", "US"], ["Remote - UK-based staff only", "GB"],
  ["Remote (US company)", "US"], ["US company, remote", "US"], ["Remote (UK company)", "GB"], ["Remote - US brand", "US"],
  ["Makati, US-based company", "PH"], ["Ortigas (US-based mortgage company)", "PH"],
]) {
  check(`${JSON.stringify(text)} is in ${code}`, M.inferCountryCode(text) === code, String(M.inferCountryCode(text)));
}

// The sixteenth Phase 4 review: the setup line in the forms posts write it in (a bullet, a "Work setup:" label, "This position
// is fully remote.", "WFH (Permanent)") and a WFH title with its on-site training are remote, while the fifteenth's on-site
// lines stay on site; a client's "-based" word or company is the client's only when the rest still names a place.
{
  const mode = (role, location, work) => M.briefFromForm({ role, location, type: "Full-time · On-site", pay: "", start: "ASAP", work }).workMode;
  for (const [role, location, work] of [
    ["Customer Service Representative", "Philippines", "Answer customer chats and emails for our US client.\nWork setup: Permanent WFH"],
    ["Customer Service Representative", "Philippines", "Answer customer chats and emails.\nWork Setup: Work from home"],
    ["Chat Support Agent", "Philippines", "Reply to customer chats about orders.\nSetup: WFH"],
    ["Customer Service Representative", "Philippines", "Handle inbound calls.\nWork Arrangement: Permanent Work From Home"],
    ["Customer Service Representative", "Philippines", "Handle inbound calls for a US telco account.\nWork arrangement: Remote"],
    ["Chat Support Agent", "Philippines", "Reply to customer chats about orders and refunds.\nPermanent work-from-home"],
    ["Chat Support Agent", "Philippines", "WFH (Permanent)\nReply to customer chats about orders and refunds."],
    ["Customer Service Representative", "Philippines", "Job details:\n- Full-time\n- Permanent WFH\n- Night shift\n\nAnswer customer chats and emails."],
    ["Chat Support Agent", "Philippines", "Reply to customer chats.\n\nJob Highlights:\n• Work from home\n• Day shift\n• 25K monthly"],
    ["Customer Service Representative", "Cebu City", "What to expect:\n* 100% WFH\n* US holidays off\nHandle inbound calls for a US client."],
    ["Customer Service Representative", "Philippines", "- Permanent work from home\n- Answer customer emails and chats"],
    ["Customer Support Specialist", "United States", "This position is fully remote. Answer customer emails and chats for our SaaS product."],
    ["Customer Support Specialist", "United States", "This role is 100% remote. Answer customer emails and chats for our SaaS product."],
    ["WFH Customer Service Representative (Onsite Training)", "Cebu City", "Answer customer chats."],
    ["WFH CSR | Onsite training in Cebu", "Cebu City", "Answer customer chats."],
    ["Customer Service Representative - WFH after 2 weeks onsite training", "Quezon City", "Answer customer calls."],
  ]) check(`${JSON.stringify(role)} at ${location}, "${work.replace(/\n/g, " / ")}", is built remote`, mode(role, location, work) === "remote", mode(role, location, work));
  for (const [role, location, work] of [
    ["Customer Service Representative", "Makati City", "Answer customer calls. Work setup: Onsite. Possible WFH after regularization."],
    ["Customer Service Representative", "Makati City", "Answer customer calls.\n- WFH is not available for this role"],
    ["Customer Service Representative", "Makati City", "Answer customer calls.\nWork setup: Onsite\n- WFH: No"],
    ["Customer Service Representative", "Makati City", "Answer customer calls.\n- Must have WFH experience"],
    ["Customer Service Representative", "Makati City", "Answer customer calls.\nSetup: Onsite"],
    ["Customer Service Representative", "Makati City", "Answer customer calls.\nBenefits:\n- Work from home Fridays"],
    ["CSR (Onsite / WFH)", "Makati", "Answer customer chats."],
    ["CSR - Onsite or WFH", "Makati", "Answer customer chats."],
  ]) check(`${JSON.stringify(role)} at ${location}, "${work.replace(/\n/g, " / ")}", is still built on site`, mode(role, location, work) === "onsite", mode(role, location, work));
}
for (const [text, code] of [
  ["Remote - US-based role", "US"], ["Remote (US-based position)", "US"], ["Remote — US-based job", "US"], ["Remote (UK-based role)", "GB"],
  ["Remote (Canada-based position)", "CA"], ["Remote (USA-based position)", "US"], ["Remote (US-based reps)", "US"], ["Remote (US-based CSRs)", "US"],
  ["Remote (US-based specialists)", "US"], ["Remote (US-based W2 employees)", "US"], ["Remote (US-based workforce)", "US"], ["US-based full-time remote", "US"],
  ["Cebu City (US company)", "PH"], ["Makati (US company)", "PH"], ["Cebu (US startup)", "PH"], ["Philippines (US-based company)", "PH"],
  ["Makati (US-based BPO)", "PH"], ["Taguig (UK-based BPO)", "PH"], ["Remote (US company)", "US"], ["Remote - US brand", "US"], ["Makati City (US account)", "PH"],
]) {
  check(`${JSON.stringify(text)} is in ${code}`, M.inferCountryCode(text) === code, String(M.inferCountryCode(text)));
}

// The seventeenth Phase 4 review. The Type field, a class: an on-site Type the business chose ("On-site only", "Office-based",
// "Not remote") decides over the title and What they do; the builder's untouched default still lets them decide, a chosen
// Type that names no place leaves it to them, and a remote place still decides.
// (The eighteenth: the default's own form, an employment word and "· On-site", is still the default's place once typed, so
// it no longer keeps a WFH title on site; that is the choice this check made the other way. A place typed in it decides,
// "In person" too.)
{
  const mode = (role, type, typeChosen, work = "", location = "Makati City") => M.briefFromForm({ role, location, type, typeChosen, pay: "", start: "ASAP", work }).workMode;
  for (const type of ["Full-time · On-site only", "Full-time · Office-based", "Full-time · Not remote", "On-site", "Onsite", "Full-time · On-site (Makati)", "Full-time · In person", "Part-time · In-store"]) {
    check(`Type ${JSON.stringify(type)} keeps "CSR - Onsite (WFH after regularization)" and "Work From Home Chat Support Agent" on site`, mode("CSR - Onsite (WFH after regularization)", type) === "onsite" && mode("Work From Home Chat Support Agent", type) === "onsite", `${mode("CSR - Onsite (WFH after regularization)", type)} ${mode("Work From Home Chat Support Agent", type)}`);
  }
  for (const type of ["Part-time · On-site", "Contract · On-site", "Full time · On-site", "Project-based · On-site", "Full-time · On-site"]) {
    check(`Type ${JSON.stringify(type)}, typed or an old draft's, is still the default's place: "Work From Home Chat Support Agent" and a "Permanent WFH" line are remote (the eighteenth)`, [true, undefined].every((chosen) => mode("Work From Home Chat Support Agent", type, chosen, "", "Philippines") === "remote" && mode("Chat Support Agent", type, chosen, "Answer customer chats and emails.\nPermanent WFH", "Philippines") === "remote"), `${mode("Work From Home Chat Support Agent", type, true, "", "Philippines")} ${mode("Chat Support Agent", type, true, "Answer customer chats and emails.\nPermanent WFH", "Philippines")}`);
  }
  check("…and the title still decides at a US place too: \"Work From Home Customer Service Representative\", Austin, TX, \"Part-time · On-site\" typed", mode("Work From Home Customer Service Representative", "Part-time · On-site", true, "", "Austin, TX") === "remote");
  check("…while a CSR title with no remote word stays on site with it", mode("Customer Service Representative", "Part-time · On-site", true) === "onsite");
  check("…and a chosen on-site Type keeps a WFH setup line on site too", mode("Customer Service Representative", "Office-based", undefined, "Answer customer chats.\nWork setup: Permanent WFH", "Philippines") === "onsite");
  check("the builder's untouched default lets the title and the words decide", mode("Work From Home Chat Support Agent", "Full-time · On-site") === "remote" && mode("Work From Home Chat Support Agent", "Full-time · On-site", false) === "remote" && mode("Customer Service Representative", "Full-time · On-site", false, "Answer customer chats.\n✅ Permanent WFH", "Philippines") === "remote");
  check("a chosen Type that names no place leaves it to the title (\"Part-time\", \"Full-time\")", mode("Work From Home Chat Support Agent", "Part-time") === "remote" && mode("Work From Home Chat Support Agent", "Full-time") === "remote");
  check("a remote place still decides over a chosen on-site Type", mode("Customer Service Representative", "Full-time · On-site only", undefined, "", "Remote") === "remote" && mode("Customer Service Representative", "Part-time · On-site", true, "", "Remote (Philippines)") === "remote");
  check("DEFAULT_JOB_TYPE is the Type the builder starts on", M.DEFAULT_JOB_TYPE === "Full-time · On-site");
  const builder = (await import("node:fs")).readFileSync(path.join(ROOT, "src/pages/AvaCreateJob.tsx"), "utf8");
  check("the builder starts on DEFAULT_JOB_TYPE untouched, marks a Type the business types, and a voice brief's Type as its default", /type: DEFAULT_JOB_TYPE,[\s\S]{0,400}typeChosen: false,/.test(builder) && /setBriefFields\(\(b\) => \(\{ \.\.\.b, type, typeChosen: true \}\)\)/.test(builder) && /onBriefPatch=\{\(patch\) => setBriefFields\(\(b\) => \(\{ \.\.\.b, \.\.\.patch, typeChosen: false \}\)\)\}/.test(builder) && /const merged = \{ \.\.\.briefFields, \.\.\.payload, typeChosen: false \};/.test(builder));
}
// A title that says on site is on site again whatever WFH it mentions (the sixteenth's placeSaysHybrid let them be remote),
// with only on-site training, onboarding or orientation taken out first, the sixteenth's evidence.
{
  const mode = (role, location = "Makati") => M.briefFromForm({ role, location, type: "Full-time · On-site", pay: "", start: "ASAP", work: "" }).workMode;
  for (const role of ["CSR - Onsite (WFH after regularization)", "Customer Service Representative | Onsite | Possible WFH", "Onsite CSR | WFH after 3 months", "Customer Service Representative (Onsite, WFH after 6 months)", "Customer Service (Onsite) – WFH Option After Probation", "Customer Service Representative (Onsite, Temporary WFH)", "Customer Service Representative - Onsite Makati | WFH Ready Applicants", "CSR (Onsite) - WFH not available", "CSR | Onsite & WFH", "Customer Service Rep - Onsite and WFH"]) {
    check(`${JSON.stringify(role)} is built on site`, mode(role) === "onsite", mode(role));
  }
  for (const role of ["WFH CSR | Onsite training in Cebu", "WFH Customer Service Representative (Onsite Training)", "Customer Service Representative - WFH after 2 weeks onsite training", "Call Center Agent - Onsite Training then WFH", "Work From Home Chat Support Agent"]) {
    check(`${JSON.stringify(role)} is still built remote`, mode(role, "Cebu City") === "remote", mode(role, "Cebu City"));
  }
}
// A setup line after any mark ("✅", "📌", "👉", "🏠", ">") or a "Job Setup:" label is remote; never after a mark that says no;
// the same marks under a perks heading (now also "What's in it for you?") stay perks; and a line beside another bare setup
// line ("- Onsite", "Work setup: Hybrid") is a post hiring for two, on site as the fifteenth had it.
{
  const mode = (work, location = "Philippines") => M.briefFromForm({ role: "Customer Service Representative", location, type: "Full-time · On-site", pay: "", start: "ASAP", work }).workMode;
  for (const line of ["✅ Permanent WFH", "📌 Work setup: Permanent WFH", "✔️ Work from home", "👉 WFH", "Job Setup: Work From Home", "> Permanent WFH", "🏠 Work From Home"]) {
    check(`"Answer customer chats. / ${line}" is built remote`, mode(`Answer customer chats.\n${line}`) === "remote", mode(`Answer customer chats.\n${line}`));
  }
  for (const work of ["Answer customer chats.\nWork setup:\n✅ Onsite\n❌ WFH", "Answer customer chats.\n🚫 WFH", "Answer customer chats.\n✖️ Work from home"]) {
    check(`"${work.replace(/\n/g, " / ")}" is still built on site (a mark that says no)`, mode(work) === "onsite", mode(work));
  }
  for (const work of ["Answer customer calls.\n\nBenefits:\n✅ HMO\n✅ WFH", "Answer customer calls.\n\nPerks:\n✔ Free meals\n✔ Work from home", "Answer customer calls.\n\nWhat's in it for you?\n✅ HMO\n✅ WFH", "Answer customer calls.\n\nWe offer:\n👉 HMO from day 1\n👉 WFH", "Answer customer calls.\n\nWhy join us?\n- Paid training\n- WFH"]) {
    check(`"${work.replace(/\n/g, " / ")}" is still built on site (a perk)`, mode(work, "Makati") === "onsite", mode(work, "Makati"));
  }
  for (const work of ["Answer customer calls.\nWork setup options:\n- Onsite\n- WFH", "Answer customer calls.\nWe are hiring for two setups:\n- WFH\n- Onsite (Taguig)", "Answer customer calls.\n- Onsite\n- Remote", "Answer customer calls.\nWork setup: Hybrid\n- WFH", "Answer customer calls. Setup: Onsite. Mode: WFH."]) {
    check(`"${work.replace(/\n/g, " / ")}" is built on site (two setups)`, mode(work, "Taguig") === "onsite", mode(work, "Taguig"));
  }
  for (const work of ["Answer customer chats.\n- Permanent WFH\n- Onsite interview in Makati", "Answer customer chats.\n- Onsite training (2 weeks)\n- Permanent WFH"]) {
    check(`"${work.replace(/\n/g, " / ")}" is still built remote (an interview or training is no other setup)`, mode(work) === "remote", mode(work));
  }
}
// A client's country is never the job's: what is left once the client's words go is the place, known to the hints or not, and
// "-based" before a business is the client's whatever is left; any other "-based" word is still the people's when nothing else is.
for (const [text, code] of [
  ["Mandaluyong (US-based BPO)", null], ["Mandaluyong City (US-based company)", null], ["Alabang, Muntinlupa (US-based company)", null], ["Pasay City - US-based call center", null],
  ["Paranaque (UK-based BPO)", null], ["Mandaue City (US-based company)", null], ["Lapu-Lapu City (US-based BPO)", null], ["Angeles City (US-based company)", null],
  ["Batangas City (Australian-based company)", null], ["Dumaguete (US-based startup)", null], ["Bulacan (US-based agency)", null], ["Las Pinas (US company)", null],
  ["Marikina - US company", null], ["Eastwood, Libis (US-based BPO)", null], ["Alabang (US-based healthcare BPO)", null], ["Naga City - Canadian-based BPO", null],
  ["General Santos (US-based company)", null], ["Mandaluyong City", null], ["Pasay City (US account)", null], ["Lipa City (UK company)", null],
  ["Remote - US-based BPO", null], ["Work from home (US-based company)", null], ["Remote - UK-based agency", null], ["Home-based (for a US-based dental office)", null],
  // (The eighteenth: only text before the first client words can be the place, so this one is the US now; the choice this
  // check made the other way. "Remote (US company) - Full-time" is the US again, below.)
  ["London (US-based company)", null], ["US company - remote, Latin America", "US"],
  ["Remote (US-based staffers)", "US"], ["Remote (US-based moms welcome)", "US"], ["Remote (US-based new grads welcome)", "US"], ["Remote - US-based support role", "US"],
  ["Remote (US-based opportunity)", "US"], ["Remote (US-based work)", "US"], ["Remote (US-based W2 only)", "US"], ["Remote, US company", "US"],
  ["Remote (US company), Philippines applicants", "PH"], ["Remote | US-based company | Philippines", "PH"], ["Austin, TX (UK-based company)", "US"],
  ["Anywhere in the US (Canadian company)", "US"], ["Iloilo (US-based dental office)", "PH"], ["Ortigas (US-based mortgage company)", "PH"],
]) {
  check(`${JSON.stringify(text)} is ${code ? `in ${code}` : "in no country"}`, M.inferCountryCode(text) === code, String(M.inferCountryCode(text)));
}
// The eighteenth Phase 4 review, each case both ways.
{
  const mode = (role, location, work = "", type = "Full-time · On-site", typeChosen) => M.briefFromForm({ role, location, type, typeChosen, pay: "", start: "ASAP", work }).workMode;
  // H5: on-site nesting, an interview, hiring, an exam or an assessment in a WFH title is not the job's setup, nor training
  // that "is" or ": " on site; LOW 2: nor in-office training, which isFullyRemoteText read in the whole title.
  for (const role of ["WFH Customer Service Representative (Onsite Interview)", "WFH Chat Support | Onsite Hiring", "Work From Home CSR - Onsite Assessment in Ortigas", "WFH CSR | Onsite exam and interview", "WFH CSR - Onsite Nesting", "WFH CSR (2 weeks onsite nesting)", "WFH CSR | Walk-in Onsite Interview", "WFH CSR - Training is onsite", "WFH CSR | Training: Onsite", "WFH CSR - In-office training"]) {
    check(`${JSON.stringify(role)} is built remote (the eighteenth)`, mode(role, "Cebu City", "Answer customer chats.") === "remote", mode(role, "Cebu City", "Answer customer chats."));
  }
  for (const role of ["Work From Home CSR (onsite during training)", "WFH Customer Service | Onsite for the first month", "WFH Customer Support - Onsite equipment pickup", "Customer Service - Onsite 2 weeks then Permanent WFH", "CSR - Onsite (WFH after regularization)"]) {
    check(`${JSON.stringify(role)} is still built on site`, mode(role, "Cebu City", "Answer customer chats.") === "onsite", mode(role, "Cebu City", "Answer customer chats."));
  }
  // M2: another setup counts only under the same heading as the WFH line; two setups under one heading are still two.
  for (const work of ["Answer customer chats.\nWork setup:\n- Permanent WFH\nInterview:\n- Onsite (Makati)", "Answer customer chats.\nTraining:\n- Onsite (2 weeks)\nWork setup:\n- Permanent WFH"]) {
    check(`"${work.replace(/\n/g, " / ")}" is built remote (another heading's on-site line, the eighteenth)`, mode("Chat Support Agent", "Philippines", work) === "remote", mode("Chat Support Agent", "Philippines", work));
  }
  for (const work of ["Answer customer chats.\nWork setup options:\n- Onsite\n- WFH", "Answer customer chats.\nWork setup: Hybrid\n- WFH", "Answer customer chats.\nWork setup:\n- Permanent WFH\n- Onsite (Makati)"]) {
    check(`"${work.replace(/\n/g, " / ")}" is still built on site (two setups under one heading)`, mode("Chat Support Agent", "Philippines", work) === "onsite", mode("Chat Support Agent", "Philippines", work));
  }
  // LOW 3: a mark after the setup line, never one that says no.
  for (const line of ["Permanent WFH 🏠", "Work From Home ✅"]) check(`"Answer customer chats. / ${line}" is built remote (the eighteenth)`, mode("Chat Support Agent", "Philippines", `Answer customer chats.\n${line}`) === "remote");
  for (const line of ["WFH ❌", "WFH:", "Work from home?"]) check(`"Answer customer chats. / ${line}" is still built on site`, mode("Chat Support Agent", "Philippines", `Answer customer chats.\n${line}`) === "onsite");
  // M3: an on-site Type the business chose is read whole, whatever WFH it mentions; on-site training in it is still training.
  for (const type of ["Full-time · Onsite (WFH after regularization)", "Full-time · On-site, WFH not available", "Full-time · Onsite, possible WFH", "Full-time · Onsite (Remote not available)", "Full-time · On-site only (WFH is not an option)", "Full-time · Onsite then WFH"]) {
    check(`Type ${JSON.stringify(type)} (typed) is on site (the eighteenth)`, mode("Customer Service Representative", "Makati City", "Answer inbound customer calls.", type, true) === "onsite", mode("Customer Service Representative", "Makati City", "Answer inbound customer calls.", type, true));
  }
  for (const type of ["Full-time · Remote", "Full-time · WFH (onsite training)", "Part-time · Work from home"]) {
    check(`Type ${JSON.stringify(type)} (typed) is still remote`, mode("Customer Service Representative", "Makati City", "Answer inbound customer calls.", type, true) === "remote", mode("Customer Service Representative", "Makati City", "Answer inbound customer calls.", type, true));
  }
}
// H4: a note after the client's words is no place, so the country is kept; M4: a bare BPO, call centre, agency or firm after
// a city is the client too. A client's country is never the job's: "Las Pinas (US company)" has none, "Makati (US BPO)" is
// the Philippines, "Remote (US BPO)" the US.
for (const [text, code] of [
  ["Remote (US company) - Full-time", "US"], ["Remote (US company) - Night shift", "US"], ["Remote, US company, flexible schedule", "US"], ["Work from home (US company) - Urgent hiring", "US"],
  ["Remote - US brand - Evening shift", "US"], ["Remote (US-based position) - Night shift", "US"], ["Remote - US-based role, EST hours", "US"], ["Remote - US-based role (Pacific Time)", "US"],
  ["Remote (US-based moms welcome) - part-time", "US"], ["Remote (UK-based role) - GMT hours", "GB"], ["Remote - Canada-based reps, bilingual", "CA"], ["Remote (US-based position), Full-time", "US"],
  ["Remote (US-based reps), flexible hours", "US"], ["Remote - US-based support role, night shift", "US"], ["Remote (US-based staffers) - Graveyard", "US"], ["Remote (US-based W2 role) - CST", "US"],
  ["Makati (US BPO)", "PH"], ["Taguig (US call center)", "PH"], ["Quezon City (US agency)", "PH"], ["Pasig (UK firm)", "PH"], ["Remote (US BPO)", "US"],
  ["Las Pinas (US company)", null], ["Mandaluyong (US-based BPO)", null], ["Cebu City (US company)", "PH"], ["Remote - US-based BPO", null],
]) {
  check(`${JSON.stringify(text)} is ${code ? `in ${code}` : "in no country"} (the eighteenth)`, M.inferCountryCode(text) === code, String(M.inferCountryCode(text)));
}
// The nineteenth Phase 4 review, each case both ways.
// H1: a country or a city named once the client's words are gone is the job's own, wherever it stands; the eighteenth's
// "only before the client's words" is only for a note that names none (its cases above keep their country).
for (const [text, code] of [
  ["Remote (US company) - India", "IN"], ["Remote (US company) - Canada", "CA"], ["Remote (US company) - Pakistan", "PK"], ["Remote (US company) - Australia", "AU"],
  ["Remote (US company) - UK", "GB"], ["Remote (US brand) - Ireland", "IE"], ["Remote (US startup) - Toronto, Canada", "CA"], ["Remote - US company - hiring in India", "IN"],
  ["Remote — US startup — Pakistan only", "PK"], ["US startup | Remote | India", "IN"], ["US company, remote in Canada", "CA"], ["Remote (UK company) - India", "IN"],
  ["UK company - Remote, India", "IN"], ["US company - Makati", "PH"], ["US company, Makati City", "PH"], ["US company | Ortigas", "PH"], ["US company (Makati office)", "PH"],
  ["US startup - Quezon City", "PH"], ["US company - Onsite, Makati", "PH"], ["US company · Makati · Hybrid", "PH"], ["Remote (US company) - Cebu", "PH"],
  ["Remote (US company), Makati", "PH"], ["WFH (US company) - Davao", "PH"], ["US BPO | Makati | Night shift", "PH"], ["Remote (US agency) - Lahore, Pakistan", "PK"],
  ["US shop - Cebu (WFH)", "PH"],
  ["Remote (US company) - Full-time", "US"], ["Remote (US-based position) - Night shift", "US"], ["Remote (UK-based role) - GMT hours", "GB"], ["Remote - US-based role, EST hours", "US"],
  ["Remote (US company) - Latin America", "US"], ["Makati (US BPO)", "PH"], ["Taguig (US call center)", "PH"], ["Las Pinas (US company)", null], ["Remote (US company)", "US"],
]) {
  check(`${JSON.stringify(text)} is ${code ? `in ${code}` : "in no country"} (the nineteenth)`, M.inferCountryCode(text) === code, String(M.inferCountryCode(text)));
}
{
  const mode = (role, location, work = "", type = "Full-time · On-site", typeChosen) => M.briefFromForm({ role, location, type, typeChosen, pay: "", start: "ASAP", work }).workMode;
  // H3: a Type partly at home is hybrid, by the place field's own rule, and training or an interview on site with a plain
  // space is the training; a Type that is on site as needed, monthly or quarterly is still on site, as the place reads it.
  for (const type of ["Full-time · Remote (occasional onsite)", "Full-time · WFH or Onsite", "Full-time · Onsite or WFH", "Full-time · WFH / Onsite", "Full-time · Remote / On-site", "Full-time · Remote or On-site", "Full-time · On-site / Remote"]) {
    for (const role of ["Work From Home Chat Support Agent", "Customer Service Representative"]) check(`Type ${JSON.stringify(type)} (typed) is hybrid for ${JSON.stringify(role)} (the nineteenth)`, mode(role, "Makati City", "", type, true) === "hybrid", mode(role, "Makati City", "", type, true));
  }
  for (const type of ["Full-time · WFH (training onsite)", "Full-time · WFH (training on site)"]) check(`Type ${JSON.stringify(type)} (typed) is remote (the nineteenth)`, mode("Customer Service Representative", "Makati City", "", type, true) === "remote", mode("Customer Service Representative", "Makati City", "", type, true));
  for (const type of ["Full-time · Remote (On-site 1x/month)", "Full-time · Remote (on-site meetings monthly)", "Full-time · Remote, quarterly onsite meetups", "Full-time · Remote, onsite as needed", "Full-time · Remote (Onsite optional)", "Full-time · WFH, report onsite monthly"]) {
    check(`Type ${JSON.stringify(type)} (typed) is still on site, as the place reads it`, mode("Work From Home Chat Support Agent", "Philippines", "", type, true) === "onsite", mode("Work From Home Chat Support Agent", "Philippines", "", type, true));
  }
  // H5: any employment wording before the default's "· On-site" is still the default's place, typed or an old draft's; a
  // place, an in-person word or a typed on-site word still decides.
  for (const type of ["Regular · On-site", "Probationary · On-site", "Full-time / Part-time · On-site", "Part-time or Full-time · On-site", "Part-time (20 hrs/week) · On-site", "Part-time 4hrs/day · On-site", "Full-time (Night shift) · On-site", "Full-time · Night shift · On-site", "Temp · On-site", "Intern · On-site", "Contractor · On-site", "Freelancer · On-site", "Fixed-term · On-site", "Per diem · On-site", "PRN · On-site", "Full-time · Day shift · On-site", "Full-time · Mon-Fri · On-site"]) {
    check(`Type ${JSON.stringify(type)} leaves a WFH title remote, typed or an old draft's (the nineteenth)`, mode("Work From Home Chat Support Agent", "Philippines", "", type, true) === "remote" && mode("Work From Home Chat Support Agent", "Philippines", "", type) === "remote", `${mode("Work From Home Chat Support Agent", "Philippines", "", type, true)} ${mode("Work From Home Chat Support Agent", "Philippines", "", type)}`);
  }
  for (const type of ["On-site", "Onsite", "On-site only", "Office-based", "Not remote", "In-office", "Full-time · Onsite", "Full-time, On-site", "Full-time - On-site", "Full-time · In person", "Full-time · On-site (Makati)"]) {
    check(`Type ${JSON.stringify(type)} (typed) still puts a WFH title on site`, mode("Work From Home Chat Support Agent", "Philippines", "", type, true) === "onsite", mode("Work From Home Chat Support Agent", "Philippines", "", type, true));
  }
  // H6: "Training Onsite" and "Interview Onsite", the other word order, are the training; "Onsite then WFH", the first month
  // or two weeks on site are still the job's.
  for (const role of ["WFH CSR (Training Onsite)", "WFH CSR - Training onsite in Makati", "WFH CSR (Interview Onsite)"]) check(`${JSON.stringify(role)} is built remote (the nineteenth)`, mode(role, "Makati City") === "remote", mode(role, "Makati City"));
  for (const role of ["WFH CSR - Onsite then WFH", "WFH CSR (Onsite first month)", "WFH CSR (onsite for 2 weeks training)"]) check(`${JSON.stringify(role)} is still built on site`, mode(role, "Makati City") === "onsite", mode(role, "Makati City"));
  // M1: only an interview's or a training's heading keeps its on-site line from the setup; any other heading's WFH line is no
  // second setup; LOW 1: a mark after the setup line only when it says yes or names home; LOW 2: "What you'll get to enjoy:"
  // heads perks.
  for (const work of ["Answer customer calls.\nWork setup:\n- Onsite (Makati)\nAfter regularization:\n- WFH", "Answer customer calls.\nWork setup:\n- Onsite\nAfter 6 months:\n- Permanent WFH", "Job details:\nSchedule: Night shift\nWork setup: Onsite\nSalary: 25k\nAfter training:\n- WFH", "Answer customer calls.\nWork setup options:\nOption 1:\n- Onsite (Makati)\nOption 2:\n- WFH", "Positions available:\nTaguig site:\n- Onsite\nNationwide:\n- WFH", "Answer customer calls.\nWork Setup:\n- Onsite (Makati)\nWhat we can offer:\n- HMO\n- WFH", "Answer customer calls.\nWork Setup:\n- Onsite (Makati)\nYou'll enjoy:\n- HMO\n- WFH", "Answer customer calls.\nWork Setup:\n- Onsite (Makati)\nWhat awaits you:\n- HMO\n- WFH\n- Free meals", "Answer customer chats.\nWFH 🔜", "Answer customer chats.\nWFH 👎", "Answer customer chats.\nWFH 🙅", "Answer customer chats.\nWFH 😢", "Answer customer chats.\nWFH... soon!", "Answer customer calls.\nWhat you'll get to enjoy:\n- HMO\n- WFH\n- Free meals", "Answer customer calls.\nWhat you get to enjoy:\n- HMO\n- Permanent WFH"]) {
    check(`"${work.replace(/\n/g, " / ")}" is built on site (the nineteenth)`, mode("Customer Service Representative", "Makati City", work) === "onsite", mode("Customer Service Representative", "Makati City", work));
  }
  for (const work of ["Answer customer chats.\nWFH 💯", "Answer customer chats.\nPermanent WFH 🏠", "Answer customer chats.\nWork From Home ✅", "Answer customer chats.\nWork setup:\n- Permanent WFH\nInterview:\n- Onsite (Makati)", "Answer customer chats.\nTraining:\n- Onsite (2 weeks)\nWork setup:\n- Permanent WFH"]) {
    check(`"${work.replace(/\n/g, " / ")}" is still built remote`, mode("Chat Support Agent", "Philippines", work) === "remote", mode("Chat Support Agent", "Philippines", work));
  }
}
// The twentieth Phase 4 review, each case both ways.
{
  const mode = (work) => M.briefFromForm({ role: "Customer Service Representative", location: "Makati City", type: "Full-time · On-site", pay: "", start: "ASAP", work }).workMode;
  // H2: a setup line decorated with any marks is the setup ("Permanent WFH 💻", "‼️ PERMANENT WFH ‼️", "WORK FROM HOME!!!"); only
  // a "no", a "not yet" or a trailing question is not. M2: an interview's or a training's heading after a word or two ("Final
  // interview:", "Paid training:") keeps its on-site line from the setup.
  for (const work of [
    "Answer customer chats.\nPermanent WFH 💻", "Answer customer chats.\n💻 Permanent WFH 💻", "Answer customer chats.\n‼️ PERMANENT WFH ‼️", "Answer customer chats.\nWORK FROM HOME!!!",
    "Answer customer chats.\n🔥 WFH 🔥", "Answer customer chats.\nWork setup: Permanent WFH 🏡💻", "Answer customer chats.\nWFH ✅✅",
    ...["Final interview:", "Initial interview:", "Paid training:", "During training:", "Onsite training:", "For the interview:", "Initial assessment:"].map((h) => `Answer customer chats.\nWork setup:\n- Permanent WFH\n${h}\n- Onsite (Makati)`),
  ]) check(`"${work.replace(/\n/g, " / ")}" is built remote (the twentieth)`, mode(work) === "remote", mode(work));
  // ...and a "not yet" mark is still no setup; M1: a "Hiring for:" heading lists two setups, so its on-site line counts; and
  // "After training:" or "Option 2:" is a second setup.
  for (const work of [
    "Answer customer chats.\nWFH 🔜", "Answer customer chats.\nWFH 👎", "Answer customer chats.\nWFH... soon!",
    "Answer customer calls.\nHiring for:\n- Onsite (Makati)\n- WFH", "Answer customer calls.\nHIRING:\n✅ Onsite\n✅ WFH",
    "Answer customer calls.\nWork setup:\n- Onsite (Makati)\nAfter training:\n- WFH", "Answer customer calls.\nWork setup options:\nOption 1:\n- Onsite (Makati)\nOption 2:\n- WFH",
  ]) check(`"${work.replace(/\n/g, " / ")}" is built on site (the twentieth)`, mode(work) === "onsite", mode(work));
}
// The twenty-first Phase 4 review, each case both ways.
{
  const mode = (work) => M.briefFromForm({ role: "Customer Service Representative", location: "Makati City", type: "Full-time · On-site", pay: "", start: "ASAP", work }).workMode;
  // H2: an on-site line decorated as the remote line may be is a second setup too, so a two-setup post builds on site; a
  // heading that only says the business is hiring ("HIRING ASAP:", "Hiring now:") lists setups, and a hiring event or day is
  // on site.
  for (const work of ["Answer customer calls.\nWork setup options:\n‼️ ONSITE ‼️\n‼️ WFH ‼️","Answer customer calls.\nWork setup:\n- WFH 💻\n- Onsite 🏢","Answer customer calls.\nHiring for:\n💻 WFH 💻\n🏢 Onsite 🏢","Answer customer calls.\nSetup:\n🔥 Onsite 🔥\n🔥 WFH 🔥","Answer customer calls.\nWork setup:\n- Onsite!!\n- WFH!!","Answer customer calls.\nWork setup:\n✅ Onsite ✅\n✅ WFH ✅","Answer customer calls.\nWORK SETUP:\nONSITE 🏢\nWORK FROM HOME 🏠","Answer customer calls.\nWe are hiring for two setups:\n- Onsite (Makati) 🏢\n- WFH 🏠","Answer customer calls.\nHIRING ASAP:\n✅ Onsite\n✅ WFH","Answer customer calls.\nHiring now:\n✅ Onsite\n✅ WFH","Answer customer calls.\nHiring CSRs:\n✅ Onsite\n✅ WFH","Answer customer chats.\nWork setup: Permanent WFH\nHiring event:\n- Onsite (Makati)","Answer customer chats.\nWork setup: Permanent WFH\nHiring day:\n- Onsite (Makati)"]) check(`"${work.replace(/\n/g, " / ")}" is built on site (the twenty-first)`, mode(work) === "onsite", mode(work));
  // M1: the hiring's own setup, venue, mode, site, location or steps, and a recruitment, application or selection process,
  // keep their on-site line from the job's setup; a "no" mark still undoes an on-site line.
  for (const work of ["Answer customer calls.\nOnsite ❌\nWFH ✅","Answer customer chats.\nWork setup: Permanent WFH\nHiring setup:\n- Onsite (Makati)","Answer customer chats.\nWork setup: Permanent WFH\nHiring Set-up:\n- Onsite (Makati)","Answer customer chats.\nWork setup: Permanent WFH\nHiring venue:\n- Onsite (Makati)","Answer customer chats.\nWork setup: Permanent WFH\nHiring mode:\n- Onsite (Makati)","Answer customer chats.\nWork setup: Permanent WFH\nHiring site:\n- Onsite (Makati)","Answer customer chats.\nWork setup: Permanent WFH\nHiring location:\n- Onsite (Makati)","Answer customer chats.\nWork setup: Permanent WFH\nHiring steps:\n- Onsite (Makati)","Answer customer chats.\nWork setup: Permanent WFH\nRecruitment process:\n- Onsite (Makati)","Answer customer chats.\nWork setup: Permanent WFH\nApplication process:\n- Onsite (Makati)","Answer customer chats.\nWork setup: Permanent WFH\nSelection process:\n- Onsite (Makati)","Answer customer chats.\nWork setup: Permanent WFH\nRecruitment setup:\n- Onsite (Makati)"]) check(`"${work.replace(/\n/g, " / ")}" is built remote (the twenty-first)`, mode(work) === "remote", mode(work));
}
// The twenty-second Phase 4 review (H3): a remote line under the hiring's own heading is the hiring's too, so a two-setup
// list under "Hiring setup:" or "Application process:" builds on site; a WFH setup line above such a heading still builds remote.
{
  const mode = (work) => M.briefFromForm({ role: "Customer Service Representative", location: "Makati City", type: "Full-time · On-site", pay: "", start: "ASAP", work }).workMode;
  for (const work of ["Answer customer calls and emails.\nHiring setup:\n✅ Onsite\n✅ WFH","Answer customer calls.\nRecruitment setup:\n- Onsite (Makati)\n- WFH","Answer customer calls.\nApplication process:\n- WFH\n- Onsite","Answer customer calls.\nHiring mode:\nOnsite\nWFH","Answer customer calls.\nSelection process:\n1. Onsite\n2. WFH","Answer customer calls.\nHiring process:\n✅ Onsite\n✅ WFH"]) check(`"${work.replace(/\n/g, " / ")}" is built on site (the twenty-second)`, mode(work) === "onsite", mode(work));
  for (const work of ["Answer customer chats.\nWork setup: Permanent WFH\nHiring setup:\n- Onsite (Makati)","Answer customer chats.\nWork setup: Permanent WFH\nRecruitment process:\n- Onsite (Makati)"]) check(`"${work.replace(/\n/g, " / ")}" is still built remote (the twenty-second)`, mode(work) === "remote", mode(work));
}
// The twenty-third Phase 4 review (H1): a remote line is set aside only when an on-site line sits under the same hiring
// heading, and a line with its own "Work setup:" label belongs to no heading, so a WFH setup after a training or hiring
// section builds remote; the twenty-second's two-setup lists still build on site.
{
  const mode = (work) => M.briefFromForm({ role: "Customer Service Representative", location: "Makati City", type: "Full-time · On-site", pay: "", start: "ASAP", work }).workMode;
  for (const work of ["Answer customer chats.\nTraining:\n- 2 weeks paid training\nWork setup: Permanent WFH","Answer customer chats.\nHiring Process:\n- Initial Interview\n- Assessment\n- Final Interview\nWork Setup: Permanent WFH\nSchedule: Night Shift","Answer customer chats.\nTraining:\n- 1 week paid training\n✅ Permanent WFH\n✅ HMO","Answer customer chats.\nHiring setup:\n✅ WFH","Answer customer chats.\nHiring setup:\n- Onsite (Makati)\nWork setup: Permanent WFH"]) check(`"${work.replace(/\n/g, " / ")}" is built remote (the twenty-third)`, mode(work) === "remote", mode(work));
  for (const work of ["Answer customer calls and emails.\nHiring setup:\n✅ Onsite\n✅ WFH","Answer customer calls.\nApplication process:\n- WFH\n- Onsite"]) check(`"${work.replace(/\n/g, " / ")}" is still built on site (the twenty-third)`, mode(work) === "onsite", mode(work));
}
// The twenty-fourth Phase 4 review (H3): the two-setup rule is for hiring headings only, so a training's own "- Setup:
// Onsite" bullet or "- Onsite (2 weeks)" is the training's; "Work location:" and "Work mode:" lines belong to no heading. And
// (LOW 1) the rule reads each heading once, so 15,000 lines under one heading take milliseconds, not seconds, on every keystroke.
{
  const mode = (work) => M.briefFromForm({ role: "Customer Service Representative", location: "Makati City", type: "Full-time · On-site", pay: "", start: "ASAP", work }).workMode;
  for (const work of ["Answer customer chats.\nWork Setup: Permanent WFH\nTraining:\n- Duration: 2 weeks\n- Setup: Onsite (Makati)","Answer customer chats.\nTraining:\n- Onsite (2 weeks)\n✅ Permanent WFH\n✅ HMO","Answer customer chats.\nTraining:\n- 2 weeks paid training\nWork location: Remote","Answer customer chats.\nInterview:\n- Online\nWork mode: WFH"]) check(`"${work.replace(/\n/g, " / ")}" is built remote (the twenty-fourth)`, mode(work) === "remote", mode(work));
  for (const work of ["Answer customer calls and emails.\nHiring setup:\n✅ Onsite\n✅ WFH"]) check(`"${work.replace(/\n/g, " / ")}" is still built on site (the twenty-fourth)`, mode(work) === "onsite", mode(work));
  for (const work of ["Training:\n" + "- WFH\n".repeat(15000) + "- Onsite\n", "Hiring setup:\n" + "✅ WFH\n".repeat(15000) + "✅ Onsite\n"]) {
    const t0 = performance.now();
    mode(work);
    const ms = performance.now() - t0;
    check(`15,000 setup lines under one heading are read in well under a second (${ms.toFixed(0)} ms, the twenty-fourth)`, ms < 400, `${ms.toFixed(0)} ms`);
  }
}
// The twenty-fifth Phase 4 review (H3, M2): an unbulleted "Setup:" line belongs to no heading again, as in round 23, so a bare
// "Setup: Onsite" after a training or interview section is the job's; a bulleted "- Setup: Onsite" stays the section's.
{
  const mode = (work) => M.briefFromForm({ role: "Customer Service Representative", location: "Makati City", type: "Full-time · On-site", pay: "", start: "ASAP", work }).workMode;
  for (const work of ["Answer customer calls.\nTraining:\n- 2 weeks paid training\n- WFH\nSetup: Onsite (Makati)","Answer customer calls.\nInterview:\n- WFH\nSetup: Onsite"]) check(`"${work.replace(/\n/g, " / ")}" is built on site (the twenty-fifth)`, mode(work) === "onsite", mode(work));
  for (const work of ["Answer customer chats.\nHiring process:\n- Onsite (Makati)\nSetup: Permanent WFH","Answer customer chats.\nWork Setup: Permanent WFH\nTraining:\n- Duration: 2 weeks\n- Setup: Onsite (Makati)"]) check(`"${work.replace(/\n/g, " / ")}" is built remote (the twenty-fifth)`, mode(work) === "remote", mode(work));
}
// The twenty-sixth Phase 4 review (H1): a "Setup:" line stays its section's when it is part of the list there, bulleted with
// -, • or *, or carrying the same mark as the line before it (or first under the heading), as Philippine posts bullet with
// ✅, 👉 or ▪️; round 25's evidence still frees a line whose mark differs or that has none.
{
  const mode = (work) => M.briefFromForm({ role: "Chat Support Representative", location: "Pasig City", type: "Full-time · On-site", pay: "", start: "ASAP", work }).workMode;
  for (const work of ["We are hiring Chat Support Representatives for a US e-commerce account!\n\nTraining:\n✅ Duration: 2 weeks\n✅ Setup: Onsite (Ortigas)\n\nProduction:\n✅ Setup: Permanent WFH\n✅ Schedule: Night shift","We are hiring Chat Support Representatives for a US e-commerce account!\n\nTraining:\n👉 Duration: 2 weeks\n👉 Setup: Onsite (Ortigas)\n\nProduction:\n👉 Setup: Permanent WFH\n👉 Schedule: Night shift","We are hiring Chat Support Representatives for a US e-commerce account!\n\nTraining:\n▪️ Duration: 2 weeks\n▪️ Setup: Onsite (Ortigas)\n\nProduction:\n▪️ Setup: Permanent WFH\n▪️ Schedule: Night shift","We are hiring Chat Support Representatives for a US e-commerce account!\n\nTraining:\n➤ Duration: 2 weeks\n➤ Setup: Onsite (Ortigas)\n\nProduction:\n➤ Setup: Permanent WFH\n➤ Schedule: Night shift","We are hiring Chat Support Representatives for a US e-commerce account!\n\nTraining:\n✔️ Duration: 2 weeks\n✔️ Setup: Onsite (Ortigas)\n\nProduction:\n✔️ Setup: Permanent WFH\n✔️ Schedule: Night shift","We are hiring Chat Support Representatives for a US e-commerce account!\n\nTraining:\n📍 Duration: 2 weeks\n📍 Setup: Onsite (Ortigas)\n\nProduction:\n📍 Setup: Permanent WFH\n📍 Schedule: Night shift","We are hiring Chat Support Representatives for a US e-commerce account!\n\nTraining:\n- Duration: 2 weeks\n- Setup: Onsite (Ortigas)\n\nProduction:\n- Setup: Permanent WFH\n- Schedule: Night shift"]) check(`"${work.replace(/\n/g, " / ").slice(80)}" is built remote (the twenty-sixth)`, mode(work) === "remote", mode(work));
  for (const work of ["Answer customer chats.\n📌 Training:\n✅ Paid training\n✅ WFH\n📌 Setup: Onsite (Makati)","Answer customer chats.\nTraining:\n- Remote\nSetup: Onsite"]) check(`"${work.replace(/\n/g, " / ")}" is still built on site (the twenty-sixth)`, mode(work) === "onsite", mode(work));
}
// The twenty-seventh Phase 4 review: a line's mark is its first symbol only, and it is compared with the nearest marked
// line since the heading, not the sentence piece before it (H1: "✅ ₱600 daily training allowance", "✅ 2 weeks paid
// training. Allowance included."); and a remote line with its own "Setup:" label is never the hiring's second setup (M2).
{
  const mode = (work) => M.briefFromForm({ role: "Chat Support Representative", location: "Pasig City", type: "Full-time · On-site", pay: "", start: "ASAP", work }).workMode;
  for (const work of ["We are hiring Chat Support Representatives for a US e-commerce account!\n\nTraining:\n✅ ₱600 daily training allowance\n✅ Setup: Onsite (Ortigas)\n\nProduction:\n✅ Setup: Permanent WFH\n✅ Schedule: Night shift","We are hiring Chat Support Representatives for a US e-commerce account!\n\nTraining:\n✅ 2 weeks paid training. Allowance included.\n✅ Setup: Onsite (Ortigas)\n\nProduction:\n✅ Setup: Permanent WFH\n✅ Schedule: Night shift","We are hiring Chat Support Representatives for a US e-commerce account!\n\nTraining:\n✅ \"Nesting\" for 1 week\n✅ Setup: Onsite (Ortigas)\n\nProduction:\n✅ Setup: Permanent WFH\n✅ Schedule: Night shift","Answer customer chats.\nHiring process:\n✅ Onsite (Makati)\n\n✅ Setup: Permanent WFH"]) check(`"${work.replace(/\n/g, " / ").slice(70, 160)}" is built remote (the twenty-seventh)`, mode(work) === "remote", mode(work));
  for (const work of ["Answer customer calls and emails.\nHiring setup:\n✅ Onsite\n✅ WFH","Answer customer chats.\n📌 Training:\n✅ Paid training\n✅ WFH\n📌 Setup: Onsite (Makati)"]) check(`"${work.replace(/\n/g, " / ")}" is still built on site (the twenty-seventh)`, mode(work) === "onsite", mode(work));
}
// Publish saves is_remote as the brief's work mode (src/lib/jobFromFlow.ts). That is the fifteenth's rule exactly, which also
// read the post when the place or Type said remote, only while these two hold: every place or Type that says remote makes the
// brief remote or hybrid, and no employment type reads as a place (the sixteenth review).
{
  const places = ["Remote", "Remote - Philippines", "Remote (US only)", "Work from home (Philippines)", "Home-based, Philippines", "Makati (WFH)", "Anywhere", "Worldwide", "Online", "Remote (no onsite)", "Remote (100%, no hybrid)", "Remote / hybrid in Makati", "Remote with occasional onsite", "WFH or Onsite (Makati)", "Hybrid (Taguig)", "Makati City", "Austin, TX", "Onsite (no WFH)", "Not remote - Cebu", "Remote (US-based position)", ""];
  const types = ["Full-time · On-site", "Full-time · Remote", "Full-time · Hybrid", "Part-time · On-site", "Part-time · Work from home", "Contract", "Full-time", "WFH", "Full-time · No WFH"];
  const bad = [];
  for (const location of places) for (const type of types) {
    const b = M.briefFromForm({ role: "Customer Service Representative", location, type, pay: "", start: "ASAP", work: "Answer customer calls. Work setup: Onsite in Makati." });
    if ((M.placeSaysRemote(b.location) === "remote" || M.placeSaysRemote(b.employmentType) === "remote") && b.workMode === "onsite") bad.push(`${location} | ${type}`);
  }
  check("a place or Type that says remote always makes the brief remote or hybrid, so Publish needs only its work mode", bad.length === 0, bad.join("; "));
  check("…and no employment type reads as a place", ["full_time", "part_time", "contract"].every((t) => M.placeSaysRemote(t) !== "remote"));
}

{
  const editor = (await import("node:fs")).readFileSync(path.join(ROOT, "src/pages/CreateJob.tsx"), "utf8");
  check("Edit job: remote work is the business's own switch, shown beside the place, never re-worked unseen", /isEditMode && existingJob\s*\? formData\.is_remote === true/.test(editor) && /data-edit-remote/.test(editor) && /handleChange\("is_remote", remoteAfterPlaceEdit\(/.test(editor));
}

check("lists show a remote job's own place, never just \"Remote\"", M.placeLine("Remote (US only)", true) === "Remote (US only)" && M.placeLine("Philippines", true) === "Remote · Philippines" && M.placeLine("", true) === "Remote" && M.placeLine("Makati", false) === "Makati" && M.placeLine("", false) === null);

console.log(`\n${failed === 0 ? "All" : `${failed} of`} ${passed + failed} checks ${failed === 0 ? "passed" : "failed"}.`);
process.exit(failed === 0 ? 0 : 1);
