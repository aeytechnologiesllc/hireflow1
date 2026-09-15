/**
 * Follow-up to scripts/guards/resume-warning-clears.mjs.
 *
 * That fix made syncQuestionError() clear a question's live validation
 * warning the moment the field was fixed, by gating every update on
 * `if (!prev[question.id]) return prev;` — only touch a question that
 * currently has an error on screen. That guard has a hole: the moment the
 * warning is cleared, prev[question.id] is gone, so the *next* call for
 * that same question — e.g. the candidate removes the file they just
 * attached, or blanks a required field they'd just fixed — is a no-op.
 * The warning does not come back until the candidate clicks Continue again
 * and validateForm() re-runs, even though the field is once again invalid.
 *
 * Fixed by adding a form-level `hasAttemptedSubmit` flag (set once inside
 * validateForm(), i.e. the first Continue click) and gating
 * syncQuestionError on that instead of on the field's own current entry —
 * so once the candidate has attempted a submit, every field's warning
 * live-syncs for the rest of the session, whichever direction it changes.
 */
export default [
  {
    id: "question-warning-relives-after-being-cleared-once",
    why:
      "If syncQuestionError goes back to gating live updates on the question's own " +
      "validationErrors entry (instead of the form-level hasAttemptedSubmit flag), a " +
      "required field that gets fixed once and then blanked or re-broken again — e.g. " +
      "a required upload that's attached and then removed — silently loses its warning " +
      "until the candidate clicks Continue a second time.",
    run: async ({ read }) => {
      const text = await read("src/pages/ApplicationFormPhase.tsx");
      if (text == null) {
        return { ok: false, detail: ["src/pages/ApplicationFormPhase.tsx is missing"] };
      }

      const bad = [];

      const fnBody = (marker) => {
        const idx = text.indexOf(marker);
        if (idx === -1) return null;
        const arrow = text.indexOf("=>", idx);
        if (arrow === -1) return null;
        const braceStart = text.indexOf("{", arrow);
        if (braceStart === -1) return null;
        let depth = 0;
        for (let i = braceStart; i < text.length; i++) {
          if (text[i] === "{") depth++;
          else if (text[i] === "}") {
            depth--;
            if (depth === 0) return text.slice(braceStart, i + 1);
          }
        }
        return null;
      };

      // The form-level flag must exist and default to false, so nothing
      // shows eagerly before a first submit attempt.
      if (!/const\s*\[\s*hasAttemptedSubmit\s*,\s*setHasAttemptedSubmit\s*\]\s*=\s*useState\(false\)/.test(text)) {
        bad.push("hasAttemptedSubmit state (defaulted to false) is missing or was renamed — update this guard");
      }

      // validateForm() — the only place a Continue click lands — must flip
      // it on, or it can never turn live-sync on for the rest of the form.
      const validateFormBody = fnBody("const validateForm = ()");
      if (!validateFormBody) {
        bad.push("validateForm() is missing or restructured — update this guard's regex");
      } else if (!/setHasAttemptedSubmit\(true\)/.test(validateFormBody)) {
        bad.push("validateForm() no longer sets hasAttemptedSubmit — a submit attempt won't turn on live warnings");
      }

      // syncQuestionError must gate on the form-level flag, not on this
      // question's own entry still being present in validationErrors — that
      // was the exact regression: prev[question.id] is gone the instant the
      // field is fixed, so a second call for the same question can never
      // reinstate the warning.
      const syncFnBody = fnBody("const syncQuestionError = (question: ApplicationQuestion, value: string)");
      if (!syncFnBody) {
        bad.push("syncQuestionError() is missing or was renamed — update this guard's regex");
      } else {
        if (!/if\s*\(\s*!hasAttemptedSubmit\s*\)\s*return/.test(syncFnBody)) {
          bad.push("syncQuestionError() no longer gates on hasAttemptedSubmit");
        }
        // The old, buggy gate: bailing before computing `message` whenever
        // prev[question.id] is currently empty. If that's back, a fixed-then
        // -re-broken field is silently no longer tracked.
        if (/if\s*\(\s*!prev\[question\.id\]\s*\)\s*return prev;\s*\n\s*let message/.test(syncFnBody)) {
          bad.push(
            "syncQuestionError() again bails out before computing `message` whenever the question has no " +
              "current entry — that's the stale-gate bug: a field that was fixed once can never show its " +
              "warning again when it's broken a second time",
          );
        }
        if (!/delete\s+next\[question\.id\]/.test(syncFnBody)) {
          bad.push("syncQuestionError() no longer clears a stale per-question warning once it's fixed");
        }
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
];
