/**
 * Guards for 20260915110000_quiz_answer_keys_server_side.sql +
 * src/pages/QuizPhase.tsx: the quiz answer key must never reach a
 * candidate's browser, and a candidate must never be able to write their
 * own quiz score into applications.notes.
 *
 * These are static, source-only checks (no DB, no PGlite) — they catch the
 * shape of the regression, not the runtime behavior. The runtime behavior
 * (grading, key isolation, the write-guard trigger) is proved separately
 * with PGlite; see the migration's own header and the fix's test report.
 */

const CANDIDATE_PHASE_FILES = [
  "src/pages/QuizPhase.tsx",
  "src/pages/TypingTestPhase.tsx",
  "src/pages/VideoIntroPhase.tsx",
  "src/pages/VoiceInterviewPhase.tsx",
  "src/pages/PortfolioUploadPhase.tsx",
  "src/pages/ChatSimulationPhase.tsx",
  "src/pages/ChatInterviewPhase.tsx",
  "src/pages/SalesSimulationPhase.tsx",
  "src/pages/ApplicationFormPhase.tsx",
  "src/pages/CandidateApplicationDetail.tsx",
];

// Property-access / object-key forms the vulnerable code used to read a
// question's answer key. A plain substring match (not just property
// access) is deliberate: even the field name appearing in a candidate
// page's own source — a stray console.log, a debug dump of the question
// object — is a sign the key made it into that bundle.
const ANSWER_FIELD_PATTERNS = [
  { label: "correctAnswer", re: /correctAnswer/ },
  { label: "correct_answer", re: /correct_answer\b/ },
  { label: "correct_answers", re: /correct_answers\b/ },
  { label: "fit_context", re: /fit_context\b/ },
];

