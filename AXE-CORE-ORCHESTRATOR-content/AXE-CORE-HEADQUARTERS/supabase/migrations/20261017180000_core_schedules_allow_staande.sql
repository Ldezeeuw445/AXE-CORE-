-- core_schedules_allow_staande (17 okt 2026).
--
-- De 24/7-jobs (staande_diensten.py) schrijven action_type 'staande'.
-- De check core_schedules_action_type_check kende die waarde niet, dus de
-- seed op /cron/tick viel om. Live al toegepast; dit is dezelfde wijziging
-- in de repo. Idempotent: drop + recreate.

alter table public.core_schedules drop constraint if exists core_schedules_action_type_check;
alter table public.core_schedules add constraint core_schedules_action_type_check
  check (action_type in ('prompt', 'exec', 'webhook', 'crew', 'observed', 'planner', 'northsea', 'review_desk', 'dax', 'staande'));
