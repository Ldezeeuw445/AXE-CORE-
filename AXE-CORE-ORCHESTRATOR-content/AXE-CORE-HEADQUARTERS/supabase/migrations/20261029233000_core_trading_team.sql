-- AXE Trading Team (TEST): pipeline run log shared with Companion + Trading OS.
-- Scout -> News/Sentiment/Charts -> Risk -> Decision. Demo-only allowlist at app layer.
-- DO NOT apply to prod until Luka explicitly enables the test module.

create table if not exists public.core_trading_team_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Cycle metadata
  cycle_id text not null,
  status text not null default 'running',
  -- running | completed | blocked | error
  mode text not null default 'test',
  -- test | live (live must never be written by the TEST module)

  -- Account guard snapshot (fail-closed allowlist; never guess secrets)
  account_id text,
  account_label text,
  companion_broker_account_id uuid,
  account_guard text not null default 'pending',
  -- pending | allowed | rejected
  account_guard_reason text,

  -- Pipeline stages (jsonb payloads from each bot)
  scout jsonb not null default '{}'::jsonb,
  news jsonb not null default '{}'::jsonb,
  sentiment jsonb not null default '{}'::jsonb,
  charts jsonb not null default '{}'::jsonb,
  risk jsonb not null default '{}'::jsonb,
  decision jsonb not null default '{}'::jsonb,

  -- Decision summary for list UIs
  verdict text,
  -- GO | WAIT | NO-GO | BLOCKED
  confidence real,
  symbol text,
  side text,
  proposal jsonb not null default '{}'::jsonb,

  -- Execution (demo only; null when propose-only)
  execution jsonb not null default '{}'::jsonb,
  error text
);

create index if not exists core_trading_team_runs_created_at_idx
  on public.core_trading_team_runs (created_at desc);
create index if not exists core_trading_team_runs_cycle_id_idx
  on public.core_trading_team_runs (cycle_id);
create index if not exists core_trading_team_runs_verdict_idx
  on public.core_trading_team_runs (verdict);
create index if not exists core_trading_team_runs_account_idx
  on public.core_trading_team_runs (account_id);

alter table public.core_trading_team_runs enable row level security;

-- Same single-user open policy pattern as core_trading_trades.
drop policy if exists svc_core_trading_team_runs on public.core_trading_team_runs;
create policy svc_core_trading_team_runs on public.core_trading_team_runs
  for all using (true) with check (true);

comment on table public.core_trading_team_runs is
  'AXE Trading Team TEST pipeline log (Scout→News/Sentiment/Charts→Risk→Decision). App-layer allowlist must keep this on the 500k MT5 demo only.';

-- Optional cron row (disabled). Enable after migration + env allowlist are set.
insert into public.core_schedules
  (name, cron_expr, timezone, action_type, action_payload, enabled, next_run_at, metadata,
   app, executor, job_key, description, max_runtime_s)
select
  'Trading Team TEST (15m)',
  '*/15 * * * *',
  'Europe/Amsterdam',
  'webhook',
  jsonb_build_object(
    'module', 'trading_team_test',
    'path', '/trading-team/run',
    'note', 'Enable only after AXE_TRADING_TEAM_ALLOWED_METAAPI_ACCOUNT_IDS is set to the 500k MT5 demo'
  ),
  false,
  now() + interval '1 day',
  jsonb_build_object('module', 'trading_team_test', 'mode', 'test'),
  'axe_core',
  'vps',
  'axe_core:trading-team-test-15m',
  'AXE Trading Team TEST pipeline (Scout→News/Sentiment/Charts→Risk→Decision). Disabled until allowlist env is set.',
  180
where not exists (
  select 1 from public.core_schedules where job_key = 'axe_core:trading-team-test-15m'
);
