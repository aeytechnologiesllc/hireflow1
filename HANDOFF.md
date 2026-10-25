# Handoff: Phase 4 round 12 (classifier and place reader)

Brief: scratchpad `p4r12_fix_brief.md`. Work commit: 121f6b8c (on top of bd5c5e98).

## Done

- Twelfth review H1–H3, M1–M8: all fixed (`src/lib/avaEngine/playbook.ts`,
  `src/lib/avaEngine/customerService.ts`, `src/lib/jobLocation.ts`).
- LOW items fixed: platform shops only the business's own; e-commerce and
  software words as the account; "the store's records"; night shift
  differential in perks; phone stores; DM / text / chat to apply;
  frustrated, difficult, aggressive callers and escalating a call; missed
  calls and voicemails; lottery tickets; "Remote with occasional onsite" and
  "WFH or Onsite (Makati)" as hybrid; "Online" as remote.
- Fifth product review: finding 4 (negated on-site words, Online), finding 6
  (client and hours words, PH, BGC, Ortigas), finding 1's last line and
  finding 9 (builder notes: typing only for remote jobs, second-language only
  where true, no practice call promised).
- Every case added to `scripts/customer_service_hiring.test.mjs` and
  `scripts/remote_from_location.test.mjs`; docs/CUSTOMER-SERVICE-HIRING.md updated.

## Left

- LOW not done: "Customer Service - Hospitality Staff / answer calls and
  emails from hotel guests" (no small safe rule).
- Nothing else. `node scripts/guardrails.mjs` (226/226) and
  `tsc --noEmit -p tsconfig.app.json` (no errors) pass at 121f6b8c; 200 KB
  adversarial inputs on the new rules run in under 100 ms.

## Counts (before → after)

- Report cases (r15/report.json): 0/48 → 48/48. All 84 reviewer cases
  (scratchpad p4r12fix/all_cases.json): 84/84.
- Earlier probes (4,896): 50 failures → 50 (0 new, the same set).
- customer_service_hiring 1658 → 1755 (91 of the new checks fail on the old
  code; 6 are guards that already passed); remote_from_location 76 → 105
  (23 fail on the old code); interview_guide 289, written_interview_flow 62,
  job_benefits_mapping 18, salary_parse 22: all pass.

## Failing tests

None of the six test files fail.
