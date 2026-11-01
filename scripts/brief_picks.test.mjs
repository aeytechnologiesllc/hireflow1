#!/usr/bin/env node
/**
 * The job builder's first card, made plain (src/lib/briefPicks.ts,
 * src/pages/AvaCreateJob.tsx; the owner tried it live on 2026-10-31: "location
 * part isn't clear, like location I'm hiring from or location where they're
 * going to be working in", "Do I type $500 a month, or what do I type?", and
 * "United States" read "Couldn't pinpoint that exactly" beside a Type still on
 * "Full-time · On-site").
 *
 * Holds: Where they'll work and its picks (what the post and the job feeds
 * get from each), the Type following the place and starting remote, the
 * place's read-back (a country or a well-known city is placed without the
 * geocoder, nothing is an error), the pay's picks and its "On your post:"
 * line read by Publish's own rule, the Start picks, and "Start from an
 * example".
 *
 * Run with: node scripts/brief_picks.test.mjs
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

const bundle = await build({
  stdin: {
    contents:
      'export * from "./src/lib/briefPicks.ts";\n' +
      'export { briefFromForm, DEFAULT_JOB_TYPE } from "./src/lib/avaEngine/playbook.ts";\n' +
      'export { channelForBrief } from "./src/lib/avaEngine/customerService.ts";\n' +
      'export { fallbackLocationFields, inferCountryCode, placeIsOnlyACountry, placeNamesNothing, placeSaysRemote, wellKnownCity } from "./src/lib/jobLocation.ts";\n' +
      'export { salaryForJob } from "./src/lib/salaryParse.ts";\n' +
      'export { payWords } from "./src/lib/jobPost.ts";\n',
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
const { remoteCountryCode } = await import("../api/job-feed.mjs");

const brief = (location, type, role = "Chat support agent", work = "Answer customer chats.") =>
  M.briefFromForm({ role, location, type, typeChosen: false, pay: "$500 a month", start: "Within a few weeks", work });
// The builder's own flow: the Type is whatever typeForPlace gives while it is untouched.
const built = (location, opts = {}) => brief(location, M.typeForPlace(location, { role: opts.role, atOffice: opts.atOffice }), opts.role, opts.work);

// 1. Where they'll work: the picks, and what each gives the post and the job feeds.
{
  const byId = Object.fromEntries(M.PLACE_PICKS.map((p) => [p.id, p]));
  check(
    "the four picks, in order: Remote, anywhere · Remote, Philippines · Remote, United States · At our office",
    M.PLACE_PICKS.map((p) => p.label).join(" · ") === "Remote, anywhere · Remote, Philippines · Remote, United States · At our office",
  );
  for (const [id, code] of [["ph", "PH"], ["us", "US"]]) {
    const v = byId[id].value;
    check(
      `${JSON.stringify(v)} is remote and keeps its country (${code}) for Publish's fallback and the job feeds`,
      M.placeSaysRemote(v) === "remote" && M.inferCountryCode(v) === code && M.fallbackLocationFields(v).countryCode === code && remoteCountryCode(v) === code && built(v).workMode === "remote",
      JSON.stringify([M.placeSaysRemote(v), M.inferCountryCode(v), remoteCountryCode(v), built(v).workMode]),
    );
  }
  const anywhere = byId.anywhere.value;
  check(
    `"Remote, anywhere" fills ${JSON.stringify(anywhere)}: remote, no country (as today), and nothing for the geocoder to guess`,
    M.placeSaysRemote(anywhere) === "remote" && M.inferCountryCode(anywhere) === null && M.fallbackLocationFields(anywhere).countryCode === null && remoteCountryCode(anywhere) === null && M.placeNamesNothing(anywhere) && built(anywhere).workMode === "remote",
  );
  check("\"At our office\" fills nothing: it asks for the office's city", byId.office.value === "");
  check(
    "…clearing a remote place for the city, keeping a place already typed for an office",
    ["Remote, Philippines", "Remote (worldwide)", "Remote", "Work from home", "Hybrid (Taguig)", ""].every((t) => M.placeForOfficePick(t) === "") && M.placeForOfficePick("Makati") === "Makati" && M.placeForOfficePick("United States") === "United States",
  );
  check("a pick is shown chosen by its exact words; the office while chosen and not overruled by a remote place", M.pickedPlace("Remote, Philippines", false) === "ph" && M.pickedPlace(" remote, united states ", false) === "us" && M.pickedPlace("Makati", true) === "office" && M.pickedPlace("Remote", true) === null && M.pickedPlace("Makati", false) === null);
}

// 2. The Type follows the place, starting remote; a city goes back to the builder's default, where the title decides.
{
  const T = (loc, opts) => M.typeForPlace(loc, opts);
  check("the Type starts on Full-time · Remote (an empty place)", T("") === "Full-time · Remote" && M.REMOTE_JOB_TYPE === "Full-time · Remote");
  for (const loc of ["United States", "Philippines", "the Philippines", "USA", "PH", "Remote, Philippines", "Remote (worldwide)", "Work from home", "Anywhere"]) {
    check(`place ${JSON.stringify(loc)}: Full-time · Remote, built remote`, T(loc) === "Full-time · Remote" && built(loc).workMode === "remote", `${T(loc)} ${built(loc).workMode}`);
  }
  for (const loc of ["Makati", "Austin, TX", "London", "Manila, Philippines", "Springfield Heights"]) {
    check(`place ${JSON.stringify(loc)}: the builder's default (${M.DEFAULT_JOB_TYPE}), built on site`, T(loc) === M.DEFAULT_JOB_TYPE && built(loc).workMode === "onsite", `${T(loc)} ${built(loc).workMode}`);
  }
  check("a hybrid place is Full-time · Hybrid", T("Hybrid (Taguig)") === "Full-time · Hybrid" && built("Hybrid (Taguig)").workMode === "hybrid");
  check("\"At our office\" is on site, an empty place and a bare country too", T("", { atOffice: true }) === M.DEFAULT_JOB_TYPE && T("Philippines", { atOffice: true }) === M.DEFAULT_JOB_TYPE && built("Philippines", { atOffice: true }).workMode === "onsite");
  check("…but a remote place still decides over it", T("Remote, Philippines", { atOffice: true }) === "Full-time · Remote");
  check("a bare country stays on the default when the title says on site (\"Onsite CSR\")", T("Philippines", { role: "Onsite CSR" }) === M.DEFAULT_JOB_TYPE && built("Philippines", { role: "Onsite CSR" }).workMode === "onsite");
  check("a city on the default still lets the title decide: \"Work From Home Chat Support Agent\" at Makati is remote (the seventeenth Phase 4 review)", built("Makati", { role: "Work From Home Chat Support Agent" }).workMode === "remote");
  check("placeIsOnlyACountry: a country and nothing more", ["United States", "the Philippines", "PH", "U.S.", "Canada"].every((t) => M.placeIsOnlyACountry(t)) && !["Manila, Philippines", "Makati", "Remote", "", "Texas"].some((t) => M.placeIsOnlyACountry(t)));
}

// 2b. The Type as two sets of picks (the owner's live run of 2026-11-01: "Full-time · ReRemote" beside "Remote, United
// States"). Nothing is typed; the employment is the business's, where follows the place until a pick.
{
  const brief2 = (fields, location = "Remote, United States", role = "Chat support agent") =>
    M.briefFromForm({ role, location, pay: "$500 a month", start: "Within a few weeks", work: "Answer customer chats.", ...fields });
  check("the picks: Full-time · Part-time · Contract, then Remote · Hybrid · On-site", M.EMPLOYMENT_PICKS.join(" · ") === "Full-time · Part-time · Contract" && M.SETUP_PICKS.join(" · ") === "Remote · Hybrid · On-site");
  check("typeForPlace is Full-time and setupForPlace's where", M.typeForPlace("Makati") === M.joinType("Full-time", M.setupForPlace("Makati")) && M.setupForPlace("Remote, United States") === "Remote" && M.setupForPlace("Hybrid (Taguig)") === "Hybrid" && M.setupForPlace("Makati") === "On-site");
  check("employmentOf reads as briefFromForm does", M.employmentOf("Part-time · Remote") === "Part-time" && M.employmentOf("Contract · On-site") === "Contract" && M.employmentOf("Full-time · ReRemote") === "Full-time" && M.employmentOf("") === "Full-time");
  check("setupOf names only what the builder reads; \"ReRemote\" names none", M.setupOf("Full-time · Remote") === "Remote" && M.setupOf("Full-time · Hybrid") === "Hybrid" && M.setupOf("Full-time · On-site") === "On-site" && M.setupOf("Full-time · In person") === "On-site" && M.setupOf("Full-time · ReRemote") === null && M.setupOf("Full-time · Re") === null);

  // The bug: a draft that kept "Full-time · ReRemote" (typed over the place word) beside a remote place.
  const owner = { type: "Full-time · ReRemote", typeChosen: true };
  const fixed = M.restoredType(owner, "Remote, United States");
  check("the owner's \"Full-time · ReRemote\" beside \"Remote, United States\" opens as Full-time · Remote, following the place again", fixed.type === "Full-time · Remote" && fixed.typeChosen === false && !fixed.workMode, JSON.stringify(fixed));
  check("…and a half-typed one at an office follows it too (\"Part-time · Re\" at Makati is Part-time · On-site)", JSON.stringify(M.restoredType({ type: "Part-time · Re", typeChosen: true }, "Makati")) === JSON.stringify({ type: "Part-time · On-site", typeChosen: false }));
  check("a typed Type that names a where keeps it as the business's pick", JSON.stringify(M.restoredType({ type: "Contract · Hybrid", typeChosen: true }, "Makati")) === JSON.stringify({ type: "Contract · Hybrid", typeChosen: true, workMode: "Hybrid" }));
  check("the default's own form with only the employment typed follows the place (the eighteenth Phase 4 review)", M.restoredType({ type: "Part-time · On-site", typeChosen: true }, "Remote, Philippines").type === "Part-time · Remote" && M.restoredType({ type: "Part-time · On-site", typeChosen: true }, "Remote, Philippines").typeChosen === false);
  check("an untouched Type follows the place; an old draft with no record and the default does too", M.restoredType({ type: "Full-time · On-site", typeChosen: false }, "United States").type === "Full-time · Remote" && M.restoredType({ type: "Full-time · On-site" }, "Remote").type === "Full-time · Remote");

  // Taps.
  const start = { type: "Full-time · Remote", typeChosen: false };
  const part = M.withEmployment(start, "Part-time");
  check("an employment pick keeps where following the place", part.type === "Part-time · Remote" && part.typeChosen === false && !part.workMode);
  const onsite = M.withSetup(part, "On-site");
  check("a where pick is the business's own: Part-time · On-site, chosen", onsite.type === "Part-time · On-site" && onsite.typeChosen === true && onsite.workMode === "On-site");
  check("…and an employment pick after it keeps that where", JSON.stringify(M.withEmployment(onsite, "Contract")) === JSON.stringify({ ...onsite, type: "Contract · On-site" }));
  const back = M.followingPlace(onsite, "Remote, Philippines");
  check("\"Follow where they'll work\" hands where back to the place", back.type === "Part-time · Remote" && back.typeChosen === false && back.workMode === undefined);

  // What the plan is built as, and what the line under the picks says.
  check("a picked On-site decides over a work-from-home title at an office (the business's own choice)", brief2(M.withSetup({ type: "Full-time · On-site", typeChosen: false }, "On-site"), "Makati", "Work From Home Chat Support Agent").workMode === "onsite");
  check("…an untouched On-site at an office still lets the title decide", brief2({ type: "Full-time · On-site", typeChosen: false }, "Makati", "Work From Home Chat Support Agent").workMode === "remote");
  check("a picked Remote or Hybrid at an office builds it so", brief2(M.withSetup(start, "Remote"), "Makati").workMode === "remote" && brief2(M.withSetup(start, "Hybrid"), "Makati").workMode === "hybrid");
  check("employment reaches the brief", brief2(M.withSetup(M.withEmployment(start, "Part-time"), "Remote")).employmentType === "part_time" && brief2(M.withEmployment(start, "Contract")).employmentType === "contract");
  const overruled = brief2(M.withSetup(start, "On-site"), "Remote, United States").workMode;
  check("a remote place still decides over a picked On-site, and the line says so", overruled === "remote" && M.typeNote({ typeChosen: true, picked: "On-site", built: overruled }) === "Where they'll work says remote, and that decides. Change it there.");
  check("the line while following, and for a pick that holds", /^Follows where they'll work until you pick one\.$/.test(M.typeNote({ typeChosen: false, built: "remote" })) && M.typeNote({ typeChosen: true, picked: "Hybrid", built: "hybrid" }) === "Your pick.");
}

// 3. The place read back: never "Couldn't pinpoint"; a country or a well-known city is placed without the geocoder.
{
  const R = (loc, workMode, extra = {}) => M.readPlace(loc, { workMode, ...extra });
  const us = R("United States", built("United States").workMode);
  check("\"United States\" (the owner's) reads \"Remote, from the United States.\", placed, no lookup", us?.text === "Remote, from the United States." && us.tone === "found" && us.countryCode === "US" && !us.lookUp, JSON.stringify(us));
  const cases = [
    ["Remote, Philippines", "remote", "Remote, from the Philippines.", "PH"],
    ["Remote (worldwide)", "remote", "Remote, open to anyone. Job boards list only jobs with a country.", null],
    ["Makati", "onsite", "In person: Makati, Philippines.", "PH"],
    ["Austin, TX", "onsite", "In person: Austin, TX, United States.", "US"],
    ["London", "onsite", "In person: London, United Kingdom.", "GB"],
    ["Mandaluyong City", "onsite", "In person: Mandaluyong City, Philippines.", "PH"],
    ["Manila, Philippines", "onsite", "In person: Manila, Philippines.", "PH"],
    ["Remote, Toronto", "remote", "Remote, from Canada.", "CA"],
  ];
  for (const [loc, mode, text, code] of cases) {
    const r = R(loc, mode);
    check(`${JSON.stringify(loc)} (${mode}) reads ${JSON.stringify(text)}`, r?.text === text && r.tone === "found" && r.countryCode === code && !r.lookUp, JSON.stringify(r));
  }
  const odd = R("Springfield Heights", "onsite");
  check("a place it does not know is shown as it will be posted, in a quiet tone, and the geocoder may be asked", odd?.text === "Your post will say “Springfield Heights”." && odd.tone === "plain" && odd.lookUp, JSON.stringify(odd));
  const found = R("Springfield Heights", "onsite", { geo: { ok: true, city: "Springfield", region: "Illinois", country: "United States", countryCode: "US" } });
  check("…and the geocoder's answer, when it has one, places it", found?.text === "In person: Springfield, Illinois, United States." && found.countryCode === "US", JSON.stringify(found));
  check("…its miss changes nothing", JSON.stringify(R("Springfield Heights", "onsite", { geo: { ok: false } })) === JSON.stringify(odd));
  const office = R("", "onsite", { atOffice: true });
  check("\"At our office\" with nothing typed asks for the city", office?.text === "Type your office's city, like Makati or Austin, TX." && office.tone === "hint");
  const country = R("Philippines", "onsite", { atOffice: true });
  check("an office in a country with no city asks for the city (the feeds list an in-person job only with one)", /^In person in the Philippines\. Add your office's city/.test(country?.text ?? "") && country.tone === "hint" && country.countryCode === "PH");
  check("an empty place outside the office says nothing", R("", "remote") === null);
  const all = ["United States", "Philippines", "Makati", "Springfield Heights", "Remote", "Narnia", "Remote (worldwide)", "Hybrid (Taguig)"].flatMap((l) => ["remote", "hybrid", "onsite"].map((m) => R(l, m)?.text ?? ""));
  check("no reading ever says \"pinpoint\", \"couldn't\" or \"error\"", all.every((t) => !/pinpoint|couldn.t|error|invalid/i.test(t)));
  for (const loc of ["Remote, Philippines", "Makati", "London", "Austin, TX", "Remote (worldwide)", "Mandaluyong City"]) {
    check(`the reading's country for ${JSON.stringify(loc)} is the one Publish saves when the geocoder misses`, (R(loc, built(loc).workMode)?.countryCode ?? null) === M.fallbackLocationFields(loc).countryCode);
  }
  check("well-known cities only as the whole place: \"London, Ontario\" and a client's words are not placed by them", M.wellKnownCity("London, Ontario") === null && M.wellKnownCity("Mandaluyong (US-based BPO)") === null && M.wellKnownCity("Las Pinas (US company)") === null && M.wellKnownCity("Remote, Toronto")?.countryCode === "CA");
  check("Publish's fallback keeps the client rules: \"Mandaluyong (US-based BPO)\" still has no country", M.fallbackLocationFields("Mandaluyong (US-based BPO)").countryCode === null && M.inferCountryCode("Mandaluyong City") === null);
}

// 4. Pay: picks for the place, read back as the post will show it (salaryForJob + payWords, Publish's own rule).
{
  check("Philippines picks: $500 a month, $3 an hour, ₱30,000 a month", M.payPicks("PH").join(" | ") === "$500 a month | $3 an hour | ₱30,000 a month");
  check("United States picks: $18 an hour, $3,200 a month", M.payPicks("US").join(" | ") === "$18 an hour | $3,200 a month");
  check("anywhere (no country, or another) picks: $500 a month, $4 an hour", M.payPicks(null).join(" | ") === "$500 a month | $4 an hour" && M.payPicks("GB").join(" | ") === "$500 a month | $4 an hour");
  for (const [code, remote] of [["PH", true], ["PH", false], ["US", true], ["US", false], [null, true]]) {
    for (const pick of M.payPicks(code)) {
      const r = M.readPay(pick, { remote, countryCode: code });
      check(`pick ${JSON.stringify(pick)} (${code ?? "anywhere"}, ${remote ? "remote" : "on site"}) reads with its currency and period`, r?.tone === "found" && /^On your post: (USD|PHP) [\d,]+ (a month|an hour)$/.test(r.text), r?.text);
    }
  }
  const R = (pay, remote, code) => M.readPay(pay, { remote, countryCode: code })?.text;
  check("\"$500 a month\" reads \"On your post: USD 500 a month\" (the Zulu job's words)", R("$500 a month", true, "PH") === "On your post: USD 500 a month");
  check("\"₱30,000 a month\" reads PHP 30,000 a month", R("₱30,000 a month", true, "PH") === "On your post: PHP 30,000 a month");
  check("\"$18/hr\" reads USD 18 an hour", R("$18/hr", false, "US") === "On your post: USD 18 an hour");
  check("\"$500\" with no period shows the month Publish would save", R("$500", true, null) === "On your post: USD 500 a month");
  check("on site in the US, a bare figure is dollars, as Publish saves it", R("18 an hour", false, "US") === "On your post: USD 18 an hour");
  check("remote, a bare figure has no currency and says to add one (a remote job's place picks none)", /^On your post: 30,000 a month\. Add the currency/.test(R("30000 a month", true, "PH") ?? ""));
  const none = M.readPay("competitive", { remote: true, countryCode: "PH" });
  check("words with no amount say how to write it", none?.tone === "hint" && none.text.includes("Write it like $500 a month or $4 an hour"), none?.text);
  check("an empty pay says nothing (the field is required to continue)", M.readPay("  ", { remote: true }) === null);
  for (const [pay, remote, code] of [["$500 a month", true, "PH"], ["PHP 20,000 - 25,000 monthly", false, "PH"], ["from $18/hr", false, "US"], ["up to $20/hr", true, null], ["$90k–$110k", false, "US"], ["20,000 monthly", false, "PH"], ["5/hr", true, "PH"]]) {
    const sal = M.salaryForJob(pay, remote, code);
    const words = M.payWords({ salary_min: sal.min, salary_max: sal.max, salary_currency: sal.currency, salary_period: sal.period });
    check(`${JSON.stringify(pay)} reads exactly as the job page words what Publish saves (${words})`, (R(pay, remote, code) ?? "").startsWith(`On your post: ${words}`));
  }
  check("salaryForJob: a remote job's place picks no currency; on site, the country does (US dollars when none is written)", M.salaryForJob("5/hr", true, "PH").currency === null && M.salaryForJob("20,000 monthly", false, "PH").currency === "PHP" && M.salaryForJob("18 an hour", false, "US").currency === "USD" && M.salaryForJob("18 an hour", true, "US").currency === null);
}

// 5. Start picks, read by the brief.
{
  check("Start picks: As soon as possible · Within a few weeks · Next month", M.START_PICKS.join(" · ") === "As soon as possible · Within a few weeks · Next month");
  const urgency = (start) => M.briefFromForm({ role: "Chat support agent", location: "Remote", type: "Full-time · Remote", pay: "$500 a month", start, work: "" }).startUrgency;
  check("\"As soon as possible\" is asap, \"Within a few weeks\" and \"Next month\" a few weeks", urgency("As soon as possible") === "asap" && urgency("Within a few weeks") === "few_weeks" && urgency("Next month") === "few_weeks" && urgency("ASAP") === "asap");
}

// 6. "Start from an example": two sentences from the title and the business, no AI call.
{
  const chat = M.exampleWork("Chat support agent", "Bright Smile Dental");
  check("a chat agent's example: two sentences, the business named, by chat, patients for a dental office", chat === "As our chat support agent, you'll answer patients who write to Bright Smile Dental by chat: their questions, problems and requests. A great reply is quick, friendly and right the first time, so they have nothing left to ask.", chat);
  const email = M.exampleWork("Email Support", "Ridgeway Garage");
  check("an email role reads \"In this email support job\", by email, customers", email.startsWith("In this email support job, you'll answer customers who write to Ridgeway Garage by email:"), email);
  check("a title that names both, or neither, says chat and email; no business says \"us\"", M.exampleWork("Chat and email agent").includes("by chat and email") && M.exampleWork("Customer Service Representative").includes("write to us by chat and email") && M.exampleWork("Customer Service Representative").startsWith("As our customer service representative,"));
  check("an acronym is kept, a part after a dash is left out", M.exampleWork("CSR - Night Shift", "Acme").startsWith("As our CSR, "));
  check("no title still reads", M.exampleWork("", null).startsWith("In this job, you'll answer customers who write to us by chat and email:"));
  check("never \"player\" (a property of the owner's own business only)", ![chat, email, M.exampleWork("Game chat agent", "Acme Games")].some((t) => /\bplayers?\b/i.test(t)));
  const sentences = (t) => t.split(/(?<=\.)\s+/).filter(Boolean).length;
  check("always two sentences", [chat, email, M.exampleWork(""), M.exampleWork("Patient messaging", "Clinic")].every((t) => sentences(t) === 2));
  for (const [role, want] of [["Chat support agent", "chat"], ["Email Support", "email"]]) {
    const work = M.exampleWork(role, "Acme");
    check(`the channel question starts on ${want} for ${JSON.stringify(role)} with its example`, M.channelForBrief({ roleTitle: role, whatTheyDo: work, followUps: [] }) === want, M.channelForBrief({ roleTitle: role, whatTheyDo: work, followUps: [] }));
  }
}

// 7. The page uses all of it, with real buttons, the jade, and no "pinpoint".
{
  const page = readFileSync(path.join(ROOT, "src/pages/AvaCreateJob.tsx"), "utf8");
  check("the field is \"Where they'll work\" with its hint", /> Where they'll work(<Needed \/>)?<\/label>/.test(page) && page.includes("Most chat and email agents work from home."));
  check("no \"Couldn't pinpoint\" and no \"Location\" label left", !/pinpoint/i.test(page) && !/\/> Location<\/label>/.test(page));
  check("the picks are rendered: place, pay (by the place's country), start, and the example", /PLACE_PICKS\.map\(/.test(page) && /payPicks\(placeReading\?\.countryCode\)/.test(page) && /START_PICKS\.map\(/.test(page) && /exampleWork\(briefFields\.role, businessName\)/.test(page));
  check("the read-backs are live regions", (page.match(/aria-live="polite"/g) ?? []).length >= 2 && /readPlace\(briefFields\.location, \{ workMode, atOffice, geo: geoPreview \}\)/.test(page) && /readPay\(briefFields\.pay, \{ remote: workMode === "remote"/.test(page));
  const pick = /function BriefPick[\s\S]*?\n}\n/.exec(page)?.[0] ?? "";
  check("a pick is a real button (type=\"button\", aria-pressed when it is a choice) in the jade, never brass", /<button\s+type="button"/.test(pick) && /aria-pressed=/.test(pick) && /var\(--action\)/.test(pick) && !/brass|hf-gold/.test(pick));
  check("the Type follows the place while untouched, and the builder starts it remote", /type: REMOTE_JOB_TYPE,[\s\S]{0,200}typeChosen: false,/.test(page) && /joinType\(employmentOf\(briefFields\.type\), setupForPlace\(briefFields\.location, \{ atOffice, role: briefFields\.role \}\)\)/.test(page) && /b\.typeChosen === false \? \{ \.\.\.b, type: next \} : b/.test(page));
  check("the Type is picks, never a text box (the owner's \"Full-time · ReRemote\")", !/id="brief-type"/.test(page) && /EMPLOYMENT_PICKS\.map\(/.test(page) && /SETUP_PICKS\.map\(/.test(page) && /withEmployment\(b, pick\)/.test(page) && /withSetup\(b, pick\)/.test(page) && /restoredType\(saved\.briefFields/.test(page));
  check("the geocoder is asked only about a place the builder cannot place", /placeNamesNothing\(q\) \|\| !readPlace\(q, \{ workMode, atOffice, geo: null \}\)\?\.lookUp/.test(page));
  check("narrow windows: the builder centres safely (auto margins, never justify-center on its scroller) and its columns can shrink", !/flex min-h-0 flex-1 justify-center overflow-y-auto/.test(page) && /mx-auto my-auto w-full min-w-0 max-w-6xl/.test(page) && /hidden min-w-0 flex-1 sm:block"><StepRail/.test(page));
  const flow = readFileSync(path.join(ROOT, "src/lib/jobFromFlow.ts"), "utf8");
  check("Publish reads the pay by salaryForJob and never asks the geocoder about a place that names nowhere", /const sal = salaryForJob\(payText, isRemote, countryCode\);/.test(flow) && /locationText && !placeNamesNothing\(locationText\) \? await geocodePlace\(locationText\)/.test(flow));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
