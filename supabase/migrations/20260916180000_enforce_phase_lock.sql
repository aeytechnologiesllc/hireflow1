-- Final cycle-4 step: lock applications.phase against direct candidate writes.
--
-- Every candidate screening step now records its result and advances phase
-- server-side through recordStepResult (typing, chat simulation, chat
-- interview, sales simulation, portfolio, video intro, voice) or through the
-- quiz RPC, and all seven per-step enforcement flags are already on. The
-- application form never writes phase (JobDetails inserts the row with
-- phase 'application'; the submit only sets status 'pending'). The
-- foundation migration (20260915140000_trusted_step_results.sql) guards phase
-- behind this single flag and says to flip it last, which is now.
--
-- Service role, job owners and active team members keep full write access;
-- only a candidate's own direct UPDATE of phase is refused. Idempotent.

UPDATE public.trusted_result_enforcement
SET enforced = true, updated_at = now()
WHERE result_key = 'phase';
