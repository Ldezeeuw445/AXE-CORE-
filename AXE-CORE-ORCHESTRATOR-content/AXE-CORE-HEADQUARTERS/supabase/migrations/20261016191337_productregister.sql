-- Eén productregister (docs/programma, taak CORE-REG-1).
--
-- registered_apps bestond al en blijft de plek; er komt geen tweede register bij.
-- Wat ontbrak: per product de repo per oppervlak, de werkmap, de commando's, het
-- uitroldoel, de hartslag, het runbook, de namen (nooit waarden) van de geheimen
-- en de cron-sleutels. En NorthSea stond er niet in; Axon wees naar de landingsrepo.
--
-- Eerst dicht: de twee policies gaven elke ingelogde gebruiker ALLES op deze tabel.
-- In het gedeelde project zijn dat ook alle Companion- en Trading OS-abonnees,
-- inclusief anonieme accounts. Een register met uitrolcommando's dat iedere klant
-- mag herschrijven is een weg naar de VPS. AXE Core leest en schrijft via
-- /supabase/table op de VPS met de service role; RLS raakt dat niet. Geen andere
-- repo leest registered_apps (gecontroleerd 16 okt).

drop policy if exists "Authenticated can view registered apps" on public.registered_apps;
drop policy if exists "Authenticated can manage registered apps" on public.registered_apps;
create policy "registered_apps_alleen_eigenaar" on public.registered_apps
  for all to authenticated
  using (auth.uid() = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid)
  with check (auth.uid() = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid);
revoke all on public.registered_apps from anon;

-- Vier kolommen bestonden live maar in geen enkele migratie.
alter table public.registered_apps
  add column if not exists icon_url text not null default '',
  add column if not exists android_package text not null default '',
  add column if not exists user_added boolean not null default false,
  add column if not exists sort_order integer;

alter table public.registered_apps
  add column if not exists product_key text,
  add column if not exists surfaces jsonb not null default '{}'::jsonb,
  add column if not exists workdir text not null default '',
  add column if not exists commands jsonb not null default '{}'::jsonb,
  add column if not exists deploy_target text,
  add column if not exists health jsonb not null default '{}'::jsonb,
  add column if not exists runbook text not null default '',
  add column if not exists secret_names text[] not null default '{}',
  add column if not exists cron_job_keys text[] not null default '{}',
  add column if not exists owner_agent text not null default '';

alter table public.registered_apps
  drop constraint if exists registered_apps_product_key_check,
  add constraint registered_apps_product_key_check
    check (product_key is null or product_key in ('axe_core','axe_companion','trading_os','axon_memory','northsea')),
  drop constraint if exists registered_apps_deploy_target_check,
  add constraint registered_apps_deploy_target_check
    check (deploy_target is null or deploy_target in ('cf-pages-git','cf-pages-direct','vps-systemd','tauri','supabase-functions','mixed'));
create unique index if not exists registered_apps_product_key_uniek
  on public.registered_apps (product_key) where product_key is not null;

comment on column public.registered_apps.secret_names is
  'Alleen NAMEN van geheimen die dit product nodig heeft. Nooit een waarde.';
comment on column public.registered_apps.commands is
  'Wat een bijdrager lokaal draait (install, typecheck, test, lint, build, deploy), vanuit workdir. Beschrijving, geen uitvoeropdracht.';

-- ── De vijf producten ──────────────────────────────────────────────────────
update public.registered_apps set
  product_key = 'axe_core',
  workdir = 'AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS',
  surfaces = '{"web":"https://axeheadquarters.com","api":"https://api.axecompanion.com","desktop":"Tauri, CI op push naar orchestrator"}',
  commands = '{"install":"npm ci","typecheck":"npx tsc --noEmit","test":"npx vitest run","lint":"npx eslint src","build":"npm run build:web","deploy":"git push origin HEAD:orchestrator (web) en python3 scripts/vps_sync.py deploy (API)"}',
  deploy_target = 'mixed',
  health = '{"url":"https://api.axecompanion.com/health","expect_status":200}',
  runbook = 'AGENTS.md',
  secret_names = array['AXE_API_KEY','SUPABASE_SERVICE_ROLE','VAPID_PRIVATE_KEY','axe_uptime_webhook'],
  cron_job_keys = array['axe_core:dax-wacht','axe_core:planner','axe_core:mac-opruimen'],
  owner_agent = 'developer'
where id = 'f16a86a5-9087-48a0-84d9-c8885e5e0ef1';

update public.registered_apps set
  product_key = 'axon_memory',
  repo = 'Ldezeeuw445/axon-memory-app',
  supabase_ref = 'ktaditgtbubonrahyiig',
  surfaces = '{"app":"https://app.axon-memory.com","landing":"https://axon-memory.com (repo Ldezeeuw445/axon-memory)","mcp":"https://mcp.axon-memory.com"}',
  commands = '{"install":"npm ci","test":"npm run test","lint":"npx oxlint src/","build":"npm run build","deploy":"op de Mac mini: npx wrangler pages deploy dist --project-name axon-app --branch main; supabase functions deploy <namen> --use-api"}',
  deploy_target = 'mixed',
  health = '{"url":"https://app.axon-memory.com/","expect_status":200}',
  runbook = '.claude/skills/axon-memory/SKILL.md',
  cron_job_keys = '{}'
