-- Missies en DAX: AXE werkt door zonder dat Luka "ga door" hoeft te zeggen.
--
-- Bovenop de durable task-kernel (20260816). Niets wordt vervangen:
--   * core_missions      een uitkomst boven losse taken, met mijlpalen
--   * core_mission_events append-only tijdlijn van de missielus
--   * core_tasks.mission_id  een taak weet voor welke missie hij draait
--   * core_dax_computers  waar een agent uitvoert (Agent Workspace = wie, DAX = waar)
--   * core_dax_slots      hoeveel zware DAX-taken er tegelijk draaien
--   * core_agent_events   één tijdlijn per agent, uit echte task- en missie-events
--
-- Alles is service_role-only, net als core_tasks: de app komt via axe-core-api.
-- Volledig additief en idempotent; terugdraaien = deze objecten droppen en
-- de kolom core_tasks.mission_id laten staan (die is nullable en onschadelijk).

create extension if not exists pgcrypto;

-- ── 1. Missies ───────────────────────────────────────────────────────────────
create table if not exists public.core_missions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  goal text not null,
  owner_agent text not null,
  supporting_agents text[] not null default '{}'::text[],
  status text not null default 'active',
  priority text not null default 'medium',
  -- [{key, title, goal, status, task_id, attempts, iterations, next_action,
  --   evidence, completed_at}]
  milestones jsonb not null default '[]'::jsonb,
  current_milestone integer not null default 0,
  progress numeric not null default 0,
  next_action text,
  blocked_reason text,
  last_stop_reason text,
  continue_until text not null default 'complete',
  -- Doorlopende missies (NorthSea deal sourcing): na de laatste mijlpaal
  -- opnieuw beginnen na dit interval. Null = eenmalig.
  recurring_interval_seconds integer,
  max_attempts_per_milestone integer not null default 3,
  max_iterations_per_milestone integer not null default 5,
  next_run_at timestamptz not null default now(),
  lease_owner text,
  lease_token uuid,
  lease_expires_at timestamptz,
  revision bigint not null default 0,
  requested_by text not null default 'luka',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint core_missions_status_check check (status in (
    'draft', 'active', 'monitoring', 'waiting_agent', 'waiting_approval',
    'blocked', 'human_decision_required', 'paused', 'completed', 'failed', 'cancelled'
  )),
  constraint core_missions_priority_check check (priority in ('low', 'medium', 'high', 'critical')),
  constraint core_missions_continue_check check (continue_until in (
    'complete', 'blocked', 'human_decision_required', 'paused'
  ))
);
create index if not exists idx_core_missions_runnable
  on public.core_missions (next_run_at, priority)
  where status in ('active', 'monitoring', 'waiting_agent', 'waiting_approval');
create index if not exists idx_core_missions_owner
  on public.core_missions (owner_agent, status, updated_at desc);

