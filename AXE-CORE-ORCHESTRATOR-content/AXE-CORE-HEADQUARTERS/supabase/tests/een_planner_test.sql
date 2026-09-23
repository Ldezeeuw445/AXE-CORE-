-- Test planner + grootboek; eindigt ALTIJD met een fout zodat alles terugrolt.
do $t$
declare n int := 0; s1 uuid; aantal int; x record;
begin
  insert into core_schedules (name, cron_expr, action_type, enabled, next_run_at, app, executor, job_key)
    values ('TEST vps job', '* * * * *', 'prompt', true, now() - interval '1 minute', 'northsea', 'vps', 'test:vps') returning id into s1;
  insert into core_schedules (name, cron_expr, action_type, enabled, next_run_at, app, executor, job_key)
    values ('TEST mac job', '* * * * *', 'prompt', true, now() - interval '1 minute', 'axe_core', 'mac', 'test:mac');
  insert into core_schedules (name, cron_expr, action_type, enabled, next_run_at, app, executor, job_key)
    values ('TEST observed', '0 */3 * * *', 'observed', true, now() - interval '1 minute', 'axe_core', 'mac', 'test:obs');
  select count(*) into aantal from core_claim_due_schedules('vps', 'worker-a', 600, 20) where job_key like 'test:%';
  if aantal <> 1 then raise exception 'NS_TEST_FAILED: vps claim % (only the vps job, not mac/observed)', aantal; end if; n := n + 1;
  select count(*) into aantal from core_claim_due_schedules('vps', 'worker-b', 600, 20) where job_key like 'test:%';
  if aantal <> 0 then raise exception 'NS_TEST_FAILED: double claim while leased'; end if; n := n + 1;
  select count(*) into aantal from core_claim_due_schedules('mac', 'mac-1', 600, 20) where job_key like 'test:%';
  if aantal <> 1 then raise exception 'NS_TEST_FAILED: mac claim %', aantal; end if; n := n + 1;
  update core_schedules set lease_until = now() - interval '1 second' where id = s1;
  select count(*) into aantal from core_claim_due_schedules('vps', 'worker-b', 600, 20) where job_key like 'test:%';
  if aantal <> 1 then raise exception 'NS_TEST_FAILED: expired lease not reclaimable'; end if; n := n + 1;
  begin
    insert into core_schedules (name, cron_expr, app) values ('bad', '* * * * *', 'unknown_app');
    raise exception 'NS_TEST_FAILED: bad app accepted';
  exception when check_violation then null; end; n := n + 1;
  insert into core_job_runs (job_key, job_name, app, source, schedule_id, executor, trigger, scheduled_for, status)
    values ('test:vps', 'TEST vps job', 'northsea', 'schedule', s1, 'vps', 'cron', '2026-09-16T20:00:00Z', 'running');
  begin
    insert into core_job_runs (job_key, job_name, app, source, schedule_id, executor, trigger, scheduled_for, status)
      values ('test:vps', 'TEST vps job', 'northsea', 'schedule', s1, 'vps', 'cron', '2026-09-16T20:00:00Z', 'running');
    raise exception 'NS_TEST_FAILED: duplicate run for same slot';
  exception when unique_violation then null; end; n := n + 1;
  select count(*) into aantal from core_ledger(now() - interval '1 hour', 'northsea', 'schedule', 50) where name = 'TEST vps job';
  if aantal <> 1 then raise exception 'NS_TEST_FAILED: ledger misses run'; end if; n := n + 1;
  select count(*) into aantal from core_ledger(now() - interval '1 day', null, 'pg_cron', 2000);
  if aantal = 0 then raise exception 'NS_TEST_FAILED: ledger has no pg_cron runs'; end if; n := n + 1;
  select count(*) into aantal from core_ledger(now() - interval '30 days', null, 'task', 2000);
  if aantal = 0 then raise exception 'NS_TEST_FAILED: ledger has no tasks'; end if; n := n + 1;
  select count(*) into aantal from core_pg_cron_jobs() where app = 'axe_companion';
  if aantal < 5 then raise exception 'NS_TEST_FAILED: pg_cron companion mapping %', aantal; end if; n := n + 1;
  if core_app_for_job('axe-memory-decay-weekly') <> 'axon_memory' then raise exception 'NS_TEST_FAILED: memory mapping'; end if; n := n + 1;
  raise exception 'NS_TESTS_PASSED: %', n;
end $t$;
