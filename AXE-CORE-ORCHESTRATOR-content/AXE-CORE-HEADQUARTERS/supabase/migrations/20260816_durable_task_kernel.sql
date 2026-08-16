-- AXE durable execution kernel.
--
-- This is deliberately additive to the existing control-plane tables. Existing
-- UI rows remain valid; new runs gain leases, checkpoints, idempotency and an
-- append-only event stream so work can resume after a process/app restart.

-- Some AXE Companion environments were bootstrapped from an early partial
-- control-plane migration and only contain core_tasks. Create the dependent
-- tables here as well so this migration is safe on the actual production
-- schema, while remaining a no-op where they already exist.
create table if not exists public.core_task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.core_tasks(id) on delete cascade,
  step_order integer not null default 0,
  title text not null,
  status text not null default 'pending',
  notes text,
  tool_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, step_order)
);
create index if not exists idx_core_task_steps_task
  on public.core_task_steps (task_id, step_order);

create table if not exists public.core_approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.core_tasks(id) on delete cascade,
  target_type text not null default 'task',
  target_id uuid,
  status text not null default 'pending',
  requested_by text,
  decided_by text,
  decided_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_core_approvals_task
  on public.core_approvals (task_id, status, created_at desc);

alter table public.core_tasks
  add column if not exists source_app text not null default 'axe_core',
  add column if not exists requested_by text,
  add column if not exists capability text,
  add column if not exists execution_mode text not null default 'read',
  add column if not exists route_path text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists goal text,
  add column if not exists idempotency_key text,
  add column if not exists parent_task_id uuid references public.core_tasks(id) on delete set null,
  add column if not exists current_step_id uuid,
  add column if not exists checkpoint jsonb not null default '{}'::jsonb,
  add column if not exists result jsonb,
  add column if not exists error jsonb,
  add column if not exists worker_id text,
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists attempt integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists revision bigint not null default 0;

-- The old status constraint predates resumable runs.
alter table public.core_tasks drop constraint if exists core_tasks_status_check;
alter table public.core_tasks
  add constraint core_tasks_status_check check (
    status in (
      'pending', 'queued', 'planning', 'in_progress', 'running', 'blocked',
      'waiting_approval', 'approved', 'rejected', 'verifying', 'retrying',
      'done', 'completed', 'failed', 'cancelled'
    )
  );

