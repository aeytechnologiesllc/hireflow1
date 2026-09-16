/**
 * supabase/functions/_shared/candidateJourney.ts is a hand-maintained mirror
 * of src/lib/candidateJourney.ts — Deno edge functions cannot import from
 * `src/` (different module graph/bundler/path aliases), so trustedResults.ts
 * needs its own copy of the same pure "what step is next" logic. Two copies
 * of the truth drift the instant someone fixes a bug in one and forgets the
 * other — recordStepResult would then advance a candidate's phase using
 * rules CandidateStepGate.tsx no longer agrees with (or vice versa), letting
 * a candidate slip past a step the UI thinks is still locked, or get stuck
 * behind one the UI thinks is already open.
 *
 * This guard extracts every exported function body from both files (source
 * text between the parameter list's closing paren and the function's own
 * closing brace, found by depth-counting braces — comments and whitespace
 * are stripped before comparing, so re-wrapping a line or rewording a
 * comment never trips it) and fails if a function exists in one file but
 * not the other, or if a shared function's normalized body differs at all.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const CLIENT_PATH = "src/lib/candidateJourney.ts";
const SERVER_PATH = "supabase/functions/_shared/candidateJourney.ts";

/** Strips `//` and block comments, then collapses all whitespace runs to a
 *  single space, so formatting-only edits (line wraps, comment rewording,
 *  extra blank lines) never register as drift — only a change to the code
 *  itself does. */
function normalize(body) {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Finds `export function NAME(` and `export const NAME = ` top-level
 *  declarations and returns { name -> raw body text } by brace/paren
 *  depth-counting from the declaration's first `{` or `(`. Good enough for
 *  this one small, plain-TS file — not a general TS parser. */
function extractDeclarations(source) {
  const out = new Map();
  const declRe = /export\s+function\s+([A-Za-z0-9_]+)\s*\(/g;
  let m;
  while ((m = declRe.exec(source))) {
    const name = m[1];
    // Walk from the '(' after the name to the matching function body's
    // closing '}' by counting both () and {} depth so a function whose
    // signature spans multiple lines (generics, default params) still
    // resolves correctly.
    let i = declRe.lastIndex - 1; // at the '('
    let parenDepth = 0;
    let sawBody = false;
    let braceDepth = 0;
    let bodyStart = -1;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (!sawBody) {
        if (ch === "(") parenDepth++;
        else if (ch === ")") {
          parenDepth--;
        } else if (ch === "{" && parenDepth === 0) {
          sawBody = true;
          braceDepth = 1;
          bodyStart = i + 1;
        }
        continue;
      }
      if (ch === "{") braceDepth++;
      else if (ch === "}") {
        braceDepth--;
        if (braceDepth === 0) {
          out.set(name, source.slice(bodyStart, i));
          break;
        }
      }
    }
  }
  return out;
}

export default [
  {
    id: "candidate-journey-shared-copy-matches-client",
    why:
      `${SERVER_PATH} must stay logically identical to ${CLIENT_PATH} — ` +
      "trustedResults.ts's server-side phase advance relies on this file agreeing " +
      "exactly with what CandidateStepGate.tsx / useJourneyPosition.ts decide " +
      "client-side (buildCandidateJourney, positionFor, resolveGatedStep, " +
      "typeMatchesPhase, titleFor). A change to one file's exported function " +
      "bodies without the matching change to the other is exactly the kind of " +
      "silent drift this guard exists to catch.",
    async run({ read }) {
      const clientSrc = await read(CLIENT_PATH);
      const serverSrc = await read(SERVER_PATH);
      if (clientSrc == null) return { ok: false, detail: [`${CLIENT_PATH} is missing`] };
      if (serverSrc == null) return { ok: false, detail: [`${SERVER_PATH} is missing`] };

      const clientFns = extractDeclarations(clientSrc);
      const serverFns = extractDeclarations(serverSrc);

      const bad = [];
      if (clientFns.size === 0) {
        bad.push(`found zero "export function" declarations in ${CLIENT_PATH} — this guard's regex is broken or the file changed shape`);
      }

      for (const [name, clientBody] of clientFns) {
        if (!serverFns.has(name)) {
          bad.push(`${SERVER_PATH} is missing exported function "${name}" that ${CLIENT_PATH} has`);
          continue;
        }
        const a = normalize(clientBody);
        const b = normalize(serverFns.get(name));
        if (a !== b) {
          bad.push(`function "${name}" has drifted between the two files — normalized bodies differ`);
        }
      }
      for (const name of serverFns.keys()) {
        if (!clientFns.has(name)) {
          bad.push(`${SERVER_PATH} defines exported function "${name}" that ${CLIENT_PATH} does not — remove it or add it to both`);
        }
      }

      // DECISION_STAGE_ID is a plain exported const both files rely on for
      // the same literal value — a silent value drift there breaks the
      // "decision" stage id matching between client and server without
      // touching any function body above.
      const clientConst = clientSrc.match(/export const DECISION_STAGE_ID\s*=\s*("[^"]*"|'[^']*')/);
      const serverConst = serverSrc.match(/export const DECISION_STAGE_ID\s*=\s*("[^"]*"|'[^']*')/);
      if (!clientConst || !serverConst) {
        bad.push("could not find `export const DECISION_STAGE_ID = ...` in one or both files");
      } else if (clientConst[1] !== serverConst[1]) {
        bad.push(`DECISION_STAGE_ID differs: ${CLIENT_PATH} has ${clientConst[1]}, ${SERVER_PATH} has ${serverConst[1]}`);
      }

      return bad.length ? { ok: false, detail: bad } : { ok: true };
    },
  },
];
