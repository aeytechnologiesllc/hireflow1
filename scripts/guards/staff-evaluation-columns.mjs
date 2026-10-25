/**
 * The hiring team's evaluation is never read from the applicant's own row
 * again (2026-10-25; docs/LAUNCH-PLAN.md, Phase 7, task 6).
 *
 * ai_score, ai_analysis, ai_scorecard, phase_ai_analysis and employer_notes
 * live in public.application_evaluations
 * (supabase/migrations/20261025235000_application_evaluations.sql): the job's
 * business and its team read it, the applicant never. Everything still
 * WRITES them through applications (a trigger moves them), but applications
 * itself answers NULL for them, so a read from it is a screen that silently
 * shows "not scored yet", a scorer that re-runs every analysis, a filter that
 * matches nobody. Staff code reads them from applications_staff_list (the
 * view joins them back on) or embeds application_evaluations(...) and lays it
 * back with withEvaluation (src/lib/applicationEvaluation.ts,
 * supabase/functions/_shared/applicationEvaluation.ts).
 *
 * Fails, in src/ and supabase/functions/, on:
 *   1. a select on applications that names one of the five as its own
 *      column (an application_evaluations(...) embed is fine; so is a write);
 *   2. a filter or order on applications by one of them
 *      (.not("ai_score", ...), .lte("ai_score", ...), .order("ai_score"));
 *   3. a file that selects * from applications and then reads one of them
 *      (row.ai_score) with no sign of the new path (the embed, the staff
 *      view, withEvaluation / readEvaluation / evaluationOf);
 *   4. the two helper copies naming different fields;
 *   5. an .or("...") filter on applications that names one of them;
 *   6. notes.avaScorecard read or written anywhere: that second copy of the
 *      scorecard sat in the applicant-readable notes, so it moved into
 *      ai_scorecard too (the staff-columns review).
 *   7. an .upsert(...) on applications: the move's insert trigger files the
 *      values before PostgreSQL knows whether the row conflicts, so an upsert
 *      would lose or overwrite the evaluation (the move's second review);
 *   8. resume_score written again (Ava's score of the resume, on the
 *      applicant's own row; nothing reads it).
 * It reads src/, supabase/functions/ and api/.
 */

