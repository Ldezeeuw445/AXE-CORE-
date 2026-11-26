-- 26 nov (ADR managers-zijn-dax): de manager ÍS de DAX-bot. Eigenaar wordt de
-- manager; de oude botnaam blijft lid (alias), zodat lopende routines doorwerken.
-- Companion en AXON krijgen een eigen computer; de container start bij de eerste
-- taak (ensure_running). Niets verwijderd, geen volume aangeraakt.
update core_dax_computers set owner_agent = 'axemanager',
  members = (select array_agg(distinct m) from unnest(members || array['axemanager']) m),
  metadata = coalesce(metadata, '{}'::jsonb) || '{"manager": "axemanager", "alias_van": "thinktank"}'::jsonb
  where id = 'dax-thinktank-01';
update core_dax_computers set owner_agent = 'projectsmgr',
  members = (select array_agg(distinct m) from unnest(members || array['projectsmgr']) m),
  metadata = coalesce(metadata, '{}'::jsonb) || '{"manager": "projectsmgr", "alias_van": "developer"}'::jsonb
  where id = 'dax-developer-01';
update core_dax_computers set owner_agent = 'northseamgr',
  members = (select array_agg(distinct m) from unnest(members || array['northseamgr']) m),
  metadata = coalesce(metadata, '{}'::jsonb) || '{"manager": "northseamgr", "alias_van": "northsea"}'::jsonb
  where id = 'dax-northsea-01';
update core_dax_computers set owner_agent = 'tradingos',
  members = (select array_agg(distinct m) from unnest(members || array['tradingos']) m),
  metadata = coalesce(metadata, '{}'::jsonb) || '{"manager": "tradingos", "alias_van": "trading"}'::jsonb
  where id = 'dax-trading-01';
-- De browsercomputer is van iedereen: elke manager is lid.
update core_dax_computers set
  members = (select array_agg(distinct m) from unnest(members || array['axemanager','projectsmgr','companionmgr','axon','tradingos','northseamgr']) m),
  metadata = coalesce(metadata, '{}'::jsonb) || '{"gedeeld": true}'::jsonb
  where id = 'dax-browser-01';

insert into core_dax_computers (id, owner_agent, members, runtime, host, container_name, image, status, computer_mode, cpu_limit, memory_limit_mb, heavy_slots, volumes, metadata)
values
  ('dax-companion-01', 'companionmgr', array['companionmgr'], 'docker', 'strato', 'dax-companion-01', 'axe-dax-base:latest', 'provisioned', 'persistent', '1.5', 2048, 1,
   '{"home":"dax-companion-01-home","browser":"dax-companion-01-browser","artifacts":"dax-companion-01-artifacts","workspace":"dax-companion-01-workspace"}'::jsonb,
   '{"always_on": true, "manager": "companionmgr"}'::jsonb),
  ('dax-axon-01', 'axon', array['axon'], 'docker', 'strato', 'dax-axon-01', 'axe-dax-base:latest', 'provisioned', 'persistent', '1.5', 2048, 1,
   '{"home":"dax-axon-01-home","browser":"dax-axon-01-browser","artifacts":"dax-axon-01-artifacts","workspace":"dax-axon-01-workspace"}'::jsonb,
   '{"always_on": true, "manager": "axon"}'::jsonb)
on conflict (id) do nothing;
