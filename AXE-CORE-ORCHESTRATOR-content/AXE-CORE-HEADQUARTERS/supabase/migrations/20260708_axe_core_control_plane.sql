-- AXE CORE control plane
-- Adds first-class task, approval, patch, memory, event, and route registry tables.

create table if not exists public.core_tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  status          text not null default 'pending'
                  check (status in ('pending', 'queued', 'in_progress', 'blocked', 'waiting_approval', 'approved', 'rejected', 'done', 'failed')),
  priority        text not null default 'medium'
                  check (priority in ('low', 'medium', 'high', 'critical')),
  source_app      text not null default 'axe_core',
  requested_by    text,
  assignee        text,
  capability      text,
  execution_mode  text not null default 'read'
                  check (execution_mode in ('read', 'patch', 'execute')),
  route_path      text,
  payload         jsonb not null default '{}'::jsonb,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_core_tasks_status on public.core_tasks (status, created_at desc);
create index if not exists idx_core_tasks_priority on public.core_tasks (priority, created_at desc);
create index if not exists idx_core_tasks_requested_by on public.core_tasks (requested_by);

create table if not exists public.core_task_steps (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references public.core_tasks(id) on delete cascade,
  step_order      integer not null default 0,
  title           text not null,
  status          text not null default 'pending'
                  check (status in ('pending', 'queued', 'in_progress', 'blocked', 'done', 'failed')),
  notes           text,
  tool_name       text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (task_id, step_order)
);

create index if not exists idx_core_task_steps_task on public.core_task_steps (task_id, step_order);