create unique index if not exists uq_core_tasks_idempotency
  on public.core_tasks (requested_by, idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_core_tasks_claim
  on public.core_tasks (status, next_attempt_at, priority, created_at)
  where status in ('queued', 'retrying', 'planning', 'running', 'in_progress', 'verifying');
create index if not exists idx_core_tasks_lease
  on public.core_tasks (lease_expires_at)
  where lease_token is not null;
create index if not exists idx_core_tasks_parent
  on public.core_tasks (parent_task_id, created_at);

alter table public.core_task_steps
  add column if not exists step_key text,
  add column if not exists kind text not null default 'action',
  add column if not exists input jsonb not null default '{}'::jsonb,
  add column if not exists output jsonb,
  add column if not exists error jsonb,
  add column if not exists checkpoint jsonb not null default '{}'::jsonb,
  add column if not exists depends_on uuid[] not null default '{}'::uuid[],
  add column if not exists attempt integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.core_task_steps drop constraint if exists core_task_steps_status_check;
alter table public.core_task_steps
  add constraint core_task_steps_status_check check (
    status in (
      'pending', 'queued', 'in_progress', 'running', 'blocked',
      'waiting_approval', 'verifying', 'retrying', 'done', 'completed',
      'failed', 'cancelled', 'skipped'
    )
  );
create unique index if not exists uq_core_task_steps_key
  on public.core_task_steps (task_id, step_key)
  where step_key is not null;

alter table public.core_approvals
  add column if not exists kind text not null default 'action',
  add column if not exists title text,
  add column if not exists detail text,
  add column if not exists expires_at timestamptz,
  add column if not exists decision_reason text,
  add column if not exists revision bigint not null default 0;
alter table public.core_approvals drop constraint if exists core_approvals_status_check;
alter table public.core_approvals
  add constraint core_approvals_status_check
  check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled'));
create unique index if not exists uq_core_approvals_pending_target
  on public.core_approvals (task_id, target_type, target_id, kind)
  where status = 'pending';

create table if not exists public.core_task_events (
  sequence bigint generated always as identity primary key,
  task_id uuid not null references public.core_tasks(id) on delete cascade,
  step_id uuid references public.core_task_steps(id) on delete set null,
  event_type text not null,
  actor_type text not null default 'system'
    check (actor_type in ('user', 'axe', 'worker', 'tool', 'system')),
  actor_id text,
  message text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_core_task_events_stream
  on public.core_task_events (task_id, sequence);

alter table public.core_task_events enable row level security;
revoke all on public.core_task_events from anon, authenticated;
drop policy if exists service_role_only on public.core_task_events;
create policy service_role_only on public.core_task_events
  for all to service_role
  using (true) with check (true);

-- These orchestration tables are backend-only. The Tauri/web client reaches
-- them through axe-core-api, never through the public Supabase anon key.
revoke all on public.core_tasks, public.core_task_steps, public.core_approvals
  from anon, authenticated;
drop policy if exists svc_core_tasks on public.core_tasks;
drop policy if exists svc_core_task_steps on public.core_task_steps;
drop policy if exists svc_core_approvals on public.core_approvals;
create policy service_role_only on public.core_tasks
  for all to service_role using (true) with check (true);
create policy service_role_only on public.core_task_steps
  for all to service_role using (true) with check (true);
create policy service_role_only on public.core_approvals
  for all to service_role using (true) with check (true);

-- Atomically lease one due run. SKIP LOCKED lets multiple workers cooperate
-- without executing the same task.
create or replace function public.claim_next_core_task(
  p_worker_id text,
  p_lease_seconds integer default 60
) returns setof public.core_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task_id uuid;
begin
  select id into v_task_id
  from public.core_tasks
  where (
      status in ('queued', 'retrying', 'planning', 'verifying')
      or (
        status in ('running', 'in_progress')
        and (lease_expires_at is null or lease_expires_at < now())
      )
    )
    and next_attempt_at <= now()
    and attempt < max_attempts
    and status not in ('waiting_approval', 'completed', 'done', 'failed', 'cancelled')
  order by
    case priority when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
    created_at
  for update skip locked
  limit 1;

  if v_task_id is null then return; end if;

  return query
  update public.core_tasks
  set status = 'running',
      worker_id = p_worker_id,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(10, least(p_lease_seconds, 600))),
      heartbeat_at = now(),
      started_at = coalesce(started_at, now()),
      attempt = attempt + 1,
      revision = revision + 1,
      updated_at = now()
  where id = v_task_id
  returning *;
end;
$$;

create or replace function public.heartbeat_core_task(
  p_task_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_seconds integer default 60,
  p_checkpoint jsonb default null
) returns public.core_tasks
language plpgsql
security definer
set search_path = public
as $$
declare v_task public.core_tasks;
begin
  update public.core_tasks
  set lease_expires_at = now() + make_interval(secs => greatest(10, least(p_lease_seconds, 600))),
      heartbeat_at = now(),
      checkpoint = coalesce(p_checkpoint, checkpoint),
      revision = revision + 1,
      updated_at = now()
  where id = p_task_id
    and worker_id = p_worker_id
    and lease_token = p_lease_token
    and status in ('running', 'in_progress', 'planning', 'verifying')
  returning * into v_task;
  if v_task.id is null then
    raise exception 'lease_lost' using errcode = 'P0001';
  end if;
  return v_task;
end;
$$;

revoke all on function public.claim_next_core_task(text, integer) from public, anon, authenticated;
revoke all on function public.heartbeat_core_task(uuid, text, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.claim_next_core_task(text, integer) to service_role;
grant execute on function public.heartbeat_core_task(uuid, text, uuid, integer, jsonb) to service_role;

comment on table public.core_task_events is
  'Append-only execution timeline consumed by the AXE narrator/UI. Secrets and full credential-bearing payloads must never be written here.';
