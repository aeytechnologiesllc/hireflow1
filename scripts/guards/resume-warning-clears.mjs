/**
 * The candidate application form's "Add your resume to continue" warning
 * (validationErrors.resume, and the equivalent per-question entries for
 * every other field) was only ever written inside validateForm(), which
 * only runs when the candidate presses Continue. Nothing cleared it again
 * afterward — attach a valid resume, answer a flagged question, and the red
 * warning just sat there under the now-fixed field until the whole form was
 * resubmitted. Fixed by syncing each entry directly at the point the
 * underlying field actually changes (attach/remove a resume, edit/clear a
 * question, upload/remove a question file).
 */
export default [
  {
    id: "resume-warning-clears-on-attach",
    why:
      "If the resume field's live-clearing helpers or their call sites regress, the red " +
      '"add your resume to continue" warning (or a per-question required/email warning) can ' +
      "sit on screen under an already-fixed field until the candidate resubmits the whole form " +
      "— exactly the bug this fix closed.",
    run: async ({ read }) => {
      const text = await read("src/pages/ApplicationFormPhase.tsx");
      if (text == null) {
        return { ok: false, detail: ["src/pages/ApplicationFormPhase.tsx is missing"] };
      }

      const bad = [];

      const block = (marker) => {
        const idx = text.indexOf(marker);
        if (idx === -1) return null;
        // Jump to the function BODY's opening brace via the arrow, not the
        // first "{" after the marker — a param type annotation like
        // `(overrides?: { usingProfileResume?: boolean })` has its own
        // brace pair before the body even starts.
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

      // clearResumeError must exist and actually drop the `resume` key from
      // validationErrors state, not just no-op.
      const clearFnBody = block("const clearResumeError = ()");
      if (!clearFnBody) {
        bad.push("clearResumeError() helper is missing (or was renamed — update this guard)");
      } else if (!/delete\s+next\.resume/.test(clearFnBody)) {
        bad.push("clearResumeError() no longer removes the resume key from validationErrors");
      }

      // markResumeMissingIfNoOtherSource must exist and actually set the
      // resume key back to the required message.
      const markFnBody = block("const markResumeMissingIfNoOtherSource = (");
      if (!markFnBody) {
        bad.push("markResumeMissingIfNoOtherSource() helper is missing (or was renamed — update this guard)");
      } else if (!/resume:\s*RESUME_REQUIRED_MESSAGE/.test(markFnBody)) {
        bad.push("markResumeMissingIfNoOtherSource() no longer reinstates the resume warning");
      }

      // The dedicated Resume dropzone's upload handler must clear the
      // warning on the success path — the moment a valid file is attached,
      // not on the next submit attempt.
      const handleFileSelectBody = block("const handleFileSelect = async (file: File)");
      if (!handleFileSelectBody) {
        bad.push("handleFileSelect is missing or restructured — update this guard's regex");
      } else if (!/clearResumeError\(\)/.test(handleFileSelectBody)) {
        bad.push("handleFileSelect no longer clears validationErrors.resume when a resume is attached");
      }

      // Both explicit "remove the resume" controls must reinstate the
      // warning when nothing else covers the requirement, or a candidate
      // who removes their resume sees no warning until they resubmit.
      if (!/setResumeFile\(null\);\s*markResumeMissingIfNoOtherSource\(\);/.test(text)) {
        bad.push("removing the attached resume no longer reinstates the warning when nothing else covers it");
      }
      if (!/setUsingProfileResume\(false\);\s*markResumeMissingIfNoOtherSource\(\{\s*usingProfileResume:\s*false\s*\}\);/.test(text)) {
        bad.push("stepping away from the profile resume no longer reinstates the warning when nothing else covers it");
      }

      // The same stale-state pattern applied to every other question's
      // validationErrors entry (required / email checks). syncQuestionError
      // must exist and must actually clear a stale entry.
      const syncFnBody = block("const syncQuestionError = (question: ApplicationQuestion, value: string)");
      if (!syncFnBody) {
        bad.push("syncQuestionError() helper is missing (or was renamed — update this guard)");
      } else if (!/delete\s+next\[question\.id\]/.test(syncFnBody)) {
        bad.push("syncQuestionError() no longer clears a stale per-question warning once it's fixed");
      }

      // It must actually be wired into every text-style answer field's
      // onChange, not just defined and unused.
      const syncCallSites = (text.match(/syncQuestionError\(question,/g) || []).length;
      if (syncCallSites < 8) {
        bad.push(
          `syncQuestionError(question, ...) is only called ${syncCallSites} time(s) across the question fields — ` +
            "expected at least one call per answer type (text/number/textarea/email/phone/date/select) plus the " +
            "question-file upload and remove handlers; a field was likely disconnected from the live-clearing fix",
        );
      }

      return { ok: bad.length === 0, detail: bad };
    },
  },
];
