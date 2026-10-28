-- Bouwlus: gearchiveerde retries tellen niet als beurt (28 okt 2026).
--
-- Retry van een planner-bouwtaak werd queued. claim_next_core_task pakt elke
-- queued-rij; de VPS heeft geen planner-handler → "No handler for planner" in
-- 1–20 s. De archiver zette die retries op cancelled. core_bouw_aanvullen keek
-- naar max(created_at) van ÁLLE oorsprong_bouw-rijen, dus de retry stal de beurt
-- van Trading OS en de lus zette Companion/AXON klaar. Geen nieuwe taken
-- verzinnen: alleen de meetlat van "wie was het langst niet aan de beurt".
--
-- Terugdraaien: de vorige functie in 20261010110000_developer_bouwt_door.sql.

create or replace function core_bouw_aanvullen() returns integer
language plpgsql security definer set search_path = public as $$
declare
  a record;
  n integer := 0;
  vorige text;
begin
  if exists (
    select 1 from core_tasks
    where capability = 'planner' and status in ('pending', 'running') and metadata->>'oorsprong_bouw' = 'ja'
  ) then
    return 0;
  end if;
  for a in
    select b.* from core_bouw_apps b
    where b.aan
    order by (select max(t.created_at) from core_tasks t
              where t.capability = 'planner' and t.payload->>'repo' = b.repo
                and t.metadata->>'oorsprong_bouw' = 'ja'
                and t.status in ('pending', 'running', 'completed', 'failed')
                and coalesce(t.metadata->>'archived', '') <> 'true') asc nulls first, b.repo
    limit 1
  loop
    -- Wat de vorige run deed, zodat hij verdergaat in plaats van opnieuw begint.
    select left(coalesce(result->>'output', error->>'message', ''), 1500) into vorige
      from core_tasks
      where capability = 'planner' and payload->>'repo' = a.repo and metadata->>'oorsprong_bouw' = 'ja'
        and status in ('completed', 'failed')
        and coalesce(metadata->>'archived', '') <> 'true'
      order by updated_at desc limit 1;
    insert into core_tasks (title, goal, description, status, priority, assignee, capability,
                            execution_mode, source_app, requested_by, payload, metadata)
    values (
      'Build next step: ' || a.naam,
      coalesce(a.opdracht, '') ||
      'You are the developer of ' || a.naam || ' (repo ' || a.repo || '). Keep building it towards a finished, '
      || 'working product. 1) Look at git status and git diff first: if there is unfinished work from a previous '
      || 'run, finish that before starting anything new. 2) Otherwise read the README, docs, TODO/ROADMAP files, '
      || 'open TODO comments and the recent commits, and pick the single most valuable unfinished item that you can '
      || 'complete and verify in this session. 3) Implement it properly, with tests where the repo has tests, and run '
      || 'the repo''s own checks (tests, typecheck, lint, build) on what you changed. 4) Do not commit or push, do not '
      || 'change branch, do not touch secrets, payments, deploys or production data. 5) End with: what you changed '
      || '(files), how you verified it, and the next most valuable step.'
      || case when vorige is not null and vorige <> '' then chr(10) || chr(10) || 'Previous run reported:' || chr(10) || vorige else '' end,
      'Continuous build loop for ' || a.naam || ' (asked by Luka, 10 Oct 2026).',
      'pending', 'medium', 'code-agent', 'planner', 'patch', 'axe_core', 'luka',
      jsonb_build_object('repo', a.repo),
      jsonb_build_object('planner', true, 'agent', 'code-agent', 'motor', a.motor, 'risico', 'schrijven',
                         'goedkeuring', 'niet_nodig', 'uiStatus', 'todo', 'app', a.app,
                         'oorsprong_bouw', 'ja', 'requested_by', 'luka')
    );
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function core_bouw_aanvullen() from public, anon, authenticated;
