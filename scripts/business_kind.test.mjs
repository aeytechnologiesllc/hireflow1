#!/usr/bin/env node
/**
 * "Something else" on Ava's "What kind of business is it?" (src/lib/businessKind.ts,
 * src/lib/ownAnswers.ts, src/pages/AvaCreateJob.tsx). The owner, building a
 * real job on 2026-11-01: "when you click on something else, you should be
 * able to define what it is and Ava should be able to pick a category from
 * that ... so they know that it's smart. Now something else doesn't do
 * anything."
 *
 * Holds: the words pick the closest scenario pack with no AI call (the
 * business's own kind before "for", selling online a store, animals never
 * patients, betting never the game company, nothing known the general pack);
 * the line says which, from which words; the brief answers with that pack's
 * chip and carries the words to the writer; both plans use the pack; the
 * business can change it; the page has the field.
 *
 * Run with: node scripts/business_kind.test.mjs
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
      'export * from "./src/lib/businessKind.ts";\n' +
      'export * from "./src/lib/ownAnswers.ts";\n' +
      'export { PLAYBOOKS, chipAnswersToBriefAnswers, briefFromForm, CHAT_AGENT_KIND } from "./src/lib/avaEngine/playbook.ts";\n' +
      'export { generateTemplateFlow } from "./src/lib/avaEngine/templateGenerator.ts";\n' +
      'export { packIdForBrief, CS_INDUSTRY_CHIPS } from "./src/lib/avaEngine/customerService.ts";\n' +
      'export { SCENARIO_PACKS } from "./src/content/scenarioPacks/packs.ts";\n',
    resolveDir: ROOT,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "neutral",
  alias: { "@": path.join(ROOT, "src") },
  // flowGenerator (pulled in by the engine's index) reads the Supabase client; the template path never calls it.
  external: ["@supabase/supabase-js"],
  logLevel: "silent",
});
const M = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

// 1. The words pick the closest pack.
{
  const cases = [
    // [words, pack, the words that picked it]
    ["a plumbing company", "home_services", "plumbing"],
    ["We fix air conditioners in Cebu", "home_services", "air conditioners"],
    ["pest control and termite treatment", "home_services", "pest control"],
    ["a house cleaning service", "home_services", "house cleaning"],
    ["a moving company", "home_services", "moving company"],
    ["roofing and gutters", "home_services", "roofing"],
    ["a phone repair shop", "home_services", "repair"],
    ["a dental clinic in Makati", "dental", "dental"],
    ["orthodontics practice", "dental", "orthodontics"],
    ["Bright Smile Dental", "dental", "Dental"],
    ["a family medical clinic", "medical", "medical"],
    ["a physical therapy clinic", "medical", "physical therapy"],
    ["a pharmacy", "medical", "pharmacy"],
    ["telehealth for kids", "medical", "telehealth"],
    ["a med spa", "medical", "med spa"],
    ["we sell candles online", "store", "sell candles online"],
    ["Shopify store selling phone cases", "store", "Shopify"],
    ["an online store for pet supplies", "store", "online store"],
    ["we sell dental supplies online", "store", "sell dental supplies online"],
    ["a flower shop", "store", "flower shop"],
    ["a clothing boutique", "store", "clothing"],
    ["a SaaS for restaurants", "software", "SaaS"],
    ["software for dental clinics", "software", "software"],
    ["an app for booking haircuts", "software", "app"],
    ["an internet provider", "software", "internet provider"],
    ["online tutoring", "software", "online tutoring"],
    ["a mobile game studio", "gaming", "mobile game"],
    ["we make indie games", "gaming", "make indie games"],
    ["a Minecraft server", "gaming", "Minecraft"],
  ];
  for (const [words, pack, matched] of cases) {
    const r = M.businessKindFromWords(words);
    check(`${JSON.stringify(words)} → ${pack}, from “${matched}”`, r.pack === pack && r.matched === matched, JSON.stringify(r));
  }
}

// 2. What is no pack's is the general one, and some words never pick a pack they look like.
{
  const general = [
    "a pet grooming salon", // the owner's own example
    "a vet clinic", // animals are never patients: the medical pack's rules are for people
    "pet dental care",
    "an animal hospital",
    "a restaurant",
    "a law firm",
    "a legal clinic",
    "a barber shop",
    "a coffee shop",
    "an online casino", // never the game company (CLAUDE.md, "Positioning")
    "sweepstakes promotions",
    "a sports betting site",
    "a board game cafe",
    "a hotel in Boracay",
    "a real estate agency",
    "",
    "   ",
  ];
  for (const words of general) {
    const r = M.businessKindFromWords(words);
    check(`${JSON.stringify(words)} → the general pack, no words claimed`, r.pack === "general" && r.matched === null, JSON.stringify(r));
  }
  check("very long words are read only to 300 characters, quickly", (() => { const t0 = Date.now(); const r = M.businessKindFromWords("a ".repeat(50000) + "plumbing"); return Date.now() - t0 < 200 && r.pack === "general"; })());
}

// 3. The line says which situations, from which words, and the business's own pick wins.
{
  const L = M.businessKindLine;
  check("no words, no pick: no line", L("", null) === null && L("   ") === null);
  const plumb = L("a plumbing company");
  check("\"Ava will use: Home services situations, from “plumbing”.\"", plumb?.text === "Ava will use: Home services situations, from “plumbing”." && plumb.tone === "found" && plumb.pack === "home_services", JSON.stringify(plumb));
  const groom = L("a pet grooming salon");
  check("nothing matched says so, plainly, with the general pack", groom?.pack === "general" && groom.tone === "plain" && /^Ava will use: Everyday situations for any business\. Nothing in your words matched/.test(groom.text), groom?.text);
  const picked = L("a pet grooming salon", "home_services");
  check("a pack the business picked wins and says so", picked?.pack === "home_services" && picked.text === "Ava will use: Home services situations. You picked this.");
  check("every pack has its situations and a choice, the general one last", M.PACK_CHOICES.length === 7 && M.PACK_CHOICES.at(-1).pack === "general" && M.PACK_CHOICES.every((c) => M.PACK_SITUATIONS[c.pack] && M.SCENARIO_PACKS[c.pack]));
}

// 4. The brief: Something else answers as its pack's chip, followed by the words; both plans use the pack.
{
  const playbook = M.PLAYBOOKS.customer_service;
  const defs = playbook.followUps({}, { roleTitle: "Chat support agent", whatTheyDo: "Answer customer chats." });
  const industry = defs.find((f) => f.id === "cs-industry");
  const somethingElse = industry.chips.indexOf("Something else");
  check("Something else is the industry question's last chip", somethingElse === industry.chips.length - 1 && M.SOMETHING_ELSE === "Something else");
  const answers = (picks, own) => M.withOwnWords(M.chipAnswersToBriefAnswers([M.CHAT_AGENT_KIND, ...defs], { ...picks }), own);
  const pick = { "cs-industry": somethingElse };

  const plumb = answers(pick, { business: "a plumbing company" });
  const iIdx = plumb.findIndex((a) => a.questionId === "cs-industry");
  check("the industry answer is the pack's own chip (Home services), and the words follow it for the writer", plumb[iIdx].answer === "Home services" && plumb[iIdx + 1]?.questionId === "cs-business" && plumb[iIdx + 1].question === "What does your business do?" && plumb[iIdx + 1].answer === "a plumbing company", JSON.stringify(plumb.slice(iIdx, iIdx + 2)));
  const brief = (followUps) => M.briefFromForm({ role: "Chat support agent", location: "Remote, Philippines", type: "Full-time · Remote", typeChosen: false, pay: "$500 a month", start: "Within a few weeks", work: "Answer customer chats.", followUps });
  check("the plan's pack is Home services (packIdForBrief, what both plan builders and generate-flow read)", M.packIdForBrief(brief(plumb)) === "home_services");
  const plan = M.generateTemplateFlow({ brief: brief(plumb), rigor: "standard" }).flow;
  const quiz = plan.phases.find((p) => p.kind === "quiz");
  const sim = plan.phases.find((p) => p.kind === "simulation");
  const pack = M.SCENARIO_PACKS.home_services;
  check("the built-in plan's skills check and practice are the Home services pack's", JSON.stringify(quiz.config.items.map((q) => q.id)) === JSON.stringify(pack.skills.map((q) => q.id)) && sim.config.pack === "home_services" && sim.config.scenarios.length === pack.cases.length);

  const groom = answers(pick, { business: "a pet grooming salon" });
  check("words no pack knows: Something else (the general pack) and the words", groom.find((a) => a.questionId === "cs-industry").answer === "Something else" && groom.find((a) => a.questionId === "cs-business")?.answer === "a pet grooming salon" && M.packIdForBrief(brief(groom)) === "general");
  const changed = answers(pick, { business: "a pet grooming salon", businessPack: "home_services" });
  check("the business's own pick decides the pack, and the words still go to the writer", changed.find((a) => a.questionId === "cs-industry").answer === "Home services" && changed.find((a) => a.questionId === "cs-business")?.answer === "a pet grooming salon" && M.packIdForBrief(brief(changed)) === "home_services");
  const none = answers(pick, {});
  check("Something else with no words is as before: the general pack, nothing added", none.find((a) => a.questionId === "cs-industry").answer === "Something else" && !none.some((a) => a.questionId === "cs-business"));
  const dental = answers({ "cs-industry": industry.chips.indexOf("Dental office") }, { business: "a plumbing company" });
  check("words left from before count only under Something else", dental.find((a) => a.questionId === "cs-industry").answer === "Dental office" && !dental.some((a) => a.questionId === "cs-business"));
  check("the words are tidied and cut to 160 characters", answers(pick, { business: `  a   ${"x".repeat(300)}  ` }).find((a) => a.questionId === "cs-business").answer.length === 160);
  check("chipForPack: every pack's own chip, the general pack's Something else", M.CS_INDUSTRY_CHIPS.every(([label, id]) => M.chipForPack(id) === label));

  // The later questions start where the pack's chip would start them.
  const dentalDefs = playbook.followUps({ "cs-industry": industry.chips.indexOf("Dental office") }, { roleTitle: "Chat support agent", whatTheyDo: "" });
  check("(the private-details question starts on Health details for a dental chip, which the builder gives Something else read as dental)", dentalDefs.find((f) => f.id === "cs-sensitive").chips[dentalDefs.find((f) => f.id === "cs-sensitive").def] === "Health details" && M.ownBusinessPack({ business: "our orthodontics practice" }) === "dental");

  // What the hints show: the words, not "Something else".
  const given = M.givenWithOwnWords([{ questionId: "cs-industry", answer: "Something else" }, { questionId: "cs-channel", answer: "Chat" }], { business: "a pet grooming salon" });
  check("the strip and the review show the business's words", given[0].answer === "a pet grooming salon" && given[1].answer === "Chat");
}

// 5. The page.
{
  const page = readFileSync(path.join(ROOT, "src/pages/AvaCreateJob.tsx"), "utf8");
  check("Something else opens \"Tell Ava what your business does\" with the owner's example", /fu\.id === "cs-industry" && fu\.chips\[picked\] === SOMETHING_ELSE/.test(page) && page.includes("Tell Ava what your business does") && page.includes('placeholder="e.g. a pet grooming salon"'));
  check("the line under it is businessKindLine's, with Change and the seven packs", /businessKindLine\(ownWords\.business, ownWords\.businessPack\)/.test(page) && /PACK_CHOICES\.map\(/.test(page) && />\s*Change\s*</.test(page));
  check("new words are read again (a hand-picked pack goes with them)", /setOwnWords\(\(o\) => \(\{ \.\.\.o, business, businessPack: null \}\)\)/.test(page));
  check("every brief the builder makes carries the words (briefAnswers), and the draft keeps them", /withOwnWords\(chipAnswersToBriefAnswers\(\[CHAT_AGENT_KIND, \.\.\.defs\]/.test(page) && /ownWords,\s*\},\s*userId,/.test(page));
  check("no AI call for it: businessKind.ts is plain words", !/supabase|fetch\(|invoke\(/.test(readFileSync(path.join(ROOT, "src/lib/businessKind.ts"), "utf8")));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
