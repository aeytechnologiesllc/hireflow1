# Candidate flow (accountless apply + phone continue)

This document describes the **final** candidate UX for the showcase Supabase path (`roles` / `candidates` / `applications`). Read this before changing applicant routes or copy.

## Principles

- **No account required** to start applying.
- **No magic links** emailed to candidates.
- **No private passcode / return link** as the primary resume path.
- **No applicant-facing Ava / AI / bot / automated language** on candidate surfaces.
- Job code finds the **role**; **phone + email + job** identifies the **person** (Josh vs Jonathan).

## Routes

| Route | Purpose |
|-------|---------|
| `/candidate` | Landing — primary CTAs: Enter job code, Continue your application |
| `/candidate/apply` | Enter job code → role preview → start form |
| `/candidate/apply/:roleId/form` | Phase 1 application (name, email, phone, optional answers) |
| `/candidate/continue` | Enter phone → applications dashboard → tap to resume |
| `/candidate/job/:id` | Role detail (showcase) — Start application without auth |
| `/candidate/auth` | Optional sign-in / signup (not required to apply) |

Apply link format (employer share):  
`https://<host>/candidate/apply?code=ROLE-XXXXXX`

## Flow A — New application

1. Candidate opens landing or apply link with job code.
2. System loads `roles` row by `role_code` (status must be live-ish: `live`, `shortlist`, `quiz`, `interview`).
3. Candidate reviews role → **Start application** (no auth).
4. Phase 1 form collects:
   - Full name
   - Email
   - **Phone (required)**
   - Optional interest answer
5. Submit creates:
   - `candidates` row (guest id `cand_*`)
   - `applications` row (`stage=applied`, `current_phase=applied`, `applicant_email`, `applicant_phone`)
6. **Save progress prompt** (encouraged, not blocking):
   - Continue with Google (Supabase OAuth)
   - Create account with email + password
   - Skip / Continue
7. On account creation, `linkGuestApplications()` sets `applications.linked_user_id` where phone/email match.

## Flow B — Continue later (phone only)

1. Candidate taps **Continue your application** (landing, apply page, or post-submit).
2. Enters **phone number only**.
3. `fetchApplicationsByPhone()` normalizes digits and matches:
   - `applications.applicant_phone`
   - `candidates.phone` (via `candidate_id`)
4. Shows **applications dashboard**: list of roles, status/phase label, tap to open.
5. Tap → `resumeRouteForApplication()`:
   - `applied` → resume view on form route (status message)
   - `quiz` / `interview` → stub “next step coming soon” (phase engine not fully wired on showcase path yet)

## Edge cases

| Case | Behavior |
|------|----------|
| Invalid / expired job code | Error on apply page; no role loaded |
| Phone with no applications | “No applications found for this phone number” |
| Multiple jobs same phone | Dashboard lists all; user picks one |
| Same email+phone+role re-apply | `findApplicationByContact` returns existing; redirect to continue |
| User skips account prompt | Can still return via phone continue |
| Signed-in candidate (hireflow1) | Legacy `/applications/*` phase engine still exists for `jobs` table deployments |

## Copy rules (candidate-facing)

Use `candidatePhaseDisplayNames` / `getCandidatePhaseDisplayName()` from `src/lib/terminology.ts`.  
Never use: Ava, AI, artificial, bot, robot, copilot, automated, algorithm.

## Key implementation files

- `src/lib/showcaseApply.ts` — data layer (apply, phone lookup, link accounts, create role)
- `src/pages/ShowcaseApplyForm.tsx` — phase 1 form + save prompt
- `src/pages/CandidateContinue.tsx` — phone lookup + dashboard
- `src/components/candidate/SaveProgressPrompt.tsx` — Google + email/password only
- `src/pages/ApplyWithCode.tsx` — code entry (showcase branch)
- `src/cockpit/pages/Jobs.tsx` — employer copy code / share link

## Employer visibility

New applications increment `roles.applicant_count` (trigger) and appear in cockpit Applicants via `showcaseSource.fetchShowcaseCandidates()` (queries `applications` + `candidates` + `roles`).