create table if not exists public.core_tool_calls (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid references public.core_tasks(id) on delete cascade,
  step_id         uuid references public.core_task_steps(id) on delete set null,
  tool_name       text not null,
  service         text,
  execution_mode  text not null default 'read'
                  check (execution_mode in ('read', 'patch', 'execute')),
  input_summary   text,
  output_summary  text,
  status          text not null default 'queued'
                  check (status in ('queued', 'running', 'success', 'failed', 'cancelled')),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_core_tool_calls_task on public.core_tool_calls (task_id, created_at desc);
create index if not exists idx_core_tool_calls_tool on public.core_tool_calls (tool_name, created_at desc);

create table if not exists public.core_approvals (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid references public.core_tasks(id) on delete cascade,
  target_type     text not null default 'task',
  target_id       uuid,
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  requested_by    text,
  decided_by      text,
  decided_at      timestamptz,
  notes           text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_core_approvals_task on public.core_approvals (task_id, status, created_at desc);

create table if not exists public.core_patches (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid references public.core_tasks(id) on delete cascade,
  repo            text not null,
  branch          text not null default 'main',
  diff_summary    text not null,
  diff_text       text,
  patch_status    text not null default 'draft'
                  check (patch_status in ('draft', 'pending', 'approved', 'rejected', 'merged', 'failed')),
  commit_sha      text,
  pr_number       integer,
  pr_url          text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_core_patches_task on public.core_patches (task_id, created_at desc);
create index if not exists idx_core_patches_repo on public.core_patches (repo, branch);

create table if not exists public.core_agent_memory (
  id              uuid primary key default gen_random_uuid(),
  scope           text not null default 'global',
  category        text not null default 'preference'
                  check (category in ('preference', 'pattern', 'safe_action', 'failure_note', 'policy', 'note')),
  key             text,
  content         text not null,
  tags            text[] not null default '{}'::text[],
  confidence      numeric(4,3) not null default 0.500,
  source          text not null default 'manual',
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_core_agent_memory_scope on public.core_agent_memory (scope, category, created_at desc);
create index if not exists idx_core_agent_memory_tags on public.core_agent_memory using gin (tags);

create table if not exists public.core_events (
  id              uuid primary key default gen_random_uuid(),
  event_type      text not null,
  source          text not null,
  severity        text not null default 'info'
                  check (severity in ('debug', 'info', 'warn', 'error')),
  task_id         uuid references public.core_tasks(id) on delete set null,
  route_path      text,
  message         text not null,
  data            jsonb not null default '{}'::jsonb,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_core_events_created_at on public.core_events (created_at desc);
create index if not exists idx_core_events_source on public.core_events (source, created_at desc);
create index if not exists idx_core_events_task on public.core_events (task_id, created_at desc);

create table if not exists public.core_route_registry (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null default 'public'
                  check (kind in ('public', 'internal', 'hook', 'integration')),
  method          text not null,
  path            text not null unique,
  display_name    text not null,
  description     text,
  target          text,
  execution_mode  text not null default 'read'
                  check (execution_mode in ('read', 'patch', 'execute')),
  auth_required   boolean not null default true,
  enabled         boolean not null default true,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_core_route_registry_kind on public.core_route_registry (kind, enabled);

create or replace function public.touch_control_plane_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_core_tasks_updated_at on public.core_tasks;
create trigger trg_core_tasks_updated_at
  before update on public.core_tasks
  for each row execute function public.touch_control_plane_updated_at();

drop trigger if exists trg_core_task_steps_updated_at on public.core_task_steps;
create trigger trg_core_task_steps_updated_at
  before update on public.core_task_steps
  for each row execute function public.touch_control_plane_updated_at();

drop trigger if exists trg_core_tool_calls_updated_at on public.core_tool_calls;
create trigger trg_core_tool_calls_updated_at
  before update on public.core_tool_calls
  for each row execute function public.touch_control_plane_updated_at();

drop trigger if exists trg_core_approvals_updated_at on public.core_approvals;
create trigger trg_core_approvals_updated_at
  before update on public.core_approvals
  for each row execute function public.touch_control_plane_updated_at();

drop trigger if exists trg_core_patches_updated_at on public.core_patches;
create trigger trg_core_patches_updated_at
  before update on public.core_patches
  for each row execute function public.touch_control_plane_updated_at();

drop trigger if exists trg_core_agent_memory_updated_at on public.core_agent_memory;
create trigger trg_core_agent_memory_updated_at
  before update on public.core_agent_memory
  for each row execute function public.touch_control_plane_updated_at();

drop trigger if exists trg_core_route_registry_updated_at on public.core_route_registry;
create trigger trg_core_route_registry_updated_at
  before update on public.core_route_registry
  for each row execute function public.touch_control_plane_updated_at();

alter table public.core_tasks enable row level security;
alter table public.core_task_steps enable row level security;
alter table public.core_tool_calls enable row level security;
alter table public.core_approvals enable row level security;
alter table public.core_patches enable row level security;
alter table public.core_agent_memory enable row level security;
alter table public.core_events enable row level security;
alter table public.core_route_registry enable row level security;

do $$ begin
  if not exists (
    select from pg_policies
    where schemaname = 'public'
      and tablename = 'core_tasks'
      and policyname = 'svc_core_tasks'
  ) then create policy svc_core_tasks on public.core_tasks using (true); end if;

  if not exists (
    select from pg_policies
    where schemaname = 'public'
      and tablename = 'core_task_steps'
      and policyname = 'svc_core_task_steps'
  ) then create policy svc_core_task_steps on public.core_task_steps using (true); end if;

  if not exists (
    select from pg_policies
    where schemaname = 'public'
      and tablename = 'core_tool_calls'
      and policyname = 'svc_core_tool_calls'
  ) then create policy svc_core_tool_calls on public.core_tool_calls using (true); end if;

  if not exists (
    select from pg_policies
    where schemaname = 'public'
      and tablename = 'core_approvals'
      and policyname = 'svc_core_approvals'
  ) then create policy svc_core_approvals on public.core_approvals using (true); end if;

  if not exists (
    select from pg_policies
    where schemaname = 'public'
      and tablename = 'core_patches'
      and policyname = 'svc_core_patches'
  ) then create policy svc_core_patches on public.core_patches using (true); end if;

  if not exists (
    select from pg_policies
    where schemaname = 'public'
      and tablename = 'core_agent_memory'
      and policyname = 'svc_core_agent_memory'
  ) then create policy svc_core_agent_memory on public.core_agent_memory using (true); end if;

  if not exists (
    select from pg_policies
    where schemaname = 'public'
      and tablename = 'core_events'
      and policyname = 'svc_core_events'
  ) then create policy svc_core_events on public.core_events using (true); end if;

  if not exists (
    select from pg_policies
    where schemaname = 'public'
      and tablename = 'core_route_registry'
      and policyname = 'svc_core_route_registry'
  ) then create policy svc_core_route_registry on public.core_route_registry using (true); end if;
end $$;

insert into public.core_route_registry (kind, method, path, display_name, description, target, execution_mode, auth_required, enabled, metadata) values
  ('public',     'POST', '/api/tasks',                    'Create Task',           'Start a new orchestration task',                                'core_tasks',              'patch',   true,  true,  '{"domain":"control_plane"}'::jsonb),
  ('public',     'GET',  '/api/tasks/:id',                'Get Task',              'Read a task with steps, approvals, patches, events',           'core_tasks',              'read',    true,  true,  '{"domain":"control_plane"}'::jsonb),
  ('public',     'POST', '/api/tasks/:id/approve',        'Approve Task',          'Approve a task or patch',                                       'core_approvals',          'patch',   true,  true,  '{"domain":"control_plane"}'::jsonb),
  ('public',     'POST', '/api/tasks/:id/reject',         'Reject Task',           'Reject a task or patch',                                        'core_approvals',          'patch',   true,  true,  '{"domain":"control_plane"}'::jsonb),
  ('public',     'GET',  '/api/patches/:id',              'Get Patch',             'Fetch a patch, diff summary, and PR/commit metadata',           'core_patches',            'read',    true,  true,  '{"domain":"control_plane"}'::jsonb),
  ('public',     'GET',  '/maps-3d',                      '3D Maps',               'Free globe-based 3D maps page',                                  'maps_3d_page',            'read',    true,  true,  '{"domain":"ui"}'::jsonb),
  ('public',     'GET',  '/crewai',                       'CrewAI Bridge',         'CrewAI launch bridge page',                                      'crewai_bridge',           'read',    true,  true,  '{"domain":"ui"}'::jsonb),
  ('hook',       'POST', '/api/hooks/n8n',                'n8n Hook',              'Workflow callback endpoint for n8n',                            'n8n',                     'execute', true,  true,  '{"domain":"automation"}'::jsonb),
  ('hook',       'POST', '/api/hooks/langgraph',         'LangGraph Hook',        'Workflow callback endpoint for LangGraph',                      'langgraph',               'execute', true,  true,  '{"domain":"automation"}'::jsonb),
  ('internal',   'POST', '/internal/langgraph/run',      'Run LangGraph',         'Internal orchestrator dispatch',                                'langgraph',               'execute', true,  true,  '{"domain":"automation"}'::jsonb),
  ('internal',   'POST', '/internal/openhands/execute',   'Execute OpenHands',      'Internal OpenHands dispatch',                                   'openhands',               'execute', true,  true,  '{"domain":"automation"}'::jsonb),
  ('internal',   'POST', '/internal/openjarvis/execute',  'Execute OpenJarvis',     'Internal OpenJarvis dispatch',                                  'openjarvis',              'execute', true,  true,  '{"domain":"automation"}'::jsonb),
  ('internal',   'POST', '/internal/openclaw/execute',    'Execute OpenClaw',       'Internal OpenClaw dispatch',                                    'openclaw',                'execute', true,  true,  '{"domain":"automation"}'::jsonb),
  ('internal',   'POST', '/internal/kilocode/execute',    'Execute Kilo Code',      'Internal Kilo Code dispatch',                                   'kilocode',                'execute', true,  true,  '{"domain":"automation"}'::jsonb),
  ('internal',   'POST', '/internal/crewai/execute',      'Execute CrewAI',         'Internal CrewAI dispatch',                                      'crewai',                  'execute', true,  true,  '{"domain":"automation"}'::jsonb),
  ('internal',   'POST', '/internal/hermes/execute',      'Execute Hermes Agent',   'Internal Hermes Agent dispatch',                                'hermes',                  'execute', true,  true,  '{"domain":"automation"}'::jsonb),
  ('internal',   'POST', '/internal/n8n/trigger',         'Trigger n8n',           'Internal workflow trigger',                                     'n8n',                     'execute', true,  true,  '{"domain":"automation"}'::jsonb),
  ('integration', 'GET', '/integrations/google-maps',     'Google Maps',           'Free map view / map preview integration',                        'google_maps',             'read',    true,  true,  '{"provider":"google_maps","mode":"maps_view"}'::jsonb),
  ('integration', 'POST','/integrations/smartthings',     'SmartThings',           'SmartThings home automation integration',                        'smartthings',             'execute', true,  true,  '{"provider":"smartthings","mode":"device_control"}'::jsonb),
  ('integration', 'POST','/integrations/openhands',       'OpenHands',             'OpenHands agent bridge',                                        'openhands',               'execute', false, true,  '{"provider":"openhands"}'::jsonb),
  ('integration', 'POST','/integrations/openjarvis',      'OpenJarvis',            'OpenJarvis agent bridge',                                       'openjarvis',              'execute', false, true,  '{"provider":"openjarvis"}'::jsonb),
  ('integration', 'POST','/integrations/openclaw',        'OpenClaw',              'OpenClaw agent bridge',                                          'openclaw',                'execute', false, true,  '{"provider":"openclaw"}'::jsonb),
  ('integration', 'POST','/integrations/kilocode',        'Kilo Code',             'Kilo Code agent bridge',                                         'kilocode',                'execute', false, true,  '{"provider":"kilocode"}'::jsonb),
  ('integration', 'POST','/integrations/crewai',          'CrewAI',                'CrewAI agent bridge',                                            'crewai',                  'execute', false, true,  '{"provider":"crewai"}'::jsonb),
  ('integration', 'POST','/integrations/hermes',           'Hermes Agent',          'Hermes Agent bridge',                                            'hermes',                  'execute', false, true,  '{"provider":"hermes"}'::jsonb)
on conflict (path) do update
set
  kind = excluded.kind,
  method = excluded.method,
  display_name = excluded.display_name,
  description = excluded.description,
  target = excluded.target,
  execution_mode = excluded.execution_mode,
  auth_required = excluded.auth_required,
  enabled = excluded.enabled,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.core_system_state (service, display, status, enabled) values
  ('google_maps', 'Google Maps', 'unknown', true),
  ('smartthings', 'SmartThings', 'unknown', true),
  ('hermes', 'Hermes Agent', 'unknown', true)
on conflict (service) do nothing;
