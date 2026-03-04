

# Context-Aware AI Job Content Generation

## Problem

When generating responsibilities, requirements, or skills, the AI only receives the job title and metadata. It ignores already-filled fields (description, responsibilities, requirements), producing generic output that doesn't align with what the employer has already written.

## Solution

Pass all existing job content as context to the edge function, so each field generation builds on what's already been filled out.

### 1. Frontend -- `src/pages/CreateJob.tsx` (and `GuestJobCreator.tsx`)

Update `generateField()` to send all existing form content alongside the field being generated:

```typescript
body: {
  field,
  title: formData.title,
  department: formData.department,
  experience_level: formData.experience_level,
  job_type: formData.job_type,
  existingContent: context || formData[field],
  // NEW: send sibling fields as context
  description: formData.description,
  responsibilities: formData.responsibilities,
  requirements: formData.requirements,
  skills_required: formData.skills_required,
}
```

### 2. Backend -- `supabase/functions/ai-generate-job-content/index.ts`

- Add `description`, `responsibilities`, `requirements`, `skills_required` to the request interface
- For each field prompt, inject a "Context from existing job posting" section that includes whichever sibling fields are already filled:
  - **Responsibilities**: uses description (if available)
  - **Requirements**: uses description + responsibilities (if available)
  - **Skills**: uses description + responsibilities + requirements (if available)
  - **Benefits**: uses description (if available)

Example addition to the responsibilities prompt:
```
Here is context from the job posting so far:

Job Description:
[description text]

Generate responsibilities that are specifically aligned with this description.
```

This ensures each successive field builds on what came before, producing cohesive, job-specific content instead of generic filler.

### Files Changed

1. `supabase/functions/ai-generate-job-content/index.ts` -- accept and use sibling field context in prompts
2. `src/pages/CreateJob.tsx` -- pass all form fields in `generateField()` body
3. `src/pages/GuestJobCreator.tsx` -- same change as CreateJob

