

# Fix NaN in Quiz Total Time Estimate

## Problem

The quiz header shows "~NaN min total" because some questions (particularly personality/situational/work_style types) may have `undefined` for `time_limit_seconds`. When `undefined` enters the `.reduce()` sum, it produces `NaN`.

## Fix

**File: `src/pages/CreateJob.tsx` (line 1964)**

Change the reduce to default missing `time_limit_seconds` to 0:

```typescript
{quizQuestions.length} questions • ~{Math.ceil(quizQuestions.reduce((acc, q) => acc + (q.time_limit_seconds || 0), 0) / 60)} min total
```

Single line change. The `|| 0` fallback handles any question where `time_limit_seconds` is `undefined`, `null`, or `0`.

