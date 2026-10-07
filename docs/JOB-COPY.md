# Copy to drafts, and "New job" from a job you already have (2026-10-07)

The owner, looking at his one live job on the Jobs page: *"create a job, like
new job and allow me to post from the draft. So right now it just takes me to
the AI, which is cool. I want to be able to see if I can pull it from the
draft … I like this job, right? So I want to be able to add that to the draft
and then that way I can pull it, use the same job later."*

Two things on the Jobs page, and no new idea to learn: the page already had
**Draft** jobs ("Finish & publish"). A job you like can now be put there.

## What he sees

- **"Copy to drafts"** on every job that is not a draft (live or closed),
  beside Delete. One click: a copy is saved as a new draft, he stays on the
  page, and a toast says so with "Open it". The draft waits in the list under
  its own **Draft** chip, with the same title, until he posts it.
- **"+ New job"** asks where to start, when there is a job to start from:
  - **Write a new one with Ava**: what the button has always done.
  - **Or start from one you already have**: every job on the page, drafts
    first, then live, then closed, newest first in each. A draft says
    "Finish & publish" and opens as itself. Any other job says "Use this one":
    it is copied to a new draft and the copy opens in the editor, ready to
    change and publish.
  - One line under the list: "Using a job makes a copy in your drafts. The
    original and its applicants aren't touched."

  With no job at all, "+ New job" goes straight to Ava, as before. The other
  "post a job" buttons (Dashboard, Analytics, the empty Applicants page) are
  first-job prompts and still go straight to Ava.

A draft that gets published becomes that live job; it is not kept as a
template. There is nothing to keep: any job can be copied again at any time.

## What a copy is

Everything that makes the job what it is, as it stands: the post (title,
description, requirements, responsibilities, department, level, skills,
benefits, job type), the pay, the place, the application form, the tests
**with their answers**, the steps with their pass marks and settings, and
whether it goes to the job boards.

Nothing that belongs to the original's life: its applicants, its id and
owner, its dates, its application deadline, its job code (the database gives
every job its own) and its **short link** (one job's alone; the editor shows
"No short link" on the copy and a new one can be typed before publishing).

`JOB_COPY_COLUMNS` and `JOB_COPY_LEFT_OUT` in `src/lib/jobCopy.ts` name every
column of `public.jobs` between them, and `scripts/job_copy.test.mjs` holds
the two lists against the database types: a column added later fails that
test until someone decides whether a copy carries it.

## How it is made

No database change. A copy goes through the two doors the job editor already
uses (`src/hooks/useJobCopy.ts`):

1. **Read**: the job row, then `get_job_quiz_keys` (which answers only the
   job's owner and team), merged back in with `mergeQuizAnswerKeys`, exactly
   as `useJob` does for the editor. The quiz answers do not live on the job
   row (migration `20260915110000`), so this is the only way a copy can have
   them. Unlike the editor's read, **a failed answer lookup stops the copy**:
   a quiz saved without its answers could never be marked, and nothing would
   say so until an applicant took it.
2. **Write**: `useCreateJob`, the ordinary insert with `status: "draft"`. So
   the ordinary rules decide: who may create a job (the owner, or a team
   member with that permission), the job limit (none while billing is off),
   `generate_job_code`, and `extract_quiz_answer_keys`, which moves the
   answers off the new row into `job_quiz_keys` for it.

The button and the chooser are offered to whoever may create a job, and not
on the showcase dataset.

## Proof

- `scripts/job_copy.test.mjs`: every column accounted for; a copy is a draft
  with the whole job and none of the original's life; the answers come along
  (by question id, and by position for a question without one; quiz steps
  too); the original is not changed; the chooser's order and words; the
  wiring (answers read or the copy stops, written only through the create
  path, offered only to whoever may create).
- Rehearsed against production on 2026-10-07 in a rolled-back transaction, as
  the owner under row level security, on the live job: the copy is a draft
  with its own code, no short link, no deadline and no applicants; its form,
  quiz and steps are stored identical to the original's; all 5 answer keys
  were read, written for the copy and match the original's, and the copy's
  row carries none; an applicant cannot see the draft and neither can the
  public page; the original and its 65 applications were untouched.
- Clicked through in the dev preview on a computer and a phone: the row
  button, the toast, the new draft row, the chooser, Ava, a draft opening as
  itself, a live job copied and the copy opening in the editor.
