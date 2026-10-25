-- The private copy the evaluations move kept (20261025235000) goes, now the
-- move is checked live (2026-10-25): the 109 moved rows matched their
-- fingerprint before and after exactly, nothing was left on applications,
-- the notes lost only avaScorecard and the structured scores, and the API
-- serves the scores through application_evaluations to the hiring team only.
-- Kept no longer than that, so it holds no applicant's or team's data past
-- its purpose.

DROP TABLE IF EXISTS private.application_evaluation_move_backup;
