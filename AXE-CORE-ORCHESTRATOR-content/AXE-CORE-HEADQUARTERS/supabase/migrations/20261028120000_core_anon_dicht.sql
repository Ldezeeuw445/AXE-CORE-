-- core_* dicht voor anon, Luka-only voor authenticated.
--
-- NIET toepassen op live tot de clients (HQ + Android-poller + axe_api
-- /device/notifications) zijn uitgerold. Anders leest de oude poller
-- core_notifications nog via JWT (dat mag al), maar core_memory /
-- core_system_logs / core_events / core_workflows vallen om voor elke
-- aanroep zonder sessie.
--
-- Gemeten 28 okt 2026 op pqnngpcgbdwxavbatbia, 14 policies
-- `anon_all_core_*` (ALL, using true). De naam zegt anon; live hingen ze
-- aan rol `authenticated`, dus elke ingelogde user — niet alleen Luka —
-- had volledige toegang. Anon had nog GRANT SELECT/INSERT/UPDATE/DELETE.
--
--   core_ai_state, core_context, core_deployments, core_events,
--   core_integrations, core_memory, core_metrics, core_models,
--   core_permissions, core_routing, core_services, core_sessions,
--   core_system_logs, core_workflows
--
-- core_task_events had geen anon_all, wel `rw_core_task_events` ALL
-- using true voor authenticated. Geen GRANT voor anon/authenticated;
-- alleen service_role. Policy gaat toch weg.
--
-- Wie er wel bij moet:
--   - service_role (backend, workers): BYPASSRLS, policies niet aangeraakt.
--   - authenticated Luka (`core_owner()`): per operatie SELECT/INSERT/
--     UPDATE/DELETE op de veertien tabellen.
--   - core_task_events: alleen service_role, frontend leest via de API.
--
-- Terugdraaien: de oude `anon_all_*` policies (ALL using true) en GRANT
-- ALL aan anon. Doe dat niet.

create or replace function public.core_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid
      and u.id = (select auth.uid())
  );
$$;

revoke all on function public.core_owner() from public;
revoke all on function public.core_owner() from anon;
grant execute on function public.core_owner() to authenticated;

-- ── core_ai_state ──────────────────────────────────────────────────────────
drop policy if exists anon_all_core_ai_state on public.core_ai_state;
drop policy if exists luka_select_core_ai_state on public.core_ai_state;
drop policy if exists luka_insert_core_ai_state on public.core_ai_state;
drop policy if exists luka_update_core_ai_state on public.core_ai_state;
drop policy if exists luka_delete_core_ai_state on public.core_ai_state;
create policy luka_select_core_ai_state on public.core_ai_state
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_ai_state on public.core_ai_state
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_ai_state on public.core_ai_state
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_ai_state on public.core_ai_state
  for delete to authenticated using (public.core_owner());
alter table public.core_ai_state enable row level security;
revoke all on table public.core_ai_state from anon;
grant select, insert, update, delete on table public.core_ai_state to authenticated;

-- ── core_context ───────────────────────────────────────────────────────────
drop policy if exists anon_all_core_context on public.core_context;
drop policy if exists luka_select_core_context on public.core_context;
drop policy if exists luka_insert_core_context on public.core_context;
drop policy if exists luka_update_core_context on public.core_context;
drop policy if exists luka_delete_core_context on public.core_context;
create policy luka_select_core_context on public.core_context
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_context on public.core_context
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_context on public.core_context
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_context on public.core_context
  for delete to authenticated using (public.core_owner());
alter table public.core_context enable row level security;
revoke all on table public.core_context from anon;
grant select, insert, update, delete on table public.core_context to authenticated;

-- ── core_deployments ───────────────────────────────────────────────────────
drop policy if exists anon_all_core_deployments on public.core_deployments;
drop policy if exists luka_select_core_deployments on public.core_deployments;
drop policy if exists luka_insert_core_deployments on public.core_deployments;
drop policy if exists luka_update_core_deployments on public.core_deployments;
drop policy if exists luka_delete_core_deployments on public.core_deployments;
create policy luka_select_core_deployments on public.core_deployments
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_deployments on public.core_deployments
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_deployments on public.core_deployments
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_deployments on public.core_deployments
  for delete to authenticated using (public.core_owner());
alter table public.core_deployments enable row level security;
revoke all on table public.core_deployments from anon;
grant select, insert, update, delete on table public.core_deployments to authenticated;

-- ── core_events ────────────────────────────────────────────────────────────
drop policy if exists anon_all_core_events on public.core_events;
drop policy if exists luka_select_core_events on public.core_events;
drop policy if exists luka_insert_core_events on public.core_events;
drop policy if exists luka_update_core_events on public.core_events;
drop policy if exists luka_delete_core_events on public.core_events;
create policy luka_select_core_events on public.core_events
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_events on public.core_events
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_events on public.core_events
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_events on public.core_events
  for delete to authenticated using (public.core_owner());
