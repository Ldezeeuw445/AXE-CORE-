-- De Developer bouwt door aan Luka's apps (10 okt 2026).
--
-- Luka: "de developer moet door kunnen werken aan de apps die ik echt maak,
-- dus Trading OS, AXE Companion en AXON Memory" -- met zijn abonnementen
-- (Cursor) en niet alleen als hij iets vraagt.
--
-- Hoe: de planner op de Mac mini voert per ronde (elke 3 u) één taak van de
-- Code Agent uit: Cursor in acceptEdits, in de worktree op branch axe-agent
-- (/Volumes/EagetSSD/agent-werk/<repo>), zonder commit of push -- Luka bekijkt
-- de diff. Hij pakt alleen taken die Luka vroeg (requested_by='luka'), de
-- nieuwste eerst. Deze functie zet daarom steeds ÉÉN bouwtaak klaar, voor de app
-- die het langst niet aan de beurt was -- anders wint de app die net klaar was
-- telkens weer. Elk uur via pg_cron: altijd werk klaar, nooit een stapel.
--
-- Uitzetten: select cron.unschedule('axe-developer-bouwt-door');
--        of: update core_bouw_apps set aan = false where repo = '...';

create table if not exists core_bouw_apps (
  repo        text primary key,
  naam        text not null,
  app         text not null,
  motor       text not null default 'cursor',
  aan         boolean not null default true,
  opdracht    text,
  updated_at  timestamptz not null default now()
);

insert into core_bouw_apps (repo, naam, app, motor) values
  ('trading-os',    'Trading OS',    'trading_os',    'cursor'),
  ('axe-companion', 'AXE Companion', 'axe_companion', 'cursor'),
  ('axon-memory',   'AXON Memory',   'axon_memory',   'cursor')
on conflict (repo) do nothing;

alter table core_bouw_apps enable row level security;

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
                and t.metadata->>'oorsprong_bouw' = 'ja') asc nulls first, b.repo
    limit 1
  loop
    -- Wat de vorige run deed, zodat hij verdergaat in plaats van opnieuw begint.
    select left(coalesce(result->>'output', error->>'message', ''), 1500) into vorige
      from core_tasks
      where capability = 'planner' and payload->>'repo' = a.repo and metadata->>'oorsprong_bouw' = 'ja'
        and status in ('completed', 'failed')
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
      || case when vorige is not null and vorige <> '' then E'\n\nPrevious run reported:\n' || vorige else '' end,
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

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'axe-developer-bouwt-door';
    perform cron.schedule('axe-developer-bouwt-door', '17 * * * *', 'select core_bouw_aanvullen()');
  end if;
end $$;