export default [
  {
    id: "candidate-phase-pages-never-read-the-quiz-key",
    why:
      "src/pages/QuizPhase.tsx used to select jobs(quiz_questions, workflow_steps) with " +
      "correct_answer / correctAnswer / correct_answers / fit_context still inside each " +
      "question, and graded itself against them in the browser (calculateResults / " +
      "handleSubmit). Any of those field names appearing in a candidate-facing phase page " +
      "again means the key is back in the bundle a candidate's devtools can read, whether or " +
      "not the database trigger that strips them from the jobs row is still in place.",
    async run({ read }) {
      const detail = [];
      for (const file of CANDIDATE_PHASE_FILES) {
        const text = await read(file);
        if (text == null) continue; // a renamed/removed page is not this guard's problem
        const lines = text.split("\n");
        lines.forEach((line, i) => {
          // Skip comments — this guard polices code that actually reads the
          // field, not prose explaining that the field is gone.
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
          // notes.quizResult.correctAnswers is a post-grading SUMMARY COUNT
          // ("how many were correct"), written by submit_quiz_attempt and
          // read back for a recap — not a question's answer key. Only that
          // one known-safe shape is excluded; a bare correctAnswer(s) or
          // correct_answer(s) anywhere else still fails the guard.
          if (/quizResult\.correctAnswers\b/.test(line)) return;
          for (const { label, re } of ANSWER_FIELD_PATTERNS) {
            if (re.test(line)) {
              detail.push(`${file}:${i + 1}  [${label}]  ${trimmed.slice(0, 120)}`);
            }
          }
        });
      }
      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },

  {
    id: "quiz-phase-never-writes-its-own-score",
    why:
      "handleSubmit() used to build answersSummary/updatedNotes locally (including a per-" +
      "question correctAnswer and the final score) and write it straight into " +
      "applications.notes / phase_ai_analysis with a plain .update() — a call any candidate " +
      "could replay from devtools with whatever score they liked, because the RLS policy that " +
      "lets a candidate update their own application has no column restriction. Grading and " +
      "the notes write now happen only inside submit_quiz_attempt (SECURITY DEFINER, graded " +
      "against the private key table); QuizPhase.tsx must call that RPC and must never call " +
      ".update() on applications itself.",
    async run({ read }) {
      const text = await read("src/pages/QuizPhase.tsx");
      if (text == null) return { ok: false, detail: ["src/pages/QuizPhase.tsx is missing"] };

      const detail = [];

      if (!/\.rpc\(\s*["']submit_quiz_attempt["']/.test(text)) {
        detail.push("QuizPhase.tsx no longer calls the submit_quiz_attempt RPC");
      }

      // Any direct .update( on the applications table, anywhere in the file.
      // (The legitimate reads — the initial useQuery and the auto-mode
      // status fallback check — are both .select(), never .update().)
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/from\(\s*["']applications["']\s*\)/.test(lines[i])) {
          // The chained call may land on the same line or a following one
          // (this codebase wraps .from(...).update({ ... }) across lines).
          const window = lines.slice(i, i + 3).join("\n");
          if (/\.update\(/.test(window)) {
            detail.push(`QuizPhase.tsx:${i + 1}  writes applications directly: ${lines[i].trim()}`);
          }
        }
      }

      // The old local grader, by name — its reappearance is the clearest
      // possible sign of a regression back to client-side scoring.
      if (/\bcalculateResults\b/.test(text)) {
        detail.push("QuizPhase.tsx still defines/calls calculateResults() — grading belongs to submit_quiz_attempt now");
      }

      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },

  {
    id: "submit-quiz-attempt-never-writes-the-key-into-notes",
    why:
      "submit_quiz_attempt() writes applications.notes, and that column has no column-level " +
      "RLS restriction — the same candidate who just submitted can read their own notes right " +
      "back (their own SELECT policy, and QuizPhase.tsx's own realtime subscription on that " +
      "row). Writing correctAnswer / correctAnswers / fit_context into notes there would hand " +
      "the answer key to the candidate's browser seconds after they submit — the exact 'reaches " +
      "the candidate's browser' bug this migration exists to close, just moved from the " +
      "pre-submission jobs row to the post-submission notes column. Only a bare 'correctAnswer', " +
      "NULL placeholder (the text/fit question shapes, which never had a key-derived answer to " +
      "report) is allowed; every other occurrence, and any 'correctAnswers'/'fit_context' key at " +
      "all, inside the function body means the key is leaking into notes again.",
    async run({ read }) {
      const file = "supabase/migrations/20260915110000_quiz_answer_keys_server_side.sql";
      const text = await read(file);
      if (text == null) return { ok: false, detail: [`${file} is missing`] };

      const start = text.indexOf("CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(");
      if (start === -1) return { ok: false, detail: ["submit_quiz_attempt() definition not found"] };
      const end = text.indexOf("$function$;", start);
      if (end === -1) return { ok: false, detail: ["submit_quiz_attempt() body has no closing $function$; — can't scope the check"] };
      const body = text.slice(start, end);
      const bodyLines = body.split("\n");
      const bodyStartLine = text.slice(0, start).split("\n").length;

      const detail = [];

      bodyLines.forEach((line, i) => {
        if (/'correctAnswers'/.test(line) || /'fit_context'/.test(line)) {
          detail.push(`${file}:${bodyStartLine + i}  answer-key field written into notes: ${line.trim().slice(0, 120)}`);
        }
        if (/'correctAnswer'\s*,/.test(line) && !/'correctAnswer'\s*,\s*NULL\b/.test(line)) {
          detail.push(`${file}:${bodyStartLine + i}  'correctAnswer' written as something other than a NULL placeholder: ${line.trim().slice(0, 120)}`);
        }
      });

      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },

  {
    id: "voice-interview-phase-never-writes-its-own-score",
    why:
      "VoiceInterviewPhase.tsx used to build its own fallback evaluation locally " +
      "(buildManualEndEvaluation) and write applications.voice_interview_result straight to the " +
      "database with a plain .update() — the same devtools-replayable pattern QuizPhase.tsx used " +
      "to have, on a column that ai-shortlist/trigger-ava-analysis/autopilot-batch all trust as a " +
      "real Ava score. voice_interview_result is now guarded by protect_application_columns() " +
      "(supabase/migrations/20260915110000_quiz_answer_keys_server_side.sql); the only legitimate " +
      "writers are ava-voice-tools' end_interview handler (service_role) and the " +
      "submit_voice_interview_manual_end RPC. If this file starts setting voice_interview_result " +
      "in a direct .update() again, a candidate can forge it again.",
    async run({ read }) {
      const file = "src/pages/VoiceInterviewPhase.tsx";
      const text = await read(file);
      if (text == null) return { ok: false, detail: [`${file} is missing`] };

      const detail = [];

      if (!/\.rpc\(\s*["']submit_voice_interview_manual_end["']/.test(text)) {
        detail.push(`${file} no longer calls the submit_voice_interview_manual_end RPC`);
      }

      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/from\(\s*["']applications["']\s*\)/.test(lines[i])) {
          // .update(...) commonly lands within the next few lines of a
          // chained .from("applications").update({ ... }) call.
          const window = lines.slice(i, i + 12).join("\n");
          const updateMatch = window.match(/\.update\(\s*\{([\s\S]*?)\}\s*\)/);
          if (updateMatch && /voice_interview_result\s*:/.test(updateMatch[1])) {
            detail.push(`${file}:${i + 1}  writes voice_interview_result directly: ${lines[i].trim()}`);
          }
        }
      }

      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },

  {
    id: "sending-a-candidate-back-to-quiz-reopens-it",
    why:
      "submit_quiz_attempt() refuses to grade again once public.quiz_attempt_ledger shows " +
      "attempts >= 1 + retakes_granted for (candidate_id, job_id, step_id) — a gate that survives " +
      "the candidate deleting and re-applying, unlike the notes-only fast path it sits alongside. " +
      "move_applicant_to_phase (supabase/functions/ava-voice-tools/index.ts) is the one live " +
      "employer/Ava action that sends a candidate back to a quiz step, and it commonly does so " +
      "without touching application.status — so QuizPhase.tsx shows the quiz form again, but " +
      "submitting it must actually be allowed to grade. Clearing notes[stepId]/notes.quizResult " +
      "alone only reopens the notes-only fast-path check; without also calling grant_quiz_retake " +
      "in the same operation, the ledger still refuses the resubmission and the candidate is stuck " +
      "with no way to ever finish that phase — the same regression this guard exists to catch, one " +
      "layer deeper. If this function stops clearing the quiz step's saved notes, or stops calling " +
      "grant_quiz_retake, when moving a candidate onto a quiz-type phase, that regression is back.",
    async run({ read }) {
      const file = "supabase/functions/ava-voice-tools/index.ts";
      const text = await read(file);
      if (text == null) return { ok: false, detail: [`${file} is missing`] };

      const start = text.indexOf('case "move_applicant_to_phase"');
      if (start === -1) return { ok: false, detail: ["move_applicant_to_phase case not found"] };
      const end = text.indexOf('case "reject_applicant"', start);
      const body = end === -1 ? text.slice(start) : text.slice(start, end);

      const detail = [];
      if (!/matchedPhase\?\.type\s*===\s*["']quiz["']/.test(body)) {
        detail.push(`${file}: move_applicant_to_phase no longer branches on the destination phase being a quiz step`);
      }
      if (!/updates\.notes\s*=/.test(body)) {
        detail.push(`${file}: move_applicant_to_phase no longer clears notes when reopening a quiz step`);
      }
      if (!/\.rpc\(\s*["']grant_quiz_retake["']/.test(body)) {
        detail.push(`${file}: move_applicant_to_phase no longer calls grant_quiz_retake — clearing notes alone no longer reopens the ledger-gated quiz step`);
      }

      return detail.length ? { ok: false, detail } : { ok: true };
    },
  },
];