where id = 'fa6aef68-26d1-4f1f-aa20-92038df74cc9';

update public.registered_apps set
  product_key = 'axe_companion',
  prod_url = 'https://www.axecompanion.com',
  supabase_ref = 'pqnngpcgbdwxavbatbia',
  surfaces = '{"web":"https://www.axecompanion.com","productie_tak":"deployed"}',
  commands = '{"install":"npm ci","test":"npm run verify","lint":"npm run lint","build":"npm run build","deploy":"op de VPS: scripts/deploy-vps.sh (merge naar deployed)"}',
  deploy_target = 'vps-systemd',
  health = '{"url":"https://www.axecompanion.com/robots.txt","expect_status":200}',
  runbook = 'AXE_SYSTEM_TRUTH.md',
  secret_names = array['UNUSUAL_WHALES_TOKEN','OPENAI_API_KEY','CRON_SECRET'],
  owner_agent = ''
where id = 'a6e52e71-f1c7-4e17-bc46-90bff8393e3f';

update public.registered_apps set
  product_key = 'trading_os',
  repo = 'Ldezeeuw445/the-one',
  default_branch = 'feature/ibkr-alpaca-adapters',
  workdir = 'Desktop/Trading OS Final APP/TRADING OS FINAL UI AND MAIN',
  prod_url = 'https://tradingosapp.com',
  supabase_ref = 'pqnngpcgbdwxavbatbia',
  surfaces = '{"web":"https://tradingosapp.com (402 sinds okt; besloten: naar Cloudflare Pages)","live_engine":"Cloudflare worker trading-os-live-engine"}',
  commands = '{"install":"npm ci","lint":"npm run lint","build":"npm run build"}',
  deploy_target = 'cf-pages-git',
  health = '{"url":"https://tradingosapp.com/","expect_status":200}',
  runbook = 'docs/TRADING_OS_AUDIT.md',
  secret_names = array['POLYGON_API_KEY','TWELVEDATA_API_KEY','FMP_API_KEY','FRED_API_KEY','AISSTREAM_API_KEY'],
  owner_agent = 'trading'
where id = '94894a8d-ad32-4885-bf65-f240beafdf31';

insert into public.registered_apps
  (name, description, repo, default_branch, prod_url, supabase_ref, internal_path, notes, enabled, sort_order,
   product_key, workdir, surfaces, commands, deploy_target, health, runbook, secret_names, cron_job_keys, owner_agent)
select 'NorthSea', 'Global Trade Center: commodity-deals, desk, crews en de MCP voor ChatGPT.',
  'Ldezeeuw445/AXE-CORE-', 'orchestrator', 'https://northseacommodity.com', 'kbimnuepbecbyezedvih', '/northsea-desktop',
  'Code woont in AXE Core; eigen Supabase-project AXE Commodities.', true, 50,
  'northsea', 'AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/backend/northsea_mcp',
  '{"web":"https://northseacommodity.com","mcp":"https://mcp.northseacommodity.com","desk":"/northsea-desktop in AXE Core"}',
  '{"test":"python3 -m pytest tests","deploy":"vanuit de HQ-map op de Mac: bash backend/northsea_mcp/deploy/deploy.sh check, dan deploy"}',
  'vps-systemd',
  '{"url":"https://mcp.northseacommodity.com/health","expect_status":200,"expect_body":{"status":"ok"}}',
  'docs/NORTHSEA_P0_P1_BASELINE.md',
  array['NORTHSEA_SUPABASE_URL','NORTHSEA_SUPABASE_SERVICE_ROLE','NORTHSEA_MCP_ALLOWED_USER_IDS','NORTHSEA_MCP_PUBLIC_URL'],
  array['northsea:engine','northsea:operations','northsea:discovery'],
  'northsea'
where not exists (select 1 from public.registered_apps where product_key = 'northsea' or name = 'NorthSea');

-- Terugdraaien:
--   drop policy if exists "registered_apps_alleen_eigenaar" on public.registered_apps;
--   create policy "Authenticated can view registered apps" on public.registered_apps for select using (auth.role() = 'authenticated');
--   create policy "Authenticated can manage registered apps" on public.registered_apps for all using (auth.role() = 'authenticated');
--   delete from public.registered_apps where product_key = 'northsea';
--   update public.registered_apps set repo = 'Ldezeeuw445/axon-memory' where product_key = 'axon_memory';
--   update public.registered_apps set repo = '', default_branch = 'main', prod_url = '' where product_key = 'trading_os';
--   (de nieuwe kolommen kunnen blijven staan; ze zijn additief)