alter table public.core_events enable row level security;
revoke all on table public.core_events from anon;
grant select, insert, update, delete on table public.core_events to authenticated;

-- ── core_integrations ──────────────────────────────────────────────────────
drop policy if exists anon_all_core_integrations on public.core_integrations;
drop policy if exists luka_select_core_integrations on public.core_integrations;
drop policy if exists luka_insert_core_integrations on public.core_integrations;
drop policy if exists luka_update_core_integrations on public.core_integrations;
drop policy if exists luka_delete_core_integrations on public.core_integrations;
create policy luka_select_core_integrations on public.core_integrations
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_integrations on public.core_integrations
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_integrations on public.core_integrations
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_integrations on public.core_integrations
  for delete to authenticated using (public.core_owner());
alter table public.core_integrations enable row level security;
revoke all on table public.core_integrations from anon;
grant select, insert, update, delete on table public.core_integrations to authenticated;

-- ── core_memory ────────────────────────────────────────────────────────────
drop policy if exists anon_all_core_memory on public.core_memory;
drop policy if exists svc_core_memory on public.core_memory;
drop policy if exists core_memory_select on public.core_memory;
drop policy if exists core_memory_insert on public.core_memory;
drop policy if exists core_memory_delete on public.core_memory;
drop policy if exists luka_select_core_memory on public.core_memory;
drop policy if exists luka_insert_core_memory on public.core_memory;
drop policy if exists luka_update_core_memory on public.core_memory;
drop policy if exists luka_delete_core_memory on public.core_memory;
create policy luka_select_core_memory on public.core_memory
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_memory on public.core_memory
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_memory on public.core_memory
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_memory on public.core_memory
  for delete to authenticated using (public.core_owner());
alter table public.core_memory enable row level security;
revoke all on table public.core_memory from anon;
grant select, insert, update, delete on table public.core_memory to authenticated;

-- ── core_metrics ───────────────────────────────────────────────────────────
drop policy if exists anon_all_core_metrics on public.core_metrics;
drop policy if exists luka_select_core_metrics on public.core_metrics;
drop policy if exists luka_insert_core_metrics on public.core_metrics;
drop policy if exists luka_update_core_metrics on public.core_metrics;
drop policy if exists luka_delete_core_metrics on public.core_metrics;
create policy luka_select_core_metrics on public.core_metrics
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_metrics on public.core_metrics
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_metrics on public.core_metrics
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_metrics on public.core_metrics
  for delete to authenticated using (public.core_owner());
alter table public.core_metrics enable row level security;
revoke all on table public.core_metrics from anon;
grant select, insert, update, delete on table public.core_metrics to authenticated;

-- ── core_models ────────────────────────────────────────────────────────────
drop policy if exists anon_all_core_models on public.core_models;
drop policy if exists luka_select_core_models on public.core_models;
drop policy if exists luka_insert_core_models on public.core_models;
drop policy if exists luka_update_core_models on public.core_models;
drop policy if exists luka_delete_core_models on public.core_models;
create policy luka_select_core_models on public.core_models
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_models on public.core_models
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_models on public.core_models
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_models on public.core_models
  for delete to authenticated using (public.core_owner());
alter table public.core_models enable row level security;
revoke all on table public.core_models from anon;
grant select, insert, update, delete on table public.core_models to authenticated;

-- ── core_permissions ───────────────────────────────────────────────────────
drop policy if exists anon_all_core_permissions on public.core_permissions;
drop policy if exists luka_select_core_permissions on public.core_permissions;
drop policy if exists luka_insert_core_permissions on public.core_permissions;
drop policy if exists luka_update_core_permissions on public.core_permissions;
drop policy if exists luka_delete_core_permissions on public.core_permissions;
create policy luka_select_core_permissions on public.core_permissions
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_permissions on public.core_permissions
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_permissions on public.core_permissions
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_permissions on public.core_permissions
  for delete to authenticated using (public.core_owner());
alter table public.core_permissions enable row level security;
revoke all on table public.core_permissions from anon;
grant select, insert, update, delete on table public.core_permissions to authenticated;

-- ── core_routing ───────────────────────────────────────────────────────────
drop policy if exists anon_all_core_routing on public.core_routing;
drop policy if exists luka_select_core_routing on public.core_routing;
drop policy if exists luka_insert_core_routing on public.core_routing;
drop policy if exists luka_update_core_routing on public.core_routing;
drop policy if exists luka_delete_core_routing on public.core_routing;
create policy luka_select_core_routing on public.core_routing
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_routing on public.core_routing
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_routing on public.core_routing
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_routing on public.core_routing
  for delete to authenticated using (public.core_owner());
