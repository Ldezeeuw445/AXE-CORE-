-- AXE beslist zelf: in-plan pending rijen afronden, NorthSea-dealvragen
-- ontdubbelen, status superseded, unieke open vraag per deal.
-- Additief. Geen nieuwe tabellen; geen deal-ja, geen send.

alter table public.core_approvals drop constraint if exists core_approvals_status_check;
alter table public.core_approvals
  add constraint core_approvals_status_check
  check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled', 'superseded'));

alter table public.core_coding_seats
  add column if not exists config_exists boolean not null default true;

-- In-plan shell: eigen /dax/artifacts en alleen-lezen inspectie.
update public.core_approvals
set
  status = 'approved',
  decided_by = 'axe',
  decided_at = now(),
  decision_reason = case
    when coalesce(metadata->>'command', title, detail, '') ~* '/dax/artifacts'
      then 'in-plan: write under the agent''s own /dax/artifacts'
    when coalesce(metadata->>'command', '') ~* 'apt list'
      or coalesce(metadata->>'command', '') ~* '^\s*(uname|whoami|dpkg -l|apt-cache)'
      then 'in-plan: read-only inspection'
    when coalesce(title, '') ~* 'market data check|orchestrator health|idea scan'
      or coalesce(detail, '') ~* 'market data check|orchestrator health|idea scan'
      then 'in-plan: routine work (market data / health check / idea scan)'
    else 'in-plan: AXE decides and proceeds'
  end
where status = 'pending'
  and kind = 'shell_command'
  and (
    coalesce(metadata->>'command', title, detail, '') ~* '/dax/artifacts'
    or coalesce(metadata->>'command', '') ~* '^\s*apt list'
    or coalesce(metadata->>'command', '') ~* '^\s*(uname|whoami|id |dpkg -l|apt-cache|df |free )'
    or coalesce(title, '') ~* 'market data check|orchestrator health|idea scan'
    or coalesce(detail, '') ~* 'market data check|orchestrator health|idea scan'
  );

update public.core_tasks t
set
  status = 'queued',
  next_attempt_at = now(),
  metadata = case
    when coalesce(metadata->>'goedkeuring', '') = 'nodig'
      then jsonb_set(jsonb_set(coalesce(metadata, '{}'::jsonb), '{goedkeuring}', '"ja"'), '{uiStatus}', '"todo"')
    else coalesce(metadata, '{}'::jsonb)
  end
where status = 'waiting_approval'
  and exists (
    select 1 from public.core_approvals a
    where a.task_id = t.id
      and a.status = 'approved'
      and a.decided_by = 'axe'
      and a.decision_reason like 'in-plan:%'
  );

-- Één open northsea_notice per deal: de oudste blijft, de rest superseded.
with ranked as (
  select
    id,
    task_id,
    row_number() over (
      partition by
        coalesce(
          nullif(metadata->>'deal_id', ''),
          upper(substring(coalesce(metadata->>'deal_code', title, '') from 'DEAL-[0-9]+')),
          lower(title)
        )
      order by created_at asc, id asc
    ) as nr
  from public.core_approvals
  where status = 'pending' and kind = 'northsea_notice'
)
update public.core_approvals a
set
  status = 'superseded',
  decided_by = 'axe',
  decided_at = now(),
  decision_reason = 'duplicate deal ask; one open ask per deal'
from ranked r
where a.id = r.id and r.nr > 1;

update public.core_tasks t
set
  status = 'cancelled',
  cancelled_at = now(),
  metadata = jsonb_set(
    jsonb_set(coalesce(metadata, '{}'::jsonb), '{goedkeuring}', '"afgewezen"'),
    '{uiStatus}', '"blocked"'
  )
where status = 'waiting_approval'
  and exists (
    select 1 from public.core_approvals a
    where a.task_id = t.id and a.status = 'superseded'
  );

create unique index if not exists uq_core_approvals_pending_northsea_deal
  on public.core_approvals (
    coalesce(
      nullif(metadata->>'deal_id', ''),
      upper(substring(coalesce(metadata->>'deal_code', title, '') from 'DEAL-[0-9]+')),
      lower(title)
    )
  )
  where status = 'pending'
    and kind = 'northsea_notice';