const FIVE = ["ai_score", "ai_analysis", "ai_scorecard", "phase_ai_analysis", "employer_notes"];
const FIVE_RE = new RegExp(`\\b(${FIVE.join("|")})\\b`);
const NEW_PATH_RE = /\bapplication_evaluations\b|\bapplications_staff_list\b|\bwithEvaluation\(|\breadEvaluation\(|\bevaluationOf\(/;

/** The code with comments blanked out (strings kept, so positions hold). */
function withoutComments(text) {
  let out = "";
  let i = 0;
  let quote = null;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += n ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < text.length && text[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (c === "/" && n === "*") {
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        out += text[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * Every query chain that starts at .from("applications"): the text from the
 * call to the end of its statement (a `;`, or a `,` / closing bracket of
 * whatever holds it, at the chain's own depth).
 */
function applicationChains(code) {
  const chains = [];
  const re = /\.from\(\s*(["'`])applications\1\s*\)/g;
  for (const m of code.matchAll(re)) {
    let depth = 0;
    let quote = null;
    let i = m.index + m[0].length;
    for (; i < code.length; i += 1) {
      const c = code[i];
      if (quote) {
        if (c === "\\") i += 1;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "(" || c === "[" || c === "{") depth += 1;
      else if (c === ")" || c === "]" || c === "}") {
        if (depth === 0) break;
        depth -= 1;
      } else if ((c === ";" || c === ",") && depth === 0) break;
    }
    chains.push({ at: code.slice(0, m.index).split("\n").length, text: code.slice(m.index, i) });
  }
  return chains;
}

/**
 * The string arguments of every .select( in a chain ("*" for a bare
 * .select()). A constant named there (`.select(COLUMNS)`) is looked up in
 * the same file (`const COLUMNS = "..."`).
 */
function selectArgs(chain, code) {
  const out = [];
  for (const m of chain.matchAll(/\.select\(\s*/g)) {
    const at = m.index + m[0].length;
    const q = chain[at];
    if (q === ")") {
      out.push("*");
      continue;
    }
    if (q !== '"' && q !== "'" && q !== "`") {
      const name = /^[A-Za-z_$][\w$]*/.exec(chain.slice(at))?.[0];
      const constant = name && new RegExp(`\\bconst\\s+${name.replace(/\$/g, "\\$")}\\s*(?::[^=]+)?=\\s*(["'\`])([\\s\\S]*?)\\1`).exec(code);
      if (constant) out.push(constant[2]);
      continue;
    }
    const end = chain.indexOf(q, at + 1);
    if (end !== -1) out.push(chain.slice(at + 1, end));
  }
  return out;
}

/** A select string with every application_evaluations(...) embed taken out. */
function withoutEvaluationEmbeds(select) {
  let out = select;
  for (;;) {
    const m = /\bapplication_evaluations(?:![\w]+)?\s*\(/.exec(out);
    if (!m) return out;
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < out.length; i += 1) {
      if (out[i] === "(") depth += 1;
      else if (out[i] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out = out.slice(0, m.index) + out.slice(i + 1);
  }
}

/** Top-level `*` in a select string (not inside an embed's parentheses). */
function selectsEverything(select) {
  let depth = 0;
  for (const c of select) {
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    else if (c === "*" && depth === 0) return true;
  }
  return false;
}

export function evaluationReadProblems(rel, text) {
  const code = withoutComments(text);
  const problems = [];
  let selectsStar = false;
  for (const chain of applicationChains(code)) {
    for (const select of selectArgs(chain.text, code)) {
      const own = withoutEvaluationEmbeds(select);
      const hit = FIVE_RE.exec(own);
      if (hit) problems.push(`${rel}:${chain.at} selects ${hit[1]} from applications (NULL there since 2026-10-25: embed application_evaluations(${hit[1]}) or read applications_staff_list)`);
      if (selectsEverything(own)) selectsStar = true;
    }
    const filter = new RegExp(`\\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|not|order|contains|containedBy|filter|match)\\(\\s*["'\`](${FIVE.join("|")})["'\`]`).exec(chain.text);
    if (filter) problems.push(`${rel}:${chain.at} filters applications by ${filter[2]} (NULL there: filter application_evaluations.${filter[2]} through an !inner embed)`);
    if (/\.upsert\(/.test(chain.text)) problems.push(`${rel}:${chain.at} upserts into applications (the evaluation's insert trigger cannot tell an upsert from an insert: update or insert instead)`);
    if (/\bresume_score\s*:/.test(chain.text)) problems.push(`${rel}:${chain.at} writes resume_score (Ava's score of the resume, on the applicant's own row)`);
    for (const or of chain.text.matchAll(/\.or\(\s*(["'`])([\s\S]*?)\1/g)) {
      const hit = new RegExp(`(^|[,(])\\s*(${FIVE.join("|")})\\.`).exec(or[2]);
      if (hit) problems.push(`${rel}:${chain.at} filters applications by ${hit[2]} in .or(...) (NULL there: filter application_evaluations through an !inner embed)`);
    }
  }
  const scorecardInNotes = /\bavaScorecard\b/.exec(code.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, (str) => (/^["'`]avaScorecard["'`]$/.test(str) ? "avaScorecard" : str)));
  if (scorecardInNotes) {
    const line = code.slice(0, scorecardInNotes.index).split("\n").length;
    problems.push(`${rel}:${line} uses notes.avaScorecard (the applicant reads notes: Ava's scorecard is application_evaluations.ai_scorecard)`);
  }
  if (selectsStar && !NEW_PATH_RE.test(code)) {
    const read = new RegExp(`\\.(${FIVE.join("|")})\\b(?!\\s*=[^=])`).exec(code);
    if (read) {
      const line = code.slice(0, read.index).split("\n").length;
      problems.push(`${rel}:${line} reads .${read[1]} from an applications row selected with * (always NULL now: embed application_evaluations(...) and use withEvaluation, or read applications_staff_list)`);
    }
  }
  return problems;
}

export default [
  {
    id: "staff-evaluation-columns",
    why:
      "Ava's score, report, scorecard and summary and the team's notes live in application_evaluations, which the " +
      "applicant cannot read (20261025235000_application_evaluations.sql); applications answers NULL for them. A read " +
      "from applications again is a screen that says 'not scored yet', a scorer that re-runs every analysis, or a filter " +
      "that matches nobody. Read applications_staff_list, or embed application_evaluations(...) and use withEvaluation.",
    run: async ({ walk, read }) => {
      const detail = [];
      const rels = [...(await walk("src", [".ts", ".tsx"])), ...(await walk("supabase/functions", [".ts"])), ...(await walk("api", [".mjs", ".js", ".ts"]))];
      for (const rel of rels) {
        if (rel === "src/integrations/supabase/types.ts") continue;
        const text = await read(rel);
        if (text == null) continue;
        detail.push(...evaluationReadProblems(rel, text));
      }
      // The two copies of the field list say the same five.
      for (const rel of ["src/lib/applicationEvaluation.ts", "supabase/functions/_shared/applicationEvaluation.ts"]) {
        const text = (await read(rel)) ?? "";
        const m = /export const EVALUATION_FIELDS = \[([^\]]*)\] as const;/.exec(text);
        const fields = m ? [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]) : [];
        if (JSON.stringify(fields) !== JSON.stringify(FIVE)) detail.push(`${rel}: EVALUATION_FIELDS must be exactly ${FIVE.join(", ")} (found ${fields.join(", ") || "none"})`);
      }
      // An upsert into applications loses the evaluation (the third review: the
      // insert trigger clears the five on the new row before the conflict is
      // resolved, so DO UPDATE writes NULL). Never in a migration or an RPC,
      // and never through a chain split over two lines in the app.
      for (const rel of (await walk("supabase/migrations", [".sql"])).sort()) {
        if (rel < "supabase/migrations/20261025235000") continue;
        const sql = ((await read(rel)) ?? "").replace(/--[^\n]*/g, "");
        if (/insert\s+into\s+public\.applications\b[\s\S]{0,600}?on\s+conflict[\s\S]{0,200}?do\s+update/i.test(sql)) detail.push(`${rel}: INSERT INTO public.applications ... ON CONFLICT DO UPDATE loses the evaluation (update or insert instead)`);
      }
      for (const rel of rels) {
        const text = (await read(rel)) ?? "";
        if (/\.from\(\s*["'`]applications["'`]\s*\)\s*;/.test(text) || /=\s*(supabase|admin|client|db)\w*\.from\(\s*["'`]applications["'`]\s*\)\s*;?\s*\n/.test(text)) {
          if (/\.upsert\(/.test(text)) detail.push(`${rel}: keeps a query on applications in a variable and calls .upsert( (an upsert loses the evaluation)`);
        }
      }
      // The table exists in a migration, with its triggers.
      const migration = (await read("supabase/migrations/20261025235000_application_evaluations.sql")) ?? "";
      if (!/CREATE TABLE IF NOT EXISTS public\.application_evaluations/.test(migration) || (migration.match(/CREATE OR REPLACE TRIGGER zz_applications_evaluation_/g) ?? []).length !== 6) {
        detail.push("supabase/migrations/20261025235000_application_evaluations.sql: the table or its six triggers are gone");
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
