

# Personality Fit Scoring + Multi-Correct Quiz Questions

## What Changes

Two improvements to the quiz system:

### 1. Personality/Situational Questions: "Fit Scoring" Instead of Right/Wrong

Instead of removing scoring entirely, personality and situational questions get **fit-based scoring**. The AI generates a `fit_context` field that describes what the ideal answer looks like for the role (e.g., "Remote role requires independent work preference"). AVA then uses this context during analysis to assess role compatibility -- not pass/fail.

**Edge function (`ai-generate-workflow/index.ts`)** prompt changes:
- For `personality` and `situational` types: generate `correct_answer: null` and add a new field `fit_context` (string) describing what the ideal trait/preference is for this role
- Example: `{"type": "personality", "question": "You prefer to work independently", "options": ["Strongly Agree", "Agree", "Neutral", "Disagree"], "correct_answer": null, "fit_context": "This remote role benefits from independent workers. Agree/Strongly Agree indicates strong fit.", "category": "work_style"}`

**Quiz scoring (`QuizPhase.tsx`)** changes:
- In `calculateResults()`: skip `personality`, `situational`, and `work_style` types from the correct/incorrect tally (they don't affect the quiz score percentage)
- In `answersSummary`: store these as `questionType: "fit"` with `isCorrect: null` and include the `fit_context` so AVA's backend analysis can evaluate compatibility
- The candidate's answers are still recorded and passed to AVA for qualitative analysis in `trigger-ava-analysis`

**Quiz preview in CreateJob.tsx**: Show "Fit-based" badge instead of correct answer highlight for these question types.

### 2. Multi-Correct Answers for Knowledge Questions

Allow some multiple-choice questions to have 2 correct answers (multi-select).

**Edge function prompt** changes:
- Add a new type: `multi_select` -- 4 options, 2 correct answers (20-30 seconds)
- `correct_answer` becomes an array for this type: `"correct_answers": ["Option A", "Option C"]`
- Instruct AI to generate ~15-20% of knowledge questions as multi-select

**QuizPhase.tsx** changes:
- Update `QuizQuestion` interface: add `correct_answers?: string[]` field
- For `multi_select` type: render checkboxes instead of radio buttons, allow selecting multiple options
- `handleAnswerSelect` stores an array of selected indices for multi-select questions
- `calculateResults()`: for multi-select, award full credit if all correct answers selected (no extras), partial credit (0.5) if at least one correct selected
- UI: show "Select all that apply" hint on multi-select questions

**CreateJob.tsx preview**: show multi-select questions with a "Multi-select" badge and list all correct answers.

## Files Changed

1. `supabase/functions/ai-generate-workflow/index.ts` -- update prompt for fit_context on personality questions, add multi_select type
2. `src/pages/QuizPhase.tsx` -- fit scoring logic, multi-select UI + scoring
3. `src/pages/CreateJob.tsx` -- preview badges for fit-based and multi-select questions