alter table public.core_routing enable row level security;
revoke all on table public.core_routing from anon;
grant select, insert, update, delete on table public.core_routing to authenticated;

-- ── core_services ──────────────────────────────────────────────────────────
drop policy if exists anon_all_core_services on public.core_services;
drop policy if exists luka_select_core_services on public.core_services;
drop policy if exists luka_insert_core_services on public.core_services;
drop policy if exists luka_update_core_services on public.core_services;
drop policy if exists luka_delete_core_services on public.core_services;
create policy luka_select_core_services on public.core_services
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_services on public.core_services
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_services on public.core_services
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_services on public.core_services
  for delete to authenticated using (public.core_owner());
alter table public.core_services enable row level security;
revoke all on table public.core_services from anon;
grant select, insert, update, delete on table public.core_services to authenticated;

-- ── core_sessions ──────────────────────────────────────────────────────────
drop policy if exists anon_all_core_sessions on public.core_sessions;
drop policy if exists luka_select_core_sessions on public.core_sessions;
drop policy if exists luka_insert_core_sessions on public.core_sessions;
drop policy if exists luka_update_core_sessions on public.core_sessions;
drop policy if exists luka_delete_core_sessions on public.core_sessions;
create policy luka_select_core_sessions on public.core_sessions
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_sessions on public.core_sessions
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_sessions on public.core_sessions
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_sessions on public.core_sessions
  for delete to authenticated using (public.core_owner());
alter table public.core_sessions enable row level security;
revoke all on table public.core_sessions from anon;
grant select, insert, update, delete on table public.core_sessions to authenticated;

-- ── core_system_logs ───────────────────────────────────────────────────────
drop policy if exists anon_all_core_system_logs on public.core_system_logs;
drop policy if exists authenticated_all_core_system_logs on public.core_system_logs;
drop policy if exists svc_core_system_logs on public.core_system_logs;
drop policy if exists luka_select_core_system_logs on public.core_system_logs;
drop policy if exists luka_insert_core_system_logs on public.core_system_logs;
drop policy if exists luka_update_core_system_logs on public.core_system_logs;
drop policy if exists luka_delete_core_system_logs on public.core_system_logs;
create policy luka_select_core_system_logs on public.core_system_logs
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_system_logs on public.core_system_logs
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_system_logs on public.core_system_logs
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_system_logs on public.core_system_logs
  for delete to authenticated using (public.core_owner());
alter table public.core_system_logs enable row level security;
revoke all on table public.core_system_logs from anon;
grant select, insert, update, delete on table public.core_system_logs to authenticated;
-- service_role_all_core_system_logs blijft staan.

-- ── core_workflows ─────────────────────────────────────────────────────────
drop policy if exists anon_all_core_workflows on public.core_workflows;
drop policy if exists svc_core_workflows on public.core_workflows;
drop policy if exists luka_select_core_workflows on public.core_workflows;
drop policy if exists luka_insert_core_workflows on public.core_workflows;
drop policy if exists luka_update_core_workflows on public.core_workflows;
drop policy if exists luka_delete_core_workflows on public.core_workflows;
create policy luka_select_core_workflows on public.core_workflows
  for select to authenticated using (public.core_owner());
create policy luka_insert_core_workflows on public.core_workflows
  for insert to authenticated with check (public.core_owner());
create policy luka_update_core_workflows on public.core_workflows
  for update to authenticated using (public.core_owner()) with check (public.core_owner());
create policy luka_delete_core_workflows on public.core_workflows
  for delete to authenticated using (public.core_owner());
alter table public.core_workflows enable row level security;
revoke all on table public.core_workflows from anon;
grant select, insert, update, delete on table public.core_workflows to authenticated;

-- ── core_task_events: alleen service_role ──────────────────────────────────
drop policy if exists anon_all_core_task_events on public.core_task_events;
drop policy if exists rw_core_task_events on public.core_task_events;
drop policy if exists read_core_task_events on public.core_task_events;
drop policy if exists write_core_task_events on public.core_task_events;
alter table public.core_task_events enable row level security;
revoke all on table public.core_task_events from anon, authenticated;
-- service_role_only blijft staan. Geen GRANT aan authenticated:
-- Control Plane leest via /supabase (service_role).

-- ── Device-token voor de Android-poller (hash only) ────────────────────────
alter table public.core_axe_devices
  add column if not exists device_token_hash text;
create unique index if not exists core_axe_devices_token_hash
  on public.core_axe_devices (device_token_hash)
  where device_token_hash is not null;
