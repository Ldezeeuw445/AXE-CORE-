-- DAX-bots always-on (11 okt 2026).
--
-- Luka: "er zijn DAX-bots met allemaal een eigen computer die zouden moeten
-- werken als grokbots, always on" -- en in de praktijk deed niets iets vanzelf.
-- Gemeten: een DAX werd alleen wakker van een taak, schreef alleen dan een
-- heartbeat en sliep na 30 min weer; developer en trading hadden nooit een taak
-- gehad (provisioned, geen heartbeat), en er bestond geen enkele lopende missie.
--
-- Wat dit doet (additief, idempotent):
--   1. action_type 'dax' mag in core_schedules (de DAX-wacht, dax_wacht.py).
--   2. alle vijf DAX-computers: metadata.always_on = true (de slaapronde slaat ze over).
--   3. één job op de bestaande planner: axe_core:dax-wacht, VPS, elke 5 min.
--      Die houdt elke container draaiend, meet hem (heartbeat), en zorgt dat elke
--      bot zijn vaste doorlopende missie heeft -- of een eerlijke blokkade.
--
-- Uitzetten: update core_schedules set enabled = false where job_key = 'axe_core:dax-wacht';
-- Eén bot laten slapen: update core_dax_computers set metadata = metadata || '{"always_on": false}' where id = '...';

alter table public.core_schedules drop constraint if exists core_schedules_action_type_check;
alter table public.core_schedules add constraint core_schedules_action_type_check
  check (action_type in ('prompt', 'exec', 'webhook', 'crew', 'observed', 'planner', 'northsea', 'review_desk', 'dax'));

update public.core_dax_computers
   set metadata = coalesce(metadata, '{}'::jsonb) || '{"always_on": true}'::jsonb,
       updated_at = now()
 where coalesce(metadata->>'always_on', '') <> 'true';

insert into public.core_schedules
  (name, cron_expr, timezone, action_type, action_payload, enabled, next_run_at, metadata,
   app, executor, job_key, description, max_runtime_s)
select 'DAX watch: keep every bot awake, measured and working', '*/5 * * * *', 'UTC', 'dax', '{}'::jsonb, true,
       now(), '{"app": "axe_core", "agent": "apps"}'::jsonb, 'axe_core', 'vps', 'axe_core:dax-wacht',
       'Keeps each DAX container running, writes a measured heartbeat, installs dax-routine, '
       'and gives each bot its standing mission -- or blocks it with the exact reason.',
       240
where not exists (select 1 from public.core_schedules where job_key = 'axe_core:dax-wacht');
