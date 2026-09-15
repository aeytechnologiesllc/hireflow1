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
];
