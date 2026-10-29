-- The step-words lock reads each word with the key and place that hold it
-- (the twenty-first Phase 5 review, its final round under the stop rule;
-- finding 1, MEDIUM, an old gap; probe pf1_rekey).
--
-- jobs_applicant_words_fixed (20261025730000) refuses a browser's change of a
-- job's form questions, quiz or step words once anyone has applied, and
-- job_step_words gave it every string of the three as one flat list, with no
-- key: a business planted unused keys ("questionz", "titlf", "promptz") with a
-- GCash fee ask before anyone applied, where no page shows them, and once
-- people had applied moved the same strings into "question", "title" and
-- "config.prompt" in one save. The flat list was the same, the lock took it,
-- and every applicant read the fee ask on the form, the step and the video
-- prompt, with nothing recorded. job_words_tree keeps every string at its
-- key and place (numbers, switches and nulls are still not words; the quiz's
-- answer fields are still left out, job_answer_keys_sent compares them), so
-- the swap is a change and is refused. job_step_words keeps its signature;
-- jobs_applicant_words_fixed is unchanged.
--
-- job_step_words is redefined from its latest body,
-- 20261025730000_applicants_words_stay_as_applied.sql (md5(prosrc)
-- ab2050d9e4a92c5be7cc9a73927c4475), with only its reading changed (the reviewer's
-- tested patch, review-materials/p5final/mut/FIX_words_keep_keys.sql).

SET lock_timeout = '5s';
SET statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.job_words_tree(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  out_obj jsonb := '{}'::jsonb;
  out_arr jsonb := '[]'::jsonb;
  k text;
  v jsonb;
  e jsonb;
  has_words boolean := false;
BEGIN
  CASE jsonb_typeof(p)
    WHEN 'string' THEN
      RETURN p;
    WHEN 'object' THEN
      FOR k, v IN SELECT * FROM jsonb_each(p) LOOP
        e := public.job_words_tree(v);
        IF e IS NOT NULL THEN
          out_obj := out_obj || jsonb_build_object(k, e);
        END IF;
      END LOOP;
      RETURN CASE WHEN out_obj = '{}'::jsonb THEN NULL ELSE out_obj END;
    WHEN 'array' THEN
      FOR v IN SELECT x FROM jsonb_array_elements(p) x LOOP
        e := public.job_words_tree(v);
        out_arr := out_arr || jsonb_build_array(e);
        IF e IS NOT NULL THEN has_words := true; END IF;
      END LOOP;
      RETURN CASE WHEN has_words THEN out_arr ELSE NULL END;
    ELSE
      RETURN NULL;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.job_words_tree(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.job_step_words(p_questions jsonb, p_quiz jsonb, p_steps jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(public.job_words_tree(
    jsonb_build_array(
      p_questions,
      CASE WHEN jsonb_typeof(p_quiz) = 'array' THEN
        (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(q.value) = 'object'
                                        THEN q.value - ARRAY['correct_answer', 'correctAnswer', 'correct_answers', 'fit_context']
                                        ELSE q.value END ORDER BY q.n), '[]'::jsonb)
           FROM jsonb_array_elements(p_quiz) WITH ORDINALITY q(value, n))
      ELSE p_quiz END,
      CASE WHEN jsonb_typeof(p_steps) = 'array' THEN
        (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(s.value) = 'object' AND s.value ->> 'type' = 'quiz'
                                         AND jsonb_typeof(s.value -> 'config' -> 'questions') = 'array'
                                        THEN jsonb_set(s.value, '{config,questions}',
                                               (SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(q.value) = 'object'
                                                                               THEN q.value - ARRAY['correct_answer', 'correctAnswer', 'correct_answers', 'fit_context']
                                                                               ELSE q.value END ORDER BY q.n), '[]'::jsonb)
                                                  FROM jsonb_array_elements(s.value -> 'config' -> 'questions') WITH ORDINALITY q(value, n)))
                                        ELSE s.value END ORDER BY s.n), '[]'::jsonb)
           FROM jsonb_array_elements(p_steps) WITH ORDINALITY s(value, n))
      ELSE p_steps END
    )), '[]'::jsonb);
$$;

REVOKE ALL ON FUNCTION public.job_step_words(jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

RESET statement_timeout;
RESET lock_timeout;