create table if not exists public.core_mission_events (
  sequence bigint generated always as identity primary key,
  mission_id uuid not null references public.core_missions(id) on delete cascade,
  task_id uuid references public.core_tasks(id) on delete set null,
  agent text,
  event_type text not null,
  message text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_core_mission_events_stream
  on public.core_mission_events (mission_id, sequence);
create index if not exists idx_core_mission_events_agent
  on public.core_mission_events (agent, created_at desc);
create index if not exists idx_core_mission_events_time
  on public.core_mission_events (created_at desc);

alter table public.core_tasks
  add column if not exists mission_id uuid references public.core_missions(id) on delete set null;
create index if not exists idx_core_tasks_mission
  on public.core_tasks (mission_id, created_at desc)
  where mission_id is not null;
create index if not exists idx_core_tasks_assignee_status
  on public.core_tasks (assignee, status, updated_at desc);

-- Een missie-taak die van status verandert maakt zijn missie meteen weer
-- runnable. Zo hoeft de missielus niet te pollen om een afgeronde stap te zien:
-- de volgende stap start bij de eerstvolgende ronde, niet pas na een interval.
create or replace function public.core_tasks_wek_missie()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mission_id is not null and new.status is distinct from old.status then
    update public.core_missions
       set next_run_at = least(next_run_at, now()),
           updated_at = now()
     where id = new.mission_id
       and status in ('active', 'waiting_agent', 'waiting_approval', 'monitoring');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_core_tasks_wek_missie on public.core_tasks;
create trigger trg_core_tasks_wek_missie
  after update of status on public.core_tasks
  for each row execute function public.core_tasks_wek_missie();

-- Lease één runnable missie. SKIP LOCKED: twee missielussen pakken nooit
-- dezelfde missie, dus nooit twee keer dezelfde volgende stap.
create or replace function public.claim_next_core_mission(
  p_owner text,
  p_lease_seconds integer default 60
) returns setof public.core_missions
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id
  from public.core_missions
  where status in ('active', 'monitoring', 'waiting_agent', 'waiting_approval')
    and next_run_at <= now()
    and (lease_token is null or lease_expires_at < now())
  order by
    case priority when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
    next_run_at
  for update skip locked
  limit 1;
  if v_id is null then return; end if;
  return query
  update public.core_missions
     set lease_owner = p_owner,
         lease_token = gen_random_uuid(),
         lease_expires_at = now() + make_interval(secs => greatest(10, least(p_lease_seconds, 600))),
         revision = revision + 1,
         updated_at = now()
   where id = v_id
  returning *;
end;
$$;

-- ── 1b. claim_next_core_task: geen dubbele uitvoering meer ──────────────────
-- Gevonden met de integratietest (D) op 7 okt: de oude versie claimde een taak
-- in 'verifying' of 'planning' ook als die nog een levende lease had. Met
-- meerdere slots pakte een tweede worker zo een taak die de eerste net aan het
-- afronden was (attempt 2, "lease lost" bij de eerste) -- dezelfde stap twee
-- keer. Nu geldt voor élke actieve status hetzelfde: alleen claimbaar als de
-- lease verlopen is.
--
-- Tweede gat: een taak waarvan de worker stierf op zijn laatste poging bleef
-- eeuwig 'running' (attempt < max_attempts faalde, niemand pakte hem). Die
-- wordt nu 'failed' met de reden erbij, zodat de missie hem ziet en zelf
-- opnieuw probeert of blokkeert -- in plaats van voor altijd te wachten.
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
  with dood as (
    update public.core_tasks
       set status = 'failed',
           error = jsonb_build_object('code', 'worker_lost',
                     'message', 'Worker stopped (lease expired) on the last allowed attempt.'),
           worker_id = null, lease_token = null, lease_expires_at = null,
           revision = revision + 1, updated_at = now()
     where status in ('running', 'in_progress', 'planning', 'verifying')
       and lease_expires_at < now()
       and attempt >= max_attempts
    returning id
  )
  insert into public.core_task_events (task_id, event_type, actor_type, actor_id, message)
  select id, 'task.failed', 'system', p_worker_id, 'Worker lost on last attempt' from dood;

  select id into v_task_id
  from public.core_tasks
  where (
      status in ('queued', 'retrying')
      or (
        status in ('running', 'in_progress', 'planning', 'verifying')
        and (lease_expires_at is null or lease_expires_at < now())
      )
    )
    and next_attempt_at <= now()
    and attempt < max_attempts
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
revoke all on function public.claim_next_core_task(text, integer) from public, anon, authenticated;
grant execute on function public.claim_next_core_task(text, integer) to service_role;

-- ── 2. DAX: Dedicated Agent eXecutor ─────────────────────────────────────────
create table if not exists public.core_dax_computers (
  id text primary key,                       -- dax-developer-01
  owner_agent text not null,                 -- manager die de computer bezit
  members text[] not null default '{}'::text[], -- crew die erdoor werkt
  runtime text not null default 'docker',    -- docker | local | ssh
  host text not null default 'strato',       -- logische host; adres staat in env
  container_name text,
  image text not null default 'axe-dax-base:latest',
  status text not null default 'provisioned',
  computer_mode text not null default 'persistent',
  cpu_limit numeric not null default 2,
  memory_limit_mb integer not null default 3072,
  heavy_slots integer not null default 1,
  volumes jsonb not null default '{}'::jsonb,
  stats jsonb not null default '{}'::jsonb,
  last_heartbeat_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint core_dax_status_check check (status in (
    'provisioned', 'starting', 'running', 'sleeping', 'stopped', 'error', 'unknown'
  )),
  constraint core_dax_runtime_check check (runtime in ('docker', 'local', 'ssh')),
  constraint core_dax_mode_check check (computer_mode in ('persistent', 'ephemeral'))
);

create table if not exists public.core_dax_slots (
  task_id uuid primary key references public.core_tasks(id) on delete cascade,
  computer_id text references public.core_dax_computers(id) on delete cascade,
  weight text not null default 'heavy',
  worker_id text,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists idx_core_dax_slots_computer on public.core_dax_slots (computer_id);

-- Eén zware DAX-taak meer, alleen als er plek is. Globaal maximum (2-4 op een
-- 16 GB STRATO) én per computer (heavy_slots). Advisory lock serialiseert de
-- telling, zodat twee workers niet allebei "er is nog plek" zien.
-- Verlopen slots (worker gecrasht) tellen niet mee: zo blokkeert een dode
-- worker de capaciteit hooguit één lease lang.
create or replace function public.acquire_dax_slot(
  p_task_id uuid,
  p_computer_id text,
  p_worker_id text,
  p_global_max integer default 3,
  p_lease_seconds integer default 900,
  p_weight text default 'heavy'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_global integer;
  v_local integer;
  v_local_max integer;
begin
  perform pg_advisory_xact_lock(hashtext('axe_dax_slots'));
  delete from public.core_dax_slots where expires_at < now();

  -- Herclaim van dezelfde taak (heartbeat/herstart): verleng, tel niet dubbel.
  update public.core_dax_slots
     set expires_at = now() + make_interval(secs => greatest(30, p_lease_seconds)),
         worker_id = p_worker_id
   where task_id = p_task_id;
  if found then return true; end if;

  select count(*) into v_global from public.core_dax_slots where weight = 'heavy';
  if p_weight = 'heavy' and v_global >= greatest(1, p_global_max) then
    return false;
  end if;
  if p_computer_id is not null then
    select coalesce(heavy_slots, 1) into v_local_max
      from public.core_dax_computers where id = p_computer_id;
    select count(*) into v_local from public.core_dax_slots
     where computer_id = p_computer_id and weight = 'heavy';
    if p_weight = 'heavy' and v_local >= coalesce(v_local_max, 1) then
      return false;
    end if;
  end if;
  insert into public.core_dax_slots (task_id, computer_id, weight, worker_id, expires_at)
  values (p_task_id, p_computer_id, p_weight, p_worker_id,
          now() + make_interval(secs => greatest(30, p_lease_seconds)));
  return true;
end;
$$;

create or replace function public.release_dax_slot(p_task_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.core_dax_slots where task_id = p_task_id;
$$;

-- Een geclaimde taak die geen capaciteit kreeg gaat terug in de rij, zonder
-- dat het een poging kost. Alleen de worker die de lease heeft mag dit.
create or replace function public.defer_core_task(
  p_task_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_delay_seconds integer default 20,
  p_reason text default 'capacity'
) returns public.core_tasks
language plpgsql
security definer
set search_path = public
as $$
declare v_task public.core_tasks;
begin
  update public.core_tasks
     set status = 'queued',
         worker_id = null,
         lease_token = null,
         lease_expires_at = null,
         attempt = greatest(0, attempt - 1),
         next_attempt_at = now() + make_interval(secs => greatest(1, p_delay_seconds)),
         revision = revision + 1,
         updated_at = now()
   where id = p_task_id
     and worker_id = p_worker_id
     and lease_token = p_lease_token
     and status in ('running', 'in_progress', 'planning')
  returning * into v_task;
  if v_task.id is null then
    raise exception 'lease_lost' using errcode = 'P0001';
  end if;
  insert into public.core_task_events (task_id, event_type, actor_type, actor_id, message, data)
  values (p_task_id, 'task.deferred', 'worker', p_worker_id,
          'Waiting for DAX capacity', jsonb_build_object('reason', p_reason, 'delay_seconds', p_delay_seconds));
  return v_task;
end;
$$;

-- De vijf startcomputers. Managers bezitten een DAX; hun crew werkt erdoor.
insert into public.core_dax_computers (id, owner_agent, members, container_name, cpu_limit, memory_limit_mb, heavy_slots, volumes)
values
  ('dax-developer-01', 'developer', array['developer', 'forge', 'wags'], 'dax-developer-01', 3, 4096, 2,
   '{"workspace": "dax-developer-01-workspace", "browser": "dax-developer-01-browser", "artifacts": "dax-developer-01-artifacts", "home": "dax-developer-01-home"}'),
  ('dax-browser-01', 'browser', array['browser'], 'dax-browser-01', 2, 3072, 1,
   '{"workspace": "dax-browser-01-workspace", "browser": "dax-browser-01-browser", "artifacts": "dax-browser-01-artifacts", "home": "dax-browser-01-home"}'),
  ('dax-northsea-01', 'northsea', array['northsea'], 'dax-northsea-01', 1.5, 2048, 1,
   '{"workspace": "dax-northsea-01-workspace", "browser": "dax-northsea-01-browser", "artifacts": "dax-northsea-01-artifacts", "home": "dax-northsea-01-home"}'),
  ('dax-trading-01', 'trading', array['trading', 'dollar_bill', 'intel'], 'dax-trading-01', 1.5, 2048, 1,
   '{"workspace": "dax-trading-01-workspace", "browser": "dax-trading-01-browser", "artifacts": "dax-trading-01-artifacts", "home": "dax-trading-01-home"}'),
  ('dax-thinktank-01', 'thinktank', array['thinktank', 'nova', 'atlas'], 'dax-thinktank-01', 1.5, 2048, 1,
   '{"workspace": "dax-thinktank-01-workspace", "browser": "dax-thinktank-01-browser", "artifacts": "dax-thinktank-01-artifacts", "home": "dax-thinktank-01-home"}')
on conflict (id) do nothing;

-- ── 3. Eén tijdlijn per agent ───────────────────────────────────────────────
-- Alleen wat echt gebeurde: task-events van taken die aan de agent hangen, en
-- missie-events met die agent. Niets wordt hier verzonnen of afgeleid.
create or replace view public.core_agent_events as
  select
    'task'::text as source,
    e.sequence,
    coalesce(t.assignee, 'axe') as agent,
    t.mission_id,
    e.task_id,
    e.event_type,
    e.message,
    e.data,
    e.created_at
  from public.core_task_events e
  join public.core_tasks t on t.id = e.task_id
  union all
  select
    'mission'::text as source,
    m.sequence,
    coalesce(m.agent, mi.owner_agent) as agent,
    m.mission_id,
    m.task_id,
    m.event_type,
    m.message,
    m.data,
    m.created_at
  from public.core_mission_events m
  join public.core_missions mi on mi.id = m.mission_id;

-- ── 4. Afscherming: service_role only ───────────────────────────────────────
alter table public.core_missions enable row level security;
alter table public.core_mission_events enable row level security;
alter table public.core_dax_computers enable row level security;
alter table public.core_dax_slots enable row level security;

do $$
declare r text;
begin
  foreach r in array array['core_missions', 'core_mission_events', 'core_dax_computers', 'core_dax_slots']
  loop
    execute format('revoke all on public.%I from anon, authenticated', r);
    execute format('drop policy if exists service_role_only on public.%I', r);
    execute format('create policy service_role_only on public.%I for all to service_role using (true) with check (true)', r);
  end loop;
end $$;

revoke all on public.core_agent_events from anon, authenticated;
grant select on public.core_agent_events to service_role;

revoke all on function public.claim_next_core_mission(text, integer) from public, anon, authenticated;
revoke all on function public.acquire_dax_slot(uuid, text, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.release_dax_slot(uuid) from public, anon, authenticated;
revoke all on function public.defer_core_task(uuid, text, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.claim_next_core_mission(text, integer) to service_role;
grant execute on function public.acquire_dax_slot(uuid, text, text, integer, integer, text) to service_role;
grant execute on function public.release_dax_slot(uuid) to service_role;
grant execute on function public.defer_core_task(uuid, text, uuid, integer, text) to service_role;

comment on table public.core_missions is
  'Duurzame missies boven core_tasks. De missielus (mission_engine.py) kiest na elke stap zelf de volgende, tot complete/blocked/human_decision_required/paused.';
comment on table public.core_dax_computers is
  'DAX-register: waar een agent uitvoert. Wie de agent is staat in agent_workspace.py, niet hier.';
