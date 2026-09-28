-- Eén planner en één grootboek (AXE Companion, pqnngpcgbdwxavbatbia), 16 sep 2026.
--
-- De planner bestond al: core_schedules + /cron/tick (VPS-crontab, elke minuut). Wat
-- ontbrak:
--   1. per schema de APP (kleur) en WAAR het draait (vps / mac / supabase);
--   2. een lease, zodat een job die langer dan een minuut duurt niet twee keer start;
--   3. een GROOTBOEK: elke run met status, duur en fout, in plaats van alleen
--      last_result dat bij de volgende run overschreven wordt;
--   4. zichtbaarheid van wat er al draaide zonder dat AXE CORE het liet zien: de
--      pg_cron-jobs van Companion en AXON Memory, en de taken in core_tasks.
-- Geen tweede planner en geen kopie van data: pg_cron en core_tasks worden gelezen
-- waar ze staan.

-- ── 1. core_schedules: app, uitvoerder, lease ───────────────────────────────
alter table public.core_schedules
  add column if not exists app text not null default 'axe_core',
  add column if not exists executor text not null default 'vps',
  add column if not exists job_key text,
  add column if not exists description text,
  add column if not exists lease_owner text,
  add column if not exists lease_until timestamptz,
  add column if not exists consecutive_failures int not null default 0,
  add column if not exists max_runtime_s int not null default 300;
do $$ begin
  alter table public.core_schedules add constraint core_schedules_app_check
    check (app in ('axe_core', 'axe_companion', 'trading_os', 'axon_memory', 'northsea'));
  alter table public.core_schedules add constraint core_schedules_executor_check
    check (executor in ('vps', 'mac', 'supabase'));
  alter table public.core_schedules add constraint core_schedules_runtime_check
    check (max_runtime_s between 5 and 3600);
exception when duplicate_object then null; end $$;
-- Nieuwe soorten: 'observed' (draait elders, meldt zijn runs: launchd, planner-lus),
-- 'planner' (een plannerronde op de Mac), 'northsea' (een NorthSea-desktaak).
alter table public.core_schedules drop constraint if exists core_schedules_action_type_check;
alter table public.core_schedules add constraint core_schedules_action_type_check
  check (action_type in ('prompt', 'exec', 'webhook', 'crew', 'observed', 'planner', 'northsea'));
create unique index if not exists core_schedules_job_key_uidx on public.core_schedules (job_key) where job_key is not null;

-- ── 2. Het grootboek van runs ────────────────────────────────────────────────
create table if not exists public.core_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  job_name text not null,
  app text not null check (app in ('axe_core', 'axe_companion', 'trading_os', 'axon_memory', 'northsea')),
  source text not null check (source in ('schedule', 'planner', 'launchd', 'northsea', 'manual')),
  schedule_id uuid references public.core_schedules(id) on delete set null,
  executor text not null check (executor in ('vps', 'mac', 'supabase')),
  trigger text not null check (trigger in ('cron', 'manual', 'observed', 'retry')),
  scheduled_for timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'ok', 'fail', 'timeout', 'skipped')),
  output text,
  error text,
  duration_ms int,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- Idempotent: dezelfde job voor hetzelfde geplande moment bestaat maar één keer.
create unique index if not exists core_job_runs_once_uidx on public.core_job_runs (job_key, scheduled_for) where scheduled_for is not null;
create index if not exists core_job_runs_started_idx on public.core_job_runs (started_at desc);
create index if not exists core_job_runs_app_idx on public.core_job_runs (app, started_at desc);
alter table public.core_job_runs enable row level security;
revoke all on public.core_job_runs from anon, authenticated;
grant select on public.core_job_runs to authenticated;
drop policy if exists luka_read_core_job_runs on public.core_job_runs;
create policy luka_read_core_job_runs on public.core_job_runs for select to authenticated
  using ((select auth.uid()) = 'acff7a12-1111-481d-a7a9-cc07583b8069'::uuid);

