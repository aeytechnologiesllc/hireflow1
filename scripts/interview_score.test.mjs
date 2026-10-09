/**
 * The interview rating outside the guide (src/cockpit/lib/interviewScore.ts;
 * docs/INTERVIEWS.md, "The rating, outside the guide").
 */
import { build } from "esbuild";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(resolve(tmpdir(), "interview-score-"));
const outfile = resolve(dir, "interviewScore.mjs");
await build({ entryPoints: [resolve(root, "src/cockpit/lib/interviewScore.ts")], bundle: true, format: "esm", platform: "node", outfile, logLevel: "silent", alias: { "@": resolve(root, "src") } });
const lib = await import(pathToFileURL(outfile).href);
rmSync(dir, { recursive: true, force: true });

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) passed += 1;
  else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ""}`);
  }
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const answer = (score, note = "") => ({ score, note, question: "A question?" });

// --- one person's rating ---------------------------------------------------------
eq("the average of the answers he scored, to one decimal", lib.interviewScore({ answers: { good_candidate: answer(8), hard_day: answer(7), weak_agent: answer(9) }, overallNote: "" }), { average: 8, rated: 3, hasNotes: false });
eq("it rounds to one decimal", lib.interviewScore({ answers: { a: answer(7), b: answer(8), c: answer(8) }, overallNote: "" }).average, 7.7);
eq("a mark that is not an answer (how they speak) is left out, as in the guide", lib.interviewScore({ answers: { a: answer(6), "mark:speaking": answer(10) }, overallNote: "" }), { average: 6, rated: 1, hasNotes: false });
eq("a note with no score is a note, not a score", lib.interviewScore({ answers: { a: answer(null, "Paused a long time.") }, overallNote: "" }), { average: null, rated: 0, hasNotes: true });
eq("the overall note counts as a note", lib.interviewScore({ answers: {}, overallNote: "Strong. Call back." }), { average: null, rated: 0, hasNotes: true });
eq("nothing rated, nothing written", lib.interviewScore({ answers: {}, overallNote: "  " }), { average: null, rated: 0, hasNotes: false });

// --- everyone's, from the stored rows ---------------------------------------------
const rows = [
  { application_id: A, answers: { good_candidate: answer(8), hard_day: answer(6, "Vague.") }, overall_note: "" },
  { application_id: B, answers: { good_candidate: answer(null, "Did not answer.") }, overall_note: "" },
];
const scores = lib.interviewScores(rows);
eq("each applicant gets their own", [scores.get(A), scores.get(B)], [{ average: 7, rated: 2, hasNotes: true }, { average: null, rated: 0, hasNotes: true }]);
eq("two people rating the same applicant are pooled, answer by answer", lib.interviewScores([...rows, { application_id: A, answers: { good_candidate: answer(10) }, overall_note: "" }]).get(A), { average: 8, rated: 3, hasNotes: true });
eq("a row with neither a score nor a note is not a rating", lib.interviewScores([{ application_id: A, answers: {}, overall_note: "" }]).size, 0);
eq("a row with no applicant is skipped", lib.interviewScores([{ application_id: "", answers: { a: answer(9) } }, null]).size, 0);
eq("a score outside 1 to 10 is not counted", lib.interviewScores([{ application_id: A, answers: { a: answer(11), b: answer(0), c: answer(4) } }]).get(A), { average: 4, rated: 1, hasNotes: false });
eq("answers that are not an object are no rating", lib.interviewScores([{ application_id: A, answers: "9/10", overall_note: null }]).size, 0);

// --- the words --------------------------------------------------------------------
eq("a figure always carries its decimal", lib.scoreFigure({ average: 8, rated: 3, hasNotes: false }), "8.0");
eq("the words for a rating", lib.interviewScoreWords({ average: 7.8, rated: 9, hasNotes: true }), { chip: "Interview 7.8", title: "You rated the interview 7.8 out of 10", detail: "The average of the 9 answers you scored. Your notes are in the interview guide." });
eq("one answer is one answer", lib.interviewScoreWords({ average: 6, rated: 1, hasNotes: false }).detail, "The average of the 1 answer you scored.");
eq("notes with no scores say so, and promise no number", lib.interviewScoreWords({ average: null, rated: 0, hasNotes: true }), { chip: "Interview notes", title: "You wrote interview notes", detail: "No answers are scored yet. Your notes are in the interview guide." });
eq("nothing to say, nothing said", [lib.interviewScoreWords(null), lib.interviewScoreWords({ average: null, rated: 0, hasNotes: false })], [null, null]);

console.log(`interview score: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
