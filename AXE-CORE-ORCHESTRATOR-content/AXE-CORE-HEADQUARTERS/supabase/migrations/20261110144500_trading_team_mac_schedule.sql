-- Trading Team TEST: Mac-side 15-minute exec job (demo 500k only).
-- The VPS webhook job axe_core:trading-team-test-15m stays disabled — it has
-- no url and axe_api has no /trading-team/run handler.
-- This insert is idempotent. It does not alter an already-existing row, so a
-- machine whose checkout is not the canonical Mac path must update
-- action_payload.command after apply (see docs/TRADING_TEAM_TEST.md).

insert into public.core_schedules
  (name, cron_expr, timezone, action_type, action_payload, enabled, next_run_at, metadata,
   app, executor, job_key, description, max_runtime_s)
select
  'Trading Team TEST (15m, Mac, 500k demo)',
  '*/15 * * * *',
  'Europe/Amsterdam',
  'exec',
  jsonb_build_object(
    'command', '/Users/luka/AXE-CORE-/AXE-CORE-ORCHESTRATOR-content/AXE-CORE-HEADQUARTERS/scripts/trading-team-cycle.sh',
    'timeout', 240
  ),
  true,
  now() + interval '15 minutes',
  jsonb_build_object(
    'module', 'trading_team_test',
    'mode', 'test',
    'account', 'MT5 DEMO 500K',
    'metaapi_account_id', '650f4f7a-f4b5-4869-8f94-8adbb961be2b',
    'broker_account_id', '0364372e-eb51-4902-9697-08d55b62f295'
  ),
  'axe_core',
  'mac',
  'axe_core:trading-team-test-15m-mac',
  'Headless Trading Team cycle on MT5 DEMO 500K only. Runner enforces allowlist + live MetaAPI tradeMode=DEMO. The VPS webhook job stays disabled.',
  300
where not exists (
  select 1 from public.core_schedules where job_key = 'axe_core:trading-team-test-15m-mac'
);
