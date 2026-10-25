-- A note that an applicant withdrew from a job (private.application_withdrawals,
-- 20261025350000) goes with their account (the eighth Phase 5 review): the
-- Privacy Policy lists what stays after Delete Account, and this was not
-- meant to. A note whose account is already gone is removed first.
delete from private.application_withdrawals w
 where not exists (select 1 from auth.users u where u.id = w.candidate_id);
alter table private.application_withdrawals
  drop constraint if exists application_withdrawals_candidate_fk;
alter table private.application_withdrawals
  add constraint application_withdrawals_candidate_fk
  foreign key (candidate_id) references auth.users (id) on delete cascade;
