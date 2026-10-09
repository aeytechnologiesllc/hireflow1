/** "How did it go?": the words (src/cockpit/lib/interviewOutcome.ts; docs/INTERVIEWS.md). */
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(resolve(tmpdir(), "interview-outcome-"));
const outfile = resolve(dir, "interviewOutcome.mjs");
await build({ entryPoints: [resolve(root, "src/cockpit/lib/interviewOutcome.ts")], bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent", alias: { "@": resolve(root, "src") } });
const lib = await import(pathToFileURL(outfile).href);
rmSync(dir, { recursive: true, force: true });

let passed = 0;
let failed = 0;
const eq = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) passed += 1;
  else {
    failed += 1;
    console.log(`FAIL ${name}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
};

const ask = lib.outcomeAskWords("Ana Maria Reyes", "today at 4:00 pm");
eq("the question is asked by first name", ask.title, "How did it go with Ana?");
eq("it says which interview", ask.when, "Your interview was today at 4:00 pm.");
eq("the two answers", [ask.talked, ask.noShow], ["We talked", "Ana did not show up"]);
eq("each answer says what it does", [ask.talkedHint, ask.noShowHint], ["Marks the interview as done.", "You choose what happens next: ask for another time, or pass."]);
eq("he can leave it", ask.later, "Not now");
eq("no time known, no sentence about it", lib.outcomeAskWords("Ana", null).when, "");
eq("a name that is only spaces is still a person", lib.outcomeAskWords("  ", null).title, "How did it go with them?");

const rated = lib.outcomeNextWords("Ana Maria Reyes", { average: 7.8, rated: 9, hasNotes: true });
eq("after 'We talked': what next, by first name", rated.title, "What next with Ana?");
eq("his own rating is beside the decision", [rated.rating, rated.rated, rated.guide], ["You rated the interview 7.8 out of 10.", true, "Open the interview guide"]);
eq("the ways on", [rated.offer, rated.profile, rated.later], ["Write the offer letter", "Open Ana's profile", "Decide later"]);
eq("each says where it leads", [rated.offerHint, rated.profileHint], ["Opens the letter with Ana already chosen.", "Everything they did, and Pass if it is a no."]);
const unrated = lib.outcomeNextWords("Ana", null);
eq("no rating yet: it says so and offers to score now", [unrated.rating, unrated.rated, unrated.guide], ["You have not scored the answers yet.", false, "Score the answers now"]);
eq("notes with no score are not a rating", lib.outcomeNextWords("Ana", { average: null, rated: 0, hasNotes: true }).rated, false);
for (const words of [ask, rated, unrated]) {
  const all = Object.values(words).filter((v) => typeof v === "string").join(" ");
  eq("nothing decides for him: no 'should', no 'recommend'", /should|recommend|must/i.test(all), false);
}

console.log(`interview outcome: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