-- ── 3. Claimen met een lease (atomair, meerdere workers veilig) ─────────────
create or replace function public.core_claim_due_schedules(p_executor text, p_owner text, p_lease_s int default 600, p_limit int default 20)
returns setof public.core_schedules language sql security definer set search_path = public as $$
  update public.core_schedules s
     set lease_owner = p_owner, lease_until = now() + make_interval(secs => greatest(p_lease_s, 30))
   where s.id in (
     select id from public.core_schedules
      where enabled and executor = p_executor and action_type <> 'observed'
        and next_run_at is not null and next_run_at <= now()
        and (lease_until is null or lease_until < now())
      order by next_run_at
      limit greatest(least(p_limit, 50), 1)
      for update skip locked)
  returning s.*;
$$;

-- ── 4. pg_cron en taken leesbaar voor het grootboek ─────────────────────────
create or replace function public.core_app_for_job(p_name text)
returns text language sql immutable as $$
  select case
    when p_name like 'axe-companion-%' then 'axe_companion'
    when p_name like 'axe-memory-%' or p_name like 'axon-%' then 'axon_memory'
    when p_name like 'trading-os-%' then 'trading_os'
    when p_name like 'northsea-%' then 'northsea'
    else 'axe_core' end;
$$;

create or replace function public.core_pg_cron_jobs()
returns table (jobid bigint, jobname text, schedule text, active boolean, app text)
language sql stable security definer set search_path = public, cron as $$
  select j.jobid, j.jobname, j.schedule, j.active, public.core_app_for_job(j.jobname) from cron.job j order by j.jobname;
$$;

create or replace function public.core_ledger(p_since timestamptz default now() - interval '7 days', p_app text default null,
                                              p_source text default null, p_limit int default 500)
returns table (at timestamptz, app text, source text, kind text, name text, status text, duration_ms int, detail text, ref_id text)
language sql stable security definer set search_path = public, cron as $$
  select * from (
    select r.started_at, r.app, r.source, 'run'::text, r.job_name, r.status, r.duration_ms,
           left(coalesce(r.error, r.output, ''), 500), r.id::text
      from public.core_job_runs r where r.started_at >= p_since
    union all
    select d.start_time, public.core_app_for_job(j.jobname), 'pg_cron', 'run', j.jobname,
           case d.status when 'succeeded' then 'ok' when 'failed' then 'fail' when 'running' then 'running' else d.status end,
           case when d.end_time is not null then (extract(epoch from (d.end_time - d.start_time)) * 1000)::int end,
           left(coalesce(d.return_message, ''), 500), 'pg_cron:' || d.runid
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid where d.start_time >= p_since
    union all
    select coalesce(t.completed_at, t.cancelled_at, t.started_at, t.updated_at, t.created_at),
           case when t.metadata ->> 'app' in ('axe_core', 'axe_companion', 'trading_os', 'axon_memory', 'northsea') then t.metadata ->> 'app' else 'axe_core' end,
           'task', coalesce(nullif(t.capability, ''), 'task'), t.title,
           t.status,
           case when t.completed_at is not null and t.started_at is not null then (extract(epoch from (t.completed_at - t.started_at)) * 1000)::int end,
           left(coalesce(t.error::text, ''), 500), 'task:' || t.id
      from public.core_tasks t where coalesce(t.completed_at, t.cancelled_at, t.started_at, t.updated_at, t.created_at) >= p_since
  ) x(at, app, source, kind, name, status, duration_ms, detail, ref_id)
  where (p_app is null or x.app = p_app) and (p_source is null or x.source = p_source)
  order by x.at desc
  limit greatest(least(p_limit, 2000), 1);
$$;

revoke all on function public.core_claim_due_schedules(text, text, int, int) from public, anon, authenticated;
revoke all on function public.core_pg_cron_jobs() from public, anon, authenticated;
revoke all on function public.core_ledger(timestamptz, text, text, int) from public, anon, authenticated;
grant execute on function public.core_claim_due_schedules(text, text, int, int) to service_role;
grant execute on function public.core_pg_cron_jobs() to service_role;
grant execute on function public.core_ledger(timestamptz, text, text, int) to service_role;
