-- TOEGEPAST OP DE LIVE DATABASE 01-09-2026, met één correctie t.o.v. dit
-- bestand: core_trust_levels bevat live ook smart_home, local_write en
-- local_run. Zonder die drie in de CHECK zou de ALTER bestaande rijen
-- weigeren. De toegepaste versie staat in de Supabase-migratiegeschiedenis
-- als computer_use_worker_events_trust.

-- Computer use — additive to the durable task kernel.
--
-- Two new tables and one widened constraint. Nothing existing is rewritten,
-- so this is safe to run against the live schema: core_tasks already carries
-- capability, payload, leases, attempts and result, which is the whole
-- protocol. All this adds is (a) somewhere for the Mac to say "I am here",
-- (b) an append-only trace of what it did, and (c) per-workspace trust.

-- ── 1. worker presence ──────────────────────────────────────────────────
--
-- The app checks this BEFORE queueing a task. Without it the failure mode is
-- the dangerous one: the row sits pending, the relay times out minutes later,
-- and by then a model that has been kept waiting is tempted to answer from
-- memory instead of saying "the Mac was off".
-- Keyed by DEVICE, not by process. The app addresses a task to a machine,
-- and a machine is a stable thing; a worker process is not. Restarting the
-- worker must not orphan the tasks queued for that Mac.
create table if not exists public.core_computer_workers (
  device_id     text primary key,
  worker_id     text,
  host          text,
  workspaces    jsonb not null default '[]'::jsonb,
  heartbeat_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_core_computer_workers_beat
  on public.core_computer_workers (heartbeat_at desc);

alter table public.core_computer_workers enable row level security;

drop policy if exists svc_core_computer_workers on public.core_computer_workers;
create policy svc_core_computer_workers on public.core_computer_workers
  for all using (true) with check (true);

-- ── 2. append-only tool trace ───────────────────────────────────────────
--
-- "What did AXE actually do to my machine" needs an answer that does not
-- depend on the chat transcript still existing, or on the model's own account
-- of itself. Append-only on purpose: there is no update policy, so a row that
-- has been written cannot later be tidied away.
create table if not exists public.core_task_events (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.core_tasks(id) on delete cascade,
  type        text not null,
  worker_id   text,
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_core_task_events_task
  on public.core_task_events (task_id, created_at);
create index if not exists idx_core_task_events_recent
  on public.core_task_events (created_at desc);

alter table public.core_task_events enable row level security;

drop policy if exists read_core_task_events on public.core_task_events;
create policy read_core_task_events on public.core_task_events
  for select using (true);

drop policy if exists write_core_task_events on public.core_task_events;
create policy write_core_task_events on public.core_task_events
  for insert with check (true);
-- deliberately no update/delete policy — see above.

-- ── 3. per-workspace trust ──────────────────────────────────────────────
--
-- core_trust_levels already stores auto_approve per category. Computer use
-- needs the same thing scoped to a workspace, because "tests may run without
-- asking in AXE-CORE-HEADQUARTERS" should not silently also mean TradingOS.
alter table public.core_trust_levels
  add column if not exists workspace text;

-- The old constraint predates the computer:* categories.
alter table public.core_trust_levels
  drop constraint if exists core_trust_levels_category_check;
alter table public.core_trust_levels
  add constraint core_trust_levels_category_check check (
    category in (
      'exec','git_write','git_pr_merge','db_sql','vercel_promote','agent',
      'smart_home','local_write','local_run',
      'computer:observe','computer:safe_execute','computer:write','computer:consequential'
    )
  );

-- category was unique on its own; with a workspace dimension the pair is the
-- key. coalesce so the existing workspace-less rows keep exactly one slot.
alter table public.core_trust_levels drop constraint if exists core_trust_levels_category_key;
create unique index if not exists uq_core_trust_levels_scope
  on public.core_trust_levels (category, coalesce(workspace, ''));

-- Seeded false, every one of them. The write and consequential rungs are
-- never raised by this or any other automatic path — riskTiers.ts refuses to
-- honour a remembered grant for them even if a row here said otherwise, so
-- these two exist only to make that explicit and auditable.
insert into public.core_trust_levels (category, workspace, auto_approve)
values
  ('computer:observe',       null, true),
  ('computer:safe_execute',  null, false),
  ('computer:write',         null, false),
  ('computer:consequential', null, false)
on conflict do nothing;

-- ── 4. address a task to one machine ────────────────────────────────────
--
-- Without this, a Mac Mini and an iMac both polling the same capability race
-- for every row and the winner is whoever polled last. That is not a
-- scheduling detail: 'AXE Core' is a different checkout on each machine, on a
-- different branch, so the wrong winner returns a confident, wrong answer
-- rather than an error. The worker filters on this column in its poll query,
-- so a task meant for elsewhere is never even claimed.
alter table public.core_tasks
  add column if not exists target_device text;

create index if not exists idx_core_tasks_computer
  on public.core_tasks (capability, target_device, status, created_at)
  where capability = 'computer_use';
